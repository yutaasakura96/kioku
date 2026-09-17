// `S10`'s arithmetic — `11` §3 and §8. ⚠️ **Rebuilt by #23** (ADR 0062):
// *acceptance rate* and median *seconds-per-note* are retired and so are their
// tests, and `shared/metrics/acceptance.ts` went with them.
//
// The four things `11` §3's amended table says the suite asserts, and each is a
// describe below:
//
// - ⚠️ **Retention counts only `state = 2`.** A first answer and a relearning
//   answer are both excluded, and each has its own test, because they are two
//   different mistakes: including state 0 counts an answer about nothing
//   retained, and including state 3 lets one act of forgetting count twice.
// - ⚠️ **Consistency is days, in the reader's local day starting 04:00.** The
//   boundary itself is `test/unit/local-day.test.ts`; what is here is that
//   `summarise` uses it and caps the denominator.
// - ⚠️ **Flag rate is distinct *cards*.** The deduplication is SQL's
//   (`test/schema/stats.test.ts`); what is here is that the share cannot exceed
//   one when the query has done its job.
// - ⚠️ **Each ratio is suppressed under its own evidence**, at nineteen and
//   twenty — and ADR 0058 says every value is computed anyway.
//
// ⚠️ **No threshold, anywhere** (ADR 0037, ADR 0018). Nothing here asserts a
// figure clears a floor; every number has to be free to fall.

import { describe, expect, it } from 'vitest'

import {
  CARDS_APPEAR_AT,
  CONSISTENCY_APPEARS_AT,
  RETENTION_APPEARS_AT,
  WINDOW_DAYS,
  consistency,
  costUsd,
  flagRate,
  formatDuration,
  median,
  retention,
  summarise,
} from '../../shared/metrics/stats'
import type { StatsRows } from '../../shared/metrics/stats'

const NOW = new Date('2026-09-17T12:00:00Z')
const CONTEXT = { now: NOW, zone: 'UTC' }

const NOTHING: StatsRows = {
  retention: { recalled: 0, qualifying: 0 },
  gradeMinutes: [],
  firstGradeAt: null,
  flaggedCards: 0,
  cardsMinted: 0,
  timeToFirstReview: [],
  sourcesIngested: 0,
  workerEnvironments: [],
}

function rows(over: Partial<StatsRows> = {}): StatsRows {
  return { ...NOTHING, ...over }
}

/** `n` distinct local days ending on the day before `NOW`'s. */
function studiedOn(days: number): Date[] {
  return Array.from({ length: days }, (_, i) => new Date(NOW.getTime() - i * 86_400_000))
}

describe('retention — the share recalled, over reviews of a card already learned', () => {
  it('divides recalled by qualifying', () => {
    expect(retention({ recalled: 18, qualifying: 20 })).toBe(0.9)
  })

  // ⚠️ **`null`, not zero.** A zero would be a claim that the reader has
  // forgotten everything they have been asked.
  it('is null over nothing, never zero', () => {
    expect(retention({ recalled: 0, qualifying: 0 })).toBeNull()
  })

  it('is zero when everything qualifying was forgotten', () => {
    expect(retention({ recalled: 0, qualifying: 7 })).toBe(0)
  })

  it('appears at twenty qualifying reviews', () => {
    expect(RETENTION_APPEARS_AT).toBe(20)
  })

  // ⚠️ `11` §3's boundary, asserted at both sides — off by default in every
  // naive implementation.
  it('suppresses at nineteen qualifying reviews and reports at twenty', () => {
    expect(summarise(rows({ retention: { recalled: 17, qualifying: 19 } }), CONTEXT).retention.suppressed).toBe(true)
    expect(summarise(rows({ retention: { recalled: 18, qualifying: 20 } }), CONTEXT).retention.suppressed).toBe(false)
  })

  // ⚠️ ADR 0058: suppression is a fact about the screen, so the value is
  // computed anyway — which is the only thing that makes the boundary
  // observable from this seam at all.
  it('computes the value below the boundary as well as above it', () => {
    const view = summarise(rows({ retention: { recalled: 17, qualifying: 19 } }), CONTEXT)

    expect(view.retention.suppressed).toBe(true)
    expect(view.retention.value).toBeCloseTo(17 / 19)
    expect(view.retention.have).toBe(17)
    expect(view.retention.possible).toBe(19)
  })

  // ⚠️ **The qualifying filter is the query's, and this says so.** The counts
  // arrive already restricted to `state = 2`; a test that could tell the
  // difference here would mean the filter had leaked into the arithmetic.
  // `test/schema/stats.test.ts` is where states 0 and 3 are excluded.
  it('takes the qualifying count as given, because the state filter is SQL\'s', () => {
    expect(summarise(rows({ retention: { recalled: 5, qualifying: 5 } }), CONTEXT).retention.possible).toBe(5)
  })
})

