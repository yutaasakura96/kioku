<script setup lang="ts">
// Stats — a *place*. `10` §8, `09` §4.10, `S10`. **The numbers are the
// deliverable, not reporting added to the loop** (ADR 0001): a milestone that
// produces thirty good *cards* and no measurement has shown that the code runs,
// not that the thesis holds.
//
// ⚠️ **Five figures and a ledger, each a query over rows written by the code
// that produced them.** There are no metrics tables (`04` §13), so every way a
// number can be wrong is a bug rather than a fact about a corpus — which is why
// the arithmetic is a tested seam (`shared/metrics/`) and the rows are a tested
// query (`server/utils/stats/queries.ts`), and this file is neither.
//
// ⚠️ **Rebuilt rather than edited by #23** (ADR 0062): *acceptance rate* and
// median *seconds-per-note* are retired, **retention** and **consistency** are
// the headline, and *false-accept rate* is **flag rate**.
//
// ⚠️ **Three interaction states, not five** (ADR 0035, `10` §3.3). This *place*
// ships no JavaScript, so loading is the browser's and an error is a re-rendered
// document. There is nothing to poll with and nothing to disable.
//
// ⚠️ **Every figure is as of this page load and the *shell* says so** (`09` §2).
// The line lives in `StartBlock.vue` and is the same sentence on all three
// *places*; nothing here caches, because the request *is* the instant.
//
// ⚠️ **`S12`'s export is a plain `<a>`, and that is the specification**
// (`10` §8.4, `09` §4.12): no form, no button, no client. A link that downloads
// is the one write-shaped action a `noScripts` *place* can perform with no
// mechanism at all. ⚠️ **Not a `<NuxtLink>`** — there is no router here to hand
// it to, and `/api/export` is a file, not a route.

import { summarise } from '~~/shared/metrics/stats'

const counts = await useStartBlockCounts()
const stats = await usePlace()?.stats()

// ⚠️ **Imported, never re-derived here.** § Carrying: *the arithmetic is a pure
// module and Stats must not re-derive it in SQL* — and a second copy in a
// `<script setup>` would be the same mistake with a shorter fuse. `summarise`
// is the one function that turns the rows into figures, and it is unit-tested
// over fixture rows (`11` §8).
//
// ⚠️ **The clock and the zone come back with the rows**, not from a `new Date()`
// here: the trailing window and ADR 0066's day boundary have to be read against
// the instant the rows were read, and `09` §2's *as of this page load* is one
// instant rather than two.
const view = computed(() => (stats ? summarise(stats.rows, stats.context) : null))
</script>

<template>
  <PlaceShell origin="/stats" :flagged="counts.flagged" :due="counts.due">
    <template v-if="view">
      <StatsFigures :view="view" />
      <StatsLedger :rows="stats!.ledger" />

      <!-- `10` §8.4. `03` §13.6 makes this the backup, which is why it sits
        next to the numbers the reader already checks. -->
      <p class="export">
        <a href="/api/export">Export everything</a>
        <span class="aside">Notes with their meanings and claims, cards, grades and every scheduling epoch, superseded ones included.</span>
      </p>
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
/* `10` §8.4: accent link text, `32px` below the ledger, a 13px Newsreader
   italic aside. */
.export {
  margin: var(--k-space-7) 0 0;
  font-size: 15px;
}

.export a {
  color: var(--k-accent);
}

.export a:hover {
  color: var(--k-accent-hover);
}

.export .aside {
  display: block;
  margin-top: var(--k-space-2);
  font-family: var(--k-face-en);
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

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
