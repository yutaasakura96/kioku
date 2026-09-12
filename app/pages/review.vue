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
// A bare `<NuxtLink>` renders the *place* into the page that is already running
// and hands the reader a `noScripts` screen with a live Vue application on it,
// with no error anywhere.
//
// ⚠️ **The interface never waits on a flush** (`S8`, ADR 0007). A *grade* is
// stamped at the keystroke, painted at once, and sent behind the reader; the
// next *card* renders from the snapshot this screen already holds. **#13 puts an
// outbox in front of that** — until then a request that fails is a *grade* that
// is gone, and the end screen says so rather than swallowing it.
//
// ⚠️ **`X` — the `S9` flag — is not here**, and neither is its legend line from
// `10` §5.1. It writes four rows in one transaction and rides the same outbox as
// a *grade*, which is #13's; a legend naming a key that does nothing is worse
// than no legend. `10` §5.3's flagged tick exists in `ProgressRail` and nothing
// produces one yet.

import { GRADE_KEYS, endScreenAction, reviewAction } from '#shared/review/keystroke'
import { DEFAULT_SESSION_SIZE } from '#shared/review/compose'
import { jlptVocab } from '#shared/subject/declaration'
import { mergeGrades } from '#shared/review/snapshot'
import { nextDueLabel } from '#shared/review/next-due'
import { resolveOrigin } from '#shared/utils/origin'
import type { Grade } from '#shared/review/scheduler'
import type { NothingToStudy, ReviewSnapshot } from '#shared/review/snapshot'
import type { Tick } from '../components/ProgressRail.vue'

const route = useRoute()
const origin = computed(() => resolveOrigin(route.query.from))

/** `10` §5.9: below this a statement flashing is worse than quiet ground. */
const LOADING_THRESHOLD = 500

interface SessionResponse {
  session: ReviewSnapshot | null
  empty: NothingToStudy | null
}

interface GradeResponse {
  outcome: 'ok' | 'not_in_session' | 'already_graded'
  session: ReviewSnapshot | null
}

const snapshot = ref<ReviewSnapshot | null>(null)
const nothing = ref<NothingToStudy | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const slow = ref(false)
const face = ref<'front' | 'back'>('front')
const size = ref(DEFAULT_SESSION_SIZE)

/**
 * *Grades* given but not yet reflected in a snapshot the server has answered
 * with.
 *
 * ⚠️ **This is the whole of the client's optimism**, and it is what `S8` buys:
 * the next *card* paints on the keystroke rather than on the response. It is
 * pruned against every answer, so a position counts exactly once whether the
 * request has landed or not.
 */
const given = ref(new Map<string, Grade>())

/** ⚠️ `09` §4.8 — surfaced on the end screen, never dropped silently. */
const unsent = ref(0)
const sessionExpired = ref(false)

/** `10` §5.5: visible for as long as it takes the next *card* to render. */
const justGraded = ref<Grade | null>(null)

const positions = computed(() =>
  (snapshot.value?.positions ?? []).map(position => ({
    ...position,
    grade: position.grade ?? given.value.get(position.cardId) ?? null,
  })),
)

const currentIndex = computed(() => positions.value.findIndex(position => position.grade === null))
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

    return index === currentIndex.value ? 'current' : 'empty'
  }),
)

/**
 * ⚠️ **The end screen's four figures are the four *grades***
 * ([ADR 0053](../../docs/adr/0053-the-end-screens-four-figures-are-the-four-grades.md)).
 * `10` §5.6 asks for "the *session*'s numbers" in `05` §7's four equal columns
 * and never says which four; the distribution is the only set of four the run
 * actually produced, and it is the one that answers *how did that go*.
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

// -- Requests ---------------------------------------------------------------

/**
 * ⚠️ **One at a time, in the order they were given.** Two *grades* in flight at
 * once would apply their answers in whatever order they came back, and each
 * answer carries the whole snapshot — so the later one could rewind the rail
 * under the reader's hands. The **interface** does not wait on this; only the
 * requests queue behind each other.
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
 * ⚠️ **It moves the *grades* and never the words** (`shared/review/snapshot.ts`,
 * PRD §5). Installing the answer wholesale would re-read `note.fields` mid-run
 * — the whole *session* is prefetched as a unit precisely so that the text the
 * reader started with is the text they finish with.
 */
