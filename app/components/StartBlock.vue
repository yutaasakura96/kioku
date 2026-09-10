<script setup lang="ts">
// `10` §3.2 — **the component the canvas never drew.**
//
// ADR 0032 requires it to read as different from the nav beside it, and the
// distinction that costs nothing is this: **the nav is text; the start block is
// bounded.** It is `05` §7's quiet affordance with one change.
//
// ⚠️ **The accent `→` is dropped here**, and it is the one departure from
// `05` §7's affordance. On empty *Vet* the affordance is the only thing on the
// screen and the arrow is the sentence; in a block of two, side by side, above a
// form, two accent arrows are decoration — and `05` §2 says the accent "is never
// decoration and never a state". The affordance keeps its arrow where it is
// alone (`10` §4.5, §7.1).
//
// ⚠️ **Neither control is ever disabled** (ADR 0032, ADR 0035). A zero on Review
// is how the reader reaches the empty state that tells them when the next *card*
// is due, and a zero on Vet is how they find out whether an *ingestion* is still
// running (`09` §8). Disabling the entrances would make PRD §4's written empty
// states unreachable — ADR 0032 refused a disabled start control once already.
//
// ⚠️ **The origin travels in `from`** and is matched against three strings on
// the way out (`shared/utils/origin.ts`, ADR 0032). This is the control that
// sets it.

import type { Place } from '~~/shared/utils/origin'

const props = defineProps<{
  /** The *place* this block is on — becomes `?from=`. */
  origin: Place
  pending: number
  due: number
}>()

const vet = computed(() => `/vet?from=${encodeURIComponent(props.origin)}`)
const review = computed(() => `/review?from=${encodeURIComponent(props.origin)}`)
</script>

<template>
  <div>
    <div class="start">
      <NuxtLink :to="vet" class="control">
        <span class="label">Vet</span>
        <span class="dot" aria-hidden="true">·</span>
        <span class="count">{{ pending }}</span>
        <span class="word">pending</span>
      </NuxtLink>

      <NuxtLink :to="review" class="control">
        <span class="label">Review</span>
        <span class="dot" aria-hidden="true">·</span>
        <span class="count">{{ due }}</span>
        <span class="word">due</span>
      </NuxtLink>
    </div>

    <!--
      ⚠️ `09` §2 requires the *shell* to **say** that every figure in it is as of
      page load, and this is the sentence. It is the same line on all three
      *places*. A *place* ships no JavaScript so it cannot poll, and the
      alternatives are worse: a meta refresh on `/` would destroy a paste in
      progress, and a stale number presented as live is a lie the reader has no
      way to detect.
    -->
    <p class="asof">
      as of this page load
    </p>
  </div>
</template>

<style scoped>
/* Placement: the first block of the page body, not part of the bar — `10` §3.2.
   A page-load-stamped figure belongs on the page rather than in the chrome that
   frames it. The 28px below the bar's rule is the page's job, not this one's. */
.start {
  display: flex;
  gap: var(--k-space-3); /* 12px — the grade-control gap */
}

.control {
  display: flex;
  align-items: baseline;
  gap: var(--k-space-2);
  padding: 13px 20px; /* control padding — off the spacing scale by `05` §5 */
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  text-decoration: none;
}

.label {
  font-size: 17px;
  font-weight: 400;
  color: var(--k-ink);
}

/* The *Vet* chrome bar's own pending-count treatment — `05` §7. */
.dot {
  color: var(--k-dot);
}

.count,
.word {
  font-family: var(--k-face-mono);
  font-size: 12px;
}

.count {
  color: var(--k-ink);
}

.word {
  color: var(--k-ink-secondary);
}

/* `10` §3.3 — three states, and **disabled is not one of them** (ADR 0035). */
.control:hover {
  background: var(--k-key-face);
}

.control:active {
  background: var(--k-ink-ground);
  border-color: var(--k-ink-ground);
}

.control:active .label,
.control:active .count {
  color: var(--k-on-ink);
}

.control:active .word,
.control:active .dot {
  color: var(--k-on-ink-quiet);
}

/* `05` §4's aside role: 13px Newsreader italic, `--k-ink-secondary`. */
.asof {
  margin: var(--k-space-3) 0 0; /* 12px */
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

/* `10` §10.6 — nothing bespoke on a phone; the two controls stack. */
@media (width < 720px) {
  .start {
    flex-direction: column;
  }
}
</style>
