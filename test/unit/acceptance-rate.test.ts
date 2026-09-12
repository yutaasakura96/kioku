// *Acceptance rate* — `11` §3's first row, whose *failure it catches* column
// reads **the most likely arithmetic error in the app, and the one that would
// flatter the thesis**.
//
// Both of the ways to get it wrong bias it the same direction, **up**:
//
// - ⚠️ **Counting an edited accept as an acceptance.** `S6` says it is an edit.
//   The number exists to answer *did the pipeline write cards worth keeping as
//   they came*, and a *note* the reader had to fix is a *note* the pipeline got
//   wrong — cheaply wrong rather than expensively wrong, but wrong.
// - ⚠️ **Dividing by the *notes* the reader has looked at.** `01` §5 wrote the
//   denominator as *cards generated*, and every *pending note* is a generated
//   *note* nobody has judged yet. Dividing by the decided ones scores a run
//   that stopped after the six good ones as a hundred percent.
//
// ⚠️ **No test here asserts a floor**, and the absence is ADR 0037 and ADR 0018:
// the model is walked *down* until *acceptance rate* degrades, so the number has
// to be free to fall. What is asserted is the arithmetic.

import { describe, expect, it } from 'vitest'

import { acceptanceRate, notesGenerated } from '../../shared/metrics/acceptance'

/** A run with nothing in it, to be overridden one field at a time. */
const NONE = { acceptedUnedited: 0, acceptedWithEdit: 0, rejected: 0, pending: 0 }

describe('the numerator — `S6`\'s edited accept', () => {
  it('counts an unedited accept', () => {
    expect(acceptanceRate({ ...NONE, acceptedUnedited: 4 })).toBe(1)
  })

  // ⚠️ The whole point. An edited accept is in the denominator and not in the
  // numerator, so ten accepts of which nine were fixed is 10%, not 100%.
  it('counts an edited accept as an edit, not as an acceptance', () => {
    expect(acceptanceRate({ ...NONE, acceptedUnedited: 1, acceptedWithEdit: 9 })).toBe(0.1)
  })

  it('is zero when every accept was edited', () => {
    expect(acceptanceRate({ ...NONE, acceptedWithEdit: 3 })).toBe(0)
  })
})

describe('the denominator — notes generated, not notes seen', () => {
  it('counts a rejection', () => {
    expect(acceptanceRate({ ...NONE, acceptedUnedited: 3, rejected: 1 })).toBe(0.75)
  })

  // ⚠️ The near-miss implementation, and it is the flattering one: a run
  // abandoned after the good *notes* would otherwise score a hundred percent.
  it('counts a note still pending', () => {
    expect(acceptanceRate({ ...NONE, acceptedUnedited: 3, pending: 1 })).toBe(0.75)
  })

  it('is every note the pipeline produced', () => {
    expect(notesGenerated({ acceptedUnedited: 3, acceptedWithEdit: 2, rejected: 4, pending: 11 }))
      .toBe(20)
  })
})

describe('the two edges', () => {
  // ⚠️ **`null`, not zero.** No *notes* generated is *there is no rate*, and 0%
  // is a claim about a pipeline that produced nothing usable — the reading a
  // reader would take from a figure grid showing `0%` before their first paste.
  it('has no rate before anything has been generated', () => {
    expect(acceptanceRate(NONE)).toBeNull()
  })

  it('has a rate as soon as one note exists, even unjudged', () => {
    expect(acceptanceRate({ ...NONE, pending: 1 })).toBe(0)
  })
})
