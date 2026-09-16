/**
 * **The *Vet* queue, which since #20 is the flag queue** (ADR 0064 §3): accepted
 * *notes* whose *card* carries an open `card_flag` for this owner, with their
 * fields, provenance and *level claims*. It is the one query that runs between
 * keystrokes.
 *
 * ⚠️ **A *pending* *note* never appears on it.** The 474 of them are a cache
 * for stage 5 now (ADR 0063), and a chosen word is accepted when it is written
 * (ADR 0064), so nothing reaches *Vet* except a *card* the reader flagged.
 *
 * ⚠️ **The order is the oldest open `card_flag.flagged_at`** (ADR 0049's
 * oldest-first, unchanged), **and that is what makes ADR 0033's undo free.** `Z`
 * reopens a resolution's flags with the instants they were raised at, so the
 * *note* lands back where it was offered, with nothing to remember.
 * ⚠️ **Not `note_vetting.flagged_at`**, which `X` stamps once and never clears:
 * a *note* flagged, kept, and flagged again a month later would sort by the
 * first flag, ahead of everything raised since. The column is read for `10`
 * §4.3's aside instead, which closes #10's carried bullet.
 * Any other ordering would need the undo to carry a position, and a position is
 * client state on the one screen whose undo reads from the database precisely so
 * it survives a reload (ADR 0033).
 *
 * ⚠️ **A batch, not a row.** `S3` measures one keystroke per *note* with nothing
 * moving between them, and a round trip per *note* is a wait the reader can see.
 * Every endpoint in this mode answers with the whole batch, so the client paints
 * the next *note* from what it already holds and the chrome bar's counts are
 * never more than one keystroke old.
 *
 * ⚠️ **Three queries, not one, and not `limit` × three either.** Provenance and
 * *level claims* are a row per field and a row per authority, so joining them to
 * the batch would multiply it; fetching them per *note* would be `S3`'s budget
 * spent on round trips. They are two `IN` queries over the batch's ids, which is
 * `04` §12's own amendment for the dedup lookup applied to the read side.
 */

import { and, asc, count, eq, exists, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { openRunTally, sweepIdleRuns } from './run'
import type { IngestDatabase } from '../ingest/record'

/**
 * How many *notes* the client holds ahead of the reader.
 *
 * Ten is under a minute of work at `S3`'s five-second median — far enough ahead
 * that the reader never waits, and short enough that leaving mid-queue throws
 * nothing away (PRD §5: every *note* commits on its own keystroke, so the batch
 * is a read-ahead and never a unit of work).
 */
export const QUEUE_BATCH = 10

/** One *note*'s provenance row — ADR 0004's honesty bit, per field. */
export interface FieldProvenance {
  fieldName: string
  kind: string
  modelId: string | null
  dictionaryVersion: string | null
}

/** ADR 0005: the set of attributed claims, **never collapsed**. */
export interface LevelClaimView {
  authorityKey: string | null
  level: string
}

export interface VetNoteView {
  noteId: string
  /** `note.fields` — ADR 0029's blob, validated at the boundary that wrote it. */
  fields: Record<string, string>
  provenance: FieldProvenance[]
  levels: LevelClaimView[]
  /** The *source* name in the chrome bar (`05` §7). Null once hard-deleted. */
  sourceTitle: string | null
  /**
   * ⚠️ `S9`'s second look — `10` §4.3's `returned by a flag` aside, read from
   * `note_vetting.flagged_at`. True of every *note* the flag queue holds, and
   * kept on the view rather than assumed by the screen, because the column is
   * what says it.
   */
  flagged: boolean
}

export interface VetQueue {
  notes: VetNoteView[]
  /** The chrome bar's `N flagged` — every *note* waiting, not just this batch. */
  flagged: number
  /** Decisions in the open run — `10` §4.5 state 2's `3 resolved in this run`. */
  vetted: number
  /** ⚠️ Drops in the open run. ADR 0033's confirmation appears only above zero. */
  rejections: number
}

/**
 * `EXISTS` an open `card_flag` on the row's *note* for this reader — `04` §11's
 * `card_flag (note_id) WHERE resolved_at IS NULL`, the index that has said since
 * Phase 4 how *Vet* finds a flagged *note*.
 *
 * ⚠️ **Owner-scoped**, unlike the freeze's lift in `server/utils/note/fields.ts`.
 * A flag is personal (`04` §4): another reader's flag on the shared *note* is
 * not this reader's reason to be asked about it.
 */
export function openFlagFor(tx: IngestDatabase, ownerId: string) {
  return exists(
    tx
      .select({ one: sql`1` })
      .from(schema.cardFlag)
      .where(
        and(
          eq(schema.cardFlag.noteId, schema.noteVetting.noteId),
          eq(schema.cardFlag.ownerId, ownerId),
          isNull(schema.cardFlag.resolvedAt),
        ),
      ),
  )
}

/** The instant the oldest still-open flag on the row's *note* was raised. */
function oldestOpenFlag(db: IngestDatabase, ownerId: string) {
  return sql`(${db
    .select({ at: sql`min(${schema.cardFlag.flaggedAt})` })
    .from(schema.cardFlag)
    .where(
      and(
        eq(schema.cardFlag.noteId, schema.noteVetting.noteId),
        eq(schema.cardFlag.ownerId, ownerId),
        isNull(schema.cardFlag.resolvedAt),
      ),
    )})`
}

/** On the flag queue: accepted, with an open flag on this owner's *card*. */
function onTheQueue(db: IngestDatabase, ownerId: string) {
  return and(
    eq(schema.noteVetting.ownerId, ownerId),
    eq(schema.noteVetting.state, 'accepted'),
    openFlagFor(db, ownerId),
  )
}

/** The chrome bar's figure — every flagged *note* waiting for this reader. */
export async function flaggedCount(db: IngestDatabase, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.noteVetting)
    .where(onTheQueue(db, ownerId))

  return row?.n ?? 0
}