describe('consistency — days studied over days there were to study', () => {
  it('appears at fourteen days', () => {
    expect(CONSISTENCY_APPEARS_AT).toBe(14)
  })

  it('divides days studied by days possible', () => {
    expect(consistency({ daysStudied: 12, daysPossible: 30 })).toBe(0.4)
  })

  // ⚠️ **`null` before the first *grade*.** A reader who has never studied is
  // not 0% consistent; there is nothing to be consistent about yet.
  it('is null before the first grade, never zero', () => {
    expect(consistency({ daysStudied: 0, daysPossible: 0 })).toBeNull()
    expect(summarise(NOTHING, CONTEXT).consistency.value).toBeNull()
  })

  it('folds several grades in one sitting into one day', () => {
    const view = summarise(
      rows({
        firstGradeAt: new Date('2026-09-17T09:00:00Z'),
        gradeMinutes: [
          new Date('2026-09-17T09:00:00Z'),
          new Date('2026-09-17T09:04:00Z'),
          new Date('2026-09-17T11:59:00Z'),
        ],
      }),
      CONTEXT,
    )

    expect(view.consistency.have).toBe(1)
    expect(view.consistency.possible).toBe(1)
  })

  // ⚠️ **The denominator is the days since the first *grade* while that is
  // fewer than thirty** (ADR 0062) — which is the difference between a reader
  // three days in reading 3/3 and reading 3/30.
  it('counts days since the first grade while that is fewer than thirty', () => {
    const view = summarise(
      rows({
        firstGradeAt: new Date('2026-09-15T09:00:00Z'),
        gradeMinutes: studiedOn(2),
      }),
      CONTEXT,
    )

    expect(view.consistency.possible).toBe(3)
    expect(view.consistency.have).toBe(2)
  })

  it('caps the denominator at the window', () => {
    const view = summarise(
      rows({ firstGradeAt: new Date('2025-01-01T00:00:00Z'), gradeMinutes: studiedOn(5) }),
      CONTEXT,
    )

    expect(view.consistency.possible).toBe(WINDOW_DAYS)
    expect(view.consistency.have).toBe(5)
  })

  // ⚠️ **The window is trimmed here and not in SQL**, because only this side
  // knows the zone — the query hands over a day more than the window needs.
  it('drops a grade older than the window from the numerator', () => {
    const view = summarise(
      rows({
        firstGradeAt: new Date('2025-01-01T00:00:00Z'),
        gradeMinutes: [NOW, new Date(NOW.getTime() - 30 * 86_400_000)],
      }),
      CONTEXT,
    )

    expect(view.consistency.have).toBe(1)
  })

  it('suppresses at thirteen days possible and reports at fourteen', () => {
    const thirteen = summarise(
      rows({ firstGradeAt: new Date(NOW.getTime() - 12 * 86_400_000), gradeMinutes: studiedOn(3) }),
      CONTEXT,
    )
    const fourteen = summarise(
      rows({ firstGradeAt: new Date(NOW.getTime() - 13 * 86_400_000), gradeMinutes: studiedOn(3) }),
      CONTEXT,
    )

    expect(thirteen.consistency.possible).toBe(13)
    expect(thirteen.consistency.suppressed).toBe(true)
    expect(fourteen.consistency.possible).toBe(14)
    expect(fourteen.consistency.suppressed).toBe(false)
  })

  // ⚠️ **It is not a streak** (ADR 0062). A missed day yesterday does not zero
  // the number, which is the whole reason this metric was chosen.
  it('survives a missed day, which a streak would not', () => {
    const view = summarise(
      rows({
        firstGradeAt: new Date(NOW.getTime() - 13 * 86_400_000),
        // Everything but yesterday.
        gradeMinutes: studiedOn(14).filter((_, index) => index !== 1),
      }),
      CONTEXT,
    )

    expect(view.consistency.value).toBeCloseTo(13 / 14)
  })

  // ⚠️ **The zone has to change the answer, or the assertion is not about the
  // zone.** `/code-review` caught the first version of this test asserting
  // `toBe(1)` for both Tokyo and UTC — which passes with the zone ignored
  // entirely. These two instants are **one** study day in UTC and **two** in
  // Tokyo, because 04:00 in Tokyo is 19:00 UTC the day before.
  it('buckets the days in the zone it is given, and the zone changes the count', () => {
    const later = new Date('2026-09-18T12:00:00Z')
    const gradeMinutes = [
      new Date('2026-09-17T18:00:00Z'), // 03:00 on the 18th in Tokyo — still the 17th
      new Date('2026-09-17T20:00:00Z'), // 05:00 on the 18th in Tokyo — now the 18th
    ]
    const over = rows({ firstGradeAt: gradeMinutes[0], gradeMinutes })

    expect(summarise(over, { now: later, zone: 'UTC' }).consistency.have).toBe(1)
    expect(summarise(over, { now: later, zone: 'Asia/Tokyo' }).consistency.have).toBe(2)
  })

  // ⚠️ **The far end of the window, which the first implementation did not
  // have.** `reviewed_at` is the client's stamp and `03` §8.2 accepts it up to
  // two minutes ahead of the server (ADR 0054), so a *grade* given just before
  // the cutoff on a fast laptop buckets into tomorrow — and consistency read
  // `15 / 14`. `/code-review` found it.
  it('drops a grade stamped into tomorrow rather than reading over one hundred percent', () => {
    const view = summarise(
      rows({
        firstGradeAt: new Date(NOW.getTime() - 13 * 86_400_000),
        gradeMinutes: [...studiedOn(14), new Date(NOW.getTime() + 20 * 60 * 60 * 1000)],
      }),
      CONTEXT,
    )

    expect(view.consistency.have).toBe(14)
    expect(view.consistency.possible).toBe(14)
    expect(view.consistency.value).toBe(1)
  })
})

