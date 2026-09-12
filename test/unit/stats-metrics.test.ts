// `11` §3's metric arithmetic — the three numbers and the boundary that
// `shared/metrics/acceptance.ts` deliberately left to #14.
//
// ⚠️ **No test in this file asserts a threshold**, and the absence is ADR 0037
// and ADR 0018 rather than an oversight. ADR 0018 walks the model **down** until
// *acceptance rate* degrades, so every number here has to be free to fall; a
// test that reddens when the median goes to eleven seconds turns the experiment
// into a regression. What is asserted is that the instrument is built correctly.
//
// Each block below is a state the arithmetic gets wrong if it is written the
// obvious way:
//
// - ⚠️ **A median over an even count is the mean of the middle two.** Taking
//   either middle element is right half the time and off by half a sample the
//   rest, and nothing on the screen would show it.
// - ⚠️ **A second flag on the same *card* is a second row** (`11` §3), so
//   *false-accept rate* can exceed one — and a clamp to 100% would hide exactly
//   the corpus `S9` exists to find.
// - ⚠️ **A *source* nobody has studied yet has no *time-to-first-review***, and
//   it is excluded rather than counted as a long one (ADR 0057).
// - ⚠️ **Cost is read, never estimated** (`11` §3, `04` §6.1). An *ingestion*
//   with tokens and no recorded cost has **no** cost, because the alternative is
//   a hard-coded price table that lies silently.

import { describe, expect, it } from 'vitest'

import {
  RATIOS_APPEAR_AT,
  acceptedNotes,
  costUsd,
  falseAcceptRate,
  formatDuration,
  median,
  notesVetted,
  ratiosSuppressed,
  summarise,
} from '../../shared/metrics/stats'
import type { StatsRows } from '../../shared/metrics/stats'

const NO_VETTING = { acceptedUnedited: 0, acceptedWithEdit: 0, rejected: 0, pending: 0 }

const NOTHING: StatsRows = {
  vetting: NO_VETTING,
  secondsPerNote: [],
  flags: 0,
  timeToFirstReview: [],
  sourcesIngested: 0,
  workerEnvironments: [],
}

function rows(overrides: Partial<StatsRows> = {}): StatsRows {
  return { ...NOTHING, ...overrides }
}

describe('median — `S3`\'s seconds-per-note', () => {
  it('is the middle sample on an odd count', () => {
    expect(median([9, 1, 5])).toBe(5)
  })

  // ⚠️ `11` §3 names this one out loud: *an even count takes the mean of the
  // middle two*. Either middle element alone is plausible and wrong.
  it('is the mean of the middle two on an even count', () => {
    expect(median([1, 4, 6, 9])).toBe(5)
  })

  it('does not mutate the samples it was given', () => {
    const samples = [9, 1, 5]
    median(samples)
    expect(samples).toEqual([9, 1, 5])
  })

  // ⚠️ **`null`, not zero** — the same rule `acceptance.ts` gives for a rate
  // before anything is generated. A `0.0` under SECONDS PER NOTE is a claim
  // about a reader who is vetting instantly.
  it('has no median over nothing', () => {
    expect(median([])).toBeNull()
  })
})

describe('false-accept rate — the ratio `S9` exists to move', () => {
  it('is flags over accepted notes', () => {
    expect(falseAcceptRate({ flags: 3, accepted: 12 })).toBe(0.25)
  })

  // ⚠️ A second flag on the same *card* is a second row (`11` §3, ADR 0056), so
  // the numerator is not bounded by the denominator. Clamping would hide the one
  // corpus this number exists to report.
  it('can exceed one, because a card can be flagged twice', () => {
    expect(falseAcceptRate({ flags: 3, accepted: 2 })).toBe(1.5)
  })

  // ⚠️ The denominator is **every** accepted *note*, edited or not. `S6`'s split
  // is about *acceptance rate*; a *note* the reader fixed and accepted is still
  // a *note* they accepted, and a *card* made from it can still be wrong.
  it('counts an edited accept in the denominator', () => {
    const counts = { ...NO_VETTING, acceptedUnedited: 6, acceptedWithEdit: 2 }
    expect(acceptedNotes(counts)).toBe(8)
  })

  it('has no rate before anything has been accepted', () => {
    expect(falseAcceptRate({ flags: 0, accepted: 0 })).toBeNull()
  })
})

describe('notes vetted — what the boundary counts', () => {
  // ⚠️ **Vetted, not generated.** A hundred *pending notes* and nineteen
  // decisions is still suppressed, because what is thin is the evidence rather
  // than the corpus.
  it('is the decided notes, and a pending note is not one', () => {
    expect(notesVetted({ acceptedUnedited: 8, acceptedWithEdit: 3, rejected: 6, pending: 90 }))
      .toBe(17)
  })
})

describe('the suppression boundary — `S10`\'s only branch', () => {
  it('appears at twenty', () => {
    expect(RATIOS_APPEAR_AT).toBe(20)
  })

  // ⚠️ **Nineteen suppresses.** Off by default in every naive implementation,
  // which is why both sides are asserted rather than one.
  it('suppresses at nineteen', () => {
    expect(ratiosSuppressed({ ...NO_VETTING, acceptedUnedited: 19 })).toBe(true)
  })

  it('reports at twenty', () => {
    expect(ratiosSuppressed({ ...NO_VETTING, acceptedUnedited: 20 })).toBe(false)
  })

  it('counts rejections toward it', () => {
    expect(ratiosSuppressed({ ...NO_VETTING, acceptedUnedited: 11, rejected: 9 })).toBe(false)
  })

  it('does not count a pending note toward it', () => {
    expect(ratiosSuppressed({ ...NO_VETTING, acceptedUnedited: 19, pending: 400 })).toBe(true)
  })
})

