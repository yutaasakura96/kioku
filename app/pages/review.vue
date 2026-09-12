<script setup lang="ts">
// *Review* — a *mode* (ADR 0013). `routeRules: { ssr: false }`, no header, no
// navigation, and exactly one way out: `Esc`, and a Done control present on
// every viewport, because a phone has no `Esc` (ADR 0026, ADR 0032).
//
// ⚠️ **The *progress rail* stands in for the header** (`10` §5.2, `05` §7,
// `CONTEXT.md`). *Review* carries no screen label in any of its four states, and
// the rail is the only progress indicator in the application. It knows its own
// length because a graded *card* leaves the *session* and never returns
// (ADR 0016) — which is a scheduling decision showing up as a drawing one.
//
// ⚠️ **The key handlers bind to the mode container, never to `document` or
// `window`** (ADR 0025, `10` §4.1). ADR 0023's map is all printable characters,
// so **SC 2.1.4 Character Key Shortcuts (Level A)** applies and this application
// conforms only through that criterion's "active only on focus" exception.
//
// ⚠️ **Done performs an external document navigation** (`09` §5.2, ADR 0032).
// A bare `<NuxtLink>` client-renders the *place* into the page that is already
// running and hands the reader a `noScripts` screen with a live Vue application
// on it, with no error anywhere.
//
// ⚠️ **The interface never waits on a flush** (`S8`, ADR 0007). A *grade* is
// stamped at the keystroke, appended to the outbox, painted at once, and sent
// behind the reader; the next *card* renders from the snapshot this screen
// already holds.
//
// ⚠️ **The outbox carries two kinds of entry** (`03` §8.1 as amended
// 2026-09-07, ADR 0039): a *grade*, and `S9`'s `X`. Both the snapshot and the
// stream live in `localStorage` (ADR 0014), so a tunnel and a tab crash fail the
// same way — which is to say they do not — and the storage helper is an
// **explicit import** because Nuxt has a built-in of that name
// (`app/utils/review-store.ts`).

import { GRADE_KEYS, endScreenAction, reviewAction } from '#shared/review/keystroke'
import { DEFAULT_SESSION_SIZE } from '#shared/review/compose'
import { append, head, parseOutbox, settle, unsentAnswers } from '#shared/review/outbox'
import { isRefused } from '#shared/review/request'
import { isAnswered, mergeGrades, parseSnapshot } from '#shared/review/snapshot'
import { jlptVocab } from '#shared/subject/declaration'
import { nextDueLabel } from '#shared/review/next-due'
import { resolveOrigin } from '#shared/utils/origin'
import type { Grade } from '#shared/review/scheduler'
import type { NothingToStudy, ReviewSnapshot } from '#shared/review/snapshot'
import type { Answer, OutboxDraft, OutboxEntry } from '#shared/review/outbox'
import type { AnswerOutcome } from '#shared/review/request'
import type { Tick } from '../components/ProgressRail.vue'
// ⚠️ **The explicit import `03` §8.1 asks for.** `app/utils/` is auto-imported,
// so the names below are ambiently available too — and a `useStorage`-shaped
// call that resolved to Nitro's built-in of that name is the failure
// verification §5.5 recorded. Naming the file at the call site is what makes it
// unambiguous which store this is.
import { OUTBOX_KEY, REFUSED_KEY, SNAPSHOT_KEY, clearStored, readStored, writeStored } from '../utils/review-store'

const route = useRoute()
const origin = computed(() => resolveOrigin(route.query.from))

/** `10` §5.9: below this a statement flashing is worse than quiet ground. */
const LOADING_THRESHOLD = 500

interface SessionResponse {
  session: ReviewSnapshot | null
  empty: NothingToStudy | null
}

/**
 * The two endpoints answer the same shape — one stream, two entry types.
 *
 * ⚠️ **`AnswerOutcome` is imported rather than restated.** A sixth value written
 * into only one of the two places it lives is `04` §13's drift argument at five
 * string literals, and the drift would show as an outcome this screen silently
 * treats as a success.
 */
interface AnswerResponse {
  outcome: AnswerOutcome
  session: ReviewSnapshot | null
}

