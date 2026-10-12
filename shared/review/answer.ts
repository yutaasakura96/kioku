/**
 * *Review*'s check — [ADR 0060](../../docs/adr/0060-review-is-answered-by-typing-and-the-check-proposes-the-grade.md)
 * §5 and §6, as amended by [ADR 0069](../../docs/adr/0069-the-check-is-the-grade.md)
 * and [ADR 0076](../../docs/adr/0076-new-words-are-taught-in-a-lesson-and-a-miss-is-asked-again.md).
 * The reader types the meaning, then the reading; this decides whether each
 * answer was right. **Which *grade* a word gets from its answers is
 * `shared/review/quiz.ts`'s.**
 *
 * ⚠️ **Nothing overrules a result** (ADR 0069 §1, ADR 0076 §5). There is no key
 * that turns a wrong answer right, so a check that is too strict is paid for in
 * lapses, and one that is too loose in words marked known that are not. Nothing
 * here is persisted: the typed text is ADR 0060's revisit condition, not a
 * column.
 *
 * ⚠️ **No matching logic lives in a component** (ADR 0060 §6, ADR 0045's
 * reason). `wanakana`'s `bind` converts as the reader types; deciding what counts
 * as the same reading happens here and only here.
 */

import { isKana, toHiragana } from 'wanakana'

import type { Grade } from './scheduler'

export type AnswerStep = 'reading' | 'meaning'

/**
 * Which questions a word asks, in order — the meaning, then the reading
 * (ADR 0076 §3, which reversed ADR 0060 §2).
 *
 * ⚠️ **A term written only in kana is its own reading** (ADR 0069 §4), so
 * asking for it tests nothing but typing: such a word asks for the meaning
 * only. `isKana` counts `ー` as kana (コーヒー) and is false for an empty
 * string, so a *note* with no term keeps both questions rather than silently
 * losing one. Measured 2026-09-21 against wanakana 5.3.1.
 */
export function answerSteps(term: string): readonly AnswerStep[] {
  return isKana(term.trim()) ? ['meaning'] : ['meaning', 'reading']
}

/** Why an answer was not taken as one — ADR 0076 §5. Nothing is counted. */
export type EntryProblem = 'empty' | 'wrong_script'

/**
 * Whether what was typed can be checked as a reading at all.
 *
 * ⚠️ **Anything but kana is refused, not marked wrong.** Romaji the field has
 * not finished converting folds to kana first (`としょかn`), so what is left
 * is kanji or Latin letters that are no syllable — a slip of the keyboard, and
 * not what the reader thinks the word sounds like.
 */
export function readingEntry(typed: string): EntryProblem | null {
  const answer = foldReading(typed)

  if (answer === '')
    return 'empty'

  return isKana(answer) ? null : 'wrong_script'
}

/** Hiragana, katakana and the CJK ideographs, extension A included. */
const JAPANESE = /[\u3040-\u30FF\u3400-\u9FFF]/

/**
 * The same for a meaning: an answer that normalises to nothing is empty, and
 * one with Japanese in it was typed into the wrong field.
 */
export function meaningEntry(typed: string): EntryProblem | null {
  if (JAPANESE.test(typed))
    return 'wrong_script'

  return normaliseMeaning(typed) === '' ? 'empty' : null
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

/**
 * ADR 0076 §5, the prototype's numbers: none under 5 letters, one for 5 to 8,
 * two for 9 or more. ⚠️ **This was 0 / 4–7 / 8 until #70** (ADR 0060 §5).
 * Four-letter words are where one edit most often makes another word, and
 * nothing overrules the check.
 */
function allowedDistance(candidate: string): number {
  if (candidate.length < 5)
    return 0

  return candidate.length < 9 ? 1 : 2
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

const DIGIT = /^\d$/

/**
 * The gloss cut at `,`, `;` and `/` — ⚠️ **but not inside brackets.** JMdict
 * writes *to open (a door, etc.)*, and cut at every comma that is two answers,
 * one of which is *etc*. ⚠️ **Nor at a comma between two digits**: 万 is
 * *10,000; ten thousand*, and cut there it is taught as *10*.
 */
export function glossPieces(gloss: string): string[] {
  const characters = [...gloss]
  const pieces: string[] = []
  let depth = 0
  let piece = ''

  for (const [index, character] of characters.entries()) {
    if (character === '(')
      depth += 1
    else if (character === ')')
      depth = Math.max(0, depth - 1)

    const inNumber = character === ',' && DIGIT.test(characters[index - 1] ?? '') && DIGIT.test(characters[index + 1] ?? '')

    if (depth === 0 && !inNumber && (character === ',' || character === ';' || character === '/')) {
      pieces.push(piece)
      piece = ''
    }
    else {
      piece += character
    }
  }

  return [...pieces, piece].map(entry => entry.trim()).filter(entry => entry !== '')
}

/** Every accepted phrase, normalised: the gloss's pieces, the list and the synonyms. */
function candidates(accepted: AcceptedMeanings): string[] {
  return [
    ...glossPieces(accepted.meaning),
    ...accepted.meanings,
    ...accepted.synonyms,
  ]
    .map(normaliseMeaning)
    .filter(candidate => candidate !== '')
}

/**
 * `exact` is an accepted meaning as written; `close` is one within the edit
 * distance its length allows, which the screen marks right and answers with the
 * meaning itself (ADR 0076 §5).
 */
export type MeaningResult = 'exact' | 'close' | 'wrong'

/**
 * ⚠️ **ADR 0060 §5's normalising is unchanged**; what the answer is compared
 * with grew in ADR 0069 and the distance tightened in ADR 0076. A plain string
 * is `meaning` alone, the shape every *card* had before ADR 0069.
 */
export function meaningResult(typed: string, accepted: AcceptedMeanings | string): MeaningResult {
  const answer = normaliseMeaning(typed)

  if (answer === '')
    return 'wrong'

  const against = typeof accepted === 'string'
    ? { meaning: accepted, meanings: [], synonyms: [] }
    : accepted
  const all = candidates(against)

  if (all.includes(answer))
    return 'exact'

  return all.some(candidate => distance(answer, candidate) <= allowedDistance(candidate)) ? 'close' : 'wrong'
}

export function meaningMatches(typed: string, accepted: AcceptedMeanings | string): boolean {
  return meaningResult(typed, accepted) !== 'wrong'
}

/**
 * The prototype's *Also:* line — up to two pieces of the gloss the reader did
 * not type. ⚠️ **From the gloss and not the list**: the list is check data and
 * runs to forty entries, some of them a dictionary's asides.
 */
export function otherMeanings(typed: string, gloss: string, limit = 2): string[] {
  const seen = new Set([normaliseMeaning(typed)])
  const others: string[] = []

  for (const piece of glossPieces(gloss)) {
    const normal = normaliseMeaning(piece)

    if (normal === '' || seen.has(normal))
      continue

    seen.add(normal)
    others.push(piece)
  }

  return others.slice(0, limit)
}

/**
 * The two *grades* the check can give — ADR 0069 §1. ⚠️ **Hard and Easy are
 * never emitted**: with no optimiser the default FSRS weights stand, and the
 * one habit they cannot absorb is Hard pressed on a real miss.
 */
export type CheckedGrade = Extract<Grade, 1 | 3>
