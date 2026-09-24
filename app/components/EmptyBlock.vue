<script setup lang="ts">
// `05` §7's empty-state block — `10` §4.5, §4.6, §4.8 and §10.5 all use it, and
// so do *Review*'s two non-terminal states and `10` §9's door and refusal.
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
//
// ⚠️ **With one exception, and it is why `rule` is a prop: `/auth/refused`**
// (`10` §9.2, #40). There the state offers nothing *by design* rather than for
// now, and a rule would point at empty ground on the one screen where a dead end
// is the feature. The default is `true` so that every other caller draws it
// without saying so; `false` is written once, where it is the specification.
//
// `size` is `05` §4's ramp, three rows of it: the 46px screen-level statement
// every empty state uses, the 54px Mincho mark the door says its own name in,
// and the 24px datum the signed-in door gives the reader's email (`10` §9.1).
// `name` is the door's `Kioku` line, `12px` under the mark; no other caller has
// one, so it renders only when given.
withDefaults(
  defineProps<{
    rule?: boolean
    size?: 'statement' | 'mark' | 'datum'
    /** `/auth/refused`'s statement is the page's `<h1>`; everywhere else it is a `<p>`. */
    tag?: 'p' | 'h1'
  }>(),
  { rule: true, size: 'statement', tag: 'p' },
)
</script>

<template>
  <div class="block">
    <component :is="tag" :class="['statement', size === 'statement' ? null : size]">
      <slot name="statement" />
    </component>

    <p v-if="$slots.name" class="name">
      <slot name="name" />
    </p>

    <p class="body">
      <slot name="body" />
    </p>

    <hr v-if="rule" class="rule">

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

/* `05` §4's 54px Mincho 500, lh 1 — the "term being judged" row, which `10`
   §9.1 borrows for the mark. The face comes from the `:lang(ja)` rule on the
   mark itself; English display tracking does not apply to Japanese. */
.statement.mark {
  font-size: 54px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: normal;
}

/* `05` §4's 24px Newsreader 400, lh 1.3 — "a single datum given weight". */
.statement.datum {
  font-size: 24px;
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: normal;
}

/* `10` §9.1: `Kioku`, `12px` below the mark, 17px Newsreader 400. */
.name {
  margin: var(--k-space-3) 0 0;
  font-size: 17px;
  line-height: 1.5;
  color: var(--k-ink-secondary);
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
