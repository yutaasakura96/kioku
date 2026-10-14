<script setup lang="ts">
// The placement test — a *mode* (ADR 0013, ADR 0079 §1), the prototype's
// `vPlacement`. `routeRules: { ssr: false }`: the test is walked here, one
// question at a time, and nothing is written until the reader accepts the
// result.
//
// ⚠️ **Three screens and the bar** (`view`): the introduction, a question,
// and the result. A reload starts the test again — it is three minutes, and a
// half-taken test held over a reload would be a test of two sittings.
//
// ⚠️ **The server scores the answers again** when the result is accepted
// (`POST /api/placement`), with the same rules this screen walked the test
// with (`shared/level/placement.ts`), so the level shown is the level written.
//
// ⚠️ **Every way out performs an external document navigation** (`09` §5.2,
// ADR 0032), as *Review*'s does: a bare `<NuxtLink>` would client-render a
// `noScripts` *place* into a page that is running.

import {
  nextQuestion,
  placedLevel,
  resultBody,
  resultHeadline,
  startLevel,
  tally,
} from '#shared/level/placement'
import type { PlacementQuestion } from '#shared/level/placement'
import { PLACEMENT_WORDS_PER_LEVEL } from '#shared/level/thresholds'
import { resolveOrigin } from '#shared/utils/origin'

const route = useRoute()
const origin = computed(() => resolveOrigin(route.query.from))

const status = ref<'loading' | 'ready' | 'error'>('loading')
const step = ref<'intro' | 'question' | 'result'>('intro')
const questions = ref<PlacementQuestion[]>([])

/** The answers so far, in the order given: the word, what was picked, and whether it was right. */
const answers = ref<Array<{ noteId: string, level: string, choice: string | null, right: boolean }>>([])

const saving = ref(false)
const saveFailed = ref(false)

const question = computed(() => nextQuestion(questions.value, answers.value))
const tallies = computed(() => tally(answers.value))
const placed = computed(() => placedLevel(tallies.value))
const start = computed(() => startLevel(placed.value))

/** *about 25* is the most the test can ask; the count is of that, as the prototype's is. */
const total = computed(() => questions.value.length)

onMounted(async () => {
  try {
    const response = await $fetch<{ questions: PlacementQuestion[] }>('/api/placement')

    questions.value = response.questions
    status.value = 'ready'
  }
  catch {
    status.value = 'error'
  }
})

function begin() {
  answers.value = []
  step.value = 'question'
}

function pick(choice: string | null) {
  const asked = question.value
  if (!asked)
    return

  answers.value = [...answers.value, {
    noteId: asked.noteId,
    level: asked.level,
    choice,
    right: choice !== null && choice === asked.answer,
  }]

  if (!nextQuestion(questions.value, answers.value))
    step.value = 'result'
}

async function accept() {
  saving.value = true
  saveFailed.value = false

  try {
    await $fetch('/api/placement', {
      method: 'POST',
      body: { answers: answers.value.map(({ noteId, choice }) => ({ noteId, choice })) },
    })
    // Home, as the prototype's *Start at* lands there: it is where the level shows.
    window.location.assign('/')
  }
  catch {
    saving.value = false
    saveFailed.value = true
  }
}
</script>

