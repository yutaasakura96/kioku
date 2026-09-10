<script setup lang="ts">
// One *source*, readable — `10` §7.2's **first half only**.
//
// ⚠️ **This is deliberately not `S11`.** `10` §7.2 gives this screen the
// *notes* that came from the *source*, their *occurrence* positions inside the
// text, and a route to the delete confirmation (§7.3); #6's acceptance criteria
// put all three out of this milestone. What is built is the part two of #6's
// own criteria depend on: `09` §4.2's "offers to open the existing one" and
// `10` §7.1's list row both link here, and a link to a `404` is not an offer.
//
// So this renders what ADR 0008 retained the content *for* — the material, in
// full, readable — and nothing that would be inventing `S11`'s answers early.

const route = useRoute()

const counts = await useStartBlockCounts()
const source = (await usePlace()?.sourceDetail(String(route.params.id))) ?? null

if (!source)
  throw createError({ statusCode: 404, statusMessage: 'No such source', fatal: true })
</script>

<template>
  <!-- ⚠️ **Two measures on one screen** — `10` §7.2. The header block reads
    across at 940; the prose narrows to 760, which at 22px is roughly 34
    characters to the line. 940 would be 42 and too wide. -->
  <PlaceShell origin="/sources" :pending="counts.pending" :due="counts.due">
    <article class="source">
      <h1>
        {{ source.title }}
        <!-- `S11` keeps a deleted *source* readable, and the aside is the
          marker — `10` §7.1. -->
        <span v-if="source.deletedAt" class="deleted">deleted</span>
      </h1>

      <p class="facts">
        <span>{{ submittedAtFormat.format(source.submittedAt) }}</span>
        <span class="dot" aria-hidden="true">·</span>
        <span>{{ source.status ?? 'not ingested' }}</span>
        <span class="dot" aria-hidden="true">·</span>
        <span>{{ source.charCount.toLocaleString('en-GB') }} characters</span>
      </p>

      <!-- ⚠️ `lang="ja"` is what puts Mincho on it (`05` §4): the split is
        load-bearing, and a screen never mixes a family into a role that is not
        its own. `10` §7.2 gives this the *Review* card's example treatment,
        which is the system's one setting for a run of Japanese prose. -->
      <p lang="ja" class="content">{{ source.content }}</p>
    </article>
  </PlaceShell>
</template>

<style scoped>
.source {
  margin-top: var(--k-space-7);
}

/* `10` §7.2: 24px Newsreader 400 — `05` §4's "a single datum given weight"
   slot. A *source* title is a heading, not a 46px screen statement. */
h1 {
  display: flex;
  align-items: baseline;
  gap: var(--k-space-2);
  margin: 0;
  font-size: 24px;
  font-weight: 400;
  line-height: 1.3;
  color: var(--k-ink);
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
  margin: var(--k-space-2) 0 0;
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-secondary);
}

.dot {
  color: var(--k-dot);
}

/* `10` §7.2's prose block: **760px**, 22px Mincho 400, line-height 1.65,
   `--k-ink-quiet` — the *Review* card's example treatment (`05` §4).
   ⚠️ **The content is not highlighted**, and that is a decision rather than an
   omission: marking each *occurrence*'s range needs a highlight fill this
   system does not have, and inventing one is what `05` §8 exists to prevent.
   The excerpt list that replaces it is `S11`'s. */
.content {
  max-width: var(--k-measure-object);
  margin: var(--k-space-6) 0 0; /* 28px below the rule — `10` §7.2 */
  padding-top: var(--k-space-6);
  border-top: 1px solid var(--k-rule);
  font-size: 22px;
  line-height: 1.65;
  color: var(--k-ink-quiet);
  white-space: pre-wrap;
}
</style>