const snapshot = ref<ReviewSnapshot | null>(null)
const nothing = ref<NothingToStudy | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const slow = ref(false)
const face = ref<'front' | 'back'>('front')
const size = ref(DEFAULT_SESSION_SIZE)

/**
 * Answers given but not yet reflected in a snapshot the server has answered
 * with — a *grade*, or `S9`'s flag.
 *
 * ⚠️ **This is the whole of the client's optimism**, and it is what `S8` buys:
 * the next *card* paints on the keystroke rather than on the response. It is
 * pruned against every answer, so a position counts exactly once whether the
 * request has landed or not — and ⚠️ **it is rebuilt from the outbox on a
 * reload** (ADR 0039 property 4), because the durable record decides and this
 * map is client memory.
 */
const answers = ref(new Map<string, Answer>())

/**
 * ⚠️ **The durable half** (ADR 0014). Everything the reader has answered and the
 * server has not acknowledged, in the order it was given, append-only.
 */
const outbox = ref<OutboxEntry[]>([])

/**
 * `03` §8.2's refusals — ⚠️ **surfaced, never dropped** (ADR 0039 property 5).
 * They are kept in the store rather than in memory for the same reason the
 * outbox is: a reload that lost them would be the drop this list exists to
 * prevent, arriving through the mechanism added to prevent it.
 */
const refused = ref<OutboxEntry[]>([])

/** ⚠️ `09` §4.8 — surfaced on the end screen, and it is a count of the stream. */
const unsent = computed(() => outbox.value.length)
const sessionExpired = ref(false)

/** `10` §5.5: visible for as long as it takes the next *card* to render. */
const justGraded = ref<Grade | null>(null)

const positions = computed(() =>
  (snapshot.value?.positions ?? []).map((position) => {
    const local = answers.value.get(position.cardId)

    return {
      ...position,
      grade: position.grade ?? (typeof local === 'number' ? local : null),
      flagged: position.flagged || local === 'flagged',
    }
  }),
)

const currentIndex = computed(() => positions.value.findIndex(position => !isAnswered(position)))
const current = computed(() => positions.value[currentIndex.value] ?? null)
const ended = computed(() => Boolean(snapshot.value) && currentIndex.value === -1)

/** The left counter — where the reader is, and the run's length once it ends. */
const railPosition = computed(() => {
  if (currentIndex.value === -1)
    return positions.value.length

  return currentIndex.value + 1
})

const ticks = computed<Tick[]>(() =>
  positions.value.map((position, index) => {
    if (position.grade !== null)
      return 'graded'

    // ⚠️ `10` §5.3's fourth mark: **less than an answer and more than nothing**,
    // so it takes the graded fill at 2px rather than a colour of its own.
    if (position.flagged)
      return 'flagged'

    return index === currentIndex.value ? 'current' : 'empty'
  }),
)

/**
 * ⚠️ **The end screen's four figures are the four *grades***
 * ([ADR 0053](../../docs/adr/0053-the-end-screens-four-figures-are-the-four-grades.md)).
 * `10` §5.6 asks for "the *session*'s numbers" in `05` §7's four equal columns
 * and never says which four; the distribution is the only set of four the run
 * actually produced, and it is the one that answers *how did that go*.
 *
 * ⚠️ **A flagged position is in none of them**, which is what `S9`'s *advances
 * without a grade* looks like arithmetically: a twenty-*card* run can end with
 * nineteen answers, and the rail above is where that is visible (`09` §4.9).
 */
const tally = computed(() =>
  // ⚠️ **The eyebrows are the control labels, upper-cased, rather than a second
  // list beside them.** ADR 0053's argument is that the reader does not have to
  // learn a second naming for the key they just pressed — so the two must not be
  // able to drift, which is `04` §13's rule at four words.
  GRADE_KEYS.map(entry => ({
    eyebrow: entry.label.toUpperCase(),
    figure: positions.value.filter(position => position.grade === entry.grade).length,
  })),
)

/**
 * `10` §5.7's "single datum given weight".
 *
 * ⚠️ The `new Date()` is not decoration: the snapshot crosses the wire as JSON,
 * so a `Date` arrives here as a string and the seam takes the real thing.
 */
