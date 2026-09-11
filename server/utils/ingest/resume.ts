/**
 * The resume write — `10` §6.2's control, `04` §6.2, `04` §6.4, `03` §5.4.
 *
 * ⚠️ **This is the half that was owed by three tickets in a row, and it could
 * not honestly be built by any of them.** `10` §6.2 first put it on #6, which
 * built the run row; #6 moved it to #7, because resuming *means* `04` §6.2's
 * `WHERE ingestion_id = $1 AND status <> 'complete'` and that query is the
 * worker's; #7 moved it to #8, because #7 built the query and no *chunk
 * processor*, so a resume re-settled the run and changed nothing a reader would
 * see. **#8 is where it becomes true**: there are stages now, so a resume
 * re-runs the chunks that did not complete and something happens.
 *
 * ⚠️ **A resume writes one row and nothing else.** No `source`, no
 * `source_chunk`, no `ingestion` — those exist, which is the entire point of
 * `03` §5.4's *partial results are kept*. It is the shortest possible expression
 * of ADR 0015: the per-chunk record already **is** the queue, so resuming is
 * enqueueing a second worker visit rather than reconstructing anything.
 */

import { and, eq, inArray } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { notifyJobQueued } from './notify'
import type { IngestDatabase } from './record'

/** Why a resume did nothing, when it did nothing. */
export type ResumeRefusal = 'no_such_run' | 'not_resumable' | 'already_queued'

export interface ResumeRequest {
  ingestionId: string
  /** ⚠️ `job.requested_by` — an audit line, not an owner (`04` §4). */
  requestedBy: string
}

export type ResumeOutcome =
  | { ok: true, jobId: string }
  | { ok: false, reason: ResumeRefusal }

/**
 * Enqueue a second visit to an *ingestion* that stopped part-way.
 *
 * ⚠️ **`incomplete` and nothing else.** `04` §6.1 calls it "`S2`'s resumable
 * state, not an error", and it is the only status where a resume has meaning: a
 * `complete` run has no chunks left for `04` §6.2's query to find, a `running`
 * one already has a worker on it, and a `queued` one has not started. Writing
 * the job anyway would produce exactly the button `10` §6.2 refused to ship —
 * one that visibly does nothing.
 *
 * ⚠️ **`failed` is excluded too, and that is not an oversight.** `runs.py`'s
 * `settle_run` cannot produce `failed` — the comment there says why — so a
 * `failed` *ingestion* is one that could not be started at all, and what it
 * needs is not a second visit to a queue that was never opened.
 *
 * ⚠️ **One live job at a time.** A reader who presses the control twice would
 * otherwise queue two jobs; the second claims an *ingestion* whose chunks the
 * first has already taken, finds nothing, and settles it again. Harmless, and
 * still two rows in a table `09` §7 reports from — so it is refused by name
 * rather than absorbed.
 */
export async function recordResume(
  db: IngestDatabase,
  request: ResumeRequest,
): Promise<ResumeOutcome> {
  const outcome = await db.transaction(async (tx): Promise<ResumeOutcome> => {
    const [run] = await tx
      .select({ status: schema.ingestion.status })
      .from(schema.ingestion)
      .where(eq(schema.ingestion.id, request.ingestionId))
      .limit(1)

    if (!run)
      return { ok: false, reason: 'no_such_run' }

    if (run.status !== 'incomplete')
      return { ok: false, reason: 'not_resumable' }

    const [live] = await tx
      .select({ id: schema.job.id })
      .from(schema.job)
      .where(
        and(
          eq(schema.job.ingestionId, request.ingestionId),
          inArray(schema.job.state, ['queued', 'claimed']),
        ),
      )
      .limit(1)

    if (live)
      return { ok: false, reason: 'already_queued' }

    const [job] = await tx
      .insert(schema.job)
      .values({
        // ⚠️ `04` §6.4's second `kind`, and the first time anything in this
        // repository writes it. `record.ts`'s `jobKind` parameter carried a
        // comment saying #7 would; #7 corrected it to say nothing does. This
        // does, and from its own function, because a resume shares none of
        // `recordSource`'s work.
        kind: 'resume',
        ingestionId: request.ingestionId,
        state: 'queued',
        requestedBy: request.requestedBy,
      })
      .returning({ id: schema.job.id })

    return { ok: true, jobId: job!.id }
  })

  // ADR 0043: after the transaction that earned it, and it cannot fail the
  // write. If no worker hears it the job is taken at the next connect instead —
  // which is ADR 0028's whole point and is why this is outside.
  if (outcome.ok)
    await notifyJobQueued(db)

  return outcome
}
