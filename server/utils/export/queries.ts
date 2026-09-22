/**
 * `S12`'s export — `09` §4.12, `11` §4, `03` §13.6. **The backup**: Neon Free's
 * six hours of instant restore is not one for *review* history, and this is.
 *
 * ⚠️ **Four collections, and the scope is `02` `S12`'s, not the schema's.**
 * *Notes*, *cards*, *grades* and every *scheduling epoch*. `card_flag`,
 * *sessions*, *sources* and the spend ledger are out by name — adding one here
 * is a scope change, not a completion.
 *
 * ⚠️ **A *note* carries what the pivot moved off its row** (#32): the model's
 * meaning list (`meaningList`, the `note_meaning` row), the reader's synonyms,
 * and **every** *level claim* and *domain claim*. Together with the gloss the
 * first two are the *note*'s accepted meanings (`CONTEXT.md`), which is why
 * neither key is named that alone. ADR 0005 keeps disagreeing claims and lets precedence pick only the
 * display value, so the file holds the set and never the pick. Nested on the
 * *note* rather than a collection of their own, because none of the four means
 * anything without the *note* it hangs off.
 *
 * ⚠️ **Synonyms are filtered by owner, the other three by the reader's *notes*.**
 * `note_meaning` and the claims hang off the shared `note` and have no owner;
 * `meaning_synonym` has one, and a second reader's synonym can sit on this
 * reader's *note*, so filtering it by *note* alone would leak it. A synonym of
 * the reader's always sits on one of their *notes* — it is added from the back
 * of a *card*, and a *card* exists only for an accepted *note* — so none is read
 * and then left off.
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
 * ⚠️ **One read-only `repeatable read` transaction, not eight reads.** Eight
 * statements under `read committed` each see their own instant, so a *grade*
 * flushed from the outbox between the epoch read and the `review_log` read
 * would export a *grade* whose epoch the file does not hold. One snapshot is
 * what lets `11` §4 reconcile counts at all. The reads are still sequential
 * inside it — the end-to-end tier's database is single-connection
 * (`server/utils/stats/queries.ts`).
 */

import { asc, eq, inArray } from 'drizzle-orm'

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

    const readersNotes = tx
      .select({ noteId: schema.noteVetting.noteId })
      .from(schema.noteVetting)
      .where(eq(schema.noteVetting.ownerId, ownerId))

    const meanings = await tx
      .select({
        noteId: schema.noteMeaning.noteId,
        meanings: schema.noteMeaning.meanings,
        modelId: schema.noteMeaning.modelId,
        promptVersion: schema.noteMeaning.promptVersion,
        createdAt: schema.noteMeaning.createdAt,
      })
      .from(schema.noteMeaning)
      .where(inArray(schema.noteMeaning.noteId, readersNotes))
      .orderBy(asc(schema.noteMeaning.noteId))

    const synonyms = await tx
      .select({
        id: schema.meaningSynonym.id,
        noteId: schema.meaningSynonym.noteId,
        text: schema.meaningSynonym.text,
        createdAt: schema.meaningSynonym.createdAt,
      })
      .from(schema.meaningSynonym)
      .where(eq(schema.meaningSynonym.ownerId, ownerId))
      .orderBy(asc(schema.meaningSynonym.id))

    const levelClaims = await tx
      .select({
        id: schema.levelClaim.id,
        noteId: schema.levelClaim.noteId,
        authorityKey: schema.levelClaim.authorityKey,
        level: schema.levelClaim.level,
        modelId: schema.levelClaim.modelId,
        promptVersion: schema.levelClaim.promptVersion,
        createdAt: schema.levelClaim.createdAt,
      })
      .from(schema.levelClaim)
      .where(inArray(schema.levelClaim.noteId, readersNotes))
      .orderBy(asc(schema.levelClaim.id))

    const domainClaims = await tx
      .select({
        id: schema.domainClaim.id,
        noteId: schema.domainClaim.noteId,
        authorityKey: schema.domainClaim.authorityKey,
        domain: schema.domainClaim.domain,
        modelId: schema.domainClaim.modelId,
        promptVersion: schema.domainClaim.promptVersion,
        createdAt: schema.domainClaim.createdAt,
      })
      .from(schema.domainClaim)
      .where(inArray(schema.domainClaim.noteId, readersNotes))
      .orderBy(asc(schema.domainClaim.id))

    const meaningsByNote = new Map(meanings.map(({ noteId, ...rest }) => [noteId, rest]))
    const synonymsByNote = byNote(synonyms)
    const levelClaimsByNote = byNote(levelClaims)
    const domainClaimsByNote = byNote(domainClaims)

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

    return {
      notes: notes.map(n => ({
        ...n,
        meaningList: meaningsByNote.get(n.id) ?? null,
        synonyms: synonymsByNote.get(n.id) ?? [],
        levelClaims: levelClaimsByNote.get(n.id) ?? [],
        domainClaims: domainClaimsByNote.get(n.id) ?? [],
      })),
      cards,
      schedulingEpochs,
      grades,
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

/** Rows grouped by *note*, with the `noteId` the grouping makes redundant dropped. */
function byNote<T extends { noteId: string }>(rows: T[]): Map<string, Omit<T, 'noteId'>[]> {
  const grouped = new Map<string, Omit<T, 'noteId'>[]>()
  for (const { noteId, ...rest } of rows) {
    const list = grouped.get(noteId)
    if (list) {
      list.push(rest)
      continue
    }
    grouped.set(noteId, [rest])
  }
  return grouped
}
