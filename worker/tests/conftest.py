"""The container tier — ADR 0038, `11` §1 and §7.

**A real Postgres 18, for the worker's twenty-three database tests.** ADR 0038
split the two test databases on the line ADR 0019 already drew: PGlite in
process for every constraint, delete rule and trigger in `04`, and a real server
for the three behaviours PGlite cannot have — the job claim under two workers,
the stale-claim sweep, and a `LISTEN` torn down and recovered by the poll. Those
three need a **second session**, and PGlite is single-connection.

⚠️ **ADR 0038 said "three tests and nothing else" and carries a dated amendment
for why that is now twenty-three.** The other twenty are #7's SQL — the chunk
queue, `04` §6.2's resume query, the settle, the drain — which need a database
rather than a second session, and in Python that is the same container.

⚠️ **Without Docker these go red rather than skipping**, and that is ADR 0038's
sentence, not an accident: *"it is the worker's three concurrency tests that go
red — visibly and for a stated reason, rather than the whole suite refusing to
start."* A guard that quietly excuses itself is not a guard. Everything else in
this directory — `test_subject.py`, `test_subject_drift.py`, `test_loop.py` and
`test_db.py` — needs neither Docker nor a database and keeps running.

⚠️ **The schema comes from Drizzle's own migrations**, read off disk and
replayed here. That is the same rule the TypeScript schema tier follows and it
is not the worker issuing DDL (`03` §4.2): Drizzle owns every migration, this
fixture only runs them, and a second copy of the schema in Python is exactly the
drift ADR 0038 was trying to avoid.
"""

from __future__ import annotations

import json
from pathlib import Path

import psycopg
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MIGRATIONS = REPO_ROOT / "server" / "db" / "migrations"

#: ⚠️ **The container half of PIN 6/6** (`03` §13.5), and the half that lives
#: outside every manifest. `@electric-sql/pglite` is pinned at 0.5.8 because
#: 0.5.8 **is** PostgreSQL 18.3 — measured, since PGlite documents no version
#: (ADR 0038, verification §14.1) — and `04` defaults every primary key to
#: `uuidv7()`, a Postgres 18 built-in. **The two test databases have to agree on
#: the major or the two tiers are testing different things.**
#:
#: ⚠️ No bot watches this line: Renovate reads manifests and this is not one. It
#: lives here rather than in `tests/README.md` because a tag in prose cannot be
#: asserted, and :func:`_assert_postgres_18` is the assertion.
POSTGRES_IMAGE = "postgres:18.3-alpine"

#: The tables these tests write. `review_log` is not among them and must not be:
#: it is guarded by a `BEFORE DELETE` trigger (`04` §7.5) that `TRUNCATE` walks
#: straight past, so a cleanup that reached it would be the one statement in the
#: repository able to destroy the irreplaceable data.
SCRATCH_TABLES = ("job", "ingestion_chunk", "ingestion", "source_chunk", "source")

NO_DOCKER = """\
Docker is not available, and this test needs a real Postgres 18 container.

⚠️ Every red test below is one of the worker's database tests, and there are
twenty-three of them — `test_jobs.py`, `test_runs.py` and `test_reconnect.py`.
Three are ADR 0038's own: the job claim under two workers, the stale-claim
sweep, and a LISTEN torn down and recovered by the poll. Those three need a
second database session, which PGlite cannot give them. The other twenty are
#7's SQL — the chunk queue, `04` §6.2's resume query, the settle, the drain —
which need a database rather than a second session, and in Python that is the
same container. ADR 0038 carries the amendment and the reason the number moved.

Nothing else is affected: the entire TypeScript suite still runs, and so do
`test_subject.py`, `test_subject_drift.py`, `test_loop.py` and `test_db.py`
here — the loop's own shape is asserted against a fake connection and needs no
database at all. Start Docker and run `uv run pytest` again.

The underlying error was: {error}
"""


@pytest.fixture(scope="session")
def postgres_dsn() -> str:
    """A running Postgres 18, migrated, for the session."""
    try:
        from testcontainers.community.postgres import PostgresContainer
    except ImportError as error:  # pragma: no cover - dependency is pinned
        pytest.fail(NO_DOCKER.format(error=error))

    try:
        container = PostgresContainer(POSTGRES_IMAGE, driver=None)
        container.start()
    except Exception as error:  # noqa: BLE001 - any failure here means "no Docker"
        pytest.fail(NO_DOCKER.format(error=error))

    try:
        dsn = container.get_connection_url()
        with psycopg.connect(dsn, autocommit=True) as connection:
            _assert_postgres_18(connection)
            _apply_migrations(connection)
        yield dsn
    finally:
        container.stop()


@pytest.fixture
def connection(postgres_dsn: str):
    """One autocommit connection, and an empty scratch schema.

    ⚠️ `autocommit=True` is what the worker runs with (`03` §3.1) and it is not
    stylistic: without it psycopg opens an implicit transaction on the first
    statement, and a listening connection then sits idle *in a transaction*,
    where Neon's `idle_in_transaction_session_timeout` of five minutes kills it
    on a schedule (verification §7.2). Testing against a connection configured
    differently from the real one would be testing a different thing.
    """
    with psycopg.connect(postgres_dsn, autocommit=True) as conn:
        conn.execute(f"TRUNCATE {', '.join(SCRATCH_TABLES)} CASCADE;")
        yield conn


def _assert_postgres_18(connection: psycopg.Connection) -> None:
    """The container half of PIN 6/6, asserted **before** the migrations run.

    Applying `0000_schema.sql` to a Postgres 17 fails on the first `CREATE
    TABLE` with `function uuidv7() does not exist`, which is true and tells
    nobody what happened. This says it in one line, which is the same job
    `test/schema/schema.test.ts`'s version assertion does for PGlite.

    It is a fixture assertion rather than a test of its own on purpose: it is a
    **precondition** of every test in this tier rather than a behaviour, and a
    precondition that fails should fail them all with one sentence.
    """
    version = connection.execute("SELECT version();").fetchone()[0]
    assert "PostgreSQL 1" in version or "PostgreSQL 2" in version, version
    major = int(version.split()[1].split(".")[0])
    assert major >= 18, (
        f"{POSTGRES_IMAGE} reports {version!r}. `04` defaults every primary key "
        "to uuidv7(), a Postgres 18 built-in, and the PGlite tier is pinned to "
        "18.3 — the two test databases have to agree on the major (PIN 6/6)."
    )


def _apply_migrations(connection: psycopg.Connection) -> None:
    """Drizzle's migrations, in Drizzle's order.

    The order comes from `meta/_journal.json` rather than from a glob, so the
    two tiers replay the same sequence rather than whatever the filesystem
    happens to sort to.
    """
    journal = json.loads((MIGRATIONS / "meta" / "_journal.json").read_text())
    for entry in sorted(journal["entries"], key=lambda item: item["idx"]):
        sql = (MIGRATIONS / f"{entry['tag']}.sql").read_text()
        for statement in sql.split("--> statement-breakpoint"):
            if statement.strip():
                connection.execute(statement)
