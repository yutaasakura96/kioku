"""ADR 0038's third: a `LISTEN` torn down, and recovered by the poll.

`11` §7 states it: *the connection drops, notifications fire while nobody is
listening, the worker reconnects — and `LISTEN` happens before the poll. Polling
first leaves a window where a notification lands unheard.*

⚠️ **This is the one test that can tell the order apart from the outside.**
`test_loop.py` asserts it against a fake connection, which is fast and catches a
reordering the moment it is typed; what it cannot do is prove the subscription
is real. Here the drain asks the **server** what this session is listening to,
through `pg_listening_channels()`, so the assertion is Postgres's answer rather
than the worker's own bookkeeping.

The drop is real too: another session calls `pg_terminate_backend` on the
worker's connection, which is the same error Neon produces when a compute
suspends under an idle connection — `terminating connection due to administrator
command` (verification §7.2).

⚠️ Without Docker this goes red with the reason in `conftest.py` (ADR 0038).
"""

from __future__ import annotations

import threading
import time

import psycopg
import pytest

from loop import JOB_CHANNEL, serve
from jobs import drain as real_drain
from runs import run_ingestion
from test_runs import make_run, status_of

APPLICATION_NAME = "kioku-worker-under-test"
DEADLINE_SECONDS = 30


def wait_for(predicate, what: str) -> None:
    deadline = time.monotonic() + DEADLINE_SECONDS
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError(f"timed out waiting for {what}")


def listening_channels(connection: psycopg.Connection) -> list[str]:
    return [row[0] for row in connection.execute("SELECT pg_listening_channels();").fetchall()]


def test_on_reconnect_the_subscription_happens_before_the_poll(connection, postgres_dsn):
    subscriptions: list[list[str]] = []
    drains = threading.Semaphore(0)
    stop = threading.Event()

    def connect() -> psycopg.Connection:
        return psycopg.connect(
            postgres_dsn, autocommit=True, application_name=APPLICATION_NAME
        )

    def recording_drain(worker_connection: psycopg.Connection) -> int:
        # ⚠️ Asked of the server, on the worker's own connection, at the moment
        # the poll happens. An empty list here is `LISTEN` running second.
        subscriptions.append(listening_channels(worker_connection))
        handled = real_drain(worker_connection, owner="the-worker", handle=run_ingestion)
        drains.release()
        return handled

    worker = threading.Thread(
        target=serve,
        args=(connect,),
        kwargs={
            "drain": recording_drain,
            "stop": stop,
            # `03` §3.3's backoff, compressed. The doubling and the 30 s cap are
            # `test_loop.py`'s to assert; what matters here is that it reconnects.
            "sleep": lambda seconds: time.sleep(min(seconds, 0.05)),
            "block_timeout": 0.5,
        },
        daemon=True,
    )
    worker.start()

    try:
        # Step 2 then step 3, on the first connection.
        assert drains.acquire(timeout=DEADLINE_SECONDS), "the worker never polled"
        assert subscriptions[0] == [JOB_CHANNEL]

        # The session ends — Neon's scale-to-zero, played by another session.
        terminated = connection.execute(
            """
            SELECT pg_terminate_backend(pid) FROM pg_stat_activity
            WHERE application_name = %s AND pid <> pg_backend_pid();
            """,
            (APPLICATION_NAME,),
        ).fetchall()
        assert terminated, "the worker's connection was not found to terminate"

        # ⚠️ **The work and the notification, both while nobody is listening.**
        # Neon's own compatibility page: notifications "only exist for the
        # duration of the current session and are lost when the session ends" —
        # so this `NOTIFY` goes nowhere, by design, and the job row is the only
        # evidence left that there is anything to do.
        ingestion_id, job_id = make_run(connection, chunks=2, title="留守中")
        connection.execute("SELECT pg_notify(%s, '');", (JOB_CHANNEL,))

        # Step 7 into step 2 into step 3.
        assert drains.acquire(timeout=DEADLINE_SECONDS), "the worker never reconnected"
        wait_for(
            lambda: status_of(connection, ingestion_id) != "queued",
            "the catch-up poll to find the job the lost notification was about",
        )
    finally:
        stop.set()
        worker.join(timeout=DEADLINE_SECONDS)

    # Every poll this worker ever made was made on a subscribed connection —
    # including the first one after the reconnect, which is the one ADR 0028
    # names as the easy thing to get backwards.
    assert subscriptions[1:] == [[JOB_CHANNEL]] * len(subscriptions[1:])
    assert len(subscriptions) >= 2

    state = connection.execute("SELECT state FROM job WHERE id = %s;", (job_id,)).fetchone()[0]
    assert state == "done", "the poll after the resubscribe is what makes NOTIFY optional"
