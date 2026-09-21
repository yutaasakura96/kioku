/**
 * The readings of a term's kanji that are not the word's reading —
 * [ADR 0069](../../docs/adr/0069-the-check-is-the-grade.md) §5, #30, and
 * `docs/kanjidic-research.md` §3.3 and §4.
 *
 * When the reader types one of these, the reading step says *the word's reading,
 * not the kanji's* and lets them type once more (`readingResult` in `answer.ts`).
 * The server computes the list at composition and snapshots it with the position
 * (`kanjiReadings`), so the table never reaches the client (research §5, (c)).
 *
 * ⚠️ **Pure, and the table is a parameter.** The server passes KANJIDIC2's
 * derived table (`server/data/kanjidic/readings.json`); the tests pass a few
 * hand-written kanji, so a monthly refresh cannot change a test's colour.
 *
 * The three classes of term Yuta put in scope (research §7, call 3):
 * - **one kanji** (夢): every on and kun reading, whole and stem;
 * - **kanji with kana** (見る): kun **stems only**, plus the term's own kana, so
 *   that みえる, a reading of 見 and a different word, does not retry 見る;
 * - **compounds** (学校): every combination, with rendaku on a non-initial kanji
 *   and sokuon before another kanji.
 *
 * ⚠️ **Compounds cost something, and it was chosen with the cost in view**
 * (research §4.5): a real alternative reading that is also a combination
 * (今日, こんにち) is told it is the kanji's, a combination miss (大人, だいにん)
 * becomes a retry, and a jukujikun can only produce false retries. The one
 * retry per step is what bounds it.
 */

import { isKana } from 'wanakana'

import { foldReading } from './answer'

/** A kanji's readings in the table's shape: hiragana, kun okurigana after a `.`. */
export type KanjiTable = (kanji: string) => readonly string[] | undefined

/**
 * Past this many, a term has no candidates rather than some. The largest measured
 * over the 475 *notes* on Neon was 576 (research §4.4); a partial list would make
 * which readings retry depend on the order they were generated in.
 */
export const MAX_CANDIDATES = 1024

const REPEAT_MARK = '々'

/** Rendaku: the first mora of a non-initial kanji voiced. は-row gives ば and ぱ. */
const VOICED: Record<string, readonly string[]> = {
  か: ['が'], き: ['ぎ'], く: ['ぐ'], け: ['げ'], こ: ['ご'],
  さ: ['ざ'], し: ['じ'], す: ['ず'], せ: ['ぜ'], そ: ['ぞ'],
  た: ['だ'], ち: ['ぢ'], つ: ['づ'], て: ['で'], と: ['ど'],
  は: ['ば', 'ぱ'], ひ: ['び', 'ぴ'], ふ: ['ぶ', 'ぷ'], へ: ['べ', 'ぺ'], ほ: ['ぼ', 'ぽ'],
}

/** Sokuon: a final つ, ち, く or き before another kanji becomes っ (学 がく → がっ). */
const GEMINATES = new Set(['つ', 'ち', 'く', 'き'])

type Segment = { kind: 'kana', text: string } | { kind: 'kanji', readings: readonly string[] }

function segmentsOf(term: string, table: KanjiTable): Segment[] | null {
  const segments: Segment[] = []

  for (const char of term) {
    const last = segments.at(-1)

    if (isKana(char)) {
      if (last?.kind === 'kana')
        last.text += foldReading(char)
      else
        segments.push({ kind: 'kana', text: foldReading(char) })
      continue
    }

    const readings = char === REPEAT_MARK && last?.kind === 'kanji' ? last.readings : table(char)

    // ⚠️ **A character the table does not know gives the whole term nothing.**
    // Half a term's candidates would retry some combinations and not others.
    if (!readings || readings.length === 0)
      return null

    segments.push({ kind: 'kanji', readings })
  }

  return segments
}

/** One kanji's forms: stems always, and whole kun forms only in a term with no kana. */
function formsOf(readings: readonly string[], withKana: boolean): Set<string> {
  const forms = new Set<string>()

  for (const reading of readings) {
    forms.add(reading.split('.')[0]!)

    if (!withKana)
      forms.add(reading.replace('.', ''))
  }

  forms.delete('')
  return forms
}

function withVariants(forms: Set<string>, voiced: boolean, geminated: boolean): string[] {
  const all = new Set(forms)

  for (const form of forms) {
    const variants = voiced ? [form, ...(VOICED[form[0]!] ?? []).map(head => head + form.slice(1))] : [form]

    for (const variant of variants) {
      all.add(variant)

      if (geminated && variant.length > 1 && GEMINATES.has(variant.at(-1)!))
        all.add(`${variant.slice(0, -1)}っ`)
    }
  }

  return [...all]
}

export function kanjiReadingCandidates(term: string, reading: string, table: KanjiTable): string[] {
  const trimmed = term.trim()

  if (trimmed === '' || isKana(trimmed))
    return []

  const segments = segmentsOf(trimmed, table)
  if (!segments)
    return []

  const withKana = segments.some(segment => segment.kind === 'kana')
  let built = ['']

  for (const [index, segment] of segments.entries()) {
    const options = segment.kind === 'kana'
      ? [segment.text]
      : withVariants(
          formsOf(segment.readings, withKana),
          index > 0,
          segments[index + 1]?.kind === 'kanji',
        )

    if (built.length * options.length > MAX_CANDIDATES * 4)
      return []

    built = built.flatMap(prefix => options.map(option => prefix + option))
  }

  const own = foldReading(reading)
  const found = [...new Set(built)].filter(candidate => candidate !== own)

  return found.length > MAX_CANDIDATES ? [] : found.sort()
}
