import { describe, expect, it } from 'vitest'

import { countCharacters, sliceCharacters, toNfc } from '../../shared/ingest/text'

// `04` §5.1 and §5.2 say **characters, not bytes**, and add "Japanese makes the
// distinction load-bearing". It is load-bearing in a second way the documents do
// not name and this tier is where it gets caught: **JavaScript's `.length` is
// UTF-16 code units and Python's `len()` is code points**, and the two disagree
// on every character outside the BMP.
//
// The app writes `char_start` / `char_end`; the worker (#7, #8) slices
// `source.content` by them in Python. A single CJK Extension B kanji in a
// *source* — 𠮟, U+20B9F, which is an ordinary jōyō-adjacent character and not a
// contrived one — would put every offset after it one unit out, silently, and
// the symptom would be an *occurrence* highlighting the wrong span months later.
//
// So every count and every slice in this module iterates code points. That is
// the whole reason the module exists rather than the three call sites reaching
// for `.length` and `.slice`.

const KANJI_OUTSIDE_THE_BMP = '𠮟' // U+20B9F, one code point, two UTF-16 units

describe('countCharacters', () => {
  it('counts an ordinary Japanese string', () => {
    expect(countCharacters('駅の近くに図書館があります。')).toBe(14)
  })

  it('⚠️ counts a character outside the BMP as one, where .length says two', () => {
    expect(KANJI_OUTSIDE_THE_BMP.length).toBe(2)
    expect(countCharacters(KANJI_OUTSIDE_THE_BMP)).toBe(1)
  })

  it('counts the empty string as zero', () => {
    expect(countCharacters('')).toBe(0)
  })
})

describe('sliceCharacters', () => {
  it('slices by character position, not by code unit', () => {
    const content = `${KANJI_OUTSIDE_THE_BMP}る駅`

    // Character 1 is る. `.slice(1, 2)` would return half of the kanji.
    expect(sliceCharacters(content, 1, 2)).toBe('る')
    expect(sliceCharacters(content, 0, 1)).toBe(KANJI_OUTSIDE_THE_BMP)
    expect(sliceCharacters(content, 2, 3)).toBe('駅')
  })

  it('agrees with countCharacters on its own output', () => {
    const content = `${KANJI_OUTSIDE_THE_BMP}る駅の近く`
    expect(countCharacters(sliceCharacters(content, 0, 4))).toBe(4)
  })
})

describe('toNfc', () => {
  // ⚠️ `04` §5.1 defines `content_hash` as the SHA-256 of **NFC-normalised**
  // content, so normalisation happens before the hash — and therefore before the
  // count, the cap and the chunk offsets, or the four disagree about what the
  // text is. `server/utils/ingest/submission.ts` normalises once, on arrival.
  it('composes a decomposed dakuten into one character', () => {
    const decomposed = 'が' // か + COMBINING VOICED SOUND MARK
    const composed = 'が'

    expect(decomposed).not.toBe(composed)
    expect(toNfc(decomposed)).toBe(composed)
    expect(countCharacters(toNfc(decomposed))).toBe(1)
  })

  it('composes half-width katakana voicing the same way twice', () => {
    // Idempotence is the property the hash depends on: two submissions of the
    // same text, typed on two keyboards, must hash alike.
    const once = toNfc('ガ')
    expect(toNfc(once)).toBe(once)
  })

  it('leaves already-composed text alone', () => {
    expect(toNfc('駅の近くに図書館があります。')).toBe('駅の近くに図書館があります。')
  })
})
