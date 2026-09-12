<script setup lang="ts">
// One *note*, as `S4` renders it: everything above the *facts strip*'s lower
// rule is context, everything below it is what you are judging (`CONTEXT.md`,
// `05` §7).
//
// ⚠️ **Edit reaches the *judgement fields* only** (`10` §4.4). Editing the
// *term* would change `note.identity_key` (ADR 0006) and editing a *level* would
// manufacture a claim with no *authority* behind it (ADR 0005) — neither is an
// edit, both are a different feature. The refusal is also in
// `shared/vet/decision.ts`, because this component not drawing a box is not a
// rule the server can rely on.
//
// ⚠️ **The *provenance marker* is never placed behind a hover** (`CONTEXT.md`,
// `09` §4.4). "Available on inspection" in `S4` means the *authority*'s name is
// reachable, not that the honesty bit is.
//
// ⚠️ **The value's type is chosen by field name, and `05` §4's ramp is why.**
// The ramp names "*Vet* — the *meaning*" at 40px Newsreader and "*Vet* — example
// sentence" at 27px Mincho, which are three JLPT field names rather than three
// roles — and the *subject* declaration carries `kind`, `required` and
// `memory_bearing` but nothing that says *this value is Japanese prose*. So the
// map below is the gap, written where it is visible: a second *subject* needs
// either a role on the field or a second map, and the declaration is the better
// of the two places (ADR 0003).

import type { SubjectDeclaration } from '#shared/subject/declaration'
import type { VetNoteView } from '../../server/utils/vet/queries'
import { judgementFieldNames } from '#shared/subject/declaration'

const props = defineProps<{
  note: VetNoteView
  declaration: SubjectDeclaration
  /**
   * The in-progress edit, or `null` when there is none. ⚠️ It is the parent's
   * object: `Esc` discards it by dropping the reference, which is what makes
   * "return the *note* unchanged" (`09` §4.3) free rather than a restore.
   *
   * ⚠️ **Not `draft`.** `CONTEXT.md` puts *draft* on the `_Avoid_` list of both
   * **Pending** and **Candidate**, and this holds the uncommitted edit of a
   * *pending note* — the exact collision that list exists to prevent.
   */
  edit: Record<string, string> | null
}>()

const fields = computed(() => props.note.fields)

/** `05` §4's ramp, per field — see the header for what this stands in for. */
const TYPE: Record<string, { size: string, lang: 'ja' | 'en', lineHeight: string }> = {
  meaning: { size: '40px', lang: 'en', lineHeight: '1.2' },
  example_sentence: { size: '27px', lang: 'ja', lineHeight: '1.6' },
  example_gloss: { size: '17px', lang: 'en', lineHeight: '1.5' },
}

const FALLBACK = { size: '17px', lang: 'en', lineHeight: '1.5' } as const

const judgementFields = computed(() =>
  judgementFieldNames(props.declaration)
    .map(name => ({
      name,
      label: props.declaration.fields.find(field => field.name === name)?.label ?? name.toUpperCase(),
      type: TYPE[name] ?? FALLBACK,
      note: provenanceNote(name),
    })),
)

/**
 * "A 13px italic note on where the value came from" (`05` §7).
 *
 * ⚠️ **It names the mechanism, not the model.** ADR 0048 makes `kind` the record
 * of *who produced the value*, which is what `10` §4.4 is asking for; the model
 * id is the subject of `S10`'s ledger (`10` §8.3) and of ADR 0018's comparison,
 * both of which are Stats. Putting it here would also be the one place on a
 * reader-facing screen where a vendor's product name appears, which `03` §11
 * spends a row of its table keeping off the *other* screens.
 */
function provenanceNote(name: string): string | null {
  const row = props.note.provenance.find(entry => entry.fieldName === name)

  if (!row)
    return null

  switch (row.kind) {
    case 'lookup':
      return row.dictionaryVersion ? `looked up · ${row.dictionaryVersion}` : 'looked up'
    case 'judgement':
      return 'chosen from the dictionary'
    case 'human':
      return 'edited by you'
    default:
      return 'generated'
  }
}

/**
 * The *level* on display, and the honesty bit beside it.
 *
 * ADR 0005 keeps the whole set and never collapses it; precedence decides which
 * one is *shown*, and `server/utils/vet/queries.ts` orders a named *authority*
 * ahead of the model's estimate. ⚠️ **In v1 there is only ever the estimate** —
 * nothing looks a *level* up, because ADR 0005 records that the JLPT has
 * published no official list since 2010.
 */
