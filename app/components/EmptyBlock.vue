<script setup lang="ts">
// `05` §7's empty-state block — `10` §4.5, §4.6, §4.8 and §10.5 all use it, and
// so do *Review*'s two non-terminal states.
//
// ⚠️ **Left-aligned in a 560px column, never centred** (`10` §4.5). It is the
// measure `05` §5 reserves for "when there is nothing to do", and the alignment
// is the part that is easy to lose: a centred block reads as an announcement,
// and three of the five screens that use this are telling the reader something
// ordinary.
//
// ⚠️ **The rule is drawn whether or not anything follows it** (`10` §4.5). Two
// of *Vet*'s three empty states offer nothing after it — the affordance would be
// wrong advice in both, because an *ingestion* is already running — and "the
// rule is the last thing on the screen" is that state's shape rather than an
// oversight.
</script>

<template>
  <div class="block">
    <p class="statement">
      <slot name="statement" />
    </p>

    <p class="body">
      <slot name="body" />
    </p>

    <hr class="rule">

    <div class="after">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.block {
  /* `05` §5's fourth measure. */
  max-width: var(--k-measure-empty);
}

/* `05` §4's screen-level statement: 46px Newsreader 300, lh 1.15, -0.01em. */
.statement {
  margin: 0;
  font-size: 46px;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: var(--k-ink);
}

/* ⚠️ **`20px`, and `05` §7 and `10` §4.5 both say `18`.** `05` §5's scale is
   the authority on gaps and its snap record resolves this one by name —
   `18 → 20` — while §7 and §4.5 restate the canvas's unsnapped figure. §5 also
   says what 20 means, and it is this gap exactly: "between a body block and what
   introduced it". The **type size** stays 18px; §5 exempts type sizes from the
   snap and only ever moved the gap. Both documents carry a dated amendment. */
.body {
  margin: var(--k-space-5) 0 0;
  font-size: 18px;
  line-height: 1.55;
  color: var(--k-ink-secondary);
}

/* Full-width `--k-rule` with `32px` clearance. */
.rule {
  margin: var(--k-space-7) 0 0;
  border: 0;
  border-top: 1px solid var(--k-rule);
}

.after:not(:empty) {
  margin-top: var(--k-space-7);
}
</style>
