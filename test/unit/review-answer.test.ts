// *Review*'s check — ADR 0060 §5 as amended by ADR 0069 and ADR 0076 §5, the
// seam `11` §8 names for the numbers.
//
// ⚠️ **The check is the *grade*** (ADR 0069 §1), and since ADR 0076 §5 nothing
// the reader can press overrules it. A wrong result here is a `Forgot` — so a
// check that is too strict is paid for in lapses FSRS schedules on, and one
// that is too loose passes a different word. That is why the thresholds are
// tested at each boundary rather than by example.

import { describe, expect, it } from 'vitest'

import { answerSteps, foldReading, glossPieces, meaningEntry, meaningMatches, meaningResult, otherMeanings, readingEntry, readingMatches } from '../../shared/review/answer'

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

  // ⚠️ ADR 0076 §5, the prototype's numbers: none under 5 letters, one for 5
  // to 8, two from 9 — measured on the accepted meaning after normalising.
  // ADR 0060 §5 had 0 / 1 from 4 / 2 from 8 until #70.
  describe('the edit distance, at each boundary', () => {
    it('allows none at 4 letters — where one edit is most often another word', () => {
      expect(meaningMatches('book', 'book')).toBe(true)
      expect(meaningMatches('bool', 'book')).toBe(false)
      expect(meaningMatches('gold', 'cold')).toBe(false)
    })

    it('allows one at 5 letters, and not two', () => {
      expect(meaningMatches('wator', 'water')).toBe(true)
      expect(meaningMatches('watr', 'water')).toBe(true)
      expect(meaningMatches('wetor', 'water')).toBe(false)
    })

    it('allows one at 8 letters, and not two', () => {
      expect(meaningMatches('hospitl', 'hospital')).toBe(true)
      expect(meaningMatches('hospitql', 'hospital')).toBe(true)
      expect(meaningMatches('hspitl', 'hospital')).toBe(false)
    })

    it('allows two at 9 letters, and not three', () => {
      expect(meaningMatches('advnture', 'adventure')).toBe(true)
      expect(meaningMatches('advntre', 'adventure')).toBe(true)
      expect(meaningMatches('advntr', 'adventure')).toBe(false)
    })

    it('measures the accepted meaning, not what was typed', () => {
      // Nine letters typed against an eight-letter meaning is still one edit's worth.
      expect(meaningMatches('hospitall', 'hospital')).toBe(true)
      expect(meaningMatches('hoospitall', 'hospital')).toBe(false)
    })

    it('counts the letters after the leading article is dropped', () => {
      // `to open` normalises to `open`: four letters, so no edit.
      expect(meaningMatches('to opem', 'to open')).toBe(false)
    })
  })

  describe('exact, close or wrong', () => {
    it('says which, so the screen can answer a near miss with the meaning', () => {
      expect(meaningResult('library', 'library')).toBe('exact')
      expect(meaningResult('libary', 'library')).toBe('close')
      expect(meaningResult('station', 'library')).toBe('wrong')
    })

    it('is exact when any accepted meaning is typed as written', () => {
      // `libary` is close to `library`, and `bookroom` is in the list exactly.
      expect(meaningResult('bookroom', { meaning: 'library', meanings: ['bookroom'], synonyms: [] })).toBe('exact')
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
    // `see` is three letters, so it allows no edit; `watch` is five.
    expect(meaningMatches('sea', 見る)).toBe(false)
    expect(meaningMatches('wach', 見る)).toBe(true)
  })
})

// ADR 0076 §5 — the gloss is cut into answers, and JMdict writes brackets.
describe('the pieces of a gloss', () => {
  it('cuts at a comma, a semicolon and a slash', () => {
    expect(glossPieces('meeting, conference; assembly/gathering')).toEqual(['meeting', 'conference', 'assembly', 'gathering'])
  })

  it('does not cut inside brackets', () => {
    expect(glossPieces('to open (a door, etc.); to unlock')).toEqual(['to open (a door, etc.)', 'to unlock'])
  })

  it('drops an empty piece', () => {
    expect(glossPieces('library; ')).toEqual(['library'])
  })

  it('gives the result\'s *Also* line the pieces that were not typed, two at most', () => {
    expect(otherMeanings('to meet', 'to meet; to encounter; to see; to have an accident')).toEqual(['to encounter', 'to see'])
    expect(otherMeanings('library', 'library')).toEqual([])
  })
})

// ADR 0076 §5 — an entry in the wrong script is not an answer, and is not counted.
describe('whether an entry can be checked at all', () => {
  it.each(['', '   ', '?!'])('calls %j an empty meaning', (typed) => {
    expect(meaningEntry(typed)).toBe('empty')
  })

  it.each(['としょかん', 'トショカン', '図書館', 'library 図'])('refuses Japanese in a meaning — %j', (typed) => {
    expect(meaningEntry(typed)).toBe('wrong_script')
  })

  it('takes an English meaning, right or wrong', () => {
    expect(meaningEntry('library')).toBeNull()
    expect(meaningEntry('statoin')).toBeNull()
  })

  it.each(['', '   '])('calls %j an empty reading', (typed) => {
    expect(readingEntry(typed)).toBe('empty')
  })

  it.each(['図書館', 'library', 'としょkq'])('refuses a reading that is not kana — %j', (typed) => {
    expect(readingEntry(typed)).toBe('wrong_script')
  })

  it.each(['としょかん', 'コーヒー', 'toshokan', 'としょかn'])('takes kana, and romaji that folds to it — %j', (typed) => {
    expect(readingEntry(typed)).toBeNull()
  })
})

// ADR 0069 §4: a kana word is its own reading.
describe('the questions a word asks', () => {
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
  ])('asks the meaning, then the reading, for %j (%s)', (term) => {
    // ADR 0076 §3 reversed ADR 0060 §2's order.
    expect(answerSteps(term)).toEqual(['meaning', 'reading'])
  })
})
