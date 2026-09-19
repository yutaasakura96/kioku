// `S7`'s composition rule as a seam — `11` §8's list gains the first of #12's
// two, and the ticket says why it is a seam at all: without it the rule is only
// reachable through the schema tier, **where a wrong order reads as a fixture
// problem** rather than as a broken promise about what a *session* is.
//
// ⚠️ Everything asserted here is the *app's* job rather than the scheduler's
// (`03` §8, verification §1.4). `ts-fsrs` answers when a *card* comes back;
// nothing in it decides which twenty a reader sees this morning.

import { describe, expect, it } from 'vitest'

import {
  DAILY_NEW_CARDS,
  DEFAULT_SESSION_SIZE,
  MAX_SESSION_SIZE,
  NEW_CARDS_PAUSED_ABOVE_DUE,
  clampSessionSize,
  compose as composeRun,
} from '../../shared/review/compose'
import type { DueCard, NewCard } from '../../shared/review/compose'

const at = (iso: string) => new Date(iso)

const due = (cardId: string, iso: string, retrievability = 0.5): DueCard =>
  ({ cardId, due: at(iso), retrievability })
const fresh = (cardId: string, iso: string): NewCard => ({ cardId, mintedAt: at(iso) })

/**
 * The order alone, with the brake off. ⚠️ **The allowance is set to the size**
 * so that every assertion written before ADR 0066 still says what it said: the
 * brake has its own `describe` below, and a test about ordering that silently
 * started testing the cap would be two tests in one.
 */
const compose = (owed: DueCard[], unseen: NewCard[], size: number) =>
  composeRun(owed, unseen, size, size).cardIds

/** `n` due *cards*, one a day apart, all at the same retrievability. */
const dueMany = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    due(`d${String(i).padStart(3, '0')}`, new Date(Date.UTC(2026, 7, 1 + i)).toISOString()))

/** `n` new *cards*, one a day apart. */
const freshMany = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    fresh(`n${String(i).padStart(3, '0')}`, new Date(Date.UTC(2026, 6, 1 + i)).toISOString()))

describe('compose — due first, new cards filling the remainder (`S7`)', () => {
  it('puts every due card before every new one', () => {
    const order = compose(
      [due('d1', '2026-09-10T08:00:00Z'), due('d2', '2026-09-11T08:00:00Z')],
      [fresh('n1', '2026-09-01T00:00:00Z')],
      20,
    )

    expect(order).toEqual(['d1', 'd2', 'n1'])
  })

  // ⚠️ **When everything due fits, the order does not matter** (ADR 0066 §5) —
  // everything is studied — and `due` ascending is kept as the stable one.
  it('orders a due half that fits oldest-due first, whatever order it arrives in', () => {
    const order = compose(
      [
        due('late', '2026-08-20T08:00:00Z'),
        due('today', '2026-09-12T06:00:00Z'),
        due('yesterday', '2026-09-11T06:00:00Z'),
      ],
      [],
      20,
    )

    expect(order).toEqual(['late', 'yesterday', 'today'])
  })

  it('orders new cards in the order they were accepted', () => {
    const order = compose(
      [],
      [fresh('third', '2026-09-03T00:00:00Z'), fresh('first', '2026-09-01T00:00:00Z'), fresh('second', '2026-09-02T00:00:00Z')],
      20,
    )

    expect(order).toEqual(['first', 'second', 'third'])
  })

  // ⚠️ Two *cards* due at the same instant is ordinary — a whole *session* is
  // graded within a minute of itself. Composing twice must answer the same way.
  it('is deterministic when two cards share a due instant', () => {
    const same = '2026-09-12T08:00:00Z'
    const once = compose([due('b', same), due('a', same)], [], 20)
    const twice = compose([due('a', same), due('b', same)], [], 20)

    expect(once).toEqual(['a', 'b'])
    expect(twice).toEqual(once)
  })
})

describe('compose — the session is a fixed size (`S7`, ADR 0016)', () => {
  it('stops at size', () => {
    const order = compose(
      [due('d1', '2026-09-10T08:00:00Z'), due('d2', '2026-09-11T08:00:00Z')],
      [fresh('n1', '2026-09-01T00:00:00Z'), fresh('n2', '2026-09-02T00:00:00Z')],
      3,
    )

    expect(order).toEqual(['d1', 'd2', 'n1'])
  })

  // ⚠️ **Due-first is a priority, not a quota.** A reader with forty *cards*
  // due sees no new ones at all, which is the whole point: the backlog is
  // cleared before the backlog is grown.
  it('introduces no new cards when the due half already fills the session', () => {
    const order = compose(
      [due('d1', '2026-09-10T08:00:00Z'), due('d2', '2026-09-11T08:00:00Z')],
      [fresh('n1', '2026-09-01T00:00:00Z')],
      2,
    )

    expect(order).toEqual(['d1', 'd2'])
  })

  // A short *session* is a short *session*. `04` §7.7 holds `review_session.size`
  // rows and the rail's length is that count, so padding would be a rail with
  // ticks nothing can fill.
  it('answers short rather than padding when there is nothing else to study', () => {
    expect(compose([due('d1', '2026-09-10T08:00:00Z')], [], 20)).toEqual(['d1'])
    expect(compose([], [], 20)).toEqual([])
  })

  it('answers empty for a size that is not a size', () => {
    expect(compose([due('d1', '2026-09-10T08:00:00Z')], [], 0)).toEqual([])
    expect(compose([due('d1', '2026-09-10T08:00:00Z')], [], -1)).toEqual([])
  })
})

