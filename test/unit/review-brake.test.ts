// The review-load brake's arithmetic — ADR 0066 §3, §4, §7, and since ADR 0076
// §2 over the reader's own limits rather than two constants.
//
// ⚠️ **The day is `shared/time/local-day.ts`'s**, and `local-day.test.ts` owns
// the boundary itself. What is asserted here is that the allowance is counted
// over *that* day — the case #21 names: 23:50 and 00:10 are one day's
// allowance, 03:50 and 04:10 are two.

import { describe, expect, it } from 'vitest'

import {
  brakeSentence,
  brakeState,
  introducedToday,
  lessonRoom,
  newAllowance,
  newOnOffer,
} from '../../shared/review/brake'
import { DEFAULT_LIMITS } from '../../shared/review/limits'
import type { StudyLimits } from '../../shared/review/limits'

/** ADR 0066's numbers, which are the defaults: five a lesson, ten a day, fifty due. */
const LIMITS = DEFAULT_LIMITS
const limits = (over: Partial<StudyLimits>): StudyLimits => ({ ...DEFAULT_LIMITS, ...over })

const TOKYO = 'Asia/Tokyo'

const composed = (iso: string, newCount: number) => ({ startedAt: new Date(iso), newCount })

describe('introducedToday — sum(new_count) over the sessions composed today', () => {
  it('shares one allowance between 23:50 and 00:10', () => {
    const sessions = [composed('2026-09-17T14:50:00Z', 6)] // 23:50 in Tokyo
    const now = new Date('2026-09-17T15:10:00Z') // 00:10 in Tokyo

    expect(introducedToday(sessions, now, TOKYO)).toBe(6)
  })

  it('gives 04:10 a fresh allowance after 03:50', () => {
    const sessions = [composed('2026-09-17T18:50:00Z', 10)] // 03:50 in Tokyo
    const now = new Date('2026-09-17T19:10:00Z') // 04:10 in Tokyo

    expect(introducedToday(sessions, now, TOKYO)).toBe(0)
  })

  it('adds every run composed today, including an abandoned one', () => {
    const sessions = [
      composed('2026-09-17T23:00:00Z', 4), // 08:00 on the 18th
      composed('2026-09-18T03:00:00Z', 3), // 12:00
      composed('2026-09-17T18:00:00Z', 9), // 03:00 — still the 17th's
    ]

    expect(introducedToday(sessions, new Date('2026-09-18T10:00:00Z'), TOKYO)).toBe(7)
  })

  // ⚠️ The same instants in the fallback zone are a different split, which is
  // the whole reason the zone travels on the request.
  it('is the zone\'s day and not UTC\'s', () => {
    const sessions = [composed('2026-09-17T23:00:00Z', 4)]
    const now = new Date('2026-09-18T05:00:00Z')

    expect(introducedToday(sessions, now, TOKYO)).toBe(4)
    expect(introducedToday(sessions, now, 'UTC')).toBe(0)
  })
})

describe('newAllowance — what is left of the day', () => {
  it('is what is left of ten by default, and never below nothing', () => {
    expect(newAllowance(0, LIMITS)).toBe(10)
    expect(newAllowance(7, LIMITS)).toBe(3)
    expect(newAllowance(10, LIMITS)).toBe(0)
    expect(newAllowance(14, LIMITS)).toBe(0)
  })

  it('follows the reader\'s setting', () => {
    expect(newAllowance(7, limits({ dailyNew: 20 }))).toBe(13)
    expect(newAllowance(0, limits({ dailyNew: 0 }))).toBe(0)
  })
})

