/**
 * `S9`'s `X` — **four things in one transaction** (`04` §7.8, `09` §4.9), and a
 * fifth that is the absence of one.
 *
 * 1. `card_flag`, with `source_id`, **`prompt_version` and `model_id`
 *    denormalised at flag time**.
 * 2. The *card* is *suspended*: `suspended_at`, `suspended_reason = 'flagged'`.
 * 3. `note_vetting.flagged_at`, which is the *note* owed back to the *vetting*
 *    queue.
 * 4. The reader advances **without a *grade***.
 *
 * ⚠️ **And `review_log` is not touched** — catching a bad *card* costs the
 * *card* and not the record (`S9`, `04` §7.8). Nothing here writes a review, a
 * *scheduling epoch* or a rating, and the *card*'s history stands exactly as it
 * was; suspension is withdrawal from scheduling, not deletion (`CONTEXT.md`).
 *
 * ⚠️ **`prompt_version` and `model_id` are read now and copied, never joined
 * later** (ADR 0004). A join through `note_field_provenance` answers the same
 * question **until the *note* is re-generated**, at which point the provenance
 * describes the new version and the flag silently starts blaming the wrong
 * prompt. ADR 0004 says the third part is the actionable one: without it the
 * reader learns *some cards are bad* rather than *prompt v3 writes bad example
 * sentences*.
 *
 * ⚠️ **A second flag on the same *card* is a second row** (`11` §3) — **and a
 * replayed entry is not a second flag.** The two are easy to conflate and they
 * are opposites. `11` §3 means a **reader** flagging the same *card* twice,
 * months apart, and deduplicating that would under-report exactly the signal
 * *false-accept rate* exists to carry. A replay is the outbox re-sending one
 * entry whose acknowledgement was lost, and counting it would **inflate
 * `count(card_flag)`** — the numerator of the metric
 * [ADR 0056](../../../docs/adr/0056-a-flag-returns-a-note-to-the-queue-through-card-flag-not-by-un-accepting-it.md)
 * was written to protect. `(review_session_id, card_id)` tells them apart: a
 * flagged position is answered (`shared/review/snapshot.ts`) so the reader is
 * never offered it again **inside that run**, and a second genuine flag is in a
 * different *session*. It is the same guard the *grade* path has, keyed on the
 * same pair — there is still no `ON CONFLICT` and there must not be one.
 */

import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { completeSession } from './session'
import { isFinished } from '../../../shared/review/snapshot'
import { snapshotOf } from './queries'
import type { IngestDatabase } from '../ingest/record'
import type { ReviewSnapshot } from './queries'

export interface FlagRequest {
  sessionId: string
  cardId: string
}

export type FlagOutcome
  = | { ok: true, snapshot: ReviewSnapshot | null }
    | { ok: false, reason: 'not_in_session' | 'already_flagged' }

