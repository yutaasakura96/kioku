// The request parser for the two *Review* endpoints — the same rule as
// `shared/vet/decision.ts`: a *mode* has a client, the client is a file anybody
// can read, and a typed column validates nothing at runtime (`03` §2.3).
//
// ⚠️ **This is not `03` §8.2's grade validator**, which rejects a stamp in the
// future beyond a skew allowance and one before its own snapshot. ⚠️ **Built
// 2026-09-12 with #13** and it is still its own seam — `shared/review/stamp.ts`
// and `test/unit/review-stamp.test.ts`. The difference is the one this file is
// about: a `reviewed_at` that is not a date at all cannot reach a `timestamptz`,
// and that is a shape; whether a date the server cannot trust may be recorded is
// a rule.

import { describe, expect, it } from 'vitest'

import { parseFlag, parseGrade, parseSessionSize } from '../../shared/review/request'

const SESSION = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const CARD = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c'

const body = (overrides: Record<string, unknown> = {}) => ({
  sessionId: SESSION,
  cardId: CARD,
  grade: 3,
  reviewedAt: '2026-09-12T09:00:00.000Z',
  ...overrides,
})

describe('parseGrade', () => {
  it('takes a grade', () => {
    const parsed = parseGrade(body())

    expect(parsed).toEqual({
      ok: true,
      grade: {
        sessionId: SESSION,
        cardId: CARD,
        grade: 3,
        reviewedAt: new Date('2026-09-12T09:00:00.000Z'),
      },
    })
  })

  it.each([
    [undefined, 'not_an_object'],
    ['a grade', 'not_an_object'],
    [[], 'not_an_object'],
  ] as const)('refuses %s', (value, code) => {
    expect(parseGrade(value)).toEqual({ ok: false, code })
  })

  it('refuses an id that is not one', () => {
    expect(parseGrade(body({ sessionId: 'latest' }))).toEqual({ ok: false, code: 'bad_session_id' })
    expect(parseGrade(body({ cardId: 42 }))).toEqual({ ok: false, code: 'bad_card_id' })
  })

  // ⚠️ `Manual = 0` is excluded from `ts-fsrs`'s own `Grade` type and `5` has
  // never been a rating (verification §1.1); `04` §7.5 says the same as a
  // `CHECK`. The library throws on one, so it is refused before it is a row.
  it.each([0, 5, -1, 2.5, '3', null])('refuses the grade %s', (grade) => {
    expect(parseGrade(body({ grade }))).toEqual({ ok: false, code: 'bad_grade' })
  })

  it.each([1, 2, 3, 4])('takes the grade %i', (grade) => {
    expect(parseGrade(body({ grade }))).toMatchObject({ ok: true, grade: { grade } })
  })

  // ⚠️ **An absent stamp is refused rather than defaulted to `now()`.** The
  // server never stamps a *grade* on receipt (`03` §8.1), and one quietly
  // stamped here would be ADR 0007's failure arriving as a success.
  it.each([undefined, null, 0, 'yesterday', ''])('refuses the stamp %s', (reviewedAt) => {
    expect(parseGrade(body({ reviewedAt }))).toEqual({ ok: false, code: 'bad_reviewed_at' })
  })
})

// `04` §7.6's `CHECK (size > 0 AND size <= 200)`, on the server side of the wire.
describe('parseSessionSize', () => {
  it('takes a size inside the bounds', () => {
    expect(parseSessionSize({ size: 40 })).toBe(40)
  })

  it('clamps one outside them', () => {
    expect(parseSessionSize({ size: 1000 })).toBe(200)
    expect(parseSessionSize({ size: 0 })).toBe(1)
  })

  // ⚠️ `09` §4.7: a first-ever *session* is twenty *cards* with no chance to
  // change it, because the knob has nowhere to live before a *session* exists.
  it('is twenty when nothing was sent', () => {
    expect(parseSessionSize({})).toBe(20)
    expect(parseSessionSize(undefined)).toBe(20)
  })
})

// `S9`'s `X`. ⚠️ **It carries no stamp**, which is the visible difference
// between the outbox's two entry types: `card_flag.flagged_at` defaults to
// `now()` (`04` §7.8) and nothing computes anything from it, while a *grade*'s
// stamp is arithmetic the server cannot reconstruct (ADR 0007).
describe('the flag (`S9`, `04` §7.8)', () => {
  it('takes a session and a card and nothing else', () => {
    const parsed = parseFlag({ sessionId: SESSION, cardId: CARD, reviewedAt: 'ignored' })

    expect(parsed).toEqual({ ok: true, flag: { sessionId: SESSION, cardId: CARD } })
  })

  it.each([
    ['not an object', 'x', 'not_an_object'],
    ['a card id that is not one', { sessionId: SESSION, cardId: 'card-1' }, 'bad_card_id'],
    ['a session id that is not one', { sessionId: 'run-1', cardId: CARD }, 'bad_session_id'],
  ])('refuses %s', (_, body, code) => {
    expect(parseFlag(body)).toEqual({ ok: false, code })
  })
})
