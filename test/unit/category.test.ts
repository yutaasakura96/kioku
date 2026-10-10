// `shared/category/category.ts` — the keys a *category* is named by (ADR 0075
// §3, #68). The database half is `test/schema/starter.test.ts`.

import { describe, expect, it } from 'vitest'

import {
  MY_WORDS_KEY,
  categoryGroup,
  categoryKey,
  levelAuthority,
  levelCategories,
  parseCategoryKey,
} from '../../shared/category/category'
import { jlptVocab } from '../../shared/subject/declaration'

const DECK = '0199c3f0-7b1e-7c3a-9d2e-4f5a6b7c8d9e'

describe('a category key', () => {
  it('names a JLPT level, a deck, or the reader\'s own words', () => {
    expect(categoryKey({ kind: 'level', level: 'N5' })).toBe('jlpt:N5')
    expect(categoryKey({ kind: 'deck', sourceId: DECK })).toBe(`deck:${DECK}`)
    expect(categoryKey({ kind: 'my-words' })).toBe(MY_WORDS_KEY)
  })

  it('reads back into the category it named', () => {
    for (const ref of [
      { kind: 'level', level: 'N3' },
      { kind: 'deck', sourceId: DECK },
      { kind: 'my-words' },
    ] as const)
      expect(parseCategoryKey(categoryKey(ref))).toEqual(ref)
  })

  // The key arrives from a request. `jlpt:N6` answered with an empty category
  // would read as a level with no words in it.
  it.each([
    'jlpt:N6',
    'jlpt:',
    'jlpt:n5',
    'deck:not-a-uuid',
    'deck:',
    'source:anything',
    '',
    null,
    5,
    undefined,
  ])('refuses %j rather than answering an empty category', (key) => {
    expect(parseCategoryKey(key)).toBeNull()
  })

  it('puts the levels on the JLPT shelf and everything the reader brought under My decks', () => {
    expect(categoryGroup({ kind: 'level', level: 'N5' })).toBe('jlpt')
    expect(categoryGroup({ kind: 'deck', sourceId: DECK })).toBe('my-decks')
    expect(categoryGroup({ kind: 'my-words' })).toBe('my-decks')
  })
})

describe('the JLPT shelf', () => {
  it('is the declared levels, easiest first', () => {
    expect(levelCategories().map(categoryKey)).toEqual(['jlpt:N5', 'jlpt:N4', 'jlpt:N3', 'jlpt:N2', 'jlpt:N1'])
  })
})

describe('the authority a level is read from', () => {
  it('is the first one the declaration names', () => {
    expect(levelAuthority()).toBe('tanos-jlpt')
    expect(levelAuthority({ ...jlptVocab, authorities: ['a-newer-list', 'tanos-jlpt'] })).toBe('a-newer-list')
  })

  it('is an error where the declaration names none, rather than every claim', () => {
    expect(() => levelAuthority({ ...jlptVocab, authorities: [] })).toThrow(/authority/)
  })
})
