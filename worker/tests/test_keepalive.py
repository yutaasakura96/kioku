"""The heartbeat a model request sends while it streams — ADR 0061.

⚠️ **The throttle is the whole of what is tested here.** The stream calls the
keepalive on every event, which can be many a second; the query it issues must
land at most once per interval, and the interval must sit inside both
five-minute limits ADR 0061 names.

Needs neither Docker nor a database.
"""

from __future__ import annotations

import provider
from jobs import KEEPALIVE_EVERY_SECONDS, Keepalive


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_nothing_is_written_before_the_interval_has_passed() -> None:
    clock = Clock()
    beats: list[float] = []
    keepalive = Keepalive(lambda: beats.append(clock.now), every=60.0, clock=clock)

    for second in range(60):
        clock.now = float(second)
        keepalive()

    assert beats == []


def test_it_beats_once_per_interval_however_many_events_arrive() -> None:
    clock = Clock()
    beats: list[float] = []
    keepalive = Keepalive(lambda: beats.append(clock.now), every=60.0, clock=clock)

    # Ten events a second for three and a half minutes.
    for tenth in range(2100):
        clock.now = tenth / 10
        keepalive()

    assert beats == [60.0, 120.0, 180.0]


def test_the_longest_gap_between_heartbeats_is_inside_five_minutes() -> None:
    """⚠️ **The arithmetic ADR 0061 rests on.** A keepalive only fires on an
    event, and the read timeout bounds the gap between events. Both the stale
    claim (`jobs.STALE_AFTER`) and Neon Free's scale-to-zero are five minutes.
    """
    assert KEEPALIVE_EVERY_SECONDS + provider.TIMEOUT_SECONDS < 300
