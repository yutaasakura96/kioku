/**
 * *Review*'s check — [ADR 0060](../../docs/adr/0060-review-is-answered-by-typing-and-the-check-proposes-the-grade.md)
 * §5 and §6, as amended by [ADR 0069](../../docs/adr/0069-the-check-is-the-grade.md).
 * The reader types the reading, then the meaning; this decides whether each was
 * right and **which *grade* that is**.
 *
 * ⚠️ **The result is the *grade*, and nothing overrules it** (ADR 0069 §1). The
 * digits commit nothing; what replaces the override is a synonym the reader adds
 * for a refused meaning, after which the check runs again (§2). Nothing here is
 * persisted: the typed text and the result are ADR 0060's revisit condition,
 * not a column.
 *
 * ⚠️ **No matching logic lives in a component** (ADR 0060 §6, ADR 0045's
 * reason). `wanakana`'s `bind` converts as the reader types; deciding what counts
 * as the same reading happens here and only here.
 */

import { isKana, toHiragana } from 'wanakana'

import type { Grade } from './scheduler'

export type AnswerStep = 'reading' | 'meaning'

/**
 * Which steps a *card* asks, in order —
 * [ADR 0069](../../docs/adr/0069-the-check-is-the-grade.md) §4.
 *
 * ⚠️ **A term written only in kana is its own reading**, so asking for it tests
 * nothing but typing: such a *card* asks for the meaning only. `isKana` counts
 * `ー` as kana (コーヒー) and is false for an empty string, so a *note* with no
 * term keeps both steps rather than silently losing one. Measured 2026-09-21
 * against wanakana 5.3.1.
 */
export function answerSteps(term: string): readonly AnswerStep[] {
  return isKana(term.trim()) ? ['meaning'] : ['reading', 'meaning']
}

/**
 * The fold both sides of the reading pass through.
 *
 * ⚠️ **`convertLongVowelMark: false`, and ADR 0060 §5 is amended for it.**
 * Measured 2026-09-15 against wanakana 5.3.1: by default `toHiragana('コーヒー')`
 * is `こうひい`, while `ko-hi-` typed through the bound field is `こーひー` and
 * stays `こーひー` through the same fold. The default would mark every loanword
 * with a `ー` wrong however it was typed. With the option off, both are `こーひー`.
 */
export function foldReading(text: string): string {
  return toHiragana(text.trim(), { convertLongVowelMark: false })
}

export function readingMatches(typed: string, stored: string): boolean {
  const answer = foldReading(typed)

  if (answer === '')
    return false

  return answer === foldReading(stored)
}

/**
 * The reading step's result — ADR 0060 §5, and ADR 0069 §5 for `kanji`.
 *
 * `kanji` means the reader typed a reading of the term's kanji rather than the
 * word's (夢, む): the field says so and the reader types again. ⚠️ **The page
 * allows one such retry per step** (#30); a second `kanji` is graded `wrong`
 * there, not here, because how many times is the page's state and not the
 * check's. `kanjiReadings` is the position's list (`shared/review/kanji.ts`),
 * already without the word's own reading.
 */
export type ReadingResult = 'right' | 'kanji' | 'wrong'

export function readingResult(typed: string, stored: string, kanjiReadings: readonly string[]): ReadingResult {
  if (readingMatches(typed, stored))
    return 'right'

  const answer = foldReading(typed)

  return answer !== '' && kanjiReadings.some(reading => foldReading(reading) === answer) ? 'kanji' : 'wrong'
}

/** Lowercase, punctuation stripped, whitespace collapsed, one leading article gone. */
function normaliseMeaning(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:to|a|an|the) /, '')
}

/** ADR 0060 §5: 0 for up to 3 characters, 1 for 4–7, 2 for 8 or more. */
function allowedDistance(candidate: string): number {
  if (candidate.length <= 3)
    return 0

  return candidate.length <= 7 ? 1 : 2
}

/** Levenshtein, over code points so a stray non-ASCII letter counts once. */
function distance(a: string, b: string): number {
  const left = [...a]
  const right = [...b]
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let i = 1; i <= left.length; i++) {
    const row = [i]

    for (let j = 1; j <= right.length; j++) {
      const substitution = previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1)
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, substitution)
    }

    previous = row
  }

  return previous[right.length]!
}

/**
 * What a *note* accepts as its meaning — ADR 0069 §3.
 *
 * - `meaning` — the displayed gloss. ⚠️ **Always accepted, list or no list.**
 *   It is the *accepted*, frozen value (ADR 0052), and a *Vet* fix can change it
 *   after the list was written; a gloss the *card* shows the reader and then
 *   refuses would be the check contradicting the screen.
 * - `meanings` — the model's list (`note_meaning`), empty when the *note* has
 *   none yet, which is the fallback the ticket asks for: `meaning` alone.
 * - `synonyms` — the reader's own (`meaning_synonym`, ADR 0069 §2).
 */
export interface AcceptedMeanings {
  meaning: string
  meanings: readonly string[]
  synonyms: readonly string[]
}

/** Every accepted phrase, normalised: the gloss's pieces, the list and the synonyms. */
function candidates(accepted: AcceptedMeanings): string[] {
  return [
    ...accepted.meaning.split(/[,;/]/),
    ...accepted.meanings,
    ...accepted.synonyms,
  ]
    .map(normaliseMeaning)
    .filter(candidate => candidate !== '')
}

/**
 * ⚠️ **ADR 0060 §5's normalising and edit distance are unchanged**; only what
 * the answer is compared with grew. A plain string is `meaning` alone, the shape
 * every *card* had before ADR 0069.
 */
export function meaningMatches(typed: string, accepted: AcceptedMeanings | string): boolean {
  const answer = normaliseMeaning(typed)

  if (answer === '')
    return false

  const against = typeof accepted === 'string'
    ? { meaning: accepted, meanings: [], synonyms: [] }
    : accepted

  return candidates(against)
    .some(candidate => distance(answer, candidate) <= allowedDistance(candidate))
}

/**
 * Whether the back offers to add what was typed as a synonym — ADR 0069 §2.
 *
 * Only after a meaning step marked wrong, and only when something was typed:
 * an answer that normalises to nothing is not a meaning anyone could mean. ⚠️ **There is no synonym
 * for a reading**, so the reading's result plays no part here.
 */
export function synonymOffered(check: { meaning: boolean | null }, typedMeaning: string): boolean {
  // ⚠️ **Normalised, not trimmed**: `?!` is not empty and folds to nothing, so
  // as a synonym it could never match and the offer would never go away.
  return check.meaning === false && normaliseMeaning(typedMeaning) !== ''
}

export interface Check {
  /** `null` when the *card* has no reading step (ADR 0069 §4). */
  reading: boolean | null
  meaning: boolean
}

/**
 * The two *grades* the check can give — ADR 0069 §1. ⚠️ **Hard and Easy are
 * never emitted**: with no optimiser the default FSRS weights stand, and the
 * one habit they cannot absorb is Hard pressed on a real miss.
 */
export type CheckedGrade = Extract<Grade, 1 | 3>

/**
 * ADR 0060 §3's table, which ADR 0069 §1 makes the *grade*: `3` when both are
 * right, `1` when either is wrong. A *card* with no reading step is graded on
 * its meaning alone (ADR 0069 §4).
 */
export function gradeOf(check: Check): CheckedGrade {
  return check.reading !== false && check.meaning ? 3 : 1
}
