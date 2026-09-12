<script setup lang="ts">
// `05` §7's *key cap*, and the label beside it.
//
// It is one component because it is one thing in three places: the footer
// legend, the Done cluster (`10` §4.3) and the run-end confirmation (`10` §4.6).
// ⚠️ **The Done cluster is this component and not a button**, and `10` §4.3 says
// why: "the control's job is to name the key as much as to be a target" —
// desktop keeps `Esc` and gains a visible way out (ADR 0026), so a control that
// does not say `Esc` teaches the keyboard reader nothing.
//
// ⚠️ **The primary cap holds `space`, not a letter** (ADR 0023), so it is the
// widest cap in the legend rather than one square among equals. That is a
// consequence of the key map, not a size that was chosen.

withDefaults(defineProps<{
  /** What is printed on the cap — `space`, `E`, `Esc`. */
  cap: string
  /** The words beside it. Omitted where the cap stands alone. */
  label?: string
  /** `05` §7's three states. `aside` is `X`, which *Vet* never uses. */
  variant?: 'primary' | 'secondary' | 'aside'
}>(), { label: undefined, variant: 'secondary' })
</script>

<template>
  <span class="cluster">
    <kbd class="cap" :class="variant">{{ cap }}</kbd>
    <span v-if="label" class="label" :class="variant">{{ label }}</span>
  </span>
</template>

<style scoped>
.cluster {
  display: inline-flex;
  align-items: center;
  /* `10` §4.3: `8px` between cap and label. */
  gap: var(--k-space-2);
  /* `10` §4.3: `min-height: 32px`, which clears SC 2.5.8's 24 × 24 target
     minimum (verification §13.3). It is a target in the Done cluster and on the
     confirmation; in the legend it is only ever read. */
  min-height: 32px;
}

.cap {
  font-family: var(--k-face-mono);
  font-size: 12px;
  line-height: 1;
  padding: 5px 10px;
  border-radius: var(--k-radius-key);
  /* ⚠️ A cap that wrapped would move the legend, on the one screen whose thesis
     is that nothing moves between keystrokes (`10` §4.8). `space` is the widest
     label in the system (ADR 0023) and is the one this is for. */
  white-space: nowrap;
}

/* ⚠️ `05` §7's table gives the primary cap **no border**, and this one is
   transparent rather than absent: the secondary cap has a 1px border, so an
   absent one here would make the two caps different heights in the same legend
   row. `background-clip` is `border-box` by default, so a transparent border
   renders exactly what `05` §7 draws. */
.cap.primary {
  background: var(--k-ink-ground);
  border: 1px solid transparent;
  color: var(--k-ground);
}

.cap.secondary {
  background: var(--k-key-face);
  border: 1px solid var(--k-border-control);
  color: var(--k-ink-value);
}

.cap.aside {
  background: none;
  border: 1px dashed var(--k-border-dashed);
  color: var(--k-ink-secondary);
  padding: 3px 8px;
}

.label {
  font-size: 15px;
  color: var(--k-ink-secondary);
}

/* `05` §7: the label is `--k-ink` beside the primary cap, secondary otherwise. */
.label.primary {
  color: var(--k-ink);
}
</style>
