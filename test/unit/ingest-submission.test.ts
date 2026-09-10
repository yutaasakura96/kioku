import { describe, expect, it } from 'vitest'

import {
  DERIVED_TITLE_CHARACTERS,
  SOURCE_CHARACTER_CAP,
  readSubmission,
} from '../../shared/ingest/submission'

// `03` §13.2: "**Source text** is capped at 100,000 characters and checked
// server-side before the job is written — before any spend, per PRD §5." Three of
// the five screens have no client, so there is nowhere else this could happen.
//
// This is the pure half of `POST /api/source`. The half that cannot be tested
// here is the *answer*: `09` §4.2 refuses over-cap with `200` and the form
// re-rendered **with the reader's text still in it**, and `11` §8 puts that in
// the end-to-end-only column because the post-redirect-get pair has no smaller
// seam. `test/e2e/ingest.test.ts` holds it.

describe('the cap', () => {
  it('is 100,000 characters — `S2`, `03` §13.2, and `04` §5.1\'s CHECK', () => {
    expect(SOURCE_CHARACTER_CAP).toBe(100_000)
  })

  it('accepts content at exactly the cap', () => {
    const result = readSubmission({ title: '', content: 'あ'.repeat(SOURCE_CHARACTER_CAP) })

    expect(result.ok).toBe(true)
    expect(result.ok && result.characterCount).toBe(SOURCE_CHARACTER_CAP)
  })

  it('refuses content one character over', () => {
    const result = readSubmission({ title: '', content: 'あ'.repeat(SOURCE_CHARACTER_CAP + 1) })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.code).toBe('over_cap')
  })

  it('⚠️ names the count in the message, because there is no live counter', () => {
    // `10` §6.2: the route ships no JavaScript so nothing can count as the
    // reader types, and `10` §6.3 gives this sentence with its thousands
    // separators. The count is the only way the reader learns how much to cut.
    const result = readSubmission({ title: '', content: 'あ'.repeat(128_441) })

    expect(!result.ok && result.message).toBe(
      '128,441 characters — the cap is 100,000. Split it and submit the halves.',
    )
  })

  it('⚠️ counts code points, so the cap is the same number Python would count', () => {
    // 50,001 characters outside the BMP is 100,002 UTF-16 units — over the cap
    // by `.length` and under it by `len()`. `04` §5.1's CHECK is on the stored
    // `char_count`, so the handler and the schema have to agree on which.
    const content = '𠮟'.repeat(50_001)

    expect(content.length).toBeGreaterThan(SOURCE_CHARACTER_CAP)

    const result = readSubmission({ title: '', content })
    expect(result.ok).toBe(true)
    expect(result.ok && result.characterCount).toBe(50_001)
  })
})

describe('empty content', () => {
  it.each([
    ['nothing at all', ''],
    ['ordinary spaces', '   '],
    ['a newline', '\n\n'],
    ['an ideographic space', '　　'],
    ['a byte-order mark', '﻿'],
    ['⚠️ a unit separator — the character `04` §5.3 joins the identity key with', ''],
  ])('refuses %s', (_name, content) => {
    const result = readSubmission({ title: '', content })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.code).toBe('empty')
  })

  it('gives one sentence, per `10` §6.3', () => {
    const result = readSubmission({ title: '', content: '' })
    expect(!result.ok && result.message).toBe('Nothing to ingest — paste the text you want notes from.')
  })
})

describe('normalisation, which happens before everything else', () => {
  // ⚠️ `04` §5.1 defines `content_hash` as the SHA-256 of NFC-normalised
  // content. If the count, the cap and the chunk offsets were computed against
  // the raw text and the hash against the normalised one, the four would
  // disagree about what the text is — so the handler normalises once, here, and
  // everything downstream reads `result.content`.
  it('returns NFC content, and counts it after normalising', () => {
    const decomposed = 'が'.repeat(10) // か + combining mark: 20 code points

    const result = readSubmission({ title: '', content: decomposed })

    expect(result.ok).toBe(true)
    expect(result.ok && result.content).toBe('が'.repeat(10))
    expect(result.ok && result.characterCount).toBe(10)
  })

  it('normalises the title too', () => {
    const result = readSubmission({ title: 'が', content: '駅' })
    expect(result.ok && result.title).toBe('が')
  })
})

describe('the title, which the form makes optional and the schema does not', () => {
  // `09` §4.2: "The form has two fields: an optional title, and the content."
  // `04` §5.1: `title text not null`. Something has to bridge that, and a
  // *source* with no title still has to be nameable in the runs list and the
  // Sources list (`10` §6.2, §7.1).
  it('keeps a title the reader gave', () => {
    const result = readSubmission({ title: '  朝日新聞 社説  ', content: '駅の近くに図書館があります。' })
    expect(result.ok && result.title).toBe('朝日新聞 社説')
  })

  it('derives one from the first line when the field is blank', () => {
    const result = readSubmission({
      title: '   ',
      content: '駅の近くに図書館があります。\n二行目は使われない。',
    })

    expect(result.ok && result.title).toBe('駅の近くに図書館があります。')
  })

  it('skips blank leading lines when deriving', () => {
    const result = readSubmission({ title: '', content: '\n\n  \n図書館\n次の行' })
    expect(result.ok && result.title).toBe('図書館')
  })

  it('truncates a long first line rather than storing a paragraph as a name', () => {
    const result = readSubmission({ title: '', content: 'あ'.repeat(400) })

    expect(result.ok && result.title).toBe(`${'あ'.repeat(DERIVED_TITLE_CHARACTERS)}…`)
  })

  it('⚠️ truncates by code point, so a derived title never ends in half a character', () => {
    const result = readSubmission({ title: '', content: '𠮟'.repeat(400) })

    expect(result.ok && result.title).toBe(`${'𠮟'.repeat(DERIVED_TITLE_CHARACTERS)}…`)
  })
})