const level = computed(() => props.note.levels[0] ?? null)
const dissenting = computed(() => props.note.levels.slice(1))

const fieldElements = ref<HTMLTextAreaElement[]>([])

/**
 * A `<textarea>` that wraps has to grow, or the reader edits a sentence through
 * a one-line window — which is the failure `10` §4.4 rejected `<input>` over.
 */
function grow(element: HTMLTextAreaElement | undefined) {
  if (!element)
    return

  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

defineExpose({
  /** `Tab` cycles the three (`09` §4.3); the parent owns which one is next. */
  focusField(index: number) {
    for (const element of fieldElements.value) grow(element)

    const field = fieldElements.value[index]
    field?.focus()
    field?.select()
  },
  fieldCount: () => fieldElements.value.length,
})
</script>

<template>
  <article class="note">
    <!-- Above the strip: context. ⚠️ Never editable — `10` §4.4. -->
    <h1 class="term" lang="ja">
      {{ fields.term }}
    </h1>
    <p class="reading" lang="ja">
      {{ fields.reading }}
    </p>

    <!--
      `05` §7's *facts strip*: a rule above, a 46px row, a rule below. It is
      "the mechanism the direction was chosen for", and the lower rule is the
      line `CONTEXT.md` puts between context and judgement.
    -->
    <div class="strip">
      <div class="fact">
        <span class="eyebrow muted">POS</span>
        <span class="value" lang="ja">{{ fields.part_of_speech }}</span>
      </div>

      <span class="divider" aria-hidden="true" />

      <div class="fact">
        <span class="eyebrow muted">LEVEL</span>
        <span
          v-if="level"
          class="marker"
          :class="{ attributed: level.authorityKey !== null }"
          :aria-label="level.authorityKey ? 'claimed by an authority' : 'estimated by the model'"
          role="img"
        />
        <span class="value">{{ level?.level ?? '—' }}</span>

        <!--
          ⚠️ **The *authority*'s name is in the document, never behind a hover**
          (`09` §4.4, `CONTEXT.md`). `S4`'s "available on inspection" means the
          name is reachable without a pointer — and the honesty bit itself is the
          marker, which is a shape rather than a tooltip. The displayed claim
          reads `--k-ink-value`; dissenting ones read `--k-ink-secondary` and
          carry their own *level*, because ADR 0005 keeps the set and PRD §5
          shows all of it.
        -->
        <span v-if="note.levels.length > 0" class="claims">
          <span class="claim attributing">{{ level?.authorityKey ?? 'estimate' }}</span>
          <span v-for="claim in dissenting" :key="claim.authorityKey ?? 'estimate'" class="claim">
            {{ claim.authorityKey ?? 'estimate' }} {{ claim.level }}
          </span>
        </span>
      </div>
    </div>

    <!-- Below the strip: what you are judging. -->
    <div class="judgements">
      <section v-for="field in judgementFields" :key="field.name" class="judgement">
        <p class="eyebrow-row">
          <span class="eyebrow accent">{{ field.label }}</span>
          <span v-if="field.note" class="provenance">{{ field.note }}</span>
        </p>

        <!--
          ⚠️ A `<textarea>` that wraps and never accepts a newline (`10` §4.4).
          It cannot be an `<input>`: 27px Mincho at 1.6 in a 940px column is
          roughly 34 characters to the line, so a Japanese sentence wraps by
          construction and an `<input>` would scroll it out of sight at the exact
          moment the reader is deciding whether it is correct.
        -->
        <textarea
          v-if="edit"
          ref="fieldElements"
          v-model="edit[field.name]"
          class="field editing"
          rows="1"
          :lang="field.type.lang"
          :style="{ fontSize: field.type.size, lineHeight: field.type.lineHeight }"
          :aria-label="field.label"
          @input="grow($event.target as HTMLTextAreaElement)"
        />
        <p
          v-else
          class="field"
          :lang="field.type.lang"
          :style="{ fontSize: field.type.size, lineHeight: field.type.lineHeight }"
        >
          {{ fields[field.name] }}
        </p>
      </section>
    </div>
  </article>
</template>

<style scoped>
/* ⚠️ **Two of the four vertical gaps below are named by a document and two are
   not**, so they are separated here rather than waved at collectively:
   `05` §5 gives **52px** from the *facts strip*'s lower rule to the first
   *judgement field* and `05` §7 gives **44px** between *judgement fields*. What
   neither `05` nor `10` gives is the *term*-to-*reading* gap or the
   *reading*-to-strip gap; both are steps off `05` §5's scale chosen by its own
   meanings — 12px "inside one thing" for a *term* and its *reading*, 32px
   "between two facts that are peers" above the strip. */

.term {
  margin: 0;
  font-size: 54px;
  font-weight: 500;
  line-height: 1;
  color: var(--k-ink);
}

.reading {
  margin: var(--k-space-3) 0 0; /* 12px — a label and its value are one thing */
  font-size: 22px;
  line-height: 1;
  /* One step back without leaving the answer — `05` §2. The *reading* is on the
     answer side of the *card* (ADR 0045), so it is not a fact's value. */
  color: var(--k-ink-quiet);
}

.strip {
  display: flex;
  align-items: center;
  margin-top: var(--k-space-7); /* 32px */
  height: 46px;
  border-top: 1px solid var(--k-rule);
  border-bottom: 1px solid var(--k-rule);
}

.fact {
  display: flex;
  align-items: baseline;
  gap: var(--k-space-2);
}

/* `10` §2.3: control padding, which `05` §5 puts outside the scale's scope. */
.fact:first-of-type {
  padding-right: 30px;
}

.fact:last-of-type {
  padding-left: 30px;
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--k-rule);
  align-self: center;
}

