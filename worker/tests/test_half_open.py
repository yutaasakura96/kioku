"""ADR 0073: the keepalives libpq is allowed to ignore, asserted on a real socket.

⚠️ **This file exists because the libpq documentation gives itself permission to
do nothing.** PG 18 §32.1 says of each of the three parameters that it is *"only
supported on systems where `TCP_KEEPIDLE` or an equivalent socket option is
available … on other systems, it has no effect"* — and macOS is exactly the
awkward case it is hedging about, because its idle option is spelled
`TCP_KEEPALIVE` and carries a different number. A parameter libpq accepts,
reports back happily from `PQconninfo`, and then silently drops on the floor is
indistinguishable from a working one **until the night it was supposed to catch
something**, which is the failure ADR 0073 was written about in the first place.

So the assertion is the socket, not the connection string. `conn.info` would
only tell us what we asked for; `getsockopt` tells us what the kernel is doing.

⚠️ **What this file deliberately does not test: a blackholed peer.** Making a
peer stop answering *without* sending anything back needs packets **dropped**,
and every way to drop a packet on macOS goes through `pfctl`, which needs a
password and rewrites the machine's firewall — so it is neither automatable nor
something to leave lying in the repository as a script. Every cheaper imitation
was considered and each fails the same way, by being a *clean* teardown after
all: a proxy that closes its socket sends `RST`, a proxy that merely stops
reading is still ACKed by its own kernel, a killed proxy is closed by the kernel
on its way out, and a container whose network is cut is still ACKed by Docker
Desktop's host-side forwarder. ADR 0073 §4 names this as the one link it did not
measure, and says what would measure it.

⚠️ **The half that *is* already proven is in `test_reconnect.py`**, and it is
worth knowing which half. A loop blocked in `notifies()` when its session is
terminated reconnects and drains — so an error on the file descriptor really
does surface *through the generator* rather than waiting for the next statement.
That is the psycopg half. What these keepalives add is the kernel half: putting
an error on the descriptor when the peer has said nothing at all.

⚠️ Without Docker this goes red with the reason in `conftest.py` (ADR 0038).
"""

from __future__ import annotations

import socket

import psycopg
import pytest

import db

#: The idle option is the one that is spelled differently per platform, and the
#: whole point of this file is that the difference is real. Linux is here for
#: ADR 0022's move off the laptop, which is the day `tcp_user_timeout` also
#: becomes available.
IDLE_OPTION_NAMES = ("TCP_KEEPALIVE", "TCP_KEEPIDLE")


def _socket_for(connection: psycopg.Connection) -> socket.socket:
    """⚠️ `fromfd` **dups**, so closing this wrapper leaves psycopg's own
    descriptor alone. Taking the descriptor itself would close the connection
    out from under the test at teardown."""
    return socket.fromfd(connection.fileno(), socket.AF_INET, socket.SOCK_STREAM)


def _idle_option(sock: socket.socket) -> tuple[str, int]:
    for name in IDLE_OPTION_NAMES:
        number = getattr(socket, name, None)
        if number is not None:
            return name, sock.getsockopt(socket.IPPROTO_TCP, number)
    pytest.fail(
        "Python exposes neither TCP_KEEPALIVE nor TCP_KEEPIDLE on this platform, "
        "which is also libpq's condition for `keepalives_idle` having any effect "
        "(PG 18 §32.1). ADR 0073's detection window does not exist here."
    )


def test_the_keepalive_parameters_reach_the_kernel(postgres_dsn):
    """⚠️ **The assertion is `getsockopt`, and that is the decision.**

    Measured first on 2026-09-24 against Neon over the real internet — macOS
    27.0, psycopg 3.3.5, libpq 18.6 — where all three landed. This runs the same
    check against the container so a psycopg or libpq bump that quietly drops
    the mapping fails here rather than in a log nobody reads.
    """
    with db.connect(postgres_dsn) as connection:
        sock = _socket_for(connection)
        try:
            assert sock.getsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE), (
                "`keepalives=1` did not reach the socket, and with keepalives "
                "disabled PG 18 §32.1 says the other three are ignored outright"
            )

            name, idle = _idle_option(sock)
            assert idle == db.KEEPALIVE_IDLE_SECONDS, (
                f"{name} is {idle}, not {db.KEEPALIVE_IDLE_SECONDS}. libpq "
                "accepted `keepalives_idle` and did not apply it — the exact "
                "silent no-op ADR 0073 says to assert against."
            )
            assert (
                sock.getsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL)
                == db.KEEPALIVE_INTERVAL_SECONDS
            )
            assert (
                sock.getsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT)
                == db.KEEPALIVE_COUNT
            )
        finally:
            sock.close()


def test_the_connection_is_over_tcp_at_all(postgres_dsn):
    """⚠️ **Every one of the three is ignored on a Unix-domain socket**, says
    PG 18 §32.1, and libpq will happily use one when the host looks like a path.

    The test above would then assert nothing while passing, which is the worst
    outcome available to it. This is that precondition, said once and out loud —
    the same shape as `conftest.py`'s Postgres 18 assertion.
    """
    with db.connect(postgres_dsn) as connection:
        assert connection.info.host not in ("", None)
        assert not connection.info.host.startswith("/"), (
            f"connected over a Unix-domain socket ({connection.info.host}), "
            "where libpq ignores every keepalive parameter"
        )
