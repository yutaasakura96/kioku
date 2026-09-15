<script setup lang="ts">
// *Review*'s two answer steps — [ADR 0060](../../docs/adr/0060-review-is-answered-by-typing-and-the-check-proposes-the-grade.md)
// §2, and `10` §5.4 as amended.
//
// The reading field converts romaji to hiragana as the reader types, through
// `wanakana`'s `bind`; kana typed through a system IME passes through. `Enter`
// checks it and the meaning field appears. `Enter` there checks the meaning and
// the *card* turns.
//
// ⚠️ **Nothing here decides what is right.** The component hands the typed text
// up and the page asks `shared/review/answer.ts` (ADR 0060 §6). The only
// conversion in this file is the as-you-type one, which is input, not a check.
//
// ⚠️ **The field's `Enter` is handled here and the container ignores it**
// (ADR 0060 §7). The keydown still bubbles to the mode container, which is where
// the handlers live and must stay (ADR 0025); the container is told the event
// came from a field and answers only `Esc`.
//
// ⚠️ **These are the only elements in a running *mode* that draw a focus ring**
// (`10` §4.2 as amended) — the same exception *Vet*'s edit field has, for the
// same reason: a text field without visible focus is a field nobody can find.

import { bind, unbind } from 'wanakana'

import { fieldAction } from '#shared/review/keystroke'
import type { ReviewStep } from '#shared/review/keystroke'
import type { SubjectDeclaration } from '#shared/subject/declaration'

const props = defineProps<{
  step: ReviewStep
  declaration: SubjectDeclaration
  /** What the reader typed, as the page folded it for display. */
  typed: { reading: string, meaning: string }
  check: { reading: boolean | null, meaning: boolean | null }
  /** Shown beside the reading result, before the *card* turns. */
  storedReading: string
}>()

const emit = defineEmits<{ reading: [typed: string], meaning: [typed: string] }>()

const readingField = useTemplateRef<HTMLInputElement>('readingField')
const meaningField = useTemplateRef<HTMLInputElement>('meaningField')

/**
 * `wanakana`'s `bind`, for as long as the field exists. ⚠️ **A directive rather
 * than `onMounted`**, because the field leaves the DOM when its step is checked
 * and the listeners must go with it.
 */
const vKana = {
  mounted: (element: HTMLInputElement) => bind(element, { IMEMode: 'toHiragana' }),
  beforeUnmount: (element: HTMLInputElement) => unbind(element),
}

const label = (name: string) =>
  props.declaration.fields.find(field => field.name === name)?.label ?? name.toUpperCase()

const verdict = (right: boolean | null) => (right ? 'Right' : 'Wrong')

function onKeydown(event: KeyboardEvent, step: 'reading' | 'meaning') {
  if (fieldAction(event) !== 'check')
    return

  event.preventDefault()

  const value = (event.target as HTMLInputElement).value

  if (step === 'reading')
    emit('reading', value)
  else
    emit('meaning', value)
}

defineExpose({
  focus() {
    const field = props.step === 'meaning' ? meaningField.value : readingField.value
    field?.focus()
  },
})
</script>

<template>
  <div class="answers" :class="{ turned: step === 'back' }">
    <div class="row">
      <label class="eyebrow" for="answer-reading">{{ label('reading') }}</label>

      <input
        v-if="step === 'reading'"
        id="answer-reading"
        ref="readingField"
        v-kana
        class="field reading"
        lang="ja"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="next"
        @keydown="onKeydown($event, 'reading')"
      >

      <p v-else class="given" :class="check.reading ? 'right' : 'wrong'">
        <span class="typed" lang="ja">{{ typed.reading || '—' }}</span>
        <span class="verdict">{{ verdict(check.reading) }}</span>
        <!-- ADR 0060 §2: the result shows **with the stored reading**. On the
             back the *card* already carries it, so it is not said twice. -->
        <span v-if="step === 'meaning'" class="stored" lang="ja">{{ storedReading }}</span>
      </p>
    </div>

    <div v-if="step !== 'reading'" class="row">
      <label class="eyebrow" for="answer-meaning">{{ label('meaning') }}</label>

      <input
        v-if="step === 'meaning'"
        id="answer-meaning"
        ref="meaningField"
        class="field meaning"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="done"
        @keydown="onKeydown($event, 'meaning')"
      >

      <p v-else class="given" :class="check.meaning ? 'right' : 'wrong'">
        <span class="typed">{{ typed.meaning || '—' }}</span>
        <span class="verdict">{{ verdict(check.meaning) }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* `10` §5.4 as amended: on the front the fields sit under the *term*, 420px and
   centred; on the back the results are the *card*'s last row, full width, under
   a `--k-rule-raised` rule like the one above the *meaning*. */
.answers {
  display: flex;
  flex-direction: column;
  gap: var(--k-space-4);
  width: 100%;
  max-width: 420px;
  margin: var(--k-space-7) auto 0;
}

.answers.turned {
  max-width: none;
  margin: var(--k-space-8) 0 0;
  padding-top: var(--k-space-6);
  border-top: 1px solid var(--k-rule-raised);
  gap: var(--k-space-2);
}

.row {
  display: grid;
  grid-template-columns: 76px 1fr;
  align-items: center;
  gap: var(--k-space-3);
}

/* `05` §4's muted eyebrow: 10px mono at 0.14em — the fact row's. */
.eyebrow {
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

/* *Vet*'s edit field (`10` §4.4), at *Review*'s sizes: `--k-raised`, `1px
   --k-border-control`, `--k-radius-control`, `9px 12px`. */
.field {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  color: var(--k-ink);
  font-family: var(--k-face-en);
  font-size: 22px;
  font-weight: 400;
}

/* ⚠️ An `<input>` does not inherit the page's family, so `:lang(ja)` in
   `tokens.css` does not reach it — Mincho is named here, as *Vet* names it. */
.field.reading {
  font-family: var(--k-face-ja);
  font-size: 25px;
}

.given {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--k-space-3);
  margin: 0;
  font-size: 17px;
  color: var(--k-ink-value);
}

/* ⚠️ **The verdict is a word in `--k-ink`, and the accent is not spent on it**
   (`05` §2: the accent means *where you are*). A colour that meant *wrong* would
   also be the only signal a colour-blind reader could miss (SC 1.4.1). */
.verdict {
  font-family: var(--k-face-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--k-ink);
}

.stored {
  color: var(--k-ink-quiet);
}

/* ⚠️ `10` §10.2 and the on-screen keyboard. **16px is the floor for a focused
   field on iOS Safari**, below which it zooms the page; 18px and 17px match the
   phone's *reading* and example sizes. */
@media (width < 720px) {
  .answers {
    margin-top: var(--k-space-5);
  }

  .row {
    grid-template-columns: 64px 1fr;
  }

  .field {
    font-size: 17px;
  }

  .field.reading {
    font-size: 18px;
  }

  .given {
    font-size: 15px;
  }
}
</style>
