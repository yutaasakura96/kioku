"""Which connection string the worker takes, and which one it refuses.

⚠️ Needs no Docker and no database — these are string checks, a refusal, and
since ADR 0073 the keepalive parameters that go beside the string. They are here
because the failures they prevent share a shape and it is the worst one in the
tier: a worker on the pooled endpoint **starts, connects, claims nothing and
never wakes** (`03` §4.1), and a worker without keepalives **keeps a connection
that stopped answering and waits on it forever** (ADR 0073). Nothing in the run
list distinguishes either from a worker nobody started.

⚠️ **This said "two string checks and a refusal" until 2026-09-24.** The
socket-level half of ADR 0073 — that libpq does not silently ignore these three
on macOS — needs a real connection and lives in `test_half_open.py`.
"""

from __future__ import annotations

import pytest

import db
from db import DIRECT_URL_ENV, MisconfiguredWorker, refuse_pooled, require_direct_url

DIRECT = "postgresql://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/kioku?sslmode=require"
POOLED = "postgresql://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/kioku?sslmode=require"


def test_the_direct_string_is_taken_verbatim():
    """ADR 0027: no `options=endpoint%3D…` rewriting, no hand-edited TLS
    parameters. Whatever Neon issued is what psycopg is handed."""
    assert require_direct_url({DIRECT_URL_ENV: DIRECT}) == DIRECT


def test_the_pooled_string_is_refused_by_name():
    with pytest.raises(MisconfiguredWorker, match="pooled endpoint"):
        refuse_pooled(POOLED)


def test_a_missing_string_names_the_variable_and_which_endpoint():
    with pytest.raises(MisconfiguredWorker, match=DIRECT_URL_ENV):
        require_direct_url({})


def test_pooler_in_a_password_or_a_query_string_is_not_the_hostname():
    """⚠️ The guard reads the part before `?`, so a database named for the
    project's pooler notes, or a generated password containing the substring,
    does not lock the worker out of its own database."""
    assert refuse_pooled(DIRECT + "&application_name=no-pooler-here") == (
        DIRECT + "&application_name=no-pooler-here"
    )


# ---------------------------------------------------------------------------
# ADR 0073 — the keepalives, and the two things that could quietly undo them.
# ---------------------------------------------------------------------------


def test_the_keepalives_are_passed_beside_the_string_and_not_written_into_it(monkeypatch):
    """⚠️ **ADR 0027 and ADR 0073 have to hold at the same time**, and this is
    the assertion that says they do.

    The obvious way to set a connection parameter is to append it to the URL,
    and that is exactly the string-editing ADR 0027 forbids — once the worker
    is willing to rewrite the string it was issued, the next thing appended is
    an `options=endpoint%3D…` somebody read on a forum. psycopg merges keyword
    arguments into the conninfo it hands libpq, so the string can stay byte for
    byte what Neon issued while the parameters still arrive.
    """
    seen = {}

    def spy(conninfo, **kwargs):
        seen["conninfo"] = conninfo
        seen["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(db.psycopg, "connect", spy)
    db.connect(DIRECT)

    assert seen["conninfo"] == DIRECT, "the string Neon issued was edited"
    assert seen["kwargs"]["autocommit"] is True
    assert seen["kwargs"]["keepalives"] == 1
    assert seen["kwargs"]["keepalives_idle"] == db.KEEPALIVE_IDLE_SECONDS
    assert seen["kwargs"]["keepalives_interval"] == db.KEEPALIVE_INTERVAL_SECONDS
    assert seen["kwargs"]["keepalives_count"] == db.KEEPALIVE_COUNT


def test_a_keepalives_setting_in_the_issued_string_does_not_win(monkeypatch):
    """⚠️ **`keepalives=0` disables the other three outright** — PG 18 §32.1
    says each of them is *"ignored … if keepalives are disabled"* — so a string
    that arrived carrying it would turn this fix off without failing anything.

    Measured 2026-09-24 rather than assumed: psycopg's own `make_conninfo` lets
    the keyword argument override the string, which is the direction this needs
    and the opposite of what a merge could plausibly have done. The refusal
    guard cannot catch this one, because such a string is not *wrong* — it is
    a valid connection string that quietly costs the worker its only detector.
    """
    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    merged = conninfo_to_dict(
        make_conninfo(DIRECT + "&keepalives=0", **db.KEEPALIVE_PARAMETERS)
    )
    assert merged["keepalives"] == "1"
    assert merged["keepalives_idle"] == str(db.KEEPALIVE_IDLE_SECONDS)


def test_the_detection_window_is_about_a_minute():
    """⚠️ **The number is the decision, so it is asserted rather than left in a
    docstring.** ADR 0073 chose ~60 s by reading it against the two intervals
    that already exist: the loop's 5 s block, which means a dead socket is
    noticed within a block of being declared dead, and Neon's ~315 s idle
    teardown, which a detector slower than about five minutes would never beat.

    A routine bump to any one of the three moves the window and this says so.
    """
    window = (
        db.KEEPALIVE_IDLE_SECONDS
        + db.KEEPALIVE_INTERVAL_SECONDS * db.KEEPALIVE_COUNT
    )
    assert window == 60
    assert window < 315, (
        "a detector slower than Neon's own idle teardown detects nothing: the "
        "reconnect would always get there first"
    )
