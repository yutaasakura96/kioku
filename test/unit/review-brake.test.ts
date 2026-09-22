// The review-load brake's arithmetic around `compose` — ADR 0066 §3, §4, §7.
//
// ⚠️ **The day is `shared/time/local-day.ts`'s**, and `local-day.test.ts` owns
// the boundary itself. What is asserted here is that the allowance is counted
// over *that* day — the case #21 names: 23:50 and 00:10 are one day's
// allowance, 03:50 and 04:10 are two.

import { describe, expect, it } from 'vitest'

import {
  brakeSentence,
  emptyStateOf,
  brakeState,
  introducedToday,
  newAllowance,
  newOnOffer,
} from '../../shared/review/brake'

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

describe('newAllowance — ten a day', () => {
  it('is what is left of ten, and never below nothing', () => {
    expect(newAllowance(0)).toBe(10)
    expect(newAllowance(7)).toBe(3)
    expect(newAllowance(10)).toBe(0)
    expect(newAllowance(14)).toBe(0)
  })
})

// ⚠️ #33: the start block's `· N new`. It is the day's figure, not one run's —
// the most the brake would let the next composed *session* introduce today.
describe('newOnOffer — what the start block says is new (#33)', () => {
  it('is nothing while the fifty-card gate is shut, whatever is left of the day', () => {
    expect(newOnOffer({ introducedToday: 0, dueCount: 50 }, 43)).toBe(0)
  })

  it('is nothing once the day\'s ten are spent', () => {
    expect(newOnOffer({ introducedToday: 10, dueCount: 0 }, 43)).toBe(0)
    expect(newOnOffer({ introducedToday: 12, dueCount: 0 }, 43)).toBe(0)
  })

  it('is what is left of the day when more than that is waiting', () => {
    expect(newOnOffer({ introducedToday: 0, dueCount: 0 }, 43)).toBe(10)
    expect(newOnOffer({ introducedToday: 7, dueCount: 49 }, 43)).toBe(3)
  })

  it('is what is waiting when that is fewer than the day allows', () => {
    expect(newOnOffer({ introducedToday: 2, dueCount: 0 }, 4)).toBe(4)
    expect(newOnOffer({ introducedToday: 0, dueCount: 0 }, 0)).toBe(0)
  })
})

describe('the reader is told which brake is on (ADR 0066 §7)', () => {
  it('names the due count when the fifty-card gate is shut', () => {
    const reading = { introducedToday: 2, dueCount: 63 }

    expect(brakeState(reading)).toBe('paused')
    expect(brakeSentence(reading)).toBe('No new words today, 63 due.')
  })

  it('names the day\'s ten when they are spent', () => {
    const reading = { introducedToday: 10, dueCount: 4 }

    expect(brakeState(reading)).toBe('spent')
    expect(brakeSentence(reading)).toBe('10 of 10 new words today.')
  })

  it('says its number when no brake is on, too', () => {
    const reading = { introducedToday: 3, dueCount: 49 }

    expect(brakeState(reading)).toBe('open')
    expect(brakeSentence(reading)).toBe('3 of 10 new words today.')
  })

  it('prefers the gate the reader can open tonight', () => {
    expect(brakeState({ introducedToday: 10, dueCount: 50 })).toBe('paused')
  })
})

describe('emptyStateOf — `10` §5.7\'s three empty states', () => {
  const nothing = { hasCards: true, nextDue: null, newWaiting: true }

  it('points at the pipeline when nothing was ever minted', () => {
    expect(emptyStateOf({ hasCards: false, nextDue: null, newWaiting: false }, null)).toBe('nothing-accepted')
  })

  it('says the brake held words back when the day\'s ten are spent and some wait', () => {
    expect(emptyStateOf(nothing, { introducedToday: 10, dueCount: 0 })).toBe('held-back')
  })

  // A filter that matched nothing is not the brake: the day has room.
  it('is nothing due when the day still has room', () => {
    expect(emptyStateOf(nothing, { introducedToday: 4, dueCount: 0 })).toBe('nothing-due')
  })

  it('is nothing due when no new card is waiting at all', () => {
    expect(emptyStateOf({ ...nothing, newWaiting: false }, { introducedToday: 10, dueCount: 0 })).toBe('nothing-due')
  })
})
