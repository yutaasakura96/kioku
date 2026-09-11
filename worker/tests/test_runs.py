"""Opening the chunk queue, and what a drain does with a claimed job.

⚠️ **`ingestion_chunk` is empty until a worker claims the job.** #6 writes the
four rows `S2` names — `source`, `source_chunk`, `ingestion`, `job` — and stops
there on purpose: `04` §6.2 is per-chunk *progress*, and progress before
anything has been claimed is a fiction. This is the module that opens it.

Once that record exists, **it is the queue** (ADR 0015, `03` §5.4), and resuming
is `04` §6.2's one-line query rather than a judgement call.

⚠️ These need the container for the same reason the rest of the tier does: they
are the behaviour of real SQL against a real server, and the claim underneath
them needs a second session to mean anything.
"""

from __future__ import annotations

import psycopg
import pytest

from jobs import claim_next_job, drain
from runs import incomplete_chunks, open_chunk_queue, run_ingestion, settle_run
from test_jobs import state_of


def make_run(connection: psycopg.Connection, chunks: int = 3, title: str = "本") -> tuple[str, str]:
    """A *source* of `chunks` chunks with a queued job. Returns (ingestion, job)."""
    source_id = connection.execute(
        """
        INSERT INTO source (subject_id, title, content, content_hash, char_count)
        VALUES ('jlpt-vocab', %s, '本文', %s, 2) RETURNING id;
        """,
        (title, f"hash-{title}"),
    ).fetchone()[0]
    for ordinal in range(chunks):
        connection.execute(
            """
            INSERT INTO source_chunk (source_id, ordinal, char_start, char_end, content_hash)
            VALUES (%s, %s, %s, %s, %s);
            """,
            (source_id, ordinal, ordinal * 10, ordinal * 10 + 10, f"chunk-{title}-{ordinal}"),
        )
    ingestion_id = connection.execute(
        """
        INSERT INTO ingestion (source_id, source_title, subject_id, status)
        VALUES (%s, %s, 'jlpt-vocab', 'queued') RETURNING id;
        """,
        (source_id, title),
    ).fetchone()[0]
    job_id = connection.execute(
        "INSERT INTO job (kind, ingestion_id, state) VALUES ('ingest', %s, 'queued') RETURNING id;",
        (ingestion_id,),
    ).fetchone()[0]
    return ingestion_id, job_id


def status_of(connection: psycopg.Connection, ingestion_id: str) -> str:
    return connection.execute(
        "SELECT status FROM ingestion WHERE id = %s;", (ingestion_id,)
    ).fetchone()[0]


# ---------------------------------------------------------------------------
# The queue this ticket opens
# ---------------------------------------------------------------------------


def test_claiming_opens_the_chunk_queue(connection):
    ingestion_id, job_id = make_run(connection, chunks=3)

    assert drain(connection, owner="w", handle=run_ingestion) == 1

    rows = connection.execute(
        """
        SELECT ic.status, sc.ordinal FROM ingestion_chunk ic
        JOIN source_chunk sc ON sc.id = ic.source_chunk_id
        WHERE ic.ingestion_id = %s ORDER BY sc.ordinal;
        """,
        (ingestion_id,),
    ).fetchall()
    assert rows == [("pending", 0), ("pending", 1), ("pending", 2)]


def test_opening_the_queue_twice_adds_nothing(connection):
    """⚠️ A resume claims the same *ingestion* again (`04` §6.4's second `kind`),
    so this runs a second time on work that is already half done. Written any
    other way it would either duplicate the rows — the primary key refuses — or
    reset the progress that resuming exists to keep (`03` §5.4)."""
    ingestion_id, _ = make_run(connection, chunks=2)

    assert open_chunk_queue(connection, ingestion_id) == 2
    connection.execute(
        "UPDATE ingestion_chunk SET status = 'complete', completed_at = now() WHERE ingestion_id = %s;",
        (ingestion_id,),
    )
    assert open_chunk_queue(connection, ingestion_id) == 0

    still_complete = connection.execute(
        "SELECT count(*) FROM ingestion_chunk WHERE ingestion_id = %s AND status = 'complete';",
        (ingestion_id,),
    ).fetchone()[0]
    assert still_complete == 2


