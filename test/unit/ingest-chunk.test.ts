import { describe, expect, it } from 'vitest'

import { CHUNK_TARGET_CHARACTERS, chunkBoundaries } from '../../shared/ingest/chunk'
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

/** Every property in note 1, as one assertion, for any content. */
function expectTiling(content: string) {
  const chunks = chunkBoundaries(content)
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
    expect(chunkBoundaries(content)).toEqual(chunkBoundaries(content))
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
    expect(chunkBoundaries('')).toEqual([])
  })

  it('returns one chunk for content that is entirely a terminator', () => {
    expect(chunkBoundaries('。')).toEqual([{ ordinal: 0, charStart: 0, charEnd: 1 }])
  })
})
