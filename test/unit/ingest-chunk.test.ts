import { describe, expect, it } from 'vitest'

import {
  CHUNK_TARGET_CHARACTERS,
  CHUNK_TARGET_TERMS,
  chunkBoundaries,
} from '../../shared/ingest/chunk'
import { countCharacters, sliceCharacters } from '../../shared/ingest/text'

// `04` §5.2: "The deterministic division of a source's content. Chunk boundaries
// are a function of content, so they are shared and stable across
// re-ingestions". That sentence is the whole specification — **no document names
// a chunk size or a boundary rule**, and `04` §5.2's worked example
// (`0, 0, 1200`) is the only number anywhere. The rule is decided here and
// recorded in `06-decision-log.md`.
//
// Three properties carry the rest of the system and each has a test below:
//
//  1. **The chunks tile the content exactly** — contiguous, no gap, no overlap,
//     first starts at 0, last ends at the character count. `occurrence.char_*`
//     is a position **in the source**, and `occurrence.source_chunk_id` says
//     which chunk found it; a gap would make a position unattributable and an
//     overlap would let one *occurrence* be found twice (`04` §5.5's
//     `UNIQUE (note_id, source_id, char_start)` would then refuse the second).
//  2. **Same content in, same boundaries out** — that is what "stable across
//     re-ingestions" means, and it is what makes `source_chunk.content_hash`
//     usable as the first element of the generation cache key (`04` §6.3).
//  3. **A boundary never lands mid-sentence where it can be helped.** Stage 2
//     tokenises each chunk with SudachiPy; a cut inside a word produces two
//     fragments that are not the word, at both edges of the cut.

const TARGET = CHUNK_TARGET_CHARACTERS

/**
 * Every property in note 1, as one assertion, for any content **of any kind**.
 *
 * ⚠️ ADR 0063 added a second boundary rule and the three properties are
 * properties of *chunking*, not of the prose rule — so every word-list case
 * below goes through this same function.
 */
function expectTiling(content: string, kind: 'prose' | 'word_list' = 'prose') {
  const chunks = chunkBoundaries(content, kind)
  const total = countCharacters(content)

  expect(chunks[0]!.charStart).toBe(0)
  expect(chunks.at(-1)!.charEnd).toBe(total)

  chunks.forEach((chunk, index) => {
    expect(chunk.ordinal).toBe(index)
    expect(chunk.charEnd).toBeGreaterThan(chunk.charStart)
    if (index > 0)
      expect(chunk.charStart).toBe(chunks[index - 1]!.charEnd)
  })

  // The strongest form of the same statement: reassembling the slices returns
  // the content, character for character.
  const rebuilt = chunks.map(c => sliceCharacters(content, c.charStart, c.charEnd)).join('')
  expect(rebuilt).toBe(content)

  return chunks
}

describe('a source that fits in one chunk', () => {
  it('is one chunk covering the whole content', () => {
    const chunks = expectTiling('駅の近くに図書館があります。')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ ordinal: 0, charStart: 0, charEnd: 14 })
  })

  it('is one chunk at exactly the target length', () => {
    const chunks = expectTiling('あ'.repeat(TARGET))
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.charEnd).toBe(TARGET)
  })
})

describe('a source longer than the target', () => {
  it('breaks after the last sentence terminator at or before the target', () => {
    // A terminator 20 characters before the target, then more text. The break
    // belongs after the 。, not at the target.
    const head = `${'あ'.repeat(TARGET - 21)}。`
    const content = `${head}${'い'.repeat(500)}`

    const chunks = expectTiling(content)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.charEnd).toBe(TARGET - 20)

    // ⚠️ The terminator belongs to the chunk it ends, not to the one after it.
    expect(sliceCharacters(content, 0, chunks[0]!.charEnd).endsWith('。')).toBe(true)
  })

  it.each([
    ['an ideographic full stop', '。'],
    ['a full-width exclamation mark', '！'],
    ['a full-width question mark', '？'],
    ['a newline, which is how pasted prose is paragraphed', '\n'],
  ])('breaks on %s', (_name, terminator) => {
    const content = `${'あ'.repeat(TARGET - 21)}${terminator}${'い'.repeat(500)}`
    const chunks = expectTiling(content)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.charEnd).toBe(TARGET - 20)
  })

  it('hard-breaks at the target when the window holds no terminator at all', () => {
    // A wall of text with no punctuation is a real paste, not a contrived one —
    // a vocabulary list, a table copied out of a PDF. The rule has to terminate.
    const chunks = expectTiling('あ'.repeat(TARGET * 2 + 300))

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toMatchObject({ charStart: 0, charEnd: TARGET })
    expect(chunks[1]).toMatchObject({ charStart: TARGET, charEnd: TARGET * 2 })
    expect(chunks[2]).toMatchObject({ charStart: TARGET * 2, charEnd: TARGET * 2 + 300 })
  })

  it('never emits a chunk longer than the target', () => {
    const content = `${'あ'.repeat(TARGET + 400)}。${'い'.repeat(TARGET + 400)}`

    for (const chunk of expectTiling(content))
      expect(chunk.charEnd - chunk.charStart).toBeLessThanOrEqual(TARGET)
  })
})

