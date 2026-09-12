/**
 * `04` §12's first query — **the *Vet* queue**: pending *notes* for this owner,
 * with their fields, provenance and *level claims*. It is the one query that
 * runs between keystrokes, and `S3` gives it a five-second median to live
 * inside.
 *
 * ⚠️ **The order is `note_vetting.created_at`, oldest first, and that is what
 * makes ADR 0033's undo free.** `Z` returns a *note* "to *pending* at the head of
 * the queue"; a *note* just decided is older than every *note* still waiting,
 * because the queue is drained in the order it was filled — so putting it back
 * at the head is what this `ORDER BY` already does, with nothing to remember.
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

import { and, asc, count, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { openRunTally, sweepIdleRuns } from './run'
import { runDetail } from '../../../shared/ingest/run-detail'
import type { IngestDatabase } from '../ingest/record'
import type { RunStatus } from '../../../shared/ingest/run-detail'

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
  /** ⚠️ `S9`'s second look — `10` §4.3's `returned by a flag` aside. */
  flagged: boolean
}

/** What `10` §4.5's states 2 and 3 put under their statement. */
export interface RunningIngestion {
  title: string
  status: RunStatus
  /** `shared/ingest/run-detail.ts` — **one formatter**, so `/` and `/vet` agree. */
  detail: string
}

export interface VetQueue {
  notes: VetNoteView[]
  /** The chrome bar's `N pending` — every *note* waiting, not just this batch. */
  pending: number
  /** Decisions in the open run — `10` §4.5 state 3's `18 vetted in this run`. */
  vetted: number
  /** ⚠️ Rejections in the open run. ADR 0033's confirmation appears only above zero. */
  rejections: number
  /** Null when nothing is queued or running — which is what separates state 1 from state 2. */
  running: RunningIngestion | null
}

/** The chrome bar's figure — every *note* waiting for this reader. */
export async function pendingCount(db: IngestDatabase, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.noteVetting)
    .where(and(eq(schema.noteVetting.ownerId, ownerId), eq(schema.noteVetting.state, 'pending')))

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
      createdAt: schema.noteVetting.createdAt,
      sourceTitle: schema.ingestion.sourceTitle,
    })
    .from(schema.noteVetting)
    .innerJoin(schema.note, eq(schema.note.id, schema.noteVetting.noteId))
    // ⚠️ A **left** join. `note.origin_ingestion_id` is `SET NULL` on a hard
    // delete, because a *note* outlives the run that made it (`04` §9) — an
    // inner join here would drop those *notes* out of the queue entirely.
    .leftJoin(schema.ingestion, eq(schema.ingestion.id, schema.note.originIngestionId))
    .where(
      and(
        eq(schema.noteVetting.ownerId, ownerId),
        eq(schema.noteVetting.state, 'pending'),
      ),
    )
    .orderBy(asc(schema.noteVetting.createdAt), asc(schema.noteVetting.noteId))
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

/**
 * The *ingestion* that might still add to the queue — `09` §7's table, and what
 * separates `10` §4.5's state 1 from its state 2.
 *
 * ⚠️ **`queued` and `running` only.** `incomplete` is resumable (`04` §6.1) but
 * nothing is coming for it until somebody presses resume, so reporting it here
 * would tell a reader to wait for something that is not on its way.
 *
 * ⚠️ **No `owner_id` filter, and that is `04` §4 rather than an omission.** A
 * *source* and an *ingestion* are shared entities; `server/utils/ingest/queries.ts`
 * carries the argument in full.
 */
export async function runningIngestion(
  db: IngestDatabase,
  now: Date = new Date(),
): Promise<RunningIngestion | null> {
  const chunk = schema.sourceChunk
  const done = schema.ingestionChunk

  const [row] = await db
    .select({
      title: schema.ingestion.sourceTitle,
      status: schema.ingestion.status,
      submittedAt: schema.ingestion.submittedAt,
      claimedAt: sql<Date | null>`(${db
        .select({ claimedAt: schema.job.claimedAt })
        .from(schema.job)
        .where(eq(schema.job.ingestionId, schema.ingestion.id))
        .orderBy(desc(schema.job.createdAt))
        .limit(1)})`,
      totalChunks: sql<number>`(${db
        .select({ n: count() })
        .from(chunk)
        .where(eq(chunk.sourceId, schema.ingestion.sourceId))})::int`,
      completeChunks: sql<number>`(${db
        .select({ n: count() })
        .from(done)
        .where(and(eq(done.ingestionId, schema.ingestion.id), eq(done.status, 'complete')))})::int`,
      notesProduced: sql<number>`(${db
        .select({ n: count() })
        .from(schema.note)
        .where(eq(schema.note.originIngestionId, schema.ingestion.id))})::int`,
    })
    .from(schema.ingestion)
    .where(or(eq(schema.ingestion.status, 'queued'), eq(schema.ingestion.status, 'running')))
    .orderBy(desc(schema.ingestion.submittedAt))
    .limit(1)

  if (!row)
    return null

  const status = row.status as RunStatus

  return {
    title: row.title,
    status,
    detail: runDetail(
      {
        status,
        submittedAt: row.submittedAt,
        // The scalar subquery's decoder does not know the column's type, so it
        // arrives as the driver's raw value — the same note as `recentRuns`.
        claimedAt: row.claimedAt ? new Date(row.claimedAt) : null,
        totalChunks: row.totalChunks,
        completeChunks: row.completeChunks,
        failedChunks: 0,
        notesProduced: row.notesProduced,
      },
      now,
    ),
  }
}

/** Everything one `GET /api/vet/queue` answers with. */
export async function vetQueue(db: IngestDatabase, ownerId: string): Promise<VetQueue> {
  await sweepIdleRuns(db, ownerId)

  // ⚠️ **Sequential, and `Promise.all` here is a bug you can only find in the
  // e2e tier.** Measured 2026-09-12: `@electric-sql/pglite-socket` fronts a
  // **single-connection** PGlite (`test/schema/harness.ts` says so about the
  // schema tier and it is just as true of the socket), so four reads issued at
  // once make `node-postgres` open four connections and the server resets three
  // of them — the request answers `500` and the only symptom in the browser is
  // an empty queue. Production would have been fine, which is exactly what makes
  // it worth writing down rather than quietly fixing.
  //
  // The cost is three extra round trips on a read the reader never waits on: the
  // client paints the next *note* from the batch it already holds (`S3`), and
  // this answer is what corrects the counts behind it.
  const notes = await queueBatch(db, ownerId)
  const pending = await pendingCount(db, ownerId)
  const run = await openRunTally(db, ownerId)
  const running = await runningIngestion(db)

  return {
    notes,
    pending,
    vetted: run?.vetted ?? 0,
    rejections: run?.rejections ?? 0,
    running,
  }
}
