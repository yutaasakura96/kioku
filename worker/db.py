"""The one connection the worker opens — `03` §4.1, ADR 0027.

⚠️ **The direct string, and never the pooled one.** This is not a tuning
preference: PgBouncer in transaction mode does not support `LISTEN` at all
(PgBouncer's own feature matrix, verification §7.2), so a worker pointed at the
pooled endpoint **does not run slowly — it silently never wakes.** `03` §4.1
calls that out by name, and :func:`refuse_pooled` is that sentence as a guard,
because "silently" is the part that costs an afternoon.

⚠️ **Used verbatim as issued.** ADR 0027 is explicit: no `options=endpoint%3D…`
rewriting and no hand-edited TLS parameters. `psycopg[binary]` bundles a libpq
that sets `sslsni=1` by default, and the string Neon issues already carries what
it needs (verification §9.1). Refusing a string is not editing one. ⚠️ **This
said "libpq 17.2" until 2026-09-24**; the bundled version is **18.6** as of
psycopg 3.3.5, measured rather than read off a changelog
(``psycopg.pq.version() == 180006``). The `sslsni` claim is unaffected.

⚠️ **The keepalive parameters are passed beside the string, not written into
it** — ADR 0073, and that is what keeps ADR 0027 intact. psycopg merges keyword
arguments into the conninfo libpq is handed, so :data:`KEEPALIVE_PARAMETERS`
never touches the characters Neon issued; :func:`require_direct_url` still
returns the string byte for byte, and `test_db.py` asserts both halves.
"""

from __future__ import annotations

import os

import psycopg

#: ⚠️ Not `DATABASE_URL`. That one is the app's and it is the **pooled** string;
#: `.env.example` names the two separately for exactly this reason.
DIRECT_URL_ENV = "KIOKU_WORKER_DATABASE_URL"

#: ⚠️ **Both of them, and `InterfaceError` is the one that is easy to miss.**
#: psycopg's hierarchy makes it a sibling of `DatabaseError` rather than a kind
#: of `OperationalError`: the server saying *terminating connection due to
#: administrator command* is `OperationalError`, and the next statement issued
#: against the object it left behind is `InterfaceError`. A loop that catches
#: only the first survives the drop it saw and dies on the one it did not — which
#: on Neon Free, where the compute suspends every five idle minutes, is a worker
#: that stops overnight for a reason nobody can reconstruct.
#:
#: ⚠️ **Not `psycopg.Error`.** That would also swallow a `ProgrammingError` from
#: a query with a typo in it, and turn a bug into an infinite reconnect.
CONNECTION_LOST = (psycopg.OperationalError, psycopg.InterfaceError)

POOLED_MARKER = "-pooler"

#: ⚠️ **ADR 0073 — the only thing this loop has that notices a peer that stopped
#: answering without saying so.** The worker spends almost all of its life
#: blocked in `notifies()` issuing no statements at all (`03` §3.1 step 6), and
#: an application learns a socket is dead only on a read or a write. A *clean*
#: teardown — Neon suspending the compute, `pg_terminate_backend` — arrives as
#: readable data and `test_reconnect.py` proves the loop survives it. An
#: *unclean* one, where the path simply vanishes (the laptop sleeps, the wifi
#: changes, a NAT rebinds), sends nothing at all, and without these the loop
#: waits for it forever.
#:
#: ⚠️ **They are not a poll and the distinction is load-bearing.** `03` §3.1's
#: *no query on a timer* rule exists because every query resets Neon's
#: scale-to-zero timer and spends the month's compute budget. A TCP keepalive is
#: not a query, and that was **measured rather than argued** (2026-09-23): one
#: idle connection probing every 30 s for fifteen minutes, no laptop sleep in the
#: window, and the compute suspended underneath it twice on the usual ~315 s
#: cadence. The budget objection does not reach here.
#:
#: ⚠️ **`keepalives` defaults to `1` already and that is why this looked like a
#: no-op for so long.** libpq leaves the intervals to the OS when they are zero
#: (PG 18 §32.1: *"A value of zero uses the system default"*), and macOS'
#: `net.inet.tcp.keepidle` is **7200000 ms — two hours**. The default-on
#: keepalive was real and useless; these three are what make it a detection time
#: anyone would call a fix.
#:
#: ⚠️ **Measured on this platform, because the docs hedge.** libpq documents
#: `keepalives_idle` as needing `TCP_KEEPIDLE` *"or an equivalent socket
#: option"*, and says plainly that on systems without one *"it has no effect"* —
#: macOS has `TCP_KEEPALIVE` under a different name and number, so silence was a
#: real possibility. All three land (2026-09-24, macOS 27.0, psycopg 3.3.5 /
#: libpq 18.6): `TCP_KEEPALIVE=30`, `TCP_KEEPINTVL=10`, `TCP_KEEPCNT=3`.
#: `test_half_open.py` is that measurement as an assertion.
#:
#: 30 + 10 × 3 ≈ **60 seconds** from the last packet to a dead socket.
#: ⚠️ `tcp_user_timeout` would say the same thing in one parameter and is
#: **Linux-only** — it becomes available after ADR 0022's move off the laptop,
#: not before.
KEEPALIVE_IDLE_SECONDS = 30
KEEPALIVE_INTERVAL_SECONDS = 10
KEEPALIVE_COUNT = 3

KEEPALIVE_PARAMETERS = {
    "keepalives": 1,
    "keepalives_idle": KEEPALIVE_IDLE_SECONDS,
    "keepalives_interval": KEEPALIVE_INTERVAL_SECONDS,
    "keepalives_count": KEEPALIVE_COUNT,
}


class MisconfiguredWorker(RuntimeError):
    """Raised at startup, before anything has been claimed."""


def require_direct_url(environ: dict[str, str] | None = None) -> str:
    """The direct connection string, or a refusal that says which one is wrong."""
    environ = os.environ if environ is None else environ
    url = environ.get(DIRECT_URL_ENV, "").strip()
    if not url:
        raise MisconfiguredWorker(
            f"{DIRECT_URL_ENV} is not set. The worker takes Neon's **direct** "
            "connection string — the one without `-pooler` in the hostname. "
            "`.env.example` names it; the value never enters the repository "
            "(`03` §13.1)."
        )
    return refuse_pooled(url)


def refuse_pooled(url: str) -> str:
    """Refuse the pooled endpoint loudly rather than never waking quietly."""
    if POOLED_MARKER in url.split("?", 1)[0]:
        raise MisconfiguredWorker(
            f"{DIRECT_URL_ENV} points at the pooled endpoint (`-pooler` is in "
            "the hostname). PgBouncer in transaction mode does not support "
            "LISTEN, so the worker would start, claim nothing, and never wake "
            "(`03` §4.1, verification §7.2). Use the direct string."
        )
    return url


def connect(url: str | None = None) -> psycopg.Connection:
    """⚠️ `autocommit=True`, and it is not stylistic (`03` §3.1).

    Without it psycopg opens an implicit transaction on the first statement and
    the listening connection then sits idle *in a transaction*, where Neon's
    `idle_in_transaction_session_timeout` default of five minutes kills it on a
    schedule (verification §7.2) — which the loop would survive, by reconnecting
    every five minutes forever, while looking like a network problem.

    ⚠️ **The keepalives are ADR 0073 and they are handed over as keyword
    arguments**, which is what lets the connection string stay the one Neon
    issued (ADR 0027). Everything about the numbers is on
    :data:`KEEPALIVE_PARAMETERS`.
    """
    return psycopg.connect(
        url or require_direct_url(), autocommit=True, **KEEPALIVE_PARAMETERS
    )
