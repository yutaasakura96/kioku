"""The `job` table, as the worker sees it — `04` §6.4, `03` §3.2, ADR 0028.

**A claim is a row state with an owner and a timestamp, not a held lock.** A
lock held for the life of a job dies with the connection and tells nobody, and
the case this design exists for is the laptop closing mid-job: the claim is
still visible, it is visibly stale, and a timed rule releases it.

⚠️ **The stale-claim sweep runs here, in the worker.** ADR 0022 forbids
depending on a Vercel-only feature and Vercel Cron is named in that list. The
sweep is a query at the top of the poll, which the worker is already doing on
every connect and reconnect (`03` §3.1), so it costs nothing extra.

⚠️ **Nothing in this module issues DDL.** Drizzle owns every migration and the
worker reads and writes rows (`03` §4.2).
"""

from __future__ import annotations

import os
import socket
import time
from dataclasses import dataclass
from typing import Callable

import psycopg

from db import CONNECTION_LOST

#: `04` §6.4 step 4. Five minutes, and the number is the document's.
STALE_AFTER = "5 minutes"

#: ⚠️ **The ceiling `attempts` did not have until #8** (`00-status.md` § Carrying).
#:
#: A job that *kills the worker* — rather than raising, which `drain` already
#: turns into a `failed` job — leaves its claim behind. The sweep then returns it
#: to `queued`, the next poll claims it, and it kills the worker again: an
#: infinite loop with `attempts` counting up and nothing reading it. #7 could not
#: produce such a job because its handler was bookkeeping. #8's handler loads a
#: 68 MB dictionary and tokenises up to 100,000 characters, which is the first
#: work in this project that can take the process down with it.
#:
#: Five, because the failure this protects against is not transient and four
#: retries is already generous for one that is. ⚠️ It is a **sweep-time** rule:
#: `drain`'s own `fail_job` is terminal on the first raise and stays that way.
MAX_ATTEMPTS = 5

#: ⚠️ `04` §6.4 calls `available_at` backoff — *"a retry sets it forward rather
#: than sleeping in the worker"* — and until #8 nothing ever set it forward.
#:
#: Doubling from a minute, capped at thirty. ⚠️ **The cap matters more than the
#: base**: nothing in this loop is scheduled to come back for a future-dated job
#: (`03` §3.1 step 6 forbids the timeout branch from issuing a query), so the
#: deferral is collected by the next notification or the next reconnect. A long
#: cap would turn "deferred" into "forgotten until the reader submits something
#: else". **The remaining half of this is open and named** — `00-status.md`
#: § Next carries it.
FIRST_RETRY_DELAY = "1 minute"
MAX_RETRY_DELAY = "30 minutes"


@dataclass(frozen=True)
class ClaimedJob:
    """What a claim hands back. `kind` is `'ingest'` or `'resume'` (`04` §6.4)."""

    id: str
    kind: str
    ingestion_id: str
    attempts: int
    claimed_by: str


def worker_id() -> str:
    """`04` §6.4 asks for *hostname plus process start time*; this is
    `hostname:pid:seconds`, and the pid is the third part rather than a
    substitute for either.

    Hostname alone would collide across two runs on the same laptop and make
    `claimed_by` useless for the one question it answers — *which run of the
    worker was holding this when it died*. ⚠️ The timestamp is **call** time, and
    it is start time only because `__main__` calls this once before the loop; a
    second call would mint a second identity and the sweep would then be the only
    thing able to free what the first one claimed.
    """
    return f"{socket.gethostname()}:{os.getpid()}:{int(time.time())}"


# `04` §6.4 steps 1 and 2, **as one statement**. The document puts the select and
# the update "in the same transaction"; one statement is the strongest form of
# that and the only one available on an autocommit connection, where a separate
# `SELECT … FOR UPDATE` would release its lock before the `UPDATE` ran and hand
# the same row to two workers.
#
# ⚠️ `SKIP LOCKED` and not `NOWAIT` or a plain lock: Postgres's own docs name
# `SKIP LOCKED` for exactly this queue pattern and warn it is unsuitable for
# anything else (verification §6.3). Without it a second worker *blocks* on a row
# the first is claiming instead of taking the next one.
#
# The row lock is held for the length of this `UPDATE` and not the length of the
# job — `03` §3.2's requirement, as a mechanism rather than as a promise.
_CLAIM = """
UPDATE job SET
  state = 'claimed',
  claimed_by = %(owner)s,
  claimed_at = now(),
  heartbeat_at = now(),
  attempts = attempts + 1
WHERE id = (
  SELECT id FROM job
  WHERE state = 'queued' AND available_at <= now()
  ORDER BY available_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING id, kind, ingestion_id, attempts, claimed_by;
"""


