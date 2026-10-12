/**
 * The review-load brake — [ADR 0066](../../docs/adr/0066-the-review-load-has-a-brake.md),
 * the arithmetic around `compose` rather than inside it.
 *
 * ⚠️ **The allowance is counted at composition, from `review_session.new_count`,
 * and never from first *scheduling epochs*** (ADR 0066 §3). An epoch is written
 * by the first *grade*, so counting epochs counts what was *answered* — a reader
 * who composes twenty new *cards* and answers none would have used none of the
 * day and could do it again. The brake governs what is put in front of the
 * reader. An abandoned run burns its share of the day, which errs toward fewer
 * new *cards* and repairs itself tomorrow.
 *
 * ⚠️ **The day is `shared/time/local-day.ts`'s and nobody else's.** This is the
 * second importer that file was shaped for; a second day rule here — midnight,
 * or UTC, or `date_trunc` in the query — would be a cap that resets at a
 * different hour from the *consistency* figure on `/stats`.
 */

import { localDayKey } from '../time/local-day'
import type { StudyLimits } from './limits'

/** One composed *session*, as the allowance needs to see it. */
export interface ComposedSession {
  /** `review_session.started_at` — the server's clock, at composition. */
  startedAt: Date
  newCount: number
}

/**
 * How many new *cards* were put in front of the reader on the local day `now`
 * falls in, in `zone`.
 *
 * ⚠️ **The caller may hand over more than today.** The query reads a window
 * wider than any local day can be, and which of those sessions are *today* is
 * decided here by day key — so the rule is the one `local-day.ts` tests, and not
 * an interval arithmetic that is wrong on a daylight-saving morning.
 */
export function introducedToday(sessions: ComposedSession[], now: Date, zone: string): number {
  const today = localDayKey(now, zone)

  return sessions
    .filter(session => localDayKey(session.startedAt, zone) === today)
    .reduce((sum, session) => sum + session.newCount, 0)
}

/** ADR 0066 §3: the day's limit less `sum(new_count)`, and never below nothing. */
export function newAllowance(introduced: number, limits: StudyLimits): number {
  return Math.max(0, limits.dailyNew - introduced)
}

/** What *Review* tells the reader about the brake (ADR 0066 §7). */
export interface BrakeReading {
  /** New words put in front of the reader today, a live lesson's included. */
  introducedToday: number
  /** Due *cards* outstanding, over the whole set rather than the *session*. */
  dueCount: number
}

/**
 * Which brake is on.
 *
 * ⚠️ **`paused` wins over `spent`** because it is the one the reader can do
 * something about tonight: clearing the backlog is in their hands, and the
 * day's allowance is not.
 */
export type BrakeState = 'paused' | 'spent' | 'open'

export function brakeState(reading: BrakeReading, limits: StudyLimits): BrakeState {
  if (reading.dueCount >= limits.pauseAbove)
    return 'paused'

  return reading.introducedToday >= limits.dailyNew ? 'spent' : 'open'
}

/**
 * How many new words the brake would let **one lesson** teach now (ADR 0076
 * §1): the lesson's size, or what is left of the day, or nothing while the
 * backlog is at the gate.
 */
export function lessonRoom(reading: BrakeReading, limits: StudyLimits): number {
  if (brakeState(reading, limits) === 'paused')
    return 0

  return Math.min(limits.lessonSize, newAllowance(reading.introducedToday, limits))
}

/**
 * How many new words the next lesson can teach — the start block's `· N new`.
 */
export function newOnOffer(reading: BrakeReading, waiting: number, limits: StudyLimits): number {
  return Math.min(lessonRoom(reading, limits), waiting)
}

/**
 * The sentence, in ADR 0066 §7's words — *no new words today, 63 due* or
 * *10 of 10 new words today*.
 *
 * ⚠️ **A brake that is silent is a bug report** (ADR 0066 §7). The reader who
 * does not know why new words stopped concludes the app is broken, and there is
 * only one reader — so the open state says its number too, and the reader
 * learns the limit before meeting it.
 *
 * ⚠️ **`introducedToday` can exceed the limit** — two tabs composing at the
 * same instant each read the same allowance, and a limit lowered in settings
 * after lunch — and the sentence says what happened rather than clamping it
 * into a fiction.
 */
export function brakeSentence(reading: BrakeReading, limits: StudyLimits): string {
  if (brakeState(reading, limits) === 'paused')
    return `No new words today, ${reading.dueCount} due.`

  return `${reading.introducedToday} of ${limits.dailyNew} new words today.`
}
