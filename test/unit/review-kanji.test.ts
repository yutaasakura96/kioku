// The kanji-reading retry — ADR 0069 §5, #30, `docs/kanjidic-research.md` §3.3
// and §4.5.
//
// ⚠️ **A hand-written table, not the committed one.** KANJIDIC2 is rebuilt daily
// and refreshed here monthly; a test that read `readings.json` would change
// colour with a refresh that changed nothing in the rule. The entries below are
// copied from the 2026-264 file in the table's own shape: on readings in
// hiragana, kun readings with KANJIDIC2's `.` okurigana marker kept.

import { describe, expect, it } from 'vitest'

import { readingResult } from '../../shared/review/answer'
import { MAX_CANDIDATES, kanjiReadingCandidates } from '../../shared/review/kanji'

const TABLE: Record<string, readonly string[]> = {
  夢: ['くら.い', 'ぼう', 'む', 'ゆめ', 'ゆめ.みる'],
  水: ['すい', 'みず'],
  見: ['けん', 'み.える', 'み.せる', 'み.る'],
  学: ['がく', 'まな.ぶ'],
  校: ['きょう', 'こう'],
  人: ['じん', 'と', 'にん', 'ひと', 'り'],
  今: ['いま', 'きん', 'こん'],
  日: ['か', 'じつ', 'にち', 'ひ', 'び'],
  大: ['おお', 'おお.い', 'おお.きい', 'たい', 'だい'],
}

const lookup = (kanji: string) => TABLE[kanji]
const candidates = (term: string, reading: string) => kanjiReadingCandidates(term, reading, lookup)

describe('a single kanji — the case ADR 0069 §5 was written for', () => {
  it('offers 夢\'s other readings and never its own', () => {
    const found = candidates('夢', 'ゆめ')

    expect(found).toContain('む')
    expect(found).toContain('ぼう')
    expect(found).not.toContain('ゆめ')
  })

  it('offers a kun reading both whole and as its stem', () => {
    expect(candidates('夢', 'ゆめ')).toEqual(expect.arrayContaining(['くら', 'くらい', 'ゆめみる']))
  })

  it('offers すい for 水, which is WaniKani\'s example', () => {
    expect(candidates('水', 'みず')).toEqual(['すい'])
  })
})

describe('one kanji with okurigana — stems only (research §3.3)', () => {
  it('builds 見る\'s candidates from 見\'s stems and the term\'s kana', () => {
    expect(candidates('見る', 'みる')).toEqual(['けんる'])
  })

  // ⚠️ **The trap the research named.** 見 carries み.える; a whole kun form
  // would make みえる, which is another word (見える), a "kanji reading" of 見る.
  it('does not offer みえる or みせる for 見る', () => {
    const found = candidates('見る', 'みる')

    expect(found).not.toContain('みえる')
    expect(found).not.toContain('みせる')
  })
})

describe('compounds — combinations, with rendaku and sokuon', () => {
  it('reaches がくこう for 学校 and leaves its own reading out', () => {
    const found = candidates('学校', 'がっこう')

    expect(found).toContain('がくこう')
    expect(found).not.toContain('がっこう')
  })

  it('geminates a non-final kanji\'s last く before another kanji', () => {
    // The same variant reaches the word's reading, which is then removed; the
    // other reading of 校 shows it was generated.
    expect(candidates('学校', 'がっこう')).toContain('がっきょう')
  })

  it('voices the first mora of a non-initial kanji', () => {
    expect(candidates('学校', 'がっこう')).toContain('がくごう')
  })

  it('repeats the previous kanji for 々', () => {
    const found = candidates('人々', 'ひとびと')

    expect(found).toContain('じんじん')
    expect(found).not.toContain('ひとびと')
  })

  // ⚠️ **Known costs, kept visible** (research §4.5). Yuta chose compounds with
  // them in view; these pin what the reader will see, so a change that removes
  // one is a decision rather than an accident.
  it('treats こんにち for 今日 as a kanji reading, though it is a word too', () => {
    expect(candidates('今日', 'きょう')).toContain('こんにち')
  })

  it('turns だいにん for 大人, a jukujikun, into a retry', () => {
    expect(candidates('大人', 'おとな')).toContain('だいにん')
  })
})

describe('nothing to offer', () => {
  it('has no candidates for a kana-only term, which has no reading step', () => {
    expect(candidates('こんな', 'こんな')).toEqual([])
  })

  it('has none for an empty term', () => {
    expect(candidates('', '')).toEqual([])
  })

  // A character the table does not know cannot be half-answered: the check
  // falls back to right-or-wrong for the whole term.
  it('has none when a kanji is missing from the table', () => {
    expect(candidates('夢想', 'むそう')).toEqual([])
  })

  it('has none past the cap, rather than a partial list', () => {
    const many = Array.from({ length: 12 }, (_, index) => String.fromCodePoint(0x3042 + index * 2))
    const wide = (kanji: string) => (kanji === '字' ? many : undefined)

    expect(12 ** 3).toBeGreaterThan(MAX_CANDIDATES)
    expect(kanjiReadingCandidates('字字字', 'x', wide)).toEqual([])
  })
})

describe('the reading step\'s result', () => {
  const found = candidates('夢', 'ゆめ')

  it('is right for the word\'s reading', () => {
    expect(readingResult('ゆめ', 'ゆめ', found)).toBe('right')
  })

  it('is a kanji reading for む', () => {
    expect(readingResult('む', 'ゆめ', found)).toBe('kanji')
  })

  it('folds what was typed, so ム and an unfinished mu count too', () => {
    expect(readingResult('ム', 'ゆめ', found)).toBe('kanji')
    expect(readingResult('mu', 'ゆめ', found)).toBe('kanji')
  })

  it('is wrong for anything else, and for nothing', () => {
    expect(readingResult('ゆみ', 'ゆめ', found)).toBe('wrong')
    expect(readingResult('', 'ゆめ', found)).toBe('wrong')
  })

  it('is wrong for a kanji reading when the position has no candidates', () => {
    expect(readingResult('む', 'ゆめ', [])).toBe('wrong')
  })
})
