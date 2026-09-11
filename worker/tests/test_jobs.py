"""The claim and the sweep, against a real Postgres — ADR 0038, `11` §7.

Two of the three tests that need Docker live here. Both are about what happens
when there is **more than one session**, which is the whole reason this tier
exists: PGlite is single-connection, so `FOR UPDATE SKIP LOCKED` has nothing to
skip past in it and a claim can only be tested as arithmetic.

⚠️ Without Docker these go red with the reason in `conftest.py` (ADR 0038).
"""

from __future__ import annotations

import psycopg
import pytest

from jobs import (
    MAX_ATTEMPTS,
    STALE_AFTER,
    claim_next_job,
    fail_job,
    finish_job,
    heartbeat,
    sweep_stale_claims,
)


def queue_job(connection: psycopg.Connection, title: str = "朝日新聞 社説") -> str:
    """One *source*, one *chunk*, one `ingestion`, one queued `job` — #6's four
    rows, written the short way because #6 already tests the transaction."""
    source_id = connection.execute(
        """
        INSERT INTO source (subject_id, title, content, content_hash, char_count)
        VALUES ('jlpt-vocab', %s, '本文', %s, 2) RETURNING id;
        """,
        (title, f"hash-{title}"),
    ).fetchone()[0]
    connection.execute(
        """
        INSERT INTO source_chunk (source_id, ordinal, char_start, char_end, content_hash)
        VALUES (%s, 0, 0, 2, 'chunk-hash');
        """,
        (source_id,),
    )
    ingestion_id = connection.execute(
        """
        INSERT INTO ingestion (source_id, source_title, subject_id, status)
        VALUES (%s, %s, 'jlpt-vocab', 'queued') RETURNING id;
        """,
        (source_id, title),
    ).fetchone()[0]
    return connection.execute(
        "INSERT INTO job (kind, ingestion_id, state) VALUES ('ingest', %s, 'queued') RETURNING id;",
        (ingestion_id,),
    ).fetchone()[0]


def state_of(connection: psycopg.Connection, job_id: str) -> str:
    return connection.execute("SELECT state FROM job WHERE id = %s;", (job_id,)).fetchone()[0]


# ---------------------------------------------------------------------------
# ADR 0038's first: two workers claim different rows
# ---------------------------------------------------------------------------


def test_two_workers_claim_different_rows(connection, postgres_dsn):
    """`04` §6.4 steps 1 and 2, `03` §3.2.

    At one worker `SKIP LOCKED` buys nothing today and costs nothing either;
    ADR 0015's revisit condition is a second worker, which is exactly when it
    starts mattering. This is that second worker, brought forward.
    """
    first_job = queue_job(connection, "一")
    second_job = queue_job(connection, "二")

    with psycopg.connect(postgres_dsn, autocommit=True) as other:
        mine = claim_next_job(connection, owner="worker-a")
        theirs = claim_next_job(other, owner="worker-b")

    assert {mine.id, theirs.id} == {first_job, second_job}
    assert mine.id != theirs.id
    assert mine.claimed_by == "worker-a"
    assert theirs.claimed_by == "worker-b"

    # And a third look finds nothing rather than re-handing out a claimed row.
    assert claim_next_job(connection, owner="worker-c") is None


def test_a_row_another_session_has_locked_is_skipped_not_waited_on(connection, postgres_dsn):
    """⚠️ **The assertion `SKIP LOCKED` actually makes**, and the one the
    previous test cannot: a claim never *blocks* on a row somebody else is
    holding, it takes the next one.

    The lock is taken by hand here because the real claim holds its row for the
    length of one `UPDATE` and is gone before another session could observe it —
    which is `03` §3.2's requirement stated as a mechanism: *a row state with an
    owner and a timestamp, not a lock held for the life of a job.*

    ⚠️ `statement_timeout` is what makes the sabotage legible. Drop `SKIP
    LOCKED` from the claim and this test fails in two seconds with a lock
    timeout instead of hanging until somebody kills pytest.
    """
    locked_job = queue_job(connection, "locked")
    free_job = queue_job(connection, "free")

    with psycopg.connect(postgres_dsn) as holder:
        holder.execute("SELECT id FROM job WHERE id = %s FOR UPDATE;", (locked_job,))

        connection.execute("SET statement_timeout = '2s';")
        claimed = claim_next_job(connection, owner="worker-b")
        connection.execute("SET statement_timeout = 0;")

        assert claimed is not None, "the claim blocked or found nothing"
        assert claimed.id == free_job
        holder.rollback()


def test_a_claim_is_a_row_state_and_not_a_held_lock(connection):
    """`03` §3.2: the claim has to survive the laptop closing mid-job, so it is
    visible to every other session the moment it is made."""
    job_id = queue_job(connection)

    claimed = claim_next_job(connection, owner="yutas-mbp:1725")

    row = connection.execute(
        "SELECT state, claimed_by, claimed_at, heartbeat_at, attempts FROM job WHERE id = %s;",
        (job_id,),
    ).fetchone()
    assert row[0] == "claimed"
    assert row[1] == "yutas-mbp:1725"
    assert row[2] is not None
    assert row[3] is not None, "heartbeat_at is the column that survives the laptop closing"
    assert row[4] == 1, "attempts counts claims, so a job that keeps dying says so"
    assert claimed.ingestion_id is not None


