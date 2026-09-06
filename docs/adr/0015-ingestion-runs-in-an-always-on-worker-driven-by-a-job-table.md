# Ingestion runs in an always-on worker, driven by a job table

***Ingestion* runs in a separate always-on process, same repository and same codebase, driven by a
job table in the database.** Not in-request, not a separate service, not a triggered function.

ADR 0010 already made *ingestion* a streaming background job. This decides its shape.

## The durability requirement chooses the mechanism

PRD §5's ugliest ingestion case is the deciding one: **a run that fails part-way keeps partial
results, and resuming re-runs only unprocessed chunks.** That means per-chunk progress is durable in
the database rather than in process memory — and once that table exists, it *is* a queue. A
dedicated queue service would add a deploy unit and buy nothing at one reader.

In-request is ruled out by PRD S2, which requires submitting a *source* to return control
immediately.

## Always-on rather than triggered

A triggered worker costs nothing at idle, which is nearly all the time at one reader. It was
rejected anyway: ***time-to-first-review* is one of the four numbers v1 exists to produce**, it has
a ten-minute budget, and cron granularity spends minutes of that budget on scheduling lag. A
measurement contaminated by the scheduler measures the scheduler.

The cost is an instance idling ~99.9% of the time. Accepted as the price of an uncontaminated
metric, and it is the smallest instance the host offers.

## The worker reads the database directly

It does not call the app over HTTP. This removes the seam ADR 0017 flags — Better Auth's
`validateUserInfo` gates *sign-in* but not API-key verification, so an HTTP job endpoint's
protection would be "only keys I issued exist" rather than the allowlist. **With no such endpoint,
PRD S1's "refused at every route" stays literally true rather than nearly true.**

## Revisit if

*Ingestion* volume ever justifies more than one worker, or a second *subject*'s pipeline has
materially different resource needs — at which point the job table is already the seam to split on.
