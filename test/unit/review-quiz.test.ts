// The quiz — ADR 0076 §3, §4 and §6, at the seam where the rule #70 asks to be
// tested is arithmetic over a list: **a wrong answer is asked again in the same
// session until it is right, and the word still counts as missed.**
//
// ⚠️ **The database never sees a question**, so nothing in the schema tier can
// hold this. What the server records is one *grade* per word, and which *grade*
// is decided here.

import { describe, expect, it } from 'vitest'

import {
  answerQuestion,
  beginQuiz,
  currentQuestion,
  dropWord,
  finishEarly,
  gradeFor,
  parseQuiz,
  reconcile,
  startQuestions,
  summarise,
  teach,
} from '../../shared/review/quiz'
import type { QuizState } from '../../shared/review/quiz'
import { isAnswered } from '../../shared/review/snapshot'
import type { ReviewPosition, ReviewSnapshot, SessionKind } from '../../shared/review/snapshot'

const SESSION = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

const position = (cardId: string, term: string, extra: Partial<ReviewPosition> = {}): ReviewPosition => ({
  ordinal: 0,
  cardId,
  templateKey: 'recognition',
  fields: { term, reading: 'よみ', meaning: 'meaning' },
  meanings: [],
  synonyms: [],
  kanjiReadings: [],
  level: null,
  stage: null,
  outcome: null,
  grade: null,
  flagged: false,
  ...extra,
})

const run = (kind: SessionKind, positions: ReviewPosition[]): ReviewSnapshot => ({
  sessionId: SESSION,
  kind,
  size: positions.length,
  snapshotTakenAt: new Date('2026-10-10T09:00:00Z'),
  positions: positions.map((entry, ordinal) => ({ ...entry, ordinal })),
})

const two = () => run('review', [position('a', '経験'), position('b', '図書館')])
const queueOf = (state: QuizState) => state.queue.map(question => `${question.cardId}:${question.part}`)

/** Answer the head of the queue `right`, and say what happened. */
const answer = (state: QuizState, right: boolean) => answerQuestion(state, right)

describe('the questions a run asks (ADR 0076 §3)', () => {
  it('asks the meaning and then the reading, word by word', () => {
    expect(queueOf(beginQuiz(two(), isAnswered))).toEqual(['a:meaning', 'a:reading', 'b:meaning', 'b:reading'])
  })

  // ADR 0069 §4: a kana word is its own reading.
  it('asks a kana-only word for its meaning alone', () => {
    const state = beginQuiz(run('review', [position('a', 'コーヒー'), position('b', '経験')]), isAnswered)

    expect(queueOf(state)).toEqual(['a:meaning', 'b:meaning', 'b:reading'])
  })

  it('asks nothing about a word that is already answered', () => {
    const state = beginQuiz(run('review', [position('a', '経験', { grade: 3 }), position('b', '図書館', { flagged: true }), position('c', '夢')]), isAnswered)

    expect(queueOf(state)).toEqual(['c:meaning', 'c:reading'])
  })

  it('puts the first question at the head', () => {
    expect(currentQuestion(beginQuiz(two(), isAnswered))).toEqual({ cardId: 'a', part: 'meaning' })
  })
})

describe('a right answer (ADR 0076 §4)', () => {
  it('takes the question out and leaves the word unfinished while it owes another', () => {
    const { state, completed } = answer(beginQuiz(two(), isAnswered), true)

    expect(queueOf(state)).toEqual(['a:reading', 'b:meaning', 'b:reading'])
    expect(completed).toBeNull()
  })

  it('completes the word with Good when every question was right first time', () => {
    const first = answer(beginQuiz(two(), isAnswered), true)
    const second = answer(first.state, true)

    expect(second.completed).toEqual({ cardId: 'a', grade: 3 })
    expect(second.state.missed).toEqual([])
  })

  it('completes a kana-only word on its one question', () => {
    const state = beginQuiz(run('review', [position('a', 'コーヒー')]), isAnswered)

    expect(answer(state, true).completed).toEqual({ cardId: 'a', grade: 3 })
  })
})