describe('the properties that make the boundaries usable as a cache key', () => {
  it('is deterministic — the same content twice gives the same boundaries', () => {
    const content = `${'駅の近くに図書館があります。'.repeat(300)}`
    expect(chunkBoundaries(content, 'prose')).toEqual(chunkBoundaries(content, 'prose'))
  })

  it('⚠️ counts in code points, so a character outside the BMP does not shift the offsets', () => {
    // 𠮟 is U+20B9F — one code point, two UTF-16 units. A chunker written with
    // `.length` and `.slice` would put every later boundary one unit out and
    // Python would slice the wrong span (see `shared/ingest/text.ts`).
    const content = `𠮟${'あ'.repeat(TARGET * 2)}`
    const chunks = expectTiling(content)

    expect(chunks[0]).toMatchObject({ charStart: 0, charEnd: TARGET })
    expect(countCharacters(content)).toBe(TARGET * 2 + 1)
    expect(chunks.at(-1)!.charEnd).toBe(TARGET * 2 + 1)
  })
})

describe('the degenerate inputs, which the handler refuses before reaching here', () => {
  // `chunkBoundaries` is a total function anyway: a chunker that throws on empty
  // input makes the caller's ordering load-bearing, and `04` §5.2's
  // `CHECK (char_end > char_start)` means a zero-width chunk could never be
  // written even if one were produced.
  it('returns no chunks for empty content', () => {
    expect(chunkBoundaries('', 'prose')).toEqual([])
    expect(chunkBoundaries('', 'word_list')).toEqual([])
  })

  it('returns one chunk for content that is entirely a terminator', () => {
    expect(chunkBoundaries('。', 'prose')).toEqual([{ ordinal: 0, charStart: 0, charEnd: 1 }])
  })

  it('returns one chunk for a word list of nothing but blank lines', () => {
    // No term is ever counted, so no boundary is ever placed — and the tiling
    // still has to hold, because it is what makes a position attributable.
    // `readSubmission` refuses this long before here (`09` §4.2).
    expect(chunkBoundaries('\n  \n', 'word_list')).toEqual([
      { ordinal: 0, charStart: 0, charEnd: 4 },
    ])
  })
})

// ⚠️ ADR 0063: a *word list* is one term per line and its boundary is the 25th
// term. Not ADR 0041's 1200 characters — a list has no sentences for that rule
// to find, so it would degenerate into its own hard-break branch and cut
// mid-term.
describe('a word list', () => {
  const list = (terms: number, from = 1) =>
    Array.from({ length: terms }, (_, index) => `語${from + index}`).join('\n')

  it('is one chunk when it holds no more terms than the target', () => {
    const chunks = expectTiling(list(CHUNK_TARGET_TERMS), 'word_list')
    expect(chunks).toHaveLength(1)
  })

  it('breaks after the 25th term, and the newline belongs to the chunk it ends', () => {
    const content = list(CHUNK_TARGET_TERMS + 1)
    const chunks = expectTiling(content, 'word_list')

    expect(chunks).toHaveLength(2)
    // 25 terms of three characters each, plus the newline that ends each of
    // them — the boundary falls after the 25th newline, so the second chunk
    // opens on a term rather than on a line ending.
    const first = sliceCharacters(content, chunks[0]!.charStart, chunks[0]!.charEnd)
    expect(first.split('\n').filter(Boolean)).toHaveLength(CHUNK_TARGET_TERMS)
    const second = sliceCharacters(content, chunks[1]!.charStart, chunks[1]!.charEnd)
    expect(second).toBe('語26')
  })

  it('counts terms and not lines, so blank lines do not shorten a chunk', () => {
    // ⚠️ The count is `BLANK` — the class Python's `is_blank` uses too. A blank
    // line one language counted and the other did not would be a chunk holding
    // 25 terms on one side of the repository and 24 on the other.
    const content = list(CHUNK_TARGET_TERMS).split('\n').join('\n\n')
    const chunks = expectTiling(content, 'word_list')

    expect(chunks).toHaveLength(1)
  })

  it('tiles a long list exactly, at 25 terms a chunk', () => {
    const content = list(CHUNK_TARGET_TERMS * 3 + 4)
    const chunks = expectTiling(content, 'word_list')

    expect(chunks).toHaveLength(4)
    const counted = chunks.map(chunk =>
      sliceCharacters(content, chunk.charStart, chunk.charEnd)
        .split('\n')
        .filter(line => line.trim().length > 0).length,
    )
    expect(counted).toEqual([
      CHUNK_TARGET_TERMS,
      CHUNK_TARGET_TERMS,
      CHUNK_TARGET_TERMS,
      4,
    ])
  })

  it('is deterministic, which is what makes the chunk hash a cache key', () => {
    const content = list(CHUNK_TARGET_TERMS * 2)
    expect(chunkBoundaries(content, 'word_list'))
      .toEqual(chunkBoundaries(content, 'word_list'))
  })

  it('⚠️ counts in code points, like the prose rule', () => {
    // 𠮟 is U+20B9F — one code point, two UTF-16 units. The boundary after the
    // 25th term therefore falls one **unit** earlier than `.length` would put
    // it, and Python slices the chunk back out by these offsets
    // (`shared/ingest/text.ts`).
    const lines = ['𠮟', ...list(CHUNK_TARGET_TERMS).split('\n')]
    const content = lines.join('\n')
    const chunks = expectTiling(content, 'word_list')

    expect(chunks).toHaveLength(2)

    // The first 25 lines, and the newline that ends the 25th.
    const head = `${lines.slice(0, CHUNK_TARGET_TERMS).join('\n')}\n`
    expect(chunks[0]!.charEnd).toBe(countCharacters(head))
    expect(chunks[0]!.charEnd).toBeLessThan(head.length)
  })

  it('⚠️ chunks the same content differently from prose, which is the point', () => {
    const content = list(CHUNK_TARGET_TERMS * 2)

    expect(chunkBoundaries(content, 'word_list')).toHaveLength(2)
    // The same characters as prose are well under the 1200-character target.
    expect(chunkBoundaries(content, 'prose')).toHaveLength(1)
  })
})
