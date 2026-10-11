<script setup lang="ts">
// One word in the summary — the prototype's `.wrow`: the word, its first
// meaning over its reading, and where the *grade* sent it.

import { glossPieces } from '#shared/review/answer'

const props = defineProps<{
  fields: Record<string, string>
  /** `up to Familiar · back in 5 days`, or what stands in for it. */
  note: string
  /** A missed word's note is in the wrong colour, beside the list's own heading. */
  missed?: boolean
}>()

const meaning = computed(() => glossPieces(props.fields.meaning ?? '')[0] ?? props.fields.meaning ?? '')
</script>

<template>
  <li class="wrow">
    <span class="t" lang="ja">{{ fields.term }}</span>
    <span class="m">
      {{ meaning }}
      <small lang="ja">{{ fields.reading }}</small>
    </span>
    <span class="x" :class="{ bad: missed }">{{ note }}</span>
  </li>
</template>

<style scoped>
.wrow {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 14px;
  padding: 11px 0;
  border-bottom: 1px solid var(--k-rule);
}

.wrow:first-child {
  border-top: 1px solid var(--k-rule);
}

.t {
  font-size: 23px;
  line-height: 1.2;
  white-space: nowrap;
}

.m {
  min-width: 0;
  font-size: 15.5px;
  color: var(--k-ink-quiet);
}

.m small {
  display: block;
  font-size: 13.5px;
  color: var(--k-ink-secondary);
}

.x {
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-secondary);
  white-space: nowrap;
}

.x.bad {
  color: var(--k-wrong);
}

@media (width < 720px) {
  .wrow {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .t {
    grid-column: 1 / -1;
  }

  /* The note may run to two short lines beside a long meaning. */
  .x {
    white-space: normal;
    text-align: right;
  }
}
</style>