describe('cost — read from the row, never estimated', () => {
  it('converts micro-USD to dollars', () => {
    expect(costUsd(1_234_567n)).toBeCloseTo(1.234567, 6)
  })

  // ⚠️ `11` §3: *from the API response, never estimated* — a hard-coded price
  // table lies silently, and ADR 0018's has an effective date. An *ingestion*
  // with no recorded cost has no cost, and the screen says so.
  it('has no cost where none was recorded', () => {
    expect(costUsd(null)).toBeNull()
  })

  it('is zero where zero was recorded', () => {
    expect(costUsd(0n)).toBe(0)
  })
})

describe('duration — `CONTEXT.md` measures time-to-first-review in minutes', () => {
  it('reads in minutes under an hour', () => {
    expect(formatDuration(7 * 60 + 30)).toBe('7m')
  })

  it('does not round a real duration down to nothing', () => {
    expect(formatDuration(20)).toBe('<1m')
  })

  it('reads in hours and minutes over an hour', () => {
    expect(formatDuration(2 * 3600 + 14 * 60)).toBe('2h 14m')
  })

  it('reads in days over two days', () => {
    expect(formatDuration(3 * 86_400 + 3600)).toBe('3d')
  })
})

describe('summarise — the six figures, and what each pair is evidence of', () => {
  it('has no figures at all before the first paste', () => {
    const view = summarise(NOTHING)

    expect(view.suppressed).toBe(true)
    expect(view.notesVetted).toBe(0)
    expect(view.acceptance.value).toBeNull()
    expect(view.secondsPerNote.value).toBeNull()
    expect(view.falseAccept.value).toBeNull()
    expect(view.timeToFirstReview.value).toBeNull()
  })

  // ⚠️ **`acceptance.ts` is the arithmetic and this must not re-derive it**
  // (§ Carrying, `11` §8). The counts are #14's; the rate is #11's.
  it('reads acceptance rate through the module that owns it', () => {
    const view = summarise(rows({
      vetting: { acceptedUnedited: 15, acceptedWithEdit: 3, rejected: 2, pending: 0 },
    }))

    expect(view.acceptance.value).toBe(0.75)
    expect(view.acceptance.have).toBe(15)
    expect(view.acceptance.possible).toBe(20)
  })

  // ⚠️ The median is over **unedited accepts only** (`11` §3). The caller passes
  // only those samples; what this asserts is that the pair says how many stamps
  // stand behind the median, so a median over three of twenty is visibly thin.
  it('carries the evidence behind the median, not just the median', () => {
    const view = summarise(rows({
      vetting: { acceptedUnedited: 20, acceptedWithEdit: 0, rejected: 0, pending: 0 },
      secondsPerNote: [3, 5, 7],
    }))

    expect(view.secondsPerNote.value).toBe(5)
    expect(view.secondsPerNote.have).toBe(3)
    expect(view.secondsPerNote.possible).toBe(20)
  })

  // ⚠️ ADR 0057: a *source* nobody has studied has no duration and is excluded
  // from the median — the pair is what keeps that exclusion visible.
  it('excludes a source with no review from the median and says how many', () => {
    const view = summarise(rows({
      vetting: { acceptedUnedited: 20, acceptedWithEdit: 0, rejected: 0, pending: 0 },
      timeToFirstReview: [600, 1200],
      sourcesIngested: 5,
    }))

    expect(view.timeToFirstReview.value).toBe(900)
    expect(view.timeToFirstReview.have).toBe(2)
    expect(view.timeToFirstReview.possible).toBe(5)
  })

  // ⚠️ `03` §12: figures measured against a laptop are not comparable across
  // ADR 0022's move, and the environment rides **on the number**.
  it('carries every environment the duration was measured in, not one of them', () => {
    const view = summarise(rows({ workerEnvironments: ['laptop', 'server'] }))
    expect(view.workerEnvironments).toEqual(['laptop', 'server'])
  })

  it('suppresses every ratio at nineteen and reports at twenty', () => {
    const nineteen = summarise(rows({
      vetting: { acceptedUnedited: 19, acceptedWithEdit: 0, rejected: 0, pending: 0 },
    }))
    const twenty = summarise(rows({
      vetting: { acceptedUnedited: 20, acceptedWithEdit: 0, rejected: 0, pending: 0 },
    }))

    expect(nineteen.suppressed).toBe(true)
    expect(twenty.suppressed).toBe(false)
  })

  // ⚠️ Suppression is about what is **shown**, not about what is computed: the
  // value is there either way, and the screen is what withholds it. Computing it
  // only above the boundary would make the boundary untestable from here.
  it('computes the ratios below the boundary too — the screen is what withholds them', () => {
    const view = summarise(rows({
      vetting: { acceptedUnedited: 2, acceptedWithEdit: 0, rejected: 2, pending: 0 },
      flags: 1,
    }))

    expect(view.suppressed).toBe(true)
    expect(view.acceptance.value).toBe(0.5)
    expect(view.falseAccept.value).toBe(0.5)
  })
})