export async function recordFlag(
  db: IngestDatabase,
  ownerId: string,
  request: FlagRequest,
): Promise<FlagOutcome> {
  const outcome = await db.transaction(async (tx): Promise<FlagOutcome> => {
    const [member] = await tx
      .select({ noteId: schema.card.noteId })
      .from(schema.reviewSessionCard)
      .innerJoin(schema.card, eq(schema.card.id, schema.reviewSessionCard.cardId))
      .where(
        and(
          eq(schema.reviewSessionCard.reviewSessionId, request.sessionId),
          eq(schema.reviewSessionCard.cardId, request.cardId),
          eq(schema.reviewSessionCard.ownerId, ownerId),
        ),
      )
      .limit(1)

    // ⚠️ The same reading as a *grade*'s: a flag for a *card* this *session*
    // does not hold is a stale tab, and the `owner_id` in the `WHERE` is what
    // makes it also not an attack.
    if (!member)
      return { ok: false, reason: 'not_in_session' }

    const [already] = await tx
      .select({ id: schema.cardFlag.id })
      .from(schema.cardFlag)
      .where(
        and(
          eq(schema.cardFlag.reviewSessionId, request.sessionId),
          eq(schema.cardFlag.cardId, request.cardId),
        ),
      )
      .limit(1)

    // ⚠️ **The replay guard, and it is the *grade* path's guard on the same
    // pair.** A flag already recorded for this *card* **in this run** can only
    // be this entry arriving twice — the position is answered, so the reader
    // cannot reach it again — and writing it would inflate the numerator of
    // *false-accept rate*. A genuine second flag carries a different
    // `review_session_id` and lands as the second row `11` §3 asks for.
    if (already)
      return { ok: false, reason: 'already_flagged' }

    const attribution = await attributionFor(tx, member.noteId)

    await tx.insert(schema.cardFlag).values({
      cardId: request.cardId,
      noteId: member.noteId,
      ownerId,
      reviewSessionId: request.sessionId,
      ...attribution,
    })

    // ⚠️ **`suspended_at IS NULL` is in the `WHERE`.** A *card* flagged a second
    // time in a later *session* gets its second `card_flag` row (`11` §3) and
    // must not restamp the suspension: the instant a *card* left scheduling is a
    // fact about the **first** flag, and `S11`'s `source_deleted` reason must
    // not be overwritten by `flagged` either.
    await tx
      .update(schema.card)
      .set({ suspendedAt: sql`now()`, suspendedReason: 'flagged' })
      .where(
        and(
          eq(schema.card.id, request.cardId),
          eq(schema.card.ownerId, ownerId),
          isNull(schema.card.suspendedAt),
        ),
      )

    // ⚠️ **The *note*'s `state` is left alone, and that is `04` §11 rather than
    // an omission**
    // ([ADR 0056](../../../docs/adr/0056-a-flag-returns-a-note-to-the-queue-through-card-flag-not-by-un-accepting-it.md)). `card_flag (note_id) WHERE resolved_at IS NULL` is indexed
    // as "the flagged notes waiting in the *Vet* queue", so the queue finds them
    // through the flag; flipping `state` back to `pending` would instead take
    // the *note* out of `count(note_vetting WHERE state='accepted')` — the
    // denominator of *false-accept rate* (`04` §7.8) and of *acceptance rate*
    // (`11` §3) — so flagging a *card* would move both ratios by arithmetic that
    // has nothing to do with either. ⚠️ **`flagged_at IS NULL` is the
    // suspension's guard for the suspension's reason**: the instant a *note*
    // came back to the queue is a fact about the first flag.
    await tx
      .update(schema.noteVetting)
      .set({ flaggedAt: sql`now()` })
      .where(
        and(
          eq(schema.noteVetting.noteId, member.noteId),
          eq(schema.noteVetting.ownerId, ownerId),
          isNull(schema.noteVetting.flaggedAt),
        ),
      )

    return { ok: true, snapshot: null }
  })

  if (!outcome.ok)
    return outcome

  // Outside the transaction, and the same read a *grade* makes: a run with
  // nothing left unanswered is finished, and ⚠️ **a flag is an answer**
  // (`shared/review/snapshot.ts`). `09` §4.9: a twenty-*card* run can end with
  // nineteen *grades*, and a `completed_at` left null would resume it onto a
  // *card* the reader has already passed.
  const snapshot = await snapshotOf(db, ownerId, request.sessionId)

  if (snapshot && isFinished(snapshot))
    await completeSession(db, ownerId, request.sessionId)

  return { ok: true, snapshot }
}

/**
 * The three things `04` §7.8 copies onto the flag.
 *
 * ⚠️ **The *source* is the run's, and it is a left join in spirit**:
 * `note.origin_ingestion_id` is `SET NULL` on a hard delete and
 * `ingestion.source_id` is too, because a *note* outlives the run that made it
 * (`04` §9). Every part of this is nullable, and `card_flag` makes all three
 * nullable for exactly that reason — ⚠️ **the signal survives the thing it is a
 * fact about.**
 *
 * ⚠️ **The model and the prompt come from `note_field_provenance`, not from
 * `ingestion`.** The *card*'s content is its *judgement fields*, and a
 * re-generation rewrites their provenance while leaving `origin_ingestion_id`
 * alone — so the ingestion row answers *which run first paid for this note* and
 * the provenance answers *which prompt wrote the words the reader just called
 * wrong*. ADR 0004 wants the second.
 */
async function attributionFor(
  tx: IngestDatabase,
  noteId: string,
): Promise<{ sourceId: string | null, promptVersion: string | null, modelId: string | null }> {
  // Sequential, like every other read in this tier — `Promise.all` in a request
  // handler fails in the e2e tier and only there (`server/utils/review/queries.ts`).
  const [origin] = await tx
    .select({ sourceId: schema.ingestion.sourceId })
    .from(schema.note)
    .innerJoin(schema.ingestion, eq(schema.ingestion.id, schema.note.originIngestionId))
    .where(eq(schema.note.id, noteId))
    .limit(1)

  // ⚠️ **Ordered by field name so two flags on one *note* agree.** Every
  // generated field of a *note* comes from one request (ADR 0047), so the rows
  // carry the same pair; the order is here so that the day they do not, the
  // answer is still the same one twice rather than whichever row the planner
  // returned first.
  const [generated] = await tx
    .select({
      modelId: schema.noteFieldProvenance.modelId,
      promptVersion: schema.noteFieldProvenance.promptVersion,
    })
    .from(schema.noteFieldProvenance)
    .where(
      and(
        eq(schema.noteFieldProvenance.noteId, noteId),
        isNotNull(schema.noteFieldProvenance.modelId),
      ),
    )
    .orderBy(asc(schema.noteFieldProvenance.fieldName))
    .limit(1)

  return {
    sourceId: origin?.sourceId ?? null,
    promptVersion: generated?.promptVersion ?? null,
    modelId: generated?.modelId ?? null,
  }
}
