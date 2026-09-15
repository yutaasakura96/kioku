# The worker heartbeats while the model streams, and the candidate ledger commits with its chunk

**Decided 2026-09-15, from the first real run's evidence ([#17](https://github.com/yutaasakura96/kioku/issues/17)).**
While a model request streams, the worker refreshes `job.heartbeat_at` on its own connection at most
once a minute. The four candidate counters are written in the same transaction that marks their
*chunk* `complete`. The spend ledger is deliberately **not** put in a transaction with anything.
A reconnect and a sweep that returns a job each write a log line.

## What happened

The first *ingestion* (2026-09-14, three *chunks*, `claude-sonnet-5`) finished `done` with
`job.attempts = 2`, still claimed by the same owner. Nothing was logged. One *chunk* took roughly
**3–5 minutes**. Two limits sit at exactly five minutes:

- `jobs.STALE_AFTER`, after which a claim is reclaimable (`04` §6.4 step 4).
- **Neon Free's scale-to-zero**, which is fixed at five minutes of inactivity on that plan (Neon's
  scale-to-zero page, read 2026-09-15). `00-status.md` § Carrying records the measurement from
  2026-09-12: a held idle connection does **not** defer suspension, and the compute suspended 5 m 09 s
  after the last query.

The heartbeat was written only between *chunks* (`runs.run_ingestion`). During `provider.generate`
the worker's one connection issued nothing. A *chunk* near five minutes therefore outlived both
limits at once: the compute suspended, the next write raised `CONNECTION_LOST`, `loop.serve`
reconnected silently, and the catch-up drain swept the now-stale claim and ran it again.

`provider.TIMEOUT_SECONDS = 120` was documented as keeping the request inside the heartbeat window.
It cannot: it is a read timeout on a stream, and a steady stream never trips it.

## What is decided

**1. A keepalive runs on the stream, on the same connection, throttled to 60 seconds.**
`AnthropicProvider.generate` iterates the stream's events and then calls `get_final_message()`, the
pattern the SDK documents. On each event it calls a `keepalive` the caller passes in. `jobs.Keepalive`
turns that into `jobs.heartbeat(connection, job)` at most once every `KEEPALIVE_EVERY_SECONDS = 60`.

- **The same connection and the same thread.** The stream is consumed on the thread that owns the
  connection, so there is no second connection and none of the thread-safety problem `jobs.heartbeat`
  names.
- **One query does two jobs.** It keeps the claim fresh, and it is activity on the compute, which is
  what scale-to-zero measures.
- **The arithmetic.** A keepalive fires on an event. The gap between events is bounded by the read
  timeout, so the longest gap between heartbeats during a live stream is about 60 + 120 = 180 s,
  inside both five-minute limits. `worker/tests/test_keepalive.py` asserts that sum against 300.
- **A lost connection inside the keepalive is not translated.** It leaves `generate` as
  `CONNECTION_LOST`, the drain re-raises it, and the loop reconnects, as for any other dropped
  connection. It never becomes a `ProviderUnavailable` and a failed *chunk*.

**2. `STALE_AFTER` stays five minutes and *chunk* size stays where ADR 0041 put it.** Neither
addresses the cause.

**3. The candidate ledger commits with its *chunk*'s completion.** `runs.ChunkProcessor` may now
return a finishing callable. `run_ingestion` runs it and `_mark_chunk(… 'complete')` inside one
`connection.transaction()`. `ingest.make_chunk_processor` returns `record_candidate_ledger` that way.
Until now the counters were committed on their own, so a connection lost between them and the
completion made the retry add them a second time.

**4. The spend ledger stays one statement, committed immediately after the response.** It is not
put in a transaction with the cache write, and this is the part that is easy to "fix" the wrong way.
If the spend commits and the cache write is lost, the retry **calls the model again**, which is a
second real charge, so recording it twice is correct. Wrapped in one transaction, the same failure
rolls back the record of a request that was already billed, and `S10` under-reports money spent,
which is the one direction it must not be wrong in.

The one gap that remains is a response that arrives on a connection that is already dead: the model
billed, `record_spend` cannot commit, and the ledger misses that request. With decision 1 in place
that needs a real network failure rather than the compute's normal suspension. **The spend ledger is
exact except for a billed request whose response arrives on a dead connection.**

**5. Two log lines.** `loop.serve` takes `on_connection_lost`, called when a working connection
drops (not on every failed connect attempt during backoff). `jobs.drain` takes `on_swept`, called
when the sweep returns or gives up on at least one job. `__main__` logs `worker.connection_lost` with
the exception's class name only, because a psycopg message can carry the host, and `worker.swept`
with the count.

## What remains unguarded

- **A provider that sends no response headers at all.** The SDK retries a timed-out request twice
  by default, so three 120-second attempts with backoff can run past five minutes with no event and
  no keepalive. The claim is then swept, which is the designed recovery for a stuck job, and the
  `worker.swept` line now says it happened.
- **That the heartbeat query keeps the compute awake is inferred from the 2026-09-12 measurement,
  not re-measured.** The next long *ingestion* confirms it: a run whose *chunks* exceed five minutes
  should log no `worker.connection_lost` between `worker.started` and `worker.drained`.

## Alternatives considered

- **A timer thread with its own connection.** It refreshes the claim, but needs a second connection
  and a thread, and leaves the main connection idle for the whole request. Neon does not document
  whether activity on one session keeps another alive across suspension, so this adds parts without
  answering the question.
- **A longer `STALE_AFTER`.** The compute still suspends at five minutes and the post-request write
  still fails. The job then stays claimed for longer before anything recovers it, which is strictly
  worse.
- **Smaller *chunks*.** This reduces how often a request crosses five minutes without removing the
  case, and ADR 0041 sized *chunks* for vetting, not for this.
- **Spend and cache in one transaction.** Rejected in decision 4.
- **Checking or reopening the connection before the first post-request write.** That would save the
  response from being lost, but the claim would still be stale by then and swept. Once the keepalive
  runs, the connection no longer goes idle long enough to need it.

## Revisit if

- The compute stops scaling to zero (a paid Neon plan with it disabled, or ADR 0022's move to a
  server), which removes one of the two limits.
- A second worker arrives (ADR 0015's revisit condition). Every claimed-job write already matches on
  `claimed_by`, but the reclaim of a live job becomes a race rather than a self-reclaim.
- The next long run logs `worker.connection_lost` mid-*chunk*, which would mean the heartbeat query
  does not count as activity and the premise of decision 1 is wrong.
