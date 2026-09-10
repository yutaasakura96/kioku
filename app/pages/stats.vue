<script setup lang="ts">
// Stats — a *place*. `10` §8's six figures, the suppression boundary and the
// ledger are **#14**; what #6 owes it is the *shell*, because ADR 0013 puts the
// shell on all three *places* and `09` §2 puts the start block in it.
//
// ⚠️ The counts are read here for the same reason they are read on the other
// two: `09` §2 requires every figure in the shell to be as of page load, and
// the shell is on this screen whether or not its body is built yet.

const counts = await useStartBlockCounts()
</script>

<template>
  <PlaceShell origin="/stats" :pending="counts.pending" :due="counts.due">
    <h1>Stats</h1>
  </PlaceShell>
</template>

<style scoped>
h1 {
  margin: var(--k-space-7) 0 0;
  font-size: 24px;
  font-weight: 400;
  color: var(--k-ink);
}
</style>
