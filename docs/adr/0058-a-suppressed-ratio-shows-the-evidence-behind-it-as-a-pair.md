# A suppressed ratio shows the evidence behind it, as a pair

**Below twenty vetted *notes* each of `S10`'s four ratios keeps its eyebrow and its 38px slot and
shows `have / possible` — the two raw counts the withheld figure would have been computed from. All
four, in one shape, including the two that are medians rather than percentages.**

## What was already decided, and the gap in it

`10` §8.2 decides most of this: *the ratio columns keep their eyebrows and their 38px slot, and show
their raw pair instead of a percentage* — `4 / 17`, same 38px Newsreader 300, "not hidden, not dashed
out: the reader can see the numbers accumulating toward the threshold". `S10` and PRD §4 require raw
counts and a line saying why.

**What it does not decide is what the pair is for the two figures that are not percentages.**
*Acceptance rate* and *false-accept rate* have an obvious numerator and denominator. Median
*seconds-per-note* and *time-to-first-review* are medians over samples: a median has no pair, and
`10` §8.2 calls all four "the ratio columns" anyway.

## The rule: a pair is how much evidence stands behind the figure

`have / possible` — what was measured, over what could have been:

| Figure | `have` | `possible` |
| --- | --- | --- |
| *Acceptance rate* | unedited accepts | *notes generated* (`acceptance.ts`) |
| *False-accept rate* | flags | accepted *notes* |
| Median *seconds-per-note* | unedited accepts carrying a `seconds_to_vet` stamp | unedited accepts |
| *Time-to-first-review* | *sources* with a first *review* | *sources* ingested |

For the two percentages this is exactly `10` §8.2's `4 / 17` and nothing changes. For the two medians
it answers the question the suppressed state is for — *how thin is this* — and it answers it more
usefully than the median would: **a median over three samples is not improved by being shown**, and
the pair is the only thing on the screen that would say there were three.

⚠️ **It also makes ADR 0057's exclusion visible.** A *time-to-first-review* median over the two
*sources* the reader studied, out of five they pasted, reads `2 / 5`. Without the pair the exclusion
is invisible and the figure silently describes a different population from the one the reader thinks
it does.

## Alternatives considered

**Dash the two medians out and pair only the two percentages.** Rejected on `10` §8.2's own words —
"not hidden, not dashed out" — and because it would put two rendering rules on one row of four
figures for a distinction (percentage versus median) the reader has no reason to care about.

**Show the sample count alone, `n = 3`.** Rejected: it is a second visual language on the same row,
and it drops the half that matters. `3` says little; `3 / 20` says seventeen accepts carry no stamp,
which is a bug report.

**Suppress by not computing.** Rejected. `shared/metrics/stats.ts` computes every ratio whether or
not it will be shown, and the screen withholds it — suppression is a fact about what is rendered, not
about the arithmetic. Computing conditionally would put `S10`'s only branch inside the seam where
`11` §3 asks for it to be tested at nineteen **and** twenty, and make the boundary unobservable from
the one place it is cheap to observe.

## Consequences

`shared/metrics/stats.ts` returns a `Figure` — `{ value, have, possible }` — for each of the four,
and `summarise` fills all three fields always. `app/components/StatsFigures.vue` is the only place
that reads `suppressed`, which is what makes `S10`'s single branch a single `if` in one file.

⚠️ **The aside is `10` §8.2's sentence, verbatim**: *Ratios appear at twenty vetted notes. A rate
over seventeen is noise.* It is the "line saying why" that `S10` and PRD §4 require, and it is not to
be paraphrased — the second sentence is the argument and the first is only the rule.

## Revisit if

A figure arrives whose evidence is not a pair of counts — a distribution, or a number with a
confidence interval — at which point the row has more than one shape in it and this rule is the thing
to answer.
