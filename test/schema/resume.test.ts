// The resume write — `10` §6.2's control, at the tier that can see the rows.
//
// ⚠️ **`03` §5.4's *partial results are kept* is the whole design this control
// is the visible end of.** Discarding a half-finished ingestion throws away
// money already spent; keeping it means the run sits at `incomplete` with its
// completed chunks on disk, and something has to be able to ask for the rest.
// Until #8 nothing could: `04` §6.2's query is the worker's and #7 built it, but
// with no chunk processor a resume re-settled the run and changed nothing.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { recordResume } from '../../server/utils/ingest/resume'
import { recordSource } from '../../server/utils/ingest/record'
import { freshDatabase, reset } from './harness'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase

const OWNER = 'usr_test'

beforeAll(async () => {
  ({ client, db } = await freshDatabase())
}, 30_000)

beforeEach(async () => {
  await reset(client)
  await client.exec(`
    INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('${OWNER}', 'Reader', 'reader@example.test', true, now(), now());
  `)
})

/** A run that stopped part-way, with its first job already finished. */
async function incompleteRun(): Promise<string> {
  const written = await recordSource(db, {
    subjectId: 'jlpt-vocab',
    title: '社説',
    content: '駅の近くに図書館があります。',
    characterCount: 14,
    submittedBy: OWNER,
  })
  await client.exec(`
    UPDATE ingestion SET status = 'incomplete' WHERE id = '${written.ingestionId}';
    UPDATE job SET state = 'done', finished_at = now() WHERE ingestion_id = '${written.ingestionId}';
  `)
  return written.ingestionId
}

async function jobs(ingestionId: string) {
  const result = await client.query<{ kind: string, state: string, requested_by: string | null }>(
    `SELECT kind, state, requested_by FROM job WHERE ingestion_id = $1 ORDER BY created_at;`,
    [ingestionId],
  )
  return result.rows
}

describe('a run that stopped part-way', () => {
  it('is resumed by one new job and nothing else', async () => {
    const ingestionId = await incompleteRun()

    const outcome = await recordResume(db, { ingestionId, requestedBy: OWNER })

    expect(outcome).toEqual({ ok: true, jobId: expect.any(String) })
    expect(await jobs(ingestionId)).toEqual([
      { kind: 'ingest', state: 'done', requested_by: OWNER },
      { kind: 'resume', state: 'queued', requested_by: OWNER },
    ])
  })

  it('writes no second source, chunk or ingestion', async () => {
    // ⚠️ ADR 0015: the per-chunk record already **is** the queue, so a resume
    // reconstructs nothing. A second `source` here would also be a second
    // `content_hash`, which `10` §6.3 would then offer the reader as a duplicate
    // of the thing they just asked to continue.
    const ingestionId = await incompleteRun()
    const before = await counts()

    await recordResume(db, { ingestionId, requestedBy: OWNER })

    expect(await counts()).toEqual(before)
  })

  it('refuses a second resume while one is still queued', async () => {
    // A double press. The second job would claim an *ingestion* whose chunks the
    // first has already taken, find nothing and settle it again — harmless, and
    // still a row `09` §7 reports from.
    const ingestionId = await incompleteRun()
    await recordResume(db, { ingestionId, requestedBy: OWNER })

    expect(await recordResume(db, { ingestionId, requestedBy: OWNER })).toEqual({
      ok: false,
      reason: 'already_queued',
    })
    expect(await jobs(ingestionId)).toHaveLength(2)
  })
})

describe('a run that is not resumable', () => {
  it('refuses a complete run', async () => {
    // ⚠️ `04` §6.2's query would find nothing: `WHERE status <> 'complete'` over
    // a queue with nothing left in it. The job would be claimed, do nothing and
    // finish — `10` §6.2's "button that visibly does nothing", written as a row.
    const ingestionId = await incompleteRun()
    await client.exec(`UPDATE ingestion SET status = 'complete' WHERE id = '${ingestionId}';`)

    expect(await recordResume(db, { ingestionId, requestedBy: OWNER })).toEqual({
      ok: false,
      reason: 'not_resumable',
    })
    expect(await jobs(ingestionId)).toHaveLength(1)
  })

  it('refuses a failed run', async () => {
    // ⚠️ `settle_run` cannot produce `failed` (`worker/runs.py` says why), so a
    // `failed` *ingestion* is one that could never be started. What it needs is
    // not a second visit to a queue that was never opened.
    const ingestionId = await incompleteRun()
    await client.exec(`UPDATE ingestion SET status = 'failed' WHERE id = '${ingestionId}';`)

    expect(await recordResume(db, { ingestionId, requestedBy: OWNER })).toEqual({
      ok: false,
      reason: 'not_resumable',
    })
  })

  it('refuses an id that is not a run', async () => {
    expect(
      await recordResume(db, {
        ingestionId: '019bd3ff-0000-7000-8000-000000000000',
        requestedBy: OWNER,
      }),
    ).toEqual({ ok: false, reason: 'no_such_run' })
  })
})

async function counts() {
  const rows = await client.query<{ sources: string, chunks: string, ingestions: string }>(`
    SELECT (SELECT count(*) FROM source)::text AS sources,
           (SELECT count(*) FROM source_chunk)::text AS chunks,
           (SELECT count(*) FROM ingestion)::text AS ingestions;
  `)
  return rows.rows[0]
}