const nextDue = computed(() =>
  nextDueLabel(nothing.value?.nextDue ? new Date(nothing.value.nextDue) : null),
)

// -- Focus ------------------------------------------------------------------

const container = useTemplateRef<HTMLElement>('container')

function focusContainer() {
  container.value?.focus()
}

// -- The store (ADR 0014) ---------------------------------------------------

function holdSnapshot(next: ReviewSnapshot | null) {
  snapshot.value = next

  if (next)
    writeStored(SNAPSHOT_KEY, next)
  else
    clearStored(SNAPSHOT_KEY)
}

function holdOutbox(next: OutboxEntry[]) {
  outbox.value = next
  writeStored(OUTBOX_KEY, next)
}

function holdRefused(next: OutboxEntry[]) {
  refused.value = next

  if (next.length > 0)
    writeStored(REFUSED_KEY, next)
  else
    clearStored(REFUSED_KEY)
}

/**
 * `09` §4.7 step 2 — ⚠️ **`localStorage` first, and in front of the server
 * rather than instead of it.**
 *
 * ⚠️ **The words come back from the store.** A resumed run that re-read
 * `note.fields` from the database would be PRD §5's *a note edited mid-session
 * shows the old text* failing quietly — through the very mechanism added to make
 * the run survive a reload (§ Carrying, `shared/review/snapshot.ts`). What is
 * held here is what the reader was handed.
 */
function restore() {
  const stream = parseOutbox(readStored(OUTBOX_KEY))
  const held = parseSnapshot(readStored(SNAPSHOT_KEY))

  outbox.value = stream
  refused.value = parseOutbox(readStored(REFUSED_KEY))

  if (!held)
    return

  snapshot.value = held
  size.value = held.size
  // ⚠️ **The stream re-answers the run.** The optimistic map is client memory
  // and the reload just lost it; without this the reader is asked a *card* they
  // have already answered and PRD §5's *the same card graded twice* stops being
  // an edge case about two devices and becomes what a refresh does.
  answers.value = unsentAnswers(stream, held.sessionId)
  status.value = 'ready'
}

// -- Requests ---------------------------------------------------------------

/**
 * ⚠️ **One at a time, in the order they were given.** Two answers in flight at
 * once would apply their snapshots in whatever order they came back, and each
 * answer carries the whole run — so the later one could rewind the rail under
 * the reader's hands. The **interface** does not wait on this; only the requests
 * queue behind each other.
 */
let chain: Promise<unknown> = Promise.resolve()

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work)
  chain = next.catch(() => undefined)
  return next
}

/**
 * A server answer folded into the run the reader is holding.
 *
 * ⚠️ **It moves the answers and never the words** (`shared/review/snapshot.ts`,
 * PRD §5). Installing the answer wholesale would re-read `note.fields` mid-run
 * — the whole *session* is prefetched as a unit precisely so that the text the
 * reader started with is the text they finish with.
 */
function apply(fresh: ReviewSnapshot) {
  const held = snapshot.value
  if (!held)
    return

  holdSnapshot(mergeGrades(held, fresh))
  nothing.value = null

  const confirmed = new Set(
    fresh.positions.filter(isAnswered).map(position => position.cardId),
  )

  answers.value = new Map([...answers.value].filter(([cardId]) => !confirmed.has(cardId)))
}

type Landing = 'landed' | 'refused' | 'held'

/**
 * One entry, at the head of the stream.
 *
 * ⚠️ **Three outcomes, and `held` is the only one that keeps the entry.**
 * `not_in_session` and `already_graded` are `200`s about a *grade* the durable
 * record has already decided; retrying either forever would be the client's
 * memory arguing with the database.
 */