def claim_next_job(connection: psycopg.Connection, *, owner: str) -> ClaimedJob | None:
    """Claim one job, or `None` when there is nothing due."""
    row = connection.execute(_CLAIM, {"owner": owner}).fetchone()
    if row is None:
        return None
    return ClaimedJob(id=row[0], kind=row[1], ingestion_id=row[2], attempts=row[3], claimed_by=row[4])


#: ⚠️ Never source text and never the provider's name (`03` §13.4, `03` §11) —
#: this column is read straight onto the run row (`10` §6.2).
ABANDONED = (
    "abandoned after {attempts} attempts: the worker stopped before finishing it "
    "each time. Resubmitting will not help until the cause is found."
)


def sweep_stale_claims(
    connection: psycopg.Connection,
    *,
    stale_after: str = STALE_AFTER,
    max_attempts: int = MAX_ATTEMPTS,
) -> int:
    """Return every visibly abandoned claim to the queue, or give up on it.
    Answers how many rows it touched.

    ⚠️ **Matched on `state = 'claimed'`, never on `claimed_by IS NOT NULL`.**
    A finished job keeps its owner forever — it is the audit line of who ran it —
    so a sweep written the second way resurrects every completed run the first
    time it is asked to look.

    ⚠️ **Two branches in one statement, and #8 added the second.** A claim goes
    stale for two different reasons and they are indistinguishable from here: the
    laptop closed mid-job, or the job killed the worker. The first deserves the
    retry this sweep exists for; the second, repeated, is the infinite re-claim
    loop `00-status.md` § Carrying names. `attempts` is what separates them **over
    time** rather than in the moment, which is why the ceiling lives here and not
    in `drain`.

    ⚠️ **The retry is deferred, not immediate** — `04` §6.4's own words for
    `available_at`. Without it a job that kills the worker is re-claimed by the
    very next poll, so the ceiling would be reached in seconds and a *transient*
    failure would be spent through just as fast.

    ⚠️ **A given-up job keeps `claimed_by`**, for the same reason a finished one
    does: it is the record of which run of the worker was holding it, and it is
    the only thing left pointing at the machine that died.
    """
    result = connection.execute(
        """
        UPDATE job SET
          state = CASE WHEN attempts >= %(max_attempts)s THEN 'failed' ELSE 'queued' END,
          last_error = CASE WHEN attempts >= %(max_attempts)s THEN %(abandoned)s
                            ELSE last_error END,
          finished_at = CASE WHEN attempts >= %(max_attempts)s THEN now()
                             ELSE finished_at END,
          -- ⚠️ **The first retry is immediate, and that is a documented
          -- property rather than an oversight.** `04` §6.4 puts the sweep at the
          -- top of the poll so that a job abandoned by a closed laptop *lands in
          -- the very same drain that noticed it*, and `11` §7 tests exactly
          -- that. `attempts` is 1 after a single claim, so the deferral starts
          -- at the second sweep — the point at which "the laptop closed" has
          -- stopped being the likely story.
          --
          -- ⚠️ `least(…)` and not a bare `power`: the doubling is unbounded, and
          -- the thing that collects a deferred job is the next notification or
          -- the next reconnect, so an hour-long deferral is indistinguishable
          -- from losing the job.
          available_at = CASE
            WHEN attempts >= %(max_attempts)s THEN available_at
            WHEN attempts <= 1 THEN now()
            ELSE now() + least(
              %(first_delay)s::interval * power(2, attempts - 2),
              %(max_delay)s::interval
            )
          END,
          claimed_by = CASE WHEN attempts >= %(max_attempts)s THEN claimed_by ELSE NULL END,
          claimed_at = CASE WHEN attempts >= %(max_attempts)s THEN claimed_at ELSE NULL END,
          heartbeat_at = NULL
        WHERE state = 'claimed' AND heartbeat_at < now() - %(stale_after)s::interval;
        """,
        {
            "stale_after": stale_after,
            "max_attempts": max_attempts,
            "abandoned": ABANDONED.format(attempts=max_attempts),
            "first_delay": FIRST_RETRY_DELAY,
            "max_delay": MAX_RETRY_DELAY,
        },
    )
    return result.rowcount


