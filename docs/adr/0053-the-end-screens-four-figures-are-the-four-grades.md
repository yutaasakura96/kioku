# The end screen's four figures are the four grades

***Review*'s end screen renders the *session tally* as the *grade* distribution — `FORGOT`, `HARD`,
`GOOD`, `EASY` — one column per *grade*, each a count of the *cards* in the run that got it.**

`10` §5.6 puts "the *session tally* — `05` §7 unchanged: four equal columns" at the top of the end
screen and never says which four. `S7` says the screen shows "the *session*'s numbers". Eleven
documents name no candidate set, so #12 had to choose one, and this is where the choice is.

## Why the distribution

**It is the only set of four the run actually produces.** A *session* is a fixed number of *cards*
and every one of them ends as exactly one of four values (ADR 0016, ADR 0034) — so the distribution
is a partition of the run rather than a selection from it. Four columns and four *grades* is not a
coincidence to be spent on something else.

**It answers the question the reader has.** `S7` exists so the reader finishes instead of quitting;
at the end of a run the thing they want to know is *how did that go*, and one row of four numbers
says it. `4 / 3 / 11 / 2` is legible at a glance and `1 / 0 / 18 / 1` is a different feeling about
the same twenty *cards*.

**Nothing else in it needs computing.** The *progress rail* above already says the run is finished
and how long it was — `05` §7 turns every tick `--k-ink-ground` and the right-hand counter
`--k-ink` — so a `REVIEWED` column would be the rail's own length restated in 38px type. `Forgot`
doubles as the lapse count, which is the one number FSRS itself treats as different in kind: grade 1
is the only one that increments `lapses` (verification §13.1).

**It reuses the eyebrow vocabulary the screen already has.** The labels on the four controls in the
footer are `Forgot`, `Hard`, `Good`, `Easy`; the eyebrows above the figures are the same four words.
The reader does not have to learn a second naming for the thing they just pressed.

## Alternatives considered

**`REVIEWED` · `FORGOT` · `FLAGGED` · `NEXT DUE`** — the run summarised rather than broken down.
Rejected on three counts: `REVIEWED` restates the rail, `FLAGGED` is `X` and therefore #13's, so the
column would be a permanent zero until that ships, and `NEXT DUE` is a *date* in a row of counts —
`05` §7's figure slot is 38px Newsreader and a timestamp does not sit in it. The next-due instant
already has a home, and it is `10` §5.7's empty state.

**`CARDS` · `MINUTES` · `ACCURACY` · `NEXT DUE`** — the shape most spaced-repetition apps use.
Rejected because three of the four are numbers this application does not measure. There is no
per-*session* timer (`03` §12 measures *seconds-per-note* in *Vet* and *time-to-first-review* across
the whole pipeline, and neither is this), and *accuracy* is a ratio — `S10`'s suppression boundary
governs every ratio in the app and it is #14's, so a ratio here would be the first one shipped
outside the rule that governs them.

**Leaving the tally out and showing the rail alone.** Rejected: `10` §5.6 lists the tally as the
first thing on the screen, and `S7`'s acceptance criterion says the *session* "ends with a screen
showing the *session*'s numbers". A screen with no numbers on it would not be that screen.

## Consequences

`SessionTally.vue` is `10` §11's "one component with a column count, not two" — Stats passes five
(`10` §8.1) and this passes four, and nothing else about it differs. **The columns are computed from
the snapshot rather than from a query**: every position in a finished *session* carries its rating,
so the end screen needs no read of its own and the numbers are the ones on the reader's screen.

⚠️ **A position that was passed without a *grade* is in none of the four columns**, and that becomes
reachable with #13's `X`. The four counts will then sum to less than the rail's length — which is
already what `10` §5.3's 2px flagged tick says visually, and is the honest shape rather than a fifth
column labelled after a key that skipped the question.

## Revisit if

#13 makes a flagged position common enough that a run's four figures stop adding up to something the
reader recognises, or Stats grows a per-*session* history that wants the same four numbers in a
different arrangement — at which point this component takes the arrangement and the count together.
