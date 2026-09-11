"""The fixture's own cleanup, and the one thing it must never be able to reach.

⚠️ **`review_log` is the irreplaceable data** (`04` §7.5, `11` §5). Every other
table in this schema can be rebuilt by re-ingesting the *source*; a grade cannot,
because the moment it recorded is gone. `04` §9 guards it with `RESTRICT`, `04`
§7.5 guards it with a `BEFORE DELETE` trigger, and `11` §5 guards it with a test
— and until #8 the **test fixture** walked past all three, because
`TRUNCATE … CASCADE` obeys none of them.

This is the guard for the guard.

⚠️ **The whole test runs inside a transaction that is rolled back**, and that is
not tidiness. `04` §7.5's trigger means a `review_log` row, once committed, can
never be deleted — so a test that committed one would leave a `card` standing
that every later test's fixture is then guaranteed to refuse to clear. The one
table worth protecting is the one a test cannot clean up after.
"""

from __future__ import annotations

import psycopg
import pytest

from conftest import SCRATCH_TABLES


def test_the_scratch_cleanup_cannot_reach_review_log(connection):
    """⚠️ **Measured, and it used to fail.**

    With `TRUNCATE job, ingestion_chunk, ingestion, source_chunk, source CASCADE`
    this assertion goes from 1 to 0: the cascade follows `note.origin_ingestion_id`
    to `note`, `card` to `note` and `review_log` to `card`, and the grade is gone.
    `CASCADE` was not decorative either — without it Postgres refuses the
    statement outright, *Table "note" references "ingestion"* — so the one keyword
    that made the old cleanup run was the one that let it walk this far.

    With ordered `DELETE`s the `RESTRICT` on `card.note_id` refuses two tables
    short of the damage, which is `04` §9 doing the job it was written for.

    ⚠️ `RestrictViolation`, not `ForeignKeyViolation`: § Carrying already carries
    that finding from #4 — Postgres says *violates RESTRICT setting of foreign
    key constraint*, and the two are different exception classes.
    """
    with connection.transaction():
        seed_a_graded_card(connection)
        assert count(connection, "review_log") == 1

        # A savepoint, so the refusal does not poison the outer block.
        with pytest.raises(psycopg.errors.RestrictViolation):
            with connection.transaction():
                clear(connection)

        assert count(connection, "review_log") == 1
        assert count(connection, "card") == 1
        raise psycopg.Rollback


def test_the_cleanup_empties_everything_a_worker_test_writes(connection):
    """The other half: refusing to destroy data is only useful if the fixture
    still leaves an empty scratch schema behind for the next test.
    """
    ingestion_id = connection.execute(
        """
        INSERT INTO ingestion (source_title, subject_id, status)
        VALUES ('本', 'jlpt-vocab', 'queued') RETURNING id;
        """
    ).fetchone()[0]
    connection.execute(
        "INSERT INTO job (kind, ingestion_id, state) VALUES ('ingest', %s, 'queued');",
        (ingestion_id,),
    )
    connection.execute(
        """
        INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
        VALUES ('jlpt-vocab', 'cleanup-ordinary', '{}'::jsonb, %s);
        """,
        (ingestion_id,),
    )

    clear(connection)

    assert [count(connection, table) for table in SCRATCH_TABLES] == [0] * len(SCRATCH_TABLES)


def seed_a_graded_card(connection: psycopg.Connection) -> None:
    """One row in every table between `ingestion` and `review_log`.

    The chain is the point: `note.origin_ingestion_id` is what makes `note` a
    child of `ingestion`, and `card` and `review_log` follow from there.
    """
    connection.execute(
        """
        INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('usr_cleanup', 'Reader', 'cleanup@example.test', true, now(), now())
        ON CONFLICT (id) DO NOTHING;
        """
    )
    ingestion_id = connection.execute(
        """
        INSERT INTO ingestion (source_title, subject_id, status)
        VALUES ('本', 'jlpt-vocab', 'complete') RETURNING id;
        """
    ).fetchone()[0]
    note_id = connection.execute(
        """
        INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
        VALUES ('jlpt-vocab', 'cleanup-probe', '{}'::jsonb, %s) RETURNING id;
        """,
        (ingestion_id,),
    ).fetchone()[0]
    card_id = connection.execute(
        """
        INSERT INTO card (note_id, owner_id, template_key)
        VALUES (%s, 'usr_cleanup', 'recognition') RETURNING id;
        """,
        (note_id,),
    ).fetchone()[0]
    epoch_id = connection.execute(
        """
        INSERT INTO scheduling_epoch
          (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
        VALUES (%s, 'usr_cleanup', 0, now(), 1.0, 5.0, 1) RETURNING id;
        """,
        (card_id,),
    ).fetchone()[0]
    connection.execute(
        """
        INSERT INTO review_log
          (card_id, scheduling_epoch_id, owner_id, rating, state, due,
           stability, difficulty, scheduled_days, learning_steps, reviewed_at)
        VALUES (%s, %s, 'usr_cleanup', 3, 1, now(), 1.0, 5.0, 1, 0, now());
        """,
        (card_id, epoch_id),
    )


def clear(connection: psycopg.Connection) -> None:
    """Exactly what the `connection` fixture does, in exactly its order."""
    for table in SCRATCH_TABLES:
        connection.execute(f"DELETE FROM {table};")


def count(connection: psycopg.Connection, table: str) -> int:
    return connection.execute(f"SELECT count(*) FROM {table};").fetchone()[0]
