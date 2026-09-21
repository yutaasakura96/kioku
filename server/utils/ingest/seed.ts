/**
 * The *seed*'s writes and its one read — [ADR 0070](../../../docs/adr/0070-a-seeded-list-is-a-draft-the-reader-submits.md), #25.
 *
 * A seed is asked for on *Ingest* and answered by the worker (`worker/seeding.py`),
 * because the provider key exists only there (`03` §13.1). This module writes the
 * request, reads back the draft for the requester, and takes a discarded one off
 * the screen. Submitting a draft is `recordSource`'s, because it is a *source*
 * like any other (ADR 0070 §1).
 *
 * ⚠️ **Two rows, one transaction, and the job is in the same queue as every
 * other.** `job.seed_id` rather than a second table of jobs, so the claim, the
 * heartbeat and the sweep stay single (ADR 0070 § Settled by the build). The
 * `NOTIFY` is after the commit and cannot fail the write, as in `record.ts`.
 */

import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { SeedRequest } from '../../../shared/ingest/seed'
import { isUuid } from '../../../shared/utils/uuid'
import { notifyJobQueued } from './notify'
import type { IngestDatabase } from './record'

export interface SeedSubmission {
  subjectId: string
  request: SeedRequest
  /** ⚠️ An audit line, and the reader *Ingest* shows the draft to. */
  requestedBy: string
}

export interface RecordedSeed {
  seedId: string
  jobId: string
}

export async function recordSeed(db: IngestDatabase, submission: SeedSubmission): Promise<RecordedSeed> {
  const written = await db.transaction(async (tx) => {
    const [seed] = await tx
      .insert(schema.seed)
      .values({
        subjectId: submission.subjectId,
        domain: submission.request.domain,
        level: submission.request.level,
        count: submission.request.count,
        requestedBy: submission.requestedBy,
      })
      .returning({ id: schema.seed.id })

    const [job] = await tx
      .insert(schema.job)
      .values({
        kind: 'seed',
        seedId: seed!.id,
        state: 'queued',
        requestedBy: submission.requestedBy,
      })
      .returning({ id: schema.job.id })

    return { seedId: seed!.id, jobId: job!.id }
  })

  // ADR 0028: the wake-up and only that. If no worker hears it, the draft waits
  // for the next connect, and *Ingest* says it is waiting (ADR 0070).
  await notifyJobQueued(db)

  return written
}

/**
 * Where the draft is, in the reader's terms.
 *
 * ⚠️ **`waiting` is the laptop being closed** (ADR 0022): the job is queued and
 * no worker has it. The screen says so, and says nothing about why — `09` §7's
 * rule that *Ingest* never diagnoses a dead worker.
 */
export type SeedState = 'waiting' | 'drafting' | 'ready' | 'failed'

export interface SeedDraft {
  id: string
  domain: string
  level: string
  count: number
  state: SeedState
  /** One *term* each. Empty until `ready`, and possibly empty then. */
  terms: string[]
  /** The job's `last_error`, which never names the provider (`03` §11). */
  error: string | null
  requestedAt: Date
}

/**
 * The requester's newest seed still on the screen — neither submitted nor
 * discarded — or `null`.
 *
 * ⚠️ **Scoped to the requester, on a shared table** (`04` §4, §6.5). The spend
 * is reported whoever asked; the draft is shown only to the reader who asked
 * for it, because a list in the word-list field is one they are about to submit.
 */
export async function openSeed(db: IngestDatabase, requestedBy: string): Promise<SeedDraft | null> {
  const [row] = await db
    .select({
      id: schema.seed.id,
      domain: schema.seed.domain,
      level: schema.seed.level,
      count: schema.seed.count,
      completedAt: schema.seed.completedAt,
      terms: schema.seed.terms,
      requestedAt: schema.seed.requestedAt,
      jobState: schema.job.state,
      jobError: schema.job.lastError,
    })
    .from(schema.seed)
    .leftJoin(schema.job, eq(schema.job.seedId, schema.seed.id))
    .where(
      and(
        eq(schema.seed.requestedBy, requestedBy),
        isNull(schema.seed.submittedAt),
        isNull(schema.seed.discardedAt),
      ),
    )
    .orderBy(desc(schema.seed.requestedAt), desc(schema.seed.id))
    .limit(1)

  if (!row)
    return null

  return {
    id: row.id,
    domain: row.domain,
    level: row.level,
    count: row.count,
    state: stateOf(row.completedAt, row.jobState),
    terms: row.completedAt ? (row.terms ?? []) : [],
    error: row.jobState === 'failed' ? row.jobError : null,
    requestedAt: row.requestedAt,
  }
}

function stateOf(completedAt: Date | null, jobState: string | null): SeedState {
  if (completedAt)
    return 'ready'
  if (jobState === 'queued')
    return 'waiting'
  if (jobState === 'claimed')
    return 'drafting'
  // `failed`, or a job that finished without an answer — which the worker does
  // only for a seed discarded before it was claimed, and that one is not open.
  return 'failed'
}

export interface SeedDiscard {
  seedId: string
  requestedBy: string
}

/**
 * Take the requester's open draft off the screen. Answers whether it did.
 *
 * ⚠️ **The row stays, and so does its cost** (ADR 0070 §2): a discarded draft
 * was paid for. ⚠️ **A draft still queued is discarded too**, and the worker
 * reads `discarded_at` before it spends (`worker/seeding.py`), so discarding
 * one the laptop has not reached yet costs nothing.
 */
export async function discardSeed(db: IngestDatabase, discard: SeedDiscard): Promise<boolean> {
  if (!isUuid(discard.seedId))
    return false

  const discarded = await db
    .update(schema.seed)
    .set({ discardedAt: new Date() })
    .where(
      and(
        eq(schema.seed.id, discard.seedId),
        eq(schema.seed.requestedBy, discard.requestedBy),
        isNull(schema.seed.submittedAt),
        isNull(schema.seed.discardedAt),
      ),
    )
    .returning({ id: schema.seed.id })

  return discarded.length > 0
}

/**
 * Mark the draft submitted, inside `recordSource`'s transaction — ADR 0070 §1.
 *
 * ⚠️ **Only a draft that came back, is still open, and is the submitter's.**
 * Anything else leaves the seed alone and the *source* is written regardless:
 * the reader submitted a word list, and whether it began as a seed is a fact
 * about the seed rather than a condition on the submission.
 */
export async function markSeedSubmitted(
  tx: IngestDatabase,
  { seedId, sourceId, submittedBy }: { seedId: string | undefined, sourceId: string, submittedBy: string },
): Promise<void> {
  if (!isUuid(seedId))
    return

  await tx
    .update(schema.seed)
    .set({ sourceId, submittedAt: new Date() })
    .where(
      and(
        eq(schema.seed.id, seedId),
        eq(schema.seed.requestedBy, submittedBy),
        isNotNull(schema.seed.completedAt),
        isNull(schema.seed.submittedAt),
        isNull(schema.seed.discardedAt),
      ),
    )
}
