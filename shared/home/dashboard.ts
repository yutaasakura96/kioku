/**
 * Home's arithmetic — [ADR 0078](../../docs/adr/0078-home-is-the-landing-place-and-more-holds-the-rest.md),
 * the prototype's `vHome` (`docs/prototype/`). The read is
 * `server/utils/home/queries.ts`; everything here is pure, so the numbers on
 * the dashboard are tested without a database (`11` §8).
 *
 * ⚠️ **What the prototype drew as sample text, this computes from rows**, and
 * where the two cannot agree the rows win: *in 4 hours* is a scheduler this
 * app does not run (ADR 0076 §1), so the second figure is *later today*.
 */

import { localDayKey, windowStartKey } from '../time/local-day'
import type { ShelfRow } from '../category/shelf'
import type { StudyOffer } from '../review/offer'
import type { Stage } from '../review/stage'

/** What Home draws, read by `server/utils/home/queries.ts`. */
export interface HomeData {
  /**
   * ⚠️ **Welcome, rather than the dashboard**: the reader has chosen no
   * *category* and has never composed a run in this *subject*. Choosing a
   * level on Welcome writes the row, so Welcome is seen once.
   */
  firstVisit: boolean
  /** Whether any word has been graded — the prototype's day one is `false`. */
  hasHistory: boolean
  offer: StudyOffer
  /** The JLPT rows of the shelf, for *Progress by level*. */
  levels: ShelfRow[]
  comingUp: ComingUp
  days: StudyDay[]
  weak: WeakWord[]
}

// -- Coming up ----------------------------------------------------------------

/** The four figures under *Coming up*, disjoint, in the order drawn. */
export interface ComingUp {
  /** Due now or overdue — what a review run would hold. */
  now: number
  /** Later in the reader's local day (04:00 to 04:00, ADR 0066 §4). */
  laterToday: number
  /** The next local day. */
  tomorrow: number
  /** The five local days after tomorrow, which with the three above make a week. */
  laterThisWeek: number
}

/**
 * Sort due instants into the four figures. ⚠️ **Disjoint**, so the four add up
 * to the week: the prototype's *this week* could be read as including the
 * three before it, and a reader adding them up would get two answers.
 */
export function comingUp(dues: Date[], now: Date, zone: string): ComingUp {
  const today = localDayKey(now, zone)
  const tomorrow = keyAfter(today, 1)
  const weekEnd = keyAfter(today, 6)

  const figures: ComingUp = { now: 0, laterToday: 0, tomorrow: 0, laterThisWeek: 0 }

  for (const due of dues) {
    if (due.getTime() <= now.getTime()) {
      figures.now += 1
      continue
    }

    const key = localDayKey(due, zone)
    if (key === today)
      figures.laterToday += 1
    else if (key === tomorrow)
      figures.tomorrow += 1
    else if (key <= weekEnd)
      figures.laterThisWeek += 1
  }

  return figures
}

/** The day key `days` after `key`. Keys are `YYYY-MM-DD` and compare as strings. */
function keyAfter(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

// -- The last fourteen days ---------------------------------------------------

/** How many days the strip shows — the prototype's fourteen. */
export const STUDY_DAYS_SHOWN = 14

export interface StudyDay {
  key: string
  studied: boolean
  today: boolean
}

/**
 * The strip under *Last 14 days*: one square a local day, oldest first, filled
 * when the reader graded anything that day. ⚠️ **A *grade* is what counts**, as
 * it is for *consistency* on `/stats` (ADR 0062): opening a lesson and leaving
 * it is not a day studied.
 */
export function studyDays(gradedAt: Date[], now: Date, zone: string, days = STUDY_DAYS_SHOWN): StudyDay[] {
  const studied = new Set(gradedAt.map(instant => localDayKey(instant, zone)))
  const today = localDayKey(now, zone)
  const first = windowStartKey(now, zone, days)

  return Array.from({ length: days }, (_, index) => {
    const key = keyAfter(first, index)
    return { key, studied: studied.has(key), today: key === today }
  })
}

// -- Weak words ---------------------------------------------------------------

/**
 * ⚠️ **The rule is this ticket's and is not measured**, like ADR 0076 §7's two
 * stage thresholds: a word is weak when it has been missed at least twice and
 * still stands at *Learning*. Twice, because one miss is ordinary; *Learning*,
 * because a word missed twice in its first week and *Known* since is not one
 * the reader keeps missing.
 */
export const WEAK_MIN_MISSES = 2

/** How many weak words Home lists — the prototype's four. */
export const WEAK_WORDS_SHOWN = 4

/** One word's record, as the read gives it. */
export interface WordRecord {
  cardId: string
  fields: Record<string, string>
  /** Every *grade* the word has had in this *subject*. */
  answers: number
  /** How many of them were Forgot. */
  misses: number
  /** Where the word stands now, or `null` with no live epoch. */
  stage: Stage | null
}

export interface WeakWord {
  cardId: string
  fields: Record<string, string>
  answers: number
  misses: number
}

/**
 * The words the reader keeps missing, most missed first, then the larger share
 * missed, then the card id so the order is stable between page loads.
 */
export function weakWords(records: WordRecord[], shown = WEAK_WORDS_SHOWN): WeakWord[] {
  return records
    .filter(record => record.misses >= WEAK_MIN_MISSES && record.stage === 'learning')
    .sort((a, b) =>
      b.misses - a.misses
      || b.misses / b.answers - a.misses / a.answers
      || a.cardId.localeCompare(b.cardId))
    .slice(0, shown)
    .map(({ cardId, fields, answers, misses }) => ({ cardId, fields, answers, misses }))
}

/** *missed 4 of 6* — the prototype's note beside a weak word. */
export function missedNote(word: Pick<WeakWord, 'answers' | 'misses'>): string {
  return `missed ${word.misses} of ${word.answers}`
}

// -- The two cards ------------------------------------------------------------

/** What a hero card says under its figure when it has something to start. */
export function reviewsHint(due: number, hasHistory: boolean): string {
  if (due > 0)
    return 'Words you have learned that are due again. Type the meaning and the reading.'

  return hasHistory
    ? 'Nothing due right now.'
    : 'Nothing to review yet. Words appear here after your first lesson.'
}

/**
 * *5 new words from JLPT N5, then a quiz on them. Up to 10 new words a day.* —
 * with the reader's lesson size and daily allowance, which are settings
 * (ADR 0076 §2), and the active *category*'s name (ADR 0077).
 */
export function lessonsHint(lesson: number, categoryName: string, dailyNew: number): string {
  const words = lesson === 1 ? 'word' : 'words'
  return `${lesson} new ${words} from ${categoryName}, then a quiz on them. Up to ${dailyNew} new ${dailyNew === 1 ? 'word' : 'words'} a day.`
}
