// `S7`'s composition rule as a seam — `11` §8's list gains the first of #12's
// two, and the ticket says why it is a seam at all: without it the rule is only
// reachable through the schema tier, **where a wrong order reads as a fixture
// problem** rather than as a broken promise about what a *session* is.
//
// ⚠️ Everything asserted here is the *app's* job rather than the scheduler's
// (`03` §8, verification §1.4). `ts-fsrs` answers when a *card* comes back;
// nothing in it decides which twenty a reader sees this morning.
//
// ⚠️ **Two functions since ADR 0076 §1**: a *session* is a review run or a
// lesson, and never both. Until #70 one `compose` put due *cards* first and
// filled the remainder with new ones.

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SESSION_SIZE,
  MAX_SESSION_SIZE,
  clampSessionSize,
  composeLesson,
  composeReview,
} from '../../shared/review/compose'
import type { DueCard, NewCard } from '../../shared/review/compose'

const at = (iso: string) => new Date(iso)

const due = (cardId: string, iso: string, retrievability = 0.5): DueCard =>
  ({ cardId, due: at(iso), retrievability })
const fresh = (cardId: string, iso: string): NewCard => ({ cardId, mintedAt: at(iso) })

/** `n` due *cards*, one a day apart, all at the same retrievability. */
const dueMany = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    due(`d${String(i).padStart(3, '0')}`, new Date(Date.UTC(2026, 7, 1 + i)).toISOString()))

/** `n` new *cards*, one a day apart. */
const freshMany = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    fresh(`n${String(i).padStart(3, '0')}`, new Date(Date.UTC(2026, 6, 1 + i)).toISOString()))

describe('composeReview — due cards and nothing else (ADR 0076 §1)', () => {
  // ⚠️ **When everything due fits, the order does not matter** (ADR 0066 §5) —
  // everything is studied — and `due` ascending is kept as the stable one.
  it('orders a due set that fits oldest-due first, whatever order it arrives in', () => {
    const order = composeReview(
      [
        due('late', '2026-08-20T08:00:00Z'),
        due('today', '2026-09-12T06:00:00Z'),
        due('yesterday', '2026-09-11T06:00:00Z'),
      ],
      20,
    )

    expect(order).toEqual(['late', 'yesterday', 'today'])
  })

  // ⚠️ Two *cards* due at the same instant is ordinary — a whole *session* is
  // graded within a minute of itself. Composing twice must answer the same way.
  it('is deterministic when two cards share a due instant', () => {
    const same = '2026-09-12T08:00:00Z'
    const once = composeReview([due('b', same), due('a', same)], 20)
    const twice = composeReview([due('a', same), due('b', same)], 20)

    expect(once).toEqual(['a', 'b'])
    expect(twice).toEqual(once)
  })

  it('stops at size', () => {
    expect(composeReview(dueMany(5), 3)).toHaveLength(3)
  })

  // A short *session* is a short *session*. `04` §7.7 holds `review_session.size`
  // rows and the header's count is of them, so padding would be a track that
  // can never fill.
  it('answers short rather than padding when there is nothing else due', () => {
    expect(composeReview([due('d1', '2026-09-10T08:00:00Z')], 20)).toEqual(['d1'])
    expect(composeReview([], 20)).toEqual([])
  })

  it('answers empty for a size that is not a size', () => {
    expect(composeReview([due('d1', '2026-09-10T08:00:00Z')], 0)).toEqual([])
    expect(composeReview([due('d1', '2026-09-10T08:00:00Z')], -1)).toEqual([])
  })

  // ADR 0066 §6. Nothing caps the cure: three runs of twenty in an evening
  // are three runs of twenty.
  it('never caps what is owed below the size', () => {
    const backlog = dueMany(300)

    expect(composeReview(backlog, 20)).toHaveLength(20)
    expect(composeReview(backlog.slice(20), 20)).toHaveLength(20)
    expect(composeReview(backlog, 200)).toHaveLength(200)
  })

  // ⚠️ `04` §7.7's `UNIQUE (review_session_id, card_id)`. This guards the
  // query changing underneath; the alternative is the whole compose failing on
  // a unique violation.
  it('holds a card once', () => {
    expect(composeReview([due('same', '2026-09-10T08:00:00Z'), due('same', '2026-09-10T08:00:00Z')], 20)).toEqual(['same'])
  })
})

