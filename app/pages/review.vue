<script setup lang="ts">
// *Review* — a *mode* (ADR 0013). `routeRules: { ssr: false }`, no navigation,
// and since ADR 0076 the quiz the prototype shows: a lesson teaches new words,
// the quiz asks the meaning and then the reading, a miss is asked again before
// the run ends, and the summary says where each word went.
//
// ⚠️ **Six screens, one at a time** (`view`): loading, error, what is waiting,
// a lesson's teaching, the quiz, and the summary. The header is the
// prototype's bar on every one of them (`ModeBar.vue`).
//
// ⚠️ **The key handlers bind to the mode container, never to `document` or
// `window`** (ADR 0025, `10` §4.1). `X` is a printable character, so **SC 2.1.4
// Character Key Shortcuts (Level A)** applies and this application conforms
// only through that criterion's "active only on focus" exception.
//
// ⚠️ **Every way out performs an external document navigation** (`09` §5.2,
// ADR 0032). A bare `<NuxtLink>` client-renders the *place* into the page that
// is already running and hands the reader a `noScripts` screen with a live Vue
// application on it, with no error anywhere.
//
// ⚠️ **The interface never waits on a flush** (`S8`, ADR 0007). An answer is
// checked here, the question queue is written to the store, and — when it was
// the last answer the word owed — the *grade* is stamped at that keystroke,
// appended to the outbox, painted at once, and sent behind the reader.
//
// ⚠️ **The database never sees a question** (ADR 0076 §4). It holds positions
// and *grades*; which question is next and which words were missed is
// `shared/review/quiz.ts`'s, kept in `localStorage` beside the snapshot.
//
// ⚠️ **The outbox carries three kinds of entry** (`03` §8.1, ADR 0039): a
// *grade*, `S9`'s `X`, and *Finish early* (ADR 0076 §6). The storage helper is
// an **explicit import** because Nuxt has a built-in of that name
// (`app/utils/review-store.ts`).

import { fieldAction, isHeldActivation, restingAction, reviewAction } from '#shared/review/keystroke'
import { foldReading, meaningEntry, meaningResult, otherMeanings, readingEntry, readingResult } from '#shared/review/answer'
import { DEFAULT_SESSION_SIZE } from '#shared/review/compose'
import { brakeSentence } from '#shared/review/brake'
import { startLines } from '#shared/review/offer'
import type { StudyOffer } from '#shared/review/offer'
import { append, head, parseOutbox, settle, unsentAnswers } from '#shared/review/outbox'
import { answerQuestion, currentQuestion, dropWord, finishEarly, parseQuiz, reconcile, startQuestions, teach } from '#shared/review/quiz'
import type { Question, QuizState } from '#shared/review/quiz'
import { isRefused } from '#shared/review/request'
import { isAnswered, mergeGrades, parseSnapshot } from '#shared/review/snapshot'
import { resolveOrigin } from '#shared/utils/origin'
import type { Grade } from '#shared/review/scheduler'
import type { ReviewPosition, ReviewSnapshot, SessionKind } from '#shared/review/snapshot'
import type { Answer, OutboxDraft, OutboxEntry } from '#shared/review/outbox'
import type { AnswerOutcome } from '#shared/review/request'
import type { QuizFeedback } from '../components/QuizCard.vue'
// ⚠️ **The explicit import `03` §8.1 asks for.** `app/utils/` is auto-imported,
// so the names below are ambiently available too — and a `useStorage`-shaped
// call that resolved to Nitro's built-in of that name is the failure
// verification §5.5 recorded. Naming the file at the call site is what makes it
// unambiguous which store this is.
import { OUTBOX_KEY, QUIZ_KEY, REFUSED_KEY, SNAPSHOT_KEY, clearStored, readStored, writeStored } from '../utils/review-store'

const route = useRoute()
const router = useRouter()
const origin = computed(() => resolveOrigin(route.query.from))

/**
 * What the way out is called. `/` is Home, the dashboard, since #71
 * (ADR 0078); it was Ingest until then and the summary called it Home anyway.
 */
const PLACE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/categories': 'Categories',
  '/more': 'More',
  '/add': 'Add words',
  '/sources': 'Sources',
  '/stats': 'Stats',
  '/settings': 'Settings',
}
const home = computed(() => ({ to: origin.value, name: PLACE_NAMES[origin.value] ?? 'Home' }))

/** `10` §5.9: below this a statement flashing is worse than quiet ground. */
const LOADING_THRESHOLD = 500

interface SessionResponse {
  session: ReviewSnapshot | null
  offer: StudyOffer
}

