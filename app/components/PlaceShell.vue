<script setup lang="ts">
// The *shell* — `10` §3, `09` §2, ADR 0013. The bar, the start block, its
// aside, and the page body in whichever measure the *place* reads at.
//
// ⚠️ **It is a component the three *places* opt into, not a layout they inherit.**
// ADR 0013 makes "which screens carry the shell" load-bearing — a *mode* has no
// navigation, and that is what a mode *is* — so it is written at each of the
// three call sites where it can be seen, rather than defaulted into and then
// switched off twice.
//
// ⚠️ **`05` §5's measures, and `10` §2.2 adds no sixth.** Ingest takes 760 (one
// object of attention that the reader acts on); the Sources list and Stats take
// 940 (a list is read across).

import type { Place } from '~~/shared/utils/origin'

withDefaults(
  defineProps<{
    origin: Place
    pending: number
    due: number
    /** `05` §5's measure for this *place* — `10` §2.2. */
    measure?: string
  }>(),
  { measure: 'var(--k-measure-read)' },
)
</script>

<template>
  <div>
    <ShellBar />

    <main :style="{ '--measure': measure }">
      <StartBlock :origin="origin" :pending="pending" :due="due" />

      <slot />
    </main>
  </div>
</template>

<style scoped>
main {
  max-width: var(--measure);

  /* `10` §3.2: the start block sits `28px` below the bar's rule, `--k-gutter`
     aligned, with no rule of its own. */
  padding: var(--k-space-6) var(--k-gutter) var(--k-space-10);
}
</style>