def heartbeat(connection: psycopg.Connection, job: ClaimedJob) -> None:
    """Say the laptop is still open — `04` §6.4 step 3.

    ⚠️ **There is no background thread and no 30-second timer.** `04` §6.4 says
    *every 30 seconds while working*, and the only thing long enough to need a
    cadence is the per-chunk loop, which arrives with #8 — it calls this between
    chunks, which is the cadence a chunk takes. A timer would need its own
    connection (psycopg's is not safe to share across threads mid-statement),
    and that is a decision to make against a measured chunk duration rather than
    one to guess at now. **Nothing here declares an interval it does not keep.**
    """
    _end_claim(connection, job, "UPDATE job SET heartbeat_at = now()", state="claimed")


def finish_job(connection: psycopg.Connection, job: ClaimedJob) -> None:
    _end_claim(connection, job, "UPDATE job SET state = 'done', finished_at = now()")


def fail_job(connection: psycopg.Connection, job: ClaimedJob, error: str) -> None:
    """⚠️ `error` never contains source text (`03` §13.4), and never names the
    model provider — `03` §11 keeps the provider out of what the reader sees,
    and this column is read straight onto the run row (`10` §6.2)."""
    _end_claim(
        connection,
        job,
        "UPDATE job SET state = 'failed', finished_at = now(), last_error = %(error)s",
        error=error,
    )


def _end_claim(
    connection: psycopg.Connection,
    job: ClaimedJob,
    update: str,
    *,
    state: str | None = None,
    error: str | None = None,
) -> None:
    """⚠️ **Every write to a claimed job is matched on the claim, not just the
    id.**

    At one worker this is free. At two it is the difference between correct and
    silently wrong: if a run outlives the five-minute heartbeat window, the sweep
    returns its job to `queued` and another worker claims it — and the first
    worker, still going, would then stamp `done` over a live claim and hand the
    same *ingestion* to two pipelines. ADR 0015's revisit condition **is** a
    second worker, and this is one of the two places it bites.
    """
    clause = " AND state = %(state)s" if state else ""
    connection.execute(
        f"{update} WHERE id = %(id)s AND claimed_by = %(owner)s{clause};",
        {"id": job.id, "owner": job.claimed_by, "state": state, "error": error},
    )


def drain(
    connection: psycopg.Connection,
    *,
    owner: str,
    handle: Callable[[psycopg.Connection, ClaimedJob], None],
) -> int:
    """`03` §3.1 step 3 — **the poll**. Sweep, then claim until empty.

    Returns how many jobs were handled.

    ⚠️ **The sweep is first.** `04` §6.4 puts it at the top of the poll, which is
    what makes a job abandoned by a closed laptop land in the very same drain
    that noticed it rather than waiting for the next wake-up.

    ⚠️ **`handle` has no default and lives nowhere near here.** What a claimed
    job *means* is `runs.run_ingestion`, and `__main__` is what puts the two
    together — this module is the job table and nothing else, so it imports
    nothing from the module that reads the tables a job points at.

    ⚠️ **It empties the queue rather than taking one job.** Three jobs written
    while the worker was away are at most one notification, and possibly none
    (ADR 0028) — so the poll has to take everything it finds or the catch-up
    that makes notifications optional does not happen.
    """
    sweep_stale_claims(connection)

    handled = 0
    while (job := claim_next_job(connection, owner=owner)) is not None:
        try:
            handle(connection, job)
        except CONNECTION_LOST:
            # ⚠️ **The one exception that must not become a failed job.** A
            # dropped connection is `03` §3.1 step 7's business; marking the job
            # `failed` would burn a run for something that was never the run's
            # fault. The claim goes stale instead and the sweep returns it.
            raise
        except Exception as error:  # noqa: BLE001 - a bad job must not stop the queue
            fail_job(connection, job, str(error))
        else:
            finish_job(connection, job)
        handled += 1

    return handled
