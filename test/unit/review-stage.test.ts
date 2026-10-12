// A word's stage — ADR 0076 §7. *Learning*, *Familiar* or *Known*, read from the
// scheduler and stored nowhere, so this file is the whole of the rule.

import { describe, expect, it } from 'vitest'

import { FAMILIAR_FROM_DAYS, KNOWN_FROM_DAYS, backIn, isStage, movement, stageOf, stageOfEpoch } from '../../shared/review/stage'

describe('a stage is a band of stability', () => {
  it('draws its two lines at seven and twenty-one days', () => {
    expect(FAMILIAR_FROM_DAYS).toBe(7)
    expect(KNOWN_FROM_DAYS).toBe(21)
  })

  it.each([
    [0.4, 'learning'],
    [6.99, 'learning'],
    [7, 'familiar'],
    [20.99, 'familiar'],
    [21, 'known'],
    [400, 'known'],
  ] as const)('reads %f days as %s', (stability, stage) => {
    expect(stageOf(stability)).toBe(stage)
  })

  // ⚠️ `state` 0 is the library's New, and its zero stability means *not yet
  // known* rather than *known for no time*.
  it('gives a word that has never been answered no stage', () => {
    expect(stageOfEpoch({ state: 0, stability: 0 })).toBeNull()
    expect(stageOfEpoch(null)).toBeNull()
    expect(stageOfEpoch(undefined)).toBeNull()
  })

  it('reads an answered epoch by its stability', () => {
    expect(stageOfEpoch({ state: 2, stability: 3.2 })).toBe('learning')
    expect(stageOfEpoch({ state: 2, stability: 30 })).toBe('known')
  })

  it('knows its own three names', () => {
    expect(['learning', 'familiar', 'known'].every(isStage)).toBe(true)
    expect(isStage('mastered')).toBe(false)
    expect(isStage(null)).toBe(false)
  })
})

describe('where a grade sent the word, in the prototype\'s words', () => {
  it.each([
    [null, 'learning', 'now Learning'],
    ['learning', 'familiar', 'up to Familiar'],
    ['familiar', 'known', 'up to Known'],
    ['known', 'known', 'stays Known'],
    ['learning', 'learning', 'stays Learning'],
    ['familiar', 'learning', 'down to Learning'],
    ['known', 'learning', 'down to Learning'],
  ] as const)('from %s to %s is %j', (before, after, words) => {
    expect(movement(before, after)).toBe(words)
  })
})

describe('when the word is back', () => {
  // Local time on purpose: the reader reads a date, and the arithmetic is
  // between two local midnights.
  const now = new Date(2026, 9, 10, 23, 0)
  const inDays = (days: number, hour = 9) => new Date(2026, 9, 10 + days, hour, 0)

  it.each([
    [0, 'back today'],
    [1, 'back tomorrow'],
    [3, 'back in 3 days'],
    [13, 'back in 13 days'],
    [14, 'back in 2 weeks'],
    [21, 'back in 3 weeks'],
    [59, 'back in 8 weeks'],
    [60, 'back in 2 months'],
    [120, 'back in 4 months'],
  ])('%i days out reads %j', (days, words) => {
    expect(backIn(inDays(days), now)).toBe(words)
  })

  // ⚠️ A calendar day, not twenty-four hours: due at 01:00 tomorrow is two
  // hours away at 23:00 tonight, and it is tomorrow.
  it('counts calendar days rather than hours', () => {
    expect(backIn(inDays(1, 1), now)).toBe('back tomorrow')
  })

  it('calls anything already due today', () => {
    expect(backIn(inDays(-3), now)).toBe('back today')
  })
})
