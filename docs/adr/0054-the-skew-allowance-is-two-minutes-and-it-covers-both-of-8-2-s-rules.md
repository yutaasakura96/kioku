# The skew allowance is two minutes, and it covers both of §8.2's rules

**`03` §8.2's "small skew allowance" is **120 seconds**, and it applies to the before-snapshot rule
as well as to the future rule.**

`03` §8.2 decided *that* the server refuses a stamp it cannot trust and named neither a number nor a
symmetry. #13 is where the outbox makes a stamp travel far enough from its keystroke to be wrong, so
it is where both get decided.

## Two minutes

**An NTP-synchronised clock is within milliseconds; an unsynchronised one drifts minutes over
weeks.** The allowance has to be wide enough to absorb the first case and narrow enough to catch the
second, and there is a large gap between them — anything from thirty seconds to five minutes sits in
it. Two minutes is the middle of that gap, and the cost of being wrong in either direction is
asymmetric in a way that makes the exact value unimportant:

- **Too narrow** refuses *grades* from a laptop that is merely imprecise. The reader sees a line on
  the end screen about a clock that is very nearly right, and the *grades* are lost.
- **Too wide** accepts a *grade* stamped a few minutes into the future. FSRS schedules on elapsed
  days (`enable_short_term` is off, ADR 0016), so a few minutes changes no interval anybody can
  measure.

The failure the rule exists for is **a laptop back from another timezone** — hours, not minutes — and
every value in the gap catches that. Two minutes is chosen because it is the one a reader would
recognise as *your clock is wrong* rather than *your clock is slightly off*.

## Both rules, and this is the part that was not written down

`03` §8.2 names the allowance for the future rule alone: *"rejects a grade stamped in the future
beyond a small skew allowance, and rejects one stamped before its own session snapshot was taken."*
Read literally, the second rule is exact.

**It cannot be.** Both comparisons put a **client** stamp against a **server** one —
`snapshot_taken_at` is written by the database (`04` §7.6) and `received_at` defaults to it — so a
reader whose clock is three seconds slow stamps the first *grade* of a run at an instant that is
genuinely before the snapshot. Under an exact rule, **the opening *grade* of every *session* on that
laptop is refused**, and the end screen reports a clock problem the reader cannot see anywhere else,
on a machine that is working.

That is the rule catching the thing it was written to tolerate. The allowance is what separates
*before the run existed* from *very slightly before we started counting*, and it separates them in
both directions for the same reason.

## Alternatives considered

**A tighter bound on the before-snapshot rule** — a second, smaller allowance, on the argument that
the two rules guard different things. Rejected: they guard the same thing, which is the difference
between two clocks, and a second constant is a second number to be wrong about. One allowance, two
comparisons.

**Deriving the allowance from the measured skew** — `review_log.clock_skew_seconds` is recorded on
every row (`04` §7.5), so the application could learn what this reader's clock does. Rejected as
premature and circular: it would widen the bound in exactly the case the bound exists for, and there
is one reader (ADR 0012).

**No before-snapshot rule at all.** Rejected — it is `03` §8.2's, and it is the half that catches a
replay from a *session* the reader has long finished.

## Consequences

`shared/review/stamp.ts` is a pure function over a stamp and two server instants, and it is one of
`11` §8's named seams. ⚠️ **The two instants are both read from the database** — `snapshot_taken_at`
from the row and `now()` in the same statement — because measuring the allowance against the
application server's clock would silently widen it by whatever Vercel and Neon disagree by (`03`
§13.1's two-machine shape).

A refused *grade* is **surfaced and not retried**: it leaves the outbox, joins a refused list that
also lives in `localStorage` (ADR 0014), and the end screen says how many and why (`10` §5.6). ⚠️
**The position stays painted as answered.** The reader has moved on, and un-grading it would rewind
the *progress rail* under their hands — which is the one thing `shared/review/snapshot.ts` refuses
for every other reason too.

## Revisit if

A second reader appears on a second device, or the application ever runs somewhere the two clocks are
not both NTP-synchronised — at which point the number is a measurement rather than a judgement, and
`clock_skew_seconds` is already collecting it.
