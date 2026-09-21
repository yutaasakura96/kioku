// *Review*'s check — ADR 0060 §5 as amended by ADR 0069, the seam `11` §8 names
// for the numbers.
//
// ⚠️ **The check is the *grade*** (ADR 0069 §1). A wrong result here is a
// `Forgot` the reader cannot overrule, only answer with a synonym — so a check
// that is too strict is paid for in lapses FSRS schedules on. That is why the
// thresholds are tested at each boundary rather than by example.

import { describe, expect, it } from 'vitest'

import { answerSteps, foldReading, gradeOf, meaningMatches, readingMatches, synonymOffered } from '../../shared/review/answer'

describe('the reading — the same fold on both sides', () => {
  it('matches hiragana typed against hiragana stored', () => {
    expect(readingMatches('としょかん', 'としょかん')).toBe(true)
  })

  it('matches romaji that the field has not finished converting', () => {
    // `bind` holds a trailing `n` until the next key, so `Enter` can arrive on
    // `としょかn`. The fold is what finishes it.
    expect(readingMatches('としょかn', 'としょかん')).toBe(true)
    expect(readingMatches('toshokan', 'としょかん')).toBe(true)
  })

  // ⚠️ ADR 0045 stores an all-katakana *term*'s reading in katakana, and the
  // field produces hiragana — so this is the case the fold exists for.
  it('folds katakana, so コーヒー is answered in hiragana', () => {
    expect(readingMatches('こーひー', 'コーヒー')).toBe(true)
    expect(readingMatches('ko-hi-', 'コーヒー')).toBe(true)
  })

  // ⚠️ **Measured 2026-09-15 against wanakana 5.3.1:** `toHiragana('コーヒー')`
  // is `こうひい` by default, while the long-vowel mark typed through the field
  // stays `ー`. The default fold would mark every katakana loanword with a `ー`
  // wrong, which is ADR 0060's second revisit condition arriving on day one.
  it('keeps the long-vowel mark rather than spelling it out', () => {
    expect(foldReading('コーヒー')).toBe('こーひー')
    expect(readingMatches('こうひい', 'コーヒー')).toBe(false)
  })

  it('accepts kana typed through a system IME in katakana', () => {
    expect(readingMatches('コーヒー', 'コーヒー')).toBe(true)
  })

  it('ignores whitespace around the answer', () => {
    expect(readingMatches(' としょかん ', 'としょかん')).toBe(true)
  })

  it.each([
    ['としょか', 'としょかん'],
    ['どしょかん', 'としょかん'],
    ['', 'としょかん'],
    ['   ', 'としょかん'],
  ])('refuses %j for %j', (typed, stored) => {
    expect(readingMatches(typed, stored)).toBe(false)
  })
})

describe('the meaning — lenient, and only as lenient as the table', () => {
  it('matches the stored meaning exactly', () => {
    expect(meaningMatches('library', 'library')).toBe(true)
  })

  it.each([',', ';', '/'])('matches any candidate split on %j', (separator) => {
    const stored = `meeting${separator} conference${separator}assembly`
    expect(meaningMatches('meeting', stored)).toBe(true)
    expect(meaningMatches('conference', stored)).toBe(true)
    expect(meaningMatches('assembly', stored)).toBe(true)
  })

  it('normalises case, punctuation and whitespace on both sides', () => {
    expect(meaningMatches('  Train  Ticket! ', 'train ticket')).toBe(true)
    expect(meaningMatches('dont know', "don't know")).toBe(true)
  })

  it.each(['to ', 'a ', 'an ', 'the '])('drops a leading %j on either side', (article) => {
    expect(meaningMatches(`${article}open`, 'open')).toBe(true)
    expect(meaningMatches('open', `${article}open`)).toBe(true)
  })

  it('drops the article only as a word, not as the start of one', () => {
    expect(meaningMatches('tomato', 'mato')).toBe(false)
    expect(meaningMatches('another', 'other')).toBe(false)
  })

  // ⚠️ The boundaries: 0 for up to 3 characters, 1 for 4–7, 2 for 8 or more,
  // measured on the stored candidate after normalising.
  describe('the edit distance, at each boundary', () => {
    it('allows none at 3 characters', () => {
      expect(meaningMatches('cat', 'cat')).toBe(true)
      expect(meaningMatches('cot', 'cat')).toBe(false)
    })

    it('allows one at 4 characters, and not two', () => {
      expect(meaningMatches('bool', 'book')).toBe(true)
      expect(meaningMatches('bolt', 'book')).toBe(false)
    })

    it('allows one at 7 characters, and not two', () => {
      expect(meaningMatches('libary', 'library')).toBe(true)
      expect(meaningMatches('libray', 'library')).toBe(true)
      expect(meaningMatches('lbrry', 'library')).toBe(false)
    })

    it('allows two at 8 characters, and not three', () => {
      expect(meaningMatches('hopsital', 'hospital')).toBe(true)
      expect(meaningMatches('hspitl', 'hospital')).toBe(true)
      expect(meaningMatches('hsptl', 'hospital')).toBe(false)
    })
  })

  it('refuses an empty answer, even against an empty candidate', () => {
    expect(meaningMatches('', 'library')).toBe(false)
    expect(meaningMatches('   ', 'library, ')).toBe(false)
    expect(meaningMatches('!', 'library')).toBe(false)
  })

  it('refuses a different word', () => {
    expect(meaningMatches('station', 'library')).toBe(false)
  })
})

