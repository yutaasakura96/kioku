import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SEED_COUNT,
  SEED_COUNTS,
  draftContent,
  readSeedRequest,
  seedTitle,
} from '../../shared/ingest/seed'
import { domainValues, jlptVocab, levelValues } from '../../shared/subject/declaration'
import { CHUNK_TARGET_TERMS } from '../../shared/ingest/chunk'

// ADR 0070, #25: *Ingest* asks for a *seed* with a *domain*, a *level* and a
// count. This is the seam that decides whether a request is one the worker may
// spend on — the form offers only valid values, so a refusal here is a post
// from somewhere else, and it writes nothing.

describe('the counts a seed may ask for', () => {
  it('defaults to one 25-term word-list chunk', () => {
    expect(DEFAULT_SEED_COUNT).toBe(CHUNK_TARGET_TERMS)
    expect(SEED_COUNTS).toContain(DEFAULT_SEED_COUNT)
  })

  it('stays inside `04` §6.5\'s CHECK, 1 to 100', () => {
    for (const count of SEED_COUNTS) {
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(100)
    }
  })

  it('offers whole chunks at and above the default, so no seed leaves a half-empty one', () => {
    for (const count of SEED_COUNTS.filter(count => count >= CHUNK_TARGET_TERMS))
      expect(count % CHUNK_TARGET_TERMS).toBe(0)
  })
})

describe('readSeedRequest', () => {
  const valid = { domain: 'tech', level: 'N3', count: '25' }

  it('accepts a domain and a level from the subject\'s closed sets, and an offered count', () => {
    expect(readSeedRequest(valid, jlptVocab)).toEqual({ domain: 'tech', level: 'N3', count: 25 })
  })

  it('accepts every declared domain and level', () => {
    for (const domain of domainValues(jlptVocab)) {
      for (const level of levelValues(jlptVocab))
        expect(readSeedRequest({ domain, level, count: '10' }, jlptVocab)).not.toBeNull()
    }
  })

  it.each([
    ['a domain outside the set', { ...valid, domain: 'cooking' }],
    ['a level outside the set', { ...valid, level: 'N6' }],
    ['a count that is not offered', { ...valid, count: '30' }],
    ['a count over the CHECK', { ...valid, count: '500' }],
    ['a count that is not a number', { ...valid, count: 'many' }],
    ['a fractional count', { ...valid, count: '25.5' }],
    ['a missing field', { domain: 'tech', level: 'N3' }],
    ['a value that is not a string', { ...valid, domain: ['tech'] }],
  ])('refuses %s', (_label, body) => {
    expect(readSeedRequest(body as Record<string, unknown>, jlptVocab)).toBeNull()
  })

  it('refuses a missing body', () => {
    expect(readSeedRequest(undefined, jlptVocab)).toBeNull()
  })

  it('trims what a form sends', () => {
    expect(readSeedRequest({ domain: ' tech ', level: 'N3 ', count: ' 25' }, jlptVocab))
      .toEqual({ domain: 'tech', level: 'N3', count: 25 })
  })
})

describe('seedTitle', () => {
  it('names the domain, the level and the count, so the source it becomes says how it was made', () => {
    expect(seedTitle({ domain: 'tech', level: 'N3', count: 25 })).toBe('tech · N3 · 25 words')
  })
})

describe('draftContent', () => {
  it('is one line per word, which is what a word-list source is', () => {
    expect(draftContent(['会議', '予算'])).toBe('会議\n予算')
  })

  it('is empty for an empty answer', () => {
    expect(draftContent([])).toBe('')
  })
})
