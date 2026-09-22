/**
 * `S12`'s export — `09` §4.12, `11` §4, `03` §13.6. **The backup**: Neon Free's
 * six hours of instant restore is not one for *review* history, and this is.
 *
 * ⚠️ **Four collections, and the scope is `02` `S12`'s, not the schema's.**
 * *Notes*, *cards*, *grades* and every *scheduling epoch*. A *note*'s meanings,
 * synonyms, *level claims* and *domain claims*, `card_flag`, *sessions*,
 * *sources* and the spend ledger are out of #31 by name — adding one here is a
 * scope change, not a completion.
 *
 * ⚠️ **Every *scheduling epoch*, superseded ones included.** There is no
 * `superseded_at IS NULL` below and none may be added: the superseded epoch is
 * the row a system that stored state on `card` would no longer have (`04` §7.4),
 * and the `review_log` rows that point at it are unreadable without it.
 *
 * ⚠️ **A *note* is the reader's through `note_vetting`**, because `note` is
 * shared (`04` §4) and carries no owner. Every state is exported, `pending`
 * included — `11` §4's nastiest case is a `pending` *note* with no *card*,
 * which is correct, because a *card* is minted at acceptance and never before
 * (`04` §7.3).
 *
 * ⚠️ **Nothing private leaves** (`03` §13.4). No `source.content`, which is
 * not read at all, and no email: the owner is `ownerId` once, at the top of
 * the file, and an id — every row here is that reader's, so no row repeats it.
 * The columns are listed rather than spread for that reason — a `select()` of
 * the whole row would export whatever a later migration adds to it.
 *
 * ⚠️ **One read-only `repeatable read` transaction, not four reads.** Four
 * statements under `read committed` each see their own instant, so a *grade*
 * flushed from the outbox between the epoch read and the `review_log` read
 * would export a *grade* whose epoch the file does not hold. One snapshot is
 * what lets `11` §4 reconcile counts at all. The reads are still sequential
 * inside it — the end-to-end tier's database is single-connection
 * (`server/utils/stats/queries.ts`).
 */

import { asc, eq } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { IngestDatabase } from '../ingest/record'

export async function exportEverything(db: IngestDatabase, ownerId: string) {
  return db.transaction(async (tx) => {
    const notes = await tx
      .select({
        id: schema.note.id,
        subjectId: schema.note.subjectId,
        identityKey: schema.note.identityKey,
        fields: schema.note.fields,
        originIngestionId: schema.note.originIngestionId,
        createdAt: schema.note.createdAt,
        state: schema.noteVetting.state,
        edited: schema.noteVetting.edited,
        vettedAt: schema.noteVetting.vettedAt,
        flaggedAt: schema.noteVetting.flaggedAt,
      })
      .from(schema.noteVetting)
      .innerJoin(schema.note, eq(schema.note.id, schema.noteVetting.noteId))
      .where(eq(schema.noteVetting.ownerId, ownerId))
      .orderBy(asc(schema.note.id))

    const cards = await tx
      .select({
        id: schema.card.id,
        noteId: schema.card.noteId,
        templateKey: schema.card.templateKey,
        suspendedAt: schema.card.suspendedAt,
        suspendedReason: schema.card.suspendedReason,
        createdAt: schema.card.createdAt,
      })
      .from(schema.card)
      .where(eq(schema.card.ownerId, ownerId))
      .orderBy(asc(schema.card.id))

    const schedulingEpochs = await tx
      .select({
        id: schema.schedulingEpoch.id,
        cardId: schema.schedulingEpoch.cardId,
        ordinal: schema.schedulingEpoch.ordinal,
        startedAt: schema.schedulingEpoch.startedAt,
        supersededAt: schema.schedulingEpoch.supersededAt,
        supersededReason: schema.schedulingEpoch.supersededReason,
        due: schema.schedulingEpoch.due,
        stability: schema.schedulingEpoch.stability,
        difficulty: schema.schedulingEpoch.difficulty,
        scheduledDays: schema.schedulingEpoch.scheduledDays,
        learningSteps: schema.schedulingEpoch.learningSteps,
        reps: schema.schedulingEpoch.reps,
        lapses: schema.schedulingEpoch.lapses,
        state: schema.schedulingEpoch.state,
        lastReview: schema.schedulingEpoch.lastReview,
      })
      .from(schema.schedulingEpoch)
      .where(eq(schema.schedulingEpoch.ownerId, ownerId))
      .orderBy(asc(schema.schedulingEpoch.cardId), asc(schema.schedulingEpoch.ordinal))

    const grades = await tx
      .select({
        id: schema.reviewLog.id,
        cardId: schema.reviewLog.cardId,
        schedulingEpochId: schema.reviewLog.schedulingEpochId,
        reviewSessionId: schema.reviewLog.reviewSessionId,
        rating: schema.reviewLog.rating,
        state: schema.reviewLog.state,
        due: schema.reviewLog.due,
        stability: schema.reviewLog.stability,
        difficulty: schema.reviewLog.difficulty,
        scheduledDays: schema.reviewLog.scheduledDays,
        learningSteps: schema.reviewLog.learningSteps,
        reviewedAt: schema.reviewLog.reviewedAt,
        receivedAt: schema.reviewLog.receivedAt,
        clockSkewSeconds: schema.reviewLog.clockSkewSeconds,
      })
      .from(schema.reviewLog)
      .where(eq(schema.reviewLog.ownerId, ownerId))
      .orderBy(asc(schema.reviewLog.reviewedAt), asc(schema.reviewLog.id))

    return { notes, cards, schedulingEpochs, grades }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
