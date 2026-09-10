/**
 * Characters, not bytes — and not code units either.
 *
 * `04` §1 says "character offsets are **characters, not bytes**. Japanese makes
 * the distinction load-bearing", and every column in `04` that carries a
 * position says the same: `source.char_count`, `source_chunk.char_start` /
 * `char_end`, `occurrence.char_start` / `char_end`.
 *
 * ⚠️ **There is a second distinction underneath that one, and it is the one that
 * bites across the two toolchains.** JavaScript strings are UTF-16, so
 * `'𠮟'.length` is 2; Python strings are sequences of code points, so
 * `len('𠮟')` is 1. The app writes the offsets and the worker reads them — a
 * single character outside the BMP in a *source* puts every later offset one out
 * on the Python side, silently, and the symptom arrives months later as an
 * *occurrence* pointing at the wrong span.
 *
 * This is the same class of divergence #3 found between `trim()` and
 * `str.strip()` (`00-status.md` § Carrying): two implementations over one piece
 * of data, both green, disagreeing. It is closed here by never counting or
 * slicing with `.length` and `.slice` anywhere in the ingest path —
 * `test/unit/ingest-text.test.ts` is the guard.
 *
 * ⚠️ **A code point is still not a grapheme.** `Intl.Segmenter` would count
 * user-perceived characters, and it is deliberately not used: the contract is
 * with Python's `len()`, not with a reader's intuition, because it is Python
 * that slices the text back out.
 */

/**
 * Unicode NFC, which is what `04` §5.1 hashes.
 *
 * `content_hash` is "SHA-256 hex of NFC-normalised `content`", so normalisation
 * has to happen **before** the hash — and therefore before the character count,
 * before the cap and before the chunk offsets, or those four disagree about what
 * the text is. `server/utils/ingest/submission.ts` normalises once, on arrival,
 * and everything downstream reads the normalised text.
 */
export function toNfc(text: string): string {
  return text.normalize('NFC')
}

/** The number of code points — what Python's `len()` will say. */
export function countCharacters(text: string): number {
  // `Array.from` iterates by code point. So does the spread form; this one names
  // what it is doing.
  return Array.from(text).length
}

/**
 * `text[start:end]` as Python would evaluate it — a half-open range in code
 * points.
 */
export function sliceCharacters(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join('')
}
