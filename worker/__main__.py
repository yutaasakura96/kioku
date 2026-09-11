"""The worker process — `cd worker && uv run python .`.

⚠️ **No listening socket, no route, no inbound surface at all** (`03` §1). It
reads the job table directly, which is ADR 0015's second and now load-bearing
argument: with no HTTP job endpoint, `S1`'s *refused at every route* is literally
true rather than nearly true. The whole attack surface is the Nuxt app; the whole
**spend** surface is this laptop.

⚠️ **Never a permanent daemon** (ADR 0022). One process, started and stopped
with the reader's working session — `Ctrl-C` is the supported way to end it, and
the block timeout in `loop.py` is what makes that land in a few seconds.

⚠️ **The pipeline is not wired in yet.** #7 is the loop, the claim and the
sweep; stages 1–5 are #8 and generation is #9. Until then a claimed run has its
chunk queue opened and settles `incomplete` — the resumable state (`04` §6.1),
which is what it truthfully is.

Logging is `03` §11: structured JSON lines to stdout, carrying the ingestion or
job id. ⚠️ **Never source text, never a note field, never the reader's email, no
connection string and no API key.**
"""

from __future__ import annotations

import json
import signal
import sys
import threading
import time
from typing import Any

import psycopg

import db
from jobs import drain as drain_jobs, worker_id
from loop import JOB_CHANNEL, serve
from runs import run_ingestion


def log(event: str, **fields: Any) -> None:
    """One JSON line per event, on stdout — the worker's half of `03` §11."""
    print(json.dumps({"t": time.time(), "event": event, **fields}), flush=True)


def main() -> int:
    try:
        url = db.require_direct_url()
    except db.MisconfiguredWorker as error:
        # ⚠️ The message names the variable and the endpoint; it never echoes the
        # value, which is `03` §13.1's rule and this repository is public.
        log("worker.misconfigured", reason=str(error))
        return 1

    owner = worker_id()
    stop = threading.Event()

    for received in (signal.SIGINT, signal.SIGTERM):
        signal.signal(received, lambda *_: stop.set())

    def drain(connection: psycopg.Connection) -> int:
        handled = drain_jobs(connection, owner=owner, handle=run_ingestion)
        if handled:
            log("worker.drained", jobs=handled, owner=owner)
        return handled

    log("worker.started", owner=owner, channel=JOB_CHANNEL, pipeline="none until #8")
    serve(lambda: db.connect(url), drain=drain, stop=stop)
    log("worker.stopped", owner=owner)
    return 0


if __name__ == "__main__":
    sys.exit(main())