// ADR 0066 §5. ⚠️ **This replaced the most-overdue-first rule**, whose comment
// said a *card* three weeks late has decayed further than one due this morning.
// That holds only at equal stability; FSRS can say which is closer to being
// forgotten, and when the backlog is bigger than the run that is the question.
describe('composeReview — a backlog is ordered by retrievability (ADR 0066 §5)', () => {
  it('takes the least remembered when the due set is larger than the session', () => {
    const cardIds = composeReview(
      [
        // Three weeks late, and a long-stability card: still well remembered.
        due('sturdy-and-late', '2026-08-20T08:00:00Z', 0.86),
        due('shaky-yesterday', '2026-09-11T08:00:00Z', 0.41),
        due('middling', '2026-09-01T08:00:00Z', 0.62),
      ],
      2,
    )

    expect(cardIds).toEqual(['shaky-yesterday', 'middling'])
  })

  it('breaks a retrievability tie by due, then by id', () => {
    const cardIds = composeReview(
      [
        due('b', '2026-09-10T08:00:00Z', 0.5),
        due('late', '2026-09-11T08:00:00Z', 0.5),
        due('a', '2026-09-10T08:00:00Z', 0.5),
        due('best', '2026-09-01T08:00:00Z', 0.9),
      ],
      3,
    )

    expect(cardIds).toEqual(['a', 'b', 'late'])
  })

  // When it all fits, retrievability is not consulted: the run holds all of
  // it either way, and the stable order is the one it always had.
  it('keeps due order when the due set fits', () => {
    const cardIds = composeReview(
      [due('early', '2026-08-20T08:00:00Z', 0.9), due('later', '2026-09-11T08:00:00Z', 0.1)],
      20,
    )

    expect(cardIds).toEqual(['early', 'later'])
  })
})

describe('composeLesson — new words only, the reader\'s own first (ADR 0076 §1)', () => {
  it('takes the reader\'s own unscheduled cards before any starter word', () => {
    const plan = composeLesson([fresh('own', '2026-09-01T00:00:00Z')], ['note-a', 'note-b'], 5)

    expect(plan).toEqual({ cardIds: ['own'], noteIds: ['note-a', 'note-b'] })
  })

  it('orders the reader\'s own in the order they were minted', () => {
    const plan = composeLesson(
      [fresh('third', '2026-09-03T00:00:00Z'), fresh('first', '2026-09-01T00:00:00Z'), fresh('second', '2026-09-02T00:00:00Z')],
      [],
      5,
    )

    expect(plan.cardIds).toEqual(['first', 'second', 'third'])
  })

  // ⚠️ The starter words arrive already ordered — easiest level first, then
  // the fixed shuffle (`unstartedNotes`) — and that order is the lesson's.
  it('keeps the starter words in the order they were offered', () => {
    expect(composeLesson([], ['c', 'a', 'b'], 5).noteIds).toEqual(['c', 'a', 'b'])
  })

  it('holds no more than the room it is given, counted across both', () => {
    const plan = composeLesson(freshMany(3), ['a', 'b', 'c', 'd'], 5)

    expect(plan.cardIds).toEqual(['n000', 'n001', 'n002'])
    expect(plan.noteIds).toEqual(['a', 'b'])
  })

  it('takes no starter word when the reader\'s own fill the lesson', () => {
    const plan = composeLesson(freshMany(8), ['a'], 5)

    expect(plan.cardIds).toHaveLength(5)
    expect(plan.noteIds).toEqual([])
  })

  it.each([0, -3])('is empty when the brake leaves no room (%i)', (room) => {
    expect(composeLesson(freshMany(3), ['a'], room)).toEqual({ cardIds: [], noteIds: [] })
  })

  it('answers short rather than padding when fewer words are waiting', () => {
    expect(composeLesson([], ['a'], 5)).toEqual({ cardIds: [], noteIds: ['a'] })
    expect(composeLesson([], [], 5)).toEqual({ cardIds: [], noteIds: [] })
  })

  it('holds a word once', () => {
    const plan = composeLesson(
      [fresh('same', '2026-09-01T00:00:00Z'), fresh('same', '2026-09-01T00:00:00Z')],
      ['a', 'a', 'b'],
      5,
    )

    expect(plan).toEqual({ cardIds: ['same'], noteIds: ['a', 'b'] })
  })

  it('floors a fractional room', () => {
    expect(composeLesson(freshMany(5), [], 2.9).cardIds).toHaveLength(2)
  })
})

// `04` §7.6's `CHECK (size > 0 AND size <= 200)`, `10` §5.8's two homes, and
// `09` §4.7's "bounded 1–200, enforced on the client and again on the server".
describe('clampSessionSize — the knob, on both sides of the wire', () => {
  it('keeps a value inside the bounds', () => {
    expect(clampSessionSize(1)).toBe(1)
    expect(clampSessionSize(20)).toBe(20)
    expect(clampSessionSize(200)).toBe(200)
  })

  it('clamps rather than refusing, because the field shows the clamped value', () => {
    expect(clampSessionSize(0)).toBe(1)
    expect(clampSessionSize(-4)).toBe(1)
    expect(clampSessionSize(2000)).toBe(MAX_SESSION_SIZE)
  })

  it('takes the string a form field sends', () => {
    expect(clampSessionSize('40')).toBe(40)
  })

  // The *session* is a count of *cards* and `04` §7.6's column is an integer.
  it('floors a fraction', () => {
    expect(clampSessionSize(20.9)).toBe(20)
  })

  it('falls back to twenty for anything that is not a number at all', () => {
    expect(clampSessionSize(Number.NaN)).toBe(DEFAULT_SESSION_SIZE)
    expect(clampSessionSize('twenty')).toBe(DEFAULT_SESSION_SIZE)
    expect(clampSessionSize(undefined)).toBe(DEFAULT_SESSION_SIZE)
    expect(clampSessionSize(null)).toBe(DEFAULT_SESSION_SIZE)
  })
})
