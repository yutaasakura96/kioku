<script setup lang="ts">
import { resolveOrigin } from '#shared/utils/origin'

// *Vet* — a *mode*. `routeRules: { ssr: false }`. The mode itself, the three
// keystrokes, minting and undo are #10 and #11.
const route = useRoute()
const origin = computed(() => resolveOrigin(route.query.from))
</script>

<template>
  <main>
    <h1>Vet</h1>
    <!--
      ⚠️ `external` is load-bearing. A bare <NuxtLink> client-renders the
      *place* into the page that is already running and hands the reader a
      `noScripts` screen with a live Vue app on it, with no error anywhere
      (ADR 0032, `09` §5.2, verification §12.1). Nothing else in the system
      would notice; `test/e2e/no-scripts.test.ts` is the cover.
    -->
    <NuxtLink :to="origin" external>
      Done
    </NuxtLink>
  </main>
</template>