def test_the_queue_only_ever_holds_this_sources_chunks(connection):
    """⚠️ Seeded with a second *source* on purpose. A correlation written the
    wrong way — the class of bug § Carrying records from #6 — passes for exactly
    as long as there is one row to be wrong about."""
    first, _ = make_run(connection, chunks=2, title="一")
    second, _ = make_run(connection, chunks=5, title="二")

    assert open_chunk_queue(connection, first) == 2
    assert open_chunk_queue(connection, second) == 5

    counts = dict(
        connection.execute(
            "SELECT ingestion_id, count(*) FROM ingestion_chunk GROUP BY ingestion_id;"
        ).fetchall()
    )
    assert counts == {first: 2, second: 5}


# ---------------------------------------------------------------------------
# `04` §6.2's resume query
# ---------------------------------------------------------------------------


def test_resume_is_the_chunks_that_are_not_complete(connection):
    """`04` §6.2: *resume is `WHERE ingestion_id = $1 AND status <> 'complete'`.*

    ⚠️ `<>` and not `= 'pending'`. A chunk that failed after bounded retries is
    exactly what a resume is for (`03` §11), and a `failed` chunk left out of
    this query is money already spent that the resume silently abandons.
    """
    ingestion_id, _ = make_run(connection, chunks=4)
    open_chunk_queue(connection, ingestion_id)
    connection.execute(
        """
        UPDATE ingestion_chunk ic SET status = 'complete'
        FROM source_chunk sc
        WHERE sc.id = ic.source_chunk_id AND ic.ingestion_id = %s AND sc.ordinal IN (0, 1);
        """,
        (ingestion_id,),
    )
    connection.execute(
        """
        UPDATE ingestion_chunk ic SET status = 'failed', attempts = 3
        FROM source_chunk sc
        WHERE sc.id = ic.source_chunk_id AND ic.ingestion_id = %s AND sc.ordinal = 2;
        """,
        (ingestion_id,),
    )

    pending = incomplete_chunks(connection, ingestion_id)

    assert [chunk.ordinal for chunk in pending] == [2, 3]
    assert [chunk.status for chunk in pending] == ["failed", "pending"]


def test_a_run_with_nothing_left_settles_complete(connection):
    ingestion_id, _ = make_run(connection, chunks=2)
    open_chunk_queue(connection, ingestion_id)
    connection.execute(
        "UPDATE ingestion_chunk SET status = 'complete' WHERE ingestion_id = %s;", (ingestion_id,)
    )

    settle_run(connection, ingestion_id)

    row = connection.execute(
        "SELECT status, completed_at FROM ingestion WHERE id = %s;", (ingestion_id,)
    ).fetchone()
    assert row[0] == "complete"
    assert row[1] is not None


def test_a_run_with_chunks_left_settles_incomplete_and_not_failed(connection):
    """`04` §6.1: **`incomplete` is `S2`'s resumable state, not an error.**"""
    ingestion_id, _ = make_run(connection, chunks=2)
    open_chunk_queue(connection, ingestion_id)

    settle_run(connection, ingestion_id)

    row = connection.execute(
        "SELECT status, completed_at FROM ingestion WHERE id = %s;", (ingestion_id,)
    ).fetchone()
    assert row[0] == "incomplete"
    assert row[1] is None, "an incomplete run has not completed, and the ledger should not say it has"


# ---------------------------------------------------------------------------
# The drain
# ---------------------------------------------------------------------------


def test_the_drain_sweeps_before_it_claims(connection):
    """`04` §6.4: the sweep runs *at the top of the poll*, which is what makes a
    job abandoned by a dead laptop land in the very same drain that found it."""
    ingestion_id, job_id = make_run(connection)
    claim_next_job(connection, owner="the-laptop-that-closed")
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '6 minutes' WHERE id = %s;", (job_id,)
    )

    assert drain(connection, owner="the-next-worker", handle=run_ingestion) == 1
    assert state_of(connection, job_id) == "done"


def test_the_drain_empties_the_queue_rather_than_taking_one(connection):
    """Three jobs queued while the worker was away is one notification at most —
    and possibly none (ADR 0028). The poll has to take everything it finds."""
    for title in ("一", "二", "三"):
        make_run(connection, chunks=1, title=title)

    assert drain(connection, owner="w", handle=run_ingestion) == 3
    assert drain(connection, owner="w", handle=run_ingestion) == 0


def test_a_handler_that_raises_fails_its_own_job_and_the_drain_continues(connection):
    first, first_job = make_run(connection, chunks=1, title="一")
    second, second_job = make_run(connection, chunks=1, title="二")

    def explode(connection, job):
        if job.ingestion_id == first:
            raise RuntimeError("stage 6 refused")

    assert drain(connection, owner="w", handle=explode) == 2
    assert state_of(connection, first_job) == "failed"
    assert state_of(connection, second_job) == "done"
    assert connection.execute(
        "SELECT last_error FROM job WHERE id = %s;", (first_job,)
    ).fetchone()[0] == "stage 6 refused"