/**
 * The three answer endpoints answer the same shape — one stream, three entry
 * types.
 *
 * ⚠️ **`AnswerOutcome` is imported rather than restated.** A value written
 * into only one of the places it lives is `04` §13's drift argument at five
 * string literals, and the drift would show as an outcome this screen silently
 * treats as a success.
 */
interface AnswerResponse {
  outcome: AnswerOutcome
  session: ReviewSnapshot | null
  /** Fresh once the run is over, and `null` until then (ADR 0076 §8). */
  offer: StudyOffer | null
}

const snapshot = ref<ReviewSnapshot | null>(null)

/**
 * ADR 0076 §8 — what is waiting: reviews, a lesson, and which brake is on.
 *
 * ⚠️ **Not persisted.** It is a fact about the database rather than about the
 * run, so a reload asks again; a sentence read back out of `localStorage` a day
 * later would name yesterday's allowance.
 */
const offer = ref<StudyOffer | null>(null)

const status = ref<'loading' | 'ready' | 'error'>('loading')
const slow = ref(false)
const size = ref(DEFAULT_SESSION_SIZE)

/**
 * ADR 0076 §4 — the questions still owed and the words missed. ⚠️ **Durable**:
 * a reload that lost it would forgive every miss in the run.
 */
const quiz = ref<QuizState | null>(null)

/**
 * The answer on screen, until the reader moves on. ⚠️ **Not persisted**: the
 * queue and the *grade* it produced already are, so a reload mid-result opens
 * on the next question and has lost nothing but the sentence.
 */
const feedback = ref<(QuizFeedback & { question: Question }) | null>(null)

/** Why the last entry was not taken as an answer (ADR 0076 §5). Nothing was counted. */
const problem = ref<string | null>(null)
const refusals = ref(0)
const clearings = ref(0)

/**
 * ADR 0069 §5, #30 — whether this question has spent its one retry.
 * ⚠️ **One per asking**: a second kanji reading is checked as the check says,
 * or a reader could walk the kanji's readings until one passed.
 */
const readingRetried = ref(false)

/** How many questions have been put to the reader — the quiz card's key. */
const askings = ref(0)

/**
 * Answers given but not yet reflected in a snapshot the server has answered
 * with — a *grade*, or `S9`'s flag.
 *
 * ⚠️ **This is the whole of the client's optimism**, and it is what `S8` buys:
 * the next question paints on the keystroke rather than on the response. It is
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

/**
 * ⚠️ `09` §4.8 — surfaced on the summary, and it is a count of **answers**: a
 * *Finish early* still in the stream is not something the reader gave about a
 * word.
 */
const unsent = computed(() => outbox.value.filter(entry => entry.kind !== 'finish').length)
const sessionExpired = ref(false)

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

const kind = computed<SessionKind>(() => snapshot.value?.kind ?? 'review')
const done = computed(() => positions.value.filter(isAnswered).length)

/** The question on screen: the one just answered while its result shows, else the next owed. */
const question = computed(() => feedback.value?.question ?? (quiz.value ? currentQuestion(quiz.value) : null))
const asking = computed(() => positions.value.find(position => position.cardId === question.value?.cardId) ?? null)

/**
 * Which of the six screens is up.
 *
 * ⚠️ **A result on screen keeps the quiz up**, even when the answer it shows
 * was the last one the run owed: the reader reads *Correct* before the summary
 * replaces it.
 */
const view = computed(() => {
  if (status.value !== 'ready')
    return status.value

  if (!snapshot.value || !quiz.value)
    return 'start'

  if (feedback.value)
    return 'quiz'

  if (quiz.value.finished || !question.value)
    return 'summary'

  return quiz.value.teaching !== null ? 'teach' : 'quiz'
})

const teachingIndex = computed(() => quiz.value?.teaching ?? 0)
const teaching = computed(() => positions.value[teachingIndex.value] ?? null)
const lastTaught = computed(() => teachingIndex.value >= positions.value.length - 1)

const lines = computed(() => (offer.value ? startLines(offer.value) : null))
const brakeLine = computed(() => (offer.value ? brakeSentence(offer.value, offer.value.limits) : null))

const quizFoot = computed(() => {
  if (feedback.value && !feedback.value.right)
    return 'This one comes back before the session ends.'

  return kind.value === 'lesson'
    ? 'Meaning first, then reading, for each new word.'
    : 'Meaning first, then reading. A missed word comes back before the session ends.'
})

// -- Focus ------------------------------------------------------------------

