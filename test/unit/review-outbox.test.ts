// The outbox — ADR 0039's five properties, at the seam where three of them are
// arithmetic over a list rather than a thing a browser does.
//
// ⚠️ **Property 3 has to hold across two entry types in one stream** (`11`
// §6.3): the ordering that matters is a flag landing after a *grade* for a
// **different** *card*, and a stream that made the two one type would have
// nothing to assert. Half of this file is that one sentence.
//
// ⚠️ **What is deliberately absent is a deduplicate.** PRD §5: the same *card*
// graded twice replays twice. A test that asserted the outbox collapsed them
// would be asserting the conflict resolution ADR 0007 says does not exist.

import { describe, expect, it } from 'vitest'

import { append, head, parseOutbox, settle, unsentAnswers } from '../../shared/review/outbox'
import type { OutboxEntry } from '../../shared/review/outbox'

const SESSION = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const OTHER_SESSION = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99'

const grade = (cardId: string, value: 1 | 2 | 3 | 4, reviewedAt = '2026-09-12T09:00:00.000Z') =>
  ({ kind: 'grade', sessionId: SESSION, cardId, grade: value, reviewedAt }) as const

const flag = (cardId: string) => ({ kind: 'flag', sessionId: SESSION, cardId }) as const

function stream(...drafts: Parameters<typeof append>[1][]): OutboxEntry[] {
  return drafts.reduce<OutboxEntry[]>((entries, draft) => append(entries, draft), [])
}

describe('append-only, and in order (ADR 0007, ADR 0039 property 3)', () => {
  it('numbers entries in the order they were given', () => {
    const entries = stream(grade('a', 3), flag('b'), grade('c', 1))

    expect(entries.map(entry => entry.seq)).toEqual([1, 2, 3])
    expect(entries.map(entry => entry.kind)).toEqual(['grade', 'flag', 'grade'])
  })

  // ⚠️ The distinction the two entry types exist for: a flag after a *grade* for
  // a different *card* replays after it, and nothing anywhere reorders them.
  it('replays a flag behind the grade it followed, for a different card', () => {
    const entries = stream(grade('a', 3), flag('b'))

    expect(head(entries)).toMatchObject({ kind: 'grade', cardId: 'a' })
    expect(head(settle(entries, 1))).toMatchObject({ kind: 'flag', cardId: 'b' })
  })

  // ⚠️ PRD §5: *the same card graded twice — both replay*. The outbox is not
  // where that is resolved, because it is not resolved anywhere.
  it('keeps both grades for one card rather than merging them', () => {
    const entries = stream(
      grade('a', 1, '2026-09-12T09:00:00.000Z'),
      grade('a', 4, '2026-09-12T09:02:00.000Z'),
    )

    expect(entries).toHaveLength(2)
    expect(entries.map(entry => entry.kind === 'grade' && entry.grade)).toEqual([1, 4])
  })

  it('appends without reading what is already there', () => {
    const before = stream(grade('a', 3))
    const after = append(before, flag('a'))

    expect(before).toHaveLength(1)
    expect(after).toHaveLength(2)
  })
})

describe('settling — by seq, because the reader keeps answering', () => {
  it('removes the entry the server answered about and leaves the rest in order', () => {
    const entries = stream(grade('a', 3), grade('b', 2), flag('c'))

    expect(settle(entries, 1).map(entry => entry.cardId)).toEqual(['b', 'c'])
  })

  // ⚠️ The failure this shape prevents: two more *grades* land behind the one in
  // flight, and "drop the head" drops a *grade* the server never saw.
  it('does not drop whichever entry happens to be at the front', () => {
    const inFlight = head(stream(grade('a', 3)))!
    const grown = stream(grade('a', 3), grade('b', 2), grade('c', 4))

    expect(settle(grown, inFlight.seq).map(entry => entry.cardId)).toEqual(['b', 'c'])
  })

  it('is a no-op for an entry that is already gone', () => {
    const entries = stream(grade('a', 3))

    expect(settle(settle(entries, 1), 1)).toEqual([])
  })
})

describe('what a resumed run inherits (ADR 0039 property 4, ADR 0014)', () => {
  // ⚠️ Without this a reload underground re-asks a *card* the reader already
  // answered, and PRD §5's two-devices edge case becomes what a refresh does.
  it('answers a card whose grade is still in the stream', () => {
    const answers = unsentAnswers(stream(grade('a', 3), flag('b')), SESSION)

    expect(answers.get('a')).toBe(3)
    expect(answers.get('b')).toBe('flagged')
  })

  it('takes the later entry when one card has two', () => {
    const entries = stream(grade('a', 1), grade('a', 4))

    expect(unsentAnswers(entries, SESSION).get('a')).toBe(4)
  })

  it('ignores entries owed by another run', () => {
    const entries = append(stream(grade('a', 3)), {
      kind: 'grade',
      sessionId: OTHER_SESSION,
      cardId: 'z',
      grade: 2,
      reviewedAt: '2026-09-12T09:00:00.000Z',
    })

    expect([...unsentAnswers(entries, SESSION).keys()]).toEqual(['a'])
  })
})

describe('reading the stream back out of storage', () => {
  it('round-trips through JSON', () => {
    const entries = stream(grade('a', 3), flag('b'))

    expect(parseOutbox(JSON.parse(JSON.stringify(entries)))).toEqual(entries)
  })

  // ⚠️ A half-written value is what a closing tab leaves, and refusing the whole
  // stream over one would lose every *grade* behind it.
  it('drops a malformed entry and replays the rest', () => {
    const entries = stream(grade('a', 3), flag('b'))
    const damaged = [{ seq: 0, kind: 'grade', sessionId: SESSION }, ...entries]

    expect(parseOutbox(damaged).map(entry => entry.cardId)).toEqual(['a', 'b'])
  })

  it.each([
    ['a rating outside the four', { seq: 1, kind: 'grade', sessionId: SESSION, cardId: 'a', grade: 5, reviewedAt: '2026-09-12T09:00:00.000Z' }],
    ['a stamp that is not a date', { seq: 1, kind: 'grade', sessionId: SESSION, cardId: 'a', grade: 3, reviewedAt: 'yesterday' }],
    ['an entry kind nothing sends', { seq: 1, kind: 'undo', sessionId: SESSION, cardId: 'a' }],
    ['no sequence number', { kind: 'flag', sessionId: SESSION, cardId: 'a' }],
  ])('refuses %s', (_, entry) => {
    expect(parseOutbox([entry])).toEqual([])
  })

  it('answers an empty stream for anything that is not a list', () => {
    expect(parseOutbox(null)).toEqual([])
    expect(parseOutbox('[]')).toEqual([])
  })
})
