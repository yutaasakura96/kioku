/**
 * The quiz — [ADR 0076](../../docs/adr/0076-new-words-are-taught-in-a-lesson-and-a-miss-is-asked-again.md)
 * §3, §4 and §6. Which question is next, what a wrong answer does, and which
 * *grade* a word ends with.
 *
 * ⚠️ **A word is graded once, when every question about it has been answered
 * right**: Good if none was missed, Forgot if any was. A wrong answer sends
 * that question to the back of the queue, so it returns before the run ends —
 * and the miss stays on the word however many times it is then got right.
 *
 * ⚠️ **The database never sees a question.** It holds positions and *grades*;
 * the queue is the screen's, kept in `localStorage` beside the snapshot so that
 * a reload does not forgive a miss (`app/utils/review-store.ts`). Everything
 * here is a pure function over that state, which is what lets `test/unit/`
 * hold the rule the issue asks to be tested: re-asking a miss.
 */

import { answerSteps } from './answer'
import type { AnswerStep, CheckedGrade } from './answer'
import type { ReviewPosition, ReviewSnapshot, SessionKind } from './snapshot'

/** One thing the quiz asks: a word, and which half of it. */
export interface Question {
  cardId: string
  part: AnswerStep
}

export interface QuizState {
  /** The run this belongs to. A state for another run is discarded. */
  sessionId: string
  /** What is still owed, the next question first. */
  queue: Question[]
  /** The words with at least one wrong answer in this run. */
  missed: string[]
  /**
   * A lesson's teaching screen, by position, or `null` once its quiz has begun
   * — and always `null` in a review run, which teaches nothing.
   */
  teaching: number | null
  /** ADR 0076 §6: the reader finished early, and the summary is what is left. */
  finished: boolean
}

/** Every question a set of positions asks, word by word, meaning first. */
function questionsFor(positions: readonly ReviewPosition[]): Question[] {
  return positions.flatMap(position =>
    answerSteps(position.fields.term ?? '').map(part => ({ cardId: position.cardId, part })),
  )
}

/**
 * The state a run starts in, or is given back when the store has none.
 *
 * ⚠️ **A lesson opens on its first teaching screen only while nothing in it is
 * answered.** One with a graded word is past its teaching, and showing the
 * words again would hand the reader the answers to a quiz already under way.
 */
export function beginQuiz(snapshot: ReviewSnapshot, isAnswered: (position: ReviewPosition) => boolean): QuizState {
  const untouched = snapshot.positions.every(position => !isAnswered(position))

  return {
    sessionId: snapshot.sessionId,
    queue: questionsFor(snapshot.positions.filter(position => !isAnswered(position))),
    missed: [],
    teaching: snapshot.kind === 'lesson' && untouched ? 0 : null,
    finished: false,
  }
}

/**
 * A stored state made to agree with the run it claims to be about.
 *
 * ⚠️ **The snapshot decides which words are still owed and the state decides
 * only their order and their misses.** A question for a word that is answered
 * goes; a word that is owed and has no question left gets all of its questions
 * back, because a word cannot be both unanswered and done.
 */
export function reconcile(
  stored: QuizState | null,
  snapshot: ReviewSnapshot,
  isAnswered: (position: ReviewPosition) => boolean,
): QuizState {
  if (!stored || stored.sessionId !== snapshot.sessionId)
    return beginQuiz(snapshot, isAnswered)

  // ⚠️ **A run finished early owes nothing**, whatever is unanswered in it:
  // putting those questions back would undo the finish on every reload.
  if (stored.finished)
    return { ...stored, queue: [], teaching: null }

  const owed = snapshot.positions.filter(position => !isAnswered(position))
  const owedIds = new Set(owed.map(position => position.cardId))
  const queue = stored.queue.filter(question => owedIds.has(question.cardId))
  const queued = new Set(queue.map(question => question.cardId))

  return {
    sessionId: stored.sessionId,
    queue: [...queue, ...questionsFor(owed.filter(position => !queued.has(position.cardId)))],
    missed: stored.missed.filter(cardId => snapshot.positions.some(position => position.cardId === cardId)),
    teaching: stored.teaching !== null && stored.teaching < snapshot.positions.length ? stored.teaching : null,
    finished: stored.finished,
  }
}

/** What the reader is being asked, or `null` when nothing is owed. */
export function currentQuestion(state: QuizState): Question | null {
  return state.queue[0] ?? null
}

/** ADR 0069 §1's two *grades*, by ADR 0076 §4's rule. */
export function gradeFor(missed: boolean): CheckedGrade {
  return missed ? 1 : 3
}

export interface Answered {
  state: QuizState
  /** Set when this answer was the last one the word owed. */
  completed: { cardId: string, grade: CheckedGrade } | null
}