.eyebrow {
  font-family: var(--k-face-mono);
  font-size: 10px;
  text-transform: uppercase;
}

/* `05` §4's two eyebrow trackings. */
.eyebrow.muted {
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

.eyebrow.accent {
  letter-spacing: 0.18em;
  color: var(--k-accent);
}

/* `05` §7: fact values are 15px. */
.value {
  font-size: 15px;
  color: var(--k-ink-value);
}

/* ⚠️ `05` §7's *provenance marker* — a 7 × 7px square, and the one visible
   honesty bit ADR 0005 requires. Filled for a named *authority*, hollow for a
   model estimate. **Never behind a hover**: the *authority*'s name is rendered
   beside it as text (`09` §4.4), and the `aria-label` here says what the square
   means to a reader who cannot see it — it is not where the name lives. */
.marker {
  width: 7px;
  height: 7px;
  align-self: center;
  border: 1px solid var(--k-ink-secondary);
}

.marker.attributed {
  background: var(--k-ink);
  border-color: var(--k-ink);
}

.claims {
  display: inline-flex;
  gap: var(--k-space-2);
  font-family: var(--k-face-mono);
  font-size: 11px;
  color: var(--k-ink-secondary);
}

/* `05` §7: the attributing *authority* in `--k-ink-value`, dissenting ones one
   step quieter. */
.claim.attributing {
  color: var(--k-ink-value);
}

.claim + .claim::before {
  content: '·';
  margin-right: var(--k-space-2);
  color: var(--k-dot);
}

.judgements {
  /* `05` §5: "`52px` — from the *facts strip*'s lower rule down to the first
     *judgement field*". It is the one gap on this screen the scale names. */
  margin-top: var(--k-space-10);
  display: flex;
  flex-direction: column;
  /* `05` §7: "Fields are `44px` apart." */
  gap: var(--k-space-9);
}

.eyebrow-row {
  display: flex;
  align-items: baseline;
  gap: var(--k-space-2);
  /* `10` §2.3 resolves `05` §7's ambiguous `14` to `12`: an eyebrow and its
     value are one thing. */
  margin: 0 0 var(--k-space-3);
}

.provenance {
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

.field {
  margin: 0;
  color: var(--k-ink);
  font-weight: 300;
}

/* `10` §4.4's table — the resting field has no face and no border, and the box
   is offset by its own padding so the text does not move when editing opens. */
.field:not(.editing) {
  padding: 9px 12px;
  margin: 0 -12px;
}

textarea.field {
  display: block;
  width: calc(100% + 24px);
  margin: 0 -12px;
  padding: 9px 12px;
  box-sizing: border-box;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  color: var(--k-ink);
  font-family: inherit;
  font-weight: 300;
  resize: none;
  overflow: hidden;
}

/* ⚠️ The *term*, the *reading* and the example sentence are Japanese and take
   Mincho through `:lang(ja)` in `tokens.css`; a `<textarea>` does not inherit
   the page's family, so it is named here. */
textarea.field:lang(ja),
.field:lang(ja) {
  font-family: var(--k-face-ja);
  font-weight: 400;
}
</style>
