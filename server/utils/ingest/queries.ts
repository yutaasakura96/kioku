/**
 * Everything the three *places* read, in one module.
 *
 * ⚠️ **Every figure here is as of the instant it is read, and the screens say
 * so** (`09` §2, `10` §3.2). A *place* ships no JavaScript, so it cannot poll,
 * and the alternatives are worse: a meta refresh on `/` would destroy a paste in
 * progress, and a stale number presented as live is a lie the reader has no way
 * to detect. That is why nothing here caches — the request *is* the instant.
 *
 * ⚠️ **And no count here is ever used to disable a control** (ADR 0032,
 * ADR 0035). A zero on Vet is how the reader finds out an *ingestion* is still
 * running, and a zero on Review is how they reach the line telling them when the
 * next *card* is due. Disabling the entrances would make PRD §4's written empty
 * states unreachable.
 *
 * ---
 *
 * ⚠️ **Every correlated subquery below is built with Drizzle's own query
 * builder and embedded as `sql`${subquery}``, and that is not a style
 * preference — it is the fix for a measured bug.** Interpolating a *column* into
 * a `sql` template emits a **bare, unqualified identifier**, not a qualified
 * one. Measured 2026-09-10, drizzle-orm 0.45.2:
 *
 * ```
 * sql`(SELECT count(*) FROM ${note} WHERE ${note.originIngestionId} = ${ingestion.id})`
 *   →  (SELECT count(*) FROM "note" WHERE "origin_ingestion_id" = "id")
 * ```
 *
 * Inside a subquery over `note`, `"id"` resolves to `note.id`. The correlation
 * to the outer row is gone, the SQL is still valid, and it returns a number.
 * Embedding a built subquery emits what was meant:
 *
 * ```
 *   →  (select count(*) from "note" "n" where "n"."origin_ingestion_id" = "ingestion"."id")
 * ```
 *
 * ⚠️ **The worst case was not the failure — it was the pass.** The chunk count
 * written the broken way came out as `WHERE "source_id" = "source_id"`, which is
 * trivially true, so it counted every chunk in the table and **agreed with the
 * right answer for as long as there was one *source***. It is a wrong query that
 * a single-fixture test cannot see, which is why `test/schema/place-queries.test.ts`
 * seeds a second *source* and a second *ingestion* for the counts that have one.
 */

