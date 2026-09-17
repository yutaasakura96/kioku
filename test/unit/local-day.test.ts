// The one day boundary in the project — ADR 0066 §4, `11` §8.
//
// ⚠️ **The boundary is the whole of what is tested here**, because it is the
// whole of what is decided. ADR 0037's amended table names the assertion in as
// many words: *two grades either side of midnight are two days and two either
// side of 02:00 are one*. Both are below.
//
// ⚠️ **No threshold, anywhere** (ADR 0037). Nothing here asserts that a reader
// studied on any particular number of days.

import { describe, expect, it } from 'vitest'

import {
  DAY_STARTS_AT_HOUR,
  FALLBACK_ZONE,
  distinctLocalDays,
  localDayKey,
  localDaysBetween,
  resolveZone,
  windowStartKey,
} from '../../shared/time/local-day'

const TOKYO = 'Asia/Tokyo'

describe('the day starts at 04:00 and not at midnight', () => {
  it('is four', () => {
    expect(DAY_STARTS_AT_HOUR).toBe(4)
  })

  // ⚠️ **Midnight is not a boundary, and this is the assertion a
  // `date_trunc('day', …)` implementation fails while looking entirely
  // correct.** ADR 0066 §4 gives this exact case in its own words — *a run that
  // starts at 23:40 and ends at 00:10 is one sitting to the person doing it*.
  //
  // ⚠️ **ADR 0037's amended table said the opposite** — *two grades either side
  // of midnight are two days* — and it was corrected against ADR 0066 by #23
  // rather than implemented. A 04:00 cutoff has exactly one boundary in it.
  it('puts 23:50 and 00:10 in the same day, because midnight is not the cutoff', () => {
    const before = new Date('2026-09-17T14:50:00Z') // 23:50 in Tokyo, the 17th
    const after = new Date('2026-09-17T15:10:00Z') // 00:10 in Tokyo, the 18th

    expect(localDayKey(before, TOKYO)).toBe('2026-09-17')
    expect(localDayKey(after, TOKYO)).toBe('2026-09-17')
  })

  // ADR 0037's amended table, the half that was right: *two either side of
  // 02:00 are one*.
  it('puts 01:50 and 02:10 in the same day, and that day is the one before', () => {
    const before = new Date('2026-09-17T16:50:00Z') // 01:50 in Tokyo, the 18th
    const after = new Date('2026-09-17T17:10:00Z') // 02:10 in Tokyo, the 18th

    expect(localDayKey(before, TOKYO)).toBe('2026-09-17')
    expect(localDayKey(after, TOKYO)).toBe('2026-09-17')
  })

  it('starts the new day at 04:00 exactly, not a minute before', () => {
    expect(localDayKey(new Date('2026-09-17T18:59:00Z'), TOKYO)).toBe('2026-09-17') // 03:59
    expect(localDayKey(new Date('2026-09-17T19:00:00Z'), TOKYO)).toBe('2026-09-18') // 04:00
  })
})

describe('the zone is the reader\'s, and the offset is read at the instant', () => {
  // ⚠️ The measurement that says the bucketing is not a UTC one: the same
  // instant is two different days depending on where the reader is standing.
  it('answers a different day in a different zone for one instant', () => {
    const instant = new Date('2026-09-17T20:00:00Z') // 05:00 the 18th in Tokyo

    expect(localDayKey(instant, TOKYO)).toBe('2026-09-18')
    expect(localDayKey(instant, 'UTC')).toBe('2026-09-17')
  })

  // ⚠️ A whole-hour shift applied to the *instant* rather than to the wall clock
  // lands in the wrong day in a half-hour zone. Kolkata is +05:30, so 04:00
  // local is 22:30 UTC.
  it('handles a zone whose offset is not a whole number of hours', () => {
    const justBefore = new Date('2026-09-17T22:29:00Z') // 03:59 in Kolkata
    const justAfter = new Date('2026-09-17T22:31:00Z') // 04:01 in Kolkata

    expect(localDayKey(justBefore, 'Asia/Kolkata')).toBe('2026-09-17')
    expect(localDayKey(justAfter, 'Asia/Kolkata')).toBe('2026-09-18')
  })

  // ⚠️ The case that kills `new Date(instant - 4h)` formatted in the zone: on a
  // spring-forward morning the offset four hours earlier is not the offset now.
  // New York moves to -04:00 at 07:00 UTC on 2026-03-08.
  it('is not fooled by a daylight-saving transition earlier the same morning', () => {
    const justBefore = new Date('2026-03-08T07:59:00Z') // 03:59 EDT
    const justAfter = new Date('2026-03-08T08:01:00Z') // 04:01 EDT

    expect(localDayKey(justBefore, 'America/New_York')).toBe('2026-03-07')
    expect(localDayKey(justAfter, 'America/New_York')).toBe('2026-03-08')
  })

  it('steps back over a month end without a leap-year branch', () => {
    // 01:00 on 1 March 2028 in Tokyo — a leap year, so yesterday is the 29th.
    expect(localDayKey(new Date('2028-02-29T16:00:00Z'), TOKYO)).toBe('2028-02-29')
  })

  // ⚠️ The zone arrives from the client (ADR 0066 §4), so it is not trusted.
  it('falls back to UTC on a zone Intl does not know, and on nothing at all', () => {
    expect(resolveZone('Mars/Olympus_Mons')).toBe(FALLBACK_ZONE)
    expect(resolveZone(null)).toBe(FALLBACK_ZONE)
    expect(resolveZone(undefined)).toBe(FALLBACK_ZONE)
    expect(resolveZone('')).toBe(FALLBACK_ZONE)
    expect(resolveZone(TOKYO)).toBe(TOKYO)
  })
})

