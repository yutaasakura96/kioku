/**
 * The deterministic division of a *source*'s content — `04` §5.2.
 *
 * ⚠️ **No document specifies the rule.** `04` §5.2 states the property ("chunk
 * boundaries are a function of content, so they are shared and stable across
 * re-ingestions") and `03` §5.1 names stage 1 ("accept and chunk the source"),
 * but the size and the boundary are decided here, with #6, because #6 is the
 * ticket that writes `source_chunk` rows. The decision and its alternatives are
 * in `06-decision-log.md`; what follows is why it is shaped this way.
 *
 * **1200 characters** is `04` §5.2's own worked example — `(…, 0, 0, 1200, …)` —
 * and it is the only number about chunking anywhere in the documents. It is a
 * *target*, not a floor: a chunk is at most 1200 characters and usually a little
 * under.
 *
 * **The boundary is the last sentence terminator at or before the target**,
 * because stage 2 tokenises each chunk with SudachiPy independently (`03` §5.1).
 * A cut inside a word yields two fragments that are not the word, at both edges
 * of the cut, and `03` §5.2 has already found that stage 2's output feeds
 * `normalized_form`, which is half of ADR 0006's *identity key* — a fragment
 * that survives to a *note* is a note about a word that does not exist. Cutting
 * between sentences is not a guarantee against that (a terminator is not a word
 * boundary in general) but it is where the risk is lowest, and it costs nothing.
 *
 * ⚠️ **When the window holds no terminator, it hard-breaks at the target.** A
 * paste with no punctuation is ordinary — a vocabulary list, a table out of a
 * PDF — and a rule that searches backwards without a floor either returns a
 * chunk of one character or does not terminate. The bounded form is the one that
 * always answers.
 *
 * Three properties hold and `test/unit/ingest-chunk.test.ts` asserts each:
 *
 *  - **The chunks tile the content exactly.** `occurrence.char_start` is a
 *    position in the *source* and `occurrence.source_chunk_id` says which chunk
 *    found it (`04` §5.5); a gap makes a position unattributable, and an overlap
 *    lets one *occurrence* be found twice.
 *  - **Same content in, same boundaries out.** This is what `04` §5.2 means by
 *    stable across re-ingestions, and it is what makes
 *    `source_chunk.content_hash` sound as the first element of the generation
 *    cache key (`04` §6.3).
 *  - **Every offset is a code point**, not a UTF-16 unit — `shared/ingest/text.ts`
 *    carries that argument, and it is the one that crosses to Python.
 */

/**
 * The target and the hard maximum, in characters. `04` §5.2's worked example.
 *
 * ⚠️ **Moving this changes `source_chunk.content_hash` for every source ingested
 * after the change**, which changes the first element of the generation cache
 * key (`04` §6.3) — so old cache entries stop being found and the next
 * re-ingestion pays full price. That is a cost, not a corruption: unlike a
 * `SudachiDict` bump it cannot change the identity of an existing *note*,
 * because chunk boundaries do not reach `normalized_form`. It is safe to change
 * and it is not free.
 */
export const CHUNK_TARGET_CHARACTERS = 1200

/**
 * Where a chunk may end. The terminator belongs to the chunk it ends.
 *
 * `\n` is here because pasted prose is paragraphed with it and a paragraph break
 * is the strongest boundary in the text. The three full-width marks are the
 * Japanese sentence enders; ASCII `.` is deliberately **absent** — it appears
 * inside numbers, URLs and Latin abbreviations far more often than it ends a
 * sentence in a Japanese *source*.
 */
const TERMINATORS = new Set(['。', '！', '？', '\n'])

export interface ChunkBoundary {
  /** 0-based — `04` §5.2's `UNIQUE (source_id, ordinal)`. */
  ordinal: number
  charStart: number
  /** Exclusive. `04` §5.2's `CHECK (char_end > char_start)`. */
  charEnd: number
}

/**
 * Divides content into chunks. Total: empty content gives no chunks rather than
 * throwing, so the caller's ordering is not load-bearing. The handler refuses
 * empty content long before this (`09` §4.2).
 */
export function chunkBoundaries(content: string): ChunkBoundary[] {
  // One pass to code points, then everything below indexes that array. Doing it
  // per chunk would be quadratic on a 100,000-character paste.
  const characters = Array.from(content)
  const total = characters.length

  const chunks: ChunkBoundary[] = []
  let start = 0

  while (start < total) {
    const end = nextBoundary(characters, start, total)
    chunks.push({ ordinal: chunks.length, charStart: start, charEnd: end })
    start = end
  }

  return chunks
}

function nextBoundary(characters: string[], start: number, total: number): number {
  const limit = start + CHUNK_TARGET_CHARACTERS

  // The tail fits. This is also the only branch that can return a chunk shorter
  // than the target without a terminator in it.
  if (limit >= total)
    return total

  // Backwards from the target to the character after `start`. Stopping at
  // `start + 1` rather than `start` is what keeps a chunk non-empty when the
  // very first character is a terminator — `04` §5.2's
  // `CHECK (char_end > char_start)` is the same rule in the schema.
  for (let index = limit - 1; index > start; index--) {
    if (TERMINATORS.has(characters[index]!))
      return index + 1
  }

  return limit
}
