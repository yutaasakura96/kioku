/**
 * The spot-check — [ADR 0079](../../docs/adr/0079-a-level-is-proved-and-placement-is-checked.md)
 * §4. A sample of the words a placement marks known is asked again in
 * reviews, a couple a day, to make sure.
 *
 * ⚠️ **Pure.** The writes are `server/utils/level/queries.ts`'s; which words,
 * in what order and on which day is decided here.
 */

import { SPOT_CHECKS_PER_DAY } from './thresholds'

/**
 * Each level's sample, taken in turns, so that the first days check every
 * level rather than all of N5 first.
 */
export function interleave<T>(samples: T[][]): T[] {
  const out: T[] = []
  const longest = Math.max(0, ...samples.map(sample => sample.length))

  for (let index = 0; index < longest; index += 1) {
    for (const sample of samples) {
      if (index < sample.length)
        out.push(sample[index]!)
    }
  }

  return out
}

/**
 * When each check comes due: `SPOT_CHECKS_PER_DAY` a day, from a day after
 * the placement. The first day is the reader's first lesson, not a quiz on
 * words they have just been told they know.
 */
export function spotCheckDues(count: number, placedAt: Date, perDay = SPOT_CHECKS_PER_DAY): Date[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(placedAt.getTime() + (Math.floor(index / perDay) + 1) * 86_400_000))
}

/** One spot-checked word's answers, as the read gives them. */
export interface CheckAnswer {
  cardId: string
  level: string
  /** `review_log.rating`: 1 is Forgot, anything else was right first try. */
  rating: number
  reviewedAt: Date
}

/**
 * Each level's checks: **the first answer to each word only**. A word missed
 * on its check comes back as a word to learn, and its later answers are about
 * learning it, not about whether the placement was right.
 */
export function tallyChecks(answers: CheckAnswer[]): Array<{ level: string, answered: number, right: number }> {
  const first = new Map<string, CheckAnswer>()

  for (const answer of answers) {
    const held = first.get(answer.cardId)
    if (!held || answer.reviewedAt.getTime() < held.reviewedAt.getTime())
      first.set(answer.cardId, answer)
  }

  const byLevel = new Map<string, { level: string, answered: number, right: number }>()
  for (const answer of first.values()) {
    const row = byLevel.get(answer.level) ?? { level: answer.level, answered: 0, right: 0 }
    row.answered += 1
    if (answer.rating > 1)
      row.right += 1
    byLevel.set(answer.level, row)
  }

  return [...byLevel.values()]
}
