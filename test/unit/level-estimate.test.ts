import { describe, expect, it } from 'vitest'

import { estimateLevel, progressToward, statusOf, withdrawnLevels } from '../../shared/level/estimate'
import type { LevelEvidence } from '../../shared/level/estimate'
import { interleave, spotCheckDues, tallyChecks } from '../../shared/level/spot-check'
import { knownEpoch, schedule } from '../../shared/review/scheduler'
import { stageOfEpoch } from '../../shared/review/stage'
import {
  ESTIMATE_WINDOW_DAYS,
  PROVED_MIN_WORDS,
  PROVED_RIGHT_SHARE,
  SPOT_CHECKS_DECIDE_AFTER,
  SPOT_CHECKS_PER_DAY,
  SPOT_CHECKS_PER_LEVEL,
} from '../../shared/level/thresholds'

// ADR 0079 §2 to §4 — *Your level*, and the spot-check. The tests read the
// thresholds rather than restating them, so moving one moves the cases with it;
// the first case pins the values #67 proposed.

/** `words` words answered once each, `share` of them right. */
const evidence = (level: string, words: number, share: number): LevelEvidence =>
  ({ level, words, answers: words, right: Math.round(words * share) })

describe('the thresholds', () => {
  it('are the proposal on #67: 80 % right across 50 words in 30 days', () => {
    expect(PROVED_RIGHT_SHARE).toBe(0.8)
    expect(PROVED_MIN_WORDS).toBe(50)
    expect(ESTIMATE_WINDOW_DAYS).toBe(30)
    expect(SPOT_CHECKS_PER_LEVEL).toBe(10)
    expect(SPOT_CHECKS_PER_DAY).toBe(2)
    expect(SPOT_CHECKS_DECIDE_AFTER).toBe(5)
  })
})

describe('statusOf — the rule', () => {
  it('proves a level at 80 % across 50 words, and not one word fewer', () => {
    expect(statusOf(evidence('N5', PROVED_MIN_WORDS, PROVED_RIGHT_SHARE), false)).toBe('proved')
    expect(statusOf(evidence('N5', PROVED_MIN_WORDS - 1, 1), false)).toBe('open')
  })

  it('does not prove a level just under 80 %, and disproves it', () => {
    expect(statusOf({ level: 'N5', words: 50, answers: 100, right: 79 }, false)).toBe('disproved')
    expect(statusOf({ level: 'N5', words: 50, answers: 100, right: 80 }, false)).toBe('proved')
  })

  it('counts answers for the share and distinct words for the fifty', () => {
    // Ten words answered ten times each is a hundred answers and ten words.
    expect(statusOf({ level: 'N5', words: 10, answers: 100, right: 100 }, false)).toBe('open')
  })

  it('lets the placement stand for a level with fewer than fifty words', () => {
    expect(statusOf(evidence('N5', 10, 0.2), true)).toBe('placed')
    expect(statusOf(undefined, true)).toBe('placed')
  })

  it('lets fifty words of results overrule the placement', () => {
    expect(statusOf(evidence('N5', 60, 0.5), true)).toBe('disproved')
  })
})

describe('estimateLevel', () => {
  it('has no estimate for a reader with nothing', () => {
    const estimate = estimateLevel([], null)

    expect(estimate).toMatchObject({ level: null, next: 'N5', progress: 0, source: 'none', placedOut: [] })
    expect(estimate.why).toBe('No estimate yet. Take the placement test, or just start studying and it will appear after about 50 answers.')
  })

  it('is the level proved, working toward the next — the prototype\'s three weeks in', () => {
    const estimate = estimateLevel([evidence('N5', 120, 0.94), evidence('N4', 60, 0.68)], null)

    expect(estimate).toMatchObject({ level: 'N5', next: 'N4', source: 'results' })
    expect(estimate.progress).toBeCloseTo(0.68 / 0.8, 2)
    expect(estimate.why).toBe('You get N5 words right 94% of the time and N4 words 68% of the time. Reach 80% on N4 to move up.')
  })

  it('measures progress as the less complete of the two conditions', () => {
    expect(progressToward(evidence('N4', 10, 1))).toBeCloseTo(10 / 50)
    expect(progressToward(evidence('N4', 100, 0.4))).toBeCloseTo(0.5)
    expect(progressToward(evidence('N4', 100, 0.9))).toBe(1)
    expect(progressToward(undefined)).toBe(0)
  })

  it('says how many more words a level needs', () => {
    const estimate = estimateLevel([evidence('N5', 120, 0.9), evidence('N4', 20, 0.9)], null)

    expect(estimate.why).toBe('You get N5 words right 90% of the time and N4 words 90% of the time. Reach 80% across 50 N4 words to move up (20 so far).')
  })

  it('starts from the placement and marks the levels below the start as placed out', () => {
    const estimate = estimateLevel([], { kind: 'test', level: 'N4' })

    expect(estimate).toMatchObject({ level: 'N4', next: 'N3', source: 'placement', placedOut: ['N5', 'N4'] })
    expect(estimate.why).toBe('From your placement test. It will sharpen as you answer lessons and reviews.')
  })

  it('names a declared placement as the level the reader chose', () => {
    expect(estimateLevel([], { kind: 'declared', level: 'N5' }).why)
      .toBe('From the level you chose to start at. It will sharpen as you answer lessons and reviews.')
  })

  it('keeps a test that placed at none as the estimate\'s source', () => {
    const estimate = estimateLevel([], { kind: 'test', level: null })

    expect(estimate).toMatchObject({ level: null, next: 'N5', placedOut: [] })
    expect(estimate.why).toBe('From your placement test. It will sharpen as you answer lessons and reviews.')
  })

  it('places a reader at N1 at the top, with the four levels below it placed out', () => {
    const estimate = estimateLevel([], { kind: 'test', level: 'N1' })

    expect(estimate).toMatchObject({ level: 'N1', next: null, progress: 1, placedOut: ['N5', 'N4', 'N3', 'N2'] })
  })

  it('moves up from the placement once the next level is proved', () => {
    const estimate = estimateLevel([evidence('N3', 55, 0.85)], { kind: 'test', level: 'N4' })

    expect(estimate).toMatchObject({ level: 'N3', next: 'N2', source: 'results' })
  })

  it('moves down from the placement when results disprove a placed level', () => {
    const estimate = estimateLevel([evidence('N4', 60, 0.5)], { kind: 'test', level: 'N3' })

    expect(estimate).toMatchObject({ level: 'N5', next: 'N4', source: 'placement' })
  })

  it('stops placed-out levels below a disproved N4 after placing at N3', () => {
    const estimate = estimateLevel([evidence('N4', 50, 0.6)], { kind: 'test', level: 'N3' })

    expect(estimate.placedOut).toEqual(['N5'])
  })

  it('does not hold an unanswered easier level against a proved harder one', () => {
    expect(estimateLevel([evidence('N4', 60, 0.9)], null)).toMatchObject({ level: 'N4', next: 'N3' })
  })

  it('stops at a disproved level even when a harder one is proved', () => {
    expect(estimateLevel([evidence('N5', 60, 0.5), evidence('N4', 60, 0.9)], null)).toMatchObject({ level: null, next: 'N5' })
  })
})

