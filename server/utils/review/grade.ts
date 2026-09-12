/**
 * One *grade* — the *scheduling epoch* it moves, and the `review_log` row it
 * writes, in one transaction.
 *
 * ⚠️ **This is where a *card*'s first *scheduling epoch* is minted, and the
 * constraint that says so is three tables away from the code that would put it
 * anywhere else.** `scheduling_epoch.card_id` is `RESTRICT` (`04` §9), so an
 * epoch written at acceptance makes ADR 0033's `Z` fail on **every** acceptance
 * the application ever makes — the database refuses the delete and the undo is
 * dead, with a failure that reads like a database problem rather than a
 * decision. `test/schema/vet.test.ts` asserts the absence. **The first epoch
 * belongs to the *session* that first schedules the *card*, and scheduling is
 * what a *grade* does.**
 *
 * ⚠️ **`review_log` is the one thing in the system that cannot be regenerated**
 * (ADR 0011, `03` §13.6). It is append-only and the trigger in
 * `server/db/migrations/0001_review_log_append_only.sql` refuses an `UPDATE` or
 * a `DELETE` against it, so everything below is an `INSERT` that has to be right
 * the first time.
 *
 * ⚠️ **The two timestamps are not redundant.** `reviewed_at` is the client's
 * stamp and feeds the scheduler (ADR 0007); `received_at` is the server's and
 * feeds `03` §12's *time-to-first-review*. Neither column can do the other's
 * job, and the server never stamps a *grade* on receipt. **The rule for a stamp
 * the server cannot trust is `03` §8.2's and it is the grade validator's, which
 * is #13's** — this records the skew rather than judging it.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { completeSession } from './session'
import { freshEpoch, schedule } from '../../../shared/review/scheduler'
import { snapshotOf } from './queries'
import type { EpochState, Grade } from '../../../shared/review/scheduler'
import type { IngestDatabase } from '../ingest/record'
import type { ReviewSnapshot } from './queries'

export interface GradeRequest {
  sessionId: string
  cardId: string
  grade: Grade
  /** ⚠️ The moment the *grade* was given, stamped by the client (ADR 0007). */
  reviewedAt: Date
}

export type GradeOutcome
  = | { ok: true, snapshot: ReviewSnapshot | null }
    | { ok: false, reason: 'not_in_session' | 'already_graded' }

export async function recordGrade(
  db: IngestDatabase,
  ownerId: string,
  request: GradeRequest,
): Promise<GradeOutcome> {
  const outcome = await db.transaction(async (tx): Promise<GradeOutcome> => {
    const [member] = await tx
      .select({ ordinal: schema.reviewSessionCard.ordinal })
      .from(schema.reviewSessionCard)
      .where(
        and(
          eq(schema.reviewSessionCard.reviewSessionId, request.sessionId),
          eq(schema.reviewSessionCard.cardId, request.cardId),
          eq(schema.reviewSessionCard.ownerId, ownerId),
        ),
      )
      .limit(1)

    // ⚠️ A *grade* for a *card* this *session* does not hold is a stale tab, not
    // an attack and not an error — and answering with the snapshot is the whole
    // remedy. The `owner_id` in the `WHERE` is what makes it also not an attack.
    if (!member)
      return { ok: false, reason: 'not_in_session' }

    const [already] = await tx
      .select({ id: schema.reviewLog.id })
      .from(schema.reviewLog)
      .where(
        and(
          eq(schema.reviewLog.reviewSessionId, request.sessionId),
          eq(schema.reviewLog.cardId, request.cardId),
        ),
      )
      .limit(1)

    // ⚠️ **A graded *card* leaves the *session* and never returns to it**
    // (`S7`), so a second *grade* for the same position is a held key. It
    // changes nothing rather than writing a second irreplaceable row and
    // scheduling the *card* twice. **Two *grades* for the same *card* replaying
    // with the later one winning is `03` §8.2's rule and it is #13's**, where
    // the outbox makes a replay a thing that happens.
    if (already)
      return { ok: false, reason: 'already_graded' }

    const advanced = await advanceEpoch(tx, ownerId, request)

    await tx.insert(schema.reviewLog).values({
      cardId: request.cardId,
      schedulingEpochId: advanced.id,
      ownerId,
      reviewSessionId: request.sessionId,
      rating: advanced.log.rating,
      state: advanced.log.state,
      due: advanced.log.due,
      stability: advanced.log.stability,
      difficulty: advanced.log.difficulty,
      scheduledDays: advanced.log.scheduledDays,
      learningSteps: advanced.log.learningSteps,
      reviewedAt: request.reviewedAt,
      // ⚠️ **Both sides of the subtraction are the database's clock.** The
      // skew is `received_at - reviewed_at`, and `received_at` defaults to
      // `now()`, so computing the difference in this process would measure the
      // application server's clock against the reader's rather than the one the
      // column records.
      clockSkewSeconds: sql`extract(epoch from (now() - ${request.reviewedAt.toISOString()}::timestamptz))::int`,
    })

    return { ok: true, snapshot: null }
  })

  if (!outcome.ok)
    return outcome

  // Outside the transaction: the run is finished when nothing is left ungraded,
  // and that is a read of what the transaction just committed.
  const snapshot = await snapshotOf(db, ownerId, request.sessionId)

  if (snapshot && snapshot.positions.every(position => position.grade !== null))
    await completeSession(db, ownerId, request.sessionId)

  return { ok: true, snapshot }
}

