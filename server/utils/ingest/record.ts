/**
 * The write behind `POST /api/source` — `S2`'s first half.
 *
 * ⚠️ **Four rows, one transaction, and the transaction is the requirement.**
 * `11` §2 states it as the test: `source` + `source_chunk` + `ingestion(queued)`
 * + `job(queued)` in one transaction, answered before the worker runs. `S2`'s
 * "returns control immediately" is satisfied by the job row rather than by a
 * fast worker (`09` §4.2), and the work survives the connection dropping a
 * moment later because it is already on disk when the reader is answered.
 *
 * What the transaction is actually protecting is `04` §6.4's claim that **the
 * job table is the truth**. A `job` whose `ingestion` never landed is work a
 * worker will claim and cannot do; an `ingestion` whose `job` never landed is a
 * run that sits in the list forever, queued, with nothing coming for it — and
 * `09` §7 has Ingest reporting exactly that state honestly, which would then be
 * an honest report of a bug. `test/schema/ingest.test.ts` breaks the last insert
 * and asserts the first three are gone.
 *
 * ⚠️ **`ingestion_chunk` is deliberately not written here.** `04` §6.2 is
 * per-chunk *progress*, and progress before anything has been claimed is a
 * fiction. #7 opens that queue when the worker claims the job.
 *
 * ⚠️ **The `NOTIFY` is outside the transaction and cannot fail the write**
 * (ADR 0043). It is the optimisation ADR 0028 describes, and the thing that
 * makes it safe to treat as one is that the row it is about is already on disk
 * when it is sent.
 */

import { createHash } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

import * as schema from '../../db/schema'
import { chunkBoundaries } from '../../../shared/ingest/chunk'
import { notifyJobQueued } from './notify'

/**
 * Both drivers, one signature. The app is `drizzle-orm/node-postgres` (ADR 0040)
 * and the schema tier is `drizzle-orm/pglite`; `PgDatabase` is the base both
 * extend, so this function is written once and tested against the one that can
 * be rolled back in-process.
 */
export type IngestDatabase = PgDatabase<PgQueryResultHKT, typeof schema>

export interface SourceSubmission {
  subjectId: string
  /** Never blank — `shared/ingest/submission.ts` derives one when the field was. */
  title: string
  /** ⚠️ **NFC already.** The hash, the count and the offsets all assume it. */
  content: string
  /** Code points. `04` §5.1's `char_count`, and its `CHECK`'s subject. */
  characterCount: number
  /** ⚠️ An audit line, **not an owner** — `04` §4. */
  submittedBy: string
  /**
   * `04` §6.4's `job.kind`. **A submission is always `ingest`**, and this
   * parameter exists so `test/schema/ingest.test.ts` can drive the `CHECK` from
   * the same path production uses rather than by raw SQL.
   *
   * ⚠️ **Corrected 2026-09-11 by #7 — this said "#7 writes `resume`" and #7 does
   * not.** A resume enqueues a second `job` against an *ingestion* that already
   * exists (`04` §6.2); it writes no `source`, no chunks and no `ingestion`,
   * which is every other thing this function does. Nothing in the repository
   * passes a `jobKind` but that test.
   */
  jobKind?: 'ingest' | 'resume'
}

/** The earlier *source* the screen offers to open — PRD §5, `09` §4.2. */
export interface DuplicateSource {
  id: string
  title: string
  submittedAt: Date
}

export interface RecordedSource {
  sourceId: string
  ingestionId: string
  jobId: string
  chunkCount: number
  /** Null unless identical content is already on record. */
  duplicateOf: DuplicateSource | null
}