describe('flag rate — distinct cards flagged, over cards minted', () => {
  it('appears at twenty minted cards', () => {
    expect(CARDS_APPEAR_AT).toBe(20)
  })

  it('divides flagged cards by cards minted', () => {
    expect(flagRate({ flaggedCards: 3, cardsMinted: 12 })).toBe(0.25)
  })

  it('is null before anything has been minted, never zero', () => {
    expect(flagRate({ flaggedCards: 0, cardsMinted: 0 })).toBeNull()
  })

  // ⚠️ **The change from *false-accept rate*.** That figure was deliberately
  // unbounded because a second flag on one *card* was a second row; this one
  // cannot exceed one, because the numerator is distinct *cards* out of the
  // denominator's population.
  it('cannot exceed one when the query has deduplicated', () => {
    expect(flagRate({ flaggedCards: 20, cardsMinted: 20 })).toBe(1)
  })

  it('suppresses at nineteen minted cards and reports at twenty', () => {
    expect(summarise(rows({ cardsMinted: 19, flaggedCards: 2 }), CONTEXT).flagRate.suppressed).toBe(true)
    expect(summarise(rows({ cardsMinted: 20, flaggedCards: 2 }), CONTEXT).flagRate.suppressed).toBe(false)
  })

  it('pairs flagged cards over cards minted', () => {
    const view = summarise(rows({ cardsMinted: 19, flaggedCards: 2 }), CONTEXT)

    expect(view.flagRate.have).toBe(2)
    expect(view.flagRate.possible).toBe(19)
    expect(view.flagRate.value).toBeCloseTo(2 / 19)
  })
})

