<script setup lang="ts">
import { resolveOrigin } from '#shared/utils/origin'

// *Review* — a *mode*. `routeRules: { ssr: false }`. The session composer, the
// snapshot and the four grades are #12.
const route = useRoute()
const origin = computed(() => resolveOrigin(route.query.from))
</script>

<template>
  <main>
    <h1>Review</h1>
    <!-- ⚠️ `external` — see app/pages/vet.vue. -->
    <NuxtLink :to="origin" external>
      Done
    </NuxtLink>
  </main>
</template>
