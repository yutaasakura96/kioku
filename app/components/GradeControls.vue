<script setup lang="ts">
// `05` §7's *grade control*, four in a row — `10` §5.5.
//
// ⚠️ **The labels name recall because they cannot name a time**
// ([ADR 0034](../../docs/adr/0034-the-grade-labels-name-recall-because-they-cannot-name-a-time.md)).
// `Again` does not survive: with `enable_short_term: false` the soonest a graded
// *card* returns is **tomorrow** (verification §13.1), so it would promise a
// same-day return this configuration cannot make. `Forgot` names the lapse the
// library itself counts. Anyone comparing this with Anki's screen will think the
// difference is cosmetic; it is the visible end of ADR 0016.
//
// ⚠️ ***Grades* are given by key or by pointer and never by swipe**
// ([ADR 0036](../../docs/adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md)).
// SC 2.5.1 Pointer Gestures is Level A and SC 2.5.7 Dragging Movements is Level
// AA (verification §13.2), so a path-based gesture would owe a single-pointer
// equivalent — which is these four controls. **There is therefore no touch
// handler anywhere in this component or in the page**, and
// `test/unit/review-no-swipe.test.ts` is what keeps it that way.
//
// ⚠️ **The selected state is not a loading state** (`10` §5.5, `S8`): a *grade*
// is stamped at the keystroke and the interface never waits on the flush, so it
// is visible for exactly as long as it takes the next *card* to render.

import { GRADE_KEYS } from '#shared/review/keystroke'
import type { Grade } from '#shared/review/scheduler'

defineProps<{
  /** The *grade* just given, for as long as this *card* is still on screen. */
  selected?: Grade | null
}>()

const emit = defineEmits<{ grade: [grade: Grade] }>()
</script>

<template>
  <div class="grades">
    <button
      v-for="entry in GRADE_KEYS"
      :key="entry.grade"
      type="button"
      class="grade"
      :class="{ selected: selected === entry.grade }"
      @click="emit('grade', entry.grade)"
    >
      <span class="digit">{{ entry.key }}</span>
      <span class="label">{{ entry.label }}</span>
    </button>
  </div>
</template>

<style scoped>
/* `05` §7: four controls in a row, `12px` apart, spanning the *card*'s 760px —
   the controls share the card's exact width (`10` §5.1). */
.grades {
  display: flex;
  gap: var(--k-space-3);
  width: 100%;
  max-width: var(--k-measure-object);
  margin: 0 auto;
}

/* A stacked pair — digit above, label below, `3px` between — with `9px`
   vertical padding. At 375px that is 74 × 48, which clears SC 2.5.8's 24 × 24
   Level AA floor and SC 2.5.5's 44 × 44 Level AAA one (`10` §10.4). */
.grade {
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

/* ⚠️ `10` §2.1: `--k-key-face` is the hover face of a resting control on
   `--k-raised` and `--k-ink-ground` is its active face (ADR 0035) — two tokens
   carrying a use `05` does not yet list. */
.grade:hover {
  background: var(--k-key-face);
}

.grade:active,
.grade.selected {
  background: var(--k-ink-ground);
  border-color: var(--k-ink-ground);
}

.digit {
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

.grade:active .digit,
.grade.selected .digit {
  color: var(--k-on-ink-quiet);
}

.grade:active .label,
.grade.selected .label {
  color: var(--k-ground);
}
</style>
