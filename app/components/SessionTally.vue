<script setup lang="ts">
// `05` §7's *session tally* — ⚠️ **one component with a column count, not two**
// (`10` §11). *Review*'s end screen takes four and Stats takes five (`10` §8.1),
// and nothing else about it changes between them, so the count is a consequence
// of what is passed rather than a prop.
//
// The figure slot is `05` §4's "single datum given weight": 38px Newsreader 300
// in `--k-ink`, under a 10px Plex Mono eyebrow at 0.14em in `--k-ink-secondary`.

defineProps<{
  columns: { eyebrow: string, figure: string | number, note?: string }[]
}>()
</script>

<template>
  <dl class="tally">
    <div v-for="column in columns" :key="column.eyebrow" class="column">
      <dt class="eyebrow">
        {{ column.eyebrow }}
      </dt>
      <dd class="figure">
        {{ column.figure }}
        <!-- ⚠️ `10` §8.1's `worker_environment` line hangs here — a figure
             measured against a laptop is not comparable across ADR 0022's move,
             and it belongs on the row rather than in a paragraph. -->
        <span v-if="column.note" class="note">{{ column.note }}</span>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
/* `05` §7: equal columns, `8px` apart. */
.tally {
  display: grid;
  grid-template-columns: repeat(v-bind('columns.length'), 1fr);
  gap: var(--k-space-2);
  margin: 0;
}

.column {
  min-width: 0;
}

.eyebrow {
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

.figure {
  margin: var(--k-space-2) 0 0;
  font-size: 38px;
  font-weight: 300;
  line-height: 1;
  color: var(--k-ink);
}

.note {
  display: block;
  margin-top: var(--k-space-1);
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-secondary);
}
</style>
