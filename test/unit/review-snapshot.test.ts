// ⚠️ **The snapshot wins** (PRD §5, `S7`, `S8`) — *a note edited while its card
// is in the current session shows the old text, and the next session picks up
// the change*.
//
// The mechanism is the prefetch: the whole run arrives at `09` §4.7 step 3 and
// the client never re-reads a field. **What could break it is not an edit — it
// is the answer to a *grade*.** Every *grade* is answered with a fresh snapshot
// so the client's counts cannot drift from the database, and `snapshotOf` reads
// `note.fields` live, because `04` §7.7 snapshots membership and nothing else.
// Installing that answer wholesale re-reads the text mid-run.
//
// ⚠️ **It is unreachable today, and that is the reason to assert it rather than
// not.** An *accepted* *note*'s fields are frozen against every writer
// (ADR 0052) and a *card* exists only for an accepted *note* — so the freeze is
// currently doing the prefetch's job, and the day `S9`'s re-vetting lifts it
// (#13) this rule has to be already true.

import { describe, expect, it } from 'vitest'

import { isAnswered, isFinished, mergeGrades, parseSnapshot } from '../../shared/review/snapshot'
import type { ReviewSnapshot } from '../../shared/review/snapshot'

const snapshot = (
  positions: { cardId: string, meaning: string, grade: 1 | 2 | 3 | 4 | null, flagged?: boolean }[],
): ReviewSnapshot => ({
  sessionId: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  size: positions.length,
  snapshotTakenAt: new Date('2026-09-12T09:00:00Z'),
  positions: positions.map((position, ordinal) => ({
    ordinal,
    cardId: position.cardId,
    templateKey: 'recognition',
    fields: { term: '図書館', meaning: position.meaning },
    grade: position.grade,
    flagged: position.flagged ?? false,
  })),
})

describe('mergeGrades — the grades move, the words do not', () => {
  it('keeps the text the reader was handed when the answer carries a newer one', () => {
    const held = snapshot([
      { cardId: 'a', meaning: 'library', grade: 3 },
      { cardId: 'b', meaning: 'meeting', grade: null },
    ])
    const fresh = snapshot([
      { cardId: 'a', meaning: 'library', grade: 3 },
      { cardId: 'b', meaning: 'a meeting — corrected', grade: null },
    ])

    const merged = mergeGrades(held, fresh)

    expect(merged.positions[1]!.fields.meaning).toBe('meeting')
  })

  it('takes a grade the server knows about and the client does not', () => {
    const held = snapshot([{ cardId: 'a', meaning: 'library', grade: null }])
    const fresh = snapshot([{ cardId: 'a', meaning: 'library', grade: 2 }])

    expect(mergeGrades(held, fresh).positions[0]!.grade).toBe(2)
  })

  // ⚠️ The client paints on the keystroke and the answer arrives after it, so a
  // snapshot that has not yet been told about the last *grade* must not un-grade
  // the position the reader has already left.
  it('never takes a grade back', () => {
    const held = snapshot([{ cardId: 'a', meaning: 'library', grade: 4 }])
    const fresh = snapshot([{ cardId: 'a', meaning: 'library', grade: null }])

    expect(mergeGrades(held, fresh).positions[0]!.grade).toBe(4)
  })

  // ⚠️ Membership is decided once, at compose (`04` §7.7). Appending would
  // lengthen the *progress rail* mid-run, which is the one thing ADR 0016 turned
  // short-term scheduling off to prevent.
  it('ignores a card the run does not hold', () => {
    const held = snapshot([{ cardId: 'a', meaning: 'library', grade: null }])
    const fresh = snapshot([
      { cardId: 'a', meaning: 'library', grade: 3 },
      { cardId: 'c', meaning: 'elsewhere', grade: 1 },
    ])

    const merged = mergeGrades(held, fresh)

    expect(merged.positions).toHaveLength(1)
    expect(merged.size).toBe(1)
  })

  it('leaves the session identity and the snapshot instant alone', () => {
    const held = snapshot([{ cardId: 'a', meaning: 'library', grade: null }])
    const fresh = { ...snapshot([{ cardId: 'a', meaning: 'library', grade: 3 }]), size: 99 }

    const merged = mergeGrades(held, fresh)

    expect(merged.sessionId).toBe(held.sessionId)
    expect(merged.snapshotTakenAt).toEqual(held.snapshotTakenAt)
    expect(merged.size).toBe(1)
  })
})

