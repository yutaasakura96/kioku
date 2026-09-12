// `10` §5.7's *nothing due* datum, which `05` §4 puts in the "single datum given
// weight" slot — so it is one line of text and it is the whole state.
//
// ⚠️ **The boundary is a calendar one, not twenty-four hours.** A *card* due at
// 08:40 tomorrow reads `Tomorrow` whether it is asked at 23:00 tonight or at
// 07:00 tomorrow, because the reader is reading a date rather than a duration.
// The rounded-milliseconds version of this is wrong twice a year, which is the
// kind of defect that reaches production and stays there.

import { describe, expect, it } from 'vitest'

import { nextDueLabel } from '../../shared/review/next-due'

/** Local time, because the reader's clock is what the label is about. */
const at = (iso: string) => new Date(iso)

const NOW = at('2026-09-12T21:00:00')

describe('nextDueLabel', () => {
  it('names tomorrow by the calendar rather than by the hours between', () => {
    // Eleven hours away, and still tomorrow.
    expect(nextDueLabel(at('2026-09-13T08:40:00'), NOW)).toMatch(/^Tomorrow, /)
  })

  it('does not call twenty-three hours away tomorrow when it is the same day', () => {
    // Asked at 00:30, due at 23:30 — nearly a full day, and still today.
    expect(nextDueLabel(at('2026-09-12T23:30:00'), at('2026-09-12T00:30:00'))).toMatch(/^Today, /)
  })

  // ⚠️ Reachable and not a bug: `04` §11's due query and this screen ask at
  // different instants, so a *card* due in four minutes is genuinely due today
  // and the reader is being told to come back after lunch.
  it('names today for a card due later today', () => {
    expect(nextDueLabel(at('2026-09-12T21:04:00'), NOW)).toMatch(/^Today, /)
  })

  it('names a weekday and a date further out', () => {
    const label = nextDueLabel(at('2026-09-19T08:40:00'), NOW)!

    expect(label).not.toMatch(/^Today|^Tomorrow/)
    expect(label).toContain('Saturday')
    expect(label).toContain('September')
  })

  // A *card* whose `due` has already passed is due now — the empty state is
  // reached at all only because nothing composed, so the honest answer is the
  // soonest one.
  it('names today for a card already overdue', () => {
    expect(nextDueLabel(at('2026-09-12T06:00:00'), NOW)).toMatch(/^Today, /)
  })

  it('answers nothing when there is no next card', () => {
    expect(nextDueLabel(null, NOW)).toBeNull()
    expect(nextDueLabel(new Date('not a date'), NOW)).toBeNull()
  })
})