def test_a_job_scheduled_for_later_is_not_claimed_yet(connection):
    """`04` §6.4: `available_at` is backoff — *a retry sets it forward rather
    than sleeping in the worker*."""
    job_id = queue_job(connection)
    connection.execute(
        "UPDATE job SET available_at = now() + interval '1 hour' WHERE id = %s;", (job_id,)
    )

    assert claim_next_job(connection, owner="worker-a") is None


def test_finishing_and_failing_a_job_both_stamp_finished_at(connection):
    done = queue_job(connection, "done")
    broken = queue_job(connection, "broken")

    finish_job(connection, claim_next_job(connection, owner="w"))
    fail_job(connection, claim_next_job(connection, owner="w"), "provider 429")

    rows = dict(
        connection.execute(
            "SELECT id, state FROM job WHERE finished_at IS NOT NULL;"
        ).fetchall()
    )
    assert rows == {done: "done", broken: "failed"}
    assert connection.execute(
        "SELECT last_error FROM job WHERE id = %s;", (broken,)
    ).fetchone()[0] == "provider 429"


# ---------------------------------------------------------------------------
# ADR 0038's second: a stale claim returns to the queue
# ---------------------------------------------------------------------------


def test_a_stale_claim_returns_to_the_queue(connection):
    """`04` §6.4 step 4 — *the laptop closed mid-job*.

    The claim is still visible, it is **visibly stale**, and a timed rule
    releases it. ⚠️ The rule runs here, in the worker, and not on a schedule
    elsewhere: ADR 0022 forbids depending on a Vercel-only feature and Vercel
    Cron is named in that list.
    """
    job_id = queue_job(connection)
    claim_next_job(connection, owner="the-laptop-that-closed")
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '6 minutes' WHERE id = %s;", (job_id,)
    )

    assert sweep_stale_claims(connection) == 1

    row = connection.execute(
        "SELECT state, claimed_by, claimed_at, heartbeat_at FROM job WHERE id = %s;", (job_id,)
    ).fetchone()
    assert row == ("queued", None, None, None)

    # And the next worker to look gets it, which is the whole point.
    assert claim_next_job(connection, owner="the-next-worker").id == job_id


def test_a_beating_claim_is_left_alone(connection):
    """The other half, and the one that matters more: a sweep that reclaimed a
    *live* job would hand the same *ingestion* to two workers and spend twice."""
    queue_job(connection)
    claimed = claim_next_job(connection, owner="still-working")
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '4 minutes' WHERE id = %s;", (claimed.id,)
    )

    assert sweep_stale_claims(connection) == 0
    assert state_of(connection, claimed.id) == "claimed"

    # A heartbeat is what keeps it that way past the boundary.
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '6 minutes' WHERE id = %s;", (claimed.id,)
    )
    heartbeat(connection, claimed)
    assert sweep_stale_claims(connection) == 0


def test_the_stale_boundary_is_five_minutes(connection):
    """Named rather than inferred: `04` §6.4 says five, and a future session
    reading `STALE_AFTER` should find the document's number in it."""
    assert STALE_AFTER == "5 minutes"


def test_a_finished_job_is_never_swept(connection):
    """`done` and `failed` carry `claimed_by` forever — the audit line of who
    ran it — and a sweep that matched on the owner rather than the state would
    resurrect every completed run the first time it ran."""
    queue_job(connection)
    claimed = claim_next_job(connection, owner="w")
    finish_job(connection, claimed)
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '1 day' WHERE id = %s;", (claimed.id,)
    )

    assert sweep_stale_claims(connection) == 0
    assert state_of(connection, claimed.id) == "done"


def test_a_worker_cannot_finish_a_job_another_worker_now_holds(connection):
    """⚠️ **The two-worker case ADR 0015 says to expect, at the one place it
    silently corrupts.**

    A run that outlives the five-minute heartbeat window is swept back to
    `queued` and claimed by somebody else — and the first worker is still going.
    Matched on `id` alone, its `finish_job` stamps `done` over the live claim and
    the second pipeline keeps running against an *ingestion* nobody is watching.
    Matched on the claim, it is a no-op, which is the truth: that job is not its
    job any more.
    """
    job_id = queue_job(connection)
    abandoned = claim_next_job(connection, owner="the-laptop-that-closed")
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '6 minutes' WHERE id = %s;", (job_id,)
    )
    sweep_stale_claims(connection)
    taken_over = claim_next_job(connection, owner="the-next-worker")

    finish_job(connection, abandoned)

    row = connection.execute(
        "SELECT state, claimed_by FROM job WHERE id = %s;", (job_id,)
    ).fetchone()
    assert row == ("claimed", "the-next-worker")

    # And the worker that does hold it can still finish it.
    finish_job(connection, taken_over)
    assert state_of(connection, job_id) == "done"


