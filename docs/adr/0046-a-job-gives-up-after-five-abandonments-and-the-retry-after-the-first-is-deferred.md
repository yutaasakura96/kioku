# A job gives up after five abandonments, and every retry after the first is deferred

**The stale-claim sweep now has two branches. A claim whose `attempts` is below five returns to
`queued`; at five it becomes `failed`, keeps its `claimed_by`, and carries a `last_error` saying it
was abandoned. The first retry is immediate and every one after it sets `available_at` forward,
doubling from one minute to a thirty-minute cap.**

## The hole this closes

`04` §6.4 has always called `available_at` backoff — *"a retry sets it forward rather than sleeping
in the worker"* — and until #8 nothing in the repository ever set it forward. `04` §6.4 has always
counted `attempts` and nothing ever read it. `00-status.md` § Carrying recorded both as one gap and
named the ticket that owns it: *a job that reliably kills the worker is swept back to `queued` and
re-claimed immediately, forever, with `attempts` counting up and nothing reading it.*

⚠️ **It was hypothetical until #8 and it is not any more.** A job that *raises* was already
terminal — `drain` calls `fail_job` on the first exception. The unhandled case is a job that takes
the **process** down, so nothing survives to mark anything: the claim is simply left behind, the
sweep returns it, the next poll claims it, and it happens again. #7's handler was bookkeeping and
could not do that. #8's handler loads a 68 MB dictionary and tokenises up to 100,000 characters.

## Why the sweep, and not `drain`

`drain` sees one attempt. The sweep sees the row across attempts, and the two reasons a claim goes
stale are indistinguishable in the moment — the laptop closed, or the job killed the worker. Only
`attempts` separates them, and only over time. So the rule belongs where the count is read.

⚠️ **The first retry stays immediate, and that is a documented property rather than a spare
parameter.** `04` §6.4 puts the sweep at the top of the poll precisely so a job abandoned by a closed
laptop *lands in the very same drain that noticed it*, and `11` §7 tests exactly that. A claim once is
`attempts = 1`, which is still the closed-laptop story; the deferral starts at the second, which is
where it stops being.

## What is deliberately not built

⚠️ **Nothing is scheduled to come back for a future-dated job.** `03` §3.1 step 6 forbids the timeout
branch from issuing a query — a metronome poll is the keepalive ADR 0028 refused, because every
connection resets Neon's scale-to-zero timer (verification §7.2). So a deferred job waits for the
next notification or the next reconnect.

§ Carrying's own sketch of the answer is *"a shorter block timeout when and only when the drain saw a
future-dated row, which is still not a query on expiry"* — and a shorter timeout only helps if
something then queries, which is the step that would amend `03` §3.1 step 6. **That amendment is not
made here**, for three reasons: `11` §7 and `tests/test_loop.py` both pin *the timeout branch issues
no query*, ADR 0028 rests on it, and the **harmful** half of the gap — the infinite re-claim — is
closed by the ceiling alone, which needs no loop change.

⚠️ **The cap is where this decision absorbs the consequence.** Thirty minutes rather than hours,
because a deferral longer than the interval between reconnects is indistinguishable from losing the
job. The residual gap is named in `00-status.md` § Next rather than papered over.

## Alternatives considered

**A ceiling with no backoff.** Rejected: without a deferral, a job that kills the worker is re-claimed
by the very next poll, so five attempts are spent in seconds — and a *transient* failure, which is
what retries are for, is burned through just as fast.

**Backoff with no ceiling.** Rejected: it slows the loop without ending it, and `attempts` would still
be a column nothing reads.

**Deleting or re-queueing the *ingestion* instead of failing the job.** Rejected. `04` §6.1 makes
`incomplete` the resumable state and `03` §5.4 keeps partial results; the *ingestion* is not what went
wrong, and the resume control (`10` §6.2) is the reader's own way to ask again once the cause is
fixed.

## Revisit if

A real *source* trips the ceiling. Five is a guess about a failure that has never happened, and the
first one that does will say whether the number is wrong or the handler is. ⚠️ **A `failed` job is
visible but its *ingestion* still reads `incomplete`** — `09` §7's run row shows what completed and
offers the resume control, which is the right answer for a reader and not obviously the right answer
for a job nobody can fix. If that pairing reads badly on the screen, `10` §6.2 is where to argue it.