/**
 * The *card*'s live epoch, moved on by the *grade* — or its first one, minted
 * here.
 *
 * ⚠️ **A new epoch is an `INSERT` and a live one is an `UPDATE`, and the
 * difference is not this function's.** ADR 0011 puts the FSRS state on the epoch
 * precisely so a **reset** is an insert rather than an update over the history
 * it preserves; a *grade* is the ordinary case and moves the epoch it is in.
 */
async function advanceEpoch(
  tx: IngestDatabase,
  ownerId: string,
  request: GradeRequest,
): Promise<{ id: string, log: ReturnType<typeof schedule>['log'] }> {
  const [live] = await tx
    .select({
      id: schema.schedulingEpoch.id,
      due: schema.schedulingEpoch.due,
      stability: schema.schedulingEpoch.stability,
      difficulty: schema.schedulingEpoch.difficulty,
      scheduledDays: schema.schedulingEpoch.scheduledDays,
      learningSteps: schema.schedulingEpoch.learningSteps,
      reps: schema.schedulingEpoch.reps,
      lapses: schema.schedulingEpoch.lapses,
      state: schema.schedulingEpoch.state,
      lastReview: schema.schedulingEpoch.lastReview,
      ordinal: schema.schedulingEpoch.ordinal,
    })
    .from(schema.schedulingEpoch)
    .where(
      and(
        eq(schema.schedulingEpoch.cardId, request.cardId),
        eq(schema.schedulingEpoch.ownerId, ownerId),
        isNull(schema.schedulingEpoch.supersededAt),
      ),
    )
    .limit(1)

  // ⚠️ **A *card* with no epoch is answered from the state the library calls
  // new**, and `freshEpoch` is that state — `createEmptyCard`'s own, rather
  // than a zeroed row written out by hand beside it (`04` §13: copies drift).
  // The row that lands below holds the state the answer *produced*; the
  // `review_log` row beside it records the New state it was answered *from*,
  // which is what makes a *card*'s first review legible to an optimiser six
  // months from now.
  const current: EpochState = live
    ? {
        due: live.due,
        stability: live.stability,
        difficulty: live.difficulty,
        scheduledDays: live.scheduledDays,
        learningSteps: live.learningSteps,
        reps: live.reps,
        lapses: live.lapses,
        state: live.state,
        lastReview: live.lastReview ?? null,
      }
    : freshEpoch(request.reviewedAt)

  const { epoch, log } = schedule(current, request.grade, request.reviewedAt)

  if (live) {
    await tx
      .update(schema.schedulingEpoch)
      .set({
        due: epoch.due,
        stability: epoch.stability,
        difficulty: epoch.difficulty,
        scheduledDays: epoch.scheduledDays,
        learningSteps: epoch.learningSteps,
        reps: epoch.reps,
        lapses: epoch.lapses,
        state: epoch.state,
        lastReview: epoch.lastReview,
      })
      .where(eq(schema.schedulingEpoch.id, live.id))

    return { id: live.id, log }
  }

  const [minted] = await tx
    .insert(schema.schedulingEpoch)
    .values({
      cardId: request.cardId,
      ownerId,
      ordinal: await nextOrdinal(tx, request.cardId),
      due: epoch.due,
      stability: epoch.stability,
      difficulty: epoch.difficulty,
      scheduledDays: epoch.scheduledDays,
      learningSteps: epoch.learningSteps,
      reps: epoch.reps,
      lapses: epoch.lapses,
      state: epoch.state,
      lastReview: epoch.lastReview,
    })
    .returning({ id: schema.schedulingEpoch.id })

  return { id: minted!.id, log }
}

/** `04` §7.4's 1-based `ordinal`, unique per *card*. */
async function nextOrdinal(tx: IngestDatabase, cardId: string): Promise<number> {
  const [last] = await tx
    .select({ ordinal: schema.schedulingEpoch.ordinal })
    .from(schema.schedulingEpoch)
    .where(eq(schema.schedulingEpoch.cardId, cardId))
    .orderBy(desc(schema.schedulingEpoch.ordinal))
    .limit(1)

  return (last?.ordinal ?? 0) + 1
}

