"""The worker's loop — `03` §3.1, ADR 0028.

**The job table is the truth and `NOTIFY` only shortens latency.** Nothing here
is allowed to depend on a notification arriving: Neon's Free plan cannot disable
scale-to-zero, the compute suspends after five minutes of inactivity, and Neon's
own compatibility page says notifications and listeners "only exist for the
duration of the current session and are lost when the session ends"
(verification §9.2). So notifications fired while the worker was away are gone
rather than delayed, and the poll after every connect is what catches them up.

The seven steps, in order:

1. Connect on the **direct** connection string, `autocommit=True` — `db.py`.
2. **`LISTEN` first.**
3. **Then poll** the job table for unclaimed work, and drain it.
4. Block on `notifies(timeout=…)`.
5. On a notification — poll and drain. ⚠️ **The payload is not read.**
6. On the timeout expiring — check for a shutdown signal, and go back to
   waiting. ⚠️ **No query** — unless the last drain reported a future-dated
   row and its time has come, in which case drain once (ADR 0072).
7. On a connection error — reconnect, and resume at step 2.

⚠️ **Steps 2 and 3 are in that order and the order is the decision.** Polling
first leaves a window between the query returning and the subscription existing
in which a notification lands with nobody listening. ADR 0028 names this as the
easy thing to get backwards, which is why it is asserted twice — in
`tests/test_loop.py` against a fake connection, and in `tests/test_reconnect.py`
against a real Postgres with a real teardown.

⚠️ **This module issues exactly one statement of its own** — the `LISTEN`. Every
other query is `drain`'s, which is `runs.drain` in the process and an injected
recorder in the tests. That is what makes "the timeout branch issues no query"
a testable sentence rather than a promise.

⚠️ **Step 6's exception is ADR 0072, and it is a deadline rather than a timer.**
A `job` can be future-dated — the sweep defers a retry (ADR 0046) — and until
#37 nothing came back for one: a deferred job waited for the next notification
or the next reconnect, which cost a live import 28 idle minutes. The drain now
answers *how long until the next future-dated row*, the loop holds it as a
deadline, and one drain happens when it passes. **The rule that survives is *no
query on a timer***, which is what step 6 always meant: a metronome queries on
every expiry, and this queries once per deferral.

⚠️ **The block timeout did not change and was never the problem.** Every
statement of this fix before it was built said *a shorter block timeout*, and
there was nothing to shorten: the block is five seconds and a deferral is one to
thirty minutes, so the loop was already waking twelve times a minute and
discarding every wake-up. Only the deadline was missing.
"""

from __future__ import annotations

import time
from typing import Callable, Protocol

import psycopg

from db import CONNECTION_LOST

#: The channel, and it is a **cross-language constant**: the app emits it from
#: TypeScript (`server/utils/ingest/notify.ts`) and the worker subscribes to it
#: from Python. ⚠️ A mismatch is silent — the worker simply never wakes, and the
#: job table still gets drained on the next connect — so
#: `test/unit/job-channel.test.ts` asserts the two spellings against each other.
JOB_CHANNEL = "kioku_job"

#: How long a block lasts before the loop checks whether it has been asked to
#: stop. ⚠️ **It is not a poll interval.** Nothing is queried when it expires;
#: the timeout exists so `Ctrl-C` is noticed within a few seconds rather than
#: whenever the next notification happens to arrive.
BLOCK_TIMEOUT_SECONDS = 5.0

#: `03` §3.3. Bounded, and the cap is the number in the document.
FIRST_BACKOFF_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 30.0


class Stoppable(Protocol):
    def is_set(self) -> bool: ...


def backoff_delay(attempt: int) -> float:
    """Doubling, capped at 30 s — `03` §3.3.

    ⚠️ **There is no give-up branch.** The worker reconnects "for as long as the
    process is running", and the process is started and stopped with the
    reader's working session (ADR 0022): the thing that ends it is the reader,
    not a retry budget. If the cost experiment comes back badly, `03` §3.3 says
    the lever is this number, not the architecture.
    """
    return min(FIRST_BACKOFF_SECONDS * (2**attempt), MAX_BACKOFF_SECONDS)


