<script setup lang="ts">
// *Review*'s header — ADR 0076 §8, the prototype's `.modebar`: the screen's
// name, one track, a count, and the way out.
//
// ⚠️ **It replaced the *progress rail*** (`10` §5.2 until #70). The rail drew
// one tick per *card* and knew its length because a graded *card* never
// returned; a missed question now does, so what the header can honestly count
// is **words finished out of words in the run**, and that is one track.
//
// ⚠️ **The exit is a slot, because it is three different things**: a link out
// on the screens that are a pause, and a button on the quiz, where leaving ends
// the run (ADR 0076 §6). This component draws the control's face and never
// decides what it does.

defineProps<{
  /** `Lesson`, `Lesson quiz`, `Reviews`, `Summary`. */
  name: string
  /** `0` to `1` — how far through. Absent on a screen with nothing to be through. */
  progress?: number
  /** `word 2 of 5`, `3 of 12 words`. */
  count?: string
}>()
</script>

<template>
  <header class="modebar">
    <span class="name">{{ name }}</span>

    <!-- ⚠️ `role="progressbar"` with the count as its text: the track is the
         only progress indicator on the screen, and a bar of two colours says
         nothing to a reader who cannot see it. -->
    <div
      v-if="progress !== undefined"
      class="track"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(Math.min(1, Math.max(0, progress)) * 100)"
      :aria-valuetext="count"
    >
      <i :style="{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }" />
    </div>

    <span v-else class="spacer" />

    <span v-if="count" class="count">{{ count }}</span>

    <slot name="exit" />
  </header>
</template>

<style scoped>
.modebar {
  display: flex;
  align-items: center;
  gap: var(--k-space-4);
  flex: 0 0 var(--k-bar-height);
  padding: 0 var(--k-gutter);
  border-bottom: 1px solid var(--k-rule);
}

.name {
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--k-accent);
  white-space: nowrap;
}

.track {
  flex: 1 1 auto;
  min-width: 30px;
  height: 6px;
  border-radius: var(--k-radius-tick);
  background: var(--k-tick-empty);
  overflow: hidden;
}

.track i {
  display: block;
  height: 100%;
  background: var(--k-ink);
  transition: width 0.25s;
}

.spacer {
  flex: 1 1 auto;
}

.count {
  font-family: var(--k-face-mono);
  font-size: 12.5px;
  color: var(--k-ink-secondary);
  white-space: nowrap;
}

/* The exit's face, whichever element the screen hands in. */
.modebar :deep(.exit) {
  /* SC 2.5.8: 24 × 24 at least; the phone rule below makes it 44 tall. */
  /* ⚠️ A link is `content-box` and a button is not: without this the same face
     is 44px tall as *Home* and 32px as *Finish early*. */
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 5px 11px;
  background: none;
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 14px;
  color: var(--k-ink-value);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.modebar :deep(.exit:hover) {
  background: var(--k-key-face);
}

@media (prefers-reduced-motion: reduce) {
  .track i {
    transition: none;
  }
}

@media (width < 720px) {
  .modebar {
    gap: 10px;
    padding: 0 var(--k-space-4);
  }

  .modebar :deep(.exit) {
    min-height: 44px;
  }
}

@media (width < 360px) {
  .modebar:has(.track) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 12px;
    padding-block: 8px;
  }

  .modebar:has(.track) .name {
    grid-column: 1;
    grid-row: 1;
  }

  .modebar:has(.track) .track {
    grid-column: 1;
    grid-row: 2;
    width: 100%;
  }

  .modebar:has(.track) .count {
    grid-column: 2;
    grid-row: 2;
  }

  .modebar:has(.track) :deep(.exit) {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