/**
 * One answer to the question at the head of the queue.
 *
 * ⚠️ **Wrong: the question goes to the back and the word is marked missed.**
 * With one question left it is the back and the front at once, and it is asked
 * again at once — there is nothing else to ask.
 *
 * ⚠️ **Right: the question leaves, and the word is complete when it was the
 * last one that word owed.** That is the moment the *grade* exists.
 */
export function answerQuestion(state: QuizState, right: boolean): Answered {
  const [asked, ...rest] = state.queue

  if (!asked)
    return { state, completed: null }

  if (!right) {
    return {
      state: {
        ...state,
        queue: [...rest, asked],
        missed: state.missed.includes(asked.cardId) ? state.missed : [...state.missed, asked.cardId],
      },
      completed: null,
    }
  }

  const done = !rest.some(question => question.cardId === asked.cardId)

  return {
    state: { ...state, queue: rest },
    completed: done ? { cardId: asked.cardId, grade: gradeFor(state.missed.includes(asked.cardId)) } : null,
  }
}

/** `S9`'s `X`: the word leaves the quiz ungraded, with every question it owed. */
export function dropWord(state: QuizState, cardId: string): QuizState {
  return { ...state, queue: state.queue.filter(question => question.cardId !== cardId) }
}

/** The lesson's quiz begins: the teaching is over and does not come back. */
export function startQuestions(state: QuizState): QuizState {
  return { ...state, teaching: null }
}

export function teach(state: QuizState, index: number): QuizState {
  return state.teaching === null ? state : { ...state, teaching: Math.max(0, index) }
}

export interface Finished {
  state: QuizState
  /** The words to grade Forgot on the way out, in the order they were missed. */
  forgot: string[]
}

/**
 * ADR 0076 §6 — finishing early.
 *
 * ⚠️ **In a review run a word that was missed and not yet got right is graded
 * Forgot**: *the word still counts as missed for scheduling*, and ending the
 * run must not be the way to take a miss back. A word not reached is left due.
 *
 * ⚠️ **In a lesson nothing is graded here.** A new word enters reviews by being
 * got right, and one that was not is taught again in the next lesson.
 */
export function finishEarly(state: QuizState, kind: SessionKind): Finished {
  const owed = new Set(state.queue.map(question => question.cardId))

  return {
    state: { ...state, queue: [], teaching: null, finished: true },
    forgot: kind === 'review' ? state.missed.filter(cardId => owed.has(cardId)) : [],
  }
}

/**
 * The state read back out of `localStorage`, or `null` for anything that is
 * not one. ⚠️ **A malformed question is dropped and the rest kept**: `reconcile`
 * puts back whatever a word still owes.
 */
export function parseQuiz(raw: unknown): QuizState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return null

  const { sessionId, queue, missed, teaching, finished } = raw as Record<string, unknown>

  if (typeof sessionId !== 'string' || !Array.isArray(queue) || !Array.isArray(missed))
    return null

  return {
    sessionId,
    queue: queue.filter(isQuestion).map(({ cardId, part }) => ({ cardId, part })),
    missed: missed.filter((cardId): cardId is string => typeof cardId === 'string'),
    teaching: typeof teaching === 'number' && Number.isInteger(teaching) && teaching >= 0 ? teaching : null,
    finished: finished === true,
  }
}

function isQuestion(value: unknown): value is Question {
  if (typeof value !== 'object' || value === null)
    return false

  const { cardId, part } = value as Record<string, unknown>

  return typeof cardId === 'string' && (part === 'meaning' || part === 'reading')
}

export interface Summary {
  /** Graded Good — every question right the first time it was asked. */
  right: ReviewPosition[]
  /** Graded Forgot. */
  missed: ReviewPosition[]
  /** Neither graded nor flagged: not reached, or not got right in a lesson. */
  left: number
  /** `right + missed` — the words the run decided about. */
  total: number
  /** Whole percent right first try, and 0 for a run that graded nothing. */
  percent: number
}

/**
 * The summary's numbers, from the positions and nothing else.
 *
 * ⚠️ **A flagged word is in neither list** (`S9`: it advances without a
 * *grade*), and a *grade* of Hard or Easy from before ADR 0069 counts as right:
 * it was not a lapse.
 */
export function summarise(positions: readonly ReviewPosition[]): Summary {
  const right = positions.filter(position => position.grade !== null && position.grade !== 1)
  const missed = positions.filter(position => position.grade === 1)
  const total = right.length + missed.length

  return {
    right,
    missed,
    left: positions.filter(position => position.grade === null && !position.flagged).length,
    total,
    percent: total === 0 ? 0 : Math.round((right.length / total) * 100),
  }
}
