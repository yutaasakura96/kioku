"""The loop's shape, with no database anywhere near it.

`03` §3.1 is seven numbered steps and **the order of two of them is the
decision** (ADR 0028): `LISTEN` first, *then* poll. Polling first opens a window
between the query returning and the subscription existing, in which a
notification lands with nobody listening.

⚠️ **That ordering is a property of the loop, not of Postgres**, so it is tested
here — against a fake connection that records what it was asked to do, in order
— and again in `test_reconnect.py` against a real one. The container test is the
one that proves it survives a real teardown; this one is the one that fails in
946 ms when somebody reorders two lines.

Three of the assertions below are written as traps rather than as readings:

- **The payload is never read** is enforced by a `Notify` whose `payload`
  property raises. An assertion that the loop "does not use the payload" can
  only be made by reading the code; this one fails the suite.
- **The timeout branch issues no query** is enforced by counting statements
  *and* drains across a timeout, not by inspecting the branch.
- **Reconnect resumes at `LISTEN`** is enforced by asserting the whole call log
  of the second connection, not just that `LISTEN` appears in it.

⚠️ Needs no Docker and no database. ADR 0038's three are the other file.
"""

from __future__ import annotations

import psycopg
import pytest

from loop import JOB_CHANNEL, backoff_delay, serve


class PoisonNotify:
    """A notification whose payload cannot be read without failing the test.

    ADR 0028: *the wake-up says the table is worth re-reading; the query decides
    what is there.* Reading the payload would also walk into Postgres's 8000-byte
    limit, which the design sidesteps by having nothing to send.
    """

    channel = JOB_CHANNEL

    @property
    def payload(self) -> str:  # pragma: no cover - raising is the point
        raise AssertionError(
            "the notification payload is never read (ADR 0028, `03` §3.1 step 5)"
        )


class FakeConnection:
    """Records statements and hands back a scripted `notifies()` generator.

    `wakeups` is one entry per blocking call: `True` yields a notification,
    `False` is the timeout expiring, and an `OperationalError` instance is
    raised from inside the generator — which is what Neon's scale-to-zero looks
    like from here (verification §9.2).
    """

    def __init__(self, log: list[str], wakeups: list[object]) -> None:
        self.log = log
        self.wakeups = list(wakeups)
        self.timeouts: list[float | None] = []
        self.closed = False

    def execute(self, statement: str) -> FakeConnection:
        self.log.append(statement)
        return self

    def notifies(self, timeout: float | None = None, stop_after: int | None = None):
        self.timeouts.append(timeout)
        if not self.wakeups:
            raise StopTheLoop
        wakeup = self.wakeups.pop(0)
        if isinstance(wakeup, BaseException):
            raise wakeup
        if wakeup:
            yield PoisonNotify()

    def close(self) -> None:
        self.closed = True
        self.log.append("close")


class StopTheLoop(Exception):
    """Ends a test once its script is spent. Never raised by the worker."""


class Stop:
    """`threading.Event`'s two-method shape, without the thread."""

    def __init__(self, after: int = 10_000) -> None:
        self.checks = 0
        self.after = after

    def is_set(self) -> bool:
        self.checks += 1
        return self.checks > self.after


def drain_recorder(log: list[str]):
    def drain(_conn: object) -> int:
        log.append("drain")
        return 0

    return drain


# ---------------------------------------------------------------------------
# The order, which is the decision
# ---------------------------------------------------------------------------


def test_subscribes_before_it_polls():
    log: list[str] = []
    conn = FakeConnection(log, wakeups=[])

    with pytest.raises(StopTheLoop):
        serve(lambda: conn, drain=drain_recorder(log), stop=Stop(), sleep=lambda _s: None)

    assert log[:2] == [f"LISTEN {JOB_CHANNEL}", "drain"]


def test_a_notification_drains_and_never_reads_the_payload():
    log: list[str] = []
    conn = FakeConnection(log, wakeups=[True])

    with pytest.raises(StopTheLoop):
        serve(lambda: conn, drain=drain_recorder(log), stop=Stop(), sleep=lambda _s: None)

    # LISTEN, the first poll, then the poll the notification caused. The
    # trailing close is the script running out, not the worker giving up.
    assert log == [f"LISTEN {JOB_CHANNEL}", "drain", "drain", "close"]


def test_the_timeout_branch_issues_no_query_and_no_poll():
    """`03` §3.1 step 6, and it is a cost decision rather than a style one.

    Every connection resets Neon's scale-to-zero timer (verification §7.2), so a
    metronome query would hold the compute awake to ask a question whose answer
    arrives by notification anyway.
    """
    log: list[str] = []
    conn = FakeConnection(log, wakeups=[False, False, False])

    with pytest.raises(StopTheLoop):
        serve(lambda: conn, drain=drain_recorder(log), stop=Stop(), sleep=lambda _s: None)

    # Three timeouts expired and not one of them added a statement or a poll.
    assert log == [f"LISTEN {JOB_CHANNEL}", "drain", "close"]
    assert conn.timeouts == [5.0, 5.0, 5.0, 5.0]