async function send(entry: OutboxEntry): Promise<Landing> {
  try {
    const response = await $fetch<AnswerResponse>(
      entry.kind === 'grade' ? '/api/review/grade' : '/api/review/flag',
      {
        method: 'POST',
        body: entry.kind === 'grade'
          ? {
              sessionId: entry.sessionId,
              cardId: entry.cardId,
              grade: entry.grade,
              reviewedAt: entry.reviewedAt,
            }
          : { sessionId: entry.sessionId, cardId: entry.cardId },
      },
    )

    if (response.session)
      apply(response.session)

    return isRefused(response.outcome) ? 'refused' : 'landed'
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode

    // ⚠️ **A flush that answers 401 is not a network error** (`08` §5.6,
    // `09` §4.8). The *session* expired mid-run, so it must not be retried on
    // the same backoff forever: the replay stops, the end screen reports it and
    // offers the door.
    if (status === 401) {
      sessionExpired.value = true
      return 'held'
    }

    // ⚠️ **A `400` can never succeed, so holding it blocks the whole stream.**
    // `shared/review/request.ts` refuses a body it cannot read — reachable
    // through a hand-edited store or an entry written by an older shape of this
    // page — and an entry retried forever at the head would silently take every
    // answer behind it down with it. **That is the drop ADR 0039 property 5
    // exists to prevent**, so it leaves the stream and is shown instead.
    // Anything else (a 404 from a half-finished deploy, a 500, no network at
    // all) may work on the next attempt and is held.
    return status === 400 ? 'refused' : 'held'
  }
}

/**
 * The replay — ⚠️ **in order, append-only, never merged** (ADR 0007, ADR 0039
 * property 3). It stops at the first entry the network would not take and leaves
 * it, and everything behind it, exactly where it is.
 */
async function flush(): Promise<void> {
  while (!sessionExpired.value) {
    const entry = head(outbox.value)

    if (!entry)
      return

    const landing = await send(entry)

    if (landing === 'held')
      return

    // ⚠️ **A refused entry leaves the stream and is kept**, because nothing
    // about it is retryable and everything about it is worth saying (`03` §8.2).
    if (landing === 'refused')
      holdRefused([...refused.value, entry])

    holdOutbox(settle(outbox.value, entry.seq))
  }
}

/** `09` §4.7 steps 2 and 3 — resume the run, or compose one. */
async function start(requested?: number) {
  if (!snapshot.value)
    status.value = 'loading'

  try {
    const response = await $fetch<SessionResponse>('/api/review/session', {
      method: 'POST',
      body: requested === undefined ? {} : { size: requested },
    })

    install(response)
    status.value = 'ready'
  }
  catch {
    // ⚠️ **A held snapshot survives a failed start** (`S8`, ADR 0014). The run
    // is in the store and every answer goes to the stream, so a reader who
    // reloads underground carries on where they were; the error screen is for a
    // reader who has nothing.
    if (!snapshot.value)
      status.value = 'error'
  }
}

/**
 * The server's answer installed over the held run.
 *
 * ⚠️ **The same *session* is merged and a different one replaces.** A merge is
 * what keeps the words the reader was handed (PRD §5); a replace is the only
 * thing a run the server has never heard of can be, and it takes the refusals
 * with it because they were about the run that just ended.
 */
function install(response: SessionResponse) {
  const held = snapshot.value
  const fresh = response.session

  if (fresh && held && fresh.sessionId === held.sessionId) {
    apply(fresh)
    size.value = fresh.size
    nothing.value = response.empty
    return
  }

  answers.value = new Map()
  face.value = 'front'
  holdSnapshot(fresh)
  holdRefused([])
  nothing.value = response.empty

  if (fresh)
    size.value = fresh.size
}

// -- The four grades, and the flag ------------------------------------------

function give(grade: Grade) {
  const position = current.value
  const session = snapshot.value
  if (!position || !session)
    return

  // ⚠️ **Stamped here, at the keystroke** (ADR 0007, `03` §8.1). FSRS schedules
  // on elapsed time, so a *card* answered at 09:00 underground and flushed at
  // 18:00 would otherwise tell the scheduler that recall took nine hours — and
  // every interval derived from it is wrong six months later.
  const reviewedAt = new Date().toISOString()

  justGraded.value = grade
  answer(
    { kind: 'grade', sessionId: session.sessionId, cardId: position.cardId, grade, reviewedAt },
    grade,
  )
}

/**
 * `S9`'s `X` — ⚠️ **it advances without a *grade*** (`09` §4.9, `04` §7.8), and
 * *Review* history is left untouched. Catching a bad *card* costs the *card* and
 * not the record.
 */
