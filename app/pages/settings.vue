<script setup lang="ts">
// Settings — the fourth *place* (ADR 0076 §2). Three numbers: how many new
// words a lesson teaches, how many a day, and how many waiting reviews stop new
// words altogether.
//
// ⚠️ **A form and nothing else.** This route ships no JavaScript (`03` §2.1),
// so the form posts to `/api/settings` and the answer is a `303` back here —
// post-redirect-get, as `S11`'s delete does it. The values drawn are what is
// stored, read on the request (`server/middleware/shell-data.ts`).
//
// ⚠️ **Nothing is refused and the field says its range.** A value out of range
// is clamped by the server (`shared/review/limits.ts`) and the page that comes
// back shows what was kept. `min` and `max` on the inputs are the browser's
// half of the same bounds, from the same constant.
//
// ⚠️ **ADR 0066 §1 made the last two constants on purpose**, and Yuta's answer
// on the prototype is that they are adjustable. The defaults are that ADR's
// numbers and the line under each field says what the number is for.

import { DEFAULT_LIMITS, LIMIT_BOUNDS } from '#shared/review/limits'

const counts = await useStartBlockCounts()
const limits = await useStudyLimits()
const saved = useRoute().query.saved === '1'
</script>

<template>
  <PlaceShell
    origin="/settings"
    :flagged="counts.flagged"
    :due="counts.due"
    :new-today="counts.newToday"
    measure="var(--k-measure-object)"
  >
    <section class="settings">
      <span class="eyebrow">STUDY SETTINGS</span>
      <h1>How much is new each day.</h1>

      <p v-if="saved" class="saved" role="status">
        Saved.
      </p>

      <form method="post" action="/api/settings" class="form">
        <label class="field">
          <span class="name">New words per lesson</span>
          <input
            type="number"
            name="lessonSize"
            inputmode="numeric"
            :min="LIMIT_BOUNDS.lessonSize.min"
            :max="LIMIT_BOUNDS.lessonSize.max"
            :value="limits.lessonSize"
          >
          <span class="aside">
            A lesson teaches this many, then quizzes you on them.
            {{ LIMIT_BOUNDS.lessonSize.min }} to {{ LIMIT_BOUNDS.lessonSize.max }}; usually {{ DEFAULT_LIMITS.lessonSize }}.
          </span>
        </label>

        <label class="field">
          <span class="name">New words a day</span>
          <input
            type="number"
            name="dailyNew"
            inputmode="numeric"
            :min="LIMIT_BOUNDS.dailyNew.min"
            :max="LIMIT_BOUNDS.dailyNew.max"
            :value="limits.dailyNew"
          >
          <span class="aside">
            Every new word is reviews later. {{ LIMIT_BOUNDS.dailyNew.min }} stops new words;
            up to {{ LIMIT_BOUNDS.dailyNew.max }}; usually {{ DEFAULT_LIMITS.dailyNew }}.
          </span>
        </label>

        <label class="field">
          <span class="name">No new words while this many reviews wait</span>
          <input
            type="number"
            name="pauseAbove"
            inputmode="numeric"
            :min="LIMIT_BOUNDS.pauseAbove.min"
            :max="LIMIT_BOUNDS.pauseAbove.max"
            :value="limits.pauseAbove"
          >
          <span class="aside">
            With this many or more waiting, lessons pause until you catch up.
            {{ LIMIT_BOUNDS.pauseAbove.min }} to {{ LIMIT_BOUNDS.pauseAbove.max }}; usually {{ DEFAULT_LIMITS.pauseAbove }}.
          </span>
        </label>

        <button type="submit" class="quiet">
          Save
        </button>
      </form>
    </section>
  </PlaceShell>
</template>

<style scoped>
.settings {
  margin-top: var(--k-space-8);
}

/* `05` §4's eyebrow, as Ingest's fields carry it. */
.eyebrow {
  display: block;
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

h1 {
  margin: var(--k-space-2) 0 0;
  font-size: 26px;
  font-weight: 400;
  line-height: 1.25;
}

.saved {
  margin: var(--k-space-4) 0 0;
  font-size: 15px;
  color: var(--k-ink-quiet);
}

.form {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--k-space-6);
  margin-top: var(--k-space-6);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--k-space-2);
  max-width: 100%;
}

.name {
  font-size: 17px;
  color: var(--k-ink);
}

.field input {
  width: 7em;
  padding: var(--k-space-2) var(--k-space-3);
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-mono);
  font-size: 16px; /* ⚠️ 16px: iOS zooms the page on focus under that */
  color: var(--k-ink);
}

/* `05` §4's aside role. */
.aside {
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

/* Ingest's quiet control. */
.quiet {
  padding: 9px 16px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 14px;
  color: var(--k-ink);
  cursor: pointer;
}

.quiet:hover {
  background: var(--k-key-face);
}
</style>
