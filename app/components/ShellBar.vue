<script setup lang="ts">
// `10` §3.1 — the *shell*'s bar. On every *place* (`shared/utils/origin.ts`)
// and nowhere else (ADR 0013, `09` §2).
//
// ⚠️ **The prototype's bar since #71** (ADR 0078): the name, Home and
// Categories, and More at the far end. *Words* is the prototype's third item
// and no ticket has built it, so it is not drawn. Every other *place* is
// reached from More, and More is marked while the reader is on one.
//
// ⚠️ **Below 720px the items move to a bar of tabs at the foot of the
// screen**, as the prototype's phone frame has them, and the bar at the top
// keeps the name alone. Both are links; no script is involved.
//
// ⚠️ **The nav names the *places* and never a *mode*** (ADR 0032). A
// *mode* is entered from the start block or from Home's two cards.
//
// ⚠️ **The current item is marked by ink and the prototype's accent rule**
// under it. ⚠️ This was ink alone until #71; the prototype, which the owner
// kept as built, draws the rule.

import { NAV, navItemOf } from '~~/shared/utils/origin'

const route = useRoute()

const NAMES: Record<string, string> = {
  '/': 'Home',
  '/categories': 'Categories',
  '/more': 'More',
}

const current = computed(() => navItemOf(route.path))
const left = NAV.filter(item => item !== '/more')
</script>

<template>
  <header class="bar">
    <NuxtLink to="/" class="brand" aria-label="Kioku home">
      <span lang="ja">記憶</span>Kioku
    </NuxtLink>

    <nav class="nav" aria-label="Main">
      <NuxtLink
        v-for="item in left"
        :key="item"
        :to="item"
        :class="{ current: current === item }"
        :aria-current="current === item ? 'page' : undefined"
      >
        {{ NAMES[item] }}
      </NuxtLink>
    </nav>

    <span class="grow" />

    <NuxtLink
      to="/more"
      class="more"
      :class="{ current: current === '/more' }"
      :aria-current="current === '/more' ? 'page' : undefined"
    >
      More
    </NuxtLink>
  </header>

  <nav class="tabs" aria-label="Main">
    <NuxtLink
      v-for="item in NAV"
      :key="item"
      :to="item"
      :class="{ current: current === item }"
      :aria-current="current === item ? 'page' : undefined"
    >
      {{ NAMES[item] }}
    </NuxtLink>
  </nav>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: var(--k-space-6); /* 28px */
  height: var(--k-bar-height); /* 56px — the horizon *Vet*'s chrome bar shares */
  padding: 0 var(--k-gutter);
  border-bottom: 1px solid var(--k-rule);
}

/* The prototype's `.brand`: 記憶 in the accent, then the name. */
.brand {
  display: flex;
  align-items: baseline;
  gap: var(--k-space-2);
  font-size: 19px;
  color: var(--k-ink);
  text-decoration: none;
}

.brand [lang] {
  font-size: 20px;
  font-weight: 600;
  color: var(--k-accent);
}

.nav {
  display: flex;
  gap: 6px;
}

.grow {
  flex: 1;
}

/* ⚠️ No face and no border — `10` §3.1 — and the prototype's padding. */
.nav a,
.more {
  padding: 8px 10px;
  font-size: 16px;
  font-weight: 400;
  color: var(--k-ink-secondary);
  text-decoration: none;
}

.nav a.current,
.more.current {
  color: var(--k-ink);
  box-shadow: inset 0 -2px 0 var(--k-accent);
}

/* `10` §3.3 — a nav item's hover moves its ink and nothing else. There is no
   active state and no disabled state (ADR 0035). */
.nav a:hover,
.more:hover {
  color: var(--k-ink);
}

.tabs {
  display: none;
}

/* `10` §10.1's breakpoint: the prototype's phone frame. */
@media (width < 720px) {
  .nav,
  .more {
    display: none;
  }

  .tabs {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    background: var(--k-raised);
    border-top: 1px solid var(--k-rule);
  }

  .tabs a {
    padding: 13px 4px 14px;
    font-size: 14.5px;
    color: var(--k-ink-secondary);
    text-align: center;
    text-decoration: none;
  }

  .tabs a.current {
    color: var(--k-ink);
    box-shadow: inset 0 2px 0 var(--k-accent);
  }
}
</style>