/**
 * The next `limit` *notes*, oldest first.
 *
 * ⚠️ **There is no cursor and there is deliberately none.** A *note* leaves this
 * result the moment it is decided, so every answer's head is the *note* the
 * reader is looking at and every answer's tail is what is coming — which means
 * the client renders `notes[0]` and holds no position of its own. That is
 * ADR 0033's rule reaching one step further than it was written for: the durable
 * record decides, so a reload lands exactly where the reader was and `Z` puts a
 * *note* back in front of them without anything client-side having to agree.
 */
export async function queueBatch(
  db: IngestDatabase,
  ownerId: string,
  limit = QUEUE_BATCH,
): Promise<VetNoteView[]> {
  const rows = await db
    .select({
      noteId: schema.note.id,
      fields: schema.note.fields,
      flagged: isNotNull(schema.noteVetting.flaggedAt),
      sourceTitle: schema.ingestion.sourceTitle,
    })
    .from(schema.noteVetting)
    .innerJoin(schema.note, eq(schema.note.id, schema.noteVetting.noteId))
    // ⚠️ A **left** join. `note.origin_ingestion_id` is `SET NULL` on a hard
    // delete, because a *note* outlives the run that made it (`04` §9) — an
    // inner join here would drop those *notes* out of the queue entirely.
    .leftJoin(schema.ingestion, eq(schema.ingestion.id, schema.note.originIngestionId))
    .where(onTheQueue(db, ownerId))
    // `note_id` breaks the tie so two flags in one instant order the same way
    // twice.
    .orderBy(asc(oldestOpenFlag(db, ownerId)), asc(schema.noteVetting.noteId))
    .limit(limit)

  if (rows.length === 0)
    return []

  const ids = rows.map(row => row.noteId)

  const provenance = await db
    .select({
      noteId: schema.noteFieldProvenance.noteId,
      fieldName: schema.noteFieldProvenance.fieldName,
      kind: schema.noteFieldProvenance.kind,
      modelId: schema.noteFieldProvenance.modelId,
      dictionaryVersion: schema.noteFieldProvenance.dictionaryVersion,
    })
    .from(schema.noteFieldProvenance)
    .where(inArray(schema.noteFieldProvenance.noteId, ids))

  const levels = await db
    .select({
      noteId: schema.levelClaim.noteId,
      authorityKey: schema.levelClaim.authorityKey,
      level: schema.levelClaim.level,
    })
    .from(schema.levelClaim)
    .where(inArray(schema.levelClaim.noteId, ids))
    // ⚠️ **The named *authority* first, and the set is never collapsed**
    // (ADR 0005). `authority_key IS NULL` is the model's estimate — the one the
    // *provenance marker* draws hollow — and Postgres orders nulls last under a
    // plain `ASC`, so the strip reads attributed-then-estimated for free rather
    // than in insertion order.
    .orderBy(asc(schema.levelClaim.authorityKey))

  const byNote = <T extends { noteId: string }>(all: T[], id: string) => all.filter(row => row.noteId === id)

  return rows.map(row => ({
    noteId: row.noteId,
    fields: (row.fields ?? {}) as Record<string, string>,
    flagged: Boolean(row.flagged),
    sourceTitle: row.sourceTitle ?? null,
    provenance: byNote(provenance, row.noteId).map(({ noteId: _, ...rest }) => rest),
    levels: byNote(levels, row.noteId).map(({ noteId: _, ...rest }) => rest),
  }))
}

/** Everything one `GET /api/vet/queue` answers with. */
export async function vetQueue(db: IngestDatabase, ownerId: string): Promise<VetQueue> {
  await sweepIdleRuns(db, ownerId)

  // ⚠️ **Sequential, and `Promise.all` here is a bug you can only find in the
  // e2e tier.** Measured 2026-09-12: `@electric-sql/pglite-socket` fronts a
  // **single-connection** PGlite (`test/schema/harness.ts` says so about the
  // schema tier and it is just as true of the socket), so several reads issued
  // at once make `node-postgres` open several connections and the server resets
  // all but one — the request answers `500` and the only symptom in the browser
  // is an empty queue. Production would have been fine, which is exactly what
  // makes it worth writing down rather than quietly fixing.
  //
  // ⚠️ **Three reads, not four, since #20.** The running *ingestion* went: an
  // *ingestion* mints *cards* now and never adds to this queue, so `10` §4.5's
  // "nothing to vet yet" state would have told the reader to wait for something
  // that is not on its way.
  const notes = await queueBatch(db, ownerId)
  const flagged = await flaggedCount(db, ownerId)
  const run = await openRunTally(db, ownerId)

  return {
    notes,
    flagged,
    vetted: run?.vetted ?? 0,
    rejections: run?.rejections ?? 0,
  }
}
