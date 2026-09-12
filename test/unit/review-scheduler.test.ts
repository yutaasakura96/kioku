// The FSRS wrapper — `11` §8's named seam, and ⚠️ **not FSRS itself.**
// `ts-fsrs` 5.4.2 is a dependency with its own suite; nothing here re-tests the
// arithmetic. What is ours is two things and they are both here: **the mapping
// to and from `scheduling_epoch`**, and **the configuration**.
//
// ⚠️ The configuration is the half that pays for this file. `enable_short_term`
// off and `enable_fuzz` on is ADR 0016, and a regression in either would surface
// as a worse retention curve in six months rather than as a red test
// (verification §13.1) — with `enable_short_term` back on, a graded *card*
// returns in **minutes**, the *session* stops being a fixed twenty, and the
// *progress rail* stops knowing its own length.

import { describe, expect, it } from 'vitest'

import {
  SCHEDULER_PARAMETERS,
  freshEpoch,
  schedule,
} from '../../shared/review/scheduler'
import type { EpochState } from '../../shared/review/scheduler'

const DAY = 24 * 60 * 60 * 1000

const REVIEWED_AT = new Date('2026-09-12T09:00:00Z')

/** A *card* with months of history behind it — the seed fixture's own numbers. */
const matured: EpochState = {
  due: new Date('2026-09-11T00:00:00Z'),
  stability: 61.4,
  difficulty: 5.2,
  scheduledDays: 63,
  learningSteps: 0,
  reps: 7,
  lapses: 1,
  state: 2,
  lastReview: new Date('2026-07-10T09:00:00Z'),
}

describe('the configuration — ADR 0016, and the regression that is invisible for months', () => {
  it('has short-term scheduling off', () => {
    expect(SCHEDULER_PARAMETERS.enable_short_term).toBe(false)
  })

  // ⚠️ It "lives in the library and costs nothing" (ADR 0016's consequences),
  // which is exactly why nothing else would notice it being turned off.
  it('has fuzz on', () => {
    expect(SCHEDULER_PARAMETERS.enable_fuzz).toBe(true)
  })
})

// ⚠️ **The soonest a graded *card* comes back is tomorrow** (verification
// §13.1). `LongTermScheduler` schedules all four grades in days and
// `next_interval` clamps at `Math.max(1, …)` before fuzz — which is the fact
// that retired the word "Again" (ADR 0034) and the fact that makes a *session* a
// fixed size (ADR 0016).
describe('every grade schedules at least one day out', () => {
  it.each([1, 2, 3, 4] as const)('grade %i on a new card', (rating) => {
    const { epoch } = schedule(freshEpoch(REVIEWED_AT), rating, REVIEWED_AT)

    expect(epoch.due.getTime() - REVIEWED_AT.getTime()).toBeGreaterThanOrEqual(DAY)
  })

  it.each([1, 2, 3, 4] as const)('grade %i on a card with history', (rating) => {
    const { epoch } = schedule(matured, rating, REVIEWED_AT)

    expect(epoch.due.getTime() - REVIEWED_AT.getTime()).toBeGreaterThanOrEqual(DAY)
  })

  // The four are forced strictly increasing inside the library (verification
  // §13.1), so this is a property of the mapping rather than of the arithmetic:
  // if the wrapper ever handed the scheduler the wrong grade, the order goes.
  it('returns the grades in increasing order of interval', () => {
    const due = ([1, 2, 3, 4] as const).map(
      rating => schedule(matured, rating, REVIEWED_AT).epoch.due.getTime(),
    )

    expect(due).toEqual([...due].sort((a, b) => a - b))
    expect(new Set(due).size).toBe(4)
  })
})

describe('the mapping into `scheduling_epoch` (`04` §7.4)', () => {
  it('mints a fresh epoch in the New state with no last review', () => {
    const epoch = freshEpoch(REVIEWED_AT)

    expect(epoch.state).toBe(0)
    expect(epoch.reps).toBe(0)
    expect(epoch.lapses).toBe(0)
    expect(epoch.lastReview).toBeNull()
  })

  // With short-term scheduling off the library "skips the learning phase and
  // moves cards directly into the review state" — so a *card* graded once is in
  // state 2, never 1.
  it('moves a new card straight into Review, never Learning', () => {
    const { epoch } = schedule(freshEpoch(REVIEWED_AT), 3, REVIEWED_AT)

    expect(epoch.state).toBe(2)
    expect(epoch.learningSteps).toBe(0)
    expect(epoch.lastReview).toEqual(REVIEWED_AT)
    expect(epoch.reps).toBe(1)
  })

  // ⚠️ ADR 0034: `Forgot` names the lapse the library itself counts, and
  // `next_again.lapses += 1` is the only thing that increments it.
  it('counts a lapse on grade 1 and on nothing else', () => {
    expect(schedule(matured, 1, REVIEWED_AT).epoch.lapses).toBe(matured.lapses + 1)

    for (const rating of [2, 3, 4] as const)
      expect(schedule(matured, rating, REVIEWED_AT).epoch.lapses).toBe(matured.lapses)
  })

  // ⚠️ **There is no `elapsed_days` column and none may be added** (`04` §7.4,
  // verification §1.2) — it is deprecated and removed in `ts-fsrs` 6.0.0, and
  // the 5.4.2 → 6.0.0 major is a data review rather than a migration precisely
  // because nothing here depends on it. The library's `Card` still carries it,
  // so the mapping is what keeps it out of the database.
  it('carries no `elapsed_days` across the seam', () => {
    const { epoch, log } = schedule(matured, 3, REVIEWED_AT)

    expect(epoch).not.toHaveProperty('elapsed_days')
    expect(log).not.toHaveProperty('elapsed_days')
    expect(log).not.toHaveProperty('last_elapsed_days')
  })
})

describe('the mapping into `review_log` (`04` §7.5)', () => {
  // ⚠️ `04` §7.5 says the `state` column is "the state *before* the grade", and
  // the library agrees — `buildLog` reads `this.current`, which is the card as
  // it arrived. A log written from the *next* card would record every review as
  // having happened in the state it produced, and the optimiser that consumes
  // these rows later cannot be told to ignore that.
  it('records the state the card was in when it was answered', () => {
    const { log } = schedule(freshEpoch(REVIEWED_AT), 3, REVIEWED_AT)

    expect(log.state).toBe(0)
    expect(log.rating).toBe(3)
  })

  it('records the stability and difficulty the card was answered at', () => {
    const { log } = schedule(matured, 2, REVIEWED_AT)

    expect(log.stability).toBe(matured.stability)
    expect(log.difficulty).toBe(matured.difficulty)
    expect(log.scheduledDays).toBe(matured.scheduledDays)
  })

  // ⚠️ **The grade's own stamp travels through**, untouched (ADR 0007, `03`
  // §8.1): a *card* answered at 09:00 underground and flushed at 18:00 must not
  // tell the scheduler that recall took nine hours. The server stamps
  // `received_at` beside it and never over it.
  it('carries the moment the grade was given', () => {
    const stampedAt = new Date('2026-09-12T08:15:30Z')
    const { log } = schedule(matured, 3, stampedAt)

    expect(log.reviewedAt).toEqual(stampedAt)
  })
})
