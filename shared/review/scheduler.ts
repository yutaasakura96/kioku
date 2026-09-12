/**
 * The FSRS wrapper — `11` §8's named seam, and the second of #12's two.
 *
 * ⚠️ **The scheduler is not ours; the wrapper is.** `ts-fsrs` 5.4.2 is pinned
 * (`03` §13.5) and has its own suite, so nothing here re-implements or re-tests
 * the arithmetic. What lives here is exactly two things: **the mapping to and
 * from `scheduling_epoch` and `review_log`**, and **the configuration**.
 *
 * ⚠️ **The configuration is ADR 0016 and it is the half that is invisible when
 * it breaks.** `enable_short_term: false` selects `LongTermScheduler`, which
 * schedules all four grades in *days*, and `next_interval` clamps at
 * `Math.max(1, …)` before fuzz — so the soonest a graded *card* comes back is
 * **tomorrow** (verification §13.1). That is what makes a *session* a fixed
 * size, what lets the *progress rail* know its own length, and what retired the
 * word "Again" (ADR 0034). Turn it back on and none of that fails loudly; it
 * surfaces months later as a worse retention curve.
 *
 * ⚠️ **`elapsed_days` stops here.** The library's `Card` and `ReviewLog` both
 * still carry it and it is deprecated and removed in 6.0.0 (verification §1.2),
 * so `04` §7.4 builds no column on it and this mapping is what keeps it out —
 * which is why the 5.4.2 → 6.0.0 major is a data review rather than a migration.
 */

import { createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs'
import type { Card } from 'ts-fsrs'

/** ADR 0016's four, and `04` §7.5's `CHECK (rating BETWEEN 1 AND 4)`. */
export const GRADES = [1, 2, 3, 4] as const

export type Grade = (typeof GRADES)[number]

/**
 * ⚠️ **ADR 0016, in the only two lines of it that are code.** Everything else
 * about daily workload — queue ordering, new-*card* introduction, review caps —
 * is the app's job and is deliberately absent (`03` §8, verification §1.4).
 */
export const SCHEDULER_PARAMETERS = generatorParameters({
  /** ADR 0016: a graded *card* always leaves the current *session*. */
  enable_short_term: false,
  /** ADR 0016's consequences: it "lives in the library and costs nothing". */
  enable_fuzz: true,
})

const scheduler = fsrs(SCHEDULER_PARAMETERS)

/**
 * `04` §7.4's columns, in the application's spelling.
 *
 * ⚠️ **The FSRS state lives on the *epoch*, not on the *card***, and that is the
 * decision the table exists to make: a reset is an `INSERT` rather than an
 * `UPDATE` over the history it is meant to preserve (ADR 0011, `S12`).
 */
export interface EpochState {
  due: Date
  stability: number
  difficulty: number
  scheduledDays: number
  /** ⚠️ Required, not optional (verification §1.2). */
  learningSteps: number
  reps: number
  lapses: number
  /** New 0, Learning 1, Review 2, Relearning 3. */
  state: number
  lastReview: Date | null
}

/**
 * `04` §7.5's columns — **the one thing in the system that cannot be
 * regenerated** (ADR 0011), so every field the optimiser consumes is written
 * from day one.
 *
 * ⚠️ **These are the values the *card* was answered at, not the ones the answer
 * produced.** `04` §7.5 says `state` is "the state *before* the grade"; the
 * library's own `buildLog` reads the card as it arrived, and a row written from
 * the *next* card would record every review as having happened in the state it
 * caused.
 */
export interface ReviewLogEntry {
  /** ⚠️ `rating` and not `grade`, because this mirrors `04` §7.5's column — which
   *  is the library's word (`ts-fsrs`'s `Rating`) and the one the row is read
   *  back under. Everywhere the application speaks for itself it says *grade*
   *  (`CONTEXT.md`). */
  rating: Grade
  state: number
  due: Date
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  /** ⚠️ The client's stamp — the moment the *grade* was given (ADR 0007). */
  reviewedAt: Date
}

/**
 * A *card*'s first *scheduling epoch* — ordinal 1, State.New, no history.
 *
 * ⚠️ **It is minted by the *session* that first schedules the *card*, and never
 * by acceptance.** `scheduling_epoch.card_id` is `RESTRICT` (`04` §9), so an
 * epoch written at acceptance would make ADR 0033's `Z` fail on **every**
 * acceptance the application ever makes — the database refuses the delete and
 * the undo is dead, with a failure that reads like a database problem rather
 * than a decision. `test/schema/vet.test.ts` asserts the absence.
 */
export function freshEpoch(now: Date): EpochState {
  return fromCard(createEmptyCard(now))
}

/**
 * One *grade* — the epoch the *card* moves to, and the row that records the
 * answer.
 *
 * ⚠️ **`reviewedAt` is the client's stamp and it is passed straight through**
 * (ADR 0007, `03` §8.1). FSRS schedules on elapsed time, so a *card* answered at
 * 09:00 underground and flushed at 18:00 would otherwise tell the scheduler that
 * recall took nine hours, and every interval derived from it is wrong six months
 * later. The server stamps `received_at` **beside** it, never over it. The rule
 * for a stamp the server cannot trust is `03` §8.2's and it is the grade
 * validator's, which is #13's.
 */
export function schedule(
  epoch: EpochState,
  grade: Grade,
  reviewedAt: Date,
): { epoch: EpochState, log: ReviewLogEntry } {
  const { card, log } = scheduler.next(toCard(epoch), reviewedAt, grade)

  return {
    epoch: fromCard(card),
    log: {
      rating: grade,
      state: log.state,
      due: log.due,
      stability: log.stability,
      difficulty: log.difficulty,
      scheduledDays: log.scheduled_days,
      learningSteps: log.learning_steps,
      reviewedAt: log.review,
    },
  }
}

/**
 * ⚠️ **`elapsed_days` is required by the type at 5.4.2 and the scheduler
 * ignores what it is given.** Measured 2026-09-12 against the pinned version:
 * `AbstractScheduler.init()` recomputes it as `dateDiffInDays(last_review,
 * review_time)` and overwrites the field before any of the four outcomes is
 * built, so the only thing the value here can reach is the log's
 * `last_elapsed_days` — which is the *other* deprecated field, and dropped at
 * the seam. **Zero is therefore the honest value rather than a placeholder**: it
 * is not a fact about the *card*, and this is the line that keeps `04` with no
 * column to migrate when 6.0.0 removes the field.
 */
function toCard(epoch: EpochState): Card {
  return {
    due: epoch.due,
    stability: epoch.stability,
    difficulty: epoch.difficulty,
    elapsed_days: 0,
    scheduled_days: epoch.scheduledDays,
    learning_steps: epoch.learningSteps,
    reps: epoch.reps,
    lapses: epoch.lapses,
    state: epoch.state,
    last_review: epoch.lastReview ?? undefined,
  }
}

function fromCard(card: Card): EpochState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  }
}
