<script setup lang="ts">
// `10` §3.1 — the *shell*'s bar. On `/`, `/sources`, `/sources/:id`,
// `/sources/:id/delete` and `/stats`, and nowhere else (ADR 0013, `09` §2).
//
// ⚠️ **The nav names the three *places* and never a *mode*** (ADR 0032). A
// *mode* is entered from the start block, which is a different component for a
// different reason — the nav is text, the start block is bounded.
//
// ⚠️ **The current *place* is marked by ink alone, not by the accent.** `05` §2
// spends the accent on where you are *in a task* and on what costs you the
// decision, and "which of three screens am I on" is neither. One ramp step
// between `--k-ink` and `--k-ink-secondary` is 15.67 against 4.59, which is not
// subtle.

import { PLACES } from '~~/shared/utils/origin'

const route = useRoute()

const NAMES: Record<string, string> = {
  '/': 'Ingest',
  '/sources': 'Sources',
  '/stats': 'Stats',
}

/** `/sources/:id` is inside Sources, so the nav marks Sources — `09` §2. */
function isCurrent(place: string): boolean {
  if (place === '/')
    return route.path === '/'

  return route.path === place || route.path.startsWith(`${place}/`)
}
</script>

<template>
  <header class="bar">
    <nav class="nav">
      <NuxtLink
        v-for="place in PLACES"
        :key="place"
        :to="place"
        :class="{ current: isCurrent(place) }"
        :aria-current="isCurrent(place) ? 'page' : undefined"
      >
        {{ NAMES[place] }}
      </NuxtLink>
    </nav>

    <!-- The door, quiet, for signing out (`08` §2). -->
    <NuxtLink to="/auth" class="door">
      Sign out
    </NuxtLink>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--k-bar-height); /* 56px — the horizon *Vet*'s chrome bar shares */
  padding: 0 var(--k-gutter);
  border-bottom: 1px solid var(--k-rule);
}

.nav {
  display: flex;
  gap: var(--k-space-6); /* 28px */
}

/* ⚠️ No face, no border, no underline — `10` §3.1. */
.nav a,
.door {
  font-size: 15px;
  font-weight: 400;
  color: var(--k-ink-secondary);
  text-decoration: none;
}

.nav a.current {
  color: var(--k-ink);
}

/* `10` §3.3 — a nav item's hover moves its ink and nothing else. There is no
   active state and no disabled state (ADR 0035). */
.nav a:hover,
.door:hover {
  color: var(--k-ink);
}
</style>
