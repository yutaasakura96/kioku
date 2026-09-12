# The app sends the wake-up, after the transaction that earned it

**`recordSource` issues `SELECT pg_notify('kioku_job', '')` on the pooled connection, immediately
*after* the transaction that wrote the four rows commits, and swallows any error it raises. The
channel is `kioku_job`, the payload is empty, and the worker's `LISTEN` is the only subscriber.**

ADR 0028 settled that the notification is an optimisation and the job table is the truth. It did not
say **who sends it**, and nothing did until #7 needed something to wake up.

## Three candidates, and why this one

**A trigger on `job` INSERT calling `pg_notify`.** The most robust: it fires for every writer,
including a `psql` session and the resume control that does not exist yet, and it is immune to
whatever a pooler supports. It is also a second trigger in a schema whose §14 says there is one, and
`test/schema/schema.test.ts` asserts that count with the comment *"a second trigger appearing here is
a decision someone owes an argument for."* This is that argument, and it comes out the other way:
ADR 0011 names exactly one thing as irreplaceable and guards it in more than one place; a latency
optimisation is not that thing, and paying for one with the schema's only structural guard is the
wrong trade. ⚠️ **If a second writer of `job` rows ever forgets to notify, the cost is latency** —
which is ADR 0028's premise, written down.

**Inside the transaction.** Tidier: Postgres queues notifications and delivers them at commit, so a
rolled-back job could never notify. Rejected because it puts a statement whose behaviour through
Neon's pooled endpoint is **documented two different ways** (below) inside the four writes `S2`
depends on. `04` §6.4's guarantee is that a `job` row exists; the optimisation is not allowed to be
able to take that away.

**After the transaction, failing silently.** Taken. The row is already on disk when the notification
is sent, so the worst case is the case ADR 0028 already priced: the worker finds the job on its next
connect instead of within the second.

## What was verified, and what it corrects

⚠️ **PgBouncer's own feature matrix separates the two statements**, and this project's documents have
been lumping them:

| Feature | Session pooling | Transaction pooling |
| --- | --- | --- |
| `LISTEN` | Yes | **Never** |
| `NOTIFY` | Yes | **Yes** |

Verified 2026-09-11 against [pgbouncer.org/features.html](https://www.pgbouncer.org/features.html).
`03` §4.1 and `phase-4-verification.md` §7.2 and §9.2 each say the pooled endpoint "does not support
`LISTEN`/`NOTIFY`", which is Neon's summary of that matrix, and Neon's page is a summary rather than
the mechanism. All three are amended to name the asymmetry.

**Why the asymmetry is the expected one:** transaction pooling hands a server connection back to the
pool at the end of every transaction. `LISTEN` is session state, so a subscription made through it
belongs to whoever gets that server connection next — it cannot work. `NOTIFY` is not session state:
it is a statement inside a transaction whose effect is delivered by the server at commit, and it does
not care which client connection carried it.

~~⚠️ **This has not been run against Neon**, because nobody has signed in yet and there is no `.env`
(#5). The failure it would produce if Neon's summary turns out to be the operative one is a caught
exception and a worker that polls on connect — so the design is correct in both directions, which is
the same reason ADR 0028 did not wait for the scale-to-zero experiment.~~

**⚠️ Amended 2026-09-12 — run against Neon, and PgBouncer's matrix wins.** The `kioku` project
(`small-hat-90514806`, Postgres 18.6, `aws-ap-southeast-1`) was provisioned and the statement issued.
A `pg_notify('kioku_job','')` on the **pooled** string was accepted with no error and **was delivered
to a `LISTEN` held on the direct endpoint**, in 563 ms. The production wake-up path — app writes and
notifies through the pooler, worker wakes on the direct endpoint — works as designed, and the
fallback branch this ADR kept for the other outcome is now dead weight rather than insurance.
Neon's summary sentence, which reads as though the `LISTEN`/`NOTIFY` pair does not survive transaction
pooling, is the coarser statement; it is `LISTEN` alone that does not.

⚠️ **And the control run is the sharper finding, because it is the failure mode nobody would see.**
`LISTEN kioku_job` issued on the **pooled** string was **accepted — no error, no warning** — and the
connection then received nothing when a `pg_notify` was issued on the same channel from a second
pooled connection. This is `03` §4.1's "does not run slowly, it silently never wakes", demonstrated
rather than reasoned: a worker misconfigured onto the pooled string would start, log nothing, claim
nothing, and look healthy indefinitely. The only thing standing between that configuration error and
a permanently idle queue is `worker/db.py:require_direct_url`'s hostname refusal, which is therefore
load-bearing and not a nicety. **Do not relax it into a warning.**

## The channel, and the one thing that makes it dangerous

`kioku_job`. It is a **cross-language constant**: `server/utils/ingest/notify.ts` sends it and
`worker/loop.py` subscribes to it, and **a mismatch raises nothing and logs nothing** — the worker
starts, claims nothing, and wakes only on reconnect. `09` §7 then reports that state honestly, as
"queued 4m, not yet picked up", which reads exactly like *the worker is not running*.

So it is guarded the way `03` §6's declaration is: `test/unit/job-channel.test.ts` reads
`worker/loop.py`, extracts its `JOB_CHANNEL`, and asserts the two spellings agree. It needs no Python
and no database.

⚠️ **`pg_notify(…)` and not `NOTIFY …`.** `NOTIFY` takes an identifier, which cannot be a bound
parameter; `pg_notify` takes a value. The worker still interpolates the constant into `LISTEN`,
because `LISTEN` has no function form — which is why the same test also asserts the channel is a bare
identifier needing no quoting.

## The payload stays empty

ADR 0028 already argued it and the code is where it becomes enforceable: the wake-up says the table
is worth re-reading and the query decides what is there. `worker/tests/test_loop.py` yields a
notification object whose `payload` property **raises**, so "the payload is never read" is a failing
test rather than a claim about the code.

## Revisit if

A second writer of `job` rows appears that is not the Nuxt app — a scheduled re-ingestion, an admin
script, anything reaching the table directly. At that point the trigger's one advantage (nobody can
forget) starts costing something real, and it is a raw SQL migration and one line in the schema test.

`03` §13.5's pins are untouched: this adds no dependency to either manifest.