describe('the spot-check', () => {
  it('withdraws a placed level once five checks are answered under 80 %', () => {
    expect(withdrawnLevels([{ level: 'N5', answered: SPOT_CHECKS_DECIDE_AFTER, right: 3 }])).toEqual(['N5'])
    expect(withdrawnLevels([{ level: 'N5', answered: SPOT_CHECKS_DECIDE_AFTER, right: 4 }])).toEqual([])
    expect(withdrawnLevels([{ level: 'N5', answered: SPOT_CHECKS_DECIDE_AFTER - 1, right: 0 }])).toEqual([])
  })

  it('takes the placement away from the withdrawn level and every level above it', () => {
    const estimate = estimateLevel([], { kind: 'test', level: 'N3' }, [{ level: 'N4', answered: 6, right: 2 }])

    expect(estimate).toMatchObject({ level: 'N5', next: 'N4', source: 'placement', placedOut: ['N5'], withdrawn: ['N4'] })
    expect(estimate.why).toBe('Your spot-checks of N4 words were under 80% right, so the placement no longer counts for that level. From your placement test. It will sharpen as you answer lessons and reviews.')
  })

  it('leaves no estimate when the easiest placed level is withdrawn', () => {
    const estimate = estimateLevel([], { kind: 'test', level: 'N4' }, [{ level: 'N5', answered: 5, right: 1 }])

    expect(estimate).toMatchObject({ level: null, next: 'N5', placedOut: [] })
  })

  it('counts each checked word\'s first answer only', () => {
    const at = (day: number) => new Date(Date.UTC(2026, 9, day))

    expect(tallyChecks([
      { cardId: 'a', level: 'N5', rating: 3, reviewedAt: at(2) },
      { cardId: 'b', level: 'N5', rating: 1, reviewedAt: at(2) },
      // b's later answers are about learning it, not about the placement.
      { cardId: 'b', level: 'N5', rating: 3, reviewedAt: at(3) },
      { cardId: 'b', level: 'N5', rating: 3, reviewedAt: at(6) },
      { cardId: 'c', level: 'N4', rating: 3, reviewedAt: at(4) },
    ])).toEqual([{ level: 'N5', answered: 2, right: 1 }, { level: 'N4', answered: 1, right: 1 }])
  })

  it('takes each level\'s sample in turns', () => {
    expect(interleave([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']])).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3'])
  })

  it('brings two checks due a day, from the day after the placement', () => {
    const placedAt = new Date('2026-10-15T09:00:00Z')
    const dues = spotCheckDues(5, placedAt)

    expect(dues.map(due => due.toISOString())).toEqual([
      '2026-10-16T09:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
      '2026-10-17T09:00:00.000Z',
      '2026-10-17T09:00:00.000Z',
      '2026-10-18T09:00:00.000Z',
    ])
  })

  it('marks a checked word Known and due on its day, and lets the scheduler take it from there', () => {
    const placedAt = new Date('2026-10-15T09:00:00Z')
    const due = new Date('2026-10-17T09:00:00Z')
    const epoch = knownEpoch(placedAt, due)

    expect(stageOfEpoch(epoch)).toBe('known')
    expect(epoch).toMatchObject({ due, state: 2, reps: 0, lapses: 0, lastReview: placedAt, scheduledDays: 2 })

    // Right first try keeps it Known; a miss takes it down to Learning.
    expect(stageOfEpoch(schedule(epoch, 3, due).epoch)).toBe('known')
    expect(stageOfEpoch(schedule(epoch, 1, due).epoch)).toBe('learning')
  })
})
