<script setup lang="ts">
// `05` §7's *progress rail* — ⚠️ **the only progress indicator in the app**, and
// *Review*'s header (`CONTEXT.md`, `10` §5.2).
//
// ⚠️ **It knows its own length**, and that is a scheduling decision rather than
// a drawing one: `enable_short_term` is off, so a graded *card* leaves the
// *session* and never returns (ADR 0016), and `review_session.size` is therefore
// both the number of ticks and the number of answers. A configuration that let a
// lapsed *card* re-enter would leave this component drawing a bar whose length
// it could not know.
//
// ⚠️ **`10` §5.3's fourth mark is `flagged` and it is a *height*, not a
// colour.** A flagged position is less than an answer and more than nothing, so
// it takes the graded fill at 2px instead of 6px. **`X` is #13's**, so nothing
// produces one yet; the mark is here because the rail's vocabulary is four
// states and a component that knew three would be the thing #13 has to
// rediscover.

export type Tick = 'graded' | 'flagged' | 'current' | 'empty'

const props = defineProps<{
  ticks: Tick[]
  /** All ticks `--k-ink-ground`, right counter `--k-ink` (`05` §7). */
  complete: boolean
  /** The left counter — the position the reader is on, 1-based. */
  position: number
}>()

const total = computed(() => props.ticks.length)
</script>

<template>
  <div class="rail" :class="{ complete }">
    <!-- ⚠️ **The counters go on a phone, the ticks do not** (`10` §10.2): at
         335px of content width minus the Done cluster there is no room for both,
         and the counter is the redundant half. -->
    <span class="counter phone-hidden">{{ position }}</span>

    <div class="bar">
      <span
        v-for="(tick, index) in ticks"
        :key="index"
        class="tick"
        :class="tick"
      />
    </div>

    <span class="counter right phone-hidden">{{ total }}</span>
  </div>
</template>

<style scoped>
.rail {
  display: flex;
  align-items: center;
  /* `10` §5.2: `min(620px, 100% − 2 × (cluster width + 28px))`. The cluster is
     ~90px, so the rail stays 620 and optically centred at any width above about
     800px, and shrinks symmetrically below it — it never slides off centre. */
  width: min(var(--k-measure-told), 100% - 2 * (90px + var(--k-space-6)));
  margin: 0 auto;
}

/* `05` §7: 12px mono, `--k-ink-secondary`, `20px` from the bar. */
.counter {
  font-family: var(--k-face-mono);
  font-size: 12px;
  line-height: 1;
  color: var(--k-ink-secondary);
  margin-right: var(--k-space-5);
}

.counter.right {
  margin: 0 0 0 var(--k-space-5);
}

.rail.complete .counter.right {
  color: var(--k-ink);
}

.bar {
  display: flex;
  flex: 1;
  /* `05` §7: `4px` apart. */
  gap: var(--k-space-1);
}

/* One `flex-grow: 1` tick per *card*, 6px tall. `--k-radius-tick` makes a 2px
   tick a hairline pill rather than a bar with a corner (`10` §5.3). */
.tick {
  flex: 1 1 0;
  height: 6px;
  border-radius: var(--k-radius-tick);
  background: var(--k-tick-empty);
}

.tick.graded {
  background: var(--k-on-ink-quiet);
}

/* ⚠️ Height, not colour — ADR 0024 left this palette no grey to spare, and a
   border on a 6px bar leaves 4px of muddy fill (`10` §5.3). */
.tick.flagged {
  height: 2px;
  background: var(--k-on-ink-quiet);
}

.tick.current {
  background: var(--k-accent);
}

.rail.complete .tick {
  background: var(--k-ink-ground);
}

@media (width < 720px) {
  .rail {
    width: 100%;
  }

  .phone-hidden {
    display: none;
  }
}
</style>
