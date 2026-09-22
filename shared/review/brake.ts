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
import { DAILY_NEW_CARDS, NEW_CARDS_PAUSED_ABOVE_DUE } from './compose'
import type { NothingToStudy } from './snapshot'

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

/** ADR 0066 §3: `10 - sum(new_count)`, and never below nothing. */
export function newAllowance(introduced: number): number {
  return Math.max(0, DAILY_NEW_CARDS - introduced)
}

/** What *Review* tells the reader about the brake (ADR 0066 §7). */
export interface BrakeReading {
  /** New *cards* composed today, this run's included. */
  introducedToday: number
  /** Due *cards* outstanding, over the whole set rather than the *session*. */
  dueCount: number
}

/**
 * Which brake is on.
 *
 * ⚠️ **`paused` wins over `spent`** because it is the one the reader can do
 * something about tonight: clearing the backlog below fifty is in their hands, and
 * the day's ten are not.
 */
export type BrakeState = 'paused' | 'spent' | 'open'

export function brakeState(reading: BrakeReading): BrakeState {
  if (reading.dueCount >= NEW_CARDS_PAUSED_ABOVE_DUE)
    return 'paused'

  return reading.introducedToday >= DAILY_NEW_CARDS ? 'spent' : 'open'
}

/**
 * How many new *cards* the brake would let the next composed *session*
 * introduce today — the start block's `· N new` (#33, `10` §3.2).
 *
 * ⚠️ **A day's figure, not a run's.** It is not capped by the *session*'s size
 * or by how much of it the due half fills: the start block says what today still
 * holds, and a run of twenty with fifteen due introduces five now and the rest
 * next time. `waiting` is the count of *cards* with no *scheduling epoch*, and
 * the caller may cap it at `DAILY_NEW_CARDS` — nothing past that changes the
 * answer.
 */
export function newOnOffer(reading: BrakeReading, waiting: number): number {
  if (brakeState(reading) === 'paused')
    return 0

  return Math.min(newAllowance(reading.introducedToday), waiting)
}

/**
 * The sentence, in ADR 0066 §7's words — *no new words today, 63 due* or
 * *10 of 10 new words today*.
 *
 * ⚠️ **A brake that is silent is a bug report** (ADR 0066 §7). The reader who
 * does not know why new words stopped concludes the app is broken, and there is only
 * one reader — so the open state says its number too, and the
 * reader learns the cap before meeting it.
 *
 * ⚠️ **`introducedToday` can exceed ten** — two tabs composing at the same
 * instant each read the same allowance — and the sentence says what happened
 * rather than clamping it into a fiction.
 */
export function brakeSentence(reading: BrakeReading): string {
  if (brakeState(reading) === 'paused')
    return `No new words today, ${reading.dueCount} due.`

  return `${reading.introducedToday} of ${DAILY_NEW_CARDS} new words today.`
}

/** `10` §5.7's three non-terminal empty states, as amended by #21. */
export type EmptyState = 'nothing-accepted' | 'nothing-due' | 'held-back'

/**
 * Which empty state the reader is in.
 *
 * ⚠️ **`held-back` is the third one and ADR 0066 §7 is why it exists.** A
 * reader with new words waiting, nothing due and the day's ten spent would
 * otherwise read *Nothing due* — true, and the one sentence that makes the brake
 * look like a bug. It cannot be the fifty-*card* gate: that needs fifty due, and
 * with fifty due there is a run to compose.
 */
export function emptyStateOf(nothing: NothingToStudy, brake: BrakeReading | null): EmptyState {
  if (!nothing.hasCards)
    return 'nothing-accepted'

  if (nothing.newWaiting && brake && brakeState(brake) !== 'open')
    return 'held-back'

  return 'nothing-due'
}