const container = useTemplateRef<HTMLElement>('container')
const primary = useTemplateRef<HTMLButtonElement>('primary')

/**
 * ⚠️ **Focus lives inside the mode container on every screen**, which is what
 * makes `Esc` work from it (ADR 0025). The quiz card takes its own — the field,
 * then *Next* — and a lesson's primary control takes it so `Enter` moves on.
 */
async function focusView() {
  await nextTick()

  if (view.value === 'quiz')
    return

  if (view.value === 'teach' && primary.value)
    primary.value.focus({ preventScroll: true })
  else
    container.value?.focus({ preventScroll: true })
}

// -- The store (ADR 0014) ---------------------------------------------------

function holdSnapshot(next: ReviewSnapshot | null) {
  snapshot.value = next

  if (next)
    writeStored(SNAPSHOT_KEY, next)
  else
    clearStored(SNAPSHOT_KEY)
}

function holdQuiz(next: QuizState | null) {
  quiz.value = next

  if (next)
    writeStored(QUIZ_KEY, next)
  else
    clearStored(QUIZ_KEY)
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

/** A position the reader owes nothing more about — the server's word or the stream's. */
function answeredHere(position: ReviewPosition): boolean {
  return isAnswered(position) || answers.value.has(position.cardId)
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
  if (held.kind === 'review')
    size.value = held.size
  // ⚠️ **The stream re-answers the run.** The optimistic map is client memory
  // and the reload just lost it; without this the reader is asked a word they
  // have already finished and PRD §5's *the same card graded twice* stops being
  // an edge case about two devices and becomes what a refresh does.
  answers.value = unsentAnswers(stream, held.sessionId)
  // ⚠️ **And the queue comes back with its misses** (ADR 0076 §4). `reconcile`
  // makes it agree with the run: a word the stream answers owes nothing, and a
  // word that is owed and has no question left gets its questions back.
  quiz.value = reconcile(parseQuiz(readStored(QUIZ_KEY)), held, answeredHere)
  status.value = 'ready'
}

// -- Requests ---------------------------------------------------------------

/**
 * ⚠️ **One at a time, in the order they were given.** Two answers in flight at
 * once would apply their snapshots in whatever order they came back, and each
 * answer carries the whole run — so the later one could rewind the track under
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
  if (!held || fresh.sessionId !== held.sessionId)
    return

  const merged = mergeGrades(held, fresh)
  holdSnapshot(merged)

  const confirmed = new Set(
    fresh.positions.filter(isAnswered).map(position => position.cardId),
  )

  answers.value = new Map([...answers.value].filter(([cardId]) => !confirmed.has(cardId)))

  // A word the server says is answered — in another tab, say — owes no question.
  if (quiz.value)
    holdQuiz(reconcile(quiz.value, merged, answeredHere))
}

type Landing = 'landed' | 'refused' | 'held'

/**
 * One entry, at the head of the stream.
 *
 * ⚠️ **Three outcomes, and `held` is the only one that keeps the entry.**
 * `not_in_session` and `already_graded` are `200`s about an answer the durable
 * record has already decided; retrying either forever would be the client's
 * memory arguing with the database.
 */
async function send(entry: OutboxEntry): Promise<Landing> {
  try {
    const response = await $fetch<AnswerResponse>(`/api/review/${entry.kind}`, {
      method: 'POST',
      body: bodyOf(entry),
    })

    if (response.session)
      apply(response.session)

    // ⚠️ Only for the run on screen: a replay of yesterday's stream must not
    // put yesterday's run's *What next* under today's.
    if (response.offer && entry.sessionId === snapshot.value?.sessionId)
      offer.value = response.offer

    return isRefused(response.outcome) ? 'refused' : 'landed'
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode

    // ⚠️ **A flush that answers 401 is not a network error** (`08` §5.6,
    // `09` §4.8). The *session* expired mid-run, so it must not be retried on
    // the same backoff forever: the replay stops, the summary reports it and
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
 * What each entry type's endpoint reads — `shared/review/request.ts`.
 *
 * ⚠️ **No answer says which words come next.** The offer that comes back with
 * the answer that ends a run is counted in the reader's active *category*,
 * which the server reads (ADR 0077 §1). Until #69 every answer carried the
 * page's filter for that count.
 */
function bodyOf(entry: OutboxEntry) {
  switch (entry.kind) {
    case 'grade':
      return { sessionId: entry.sessionId, cardId: entry.cardId, grade: entry.grade, reviewedAt: entry.reviewedAt }
    case 'flag':
      return { sessionId: entry.sessionId, cardId: entry.cardId }
    case 'finish':
      return { sessionId: entry.sessionId }
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
    // about it is retryable and everything about it is worth saying
    // (`03` §8.2). ⚠️ **A *Finish early* is not kept**: it is not an answer,
    // and the run it could not end is resumed or completed by the next start.
    if (landing === 'refused' && entry.kind !== 'finish')
      holdRefused([...refused.value, entry])

    holdOutbox(settle(outbox.value, entry.seq))
  }
}

/**
 * `09` §4.7 — resume the run, start the one asked for, or ask what is waiting.
 *
 * ⚠️ **`begin` is the reader's own act and nothing else sets it**: a control
 * on this screen, or the start block's link (`?start=`). With none, the server
 * resumes a live run or composes nothing (ADR 0076 §8).
 */
async function start(begin: SessionKind | null = null) {
  const held = snapshot.value !== null

  if (!held)
    status.value = 'loading'

  try {
    // ⚠️ **The zone rides every request, the mount's included** (ADR 0066 §4):
    // the day's allowance is counted in it, and it is the only way `/stats`,
    // which ships no JavaScript, ever learns where the reader is.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const response = await $fetch<SessionResponse>('/api/review/session', {
      method: 'POST',
      body: { size: size.value, zone, ...(begin ? { start: begin } : {}) },
    })

    install(response)
    status.value = 'ready'
  }
  catch {
    // ⚠️ **A held snapshot survives a failed start** (`S8`, ADR 0014). The run
    // is in the store and every answer goes to the stream, so a reader who
    // reloads underground carries on where they were; the error screen is for a
    // reader who has nothing.
    if (!held)
      status.value = 'error'
  }
}

/**
 * The server's answer installed over the held run.
 *
 * ⚠️ **The same *session* is merged and a different one replaces.** A merge is
 * what keeps the words the reader was handed (PRD §5); a replace is the only
 * thing a run the server has never heard of can be, and it takes the refusals
 * and the question queue with it because they were about the run that ended.
 */
function install(response: SessionResponse) {
  const held = snapshot.value
  const fresh = response.session

  // ⚠️ **An offer read with a live run is not kept**: it was counted before
  // the run was answered, and the summary draws only the one that comes back
  // with the answer that ends it (`offerIfFinished`).
  offer.value = fresh ? null : response.offer

  if (fresh && held && fresh.sessionId === held.sessionId) {
    apply(fresh)
    return
  }

  answers.value = new Map()
  resetQuestion()
  holdSnapshot(fresh)
  holdRefused([])
  holdQuiz(fresh ? reconcile(null, fresh, isAnswered) : null)
}

// -- The lesson (ADR 0076 §1) ------------------------------------------------

function showWord(index: number) {
  if (quiz.value)
    holdQuiz(teach(quiz.value, Math.min(index, positions.value.length - 1)))
}

/** The teaching is over. ⚠️ It does not come back: the quiz is about what was just shown. */
function beginQuestions() {
  if (!quiz.value)
    return

  holdQuiz(startQuestions(quiz.value))
  resetQuestion()
}

// -- The quiz (ADR 0076 §3 to §5) --------------------------------------------

/** A new question is on screen: nothing typed, nothing refused, one retry in hand. */
function resetQuestion() {
  feedback.value = null
  problem.value = null
  readingRetried.value = false
  askings.value += 1
}

function refuse(why: string | null) {
  problem.value = why
  refusals.value += 1
}

/**
 * ADR 0069 §3 — the gloss, the list and the reader's synonyms.
 *
 * ⚠️ **`?? []` because a server answer is installed unparsed** (`start`), and a
 * tab open across a deploy that added a field would otherwise throw on the
 * first meaning it checked.
 */
function acceptedOf(position: ReviewPosition) {
  return {
    meaning: position.fields.meaning ?? '',
    meanings: position.meanings ?? [],
    synonyms: position.synonyms ?? [],
  }
}

/**
 * One answer, checked. ⚠️ **Three things can happen and only two are
 * answers**: an entry in the wrong script, an empty one, and the one
 * kanji-reading retry (ADR 0069 §5) are handed back to the field with a
 * sentence, and nothing is counted (ADR 0076 §5).
 */
function check(value: string) {
  const state = quiz.value
  const current = state ? currentQuestion(state) : null
  const position = positions.value.find(entry => entry.cardId === current?.cardId)
  if (!state || !current || !position || feedback.value)
    return

  let right: boolean
  let close = false
  let typed: string
  let also: string[] = []

  if (current.part === 'reading') {
    const entry = readingEntry(value)
    if (entry)
      return refuse(entry === 'empty' ? null : 'Type the reading in kana. Romaji such as "keiken" converts as you type.')

    // `?? []`: a position installed from a server answer is not parsed (§ Carrying).
    const result = readingResult(value, position.fields.reading ?? '', position.kanjiReadings ?? [])

    if (result === 'kanji' && !readingRetried.value) {
      readingRetried.value = true
      problem.value = 'That is a reading of the kanji, not of this word. Try once more.'
      clearings.value += 1
      return
    }

    typed = foldReading(value)
    right = result === 'right'
  }
  else {
    const entry = meaningEntry(value)
    if (entry)
      return refuse(entry === 'empty' ? null : 'Type the meaning in English.')

    const result = meaningResult(value, acceptedOf(position))

    typed = value.trim()
    right = result !== 'wrong'
    close = result === 'close'
    also = right && !close ? otherMeanings(value, position.fields.meaning ?? '') : []
  }

  // ⚠️ **The queue is durable before the result paints** (ADR 0039 property
  // 1): a reload on the result must not find the question unanswered and
  // forgive the miss it just recorded.
  const { state: next, completed } = answerQuestion(state, right)
  holdQuiz(next)

  problem.value = null
  feedback.value = { question: current, right, close, typed, also }

  if (completed)
    grade(completed.cardId, completed.grade)
}

/** *Next*: the result leaves and the head of the queue is asked. */
function advance() {
  if (!feedback.value)
    return

  resetQuestion()
}

/**
 * ADR 0076 §4 — the word's one *grade*, given by the answer that completed it.
 *
 * ⚠️ **Stamped here, at the keystroke** (ADR 0007, `03` §8.1). FSRS schedules
 * on elapsed time, so a word answered at 09:00 underground and flushed at
 * 18:00 would otherwise tell the scheduler that recall took nine hours — and
 * every interval derived from it is wrong six months later.
 */
function grade(cardId: string, given: Grade) {
  const session = snapshot.value
  if (!session)
    return

  answer(
    { kind: 'grade', sessionId: session.sessionId, cardId, grade: given, reviewedAt: new Date().toISOString() },
    given,
  )
}

/**
 * `S9`'s `X` — ⚠️ **it leaves the run without a *grade*** (`09` §4.9,
 * `04` §7.8), with every question the word still owed, and *Review* history is
 * left untouched. Catching a bad word costs the *card* and not the record.
 */
function flag() {
  const session = snapshot.value
  const state = quiz.value
  const target = question.value
  if (!session || !state || !target)
    return

  // A word the last answer completed is already graded: the flag still
  // suspends the *card*, and there is nothing left to take out of the queue.
  holdQuiz(dropWord(state, target.cardId))
  answer({ kind: 'flag', sessionId: session.sessionId, cardId: target.cardId }, 'flagged')
  resetQuestion()
}

/**
 * ⚠️ **The durable write comes before the acknowledgement** (ADR 0039 property
 * 1): the entry is in `localStorage` before the screen has painted the next
 * question, and the request is what happens afterwards.
 */
function answer(draft: Extract<OutboxDraft, { cardId: string }>, given: Answer) {
  holdOutbox(append(outbox.value, draft))

  // ⚠️ **A *grade* is never replaced by a flag in this map**: the word was
  // graded and then flagged, and the summary counts what the *grade* was.
  if (!(given === 'flagged' && typeof answers.value.get(draft.cardId) === 'number'))
    answers.value = new Map(answers.value).set(draft.cardId, given)

  void enqueue(flush)
}

/**
 * ADR 0076 §6 — *Finish early*. ⚠️ **Three writes, in this order, before
 * anything is sent**: a Forgot for each word missed and not yet got right (a
 * review run only), the `finish` entry behind them, and the queue emptied. The
 * stream's order is the order the server learns them in.
 */
function finish() {
  const session = snapshot.value
  const state = quiz.value
  if (!session || !state || state.finished)
    return

  // ⚠️ **Nothing is left to finish early** once the last answer's result is
  // up: the run ended by being answered, and this is *Next* by another key.
  if (!currentQuestion(state))
    return resetQuestion()

  const { state: next, forgot } = finishEarly(state, kind.value)
  const reviewedAt = new Date().toISOString()
  let stream = outbox.value
  const given = new Map(answers.value)

  for (const cardId of forgot) {
    stream = append(stream, { kind: 'grade', sessionId: session.sessionId, cardId, grade: 1, reviewedAt })
    given.set(cardId, 1)
  }

  holdOutbox(append(stream, { kind: 'finish', sessionId: session.sessionId }))
  answers.value = given
  holdQuiz(next)
  resetQuestion()

  void enqueue(flush)
}

// -- The keyboard -----------------------------------------------------------

function onKeydown(event: KeyboardEvent) {
  const fromField = event.target instanceof HTMLInputElement

  // ⚠️ **A held key is never an answer** (`shared/review/keystroke.ts`).
  // `Enter` on *Check* moves focus to *Next*, and the browser sends the
  // auto-repeat of the same held key to wherever focus now is — which would
  // skip a result the reader has not read. A held `space` in a field is typing.
  if (isHeldActivation(event) && !(fromField && event.key === ' ')) {
    event.preventDefault()
    return
  }

  // ⚠️ **`Enter` in the field checks only when the field's own map says so**
  // (ADR 0060 §7). The check itself is the form's submission; what is refused
  // here is the `Enter` a system IME uses to finish a conversion, which would
  // otherwise submit half a word.
  if (fromField && event.key === 'Enter' && fieldAction(event) !== 'check') {
    event.preventDefault()
    return
  }

  if (view.value !== 'quiz') {
    if (restingAction(event) !== 'leave')
      return

    event.preventDefault()
    void leave()
    return
  }

  // ⚠️ **Events from the answer field are the field's** (ADR 0060 §7): `x` is
  // typing there. Only `Esc` is still the container's.
  const action = reviewAction(event, feedback.value ? 'result' : 'asking', fromField)
  if (!action)
    return

  event.preventDefault()

  if (action.kind === 'flag')
    flag()
  else
    finish()
}

async function leave() {
  // ADR 0032 blesses this spelling alongside `<NuxtLink … external>`: both do a
  // real document load, which is what strips the *mode*'s JavaScript.
  //
  // ⚠️ **Nothing is ended on the way out.** Leaving a lesson's teaching is a
  // pause and the lesson resumes (ADR 0076 §6); the summary and the screen
  // before a run have nothing live to end. The quiz is the one screen whose
  // exit ends something, and it does not come through here.
  await navigateTo(origin.value, { external: true })
}

// -- Lifecycle --------------------------------------------------------------

watch(view, () => void focusView())
watch(teachingIndex, () => void focusView())

/**
 * ⚠️ **The one listener on `window`, and it is not a keystroke.** ADR 0025 binds
 * the key handlers to the mode container because `X` is a printable character
 * and SC 2.1.4 Character Key Shortcuts is Level A — a criterion about
 * **keyboard shortcuts**, which this is not. `online` is the signal in
 * ADR 0039's sense: it shortens the latency of a replay the store would have
 * performed on the next load anyway, and removing it entirely changes when the
 * stream drains and never whether it does.
 */
function onOnline() {
  void enqueue(flush)
}

/**
 * The start block's link — `/review?start=lesson` — as a run to begin, once.
 *
 * ⚠️ **It is taken out of the address as soon as it is read.** Left there, a
 * reload on the summary or the back button would start the next lesson, and a
 * lesson spends the day's allowance by being composed (ADR 0066 §3).
 */
function takeStartParam(): SessionKind | null {
  const begin = route.query.start
  if (begin === undefined)
    return null

  const rest = { ...route.query }
  delete rest.start
  void router.replace({ query: rest })

  return begin === 'lesson' || begin === 'review' ? begin : null
}

onMounted(async () => {
  restore()

  const threshold = setTimeout(() => (slow.value = true), LOADING_THRESHOLD)
  window.addEventListener('online', onOnline)
  const begin = takeStartParam()

  // ⚠️ **The replay goes first.** A run resumed before its own owed answers had
  // landed would be answered by the server about a *session* it thinks is two
  // *grades* behind, and the track would fill twice.
  await enqueue(flush)
  await enqueue(() => start(begin))
  clearTimeout(threshold)
  void focusView()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline)
})
</script>