// ⚠️ **The rule the issue names.**
describe('a wrong answer is asked again, and the word still counts as missed', () => {
  it('sends that question to the back of the queue', () => {
    const { state, completed } = answer(beginQuiz(two(), isAnswered), false)

    expect(queueOf(state)).toEqual(['a:reading', 'b:meaning', 'b:reading', 'a:meaning'])
    expect(completed).toBeNull()
  })

  it('marks the word missed, once', () => {
    let state = beginQuiz(run('review', [position('a', '経験')]), isAnswered)
    state = answer(state, false).state
    state = answer(state, false).state

    expect(state.missed).toEqual(['a'])
  })

  it('asks the missed question again before the run ends, however many times it takes', () => {
    let state = beginQuiz(two(), isAnswered)

    state = answer(state, false).state // a:meaning wrong
    state = answer(state, true).state // a:reading
    state = answer(state, true).state // b:meaning
    state = answer(state, true).state // b:reading — b is done

    expect(currentQuestion(state)).toEqual({ cardId: 'a', part: 'meaning' })

    state = answer(state, false).state // wrong again: it is the only one left
    expect(currentQuestion(state)).toEqual({ cardId: 'a', part: 'meaning' })
    expect(state.queue).toHaveLength(1)
  })

  it('grades the word Forgot when it is finally got right', () => {
    let state = beginQuiz(run('review', [position('a', '経験')]), isAnswered)

    state = answer(state, false).state // meaning wrong
    state = answer(state, true).state // reading right
    const last = answer(state, true) // meaning right, second time

    expect(last.completed).toEqual({ cardId: 'a', grade: 1 })
    expect(last.state.queue).toEqual([])
  })

  it('grades Forgot for a miss on either half', () => {
    let state = beginQuiz(run('review', [position('a', '経験')]), isAnswered)

    state = answer(state, true).state // meaning right
    state = answer(state, false).state // reading wrong
    expect(answer(state, true).completed).toEqual({ cardId: 'a', grade: 1 })
  })

  it('does not complete the word on a right answer while a missed question is still owed', () => {
    let state = beginQuiz(run('review', [position('a', '経験')]), isAnswered)

    state = answer(state, false).state // meaning wrong → back
    const reading = answer(state, true) // reading right

    expect(reading.completed).toBeNull()
    expect(queueOf(reading.state)).toEqual(['a:meaning'])
  })

  it('leaves another word\'s grade alone', () => {
    let state = beginQuiz(two(), isAnswered)

    state = answer(state, false).state // a:meaning wrong
    state = answer(state, true).state // a:reading
    state = answer(state, true).state // b:meaning
    expect(answer(state, true).completed).toEqual({ cardId: 'b', grade: 3 })
  })

  // ADR 0069 §1: only two grades, and nothing between them.
  it('gives Good or Forgot and nothing else', () => {
    expect(gradeFor(false)).toBe(3)
    expect(gradeFor(true)).toBe(1)
  })

  it('does nothing with an empty queue', () => {
    const empty: QuizState = { sessionId: SESSION, queue: [], missed: [], teaching: null, finished: false }

    expect(answer(empty, true)).toEqual({ state: empty, completed: null })
  })
})

describe('a lesson teaches before it asks (ADR 0076 §1)', () => {
  const lesson = () => run('lesson', [position('a', '経験'), position('b', '図書館')])

  it('opens on its first word', () => {
    expect(beginQuiz(lesson(), isAnswered).teaching).toBe(0)
  })

  it('never teaches in a review run', () => {
    expect(beginQuiz(two(), isAnswered).teaching).toBeNull()
  })

  it('moves between the words, and not below the first', () => {
    const state = beginQuiz(lesson(), isAnswered)

    expect(teach(state, 1).teaching).toBe(1)
    expect(teach(state, -1).teaching).toBe(0)
  })

  it('stops teaching when the quiz begins, and does not go back', () => {
    const asking = startQuestions(beginQuiz(lesson(), isAnswered))

    expect(asking.teaching).toBeNull()
    expect(teach(asking, 0).teaching).toBeNull()
  })

  // ⚠️ Showing the words again would hand over the answers to a quiz under way.
  it('does not teach a lesson that already has an answered word', () => {
    const resumed = run('lesson', [position('a', '経験', { grade: 3 }), position('b', '図書館')])

    expect(beginQuiz(resumed, isAnswered).teaching).toBeNull()
  })
})

describe('X — the word leaves ungraded (`S9`)', () => {
  it('takes every question the word still owed', () => {
    const state = answer(beginQuiz(two(), isAnswered), false).state

    expect(queueOf(dropWord(state, 'a'))).toEqual(['b:meaning', 'b:reading'])
  })
})

describe('finishing early (ADR 0076 §6)', () => {
  const missedAndReached = () => {
    let state = beginQuiz(run('review', [position('a', '経験'), position('b', '図書館'), position('c', '夢')]), isAnswered)

    state = answer(state, false).state // a:meaning wrong
    state = answer(state, true).state // a:reading right
    return state // b and c not reached; a owes its meaning
  }

  it('grades Forgot each word that was missed and not yet got right, in a review run', () => {
    const { state, forgot } = finishEarly(missedAndReached(), 'review')

    expect(forgot).toEqual(['a'])
    expect(state).toMatchObject({ queue: [], finished: true, teaching: null })
  })

  // A word not reached is left due: nothing was learned about it.
  it('grades nothing for a word that was not reached', () => {
    expect(finishEarly(beginQuiz(two(), isAnswered), 'review').forgot).toEqual([])
  })

  it('does not grade again a missed word that was already got right', () => {
    let state = beginQuiz(two(), isAnswered)

    state = answer(state, false).state // a:meaning wrong
    state = answer(state, true).state // a:reading
    state = answer(state, true).state // b:meaning
    state = answer(state, true).state // b:reading — b done
    state = answer(state, true).state // a:meaning right — a done, graded Forgot there

    expect(finishEarly(state, 'review').forgot).toEqual([])
  })

  // ⚠️ A new word enters reviews by being got right; one that was not is
  // taught again in the next lesson.
  it('grades nothing in a lesson', () => {
    expect(finishEarly(missedAndReached(), 'lesson').forgot).toEqual([])
  })
})

