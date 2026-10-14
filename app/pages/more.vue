<script setup lang="ts">
// More — the prototype's `vMore`, a *place* since #71 (ADR 0078). Extras and
// settings: everything that is not Home or Categories.
//
// ⚠️ **This is where *Vet*, *Sources* and *Stats* live** (ADR 0078 §3). The
// prototype has no place for them and #71 had to say where they go; each is
// still built and still used, so each is a row here rather than removed:
// *Vet* is the flag queue a flagged word goes to, *Sources* is where an import
// is read and deleted, and *Stats* is the numbers ADR 0062 asks for.
//
// ⚠️ ***Retake the placement test* is not drawn**: the test is #72's, and a
// row that led nowhere would be a disabled control in disguise (ADR 0035).
//
// ⚠️ **Every row is a link.** This route ships no JavaScript (`03` §2.1).
// *Vet* is a *mode* and is entered with `from=/more`, so its Done comes back
// here (ADR 0032). The export is `S12`'s plain link (`09` §4.12).

const counts = await useStartBlockCounts()

const rows = computed(() => [
  { to: '/add', title: 'Add my own words', sub: 'Paste a word list or any Japanese text. Kioku finds the words.' },
  { to: '/add', title: 'Import an Anki deck', sub: 'Bring in any .apkg deck and study it here.' },
  { to: '/settings', title: 'Study settings', sub: 'New words per lesson and per day, and when reviews pause them.' },
  {
    to: `/vet?from=${encodeURIComponent('/more')}`,
    title: 'Vet flagged words',
    sub: counts.flagged === 0
      ? 'Words you flagged as wrong in a quiz, to keep, fix or drop. None waiting.'
      : `Words you flagged as wrong in a quiz, to keep, fix or drop. ${counts.flagged} waiting.`,
  },
  { to: '/sources', title: 'Sources', sub: 'Every word list, text and deck you have added, and where each run stands.' },
  { to: '/stats', title: 'Stats', sub: 'Retention, consistency and how often you flag a word.' },
  { to: '/api/export', title: 'Export my data', sub: 'Everything you have learned, as a file.', external: true },
  { to: '/auth', title: 'Sign out', sub: '' },
])
</script>

<template>
  <PlaceShell
    origin="/more"
    :flagged="counts.flagged"
    :due="counts.due"
    :new-today="counts.newToday"
    measure="var(--k-measure-told)"
    :start-block="false"
  >
    <section class="more">
      <span class="eyebrow">More</span>
      <h1>Extras and settings.</h1>

      <nav class="menu" aria-label="More">
        <NuxtLink v-for="row in rows" :key="row.title" :to="row.to" :external="row.external" class="row">
          <span>
            <b>{{ row.title }}</b>
            <small v-if="row.sub">{{ row.sub }}</small>
          </span>
          <span class="arr" aria-hidden="true">→</span>
        </NuxtLink>
      </nav>

      <!-- `09` §2: the flagged count above is as of the page load. -->
      <p class="asof">
        as of this page load
      </p>
    </section>
  </PlaceShell>
</template>

<style scoped>
.more {
  margin-top: var(--k-space-3);
}

.eyebrow {
  display: block;
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--k-ink-secondary);
}

h1 {
  margin: 6px 0 26px;
  font-size: 40px;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

/* The prototype's `.menu`. */
.menu {
  display: flex;
  flex-direction: column;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 16px 2px;
  border-bottom: 1px solid var(--k-rule);
  color: var(--k-ink);
  text-decoration: none;
}

.row:first-child {
  border-top: 1px solid var(--k-rule);
}

.row:hover {
  background: var(--k-raised);
}

.row b {
  display: block;
  font-size: 19px;
  font-weight: 400;
}

.row small {
  font-size: 14.5px;
  color: var(--k-ink-secondary);
}

.asof {
  margin: var(--k-space-3) 0 0;
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

.arr {
  font-family: var(--k-face-mono);
  color: var(--k-ink-secondary);
}

@media (width < 720px) {
  h1 {
    font-size: 30px;
  }
}
</style>