def serve(
    connect: Callable[[], psycopg.Connection],
    *,
    drain: Callable[[psycopg.Connection], float | None],
    stop: Stoppable,
    channel: str = JOB_CHANNEL,
    block_timeout: float = BLOCK_TIMEOUT_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    on_connection_lost: Callable[[BaseException], None] = lambda _error: None,
) -> None:
    """Run until `stop` is set. Reconnects forever; raises nothing routine.

    ⚠️ **`drain` answers the wait until the next future-dated row**, in seconds,
    or `None` when nothing is deferred (ADR 0072). It is the only thing this
    loop learns from a drain — how many jobs were handled is `jobs.drain`'s
    answer to its own caller, and the loop has never had a use for it.

    ⚠️ **`on_connection_lost` hears only about a connection that was open**
    (ADR 0061), not about each failed attempt to open one — the backoff while
    the laptop has no network would otherwise report every thirty seconds.

    ⚠️ **`clock` is `time.monotonic` and the tests own it.** Python's `time`
    documentation does not say whether it advances while macOS is suspended — it
    says only that macOS calls `mach_absolute_time()`, and the one place suspend
    is addressed is `CLOCK_BOOTTIME`, which is Linux-only (read 2026-09-23). The
    design does not need the answer: a deadline that fires early costs one
    indexed query that finds nothing due, and a deadline that fires late is
    overtaken by the reconnect that waking from suspend causes anyway.
    """
    attempt = 0

    while not stop.is_set():
        try:
            connection = connect()
        except CONNECTION_LOST:
            # Step 7 with nothing to resume from yet: the compute is asleep, or
            # the laptop has no network. Both are ordinary here.
            sleep(backoff_delay(attempt))
            attempt += 1
            continue

        try:
            # Step 2, and it is first. Every reconnect comes back through here
            # before it queries anything.
            connection.execute(f"LISTEN {channel}")

            # Step 3 — the catch-up poll. This is the one that makes the
            # notification optional, and the one that runs the stale-claim sweep
            # (`04` §6.4: the sweep runs in the worker, at the top of its poll).
            #
            # ⚠️ **The deadline is read here and nowhere else**, so it belongs to
            # this connection: a reconnect re-reads it rather than inheriting a
            # deadline measured against a connection that is gone.
            deadline = _deadline_from(drain(connection), clock)

            # A connection that subscribed and polled is a working one, so the
            # next drop starts its backoff from the bottom again rather than
            # from wherever the last outage left it (`03` §3.3).
            attempt = 0

            while not stop.is_set():
                woken = False
                # ⚠️ The loop variable is deliberately unused. ADR 0028: the
                # wake-up says the table is worth re-reading and the query
                # decides what is there, which is also why there is no payload
                # to outgrow Postgres's 8000-byte limit.
                for _notification in connection.notifies(
                    timeout=block_timeout, stop_after=1
                ):
                    woken = True

                if woken:
                    # Step 5. ⚠️ A notification that empties the queue can still
                    # leave a deferred row behind it — the sweep runs at the top
                    # of every drain — so this path arms the deadline too.
                    deadline = _deadline_from(drain(connection), clock)
                elif deadline is not None and clock() >= deadline:
                    # Step 6's one exception — ADR 0072. **Once per deferral,
                    # never per timeout**: the drain that collects the job is
                    # also the drain that says when the next one is due, so an
                    # empty answer puts this branch back to silence.
                    deadline = _deadline_from(drain(connection), clock)
                # Step 6 otherwise stays the absence of a branch. A poll on every
                # expiry would be a keepalive: every connection resets Neon's
                # scale-to-zero timer (verification §7.2), so a metronome query
                # spends the month's compute budget asking a question whose
                # answer arrives by notification anyway.
        except CONNECTION_LOST as error:
            on_connection_lost(error)
            sleep(backoff_delay(attempt))
            attempt += 1
        finally:
            _close_quietly(connection)


def _deadline_from(
    deferred_for: float | None, clock: Callable[[], float]
) -> float | None:
    """Turn *seconds until the next future-dated row* into a deadline on this
    loop's clock, or `None` when nothing is deferred — ADR 0072.

    ⚠️ **The wait arrives as an interval, not as a timestamp**, because the
    worker runs on a laptop and the database does not. A clock skew of a few
    seconds between the two would otherwise be a deadline firing early or late
    for a reason invisible from either end.
    """
    if deferred_for is None:
        return None
    return clock() + max(deferred_for, 0.0)


def _close_quietly(connection: psycopg.Connection) -> None:
    """A connection the server already tore down raises on close, and there is
    nothing to do about it — the next iteration opens a new one."""
    try:
        connection.close()
    except psycopg.Error:  # pragma: no cover - defensive
        pass
