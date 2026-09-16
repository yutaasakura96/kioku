/**
 * The *scheduling epoch*'s two lifecycle writes that are not a *grade* — the
 * ordinal, and the reset (`04` §7.4).
 *
 * ⚠️ **A reset is an `UPDATE` of one column pair and an `INSERT`, never an
 * `UPDATE` of the state.** That is the whole reason the FSRS state lives on the
 * epoch rather than on `card`: the superseded row keeps the stability, the due
 * date and the reps it had, and `S12`'s *every scheduling epoch including
 * superseded ones* is that row. `review_log` is not touched and cannot be — its
 * rows keep pointing at the epoch they were measured in.
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { freshEpoch } from '../../../shared/review/scheduler'
import type { IngestDatabase } from '../ingest/record'

/** `04` §7.4's 1-based `ordinal`, unique per *card*. */
export async function nextOrdinal(tx: IngestDatabase, cardId: string): Promise<number> {
  const [last] = await tx
    .select({ ordinal: schema.schedulingEpoch.ordinal })
    .from(schema.schedulingEpoch)
    .where(eq(schema.schedulingEpoch.cardId, cardId))
    .orderBy(desc(schema.schedulingEpoch.ordinal))
    .limit(1)

  return (last?.ordinal ?? 0) + 1
}

/**
 * A *memory-bearing field* of this *note* changed: supersede every live epoch
 * of its *cards* and begin ordinal n+1 from the state `ts-fsrs` calls new.
 *
 * ⚠️ **This is the first reset the application has ever written** (ADR 0064
 * §5). `superseded_reason = 'memory_bearing_field_changed'` has been in the
 * `CHECK` since Phase 4.
 *
 * ⚠️ **Every reader's *card*, not only the editor's.** `note.fields` is shared
 * (`04` §4) and there is one copy of the meaning; a memory of the old one is
 * invalid whoever holds it. That is ADR 0052's *any reader's acceptance freezes
 * it* read in the other direction, and it is unreachable while ADR 0012
 * invites one reader.
 *
 * ⚠️ **A *card* with no live epoch gets none.** Its first epoch belongs to the
 * *grade* that first schedules it (`server/utils/review/grade.ts`), and writing
 * one here would put a never-reviewed *card* among the due ones rather than the
 * new ones (`server/utils/review/queries.ts`'s `newCards`).
 *
 * ⚠️ **The superseding `UPDATE` runs before the `INSERT`**, because the partial
 * unique index `UNIQUE (card_id) WHERE superseded_at IS NULL` refuses two live
 * epochs even for the length of a statement.
 *
 * @returns how many epochs were superseded.
 */
export async function resetForMemoryBearingChange(
  tx: IngestDatabase,
  noteId: string,
  now: Date = new Date(),
): Promise<number> {
  const cards = tx
    .select({ id: schema.card.id })
    .from(schema.card)
    .where(eq(schema.card.noteId, noteId))

  const superseded = await tx
    .update(schema.schedulingEpoch)
    // ⚠️ `now`, not the database's `now()`: the new epoch's `due` is `now` as
    // well, and one reset should not straddle two clocks.
    .set({ supersededAt: now, supersededReason: 'memory_bearing_field_changed' })
    .where(
      and(
        inArray(schema.schedulingEpoch.cardId, cards),
        isNull(schema.schedulingEpoch.supersededAt),
      ),
    )
    .returning({ cardId: schema.schedulingEpoch.cardId, ownerId: schema.schedulingEpoch.ownerId })

  const epoch = freshEpoch(now)

  // Sequential — `Promise.all` in a request handler fails in the e2e tier and
  // only there (`server/utils/review/queries.ts`).
  for (const { cardId, ownerId } of superseded) {
    await tx.insert(schema.schedulingEpoch).values({
      cardId,
      ownerId,
      ordinal: await nextOrdinal(tx, cardId),
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
  }

  return superseded.length
}