def test_a_connection_error_is_not_a_failed_job(connection):
    """⚠️ **The one exception that must not be caught here.** A dropped
    connection is `03` §3.1 step 7's business — reconnect and resume at
    `LISTEN` — and marking the job `failed` would burn a run for something that
    was never the run's fault. It goes stale instead, and the sweep returns it.
    """
    _, job_id = make_run(connection, chunks=1)

    def the_compute_went_to_sleep(connection, job):
        raise psycopg.OperationalError("terminating connection due to administrator command")

    with pytest.raises(psycopg.OperationalError):
        drain(connection, owner="w", handle=the_compute_went_to_sleep)

    assert state_of(connection, job_id) == "claimed"


def test_an_interface_error_is_not_a_failed_job_either(connection):
    """The other class a dead connection arrives as — see `db.CONNECTION_LOST`."""
    _, job_id = make_run(connection, chunks=1)

    def the_connection_was_already_closed(connection, job):
        raise psycopg.InterfaceError("connection already closed")

    with pytest.raises(psycopg.InterfaceError):
        drain(connection, owner="w", handle=the_connection_was_already_closed)

    assert state_of(connection, job_id) == "claimed"


def test_a_run_with_no_pipeline_yet_is_left_resumable(connection):
    """⚠️ **What #7 deliberately does not do**, stated as a test so the next
    session does not read it as a bug.

    `run_ingestion` takes the per-chunk work as an argument and #8 supplies it.
    With none, the queue is opened, nothing is processed, and the run settles
    `incomplete` — which is **true**: nothing completed, and every chunk is
    still there to be picked up. The alternative readings are both lies. Leaving
    it `running` claims a worker is on it, and `failed` claims something broke.
    """
    ingestion_id, job_id = make_run(connection, chunks=3)
    claimed = claim_next_job(connection, owner="w")

    run_ingestion(connection, claimed, process_chunk=None)

    assert status_of(connection, ingestion_id) == "incomplete"
    assert len(incomplete_chunks(connection, ingestion_id)) == 3
    assert connection.execute(
        "SELECT started_at FROM ingestion WHERE id = %s;", (ingestion_id,)
    ).fetchone()[0] is not None


def test_a_resume_keeps_what_the_first_run_paid_for(connection):
    """`03` §5.4, PRD §5's ugliest case: **partial results are kept** and a
    resume re-runs only unprocessed chunks. Discarding a half-finished ingestion
    throws away money already spent."""
    ingestion_id, _ = make_run(connection, chunks=4)
    drain(connection, owner="w", handle=run_ingestion)
    connection.execute(
        """
        UPDATE ingestion_chunk ic SET status = 'complete', completed_at = now()
        FROM source_chunk sc
        WHERE sc.id = ic.source_chunk_id AND ic.ingestion_id = %s AND sc.ordinal < 2;
        """,
        (ingestion_id,),
    )

    connection.execute(
        "INSERT INTO job (kind, ingestion_id, state) VALUES ('resume', %s, 'queued');",
        (ingestion_id,),
    )
    processed: list[int] = []
    drain(connection, owner="w", handle=lambda c, j: run_ingestion(
        c, j, process_chunk=lambda _c, chunk: processed.append(chunk.ordinal)
    ))

    assert processed == [2, 3], "a resume re-ran a chunk somebody already paid for"
    assert status_of(connection, ingestion_id) == "complete"


def test_a_resume_does_not_move_the_beginning_of_the_run(connection):
    """⚠️ `started_at` is stamped once and `coalesce` is what does it.

    It is one of the two endpoints *time-to-first-review* is measured across
    (`03` §12, `10` §8.1) — `source.submitted_at` to the first `review_log` —
    and a resume that reset it would quietly shorten every run that needed one,
    in the direction that flatters the number.
    """
    ingestion_id, _ = make_run(connection, chunks=2)
    drain(connection, owner="w", handle=run_ingestion)
    began = connection.execute(
        "SELECT started_at FROM ingestion WHERE id = %s;", (ingestion_id,)
    ).fetchone()[0]

    connection.execute(
        "INSERT INTO job (kind, ingestion_id, state) VALUES ('resume', %s, 'queued');",
        (ingestion_id,),
    )
    drain(connection, owner="w", handle=run_ingestion)

    assert connection.execute(
        "SELECT started_at FROM ingestion WHERE id = %s;", (ingestion_id,)
    ).fetchone()[0] == began