<template>
  <div class="mode">
    <!--
      ADR 0076 §8 — the prototype's bar: a name, one track, a count, the exit.
      ⚠️ **The exit is outside the mode container on purpose** (ADR 0025): it is
      a control with its own activation, and the container's keys are not its.
    -->
    <ModeBar
      v-if="view === 'teach'"
      name="Lesson"
      :progress="(teachingIndex + 1) / Math.max(1, positions.length)"
      :count="`word ${teachingIndex + 1} of ${positions.length}`"
    >
      <template #exit>
        <NuxtLink :to="origin" external class="exit">
          Leave
        </NuxtLink>
      </template>
    </ModeBar>

    <ModeBar
      v-else-if="view === 'quiz'"
      :name="kind === 'lesson' ? 'Lesson quiz' : 'Reviews'"
      :progress="done / Math.max(1, positions.length)"
      :count="`${done} of ${positions.length} ${positions.length === 1 ? 'word' : 'words'}`"
    >
      <template #exit>
        <!-- ⚠️ ADR 0076 §6: **a button, because it ends the run** — a link
             out would leave the missed words ungraded and the run live. -->
        <button type="button" class="exit" @click="finish">
          Finish early
        </button>
      </template>
    </ModeBar>

    <ModeBar
      v-else-if="view === 'summary'"
      name="Summary"
      :progress="1"
      :count="`${done} ${done === 1 ? 'word' : 'words'}`"
    >
      <template #exit>
        <NuxtLink :to="origin" external class="exit">
          {{ home.name }}
        </NuxtLink>
      </template>
    </ModeBar>

    <ModeBar v-else name="Study">
      <template #exit>
        <NuxtLink :to="origin" external class="exit">
          Done
        </NuxtLink>
      </template>
    </ModeBar>

    <!--
      ⚠️ **The mode container.** Key handlers bind here and focus lives here —
      never on `document` or `window` (ADR 0025, `10` §4.1, `11` §6.2).
    -->
    <div ref="container" class="container" tabindex="-1" @keydown="onKeydown">
      <div class="column">
        <!-- `10` §5.9: the frame paints immediately and the statement waits
             500ms, because a statement that flashes for 120ms is worse than
             120ms of quiet ground. -->
        <EmptyBlock v-if="view === 'loading'" v-show="slow">
          <template #statement>
            Seeing what is waiting.
          </template>
          <template #body>
            &nbsp;
          </template>
        </EmptyBlock>

        <EmptyBlock v-else-if="view === 'error'">
          <template #statement>
            That did not load.
          </template>
          <template #body>
            Nothing has been lost. Leave and come back.
          </template>
        </EmptyBlock>

        <!-- ADR 0076 §8 — what is waiting, and the reader starts one. The
             prototype puts this on Home, and since #71 Home has it (ADR 0078):
             Home's two cards start a run with `?start=`, so this screen is
             what `/review` opened bare shows. ⚠️ **The line naming the active
             *category* moved to Home with #71**; this screen no longer
             draws it.
             ⚠️ **Neither control is drawn for a run of nothing**: the sentence
             above says why, and a control that composed nothing would answer a
             press with this same screen. -->
        <section v-else-if="view === 'start' && offer && lines" class="start">
          <span class="eyebrow">Today</span>
          <h1 class="statement">
            {{ lines.statement }}
          </h1>
          <p v-if="lines.body" class="sub">
            {{ lines.body }}
          </p>

          <div class="cta">
            <button v-if="offer.dueCount > 0" type="button" class="btn" @click="enqueue(() => start('review'))">
              Start reviews · {{ offer.dueCount }} due
            </button>
            <button
              v-if="offer.lesson > 0"
              type="button"
              class="btn"
              :class="{ ghost: offer.dueCount > 0 }"
              @click="enqueue(() => start('lesson'))"
            >
              Start lesson · {{ offer.lesson }} {{ offer.lesson === 1 ? 'new word' : 'new words' }}
            </button>
          </div>

          <!-- ADR 0066 §7: which brake is on. ⚠️ **A brake that is silent is a
               bug report.** -->
          <p v-if="brakeLine" class="brake">
            {{ brakeLine }}
          </p>


          <!-- `10` §5.8: never mid-run, so it lives on the screen before one.
               The knob caps a review run. -->
          <SessionSizeKnob v-model="size" class="knob" />
        </section>

        <!-- ADR 0076 §1 — a lesson's teaching, one word a screen. -->
        <section v-else-if="view === 'teach' && teaching" class="teach">
          <div class="dots" aria-hidden="true">
            <i
              v-for="(position, index) in positions"
              :key="position.cardId"
              :class="{ done: index < teachingIndex, now: index === teachingIndex }"
            />
          </div>

          <LessonCard :key="teaching.cardId" :fields="teaching.fields" :level="teaching.level ?? null" />

          <div class="rowbtns">
            <button v-if="teachingIndex > 0" type="button" class="btn ghost" @click="showWord(teachingIndex - 1)">
              Back
            </button>
            <button v-if="lastTaught" ref="primary" type="button" class="btn" @click="beginQuestions">
              {{ positions.length === 1 ? 'Quiz me on this word' : `Quiz me on these ${positions.length}` }}
            </button>
            <button v-else ref="primary" type="button" class="btn" @click="showWord(teachingIndex + 1)">
              Next word
            </button>
          </div>

          <p class="foot">
            {{ lastTaught
              ? 'Get a word right in the quiz and it enters your reviews.'
              : `Take a moment with each word. The quiz comes after all ${positions.length}.` }}
          </p>
        </section>

        <section v-else-if="view === 'quiz' && asking && question" class="quiz">
          <!-- ⚠️ Keyed by the asking, so the field, its `bind` and what was
               typed cannot outlive the question they answered — the same
               question asked again after a miss is a new field. -->
          <QuizCard
            :key="askings"
            :fields="asking.fields"
            :part="question.part"
            :feedback="feedback"
            :problem="problem"
            :refusals="refusals"
            :clearings="clearings"
            @check="check"
            @next="advance"
          />

          <p class="foot">
            {{ quizFoot }}
          </p>

          <!-- `S9`'s `X`, on the result only: in the open field it is a letter.
               ⚠️ A control and not a legend, because a phone has no `X`. -->
          <p v-if="feedback" class="flagline">
            <button type="button" class="flag" @click="flag">
              <kbd class="desktop-only">X</kbd> Something is wrong with this word
            </button>
          </p>
        </section>

        <SessionSummary
          v-else-if="view === 'summary'"
          :kind="kind"
          :early="quiz?.finished ?? false"
          :positions="positions"
          :offer="offer"
          :unsent="unsent"
          :refused="refused"
          :session-expired="sessionExpired"
          :home="home"
          @start="begin => enqueue(() => start(begin))"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The prototype's `.mode`: the bar, and a body that grows under it. */
