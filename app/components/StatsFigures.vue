<script setup lang="ts">
// `S10`'s figure grid — `10` §8.1 and §8.2.
//
// ⚠️ **Rebuilt by #23** (ADR 0062). *Acceptance rate* and *seconds per note* are
// gone; **retention** and **consistency** are the headline, **flag rate** is
// *false-accept rate* with a denominator that still means something, and the
// raw count is *cards minted* rather than *notes vetted* — because after
// ADR 0064 nothing is vetted.
//
// ⚠️ **The suppression boundary is still the only branch on this screen**, and
// there are now three of them because ADR 0062 gives each ratio its own
// evidence. `shared/metrics/stats.ts` computes every value whether or not it
// will be shown and sets `suppressed` beside it; **this is the only file that
// reads that flag** (ADR 0058), which is what keeps the boundary testable at
// nineteen and twenty from the seam.
//
// ⚠️ **Suppressed is not hidden** (`10` §8.2, ADR 0058). Each withheld ratio
// keeps its eyebrow and its 38px slot and shows the raw pair the figure would
// have been computed from, "so the reader can see the numbers accumulating
// toward the threshold". Dashing them out would take that away.
//
// ⚠️ **No threshold is compared against anywhere on this screen** (ADR 0037).
// Nothing here colours a figure by whether it is good, and nothing may. ADR 0062
// names the price: flag rate is now the only routine reading on the model's
// fills, so it has to be free to move without the screen calling it a failure.

import {
  CARDS_APPEAR_AT,
  CONSISTENCY_APPEARS_AT,
  RETENTION_APPEARS_AT,
  formatDuration,
} from '~~/shared/metrics/stats'
import type { Figure, StatsView } from '~~/shared/metrics/stats'

const props = defineProps<{ view: StatsView }>()

/** `10` §8.2's raw pair — what was measured, over what could have been. */
function pair(figure: Figure): string {
  return `${figure.have} / ${figure.possible}`
}

/**
 * ⚠️ **An em dash, never `0`.** `shared/metrics/stats.ts` returns `null` rather
 * than zero when there is nothing to divide, and the reason survives onto the
 * screen: a `0%` under RETENTION before the first review is a claim that the
 * reader has forgotten everything they have been asked.
 */
const NO_FIGURE = '—'

function render(figure: Figure, format: (value: number) => string): string {
  if (figure.suppressed)
    return pair(figure)

  return figure.value === null ? NO_FIGURE : format(figure.value)
}

/**
 * ⚠️ **`<1%` rather than `0%`.** Flag rate exists to detect a pipeline writing
 * *cards* that are wrong (`CONTEXT.md`, ADR 0062), and one flag over three
 * hundred *cards* rounds to zero — which reads as *nothing has ever been wrong*,
 * the one claim this figure must never make by accident. A measured non-zero is
 * never rendered as a zero.
 *
 * ⚠️ **And `>99%` rather than `100%`, for the mirror of the same reason.**
 * Retention is the figure ADR 0062 makes the headline, and a `100%` that is
 * really 199 of 200 is the screen claiming a perfect record the rows do not
 * show.
 */
function percent(value: number): string {
  const rounded = Math.round(value * 100)

  if (rounded === 0 && value > 0)
    return '<1%'

  if (rounded === 100 && value < 1)
    return '>99%'

  return `${rounded}%`
}

const columns = computed(() => [
  {
    eyebrow: 'RETENTION',
    figure: render(props.view.retention, percent),
  },
  {
    eyebrow: 'CONSISTENCY',
    figure: render(props.view.consistency, percent),
  },
  {
    // ⚠️ Bounded by one, where *false-accept rate* deliberately was not: this
    // counts distinct *cards* over *cards* minted (ADR 0062), and a share of the
    // deck cannot exceed one.
    eyebrow: 'FLAG RATE',
    figure: render(props.view.flagRate, percent),
  },
  {
    eyebrow: 'TIME TO FIRST REVIEW',
    figure: render(props.view.timeToFirstReview, formatDuration),
    // ⚠️ `03` §12, `10` §8.1: the environment rides **on the number**. Figures
    // measured against a laptop are not comparable across ADR 0022's move, and
    // putting it on the row rather than in a paragraph is what stops a future
    // session averaging across the boundary. Two names mean the figure already
    // spans it.
    note: props.view.workerEnvironments.join(' · ') || undefined,
  },
  {
    // ⚠️ Never suppressed — it is the count two of the boundaries are measured
    // on, and how the reader watches them approach twenty.
    eyebrow: 'CARDS MINTED',
    figure: props.view.cardsMinted,
  },
])

/**
 * `S10` and PRD §4 require raw counts **and a line saying why**, and ADR 0058
 * fixes the sentence's second half: *the second sentence is the argument and the
 * first is only the rule*. ⚠️ **The rule is what #23 changes** — there is no
 * single boundary to name any more, because ADR 0062 gives each ratio its own
 * evidence — **and the argument is carried across unparaphrased.**
 */
const aside = computed(() => {
  const withheld = [
    props.view.retention.suppressed && `retention at ${RETENTION_APPEARS_AT} reviews of a learned card`,
    props.view.consistency.suppressed && `consistency at ${CONSISTENCY_APPEARS_AT} days`,
    props.view.flagRate.suppressed && `flag rate and time to first review at ${CARDS_APPEAR_AT} cards`,
  ].filter((entry): entry is string => typeof entry === 'string')

  if (withheld.length === 0)
    return null

  // ⚠️ **The lead-in is what makes each clause position-independent.** Written
  // as a bare list the first entry has to be capitalised, so the same withheld
  // ratio reads two different ways depending on which others are withheld
  // beside it — which is a sentence that changes when nothing about it did.
  return `Each ratio appears once there is enough behind it: ${withheld.join(', ')}. `
    + 'A rate over seventeen is noise.'
})
</script>

<template>
  <div>
    <SessionTally :columns="columns" />

    <p v-if="aside" class="aside">
      {{ aside }}
    </p>
  </div>
</template>

<style scoped>
/* `10` §8.2: `20px` beneath the grid, 13px Newsreader italic, secondary ink. */
.aside {
  margin: var(--k-space-5) 0 0;
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}
</style>