describe('a stored quiz made to agree with its run', () => {
  it('begins afresh for another run, or for none', () => {
    const other: QuizState = { sessionId: 'other', queue: [], missed: ['a'], teaching: null, finished: false }

    expect(reconcile(other, two(), isAnswered)).toEqual(beginQuiz(two(), isAnswered))
    expect(reconcile(null, two(), isAnswered)).toEqual(beginQuiz(two(), isAnswered))
  })

  // ⚠️ A reload must not forgive a miss.
  it('keeps the order and the misses across a reload', () => {
    const stored = answer(beginQuiz(two(), isAnswered), false).state
    const back = reconcile(parseQuiz(JSON.parse(JSON.stringify(stored))), two(), isAnswered)

    expect(queueOf(back)).toEqual(['a:reading', 'b:meaning', 'b:reading', 'a:meaning'])
    expect(back.missed).toEqual(['a'])
  })

  it('drops the questions of a word the run says is answered', () => {
    const stored = beginQuiz(two(), isAnswered)
    const answered = run('review', [position('a', '経験', { grade: 3 }), position('b', '図書館')])

    expect(queueOf(reconcile(stored, answered, isAnswered))).toEqual(['b:meaning', 'b:reading'])
  })

  // A word cannot be both unanswered and done.
  it('gives an owed word with no question left all of its questions back', () => {
    const stored: QuizState = { sessionId: SESSION, queue: [{ cardId: 'a', part: 'reading' }], missed: [], teaching: null, finished: false }

    expect(queueOf(reconcile(stored, two(), isAnswered))).toEqual(['a:reading', 'b:meaning', 'b:reading'])
  })

  // ⚠️ Putting the questions back would undo the finish on every reload.
  it('owes nothing once the run was finished early', () => {
    const finished = finishEarly(beginQuiz(two(), isAnswered), 'review').state

    expect(reconcile(finished, two(), isAnswered)).toMatchObject({ queue: [], finished: true })
  })

  it('keeps a lesson on the word it was teaching', () => {
    const lesson = run('lesson', [position('a', '経験'), position('b', '図書館')])
    const stored = teach(beginQuiz(lesson, isAnswered), 1)

    expect(reconcile(stored, lesson, isAnswered).teaching).toBe(1)
  })
})

describe('reading the quiz back out of storage', () => {
  it('round-trips through JSON', () => {
    const state = answer(beginQuiz(two(), isAnswered), false).state

    expect(parseQuiz(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('drops a malformed question and keeps the rest', () => {
    const parsed = parseQuiz({
      sessionId: SESSION,
      queue: [{ cardId: 'a', part: 'meaning' }, { cardId: 'a', part: 'spelling' }, { part: 'reading' }, 7],
      missed: ['a', 3],
      teaching: -1,
    })

    expect(parsed).toEqual({ sessionId: SESSION, queue: [{ cardId: 'a', part: 'meaning' }], missed: ['a'], teaching: null, finished: false })
  })

  it.each([
    ['nothing', null],
    ['a string', '{}'],
    ['a list', []],
    ['a state with no run', { queue: [], missed: [] }],
    ['a state with no queue', { sessionId: SESSION, missed: [] }],
  ])('refuses %s', (_, raw) => {
    expect(parseQuiz(raw)).toBeNull()
  })
})

describe('the summary\'s numbers (ADR 0076 §7)', () => {
  it('counts right first try, missed, and what was left', () => {
    const summary = summarise([
      position('a', '経験', { grade: 3 }),
      position('b', '図書館', { grade: 1 }),
      position('c', '夢', { grade: 3 }),
      position('d', '猫'),
    ])

    expect(summary.right.map(entry => entry.cardId)).toEqual(['a', 'c'])
    expect(summary.missed.map(entry => entry.cardId)).toEqual(['b'])
    expect(summary).toMatchObject({ total: 3, left: 1, percent: 67 })
  })

  // `S9`: a flagged word advances without a grade, and is in neither list.
  it('counts a flagged word nowhere', () => {
    expect(summarise([position('a', '経験', { flagged: true })])).toMatchObject({ total: 0, left: 0, percent: 0 })
  })

  it('is 0% for a run that graded nothing, rather than a division by zero', () => {
    expect(summarise([position('a', '経験')]).percent).toBe(0)
  })

  // A run resumed from before ADR 0069 can hold a Hard or an Easy: not a lapse.
  it('counts Hard and Easy as right', () => {
    expect(summarise([position('a', '経験', { grade: 2 }), position('b', '夢', { grade: 4 })]).right).toHaveLength(2)
  })
})
