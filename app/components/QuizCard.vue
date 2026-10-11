<script setup lang="ts">
// One question — ADR 0076 §3, the prototype's `.quizcard`: the word, a band
// that says which half is being asked, one field, and the result of the answer
// before the next question.
//
// ⚠️ **Nothing here decides what is right.** The component hands the typed text
// up and the page asks `shared/review/answer.ts` (ADR 0060 §6). The only
// conversion in this file is the as-you-type one, which is input, not a check.
//
// ⚠️ **The band is the only thing that tells the two questions apart, so it is
// not colour alone**: it says *Meaning* or *Reading* in words, and the reading
// band is the ink ground where the meaning band is the key face. A reader who
// types the meaning into a reading question is refused with a sentence rather
// than marked wrong (ADR 0076 §5).
//
// ⚠️ **One control, two jobs**: *Check* while the field is open and *Next* once
// the result is shown, as the prototype has it — so `Enter` both checks and
// moves on, and a phone has one target that is always in the same place.
//
// ⚠️ **The field draws a focus ring** (`10` §4.2 as amended): a text field
// without visible focus is a field nobody can find.

import { bind, unbind } from 'wanakana'

import { glossPieces } from '#shared/review/answer'
import type { AnswerStep } from '#shared/review/answer'

export interface QuizFeedback {
  right: boolean
  /** A near miss that was accepted (ADR 0076 §5). */
  close: boolean
  /** What was typed, as it was checked. */
  typed: string
  /** Up to two meanings the reader did not type — the *Also* line. */
  also: string[]
}

const props = defineProps<{
  fields: Record<string, string>
  part: AnswerStep
  /** `null` while the question is open. */
  feedback: QuizFeedback | null
  /**
   * Why the last entry was not taken as an answer — the wrong script, or a
   * reading of the kanji that is not the word's (ADR 0069 §5). Nothing was
   * counted. Replaces the hint line.
   */
  problem: string | null
  /** Bumped by the page each time an entry is refused, so the field shakes again. */
  refusals: number
  /** Emptied by the kanji-reading retry: the field is cleared for a second go. */
  clearings: number
}>()

const emit = defineEmits<{ check: [typed: string], next: [] }>()

const field = useTemplateRef<HTMLInputElement>('field')
const control = useTemplateRef<HTMLButtonElement>('control')

const isReading = computed(() => props.part === 'reading')

/**
 * `wanakana`'s `bind`, for as long as the field exists. ⚠️ **A directive rather
 * than `onMounted`**, because the listeners must leave with the element. The
 * page keys this component by question, so a meaning field is never a reading
 * field that was bound a moment ago.
 */
const vKana = {
  mounted: (element: HTMLInputElement, binding: { value: boolean }) => {
    if (binding.value)
      bind(element, { IMEMode: 'toHiragana' })
  },
  beforeUnmount: (element: HTMLInputElement, binding: { value: boolean }) => {
    if (binding.value)
      unbind(element)
  },
}

/** The answer as the result line gives it: the reading, or the first two meanings. */
const answer = computed(() =>
  isReading.value
    ? props.fields.reading ?? ''
    : glossPieces(props.fields.meaning ?? '').slice(0, 2).join(', '),
)

const wholeMeaning = computed(() => glossPieces(props.fields.meaning ?? '').slice(0, 3).join(', '))

function onSubmit() {
  if (props.feedback)
    emit('next')
  else
    emit('check', field.value?.value ?? '')
}

const shaking = ref(false)

watch(() => props.refusals, async () => {
  // Off and on again across a frame, so a second refusal animates like the first.
  shaking.value = false
  await nextTick()
  shaking.value = true
  field.value?.focus({ preventScroll: true })
})

watch(() => props.clearings, () => {
  if (!field.value)
    return

  field.value.value = ''
  field.value.focus({ preventScroll: true })
})

/**
 * ⚠️ **Focus follows the one control that `Enter` should reach**: the field
 * while it is open, and *Next* once the result is shown — where the field is
 * read-only and a keystroke in it would do nothing.
 */
async function focus() {
  await nextTick()

  if (props.feedback)
    control.value?.focus({ preventScroll: true })
  else
    field.value?.focus({ preventScroll: true })
}

watch(() => props.feedback, focus)
onMounted(focus)

defineExpose({ focus })
</script>

