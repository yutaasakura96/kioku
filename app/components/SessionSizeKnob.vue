<script setup lang="ts">
// `10` §5.8 — the *session*-size knob, and its two homes.
//
// ⚠️ **It appears on the end screen and on *Review*'s two non-terminal empty
// states, and never mid-session** (`09` §4.7). The current *session* is
// snapshotted at the start, so a knob that appeared to change it would be lying.
// That is why this is a component used by three screens rather than something
// the *mode* draws in its chrome.
//
// ⚠️ **A first-ever *session* is twenty *cards* with no chance to change it**,
// because the knob has nowhere to live before a *session* exists. That is a
// stated cost rather than a gap to patch with a knob on Ingest — the knob
// belongs to *Review*, and a *place* would have to reach into a *mode*'s state
// to carry it.
//
// ⚠️ **Out of range clamps and says which bound it hit** (`10` §5.8): the field
// shows the clamped value and a 13px italic aside names the bound. A *session*
// refused because a number was too large would be the knob taking the reader's
// run away over a typo — so `clampSessionSize` is the one rule, here and again
// on the server.

import { MAX_SESSION_SIZE, MIN_SESSION_SIZE, clampSessionSize } from '#shared/review/compose'

const size = defineModel<number>({ required: true })

/** Which bound the reader's last entry hit, if it hit one. */
const clamped = ref<'low' | 'high' | null>(null)

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const next = clampSessionSize(raw)

  size.value = next
  clamped.value = boundHit(raw, next)
}

/**
 * Which bound the reader's entry hit, or `null`.
 *
 * ⚠️ **A cleared field hits no bound.** `Number('')` is `0`, so comparing the
 * raw value against the clamp would answer *at least one card* for a field the
 * reader emptied — an aside naming a bound they never asked for, beside a field
 * showing the default. Blank is *nothing was entered*, which is what
 * `clampSessionSize` already reads it as.
 */
function boundHit(raw: string, clampedTo: number): 'low' | 'high' | null {
  if (raw.trim() === '')
    return null

  const asked = Number(raw)

  if (!Number.isFinite(asked) || asked === clampedTo)
    return null

  return asked < clampedTo ? 'low' : 'high'
}
</script>

<template>
  <div class="knob">
    <label class="eyebrow" for="session-size">SESSION SIZE</label>

    <input
      id="session-size"
      class="field"
      type="number"
      inputmode="numeric"
      :min="MIN_SESSION_SIZE"
      :max="MAX_SESSION_SIZE"
      :value="size"
      @change="onInput"
    >

    <p v-if="clamped" class="aside">
      {{ clamped === 'high'
        ? `A session is at most ${MAX_SESSION_SIZE} cards.`
        : `A session is at least ${MIN_SESSION_SIZE} card.` }}
    </p>
  </div>
</template>

<style scoped>
.knob {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  /* `10` §5.8: `8px` between eyebrow and field. */
  gap: var(--k-space-2);
}

.eyebrow {
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

/* `--k-raised`, `1px --k-border-control`, `--k-radius-control`, `9px 12px`,
   sized to four characters. The value is `05` §4's "single datum given weight"
   slot at 24px Newsreader 400. */
.field {
  width: 4ch;
  padding: 9px 12px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 24px;
  font-weight: 400;
  color: var(--k-ink);
}

.aside {
  margin: 0;
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}
</style>