function flag() {
  const position = current.value
  const session = snapshot.value
  if (!position || !session)
    return

  justGraded.value = null
  answer({ kind: 'flag', sessionId: session.sessionId, cardId: position.cardId }, 'flagged')
}

/**
 * ⚠️ **The durable write comes before the acknowledgement** (ADR 0039 property
 * 1): the entry is in `localStorage` before the screen has painted the next
 * *card*, and the request is what happens afterwards.
 */
function answer(draft: OutboxDraft, given: Answer) {
  holdOutbox(append(outbox.value, draft))
  answers.value = new Map(answers.value).set(draft.cardId, given)
  face.value = 'front'

  void enqueue(flush)
}

// -- The keyboard -----------------------------------------------------------

function onKeydown(event: KeyboardEvent) {
  if (ended.value || !current.value) {
    const action = endScreenAction(event)
    if (!action)
      return

    event.preventDefault()

    if (action === 'leave')
      void leave()
    else if (ended.value || nothing.value)
      void enqueue(() => start(size.value))

    return
  }

  const action = reviewAction(event, face.value)
  if (!action)
    return

  event.preventDefault()

  if (action.kind === 'reveal')
    face.value = 'back'
  else if (action.kind === 'grade')
    give(action.grade)
  else if (action.kind === 'flag')
    flag()
  else
    void leave()
}

async function leave() {
  // ADR 0032 blesses this spelling alongside `<NuxtLink … external>`: both do a
  // real document load, which is what strips the *mode*'s JavaScript.
  //
  // ⚠️ **Nothing is ended on the way out.** Leaving *Review* mid-*session* is a
  // pause — `10` §5.3 and `09` §4.7 both say the run resumes — and
  // `review_session.completed_at` is stamped by the answer that empties it.
  // *Vet*'s Done is the opposite case only because a *rejection*'s reversibility
  // hangs on its run ending (ADR 0033); nothing here does.
  await navigateTo(origin.value, { external: true })
}

// -- Lifecycle --------------------------------------------------------------

watch(() => current.value?.cardId, () => {
  justGraded.value = null
})

/**
 * ⚠️ **The one listener on `window`, and it is not a keystroke.** ADR 0025 binds
 * the key handlers to the mode container because ADR 0023's map is all printable
 * characters and SC 2.1.4 Character Key Shortcuts is Level A — a criterion about
 * **keyboard shortcuts**, which this is not. `online` is the signal in
 * ADR 0039's sense: it shortens the latency of a replay the store would have
 * performed on the next load anyway, and removing it entirely changes when the
 * stream drains and never whether it does.
 */
function onOnline() {
  void enqueue(flush)
}

onMounted(async () => {
  restore()

  const threshold = setTimeout(() => (slow.value = true), LOADING_THRESHOLD)
  window.addEventListener('online', onOnline)

  // ⚠️ **The replay goes first.** A run resumed before its own owed answers had
  // landed would be answered by the server about a *session* it thinks is two
  // *grades* behind, and the rail would fill twice.
  await enqueue(flush)
  await enqueue(() => start())
  clearTimeout(threshold)
  focusContainer()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline)
})
</script>

