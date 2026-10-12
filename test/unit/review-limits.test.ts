// The three study settings — ADR 0076 §2. One clamp, used by the form and by
// the read, so no composition ever sees a lesson of zero or a day of a million.

import { describe, expect, it } from 'vitest'

import { DEFAULT_LIMITS, LIMIT_BOUNDS, clampLimits } from '../../shared/review/limits'

describe('the defaults are ADR 0066\'s numbers, with the lesson beside them', () => {
  it('is five a lesson, ten a day, and no new words at fifty waiting', () => {
    expect(DEFAULT_LIMITS).toEqual({ lessonSize: 5, dailyNew: 10, pauseAbove: 50 })
  })
})

describe('clampLimits — what the settings form sent, as limits', () => {
  it('keeps values inside the bounds', () => {
    expect(clampLimits({ lessonSize: 8, dailyNew: 20, pauseAbove: 100 })).toEqual({ lessonSize: 8, dailyNew: 20, pauseAbove: 100 })
  })

  it('takes the strings a form sends', () => {
    expect(clampLimits({ lessonSize: '3', dailyNew: '15', pauseAbove: '75' })).toEqual({ lessonSize: 3, dailyNew: 15, pauseAbove: 75 })
  })

  // ⚠️ Out of range clamps rather than refusing: a form refused over a typo
  // would be the settings page taking the reader's lesson away.
  it('clamps each value to its own bounds', () => {
    expect(clampLimits({ lessonSize: 0, dailyNew: -4, pauseAbove: 0 })).toEqual({
      lessonSize: LIMIT_BOUNDS.lessonSize.min,
      dailyNew: LIMIT_BOUNDS.dailyNew.min,
      pauseAbove: LIMIT_BOUNDS.pauseAbove.min,
    })
    expect(clampLimits({ lessonSize: 999, dailyNew: 999, pauseAbove: 99999 })).toEqual({
      lessonSize: LIMIT_BOUNDS.lessonSize.max,
      dailyNew: LIMIT_BOUNDS.dailyNew.max,
      pauseAbove: LIMIT_BOUNDS.pauseAbove.max,
    })
  })

  // Zero is how a reader stops new words without touching anything else.
  it('allows no new words a day, and never a lesson of none', () => {
    expect(clampLimits({ dailyNew: 0 }).dailyNew).toBe(0)
    expect(clampLimits({ lessonSize: 0 }).lessonSize).toBe(1)
  })

  it('floors a fraction', () => {
    expect(clampLimits({ lessonSize: 5.9, dailyNew: 10.2, pauseAbove: 50.5 })).toEqual({ lessonSize: 5, dailyNew: 10, pauseAbove: 50 })
  })

  // ⚠️ `Number('')` is `0`, which for *new words a day* is a value. Blank is
  // *nothing was sent*, and that is the default.
  it.each([
    ['a blank field', { lessonSize: '', dailyNew: ' ', pauseAbove: '' }],
    ['words', { lessonSize: 'five', dailyNew: 'ten', pauseAbove: 'fifty' }],
    ['nothing in the body', {}],
    ['no body', undefined],
    ['a list', [5, 10, 50]],
    ['nulls', { lessonSize: null, dailyNew: null, pauseAbove: null }],
  ])('reads %s as the defaults', (_, raw) => {
    expect(clampLimits(raw)).toEqual(DEFAULT_LIMITS)
  })

  it('defaults only the value that is missing', () => {
    expect(clampLimits({ dailyNew: '20' })).toEqual({ lessonSize: 5, dailyNew: 20, pauseAbove: 50 })
  })
})
