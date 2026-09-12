<script setup lang="ts">
// Stats — a *place*. `10` §8, `09` §4.10, `S10`. **The numbers are the
// deliverable, not reporting added to the loop** (ADR 0001): a milestone that
// produces thirty good *cards* and no measurement has shown that the code runs,
// not that the thesis holds.
//
// ⚠️ **Six figures, each a query over rows written by the code that produced
// them.** There are no metrics tables (`04` §13), so every way a number can be
// wrong is a bug rather than a fact about a corpus — which is why the arithmetic
// is a tested seam (`shared/metrics/`) and the rows are a tested query
// (`server/utils/stats/queries.ts`), and this file is neither.
//
// ⚠️ **Three interaction states, not five** (ADR 0035, `10` §3.3). This *place*
// ships no JavaScript, so loading is the browser's and an error is a re-rendered
// document. There is nothing to poll with and nothing to disable.
//
// ⚠️ **Every figure is as of this page load and the *shell* says so** (`09` §2).
// The line lives in `StartBlock.vue` and is the same sentence on all three
// *places*; nothing here caches, because the request *is* the instant.
//
// ⚠️ **`S12`'s export link is not here, and that is scope rather than an
// omission.** `10` §8.4 puts `<a href="/api/export">` on this screen and issue
// #1 §"What is out" puts `S12` outside milestone 1 — "a `MUST` for v1 and not
// part of the loop" — with the route, its `Content-Disposition` and the test
// that reads it back all owed together. A link to a route that does not exist is
// not an offer.

import { summarise } from '~~/shared/metrics/stats'

const counts = await useStartBlockCounts()
const stats = await usePlace()?.stats()

// ⚠️ **Imported, never re-derived here.** § Carrying: *the acceptance rate
// arithmetic is a pure module and Stats must not re-derive it in SQL* — and a
// second copy in a `<script setup>` would be the same mistake with a shorter
// fuse. `summarise` is the one function that turns the rows into figures, and
// it is unit-tested over fixture rows (`11` §8).
const view = computed(() => (stats ? summarise(stats.rows) : null))
</script>

<template>
  <PlaceShell origin="/stats" :pending="counts.pending" :due="counts.due">
    <template v-if="view">
      <StatsFigures :view="view" />
      <StatsLedger :rows="stats!.ledger" />
    </template>

    <!-- PRD §4, `09` §8: the empty state is a requirement, not a fallback. It is
      reachable when no session resolved — `usePlace()` is absent then — which is
      the same fail-closed path the other two *places* take. -->
    <section v-else class="empty">
      <h1>Nothing measured yet.</h1>
      <p>The figures appear as soon as there is something to read them from.</p>
    </section>
  </PlaceShell>
</template>

<style scoped>
.empty {
  max-width: var(--k-measure-empty);
  margin-top: var(--k-space-8);
}

.empty h1 {
  margin: 0;
  font-size: 46px;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: var(--k-ink);
}

.empty p {
  margin: var(--k-space-5) 0 0;
  font-size: 18px;
  line-height: 1.55;
  color: var(--k-ink-secondary);
}
</style>