.mode {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--k-ground);
}

.container {
  flex: 1 1 auto;
  display: flex;
  justify-content: center;
  padding: 34px var(--k-gutter) 48px;
  outline: none;
}

/* `05` §5's object measure — 760px, which is the prototype's too. */
.column {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--k-measure-object);
}

.eyebrow {
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--k-ink-secondary);
}

.statement {
  margin: 6px 0 0;
  max-width: 18em;
  font-size: 44px;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.sub {
  margin: var(--k-space-2) 0 0;
  font-size: 17px;
  color: var(--k-ink-secondary);
}

.cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--k-space-3);
  margin-top: var(--k-space-6);
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

/* ADR 0066 §7's sentence: secondary ink, because it is about the day and not
   about what is on the controls above it. */
.brake {
  margin: var(--k-space-5) 0 0;
  font-size: 15px;
  color: var(--k-ink-secondary);
}

.knob {
  margin-top: var(--k-space-7);
}

.dots {
  display: flex;
  justify-content: center;
  gap: var(--k-space-2);
  margin: 0 0 var(--k-space-5);
}

.dots i {
  width: 28px;
  height: 5px;
  border-radius: var(--k-radius-tick);
  background: var(--k-tick-empty);
}

.dots i.done {
  background: var(--k-ink);
}