// ⚠️ **`S9`'s flag is the second kind of answer, and #13 is where it arrives.**
// A flagged position is passed but not answered, which is neither of the two
// states the run had before — and the one shape that breaks is a run whose last
// position is flagged: it never completes, and it resumes forever onto a *card*
// the reader has already passed.
describe('a flag is an answer, and it moves the same way a grade does', () => {
  it('takes a flag the server knows about and the client does not', () => {
    const held = snapshot([{ cardId: 'a', meaning: 'library', grade: null }])
    const fresh = snapshot([{ cardId: 'a', meaning: 'library', grade: null, flagged: true }])

    expect(mergeGrades(held, fresh).positions[0]!.flagged).toBe(true)
  })

  it('never takes a flag back', () => {
    const held = snapshot([{ cardId: 'a', meaning: 'library', grade: null, flagged: true }])
    const fresh = snapshot([{ cardId: 'a', meaning: 'library', grade: null }])

    expect(mergeGrades(held, fresh).positions[0]!.flagged).toBe(true)
  })

  it('still keeps the words the reader was handed', () => {
    const held = snapshot([{ cardId: 'a', meaning: 'library', grade: null }])
    const fresh = snapshot([{ cardId: 'a', meaning: 'corrected', grade: null, flagged: true }])

    expect(mergeGrades(held, fresh).positions[0]!.fields.meaning).toBe('library')
  })

  it('counts a flagged position as answered without giving it a grade', () => {
    const [position] = snapshot([{ cardId: 'a', meaning: 'library', grade: null, flagged: true }]).positions

    expect(isAnswered(position!)).toBe(true)
    expect(position!.grade).toBeNull()
  })

  // ⚠️ The run that ends on a flag. Nineteen answers out of twenty is a finished
  // *session* (`09` §4.9), and a `completed_at` that stayed null would resume it.
  it('finishes a run whose last position was flagged rather than graded', () => {
    const run = snapshot([
      { cardId: 'a', meaning: 'library', grade: 3 },
      { cardId: 'b', meaning: 'meeting', grade: null, flagged: true },
    ])

    expect(isFinished(run)).toBe(true)
  })

  it('does not finish a run with a position still ahead of the reader', () => {
    const run = snapshot([
      { cardId: 'a', meaning: 'library', grade: null, flagged: true },
      { cardId: 'b', meaning: 'meeting', grade: null },
    ])

    expect(isFinished(run)).toBe(false)
  })
})

// ADR 0014: the snapshot survives a reload, so it survives `JSON.stringify` and
// comes back through this.
describe('reading a snapshot back out of storage (ADR 0014)', () => {
  it('round-trips, with the instant back as a Date', () => {
    const held = snapshot([
      { cardId: 'a', meaning: 'library', grade: 3 },
      { cardId: 'b', meaning: 'meeting', grade: null, flagged: true },
    ])

    const parsed = parseSnapshot(JSON.parse(JSON.stringify(held)))

    expect(parsed).toEqual(held)
    expect(parsed!.snapshotTakenAt).toBeInstanceOf(Date)
  })

  // ⚠️ **The words come back from the store, not from the database**, which is
  // the whole reason a resumed run has a store to come back from.
  it('carries the fields the reader was handed', () => {
    const stored = JSON.parse(JSON.stringify(snapshot([{ cardId: 'a', meaning: 'library', grade: null }])))

    expect(parseSnapshot(stored)!.positions[0]!.fields.meaning).toBe('library')
  })

  // ⚠️ A run with a hole in it is not a shorter run: the rail's length is
  // `review_session.size` and its positions are ordinals, so one dropped member
  // renumbers the rest.
  it('refuses the whole snapshot when one position is malformed', () => {
    const stored = JSON.parse(JSON.stringify(snapshot([
      { cardId: 'a', meaning: 'library', grade: null },
      { cardId: 'b', meaning: 'meeting', grade: null },
    ])))
    stored.positions[1].cardId = 42

    expect(parseSnapshot(stored)).toBeNull()
  })

  it.each([
    ['nothing at all', null],
    ['a string', '{}'],
    ['a snapshot with no instant', { sessionId: 'a', size: 1, positions: [] }],
    ['a rating outside the four', {
      sessionId: 'a',
      size: 1,
      snapshotTakenAt: '2026-09-12T09:00:00.000Z',
      positions: [{ ordinal: 0, cardId: 'a', templateKey: 'recognition', fields: {}, grade: 7 }],
    }],
  ])('refuses %s', (_, stored) => {
    expect(parseSnapshot(stored)).toBeNull()
  })
})
