<script setup lang="ts">
// The back of a *Review* *card* — `10` §5.5 as amended by
// [ADR 0069](../../docs/adr/0069-the-check-is-the-grade.md) (#28).
//
// ⚠️ **The check is the *grade*, so there is nothing to choose.** The four
// *grade* controls are gone. What is left is one control that commits the
// *grade* the check gave — its label is that *grade*'s, `Good` or `Forgot` — and,
// only after a meaning the check refused, a second that adds what was typed as
// the reader's own synonym, after which the check runs again (§2).
//
// ⚠️ **Controls and not only key caps, because a phone has no `Enter`** (`10`
// §10.2). They keep `05` §7's *grade control* geometry — the stacked pair, the
// cap above the label — so the back reads as it did and the targets clear the
// same SC 2.5.8 floor (`10` §10.4).
//
// ⚠️ **Given by key or by pointer and never by swipe**
// ([ADR 0036](../../docs/adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md)),
// so there is no touch handler here, and `test/unit/review-no-swipe.test.ts` is
// what keeps it that way.

import { GRADE_LABELS } from '#shared/review/keystroke'
import type { CheckedGrade } from '#shared/review/answer'

defineProps<{
  /** What `Enter` commits — the check's result (ADR 0069 §1). */
  grade: CheckedGrade
  /** `synonymOffered`'s answer: a meaning was refused and something was typed. */
  offerSynonym: boolean
  /** Set for as long as the *card* is still on screen after the commit. */
  committed?: boolean
}>()

const emit = defineEmits<{ commit: [], synonym: [] }>()
</script>

<template>
  <div class="controls">
    <button
      v-if="offerSynonym"
      type="button"
      class="control synonym"
      @click="emit('synonym')"
    >
      <span class="cap">S</span>
      <span class="label">I was right — add as synonym</span>
    </button>

    <button
      type="button"
      class="control commit"
      :class="{ committed }"
      @click="emit('commit')"
    >
      <span class="cap">Enter</span>
      <span class="label">{{ GRADE_LABELS[grade] }}</span>
    </button>
  </div>
</template>

<style scoped>
/* `05` §7's row, `12px` apart, spanning the *card*'s 760px (`10` §5.1). */
.controls {
  display: flex;
  gap: var(--k-space-3);
  width: 100%;
  max-width: var(--k-measure-object);
  margin: 0 auto;
}

/* The *grade control*'s stacked pair — cap above, label below, `3px` between,
   `9px` vertical padding. At 375px either one is at least 48px tall. */
.control {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 0;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  cursor: pointer;
}

.control:hover {
  background: var(--k-key-face);
}

/* ⚠️ The commit control is ADR 0060's *proposed* control, kept: an `--k-ink`
   border and label, **not the accent** (`05` §2 spends the accent on where you
   are). It is what `Enter` does, so it is the one drawn darker. */
.commit {
  border-color: var(--k-ink);
  box-shadow: inset 0 0 0 1px var(--k-ink);
}

.commit .label {
  color: var(--k-ink);
}

.control:active,
.commit.committed {
  background: var(--k-ink-ground);
  border-color: var(--k-ink-ground);
}

.cap {
  font-family: var(--k-face-mono);
  font-size: 12px;
  line-height: 1;
  color: var(--k-ink-value);
}

.label {
  font-size: 14px;
  line-height: 1.2;
  color: var(--k-ink-secondary);
}

.control:active .cap,
.commit.committed .cap {
  color: var(--k-on-ink-quiet);
}

.control:active .label,
.commit.committed .label {
  color: var(--k-ground);
}
</style>
