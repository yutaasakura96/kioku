<script setup lang="ts">
// ADR 0065 §5 — the *session* filter, beside the *session*-size knob and in the
// same three homes (`10` §5.8): the end screen and *Review*'s two non-terminal
// empty states, **never mid-session**, because the run is snapshotted.
//
// ⚠️ **It chooses which new *cards* are introduced and says so.** The due half
// is never filtered — what is owed is owed — and a control that let the reader
// believe otherwise would be the one lie on the screen.
//
// ⚠️ **The sets are the declaration's** (ADR 0003). Nothing here names `tech`
// or `N3`; a second value in `subjects/jlpt-vocab.json` is a second checkbox.
//
// ⚠️ **Not persisted** (ADR 0009, ADR 0065 §6). A filter that survived a reload
// would be a saved query, which is a *deck*, and nothing here is one.

import type { SessionFilter } from '#shared/review/filter'
import type { SubjectDeclaration } from '#shared/subject/declaration'
import { domainValues, levelValues } from '#shared/subject/declaration'

const props = defineProps<{ declaration: SubjectDeclaration }>()

const filter = defineModel<SessionFilter>({ required: true })

const groups = computed(() => [
  { key: 'domains', eyebrow: 'DOMAIN', values: domainValues(props.declaration) },
  { key: 'levels', eyebrow: 'LEVEL', values: levelValues(props.declaration) },
] as const)

function toggle(group: { key: 'domains' | 'levels', values: string[] }, value: string, on: boolean) {
  const current = filter.value[group.key]
  const next = on ? [...current, value] : current.filter(entry => entry !== value)

  // Declaration order, whatever order they were ticked in, so the request a
  // reader sends is the same request whichever box they reached first.
  filter.value = { ...filter.value, [group.key]: group.values.filter(entry => next.includes(entry)) }
}
</script>

<template>
  <div class="filter">
    <fieldset v-for="group in groups" :key="group.key" class="group">
      <legend class="eyebrow">
        {{ group.eyebrow }}
      </legend>

      <div class="options">
        <label v-for="value in group.values" :key="value" class="option">
          <input
            type="checkbox"
            :value="value"
            :checked="filter[group.key].includes(value)"
            @change="toggle(group, value, ($event.target as HTMLInputElement).checked)"
          >
          <span>{{ value }}</span>
        </label>
      </div>
    </fieldset>

    <p class="aside">
      New cards only. Every card that is due is still in the session, and nothing ticked means everything.
    </p>
  </div>
</template>

<style scoped>
.filter {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--k-space-4);
}

.group {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  /* `10` §5.8's knob: `8px` between eyebrow and control. */
  gap: var(--k-space-2);
}

/* `05` §4's muted eyebrow, the knob's own. */
.eyebrow {
  padding: 0;
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--k-space-2) var(--k-space-4);
}

.option {
  display: inline-flex;
  align-items: center;
  gap: var(--k-space-2);
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-value);
}

.option input {
  margin: 0;
  accent-color: var(--k-ink);
}

.aside {
  margin: 0;
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}
</style>
