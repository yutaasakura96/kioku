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
   waiting. ⚠️ **No query.**
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
    drain: Callable[[psycopg.Connection], int],
    stop: Stoppable,
    channel: str = JOB_CHANNEL,
    block_timeout: float = BLOCK_TIMEOUT_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Run until `stop` is set. Reconnects forever; raises nothing routine."""
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
            drain(connection)

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
                    # Step 5.
                    drain(connection)
                # Step 6 is the absence of an `else` branch. Adding a poll here
                # would be a keepalive: every connection resets Neon's
                # scale-to-zero timer (verification §7.2), so a metronome query
                # spends the month's compute budget asking a question whose
                # answer arrives by notification anyway.
        except CONNECTION_LOST:
            sleep(backoff_delay(attempt))
            attempt += 1
        finally:
            _close_quietly(connection)


def _close_quietly(connection: psycopg.Connection) -> None:
    """A connection the server already tore down raises on close, and there is
    nothing to do about it — the next iteration opens a new one."""
    try:
        connection.close()
    except psycopg.Error:  # pragma: no cover - defensive
        pass