def test_the_block_timeout_is_what_makes_shutdown_responsive():
    """Step 6's other half: the timeout exists so a stop signal is noticed."""
    log: list[str] = []
    conn = FakeConnection(log, wakeups=[False, False, False])

    # Two `is_set()` calls get through — the one before the first block and the
    # one after it — and the third ends the loop.
    serve(lambda: conn, drain=drain_recorder(log), stop=Stop(after=2), sleep=lambda _s: None)

    assert log == [f"LISTEN {JOB_CHANNEL}", "drain", "close"]
    assert conn.closed


# ---------------------------------------------------------------------------
# Reconnect
# ---------------------------------------------------------------------------


def test_reconnect_resumes_at_listen_and_then_polls():
    """ADR 0028's step 7 into step 2, **not** into step 3.

    The notifications fired while the connection was down are gone rather than
    delayed — Neon's own compatibility page — so the poll after the resubscribe
    is the thing that catches the work up.
    """
    log: list[str] = []
    first = FakeConnection(log, wakeups=[psycopg.OperationalError("connection lost")])
    second = FakeConnection(log, wakeups=[])
    connections = iter([first, second])

    with pytest.raises(StopTheLoop):
        serve(
            lambda: next(connections),
            drain=drain_recorder(log),
            stop=Stop(),
            sleep=lambda _s: None,
        )

    assert log == [
        f"LISTEN {JOB_CHANNEL}",
        "drain",
        "close",
        f"LISTEN {JOB_CHANNEL}",
        "drain",
        "close",
    ]


def test_an_interface_error_is_a_lost_connection_too():
    """⚠️ **The half of the drop that is easy to miss.**

    psycopg raises `OperationalError` when the *server* ends the session and
    `InterfaceError` on the next statement issued against the object it left
    behind — and `InterfaceError` is a sibling of `DatabaseError`, not a kind of
    `OperationalError`. A loop that catches only the second survives the drop it
    saw and dies on the one it did not, which on Neon Free — where the compute
    suspends every five idle minutes — is a worker that stops overnight.
    """
    log: list[str] = []
    first = FakeConnection(log, wakeups=[psycopg.InterfaceError("connection already closed")])
    second = FakeConnection(log, wakeups=[])
    connections = iter([first, second])

    with pytest.raises(StopTheLoop):
        serve(
            lambda: next(connections),
            drain=drain_recorder(log),
            stop=Stop(),
            sleep=lambda _s: None,
        )

    assert log.count(f"LISTEN {JOB_CHANNEL}") == 2


def test_a_connection_that_cannot_be_made_backs_off_and_retries():
    slept: list[float] = []
    attempts = {"n": 0}

    def connect():
        attempts["n"] += 1
        if attempts["n"] < 4:
            raise psycopg.OperationalError("the compute is asleep")
        raise StopTheLoop

    with pytest.raises(StopTheLoop):
        serve(connect, drain=lambda _c: 0, stop=Stop(), sleep=slept.append)

    assert slept == [1.0, 2.0, 4.0]


def test_a_working_connection_resets_the_backoff():
    """Otherwise an eight-hour session ends up sleeping 30 s after every
    scale-to-zero, and *time-to-first-review* pays for it (`03` §3.3)."""
    log: list[str] = []
    slept: list[float] = []
    dropped = psycopg.OperationalError("terminating connection due to administrator command")
    connections = iter(
        [
            FakeConnection(log, wakeups=[dropped]),
            FakeConnection(log, wakeups=[dropped]),
            FakeConnection(log, wakeups=[]),
        ]
    )

    with pytest.raises(StopTheLoop):
        serve(
            lambda: next(connections),
            drain=drain_recorder(log),
            stop=Stop(),
            sleep=slept.append,
        )

    assert slept == [1.0, 1.0]


# ---------------------------------------------------------------------------
# The backoff itself
# ---------------------------------------------------------------------------


def test_backoff_doubles_and_is_capped_at_thirty_seconds():
    """`03` §3.3: bounded, capped at 30 s, for as long as the process runs.

    ⚠️ There is no give-up branch and that is deliberate — the process is
    started and stopped with the reader's working session (ADR 0022), so the
    thing that ends it is the reader, not a retry budget.
    """
    delays = [backoff_delay(attempt) for attempt in range(10)]

    assert delays == [1.0, 2.0, 4.0, 8.0, 16.0, 30.0, 30.0, 30.0, 30.0, 30.0]
    assert max(delays) <= 30.0