<template>
  <div class="mode">
    <!--
      ⚠️ `10` §5.2: **a three-column grid — a left spacer, the rail, the Done
      cluster.** The spacer is exactly the cluster's width, so the rail stays
      optically centred, which it must be, because it is the header of a screen
      whose 760px *card* is centred beneath it. 64px, and **no rule**.
    -->
    <header class="chrome">
      <span class="cluster-width" aria-hidden="true" />

      <ProgressRail
        v-if="snapshot"
        :ticks="ticks"
        :complete="ended"
        :position="railPosition"
      />
      <span v-else />

      <NuxtLink :to="origin" external class="done">
        <!-- ⚠️ `10` §10.2: **the Done cluster drops its cap on the phone.** A
             phone has no `Esc` — which is the entire reason ADR 0026 gave every
             *mode* a visible Done — so a cap reading `Esc` would name a key that
             does not exist. The label alone is the control. -->
        <KeyCap cap="Esc" label="Done" class="desktop-only" />
        <span class="done-phone phone-only">Done</span>
      </NuxtLink>
    </header>

    <!--
      ⚠️ **The mode container.** Key handlers bind here and focus lives here —
      never on `document` or `window` (ADR 0025, `10` §4.1, `11` §6.2). The Done
      control above is deliberately **outside** it.
    -->
    <div ref="container" class="container" tabindex="-1" @keydown="onKeydown">
      <div class="column">
        <!-- `10` §5.9: the frame paints immediately and the statement waits
             500ms, because a statement that flashes for 120ms is worse than
             120ms of quiet ground. The rail cannot paint before this at all —
             it does not know its own length until `review_session.size` exists. -->
        <EmptyBlock v-if="status === 'loading'" v-show="slow">
          <template #statement>
            Composing a session.
          </template>
          <template #body>
            &nbsp;
          </template>
        </EmptyBlock>

        <EmptyBlock v-else-if="status === 'error'">
          <template #statement>
            The session could not be started.
          </template>
          <template #body>
            Nothing has been lost. Leave and come back.
          </template>
        </EmptyBlock>

        <!-- `10` §5.6 — the end screen. ⚠️ **It shows the run's numbers and
             never starts the next one** (`S7`): `space` is the reader's own
             deliberate act, and it is safe here because the key before it was a
             digit (`09` §4.7). -->
        <div v-else-if="ended" class="end">
          <SessionTally :columns="tally" />

          <!-- ⚠️ `10` §5.6's second block, and `09` §4.8 requires it: a flush
               that answers 401 is not a network error, and a *grade* that did
               not land is surfaced rather than dropped. **It is not styled as an
               alert** — there is no alert in this system — it is a sentence with
               a rule above it. -->
          <p v-if="unsent > 0 || refused.length > 0" class="unsent">
            <template v-if="unsent > 0">
              {{ unsent }} {{ unsent === 1 ? 'answer has' : 'answers have' }} not reached the database yet. They are saved here and will be sent when the connection returns.
              <NuxtLink v-if="sessionExpired" to="/auth" external class="sign-in">Sign in again</NuxtLink>
            </template>

            <!-- ⚠️ A refusal, surfaced rather than dropped (ADR 0039 property
                 5). It names the clock because the clock is both the common
                 cause (`03` §8.2) and the one the reader can fix — and it says
                 *usually*, because a body the server cannot read is refused the
                 same way and for good. It is a second sentence rather than a
                 second block: both are the same notice, which is *what happened
                 to the answers you gave*. -->
            <template v-if="refused.length > 0">
              {{ refused.length }} {{ refused.length === 1 ? 'answer was' : 'answers were' }} refused and will not be sent again — usually a clock that disagrees with the server's.
            </template>
          </p>

          <SessionSizeKnob v-model="size" class="knob" />

          <button type="button" class="primary" @click="enqueue(() => start(size))">
            <span class="hint">space</span>
            <span class="primary-label">Start another session</span>
          </button>
        </div>

        <!-- `10` §5.7's two non-terminal empty states. The difference between
             them is the difference between going to *Vet* and coming back
             tomorrow, and only one of them is a dead end. -->
        <EmptyBlock v-else-if="nothing && !nothing.hasCards">
          <template #statement>
            Nothing to review.
          </template>
          <template #body>
            A <i>card</i> is minted when a <i>note</i> is accepted, so the way to a first one is through <i>Vet</i>.
          </template>

          <SessionSizeKnob v-model="size" />
        </EmptyBlock>

        <EmptyBlock v-else-if="nothing">
          <template #statement>
            Nothing due.
          </template>
          <template #body>
            There is no ahead-of-schedule study.
          </template>

          <p v-if="nextDue" class="datum">
            {{ nextDue }}
          </p>

          <SessionSizeKnob v-model="size" class="knob" />
        </EmptyBlock>

        <ReviewCard
          v-else-if="current"
          :fields="current.fields"
          :declaration="jlptVocab"
          :template-key="current.templateKey"
          :face="face"
        />
      </div>
    </div>

    <!--
      `10` §5.1's 104px footer, **no rule**: the key legend on the front, the
      four *grade* controls on the back. `Esc` is not repeated in either, because
      the Done cluster in the header names it (§5.2).
    -->
    <footer class="legend">
      <div v-if="current" class="column legend-column">
        <!-- `10` §5.1: the front's legend is `space` — reveal beside `X` — flag,
             and the back is the four *grade* controls with the `X` line alone
             `12px` beneath them. ⚠️ **`X` is on both faces** because a *card*
             can be wrong in a way the *term* alone already shows, and a reader
             who had to reveal first would be answering it to report it. -->
        <div v-if="face === 'front'" class="legend-row">
          <KeyCap cap="space" label="reveal" variant="primary" />
          <KeyCap cap="X" label="flag" variant="aside" class="flag-cap" />
        </div>

        <template v-else>
          <GradeControls
            :selected="justGraded"
            @grade="give"
          />

          <div class="legend-row flag-row">
            <KeyCap cap="X" label="flag" variant="aside" />
          </div>
        </template>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* `05` §5: every screen is a fixed-height column — chrome, a growing middle,
   chrome. `10` §5.1: header 64px and footer 104px, **neither with a rule**. */
