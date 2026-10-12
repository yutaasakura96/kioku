<script setup lang="ts">
// The summary — ADR 0076 §7 and §8, the prototype's `vSummary`: what the run
// decided, word by word, and what is waiting next.
//
// ⚠️ **It shows the run's numbers and never starts the next one** (`S7`):
// starting another is the reader's own act, on a control that says which run
// it starts.
//
// ⚠️ **Where a word went is what the server recorded** (`position.outcome`),
// never arithmetic done here. An answer still in the outbox has no outcome yet
// and its row says so — a stage and a date the database has not written would
// be the screen promising a schedule nothing has computed.
//
// ⚠️ **The unsent notice is not styled as an alert** (`10` §5.6): there is no
// alert in this system. It is a sentence with a rule above it.

import { whatNext } from '#shared/review/offer'
import type { StudyOffer } from '#shared/review/offer'
import { summarise } from '#shared/review/quiz'
import type { ReviewPosition, SessionKind } from '#shared/review/snapshot'
import { backIn, movement } from '#shared/review/stage'
import type { OutboxEntry } from '#shared/review/outbox'

const props = defineProps<{
  kind: SessionKind
  /** ADR 0076 §6 — the reader finished early. */
  early: boolean
  /** The run's positions, with the answers the server has not confirmed yet folded in. */
  positions: ReviewPosition[]
  /** What is waiting, fresh from the answer that ended the run. `null` until it lands. */
  offer: StudyOffer | null
  /** Whether that offer was counted through the reader's filter (ADR 0065 §5). */
  filtered: boolean
  unsent: number
  refused: OutboxEntry[]
  sessionExpired: boolean
  /** The way out — a *place*, and what to call it. */
  home: { to: string, name: string }
}>()

const emit = defineEmits<{ start: [kind: SessionKind] }>()

const refusedCards = computed(() => {
  const ids = new Set(props.refused.filter(entry => entry.kind !== 'finish').map(entry => entry.cardId))
  return props.positions.filter(position => ids.has(position.cardId) && !position.outcome)
})
const refusedIds = computed(() => new Set(refusedCards.value.map(position => position.cardId)))
const summary = computed(() => summarise(props.positions.filter(position => !refusedIds.value.has(position.cardId))))
const words = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const title = computed(() => {
  if (props.kind === 'lesson') {
    return summary.value.total > 0
      ? `${words(summary.value.total, 'new word', 'new words')} learned.`
      : props.early ? 'Lesson finished early.' : 'Lesson complete.'
  }

  return props.early ? 'Session finished early.' : 'Reviews done.'
})

/** What a run that stopped short left behind, or `''` when it left nothing. */
const leftLine = computed(() => {
  const left = summary.value.left

  if (left === 0)
    return ''

  return props.kind === 'lesson'
    ? `${words(left, 'word was', 'words were')} not finished and will be taught again in the next lesson.`
    : `${words(left, 'word was', 'words were')} not reached and ${left === 1 ? 'is' : 'are'} still due.`
})

function noteFor(position: ReviewPosition): string {
  // `?? null`: a position installed from a server answer is not parsed, and one
  // held from before #70 has neither field (§ Carrying).
  const outcome = position.outcome ?? null

  if (!outcome)
    return 'not sent yet'

  return `${movement(position.stage ?? null, outcome.stage)} · ${backIn(new Date(outcome.due))}`
}

const next = computed(() => (props.offer ? whatNext(props.offer, new Date(), props.filtered) : null))

const nextBody = computed(() => {
  const learned = props.kind === 'lesson' && summary.value.total > 0
    ? `${summary.value.total === 1 ? 'This word is' : `These ${summary.value.total} words are`} in your reviews now, and the gaps grow each time you get a word right.`
    : ''

  return [learned, next.value?.body ?? ''].filter(line => line !== '').join(' ')
})

const startLabel = computed(() => {
  if (!props.offer || !next.value?.start)
    return null

  if (next.value.start === 'lesson')
    return `Start lesson · ${words(props.offer.lesson, 'new word', 'new words')}`

  return props.kind === 'review' ? 'Carry on with reviews' : `Start reviews · ${props.offer.dueCount} due`
})
</script>