export async function recordSource(
  db: IngestDatabase,
  submission: SourceSubmission,
): Promise<RecordedSource> {
  const contentHash = sha256(submission.content)
  const boundaries = chunkBoundaries(submission.content)

  // ⚠️ **One pass to code points, then index it** — the same reason
  // `shared/ingest/chunk.ts` does it once rather than per chunk. Calling
  // `sliceCharacters` per boundary re-splits the whole content each time, which
  // is 84 walks over a 100,000-character *source*: measured at **88 ms** for one
  // paste, **inside the transaction**. Hashing is the only thing here that needs
  // the text, so it takes the slice from an array that already exists.
  const characters = Array.from(submission.content)
  const chunkHashes = boundaries.map(boundary =>
    sha256(characters.slice(boundary.charStart, boundary.charEnd).join('')),
  )

  const written = await db.transaction(async (tx) => {
    // ⚠️ Inside the transaction and **before** the insert, so the new *source*
    // cannot find itself. `04` §5.1 indexes `content_hash` and leaves it
    // deliberately not unique: PRD §5 wants detection, not prevention.
    const duplicateOf = await findIdenticalSource(tx, submission.subjectId, contentHash)

    const [source] = await tx
      .insert(schema.source)
      .values({
        subjectId: submission.subjectId,
        title: submission.title,
        content: submission.content,
        contentHash,
        charCount: submission.characterCount,
      })
      .returning({ id: schema.source.id })

    const sourceId = source!.id

    // One statement rather than a loop: a 100,000-character *source* is 84
    // chunks, and 84 round trips inside a transaction is 84 chances for the
    // connection to be the thing that fails.
    await tx.insert(schema.sourceChunk).values(
      boundaries.map((boundary, index) => ({
        sourceId,
        ordinal: boundary.ordinal,
        charStart: boundary.charStart,
        charEnd: boundary.charEnd,
        contentHash: chunkHashes[index]!,
      })),
    )

    const [ingestion] = await tx
      .insert(schema.ingestion)
      .values({
        sourceId,
        // ⚠️ Snapshotted, so the spend ledger stays readable after a hard
        // delete takes the *source* row away — `04` §6.1, §9.
        sourceTitle: submission.title,
        subjectId: submission.subjectId,
        status: 'queued',
        submittedBy: submission.submittedBy,
      })
      .returning({ id: schema.ingestion.id })

    const ingestionId = ingestion!.id

    const [job] = await tx
      .insert(schema.job)
      .values({
        kind: submission.jobKind ?? 'ingest',
        ingestionId,
        state: 'queued',
        requestedBy: submission.submittedBy,
      })
      .returning({ id: schema.job.id })

    return {
      sourceId,
      ingestionId,
      jobId: job!.id,
      chunkCount: boundaries.length,
      duplicateOf,
    }
  })

  // ADR 0028: the wake-up, and only that. The four rows are committed above; if
  // this never reaches a worker the run starts at the next connect instead.
  await notifyJobQueued(db)

  return written
}

/**
 * The most recent live *source* with the same content.
 *
 * ⚠️ **Soft-deleted *sources* are excluded.** `S11` requires a deleted *source*
 * to stay readable (`10` §7.1 keeps it in the list), which is not the same as
 * offering it as somewhere to go — the offer's whole content is "you already
 * have this, open it instead", and that is not true of one the reader deleted.
 *
 * Most recent rather than first: where a *source* has been ingested several
 * times, the latest run is the one whose *notes* are in the queue.
 */
async function findIdenticalSource(
  tx: IngestDatabase,
  subjectId: string,
  contentHash: string,
): Promise<DuplicateSource | null> {
  const [existing] = await tx
    .select({
      id: schema.source.id,
      title: schema.source.title,
      submittedAt: schema.source.submittedAt,
    })
    .from(schema.source)
    .where(
      and(
        eq(schema.source.subjectId, subjectId),
        eq(schema.source.contentHash, contentHash),
        isNull(schema.source.deletedAt),
      ),
    )
    .orderBy(desc(schema.source.submittedAt))
    .limit(1)

  return existing ?? null
}

/**
 * `04` §5.1: "SHA-256 hex of NFC-normalised `content`". The normalisation is
 * `shared/ingest/submission.ts`'s job and has already happened — hashing raw
 * input here would make the two definitions disagree.
 */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
