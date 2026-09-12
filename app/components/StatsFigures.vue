<script setup lang="ts">
// `S10`'s figure grid — `10` §8.1 and §8.2.
//
// ⚠️ **The suppression boundary is the only branch on this screen**, and it is
// the only `if` in this file. `11` §3: *nineteen suppresses, twenty reports*,
// and it is **off by default in every naive implementation** — a grid that
// renders `acceptanceRate` straight into a percentage looks finished and is
// reporting a rate over four *notes* as a finding.
//
// ⚠️ **Suppressed is not hidden** (`10` §8.2, ADR 0058). Each withheld ratio
// keeps its eyebrow and its 38px slot and shows the raw pair the figure would
// have been computed from, "so the reader can see the numbers accumulating
// toward the threshold". Dashing them out would take that away.
//
// ⚠️ **No threshold is compared against anywhere on this screen** (ADR 0037).
// Nothing here colours a figure by whether it is good, and nothing may: ADR 0018
// walks the model *down* until *acceptance rate* degrades, so the number has to
// be free to fall without the screen calling it a failure.

import { formatDuration } from '~~/shared/metrics/stats'
import type { Figure, StatsView } from '~~/shared/metrics/stats'

const props = defineProps<{ view: StatsView }>()

/** `10` §8.2's raw pair — what was measured, over what could have been. */
function pair(figure: Figure): string {
  return `${figure.have} / ${figure.possible}`
}

/**
 * ⚠️ **An em dash, never `0`.** `shared/metrics/acceptance.ts` returns `null`
 * rather than zero when nothing has been generated, and the reason survives onto
 * the screen: a `0%` under ACCEPTANCE RATE before the first paste is a claim
 * about a pipeline that produced nothing usable.
 */
const NO_FIGURE = '—'

function render(figure: Figure, format: (value: number) => string): string {
  if (props.view.suppressed)
    return pair(figure)

  return figure.value === null ? NO_FIGURE : format(figure.value)
}

/**
 * ⚠️ **`<1%` rather than `0%`, for the same reason `formatDuration` says `<1m`.**
 * *False-accept rate* exists to detect a *vetting* step that has become theatre
 * (`CONTEXT.md`), and one flag over three hundred accepted *notes* rounds to
 * zero — which reads as *nothing has ever been wrong*, the one claim this figure
 * must never make by accident. A measured non-zero is never rendered as a zero.
 */
function percent(value: number): string {
  const rounded = Math.round(value * 100)

  if (rounded === 0 && value > 0)
    return '<1%'

  return `${rounded}%`
}

const seconds = (value: number) => value.toFixed(1)

const columns = computed(() => [
  {
    eyebrow: 'ACCEPTANCE RATE',
    figure: render(props.view.acceptance, percent),
  },
  {
    eyebrow: 'FALSE-ACCEPT RATE',
    // ⚠️ Unclamped. A second flag on the same *card* is a second row (`11` §3),
    // so a corpus the reader keeps finding faults in reads above 100% — which is
    // the corpus `S9` exists to report.
    figure: render(props.view.falseAccept, percent),
  },
  {
    eyebrow: 'SECONDS PER NOTE',
    figure: render(props.view.secondsPerNote, seconds),
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
    // ⚠️ Never suppressed — it is the count the boundary is measured on, and how
    // the reader watches it approach twenty.
    eyebrow: 'NOTES VETTED',
    figure: props.view.notesVetted,
  },
])
</script>

<template>
  <div>
    <SessionTally :columns="columns" />

    <!-- `S10` and PRD §4: raw counts **and a line saying why**. `10` §8.2 gives
      the sentence and it is not to be paraphrased — the second half is the
      argument and the first is only the rule. -->
    <p v-if="view.suppressed" class="aside">
      Ratios appear at twenty vetted notes. A rate over seventeen is noise.
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
