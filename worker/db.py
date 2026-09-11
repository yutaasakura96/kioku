"""The one connection the worker opens — `03` §4.1, ADR 0027.

⚠️ **The direct string, and never the pooled one.** This is not a tuning
preference: PgBouncer in transaction mode does not support `LISTEN` at all
(PgBouncer's own feature matrix, verification §7.2), so a worker pointed at the
pooled endpoint **does not run slowly — it silently never wakes.** `03` §4.1
calls that out by name, and :func:`refuse_pooled` is that sentence as a guard,
because "silently" is the part that costs an afternoon.

⚠️ **Used verbatim as issued.** ADR 0027 is explicit: no `options=endpoint%3D…`
rewriting and no hand-edited TLS parameters. `psycopg[binary]` bundles libpq
17.2, which sets `sslsni=1` by default, and the string Neon issues already
carries what it needs (verification §9.1). Refusing a string is not editing one.
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
    """
    return psycopg.connect(url or require_direct_url(), autocommit=True)