.dots i.now {
  background: var(--k-accent);
}

.rowbtns {
  display: flex;
  gap: var(--k-space-3);
  margin-top: var(--k-space-5);
}

.rowbtns .btn {
  flex: 1 1 0;
}

.rowbtns .btn.ghost {
  flex: 0 0 auto;
}

.foot {
  margin: var(--k-space-4) 0 0;
  font-size: 14px;
  font-style: italic;
  color: var(--k-ink-secondary);
  text-align: center;
}

.flagline {
  margin: var(--k-space-3) 0 0;
  text-align: center;
}

.flag {
  display: inline-flex;
  align-items: center;
  gap: var(--k-space-2);
  min-height: 32px;
  padding: 0 var(--k-space-2);
  background: none;
  border: 0;
  font-family: var(--k-face-en);
  font-size: 14px;
  color: var(--k-ink-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.flag:hover {
  color: var(--k-ink);
}

.flag kbd {
  padding: 1px 6px;
  background: var(--k-key-face);
  border-radius: var(--k-radius-key);
  font-family: var(--k-face-mono);
  font-size: 11px;
  color: var(--k-ink-value);
}

/* ⚠️ ADR 0026: ***Review* is the one *mode* that gets a phone layout**, because
   it is the one screen with dead time. The values are the prototype's. */
@media (width < 720px) {
  .container {
    padding: 18px var(--k-space-4) 28px;
  }

  .statement {
    font-size: 30px;
  }

  .cta .btn {
    width: 100%;
  }

  .flag {
    min-height: 44px;
  }

  .desktop-only {
    display: none;
  }
}
</style>