.mode {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--k-ground);
}

.chrome {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  flex: 0 0 64px;
  padding: 0 var(--k-gutter);
}

/* ⚠️ The left spacer is the Done cluster's width and nothing else — it is what
   keeps the rail optically centred under a cluster that only exists on one side
   (`10` §5.2). */
.cluster-width {
  width: 90px;
}

.done {
  justify-self: end;
  text-decoration: none;
}

.done-phone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* `10` §10.2: 14px `--k-ink`, in a 44 × 44 hit area. */
  min-width: 44px;
  min-height: 44px;
  font-size: 14px;
  color: var(--k-ink);
}

.container {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 0 var(--k-gutter);
  outline: none;
}

.column {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: var(--k-measure-object);
}

/* `10` §5.6: the end screen's column is 620px — `05` §5's session-end measure. */
.end {
  width: 100%;
  max-width: var(--k-measure-told);
}

/* `10` §5.6: `32px` down, and a rule above it. */
.unsent {
  margin: var(--k-space-7) 0 0;
  padding-top: var(--k-space-7);
  border-top: 1px solid var(--k-rule);
  font-size: 15px;
  color: var(--k-ink);
}

.sign-in {
  color: var(--k-accent);
}

.knob {
  margin-top: var(--k-space-7);
}

/* `05` §4's "single datum given weight" slot — `10` §5.7's next-due instant. */
.datum {
  margin: 0;
  font-size: 24px;
  color: var(--k-ink);
}

/* `05` §7's standalone primary control: inline rather than full width,
   `13px 24px`, `14px` gap, label at 17px. */
.primary {
  display: inline-flex;
  align-items: center;
  gap: var(--k-space-4);
  margin-top: var(--k-space-7);
  padding: 13px 24px;
  background: var(--k-ink-ground);
  border: 1px solid var(--k-ink-ground);
  border-radius: var(--k-radius-control);
  cursor: pointer;
}

.hint {
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-on-ink-quiet);
}

.primary-label {
  font-family: var(--k-face-en);
  font-size: 17px;
  color: var(--k-ground);
}

.legend {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 0 0 104px;
  padding: 0 var(--k-gutter);
}

.legend-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.legend-row {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* `10` §5.1: on the front the two caps share the row. `05` §7's legend spacing
   between separate clusters. */
.flag-cap {
  margin-left: var(--k-space-6);
}

/* `10` §5.1: `12px` under the four controls, and the `X` line stands alone. */
.flag-row {
  margin-top: var(--k-space-3);
}

.phone-only {
  display: none;
}

/* ⚠️ ADR 0026: ***Review* is the one screen that gets a phone layout**, because
   it is the one screen with dead time. `10` §10.2's table is the rest of it, and
   the *card*'s half lives in `ReviewCard.vue`. */
@media (width < 720px) {
  .chrome {
    flex-basis: 56px;
  }

  .cluster-width {
    width: 0;
  }

  .legend {
    flex-basis: 72px;
  }

  .desktop-only {
    display: none;
  }

  .phone-only {
    display: inline-flex;
  }
}
</style>
