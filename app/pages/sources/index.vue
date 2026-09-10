<script setup lang="ts">
// Sources — the *place*. `10` §7.1, a **940px** column: a list is read across,
// which is what 940 means (`05` §5, `10` §2.2).
//
// ⚠️ **Deleted *sources* stay in the list.** `S11` requires them to stay
// readable, and `10` §7.1 marks a deleted row with a 13px Newsreader italic
// aside rather than a colour or a strike-through — "this is not what it was" is
// an aside about the row rather than a state of it. The filtering happens
// nowhere: `server/utils/ingest/queries.ts` returns them on purpose.
//
// ⚠️ **The empty state is a requirement, not a fallback** (PRD §4, `09` §8).
// "Nothing ingested." and one way on — and here the quiet affordance **keeps its
// accent `→`**, because it is the only thing on the screen, which is the
// condition `10` §3.2 named for keeping it.

const counts = await useStartBlockCounts()
const sources = (await usePlace()?.sources()) ?? []
</script>

<template>
  <PlaceShell origin="/sources" :pending="counts.pending" :due="counts.due">
    <ul v-if="sources.length" class="list">
      <li v-for="source in sources" :key="source.id" class="row">
        <p class="line">
          <NuxtLink :to="`/sources/${source.id}`" class="title">
            {{ source.title }}
          </NuxtLink>

          <!-- `05` §4 gives 13px italic to asides. Not a colour, not a
            strike-through — `10` §7.1. -->
          <span v-if="source.deletedAt" class="deleted">deleted</span>
        </p>

        <p class="facts">
          <span>{{ submittedAtFormat.format(source.submittedAt) }}</span>
          <span class="dot" aria-hidden="true">·</span>
          <span>{{ source.status ?? 'not ingested' }}</span>
          <span class="dot" aria-hidden="true">·</span>
          <span>{{ source.noteCount }} {{ source.noteCount === 1 ? 'note' : 'notes' }}</span>
        </p>
      </li>
    </ul>

    <!-- `05` §7's empty-state block: left-aligned in a 560px column, never
      centred. A 46px statement, 18px down an 18px body, then a full-width rule,
      then what the state offers. -->
    <section v-else class="empty">
      <h1>Nothing ingested.</h1>
      <p>Paste two pages of Japanese into Ingest and the notes come back on their own.</p>
      <hr>
      <NuxtLink to="/" class="affordance">
        <span>Go to Ingest</span>
        <span class="arrow" aria-hidden="true">→</span>
      </NuxtLink>
    </section>
  </PlaceShell>
</template>

<style scoped>
.list {
  margin: var(--k-space-7) 0 0;
  padding: 0;
}

.row {
  padding: var(--k-space-5) 0; /* 20px */
  border-top: 1px solid var(--k-rule);
  list-style: none;
}

.line {
  display: flex;
  align-items: baseline;
  gap: var(--k-space-2);
  margin: 0;
}

.title {
  font-size: 17px;
  font-weight: 400;
  color: var(--k-ink);
  text-decoration: none;
}

.title:hover {
  color: var(--k-accent-hover);
}

.deleted {
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--k-space-2);
  margin: var(--k-space-2) 0 0; /* 8px below the title */
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-secondary);
}

.dot {
  color: var(--k-dot);
}

.empty {
  max-width: var(--k-measure-empty); /* 560px — when there is nothing to do */
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
  margin: var(--k-space-5) 0 0; /* 18px snaps to 20 — `05` §5 */
  font-size: 18px;
  line-height: 1.55;
  color: var(--k-ink-secondary);
}

.empty hr {
  margin: var(--k-space-7) 0 0; /* 32-34px clearance — `05` §7 */
  border: 0;
  border-top: 1px solid var(--k-rule);
}

/* The quiet affordance — `05` §7. **With its accent arrow**, because here it is
   the only thing on the screen (`10` §3.2, §7.1). */
.affordance {
  display: inline-flex;
  align-items: baseline;
  gap: var(--k-space-3);
  margin-top: var(--k-space-7);
  padding: 13px 20px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-size: 17px;
  color: var(--k-ink);
  text-decoration: none;
}

.affordance:hover {
  background: var(--k-key-face);
}

.arrow {
  color: var(--k-accent);
}
</style>