// ADR 0060 §3's table, which ADR 0069 §1 makes the grade — and nothing between
// its two rows.
describe('the grade', () => {
  it.each([
    [true, true, 3],
    [true, false, 1],
    [false, true, 1],
    [false, false, 1],
  ] as const)('reading %s, meaning %s proposes %i', (reading, meaning, grade) => {
    expect(gradeOf({ reading, meaning })).toBe(grade)
  })

  it.each([
    [true, 3],
    [false, 1],
  ] as const)('with no reading step, meaning %s grades %i', (meaning, grade) => {
    expect(gradeOf({ reading: null, meaning })).toBe(grade)
  })

  it('is only ever 1 or 3', () => {
    const given = new Set<number>()

    for (const reading of [true, false, null])
      for (const meaning of [true, false])
        given.add(gradeOf({ reading, meaning }))

    expect([...given].sort()).toEqual([1, 3])
  })
})

// ADR 0069 §3: the list, the gloss and the reader's synonyms.
describe('accepted meanings', () => {
  const 見る = { meaning: 'to see/have (a dream)', meanings: ['see', 'look', 'watch', 'view'], synonyms: [] }

  it('accepts a meaning from the list that the gloss does not carry — 見る/look', () => {
    expect(meaningMatches('look', 見る)).toBe(true)
    expect(meaningMatches('to look', 見る)).toBe(true)
  })

  it('still accepts every piece of the gloss the card shows', () => {
    expect(meaningMatches('have a dream', 見る)).toBe(true)
  })

  it('falls back to the gloss alone when the note has no list', () => {
    const bare = { ...見る, meanings: [] }

    expect(meaningMatches('see', bare)).toBe(true)
    expect(meaningMatches('look', bare)).toBe(false)
  })

  it('accepts the reader\'s synonym, under the same fold and distance', () => {
    const own = { ...見る, meanings: [], synonyms: ['behold'] }

    expect(meaningMatches('Behold!', own)).toBe(true)
    expect(meaningMatches('beholf', own)).toBe(true)
    expect(meaningMatches('look', own)).toBe(false)
  })

  it('keeps the distance rule for a list entry', () => {
    // `see` is three characters, so it allows no edit.
    expect(meaningMatches('sea', 見る)).toBe(false)
    expect(meaningMatches('wach', 見る)).toBe(true)
  })
})

// ADR 0069 §2: the offer follows a refused meaning, and nothing else.
describe('the synonym offer', () => {
  it.each([
    [false, 'look', true],
    [false, '   ', false],
    [false, '?!', false],
    [true, 'look', false],
    [null, 'look', false],
  ] as const)('meaning %s, typed %j offers %s', (meaning, typed, offered) => {
    expect(synonymOffered({ meaning }, typed)).toBe(offered)
  })
})

// ADR 0069 §4: a kana word is its own reading.
describe('the steps a card asks', () => {
  it.each([
    ['こんな', 'hiragana'],
    ['コーヒー', 'katakana with a long-vowel mark'],
  ])('asks the meaning only for %s (%s)', (term) => {
    expect(answerSteps(term)).toEqual(['meaning'])
  })

  it.each([
    ['見る', 'kanji and kana'],
    ['夢', 'kanji only'],
    ['', 'no term at all'],
  ])('asks the reading, then the meaning, for %j (%s)', (term) => {
    expect(answerSteps(term)).toEqual(['reading', 'meaning'])
  })
})