// ADR 0076 §1 — how many words one lesson may teach now.
describe('lessonRoom — one lesson, as far as the brake allows', () => {
  it('is the lesson size while the day has more than that left', () => {
    expect(lessonRoom({ introducedToday: 0, dueCount: 0 }, LIMITS)).toBe(5)
    expect(lessonRoom({ introducedToday: 5, dueCount: 0 }, LIMITS)).toBe(5)
  })

  it('is what is left of the day when that is less than a lesson', () => {
    expect(lessonRoom({ introducedToday: 7, dueCount: 0 }, LIMITS)).toBe(3)
  })

  it('is nothing once the day is spent', () => {
    expect(lessonRoom({ introducedToday: 10, dueCount: 0 }, LIMITS)).toBe(0)
    expect(lessonRoom({ introducedToday: 12, dueCount: 0 }, LIMITS)).toBe(0)
  })

  // ⚠️ **The gate is over the whole due set**, and it wins over whatever the
  // day has left: fifty or more waiting, no new words.
  it('is nothing at fifty reviews waiting, and a full lesson at forty-nine', () => {
    expect(lessonRoom({ introducedToday: 0, dueCount: 50 }, LIMITS)).toBe(0)
    expect(lessonRoom({ introducedToday: 0, dueCount: 49 }, LIMITS)).toBe(5)
  })

  it('follows all three settings', () => {
    const own = limits({ lessonSize: 8, dailyNew: 20, pauseAbove: 100 })

    expect(lessonRoom({ introducedToday: 0, dueCount: 99 }, own)).toBe(8)
    expect(lessonRoom({ introducedToday: 16, dueCount: 0 }, own)).toBe(4)
    expect(lessonRoom({ introducedToday: 0, dueCount: 100 }, own)).toBe(0)
  })

  it('is nothing when new words are switched off', () => {
    expect(lessonRoom({ introducedToday: 0, dueCount: 0 }, limits({ dailyNew: 0 }))).toBe(0)
  })
})

describe('newOnOffer — what the next lesson would teach', () => {
  it('is nothing while the fifty-review gate is shut, whatever is left of the day', () => {
    expect(newOnOffer({ introducedToday: 0, dueCount: 50 }, 43, LIMITS)).toBe(0)
  })

  it('is nothing once the day\'s ten are spent', () => {
    expect(newOnOffer({ introducedToday: 10, dueCount: 0 }, 43, LIMITS)).toBe(0)
    expect(newOnOffer({ introducedToday: 12, dueCount: 0 }, 43, LIMITS)).toBe(0)
  })

  it('is capped by the lesson size and the remaining daily allowance', () => {
    expect(newOnOffer({ introducedToday: 0, dueCount: 0 }, 43, LIMITS)).toBe(5)
    expect(newOnOffer({ introducedToday: 7, dueCount: 49 }, 43, LIMITS)).toBe(3)
  })

  it('is what is waiting when that is fewer than the day allows', () => {
    expect(newOnOffer({ introducedToday: 2, dueCount: 0 }, 4, LIMITS)).toBe(4)
    expect(newOnOffer({ introducedToday: 0, dueCount: 0 }, 0, LIMITS)).toBe(0)
  })

  it('uses the reader\'s lesson size and daily limit', () => {
    expect(newOnOffer({ introducedToday: 0, dueCount: 0 }, 20, limits({ lessonSize: 8, dailyNew: 12 }))).toBe(8)
  })
})

describe('the reader is told which brake is on (ADR 0066 §7)', () => {
  it('names the due count when the fifty-review gate is shut', () => {
    const reading = { introducedToday: 2, dueCount: 63 }

    expect(brakeState(reading, LIMITS)).toBe('paused')
    expect(brakeSentence(reading, LIMITS)).toBe('No new words today, 63 due.')
  })

  it('names the day\'s ten when they are spent', () => {
    const reading = { introducedToday: 10, dueCount: 4 }

    expect(brakeState(reading, LIMITS)).toBe('spent')
    expect(brakeSentence(reading, LIMITS)).toBe('10 of 10 new words today.')
  })

  it('says its number when no brake is on, too', () => {
    const reading = { introducedToday: 3, dueCount: 49 }

    expect(brakeState(reading, LIMITS)).toBe('open')
    expect(brakeSentence(reading, LIMITS)).toBe('3 of 10 new words today.')
  })

  it('prefers the gate the reader can open tonight', () => {
    expect(brakeState({ introducedToday: 10, dueCount: 50 }, LIMITS)).toBe('paused')
  })

  it('names the reader\'s own limit, and an overrun as it happened', () => {
    expect(brakeSentence({ introducedToday: 12, dueCount: 0 }, limits({ dailyNew: 5 }))).toBe('12 of 5 new words today.')
  })
})
