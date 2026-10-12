/**
 * What is waiting for the reader, and the sentences that say so — the screen
 * before a run and the summary's *What next* (ADR 0076 §8).
 *
 * ⚠️ **One shape for both**, because they answer the same question at two
 * moments: the server sends it with the run it composed or resumed, and again
 * with the answer that ends one. ⚠️ **Never read back out of `localStorage`**:
 * it is a fact about the database, and yesterday's would name yesterday's
 * allowance.
 *
 * The wording is the prototype's Home and summary (`docs/prototype/`), with the
 * real numbers in it. ⚠️ **Where the prototype says *in 4 hours* this says the
 * date the scheduler gave** (ADR 0076 §1): short-term scheduling is off, so
 * nothing graded today is back today.
 */

import { brakeState } from './brake'
import type { BrakeReading } from './brake'
import type { StudyLimits } from './limits'
import { nextDueLabel } from './next-due'
import type { SessionKind } from './snapshot'

export interface StudyOffer extends BrakeReading {
  /** New words the next lesson would teach — `0` when the brake is on or none are left. */
  lesson: number
  /**
   * Whether a new word is there to be taught at all, the brake aside. ⚠️ With
   * the day spent, this is what tells *nothing left* from *held back* (ADR 0066
   * §7): a brake that is silent is a bug report.
   */
  waiting: boolean
  /** The reader's settings, so the sentence can name the limit it met. */
  limits: StudyLimits
  /** The next instant a word is due — past, when reviews are waiting. Null with nothing scheduled. */
  nextDue: string | Date | null
}

export interface StartLines {
  statement: string
  body: string
}

const words = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/**
 * *Next reviews tomorrow, 08:40.* — or nothing, when no word is scheduled.
 *
 * ⚠️ `nextDueLabel` writes a datum, which opens with a capital. Here it is the
 * middle of a sentence, so *Today* and *Tomorrow* are lowered; a weekday keeps
 * its own.
 */
function nextReviews(offer: StudyOffer, now: Date): string {
  const label = offer.nextDue ? nextDueLabel(new Date(offer.nextDue), now) : null

  return label ? `Next reviews ${label.replace(/^(Today|Tomorrow)/, day => day.toLowerCase())}.` : ''
}

/**
 * Why no lesson is on offer, in a sentence — or `''` when one is.
 *
 * ⚠️ **Each reason has its own**, and all but the first are the app or the
 * reader deciding: read as *nothing new*, any of them would be the brake
 * looking like a bug.
 */
export function noLessonLine(offer: StudyOffer, filtered = false): string {
  if (offer.lesson > 0)
    return ''

  if (!offer.waiting)
    return filtered ? 'No new word matches the filter.' : 'There are no new words left to learn.'

  if (offer.limits.dailyNew === 0)
    return 'New words are switched off in settings.'

  switch (brakeState(offer, offer.limits)) {
    case 'paused':
      return `No new words while ${offer.limits.pauseAbove} or more reviews wait. ${offer.dueCount} are waiting.`
    case 'spent':
      return 'You have had today\'s new words. More tomorrow, so reviews stay manageable.'
    default:
      return ''
  }
}

/** The screen before a run: what is waiting, as the prototype's Home says it. */
export function startLines(offer: StudyOffer, now: Date = new Date(), filtered = false): StartLines {
  const due = offer.dueCount
  const lesson = offer.lesson

  if (due > 0 && lesson > 0) {
    return {
      statement: `${words(due, 'word', 'words')} to review, then ${words(lesson, 'new one', 'new ones')}.`,
      body: 'Reviews first, so nothing slips.',
    }
  }

  if (due > 0)
    return { statement: `${words(due, 'word', 'words')} to review.`, body: noLessonLine(offer, filtered) }

  if (lesson > 0) {
    // Nothing scheduled yet is the first visit: the prototype's day one.
    return offer.nextDue === null
      ? { statement: `Start with your first ${words(lesson, 'word', 'words')}.`, body: 'A short lesson, then a quiz on the same words.' }
      : { statement: `Reviews are done. ${words(lesson, 'new word is', 'new words are')} ready.`, body: nextReviews(offer, now) }
  }

  return {
    statement: 'All done for now.',
    body: [nextReviews(offer, now), noLessonLine(offer, filtered)].filter(line => line !== '').join(' '),
  }
}

export interface NextStep {
  body: string
  /** The run the summary offers next, or `null` for *Back to Home* alone. */
  start: SessionKind | null
}

/**
 * The summary's *What next* (prototype `vSummary`): reviews still waiting come
 * first, then a lesson, then nothing.
 */
export function whatNext(offer: StudyOffer, now: Date = new Date()): NextStep {
  if (offer.dueCount > 0) {
    return {
      body: `${words(offer.dueCount, 'review is', 'reviews are')} still waiting.`,
      start: 'review',
    }
  }

  const next = nextReviews(offer, now)

  if (offer.lesson > 0) {
    return {
      body: `${next} You also have ${words(offer.lesson, 'new word', 'new words')} ready.`.trim(),
      start: 'lesson',
    }
  }

  return { body: ['Nothing else due.', next, noLessonLine(offer)].filter(line => line !== '').join(' '), start: null }
}
