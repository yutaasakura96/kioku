/**
 * *Review*'s check — [ADR 0060](../../docs/adr/0060-review-is-answered-by-typing-and-the-check-proposes-the-grade.md)
 * §5 and §6. The reader types the reading, then the meaning; this decides
 * whether each was right and which *grade* to **propose**.
 *
 * ⚠️ **It proposes and never commits.** The digits `1`–`4` still commit any
 * *grade* (ADR 0016), so a wrong result is a keystroke to overrule rather than a
 * lapse recorded. Nothing here is persisted: the typed text and the result are
 * ADR 0060's revisit condition, not a column.
 *
 * ⚠️ **No matching logic lives in a component** (ADR 0060 §6, ADR 0045's
 * reason). `wanakana`'s `bind` converts as the reader types; deciding what counts
 * as the same reading happens here and only here.
 */

import { toHiragana } from 'wanakana'

import type { Grade } from './scheduler'

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
 * ⚠️ **The stored `meaning` is the *accepted*, frozen value** (ADR 0052), so an
 * edit made at *vetting* defines what counts as right here. That is intended.
 */
export function meaningMatches(typed: string, stored: string): boolean {
  const answer = normaliseMeaning(typed)

  if (answer === '')
    return false

  return stored
    .split(/[,;/]/)
    .map(normaliseMeaning)
    .filter(candidate => candidate !== '')
    .some(candidate => distance(answer, candidate) <= allowedDistance(candidate))
}

export interface Check {
  reading: boolean
  meaning: boolean
}

/** ADR 0060 §3's table: `3` when both are right, `1` when either is wrong. */
export function proposedGrade(check: Check): Grade {
  return check.reading && check.meaning ? 3 : 1
}