// ADR 0066 §5. ⚠️ **This replaced the most-overdue-first rule**, whose comment
// said a *card* three weeks late has decayed further than one due this morning.
// That holds only at equal stability; FSRS can say which is closer to being
// forgotten, and when the backlog is bigger than the run that is the question.
describe('compose — a backlog is ordered by retrievability (ADR 0066 §5)', () => {
  it('takes the least remembered when the due set is larger than the session', () => {
    const { cardIds } = composeRun(
      [
        // Three weeks late, and a long-stability card: still well remembered.
        due('sturdy-and-late', '2026-08-20T08:00:00Z', 0.86),
        due('shaky-yesterday', '2026-09-11T08:00:00Z', 0.41),
        due('middling', '2026-09-01T08:00:00Z', 0.62),
      ],
      [],
      2,
      DAILY_NEW_CARDS,
    )

    expect(cardIds).toEqual(['shaky-yesterday', 'middling'])
  })

  it('breaks a retrievability tie by due, then by id', () => {
    const { cardIds } = composeRun(
      [
        due('b', '2026-09-10T08:00:00Z', 0.5),
        due('late', '2026-09-11T08:00:00Z', 0.5),
        due('a', '2026-09-10T08:00:00Z', 0.5),
        due('best', '2026-09-01T08:00:00Z', 0.9),
      ],
      [],
      3,
      DAILY_NEW_CARDS,
    )

    expect(cardIds).toEqual(['a', 'b', 'late'])
  })

  // When it all fits, retrievability is not consulted: the run holds all of
  // it either way, and the stable order is the one it always had.
  it('keeps due order when the due set fits', () => {
    const { cardIds } = composeRun(
      [due('early', '2026-08-20T08:00:00Z', 0.9), due('later', '2026-09-11T08:00:00Z', 0.1)],
      [],
      20,
      DAILY_NEW_CARDS,
    )

    expect(cardIds).toEqual(['early', 'later'])
  })
})

describe('compose — the brake (ADR 0066)', () => {
  it('is ten a day and fifty due, as constants', () => {
    expect(DAILY_NEW_CARDS).toBe(10)
    expect(NEW_CARDS_PAUSED_ABOVE_DUE).toBe(50)
  })

  it('caps the new half at the allowance', () => {
    const run = composeRun([], freshMany(30), 20, 10)

    expect(run.cardIds).toHaveLength(10)
    expect(run.newCount).toBe(10)
  })

  it('composes a due-only run on a zero allowance', () => {
    const run = composeRun(dueMany(3), freshMany(5), 20, 0)

    expect(run.cardIds).toEqual(['d000', 'd001', 'd002'])
    expect(run.newCount).toBe(0)
  })

  // ⚠️ **A short run is a short run.** Three due and an allowance of four is a
  // run of seven, not a run of twenty topped up with new *cards* the day has
  // not got room for.
  it('does not backfill a short due half past the allowance', () => {
    const run = composeRun(dueMany(3), freshMany(30), 20, 4)

    expect(run.cardIds).toHaveLength(7)
    expect(run.newCount).toBe(4)
  })

  it('counts only the new cards it chose', () => {
    expect(composeRun(dueMany(18), freshMany(30), 20, 10).newCount).toBe(2)
  })

  // ⚠️ **The gate is over the whole due set, not the session**, and it wins
  // over whatever the day has left.
  it('composes no new cards at all at fifty due, whatever the allowance', () => {
    const run = composeRun(dueMany(50), freshMany(5), 200, 10)

    expect(run.newCount).toBe(0)
    expect(run.cardIds).toHaveLength(50)
  })

  it('still introduces new cards at forty-nine due', () => {
    expect(composeRun(dueMany(49), freshMany(5), 200, 10).newCount).toBe(5)
  })

  it('reads a negative allowance as none', () => {
    expect(composeRun([], freshMany(5), 20, -3).newCount).toBe(0)
  })

  // ADR 0066 §6. Nothing caps the cure: three runs of twenty in an evening
  // are three runs of twenty.
  it('never caps the due half', () => {
    const backlog = dueMany(300)

    expect(composeRun(backlog, [], 20, 0).cardIds).toHaveLength(20)
    expect(composeRun(backlog.slice(20), [], 20, 0).cardIds).toHaveLength(20)
    expect(composeRun(backlog.slice(40), [], 20, 0).cardIds).toHaveLength(20)
  })
})

// ⚠️ `04` §7.7's `UNIQUE (review_session_id, card_id)`. Nothing in the schema
// can hand the same *card* to both lists — a new *card* is one with no live
// epoch and a due one has exactly one — so this is guarding the query changing
// underneath, and the alternative is the whole compose failing on a unique
// violation with the *session* half written.
describe('compose — a card appears once per session (`04` §7.7)', () => {
  it('keeps the due position and drops the duplicate', () => {
    const order = compose(
      [due('shared', '2026-09-10T08:00:00Z')],
      [fresh('shared', '2026-09-01T00:00:00Z'), fresh('n1', '2026-09-02T00:00:00Z')],
      20,
    )

    expect(order).toEqual(['shared', 'n1'])
  })

  it('counts a duplicate once against size', () => {
    const order = compose(
      [due('shared', '2026-09-10T08:00:00Z')],
      [fresh('shared', '2026-09-01T00:00:00Z'), fresh('n1', '2026-09-02T00:00:00Z')],
      2,
    )

    expect(order).toEqual(['shared', 'n1'])
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
