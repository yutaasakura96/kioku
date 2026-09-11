"""The container tier — ADR 0038, `11` §1 and §7.

**A real Postgres 18, for the worker's database tests.** ADR 0038
split the two test databases on the line ADR 0019 already drew: PGlite in
process for every constraint, delete rule and trigger in `04`, and a real server
for the three behaviours PGlite cannot have — the job claim under two workers,
the stale-claim sweep, and a `LISTEN` torn down and recovered by the poll. Those
three need a **second session**, and PGlite is single-connection.

⚠️ **ADR 0038 said "three tests and nothing else" and carries a dated amendment
for each time that moved.** What joined the three is SQL rather than concurrency:
#7's chunk queue, `04` §6.2's resume query, the settle and the drain, then #8's
corpus lookup, rejected filter, *occurrence* append and ledger, ADR 0046's two
sweep branches and `test_scratch_cleanup.py`, then #9's generation cache, spend
ledger and *pending note* writes. All of it needs a database rather than a second
session, and in Python that is the same container.

⚠️ **The count is not written in this file**, and that is deliberate: it lived in
four files, went stale twice, and `worker/tests/README.md` is the one place that
has to be right. :data:`NO_DOCKER` below names the **files**, which is what a
developer is looking at when they read it.

⚠️ **Without Docker these go red rather than skipping**, and that is ADR 0038's
sentence, not an accident: *"it is the worker's three concurrency tests that go
red — visibly and for a stated reason, rather than the whole suite refusing to
start."* A guard that quietly excuses itself is not a guard. Every other test in
this directory keeps running — the whole pure pipeline, stage 6's own request and
response handling, the price table, the provider boundary, plus
`test_subject.py`, `test_subject_drift.py`, `test_loop.py` and `test_db.py`.
:data:`NO_DOCKER` below is the message that names them, and it is the one a
developer actually reads.

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

#: The tables these tests write, **children first**, emptied with `DELETE`.
#:
#: ⚠️ **This was `TRUNCATE … CASCADE` until #8, and the comment above it claimed
#: a protection it did not have.** It said `review_log` "is not among them and
#: must not be", which was true and beside the point: `CASCADE` does not stop at
#: the tables you name. Measured 2026-09-11 against the container —
#: `TRUNCATE job, ingestion_chunk, ingestion, source_chunk, source CASCADE`
#: reaches `review_log` through `note.origin_ingestion_id` → `note` → `card` →
#: `review_log`, and a row written before it was gone after it. And `CASCADE` was
#: not decorative: without it Postgres refuses the statement outright —
#: *cannot truncate a table referenced in a foreign key constraint … Table "note"
#: references "ingestion"*. So the one keyword that made the cleanup run was also
#: the one that let it walk to the irreplaceable data.
#:
#: **`DELETE` is what the schema's own rules apply to.** `04` §9's delete
#: behaviour is real for a `DELETE` and ignored by a `TRUNCATE`: the `RESTRICT`
#: on `card.note_id` refuses, and `review_log`'s `BEFORE DELETE` trigger (`04`
#: §7.5) fires. A test that leaves a `card` behind now fails loudly here instead
#: of quietly taking the review history with it.
#:
#: :func:`test_the_scratch_cleanup_cannot_reach_review_log` is the guard, because
#: a comment could not be one — which is the whole lesson of the paragraph this
#: one replaced.
SCRATCH_TABLES = (
    # ⚠️ **`generation_cache` is in this list because it is keyed on content
    # rather than on a row any test owns** (`04` §6.3). Left behind, one test's
    # answer for `chunk-0` is served to the next one, and every assertion about
    # *what the provider was asked* silently becomes an assertion about the
    # previous test — measured 2026-09-12, and it turned six of #9's tests green
    # for the wrong reason before it turned them red for the right one. It is
    # also the one table `04` §10 calls safe to truncate, and it references
    # nothing, so it goes first and alone.
    "generation_cache",
    "occurrence",
    "note_vetting",
    "note_field_provenance",
    "level_claim",
    "ingestion_chunk",
    "job",
    "ingestion",
    "source_chunk",
    "source",
    # Last: every child of `note` above it is gone by now, and `card` is not in
    # this list on purpose — a `card` still standing means `04` §9's `RESTRICT`
    # refuses, which is the failure this ordering exists to produce.
    "note",
)

NO_DOCKER = """\
Docker is not available, and this test needs a real Postgres 18 container.

⚠️ Every red test below is in one of the worker's six database files —
`test_jobs.py`, `test_runs.py`, `test_reconnect.py`, `test_ingest.py`,
`test_generation.py` and `test_scratch_cleanup.py`. (`worker/tests/README.md`
carries how many that is; this message names the files, because those are what
you are looking at.)

Three of them are ADR 0038's own: the job claim under two workers, the
stale-claim sweep, and a LISTEN torn down and recovered by the poll. Those three
need a second database session, which PGlite cannot give them. The rest need a
database rather than a second session — #7's chunk queue, resume query, settle
and drain, #8's corpus lookup, rejected filter, *occurrence* append and ledger,
and #9's generation cache, spend ledger and *pending note* writes — and in Python
that is the same container. ADR 0038 carries a dated amendment for each time the
number moved.

Nothing else is affected: the entire TypeScript suite still runs, and so does
every test here that needs neither — the whole pure pipeline (`test_chunk.py`,
`test_tokenise.py`, `test_extract_candidates.py`, `test_deduplicate.py`,
`test_filter_known.py`, `test_pipeline.py`), stage 6's own request and response
handling (`test_generate.py`), the price table (`test_prices.py`), ADR 0018's
boundary (`test_provider.py`), plus `test_subject.py`, `test_subject_drift.py`,
`test_loop.py` and `test_db.py`. Start Docker and run `uv run pytest` again.

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
        for table in SCRATCH_TABLES:
            conn.execute(f"DELETE FROM {table};")
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
