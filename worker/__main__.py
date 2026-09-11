"""The worker process — `cd worker && uv run python .`.

⚠️ **No listening socket, no route, no inbound surface at all** (`03` §1). It
reads the job table directly, which is ADR 0015's second and now load-bearing
argument: with no HTTP job endpoint, `S1`'s *refused at every route* is literally
true rather than nearly true. The whole attack surface is the Nuxt app; the whole
**spend** surface is this laptop.

⚠️ **Never a permanent daemon** (ADR 0022). One process, started and stopped
with the reader's working session — `Ctrl-C` is the supported way to end it, and
the block timeout in `loop.py` is what makes that land in a few seconds.

⚠️ **All seven stages are wired in as of #9.** #7 was the loop, the claim and
the sweep, #8 was the *pipeline* up to the edge of generation, and #9 is the
spend: a claimed run reads its *source*, tokenises every *chunk*, extracts
*candidates*, deduplicates against the corpus, appends *occurrences* for what the
corpus already had, filters what the reader has rejected, **asks a model about
what is left, writes the *pending notes* that come back, and records what they
cost** (`04` §6.1, §6.3).

⚠️ **Both refusals happen before anything is claimed.** The direct connection
string and the provider key are read at startup, so a worker that cannot spend
says so in one line instead of draining a queue and producing nothing — which
would settle every run `complete` and report a *source* that made no *notes* as a
success (PRD §5's zero-new-notes case, arriving as a lie).

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
import provider as provider_module
from ingest import make_chunk_processor, make_generator, resolve_worker_environment
from jobs import ClaimedJob, drain as drain_jobs, worker_id
from loop import JOB_CHANNEL, serve
from pipeline.generate import PROMPT_VERSION
from pipeline.tokenise import DICTIONARY_VERSION
from runs import run_ingestion


def log(event: str, **fields: Any) -> None:
    """One JSON line per event, on stdout — the worker's half of `03` §11."""
    print(json.dumps({"t": time.time(), "event": event, **fields}), flush=True)


def main() -> int:
    try:
        url = db.require_direct_url()
        environment = resolve_worker_environment()
        provider = provider_module.require_provider()
    except db.MisconfiguredWorker as error:
        # ⚠️ The message names the variable and the endpoint; it never echoes the
        # value, which is `03` §13.1's rule and this repository is public.
        log("worker.misconfigured", reason=str(error))
        return 1

    owner = worker_id()
    stop = threading.Event()

    for received in (signal.SIGINT, signal.SIGTERM):
        signal.signal(received, lambda *_: stop.set())

    # ⚠️ **One generator for the process, not one per job.** It holds the HTTP
    # client ADR 0018's boundary is made of, and a client per claimed job would
    # throw away every connection the previous run warmed.
    generate = make_generator(provider, worker_environment=environment)

    def handle(connection: psycopg.Connection, job: ClaimedJob) -> None:
        # ⚠️ **The one line #8 added to the loop, and #9 passed one argument
        # through it.** `run_ingestion` owns the durable bookkeeping and takes
        # the per-chunk work as an argument; this is that argument, bound to the
        # job it belongs to (`ingest.py`).
        run_ingestion(
            connection,
            job,
            process_chunk=make_chunk_processor(job, generate=generate),
        )

    def drain(connection: psycopg.Connection) -> int:
        handled = drain_jobs(connection, owner=owner, handle=handle)
        if handled:
            log("worker.drained", jobs=handled, owner=owner)
        return handled

    # ⚠️ The dictionary is **not** constructed here. `03` §3.4 says once per
    # process, and `pipeline.tokenise.dictionary` builds it on first use — a
    # worker that is started and never claims anything should not pay 58 ms and
    # 93 MB for a *source* that never arrives. Naming the version costs nothing
    # and is what a log line is for.
    # ⚠️ **The model id and the prompt version are logged and the key is not**
    # (`03` §11, §13.1). Which model ran is the thing ADR 0018's walk is about,
    # and `04` §12's eighth query reads it back off the rows rather than out of
    # this line — nothing durable depends on a log (`03` §11).
    log(
        "worker.started",
        owner=owner,
        channel=JOB_CHANNEL,
        pipeline="stages 1-7",
        dictionary_version=DICTIONARY_VERSION,
        prompt_version=PROMPT_VERSION,
        model_id=provider.model_id,
        worker_environment=environment,
    )
    serve(lambda: db.connect(url), drain=drain, stop=stop)
    log("worker.stopped", owner=owner)
    return 0


if __name__ == "__main__":
    sys.exit(main())