def test_a_heartbeat_from_a_worker_that_lost_the_claim_does_nothing(connection):
    """The same rule on the other write. A stale worker beating a claim it no
    longer holds would hide the takeover from the next sweep."""
    job_id = queue_job(connection)
    abandoned = claim_next_job(connection, owner="the-laptop-that-closed")
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '6 minutes' WHERE id = %s;", (job_id,)
    )
    sweep_stale_claims(connection)
    claim_next_job(connection, owner="the-next-worker")
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '6 minutes' WHERE id = %s;", (job_id,)
    )

    heartbeat(connection, abandoned)

    assert sweep_stale_claims(connection) == 1, "the stale worker's beat hid a dead claim"


# ---------------------------------------------------------------------------
# #8: a ceiling on `attempts`, and `available_at` finally used as backoff
# ---------------------------------------------------------------------------


def go_stale(connection, job_id: str) -> None:
    connection.execute(
        "UPDATE job SET heartbeat_at = now() - interval '6 minutes' WHERE id = %s;", (job_id,)
    )


def job_row(connection, job_id: str):
    return connection.execute(
        """
        SELECT state, attempts, available_at > now(), claimed_by, last_error
        FROM job WHERE id = %s;
        """,
        (job_id,),
    ).fetchone()


def test_the_first_stale_sweep_does_not_defer_the_retry(connection):
    """⚠️ `04` §6.4 puts the sweep at the top of the poll precisely so a job
    abandoned by a closed laptop *lands in the very same drain that noticed it*,
    and `11` §7 tests that. The backoff added in #8 must not take that away, so
    it starts at the **second** sweep — one claim is `attempts = 1`, and "the
    laptop closed" is still the likely story.
    """
    job_id = queue_job(connection)
    claim_next_job(connection, owner="the-laptop-that-closed")
    go_stale(connection, job_id)

    sweep_stale_claims(connection)

    assert job_row(connection, job_id)[:3] == ("queued", 1, False)


def test_a_second_abandonment_sets_available_at_forward(connection):
    """`04` §6.4 calls `available_at` backoff — *a retry sets it forward rather
    than sleeping in the worker* — and until #8 nothing ever set it forward.

    ⚠️ Without this, a job that kills the worker is re-claimed by the very next
    poll, so the ceiling below would be spent in seconds and a **transient**
    failure would be burned through just as fast.
    """
    job_id = queue_job(connection)
    for _ in range(2):
        claim_next_job(connection, owner="a-worker-that-died")
        go_stale(connection, job_id)
        sweep_stale_claims(connection)

    assert job_row(connection, job_id)[:3] == ("queued", 2, True)
    assert claim_next_job(connection, owner="the-next-worker") is None


def test_a_job_that_keeps_killing_the_worker_is_given_up_on(connection):
    """⚠️ The infinite re-claim loop `00-status.md` § Carrying names, closed.

    A job that *raises* is already terminal — `drain` calls `fail_job` on the
    first one. This is the other kind: a job that takes the **process** down, so
    nothing ever gets to mark it anything. The claim goes stale, the sweep
    returns it, the next poll claims it, and it happens again — with `attempts`
    counting up and, until #8, nothing reading it.

    #8 is where it stopped being hypothetical: the handler now loads a 68 MB
    dictionary and tokenises up to 100,000 characters.
    """
    job_id = queue_job(connection)
    for _ in range(MAX_ATTEMPTS):
        connection.execute(
            "UPDATE job SET available_at = now() WHERE id = %s;", (job_id,)
        )
        claim_next_job(connection, owner="a-worker-that-died")
        go_stale(connection, job_id)
        sweep_stale_claims(connection)

    state, attempts, _, claimed_by, last_error = job_row(connection, job_id)
    assert (state, attempts) == ("failed", MAX_ATTEMPTS)
    assert claim_next_job(connection, owner="the-next-worker") is None

    # ⚠️ The owner survives, for the same reason a finished job's does: it is the
    # only thing left pointing at the machine that died.
    assert claimed_by == "a-worker-that-died"
    # ⚠️ `03` §13.4 and `03` §11: no source text, and no provider named. `10`
    # §6.2 reads this column straight onto the run row.
    assert "abandoned after 5 attempts" in last_error


def test_a_given_up_job_is_not_swept_back_into_the_queue(connection):
    """`failed` is terminal. A sweep matched on `state = 'claimed'` cannot see it
    — which is the same property that stops a finished job being resurrected.
    """
    job_id = queue_job(connection)
    for _ in range(MAX_ATTEMPTS):
        connection.execute("UPDATE job SET available_at = now() WHERE id = %s;", (job_id,))
        claim_next_job(connection, owner="a-worker-that-died")
        go_stale(connection, job_id)
        sweep_stale_claims(connection)

    assert sweep_stale_claims(connection) == 0
    assert job_row(connection, job_id)[0] == "failed"
