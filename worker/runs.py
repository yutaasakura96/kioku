"""A claimed job, turned into an open chunk queue — `04` §6.1, §6.2, `03` §5.4.

**Once the per-chunk record exists, it *is* the queue** (ADR 0015). That is why
there is no queue service in this project, and it is why resuming is a query —
`04` §6.2's `WHERE ingestion_id = $1 AND status <> 'complete'` — rather than a
judgement call about what a half-finished run got through.

⚠️ **#6 deliberately did not write these rows and #7 does.** `04` §6.2 is
per-chunk *progress*, and progress before anything has been claimed is a
fiction: `S2` names four rows on submit and #6 wrote exactly four.

⚠️ **The per-chunk work is not here.** `run_ingestion` takes it as an argument;
#8 supplied stages 1 to 5 and #9 added generation behind the same argument. With
no processor the queue is opened, nothing runs, and the *ingestion* settles
`incomplete`, which is the true answer rather than a placeholder: nothing
completed, and every chunk is still there to be picked up. `04` §6.1 is explicit
that **`incomplete` is `S2`'s resumable state, not an error**.

⚠️ **#9 changed one line of this module**, and it is the one in `04` §6.2's
resume query: the *chunk*'s `content_hash` now comes back on the row, because it
is the first element of the generation cache key (`04` §6.3) and this query is
already joined to the table that holds it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

import psycopg

from db import CONNECTION_LOST
from jobs import ClaimedJob, heartbeat


@dataclass(frozen=True)
class Chunk:
    """One row of the resume query, joined to the *chunk* it is progress for.

    ⚠️ `char_start` and `char_end` are **code-point offsets**, not UTF-16 units.
    The app writes them through `shared/ingest/text.ts`, which iterates code
    points precisely so Python's `len()` and JavaScript's `.length` agree; a
    slice taken here with anything but `list(content)[start:end]` re-opens that
    divergence from the other end.
    """

    source_chunk_id: str
    ordinal: int
    char_start: int
    char_end: int
    #: ⚠️ **The first element of `04` §6.3's four-tuple**, carried on the row
    #: rather than recomputed: `shared/ingest/chunk.ts` decided where this chunk
    #: begins and `server/utils/ingest/record.ts` hashed it, and a second answer
    #: here would be a cache that silently misses (`pipeline/chunk.py`).
    content_hash: str
    status: str
    attempts: int


def start_run(connection: psycopg.Connection, ingestion_id: str) -> None:
    """`running`, and `started_at` stamped **once**.

    ⚠️ `coalesce` rather than an assignment: a resume claims the same
    *ingestion* again, and overwriting `started_at` would move the beginning of
    a run that already began — which is one of the two endpoints
    *time-to-first-review* is measured across (`03` §12, `10` §8.1).
    """
    connection.execute(
        """
        UPDATE ingestion
        SET status = 'running', started_at = coalesce(started_at, now())
        WHERE id = %s;
        """,
        (ingestion_id,),
    )


def open_chunk_queue(connection: psycopg.Connection, ingestion_id: str) -> int:
    """One `ingestion_chunk` per *chunk* of this run's *source*. Idempotent.

    Returns how many rows this call added, which is every chunk on the first
    call and zero on a resume.

    ⚠️ **`ON CONFLICT DO NOTHING`, and it is the resume that needs it.** The
    primary key is `(ingestion_id, source_chunk_id)` (`04` §6.2), so a second
    call cannot duplicate a row — but written as a plain insert it would raise,
    and written as an upsert it would reset the `complete` rows that resuming
    exists to keep (`03` §5.4).
    """
    result = connection.execute(
        """
        INSERT INTO ingestion_chunk (ingestion_id, source_chunk_id)
        SELECT i.id, sc.id
        FROM ingestion i
        JOIN source_chunk sc ON sc.source_id = i.source_id
        WHERE i.id = %s
        ON CONFLICT DO NOTHING;
        """,
        (ingestion_id,),
    )
    return result.rowcount


def incomplete_chunks(connection: psycopg.Connection, ingestion_id: str) -> list[Chunk]:
    """`04` §6.2's resume query, in *chunk* order.

    ⚠️ **`<> 'complete'` and not `= 'pending'`.** A chunk that failed after
    bounded retries is exactly what a resume is for (`03` §11); leaving it out
    abandons money already spent, silently. `04` §11's partial index is built on
    this predicate, so the two have to stay spelled the same way.
    """
    rows = connection.execute(
        """
        SELECT ic.source_chunk_id, sc.ordinal, sc.char_start, sc.char_end,
               sc.content_hash, ic.status, ic.attempts
        FROM ingestion_chunk ic
        JOIN source_chunk sc ON sc.id = ic.source_chunk_id
        WHERE ic.ingestion_id = %s AND ic.status <> 'complete'
        ORDER BY sc.ordinal;
        """,
        (ingestion_id,),
    ).fetchall()
    return [Chunk(*row) for row in rows]


def settle_run(connection: psycopg.Connection, ingestion_id: str) -> str:
    """Decide what the run is now, from the chunk queue rather than from a flag.

    `complete` when nothing is left, `incomplete` otherwise — and `completed_at`
    is stamped only in the first case, because an incomplete run has not
    completed and the spend ledger (`04` §6.1) should not say it has.

    ⚠️ **`failed` is not reachable from here and that is deliberate.** `03` §11
    puts a provider erroring or rate-limiting into *the same incomplete state*,
    and `04` §6.1 calls `incomplete` "`S2`'s resumable state, not an error". A
    run that could not be started at all is the `failed` case, and it belongs to
    whoever discovers such a case rather than to a default branch here.
    """
    settled = connection.execute(
        """
        UPDATE ingestion SET
          status = CASE WHEN remaining.count = 0 THEN 'complete' ELSE 'incomplete' END,
          completed_at = CASE WHEN remaining.count = 0 THEN now() ELSE completed_at END
        FROM (
          SELECT count(*) AS count FROM ingestion_chunk
          WHERE ingestion_id = %(id)s AND status <> 'complete'
        ) AS remaining
        WHERE ingestion.id = %(id)s
        RETURNING ingestion.status;
        """,
        {"id": ingestion_id},
    ).fetchone()
    if settled is None:
        raise LookupError(f"no ingestion {ingestion_id} to settle")
    return settled[0]


ChunkProcessor = Callable[[psycopg.Connection, Chunk], None]


def run_ingestion(
    connection: psycopg.Connection,
    job: ClaimedJob,
    *,
    process_chunk: Optional[ChunkProcessor] = None,
) -> None:
    """Open the queue, work it with whatever processor was supplied, settle.

    ⚠️ **`process_chunk` is #8's and #9's half of this function.** What belongs
    *here* is the durable bookkeeping — the chunk's status, its attempt, the heartbeat and
    the settle — and keeping it apart from the work is what lets the per-chunk
    stages be tested with no database at all (`11` §8).

    ⚠️ **Not "the seven stages are pure".** `03` §5.1's table does not say that
    and three of its rows contradict it: stage 1 is *accept and chunk the
    source*, which is whole-document and the app already did it in #6; stage 6 is
    the **LLM**; stage 7 **writes** the pending notes, streamed as produced. What
    is pure is stages 2 to 5 — tokenise, extract, deduplicate, filter — and those
    are the ones `11` §8 means.
    """
    start_run(connection, job.ingestion_id)
    open_chunk_queue(connection, job.ingestion_id)

    for chunk in incomplete_chunks(connection, job.ingestion_id):
        if process_chunk is None:
            break
        _mark_chunk(connection, job.ingestion_id, chunk, "running")
        try:
            process_chunk(connection, chunk)
        except CONNECTION_LOST:
            raise
        except Exception as error:  # noqa: BLE001 - one chunk's failure is not the run's
            # ⚠️ `03` §13.4: never source text. ⚠️ `03` §11: never the provider's
            # name — this column is read straight onto the run row (`10` §6.2).
            _mark_chunk(connection, job.ingestion_id, chunk, "failed", error=str(error))
        else:
            _mark_chunk(connection, job.ingestion_id, chunk, "complete")
        # `04` §6.4 step 3, in the one place a run is long enough to need it.
        heartbeat(connection, job)

    settle_run(connection, job.ingestion_id)


def _mark_chunk(
    connection: psycopg.Connection,
    ingestion_id: str,
    chunk: Chunk,
    status: str,
    *,
    error: str | None = None,
) -> None:
    connection.execute(
        """
        UPDATE ingestion_chunk SET
          status = %(status)s,
          attempts = CASE WHEN %(status)s = 'running' THEN attempts + 1 ELSE attempts END,
          started_at = CASE WHEN %(status)s = 'running' THEN now() ELSE started_at END,
          completed_at = CASE WHEN %(status)s = 'complete' THEN now() ELSE completed_at END,
          -- ⚠️ Written on every mark, which **clears** the previous attempt's
          -- error as the retry starts. That is deliberate: a `running` chunk has
          -- no error yet, and a stale one left on the row would be read as this
          -- attempt's (`10` §6.2 puts it in front of the reader).
          last_error = %(error)s
        WHERE ingestion_id = %(ingestion_id)s AND source_chunk_id = %(chunk_id)s;
        """,
        {
            "status": status,
            "error": error,
            "ingestion_id": ingestion_id,
            "chunk_id": chunk.source_chunk_id,
        },
    )
