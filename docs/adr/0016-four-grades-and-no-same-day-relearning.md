# Four grades, and no same-day relearning in v1

***Review* ships all four FSRS grades — `1 Again / 2 Hard / 3 Good / 4 Easy` — and `enable_short_term`
is off, so a graded *card* always leaves the current *session*.**

Phase 2 drew those four labels as an explicit placeholder, not to be extracted into the design
system until the scheduler was chosen. Verified 2026-09-06: they are exactly FSRS's canonical set.
The placeholder becomes the decision.

## Why all four

`Rating` is `Again = 1, Hard = 2, Good = 3, Easy = 4`, with `Manual = 0` explicitly excluded from
the `Grade` type as an operator escape hatch. A two-button app is legal — map onto `Again` and
`Good` — but **the grade value is load-bearing arithmetic, not a label**: it appears as `G` inside
the stability formula. Emitting only two grades would leave `w₃`, `w₄` and the Hard-penalty weight
permanently untrained.

It costs nothing at the keyboard — one keystroke either way — and §2.4 makes review history the one
asset that cannot be regenerated. Halving the grade set would quietly devalue it.

## Why no same-day relearning — and what it costs

FSRS-6 supports learning steps: a *card* graded *Again* returns after minutes rather than being
pushed to a future day. That is how Anki behaves and it is on by default.

**It collides with ADR 0007 and PRD S7.** A *session* is a fixed number of *cards*, prefetched and
snapshotted at the start. If lapsed *cards* re-enter, twenty *cards* becomes twenty to learn but an
unknown number of answers, the *progress rail* — one tick per *card*, the app's only progress
indicator — no longer knows its own length, and the end screen's numbers become ambiguous.

S7 exists so the reader finishes instead of quitting. **A session that grows when you do badly
punishes exactly the run most likely to be abandoned.**

**This is a real reduction in learning efficiency, recorded as a known deviation from Anki rather
than an oversight.** Same-day repetition is where a meaningful amount of learning happens. It is
invisible for months and then appears as a worse retention curve, which is precisely why it is
written down here rather than left implicit.

## Alternatives considered

**Keep learning steps, make the rail elastic** — truer to spaced repetition, rejected because it
discards the fixed-length rail, which is a logged Phase 2 decision and the only progress indicator
in the app.

**Bound the session by answers rather than cards** — twenty answers, a failed *card* displacing a
new one. This is the strongest alternative and the fallback if retention suffers: it keeps a
bounded, finishable session *and* same-day relearning, at the cost of the rail meaning "answers"
instead of "cards".

## Revisit if

Retention data shows lapsed *cards* are not recovering, or *false-accept rate* is clean while
retention is poor — which would point at scheduling rather than at generation. The answer-bounded
session above is the first thing to try, not elastic sessions.

## Consequences

`enable_fuzz` stays at its default (`true`) — it lives in the library and costs nothing. Everything
else about daily workload — queue ordering, new-*card* introduction rate, review caps — is the
app's job and is deferred per PRD L4. **No column is built on `elapsed_days`**: it is deprecated and
removed in `ts-fsrs` 6.0.0, and derivable from `last_review`.