function apply(fresh: ReviewSnapshot) {
  const held = snapshot.value
  if (!held)
    return

  snapshot.value = mergeGrades(held, fresh)
  nothing.value = null

  const confirmed = new Set(
    fresh.positions.filter(position => position.grade !== null).map(position => position.cardId),
  )

  given.value = new Map([...given.value].filter(([cardId]) => !confirmed.has(cardId)))
}

/** `09` §4.7 steps 2 and 3 — resume the run, or compose one. */
async function start(requested?: number) {
  status.value = 'loading'

  try {
    const response = await $fetch<SessionResponse>('/api/review/session', {
      method: 'POST',
      body: requested === undefined ? {} : { size: requested },
    })

    given.value = new Map()
    face.value = 'front'
    snapshot.value = response.session
    nothing.value = response.empty

    if (response.session)
      size.value = response.session.size

    status.value = 'ready'
  }
  catch {
    status.value = 'error'
  }
}

// -- The four grades --------------------------------------------------------

function give(grade: Grade) {
  const position = current.value
  const session = snapshot.value
  if (!position || !session)
    return

  // ⚠️ **Stamped here, at the keystroke** (ADR 0007, `03` §8.1). FSRS schedules
  // on elapsed time, so a *card* answered at 09:00 underground and flushed at
  // 18:00 would otherwise tell the scheduler that recall took nine hours — and
  // every interval derived from it is wrong six months later.
  const reviewedAt = new Date()

  justGraded.value = grade
  given.value = new Map(given.value).set(position.cardId, grade)
  face.value = 'front'

  void enqueue(async () => {
    try {
      const response = await $fetch<GradeResponse>('/api/review/grade', {
        method: 'POST',
        body: {
          sessionId: session.sessionId,
          cardId: position.cardId,
          grade,
          reviewedAt: reviewedAt.toISOString(),
        },
      })

      if (response.session)
        apply(response.session)
    }
    catch (error) {
      // ⚠️ **A flush that answers 401 is not a network error** (`08` §5.6,
      // `09` §4.8). The session expired mid-run, so it must not be retried on
      // the same backoff forever: the end screen reports it and offers the door.
      if ((error as { statusCode?: number }).statusCode === 401)
        sessionExpired.value = true

      unsent.value += 1
    }
  })
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
  else
    void leave()
}

async function leave() {
  // ADR 0032 blesses this spelling alongside `<NuxtLink … external>`: both do a
  // real document load, which is what strips the *mode*'s JavaScript.
  //
  // ⚠️ **Nothing is ended on the way out.** Leaving *Review* mid-*session* is a
  // pause — `10` §5.3 and `09` §4.7 both say the run resumes — and
  // `review_session.completed_at` is stamped by the *grade* that empties it.
  // *Vet*'s Done is the opposite case only because a *rejection*'s reversibility
  // hangs on its run ending (ADR 0033); nothing here does.
  await navigateTo(origin.value, { external: true })
}

// -- Lifecycle --------------------------------------------------------------

watch(() => current.value?.cardId, () => {
  justGraded.value = null
})

onMounted(async () => {
  const threshold = setTimeout(() => (slow.value = true), LOADING_THRESHOLD)

  await enqueue(() => start())
  clearTimeout(threshold)
  focusContainer()
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
          <p v-if="unsent > 0" class="unsent">
            {{ unsent }} {{ unsent === 1 ? 'grade' : 'grades' }} did not reach the database.
            <NuxtLink v-if="sessionExpired" to="/auth" external class="sign-in">Sign in again</NuxtLink>
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
      <div class="column legend-row">
        <template v-if="current && face === 'front'">
          <KeyCap cap="space" label="reveal" variant="primary" />
        </template>

        <GradeControls
          v-else-if="current"
          :selected="justGraded"
          @grade="give"
        />
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

.legend-row {
  display: flex;
  align-items: center;
  justify-content: center;
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
