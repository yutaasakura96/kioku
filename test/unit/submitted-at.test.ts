// #60 — Sources rendered submission times in the server's zone (UTC on Vercel).

import { describe, expect, it } from 'vitest'

import { formatSubmittedAt } from '../../shared/time/submitted-at'

const INSTANT = new Date('2026-09-17T14:50:00Z')

describe('formatSubmittedAt', () => {
  it("shows the reader's wall clock, not UTC", () => {
    expect(formatSubmittedAt(INSTANT, 'Asia/Tokyo')).toBe('17 Sept 2026, 23:50')
  })

  it('carries the date across midnight in the reader zone', () => {
    expect(formatSubmittedAt(new Date('2026-09-17T16:10:00Z'), 'Asia/Tokyo')).toBe('18 Sept 2026, 01:10')
  })

  it('falls back to UTC for a missing or bad zone', () => {
    const utc = formatSubmittedAt(INSTANT, 'UTC')
    expect(formatSubmittedAt(INSTANT, null)).toBe(utc)
    expect(formatSubmittedAt(INSTANT, 'bogus')).toBe(utc)
  })
})
