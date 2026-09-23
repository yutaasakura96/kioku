# A deferred job is collected by a deadline the drain recorded

**`03` §3.1 step 6 becomes conditional. The timeout branch still issues no query — unless the last
drain saw a future-dated `queued` row and that row's time has now arrived, in which case it drains
once. The drain reports the wait; the loop holds it as a deadline and nothing else queries on a
timer.**

## The hole this closes, measured

[ADR 0046](0046-a-job-gives-up-after-five-abandonments-and-the-retry-after-the-first-is-deferred.md)
set `available_at` forward from the second abandonment and named what it was not building: *nothing
is scheduled to come back for a future-dated job*. That was reasoned about. On 2026-09-22 it was
observed, during the N3 import ([#37](https://github.com/yutaasakura96/kioku/issues/37)):

| | |
| --- | --- |
| Connection lost, claim abandoned | 12:25:32 UTC |
| Sweep set `available_at` forward to | **12:29:34** |
| Still `queued`, nothing claimed it | **12:57** |
| Idle, mid-run | **28 minutes** |

The thirty-minute `MAX_RETRY_DELAY` cap bounded the damage. It did not close the gap, and ADR 0046
said so in as many words.

## The sketch was wrong in one word, and the word mattered

Every prior statement of the fix — `00-status.md` § Carrying, ADR 0046, and #37's own body — says
**a shorter block timeout when and only when the drain saw a future-dated row.**

⚠️ **There is nothing to shorten.** `BLOCK_TIMEOUT_SECONDS` is **5.0** and `__main__` does not
override it, so the loop already wakes twelve times a minute; a deferral is one to thirty minutes.
The wake-up was never missing. What was missing is a **deadline**: the timeout branch had no way to
tell the one expiry that matters from the three hundred that do not, so it threw all of them away.

This is why the amendment is small and why it does not reintroduce a metronome. A query fires **once
per deferral**, not once per timeout, and that is a property of the shape rather than a promise about
the number.

## Why the drain reports it, and not a second query on expiry

`drain` ends where `claim_next_job` has just returned `None` — so whatever is left in the queue is
either nothing or future-dated. That is the moment the answer is free to ask for, on a connection
that is already querying, and it is one statement:

```sql
SELECT min(available_at) FROM job WHERE state = 'queued' AND available_at > now()
```

⚠️ **It is read as an interval, server-side, not as a timestamp the worker subtracts from its own
clock.** The worker runs on a laptop and the database does not; a skew of a few seconds between them
would otherwise be a deadline that fires early or late for a reason nobody could see from either end.

⚠️ **And it is read in `drain`, not off the sweep's `RETURNING`.** The sweep only knows about
deferrals *it just created*. A deferral left behind by an earlier run of the worker — the process
restarted while a job was future-dated, which is exactly what a laptop closing looks like — is
invisible to the sweep and visible to this query.

⚠️ **No migration.** `job_queued_idx` is already partial on `(available_at) WHERE state = 'queued'`
(`0000_schema.sql`), which is precisely this query's shape.

## What the existing pins do, and do not, say

`11` §7 and `tests/test_loop.py` both pin *the timeout branch issues no query*, and ADR 0046 gave
those pins as two of its three reasons for not making this amendment. They survive unchanged:

- `test_the_timeout_branch_issues_no_query_and_no_poll` drains nothing, so it records no deadline, so
  its three expired timeouts still add no statement. **The assertion is not relaxed; a case is added
  beside it.**
- `11` §7's row gains the conditional and keeps the rule.

⚠️ **The rule being amended is narrower than "no query on expiry".** It was always *no query on a
timer*. Step 6 as written could not distinguish the two, and this decision is what separates them.

## The clock, and a documented silence

The deadline is `time.monotonic()` plus the reported wait, injected as `clock` so the tests own it.

⚠️ **Python's `time` documentation does not say whether `monotonic()` advances while macOS is
suspended.** It says only that macOS calls `mach_absolute_time()`; the one place suspend is addressed
is `CLOCK_BOOTTIME`, which is Linux-only and exists *because* `CLOCK_MONOTONIC` excludes suspended
time. Read at the source 2026-09-23. **So the honest position is that the answer is unknown for this
platform, and the design is built not to need it:**

- A deadline that fires **early** costs one indexed query that finds nothing due and recomputes.
- A deadline that fires **late** is bounded by something else entirely — a laptop that suspends drops
  the connection, and waking reconnects, re-`LISTEN`s and polls (step 7 into step 3). The path that
  would make a late deadline matter is the same path that makes it unnecessary.

**Measuring it was refused deliberately**: the measurement requires suspending the laptop the worker
is running on, and it would change no line of this design.

## Alternatives considered

**Shorten the block timeout, as the sketch said.** Rejected on the arithmetic: five seconds is
already shorter than any deferral the sweep can write. The sketch was drafted before
`BLOCK_TIMEOUT_SECONDS` existed at its current value and was never re-read against it.

**Poll on every timeout.** Rejected, and it is the thing ADR 0028 and `03` §3.1 refuse: every
connection resets Neon's scale-to-zero timer (verification §7.2), so a metronome spends the month's
compute budget asking a question the notification answers.

**`pg_sleep` or a server-side timer.** Rejected: it holds a connection in a statement for up to
thirty minutes, which is the held-daemon ADR 0028 rejected wearing a different hat, and Neon suspends
underneath it anyway.

**Let the reconnect collect it.** This is today's behaviour and it is what failed. The reconnect is
driven by scale-to-zero, which needs the listener to *notice* it died — and
[#38](https://github.com/yutaasakura96/kioku/issues/38) is the open question of whether it always
does. Depending on it is depending on the thing that broke.

**Fix #38 first and let this one stand.** Rejected as an ordering, not as a fix: #38's cause is read
from symptoms and unproven, and this gap is real whether or not that one is.

## What it costs

One indexed statement per drain — on connect, on notification, and on a deadline. An idle worker
drains about twelve times an hour, so the cost is about twelve lookups an hour on a connection that
was already open and querying.

⚠️ **And step 6 stops being a single sentence.** It was quotable — *"the timeout branch issues no
query"* — and it is now a sentence with a clause. That readability is a genuine loss and it is what
ADR 0046 was buying by leaving the gap open.

## What this does for #38, and what it does not

The deadline drain issues a query, so on a silently dead connection it raises and step 7 reconnects.
⚠️ **For a deferred job, this converts #38's silent stall into a reconnect** — and in the incident
above, this decision alone would have collected the job at 12:29:34.

**It does not fix #38.** A job *notified* while the listener is dead still waits for the scale-to-zero
teardown to be noticed, because nothing recorded a deadline for it. § Carrying's *"a fix to either one
alone leaves the other able to stall a run"* stays true in general and is slightly pessimistic for the
case that was actually measured.

## Revisit if

A deadline is seen firing on a job that was never deferred, which would mean the query is reading
rows the claim would have taken and the two have drifted apart. ⚠️ **Or the worker moves off Neon
Free** and the compute stops suspending (ADR 0022, ADR 0028's own revisit condition): the reconnect
then stops being routine, the deadline becomes the *only* thing collecting a deferral rather than the
early one, and it should be re-read as load-bearing rather than as a shortcut.
