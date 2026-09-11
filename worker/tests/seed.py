"""One *source*, seeded the way #6 writes one — shared by the container tests.

⚠️ **Not a test module.** It carries the four rows `S2` names on submit — a
`source`, its `source_chunk`s, an `ingestion` at `queued` and a `job` — written
with the same columns `server/utils/ingest/record.ts` writes, so a test that
claims the job sees what a claimed job actually sees.

It lives here rather than in `conftest.py` because `conftest.py` is the container
fixture and its subject is ADR 0038; this is scaffolding for two test files and
would have been copied into the second one otherwise. A second copy of the seed
is a second place for `04`'s column list to go stale.
"""

from __future__ import annotations

import psycopg

#: Two sentences, two chunks: [0, 14) and [14, 24). 図書館 appears in both, which
#: is what makes this *source* worth using: it is `00-status.md` § Carrying's
#: cross-chunk duplicate, and stage 7's streamed write is what closes it.
CONTENT = "駅の近くに図書館があります。図書館は六時に開く。"
CHUNKS = ((0, 14), (14, 24))

#: `04` §5.3's rendering rule, spelled with `chr(31)` because the separator is
#: invisible and `03` §6 found it to be the one character `str.strip()` strips
#: and JavaScript's `trim()` does not.
LIBRARY = "図書館" + chr(31) + "としょかん"
OWNER = "usr_ingest"


def make_run(connection: psycopg.Connection, *, owner: str | None = OWNER) -> str:
    connection.execute(
        """
        INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (%s, 'Reader', 'ingest@example.test', true, now(), now())
        ON CONFLICT (id) DO NOTHING;
        """,
        (owner or OWNER,),
    )
    source_id = connection.execute(
        """
        INSERT INTO source (subject_id, title, content, content_hash, char_count)
        VALUES ('jlpt-vocab', '社説', %s, 'hash-ingest', %s) RETURNING id;
        """,
        (CONTENT, len(CONTENT)),
    ).fetchone()[0]
    for ordinal, (start, end) in enumerate(CHUNKS):
        connection.execute(
            """
            INSERT INTO source_chunk (source_id, ordinal, char_start, char_end, content_hash)
            VALUES (%s, %s, %s, %s, %s);
            """,
            (source_id, ordinal, start, end, f"chunk-{ordinal}"),
        )
    ingestion_id = connection.execute(
        """
        INSERT INTO ingestion (source_id, source_title, subject_id, status, submitted_by)
        VALUES (%s, '社説', 'jlpt-vocab', 'queued', %s) RETURNING id;
        """,
        (source_id, owner),
    ).fetchone()[0]
    connection.execute(
        "INSERT INTO job (kind, ingestion_id, state) VALUES ('ingest', %s, 'queued');",
        (ingestion_id,),
    )
    return ingestion_id


def seed_note(connection: psycopg.Connection, identity_key: str, *, rejected_by=None) -> str:
    note_id = connection.execute(
        """
        INSERT INTO note (subject_id, identity_key, fields)
        VALUES ('jlpt-vocab', %s, '{}'::jsonb) RETURNING id;
        """,
        (identity_key,),
    ).fetchone()[0]
    if rejected_by is not None:
        connection.execute(
            """
            INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
            VALUES (%s, 'Other', %s, true, now(), now()) ON CONFLICT (id) DO NOTHING;
            """,
            (rejected_by, f"{rejected_by}@example.test"),
        )
        connection.execute(
            "INSERT INTO note_vetting (note_id, owner_id, state) VALUES (%s, %s, 'rejected');",
            (note_id, rejected_by),
        )
    return note_id


def ledger(connection: psycopg.Connection, ingestion_id: str):
    """`04` §6.1's four candidate counters, with the status and the dictionary."""
    return connection.execute(
        """
        SELECT status, dictionary_version, candidates_extracted, candidates_deduplicated,
               candidates_already_known, candidates_rejected
        FROM ingestion WHERE id = %s;
        """,
        (ingestion_id,),
    ).fetchone()


def spend(connection: psycopg.Connection, ingestion_id: str):
    """`04` §6.1's spend half — the ledger `S10` reports from."""
    return connection.execute(
        """
        SELECT model_id, prompt_version, input_tokens, output_tokens, cost_micro_usd,
               price_table_effective_date, worker_environment
        FROM ingestion WHERE id = %s;
        """,
        (ingestion_id,),
    ).fetchone()