<template>
  <section class="summary">
    <span class="eyebrow accent">{{ kind === 'lesson' ? 'Lesson complete' : 'Session complete' }}</span>
    <h1 class="statement">
      {{ title }}
    </h1>

    <div class="tally">
      <div class="figure">
        <div class="v">
          {{ summary.total }}
        </div>
        <div class="k">
          {{ summary.total === 1 ? 'word' : 'words' }}
        </div>
      </div>
      <div class="figure">
        <div class="v">
          {{ summary.percent }}%
        </div>
        <div class="k">
          right first try
        </div>
      </div>
      <div class="figure">
        <div class="v">
          {{ summary.missed.length }}
        </div>
        <div class="k">
          missed
        </div>
      </div>
    </div>

    <p v-if="leftLine" class="left">
      {{ leftLine }}
    </p>

    <div v-if="summary.missed.length > 0" class="sumlist">
      <span class="eyebrow accent">Missed · {{ summary.missed.length }}</span>
      <ul>
        <WordRow
          v-for="position in summary.missed"
          :key="position.cardId"
          :fields="position.fields"
          :note="noteFor(position)"
          missed
        />
      </ul>
    </div>

    <div v-if="summary.right.length > 0" class="sumlist">
      <span class="eyebrow">Right first try · {{ summary.right.length }}</span>
      <ul>
        <WordRow
          v-for="position in summary.right"
          :key="position.cardId"
          :fields="position.fields"
          :note="noteFor(position)"
        />
      </ul>
    </div>

    <div v-if="refusedCards.length > 0" class="sumlist">
      <span class="eyebrow">Not recorded · {{ refusedCards.length }}</span>
      <ul>
        <WordRow
          v-for="position in refusedCards"
          :key="position.cardId"
          :fields="position.fields"
          note="refused · not recorded"
        />
      </ul>
    </div>

    <!-- ⚠️ `09` §4.8 requires it: a flush that answers 401 is not a network
         error, and an answer that did not land is surfaced rather than dropped
         (ADR 0039 property 5). -->
    <p v-if="unsent > 0 || refused.length > 0" class="unsent">
      <template v-if="unsent > 0">
        {{ unsent }} {{ unsent === 1 ? 'answer has' : 'answers have' }} not reached the database yet. They are saved here and will be sent when the connection returns.
        <NuxtLink v-if="sessionExpired" to="/auth" external class="sign-in">Sign in again</NuxtLink>
      </template>

      <!-- It names the clock because the clock is both the common cause
           (`03` §8.2) and the one the reader can fix — and it says *usually*,
           because a body the server cannot read is refused the same way. -->
      <template v-if="refused.length > 0">
        {{ refused.length }} {{ refused.length === 1 ? 'answer was' : 'answers were' }} refused and will not be sent again — usually a clock that disagrees with the server's.
      </template>
    </p>

    <div class="next">
      <span class="eyebrow">What next</span>
      <p v-if="nextBody">
        {{ nextBody }}
      </p>
      <div class="cta">
        <button v-if="startLabel && next?.start" type="button" class="btn" @click="emit('start', next.start)">
          {{ startLabel }}
        </button>
        <!-- ⚠️ `external`: a real document load, which is what strips the
             *mode*'s JavaScript on the way to a `noScripts` *place* (ADR 0032). -->
        <NuxtLink :to="home.to" external class="btn" :class="{ ghost: startLabel !== null }">
          Back to {{ home.name }}
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.summary {
  width: 100%;
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

.statement {
  margin: 6px 0 0;
  font-size: 44px;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.tally {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--k-space-3);
  margin: 22px 0 6px;
}

.figure {
  padding: 14px var(--k-space-4);
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
}

.v {
  font-size: 38px;
  font-weight: 300;
  line-height: 1;
}

.k {
  margin-top: 6px;
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--k-ink-secondary);
}

.left {
  margin: 10px 0 0;
  font-size: 15.5px;
  color: var(--k-ink-secondary);
}

.sumlist {
  margin-top: 26px;
}

.sumlist .eyebrow {
  display: block;
  margin-bottom: 10px;
}

.sumlist ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* `10` §5.6: a rule above it, and no colour. */
.unsent {
  margin: var(--k-space-7) 0 0;
  padding-top: var(--k-space-5);
  border-top: 1px solid var(--k-rule);
  font-size: 15px;
  color: var(--k-ink);
}

.sign-in {
  color: var(--k-accent);
}

.next {
  display: flex;
  flex-direction: column;
  gap: var(--k-space-3);
  margin-top: 30px;
  padding: 20px 22px;
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
}

.next p {
  margin: 0;
  font-size: 17px;
  color: var(--k-ink-quiet);
}

.cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--k-space-3);
  margin-top: 2px;
}

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

.btn.ghost {
  background: var(--k-raised);
  border-color: var(--k-border-control);
  color: var(--k-ink);
}

.btn.ghost:hover {
  background: var(--k-key-face);
}

@media (width < 720px) {
  .statement {
    font-size: 30px;
  }

  .tally {
    gap: var(--k-space-2);
  }

  .figure {
    padding: var(--k-space-3);
  }

  .v {
    font-size: 30px;
  }

  .cta .btn {
    width: 100%;
  }
}
</style>