describe('time to first review — carried over untouched (ADR 0057)', () => {
  it('is the median across sources, taking the mean of the middle two', () => {
    expect(median([3, 5, 7])).toBe(5)
    expect(median([3, 5, 7, 9])).toBe(6)
  })

  it('is null over nothing, never zero', () => {
    expect(median([])).toBeNull()
  })

  it('does not sort the caller\'s array in place', () => {
    const samples = [9, 1, 5]
    median(samples)
    expect(samples).toEqual([9, 1, 5])
  })

  // ⚠️ ADR 0057: a *source* nobody has studied is excluded from the median
  // rather than counted as a long one, and the pair is what keeps that visible.
  it('pairs sources measured over sources ingested', () => {
    const view = summarise(rows({ timeToFirstReview: [120, 240], sourcesIngested: 5, cardsMinted: 20 }), CONTEXT)

    expect(view.timeToFirstReview.value).toBe(180)
    expect(view.timeToFirstReview.have).toBe(2)
    expect(view.timeToFirstReview.possible).toBe(5)
  })

  // ⚠️ **Gated on minted *cards*, not on its own pair** — the old boundary was
  // twenty *vetted notes*, which was the size of the corpus rather than
  // anything about this figure, and *cards minted* is that quantity in the word
  // that still means something after ADR 0064.
  it('is suppressed with the rest below twenty minted cards', () => {
    expect(summarise(rows({ timeToFirstReview: [120], sourcesIngested: 1, cardsMinted: 19 }), CONTEXT).timeToFirstReview.suppressed).toBe(true)
    expect(summarise(rows({ timeToFirstReview: [120], sourcesIngested: 1, cardsMinted: 20 }), CONTEXT).timeToFirstReview.suppressed).toBe(false)
  })

  it('renders under a minute as `<1m` rather than `0m`', () => {
    expect(formatDuration(45)).toBe('<1m')
    expect(formatDuration(600)).toBe('10m')
    expect(formatDuration(3600 * 3 + 600)).toBe('3h 10m')
    expect(formatDuration(86_400 * 3)).toBe('3d')
  })

  it('carries every worker environment behind the measured durations', () => {
    expect(summarise(rows({ workerEnvironments: ['laptop', 'server'] }), CONTEXT).workerEnvironments)
      .toEqual(['laptop', 'server'])
  })
})

describe('cost — read, never estimated', () => {
  it('converts micro-USD to dollars', () => {
    expect(costUsd(1_234_567n)).toBeCloseTo(1.234567)
  })

  // ⚠️ Null in, null out. An *ingestion* with tokens and no recorded cost has
  // no cost, and multiplying by a constant starts lying the day a price moves.
  it('is null when nothing was recorded', () => {
    expect(costUsd(null)).toBeNull()
  })
})

describe('an empty database', () => {
  it('shows no figure at all rather than a screen of zeroes', () => {
    const view = summarise(NOTHING, CONTEXT)

    expect(view.cardsMinted).toBe(0)
    expect(view.retention.value).toBeNull()
    expect(view.consistency.value).toBeNull()
    expect(view.flagRate.value).toBeNull()
    expect(view.timeToFirstReview.value).toBeNull()
  })

  it('suppresses every ratio', () => {
    const view = summarise(NOTHING, CONTEXT)

    expect(view.retention.suppressed).toBe(true)
    expect(view.consistency.suppressed).toBe(true)
    expect(view.flagRate.suppressed).toBe(true)
    expect(view.timeToFirstReview.suppressed).toBe(true)
  })
})
