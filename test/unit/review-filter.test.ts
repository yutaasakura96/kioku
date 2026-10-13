// The *session* filter's parser — ADR 0065 §5. A set of *domains* and a set of
// *levels*, each checked against the *subject* declaration rather than against
// a list written here, because the declaration is the only copy (ADR 0003).

import { describe, expect, it } from 'vitest'

import { NO_FILTER, isFiltered, offerFilter, parseSessionFilter } from '../../shared/review/filter'
import { jlptVocab } from '../../shared/subject/declaration'

describe('parseSessionFilter', () => {
  it('takes a set of domains and a set of levels', () => {
    expect(parseSessionFilter({ domains: ['tech', 'business'], levels: ['N3'] }, jlptVocab)).toEqual({
      ok: true,
      filter: { domains: ['tech', 'business'], levels: ['N3'] },
    })
  })

  // ⚠️ The first-ever *session* sends no body at all, and a resume control
  // sends only a size. Neither is a filter that matches nothing.
  it('is no filter when neither set was sent, or both are empty', () => {
    expect(parseSessionFilter(undefined, jlptVocab)).toEqual({ ok: true, filter: NO_FILTER })
    expect(parseSessionFilter({ size: 20 }, jlptVocab)).toEqual({ ok: true, filter: NO_FILTER })
    expect(parseSessionFilter({ domains: [], levels: [] }, jlptVocab)).toEqual({ ok: true, filter: NO_FILTER })
  })

  it('folds a value sent twice', () => {
    expect(parseSessionFilter({ domains: ['tech', 'tech'] }, jlptVocab)).toEqual({
      ok: true,
      filter: { domains: ['tech'], levels: [] },
    })
  })

  // ⚠️ **Refused rather than dropped.** A reader who asked for `technology` and
  // was handed every new *card* would have been answered about a filter they did
  // not set — the unfilterable silence ADR 0065 §2 exists to prevent, one layer up.
  it('refuses a value the declaration does not name, and a set that is not a list of strings', () => {
    expect(parseSessionFilter({ domains: ['technology'] }, jlptVocab)).toEqual({ ok: false, code: 'bad_domains' })
    expect(parseSessionFilter({ domains: 'tech' }, jlptVocab)).toEqual({ ok: false, code: 'bad_domains' })
    expect(parseSessionFilter({ levels: ['N6'] }, jlptVocab)).toEqual({ ok: false, code: 'bad_levels' })
    expect(parseSessionFilter({ levels: [3] }, jlptVocab)).toEqual({ ok: false, code: 'bad_levels' })
  })
})

describe('isFiltered', () => {
  it('is true when either set restricts', () => {
    expect(isFiltered(NO_FILTER)).toBe(false)
    expect(isFiltered({ domains: ['tech'], levels: [] })).toBe(true)
    expect(isFiltered({ domains: [], levels: ['N1'] })).toBe(true)
  })
})

// ADR 0076 §8 — the filter an answer carries narrows the offer that comes back
// with it, and an answer is never turned away over one.
describe('offerFilter', () => {
  it('reads the filter beside an answer\'s own fields', () => {
    expect(offerFilter({ sessionId: 's', cardId: 'c', grade: 3, levels: ['N3'], domains: [] }, jlptVocab))
      .toEqual({ domains: [], levels: ['N3'] })
  })

  it('is no filter for an answer stored without one', () => {
    expect(offerFilter({ sessionId: 's', cardId: 'c', grade: 3 }, jlptVocab)).toBe(NO_FILTER)
    expect(offerFilter(undefined, jlptVocab)).toBe(NO_FILTER)
  })

  it('is no filter, and not a refusal, for one that is not legal', () => {
    expect(offerFilter({ sessionId: 's', levels: ['N6'] }, jlptVocab)).toBe(NO_FILTER)
    expect(offerFilter({ sessionId: 's', domains: 'tech' }, jlptVocab)).toBe(NO_FILTER)
  })
})