<template>
  <div class="mode">
    <ModeBar
      name="Placement test"
      :progress="step === 'intro' ? 0 : step === 'result' ? 1 : answers.length / Math.max(1, total)"
      :count="step === 'question' ? `${answers.length + 1} of ${total}` : step === 'result' ? 'Done' : undefined"
    >
      <template #exit>
        <NuxtLink :to="origin" external class="exit">
          Leave
        </NuxtLink>
      </template>
    </ModeBar>

    <main class="body">
      <p v-if="status === 'loading'" class="quiet" role="status">
        Loading the test…
      </p>

      <div v-else-if="status === 'error'" class="card intro" role="alert">
        <h1>The test did not load.</h1>
        <p>Nothing was saved. Try again, or start from a level instead.</p>
        <div class="cta">
          <a :href="route.fullPath" class="btn">Try again</a>
          <NuxtLink :to="origin" external class="btn ghost">
            Leave
          </NuxtLink>
        </div>
      </div>

      <div v-else-if="step === 'intro'" class="card intro">
        <p class="eyebrow">
          About 3 minutes
        </p>
        <h1>Let us find where you should start.</h1>
        <p>You will see about {{ total }} words, from easy to hard. Pick what each one means.</p>
        <ul>
          <li>If you do not know a word, say so. Guessing makes the estimate worse.</li>
          <li>The test stops early once it has found your level.</li>
          <li>You can retake it any time from More.</li>
        </ul>
        <div class="cta">
          <button type="button" class="btn" :disabled="total === 0" @click="begin">
            Start the test
          </button>
          <NuxtLink :to="origin" external class="btn ghost">
            Not now
          </NuxtLink>
        </div>
      </div>

      <article v-else-if="step === 'question' && question" :key="question.noteId" class="card quiz">
        <div class="term" lang="ja">
          {{ question.term }}
        </div>
        <div class="ask">
          <b>Meaning</b>
          <span>What does this word mean?</span>
        </div>
        <div class="choices">
          <button v-for="choice in question.choices" :key="choice" type="button" @click="pick(choice)">
            {{ choice }}
          </button>
        </div>
        <div class="dunno">
          <button type="button" @click="pick(null)">
            I do not know this one
          </button>
        </div>
      </article>

      <div v-else-if="step === 'result'" class="card intro">
        <p class="eyebrow accent">
          Your result
        </p>
        <h1>{{ resultHeadline(placed) }}</h1>
        <p>{{ resultBody(placed) }}</p>
        <div>
          <div v-for="row in tallies" :key="row.level" class="resrow" :class="{ pass: row.passed }">
            <span>{{ row.level }}</span>
            <span class="pip" aria-hidden="true">
              <i v-for="index in PLACEMENT_WORDS_PER_LEVEL" :key="index" :class="{ y: index <= row.right, asked: index <= row.asked }" />
            </span>
            <span class="r">{{ row.asked === 0 ? 'not reached' : `${row.right} of ${row.asked}${row.passed ? ' · known' : ''}` }}</span>
          </div>
        </div>
        <p class="quiet small">
          This is a starting point. The estimate keeps updating from your answers in lessons and reviews.
        </p>
        <p v-if="saveFailed" class="failed" role="alert">
          That did not save. Nothing changed; try again.
        </p>
        <div class="cta">
          <button type="button" class="btn" :disabled="saving" @click="accept">
            Start at {{ start }}
          </button>
          <NuxtLink to="/categories" external class="btn ghost">
            Pick a different level
          </NuxtLink>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* The prototype's placement screens (`docs/prototype/`), on `05`'s tokens. */
.mode {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--k-ground);
}

.body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 34px var(--k-gutter) 48px;
}

.body > * {
  width: 100%;
  max-width: var(--k-measure-object);
}

.card {
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
  box-shadow: var(--k-shadow-card);
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 36px 40px 34px;
}

.intro h1 {
  margin: 0;
  font-size: 40px;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.intro p,
.intro ul {
  margin: 0;
  font-size: 18px;
  color: var(--k-ink-quiet);
}

.intro ul {
  padding-left: 20px;
  font-size: 17px;
}

.eyebrow {
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--k-ink-secondary);
}

.eyebrow.accent {
  color: var(--k-accent);
}

.quiet {
  color: var(--k-ink-secondary);
}

.intro .small {
  font-size: 15px;
}

.failed {
  color: var(--k-wrong);
}

.cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}

/* The prototype's `.btn` and its ghost. */
.btn {
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
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

.btn:disabled {
  cursor: progress;
  opacity: 0.6;
}

.btn.ghost {
  background: var(--k-raised);
  border-color: var(--k-border-control);
  color: var(--k-ink);
}

.btn.ghost:hover {
  background: var(--k-key-face);
}

/* A question: the word, what is asked, four choices and *I do not know*. */
.quiz {
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
  background: var(--k-key-face);
  border-top: 1px solid var(--k-rule-raised);
  border-bottom: 1px solid var(--k-rule-raised);
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

.ask span {
  color: var(--k-ink-secondary);
}

.choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 20px 24px 8px;
}

.choices button {
  min-height: 44px;
  padding: 14px 12px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 18px;
  color: var(--k-ink);
  cursor: pointer;
}

.choices button:hover {
  background: var(--k-key-face);
}

.dunno {
  padding: 4px 24px 22px;
}

.dunno button {
  width: 100%;
  min-height: 44px;
  padding: 11px;
  background: none;
  border: 1px dashed var(--k-border-dashed);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 16px;
  color: var(--k-ink-secondary);
  cursor: pointer;
}

.dunno button:hover {
  background: var(--k-key-face);
}

/* The result: one row a level, a pip an answer, filled when right. */
.resrow {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--k-rule-raised);
  font-family: var(--k-face-mono);
  font-size: 13px;
}

.pip {
  display: flex;
  gap: 5px;
}

.pip i {
  width: 34px;
  height: 8px;
  border-radius: 3px;
  background: var(--k-tick-empty);
}

.pip i.y {
  background: var(--k-ink);
}

.resrow .r {
  color: var(--k-ink-secondary);
}

.resrow.pass .r {
  color: var(--k-right);
}

@media (width < 720px) {
  .body {
    padding: 20px var(--k-space-4) 32px;
  }

  .intro {
    padding: 26px 22px 24px;
  }

  .intro h1 {
    font-size: 30px;
  }

  .term {
    padding: 32px 16px 28px;
    font-size: 72px;
  }

  .choices {
    grid-template-columns: minmax(0, 1fr);
    padding: 16px 16px 6px;
  }

  .dunno {
    padding: 4px 16px 18px;
  }

  .pip i {
    width: 22px;
  }
}
</style>