describe('the window, which is consistency\'s denominator', () => {
  const now = new Date('2026-09-17T12:00:00Z')

  it('counts both ends, so one day of study is one day possible', () => {
    expect(localDaysBetween(now, now, 'UTC', 30)).toBe(1)
  })

  it('counts the days spanned, not the 24-hour periods elapsed', () => {
    // 23:00 the previous local day to 12:00 today is thirteen hours and two days.
    expect(localDaysBetween(new Date('2026-09-16T23:00:00Z'), now, 'UTC', 30)).toBe(2)
  })

  it('is capped, so a reader of two years reads over thirty', () => {
    expect(localDaysBetween(new Date('2024-09-17T12:00:00Z'), now, 'UTC', 30)).toBe(30)
  })

  it('never goes below one, however the clocks disagree', () => {
    expect(localDaysBetween(new Date('2026-09-18T12:00:00Z'), now, 'UTC', 30)).toBe(1)
  })
})

describe('the first day of the window — what the numerator is trimmed against', () => {
  const now = new Date('2026-09-17T12:00:00Z')

  // ⚠️ **Inclusive of today, so a window of thirty reaches back twenty-nine.**
  // Off by one here silently widens or narrows every consistency reading.
  it('reaches back one day fewer than the window is wide', () => {
    expect(windowStartKey(now, 'UTC', 30)).toBe('2026-08-19')
    expect(windowStartKey(now, 'UTC', 1)).toBe('2026-09-17')
    expect(windowStartKey(now, 'UTC', 2)).toBe('2026-09-16')
  })

  it('is the zone\'s day, not UTC\'s', () => {
    // 20:00 UTC is 05:00 the next day in Tokyo, so Tokyo's window starts a day later.
    const evening = new Date('2026-09-17T20:00:00Z')

    expect(windowStartKey(evening, 'UTC', 30)).toBe('2026-08-19')
    expect(windowStartKey(evening, TOKYO, 30)).toBe('2026-08-20')
  })

  // ⚠️ Keys compare lexicographically, which is the whole reason the trimming in
  // `summarise` is a string comparison rather than a second pass through `Intl`.
  it('compares lexicographically against a day key', () => {
    expect(localDayKey(now, 'UTC') >= windowStartKey(now, 'UTC', 30)).toBe(true)
    expect('2026-08-18' >= windowStartKey(now, 'UTC', 30)).toBe(false)
  })
})

describe('the distinct days a list of instants falls in', () => {
  it('folds several grades in one sitting into one day', () => {
    const days = distinctLocalDays(
      [
        new Date('2026-09-17T11:00:00Z'),
        new Date('2026-09-17T11:04:00Z'),
        new Date('2026-09-17T14:50:00Z'),
        new Date('2026-09-17T15:10:00Z'),
      ],
      'UTC',
    )

    expect(days).toEqual(new Set(['2026-09-17']))
  })

  it('is empty over nothing', () => {
    expect(distinctLocalDays([], 'UTC').size).toBe(0)
  })
})