import { and, count, desc, eq, isNull, lte, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import * as schema from '../../db/schema'
import type { RunStatus } from '../../../shared/ingest/run-detail'
import type { IngestDatabase } from './record'

/**
 * How many runs Ingest lists.
 *
 * `10` §6.1 puts "the runs" above the form and does not bound them; ten is
 * enough that the run the reader just submitted is visible along with its recent
 * neighbours, and few enough that the form stays on the first screen — which is
 * `10` §6.1's actual argument for the ordering ("the thing they just did should
 * be above the thing they might do next"). Sources is the full record.
 */
export const RUNS_ON_INGEST = 10

export interface RunRow {
  ingestionId: string
  /** Null once the *source* has been hard-deleted — `04` §6.1's `SET NULL`. */
  sourceId: string | null
  /** `ingestion.source_title`, snapshotted at submit so the ledger survives. */
  title: string
  status: RunStatus
  submittedAt: Date
  claimedAt: Date | null
  totalChunks: number
  completeChunks: number
  failedChunks: number
  notesProduced: number
  /** PRD §5's zero-new-*notes* tally. Null until the run has counted. */
  candidatesExtracted: number | null
  candidatesDeduplicated: number | null
  candidatesAlreadyKnown: number | null
  candidatesRejected: number | null
}

/**
 * The runs above the Ingest form, newest first.
 *
 * ⚠️ **No `owner_id` filter, and that is `04` §4 rather than an omission.** A
 * *source* and an *ingestion* are **shared** entities — "true regardless of who
 * is asking" — and `04` §4 calls the shared/personal label "product
 * specification, not schema decoration". `ingestion.submitted_by` exists and is
 * documented on the column as "**an audit line, not an owner**": a column that
 * references a user does not make an entity personal, because the label asks
 * what the row *asserts*, and this row asserts something about the material.
 * `allSources` and `sourceDetail` are unfiltered for the same reason;
 * `startBlockCounts` **is** filtered, because *note vettings* and *cards* are
 * personal. **Adding a filter here would be a product change**, not a fix.
 */
export async function recentRuns(db: IngestDatabase, limit = RUNS_ON_INGEST): Promise<RunRow[]> {
  const chunk = alias(schema.sourceChunk, 'total_chunk')
  const done = alias(schema.ingestionChunk, 'done_chunk')
  const broken = alias(schema.ingestionChunk, 'broken_chunk')
  const produced = alias(schema.note, 'produced_note')
  const claim = alias(schema.job, 'newest_job')

  const rows = await db
    .select({
      ingestionId: schema.ingestion.id,
      sourceId: schema.ingestion.sourceId,
      title: schema.ingestion.sourceTitle,
      status: schema.ingestion.status,
      submittedAt: schema.ingestion.submittedAt,
      candidatesExtracted: schema.ingestion.candidatesExtracted,
      candidatesDeduplicated: schema.ingestion.candidatesDeduplicated,
      candidatesAlreadyKnown: schema.ingestion.candidatesAlreadyKnown,
      candidatesRejected: schema.ingestion.candidatesRejected,

      // Per *source*, not per run: chunk boundaries are shared across
      // re-ingestions (`04` §5.2).
      totalChunks: sql<number>`(${db
        .select({ n: count() })
        .from(chunk)
        .where(eq(chunk.sourceId, schema.ingestion.sourceId))})::int`,

      // Per run — progress is not shared (`04` §6.2).
      completeChunks: sql<number>`(${db
        .select({ n: count() })
        .from(done)
        .where(and(eq(done.ingestionId, schema.ingestion.id), eq(done.status, 'complete')))})::int`,

      failedChunks: sql<number>`(${db
        .select({ n: count() })
        .from(broken)
        .where(and(eq(broken.ingestionId, schema.ingestion.id), eq(broken.status, 'failed')))})::int`,

      notesProduced: sql<number>`(${db
        .select({ n: count() })
        .from(produced)
        .where(eq(produced.originIngestionId, schema.ingestion.id))})::int`,

      // ⚠️ The newest job for the run, and **only its `claimed_at`**.
      // `job.last_error` is in the same table and `03` §11 forbids naming the
      // provider at the reader; not selecting it is cheaper than remembering not
      // to render it (`shared/ingest/run-detail.ts`).
      claimedAt: sql<Date | null>`(${db
        .select({ claimedAt: claim.claimedAt })
        .from(claim)
        .where(eq(claim.ingestionId, schema.ingestion.id))
        .orderBy(desc(claim.createdAt))
        .limit(1)})`,
    })
    .from(schema.ingestion)
    .orderBy(desc(schema.ingestion.submittedAt))
    .limit(limit)

  return rows.map(row => ({
    ...row,
    status: row.status as RunStatus,
    // `pg` returns `timestamptz` as a Date; the scalar subquery's decoder does
    // not know the column's type, so it arrives as the driver's raw value.
    claimedAt: row.claimedAt ? new Date(row.claimedAt) : null,
  }))
}

export interface SourceRow {
  id: string
  title: string
  submittedAt: Date
  /** The newest *ingestion*'s status, or null where none has been recorded. */
  status: RunStatus | null
  noteCount: number
  /** ⚠️ Non-null keeps the row in the list — `S11`, `10` §7.1. */
  deletedAt: Date | null
}

/**
 * The Sources list — `10` §7.1, newest first.
 *
 * ⚠️ **Deleted *sources* stay in the list.** `S11` requires them to stay
 * readable, and `10` §7.1 marks them with a 13px italic aside rather than a
 * colour or a strike-through: "this is not what it was" is an aside about the
 * row rather than a state of it. Filtering them out here would take `S11`'s
 * whole first half away.
 */
export async function allSources(db: IngestDatabase): Promise<SourceRow[]> {
  const newest = alias(schema.ingestion, 'newest_ingestion')
  const runs = alias(schema.ingestion, 'source_ingestion')
  const produced = alias(schema.note, 'produced_note')

  const rows = await db
    .select({
      id: schema.source.id,
      title: schema.source.title,
      submittedAt: schema.source.submittedAt,
      deletedAt: schema.source.deletedAt,

      status: sql<string | null>`(${db
        .select({ status: newest.status })
        .from(newest)
        .where(eq(newest.sourceId, schema.source.id))
        .orderBy(desc(newest.submittedAt))
        .limit(1)})`,

      // Through `ingestion`, because `note` carries no `source_id` — a *note*
      // outlives the run that made it and belongs to the corpus, not to one
      // *source* (`04` §5.3). The *occurrence* is the positional link.
      noteCount: sql<number>`(${db
        .select({ n: count() })
        .from(produced)
        .innerJoin(runs, eq(runs.id, produced.originIngestionId))
        .where(eq(runs.sourceId, schema.source.id))})::int`,
    })
    .from(schema.source)
    .orderBy(desc(schema.source.submittedAt))

  return rows.map(row => ({ ...row, status: (row.status as RunStatus | null) ?? null }))
}

export interface StartBlockCounts {
  /** `Vet · N pending` — `10` §3.2. */
  pending: number
  /** `Review · N due` — due **now**, which is what the control offers to start. */
  due: number
}

/**
 * The two figures in the start block.
 *
 * ⚠️ **Neither is ever used to disable its control** (ADR 0032, ADR 0035, `09`
 * §2). Zero is a number the block renders, and the empty state behind the
 * control is where the reader learns what it means.
 */
export async function startBlockCounts(
  db: IngestDatabase,
  ownerId: string,
): Promise<StartBlockCounts> {
  const [pending] = await db
    .select({ n: count() })
    .from(schema.noteVetting)
    .where(and(eq(schema.noteVetting.ownerId, ownerId), eq(schema.noteVetting.state, 'pending')))

  const [due] = await db
    .select({ n: count() })
    .from(schema.schedulingEpoch)
    // ⚠️ **The join is the point.** Suspension lives on `card` (`S9`, `S11`) and
    // cannot be in `scheduling_epoch`'s partial index, so `04` §11 says the due
    // query joins `card` to filter `suspended_at IS NULL`. Counting epochs alone
    // would offer a *session* of cards that a flag or a deleted *source* has
    // already withdrawn.
    .innerJoin(schema.card, eq(schema.card.id, schema.schedulingEpoch.cardId))
    .where(
      and(
        eq(schema.schedulingEpoch.ownerId, ownerId),
        // The live epoch. A superseded one is history (`04` §7.4).
        isNull(schema.schedulingEpoch.supersededAt),
        isNull(schema.card.suspendedAt),
        lte(schema.schedulingEpoch.due, sql`now()`),
      ),
    )

  return { pending: pending?.n ?? 0, due: due?.n ?? 0 }
}

/**
 * One *source*'s title, for the line `09` §4.2 puts above the runs when
 * identical content is resubmitted: "a line naming the earlier *source* and
 * linking to it".
 *
 * The id arrives in a query string (`/?existing=…`), so the caller checks its
 * shape first — `shared/ingest/existing.ts`. Drizzle parameterises the value
 * either way; the guard is so a malformed id is a missing line rather than a
 * database error on a page that was rendering fine.
 */
export async function sourceTitle(db: IngestDatabase, id: string): Promise<string | null> {
  const [found] = await db
    .select({ title: schema.source.title })
    .from(schema.source)
    .where(and(eq(schema.source.id, id), isNull(schema.source.deletedAt)))
    .limit(1)

  return found?.title ?? null
}

export interface SourceDetail {
  id: string
  title: string
  submittedAt: Date
  charCount: number
  /** ⚠️ The retained material — ADR 0008, and never logged (`03` §13.4). */
  content: string
  deletedAt: Date | null
  status: RunStatus | null
}

/**
 * One *source*, readable — `10` §7.2, and the reason `source.content` is
 * retained at all (ADR 0008).
 *
 * ⚠️ **This is the readable half only.** `S11`'s *occurrence* positions, the
 * *notes* that came from it and the delete confirmation are `10` §7.2 and §7.3
 * and are not built: #6's acceptance criteria put them out of this milestone.
 * What is here is what `09` §4.2's "offers to open the existing one" and
 * `10` §7.1's list link need in order to lead somewhere.
 */
export async function sourceDetail(db: IngestDatabase, id: string): Promise<SourceDetail | null> {
  const newest = alias(schema.ingestion, 'newest_ingestion')

  const [found] = await db
    .select({
      id: schema.source.id,
      title: schema.source.title,
      submittedAt: schema.source.submittedAt,
      charCount: schema.source.charCount,
      content: schema.source.content,
      deletedAt: schema.source.deletedAt,
      status: sql<string | null>`(${db
        .select({ status: newest.status })
        .from(newest)
        .where(eq(newest.sourceId, schema.source.id))
        .orderBy(desc(newest.submittedAt))
        .limit(1)})`,
    })
    .from(schema.source)
    .where(eq(schema.source.id, id))
    .limit(1)

  if (!found)
    return null

  return { ...found, status: (found.status as RunStatus | null) ?? null }
}