<template>
  <article class="quizcard">
    <div class="term" lang="ja">
      {{ fields.term }}
    </div>

    <div class="ask" :class="part">
      <b>{{ isReading ? 'Reading' : 'Meaning' }}</b>
      <span>{{ isReading ? 'How is it read? Type in romaji, it turns into kana.' : 'What does it mean? Answer in English.' }}</span>
    </div>

    <div class="answer" :class="feedback ? (feedback.right ? 'ok' : 'no') : null">
      <form autocomplete="off" @submit.prevent="onSubmit">
        <input
          ref="field"
          v-kana="isReading"
          :class="{ shake: shaking }"
          :lang="isReading ? 'ja' : undefined"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          :enterkeyhint="feedback ? 'next' : 'done'"
          :aria-label="isReading ? 'Reading' : 'Meaning'"
          :placeholder="isReading ? 'reading' : 'meaning'"
          :readonly="feedback !== null"
          aria-describedby="quiz-result"
          @animationend="shaking = false"
        >
        <button ref="control" type="submit" class="btn">
          {{ feedback ? 'Next' : 'Check' }}
        </button>
      </form>

      <!-- ⚠️ **One live region for all three lines** — the hint, a refusal and
           the result — so a screen reader hears the answer to what it just
           typed without the focus having to move to it. -->
      <div id="quiz-result" role="status" aria-live="polite">
        <div v-if="feedback?.right" class="fb ok">
          <span class="verdict">Correct</span>
          <span v-if="feedback.close">Close enough. The answer is <span class="ans" :lang="isReading ? 'ja' : undefined">{{ answer }}</span></span>
          <span v-else-if="feedback.also.length > 0" class="quiet">Also: {{ feedback.also.join(', ') }}</span>
        </div>

        <div v-else-if="feedback" class="fb no">
          <span class="verdict">Not quite</span>
          <span>The answer is <span class="ans" :lang="isReading ? 'ja' : undefined">{{ answer }}</span></span>
        </div>

        <div v-else-if="problem" class="fb no">
          {{ problem }}
        </div>

        <div v-else class="fb hint">
          Press Enter or tap Check.
        </div>
      </div>

      <details v-if="feedback" class="more-info">
        <summary>Show the whole word</summary>
        <dl class="kv">
          <dt>WORD</dt>
          <dd lang="ja">
            {{ fields.term }}
          </dd>
          <dt>READING</dt>
          <dd lang="ja">
            {{ fields.reading }}
          </dd>
          <dt>MEANING</dt>
          <dd>{{ wholeMeaning }}</dd>
          <template v-if="fields.example_sentence">
            <dt>EXAMPLE</dt>
            <dd>
              <span lang="ja">{{ fields.example_sentence }}</span>
              <template v-if="fields.example_gloss">
                <br><i class="quiet">{{ fields.example_gloss }}</i>
              </template>
            </dd>
          </template>
        </dl>
      </details>
    </div>
  </article>
</template>

<style scoped>
.quizcard {
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
  box-shadow: var(--k-shadow-card);
  overflow: hidden;
}

.term {
  padding: 46px 20px 40px;
  font-size: 104px;
  line-height: 1.05;
  letter-spacing: 0.04em;
  text-align: center;
  overflow-wrap: anywhere;
}

.ask {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  padding: 11px var(--k-space-4);
  font-size: 16px;
  text-align: center;
}

.ask b {
  font-family: var(--k-face-mono);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.ask.meaning {
  background: var(--k-key-face);
  border-top: 1px solid var(--k-rule-raised);
  border-bottom: 1px solid var(--k-rule-raised);
  color: var(--k-ink);
}

/* ⚠️ `--k-ink-value` and not the prototype's secondary ink: secondary on the
   key face is 4.17, under ADR 0024's 4.5. */
.ask.meaning span {
  color: var(--k-ink-value);
}

.ask.reading {
  background: var(--k-ink-ground);
  border-top: 1px solid var(--k-ink-ground);
  border-bottom: 1px solid var(--k-ink-ground);
  color: var(--k-on-ink);
}

.ask.reading span {
  color: var(--k-on-ink-quiet);
}

.answer {
  padding: 22px 24px 24px;
}

.answer form {
  display: flex;
  gap: 10px;
}

.answer input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 12px 14px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 26px;
  color: var(--k-ink);
  text-align: center;
}

.answer input[lang='ja'] {
  font-family: var(--k-face-ja);
}

/* ⚠️ Secondary ink, not the prototype's paler grey, which is 2.29 on white. */
.answer input::placeholder {
  font-size: 19px;
  color: var(--k-ink-secondary);
  opacity: 1;
}

.answer.ok input {
  background: var(--k-right-tint);
  border-color: var(--k-right);
  color: var(--k-right-ink);
}

.answer.no input {
  background: var(--k-wrong-tint);
  border-color: var(--k-wrong);
  color: var(--k-wrong-ink);
}

.btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  background: var(--k-ink-ground);
  border: 1px solid var(--k-ink-ground);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 17px;
  line-height: 1.2;
  color: var(--k-on-ink);
  cursor: pointer;
}

.fb {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 14px;
  min-height: 28px;
  margin-top: 14px;
  font-size: 17px;
}

.verdict {
  font-family: var(--k-face-mono);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.fb.ok .verdict {
  color: var(--k-right);
}

.fb.no .verdict {
  color: var(--k-wrong);
}

.ans {
  font-size: 21px;
}

.fb.hint {
  font-size: 15px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

.quiet {
  color: var(--k-ink-secondary);
}

.more-info {
  margin-top: var(--k-space-3);
  font-size: 15px;
  color: var(--k-ink-secondary);
}

.more-info summary {
  width: fit-content;
  color: var(--k-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.kv {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--k-space-1) 14px;
  margin: 10px 0 0;
  font-size: 15px;
  color: var(--k-ink);
}

.kv dt {
  padding-top: 3px;
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-secondary);
}

.kv dd {
  margin: 0;
}

.shake {
  animation: shake 0.3s;
}

@keyframes shake {
  25% {
    transform: translateX(-6px);
  }

  75% {
    transform: translateX(6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shake {
    animation: none;
  }
}

@media (width < 720px) {
  .term {
    padding: 30px 12px 26px;
    font-size: 72px;
  }

  .answer {
    padding: 16px 14px 18px;
  }

  .answer input {
    padding: 11px 8px;
    font-size: 22px;
  }

  .btn {
    padding: 12px 16px;
  }
}
</style>
