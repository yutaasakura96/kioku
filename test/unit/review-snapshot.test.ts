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

import { mergeGrades } from '../../shared/review/snapshot'
import type { ReviewSnapshot } from '../../shared/review/snapshot'

const snapshot = (
  positions: { cardId: string, meaning: string, grade: 1 | 2 | 3 | 4 | null }[],
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
