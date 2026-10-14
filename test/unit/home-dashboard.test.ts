import { describe, expect, it } from 'vitest'

import {
  STUDY_DAYS_SHOWN,
  WEAK_WORDS_SHOWN,
  comingUp,
  lessonsHint,
  missedNote,
  reviewsHint,
  studyDays,
  weakWords,
} from '../../shared/home/dashboard'
import type { WordRecord } from '../../shared/home/dashboard'

// ADR 0078 — Home's arithmetic, in the reader's local day (04:00 to 04:00,
// ADR 0066 §4). Tokyo has no daylight saving, so a wall clock there is a fixed
// nine hours from UTC.
const ZONE = 'Asia/Tokyo'
const tokyo = (wall: string) => new Date(`${wall}+09:00`)

describe('comingUp', () => {
  const now = tokyo('2026-10-14T10:00:00')

  it('sorts due instants into now, later today, tomorrow and later this week', () => {
    const figures = comingUp([
      tokyo('2026-10-01T09:00:00'), // overdue
      tokyo('2026-10-14T10:00:00'), // exactly now
      tokyo('2026-10-14T23:30:00'), // later today
      tokyo('2026-10-15T03:59:00'), // still today: the day ends at 04:00
      tokyo('2026-10-15T04:00:00'), // tomorrow
      tokyo('2026-10-16T04:00:00'), // later this week
      tokyo('2026-10-20T12:00:00'), // the seventh local day, the week's last
      tokyo('2026-10-21T12:00:00'), // past the week
    ], now, ZONE)

    expect(figures).toEqual({ now: 2, laterToday: 2, tomorrow: 1, laterThisWeek: 2 })
  })

  it('is four zeros with nothing scheduled', () => {
    expect(comingUp([], now, ZONE)).toEqual({ now: 0, laterToday: 0, tomorrow: 0, laterThisWeek: 0 })
  })

  // ⚠️ Before 04:00 the reader is still in yesterday's day, so *tomorrow* is
  // the day that starts at 04:00 today.
  it('counts from the local day, not the calendar date', () => {
    const early = tokyo('2026-10-14T02:00:00')
    const figures = comingUp([tokyo('2026-10-14T05:00:00')], early, ZONE)

    expect(figures).toEqual({ now: 0, laterToday: 0, tomorrow: 1, laterThisWeek: 0 })
  })
})

describe('studyDays', () => {
  const now = tokyo('2026-10-14T10:00:00')

  it('is fourteen local days, oldest first, ending today', () => {
    const days = studyDays([], now, ZONE)

    expect(days).toHaveLength(STUDY_DAYS_SHOWN)
    expect(days[0]!.key).toBe('2026-10-01')
    expect(days.at(-1)).toEqual({ key: '2026-10-14', studied: false, today: true })
    expect(days.filter(day => day.today)).toHaveLength(1)
  })

  it('marks a day studied when anything was graded in it', () => {
    const days = studyDays([
      tokyo('2026-10-13T22:00:00'),
      tokyo('2026-10-14T03:00:00'), // before 04:00: still the 13th
      tokyo('2026-10-02T12:00:00'),
      tokyo('2026-09-01T12:00:00'), // outside the window
    ], now, ZONE)

    expect(days.filter(day => day.studied).map(day => day.key)).toEqual(['2026-10-02', '2026-10-13'])
  })
})

describe('weakWords', () => {
  const word = (cardId: string, misses: number, answers: number, stage: WordRecord['stage'] = 'learning'): WordRecord => ({
    cardId,
    fields: { term: cardId },
    misses,
    answers,
    stage,
  })

  it('lists words missed at least twice that are still Learning', () => {
    const weak = weakWords([
      word('once', 1, 3),
      word('twice', 2, 4),
      word('known-now', 5, 9, 'known'),
      word('familiar-now', 3, 6, 'familiar'),
      word('no-epoch', 3, 3, null),
    ])

    expect(weak.map(entry => entry.cardId)).toEqual(['twice'])
  })

  it('puts the most missed first, then the larger share missed', () => {
    const weak = weakWords([
      word('b', 2, 6),
      word('a', 4, 6),
      word('c', 2, 3),
    ])

    expect(weak.map(entry => entry.cardId)).toEqual(['a', 'c', 'b'])
  })

  it('shows four', () => {
    const many = Array.from({ length: 9 }, (_, index) => word(`w${index}`, 2, 4))

    expect(weakWords(many)).toHaveLength(WEAK_WORDS_SHOWN)
  })
})

describe('the sentences', () => {
  it('says how often a word was missed, as the prototype does', () => {
    expect(missedNote({ misses: 4, answers: 6 })).toBe('missed 4 of 6')
  })

  it('explains an empty Reviews card on day one and after', () => {
    expect(reviewsHint(0, false)).toBe('Nothing to review yet. Words appear here after your first lesson.')
    expect(reviewsHint(0, true)).toBe('Nothing due right now.')
    expect(reviewsHint(3, true)).toContain('due again')
  })

  it('names the lesson size, the category and the daily allowance', () => {
    expect(lessonsHint(5, 'JLPT N4', 10)).toBe('5 new words from JLPT N4, then a quiz on them. Up to 10 new words a day.')
    expect(lessonsHint(1, 'My words', 1)).toBe('1 new word from My words, then a quiz on them. Up to 1 new word a day.')
  })
})
