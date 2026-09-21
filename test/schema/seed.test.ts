// The *seed* — ADR 0070, #25 — at the tier that can see the rows.
//
// ⚠️ **One table for jobs, and the target is exactly one of two columns.** ADR
// 0070 left the job's shape to the build with one condition: keep the claim,
// the heartbeat and the sweep single. They read neither `ingestion_id` nor
// `seed_id`, so a `seed` job is a row in the same queue, and `job_target` is
// what stops a row pointing at both or at nothing.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { discardSeed, openSeed, recordSeed } from '../../server/utils/ingest/seed'
import { recordSource } from '../../server/utils/ingest/record'
import { freshDatabase, reset } from './harness'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase

const OWNER = 'usr_test'
const OTHER = 'usr_other'
const REQUEST = { domain: 'tech', level: 'N3', count: 25 }

beforeAll(async () => {
  ({ client, db } = await freshDatabase())
}, 30_000)

beforeEach(async () => {
  await reset(client)
  await client.exec(`
    INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('${OWNER}', 'Reader', 'reader@example.test', true, now(), now()),
           ('${OTHER}', 'Other', 'other@example.test', true, now(), now());
  `)
})

async function requested(requestedBy = OWNER) {
  return recordSeed(db, { subjectId: 'jlpt-vocab', request: REQUEST, requestedBy })
}

/** What the worker writes when the answer arrives — `worker/seeding.py`. */
async function answered(seedId: string, terms: string[]) {
  await client.query(
    `UPDATE seed SET completed_at = now(), terms = $2, model_id = 'claude-sonnet-5',
       prompt_version = 'seed-v1', input_tokens = 900, output_tokens = 300,
       cost_micro_usd = 4800, price_table_effective_date = '2026-09-12', excluded_term_count = 3
     WHERE id = $1;`,
    [seedId, terms],
  )
  await client.query(`UPDATE job SET state = 'done', finished_at = now() WHERE seed_id = $1;`, [seedId])
}

async function seedRow(id: string) {
  const result = await client.query<{
    source_id: string | null
    submitted_at: Date | null
    discarded_at: Date | null
  }>(`SELECT source_id, submitted_at, discarded_at FROM seed WHERE id = $1;`, [id])
  return result.rows[0]!
}

describe('a seed request — ADR 0070 §1', () => {
  it('writes the seed and a queued `seed` job, and the job names no ingestion', async () => {
    const written = await requested()

    const seed = await client.query<{ domain: string, level: string, count: number, requested_by: string }>(
      `SELECT domain, level, count, requested_by FROM seed WHERE id = $1;`,
      [written.seedId],
    )
    expect(seed.rows).toEqual([{ domain: 'tech', level: 'N3', count: 25, requested_by: OWNER }])

    const job = await client.query<{ kind: string, state: string, ingestion_id: string | null, seed_id: string, requested_by: string }>(
      `SELECT kind, state, ingestion_id, seed_id, requested_by FROM job WHERE id = $1;`,
      [written.jobId],
    )
    expect(job.rows).toEqual([
      { kind: 'seed', state: 'queued', ingestion_id: null, seed_id: written.seedId, requested_by: OWNER },
    ])
  })

  it('is refused whole when the job cannot be written', async () => {
    await client.exec(`ALTER TABLE job ADD CONSTRAINT sabotage CHECK (kind <> 'seed');`)
    try {
      await expect(requested()).rejects.toThrow()
      const seeds = await client.query(`SELECT 1 FROM seed;`)
      expect(seeds.rows).toHaveLength(0)
    }
    finally {
      await client.exec(`ALTER TABLE job DROP CONSTRAINT sabotage;`)
    }
  })
})

describe('`job_target` — exactly one target, and the kind says which', () => {
  it('refuses a seed job with no seed', async () => {
    await expect(client.exec(`INSERT INTO job (kind) VALUES ('seed');`)).rejects.toThrow(/job_target/)
  })

  it('refuses an ingest job with no ingestion', async () => {
    await expect(client.exec(`INSERT INTO job (kind) VALUES ('ingest');`)).rejects.toThrow(/job_target/)
  })

  it('refuses an ingest job that points at a seed', async () => {
    const { seedId } = await requested()
    await expect(
      client.query(`INSERT INTO job (kind, seed_id) VALUES ('ingest', $1);`, [seedId]),
    ).rejects.toThrow(/job_target/)
  })

  it('refuses a seed job that also points at an ingestion', async () => {
    const { seedId } = await requested()
    const source = await recordSource(db, {
      subjectId: 'jlpt-vocab',
      kind: 'word_list',
      title: 'list',
      content: '会議',
      characterCount: 2,
      submittedBy: OWNER,
    })
    await expect(
      client.query(`INSERT INTO job (kind, seed_id, ingestion_id) VALUES ('seed', $1, $2);`, [seedId, source.ingestionId]),
    ).rejects.toThrow(/job_target/)
  })

  it('takes a seed\'s job with it when the seed goes', async () => {
    const { seedId, jobId } = await requested()
    await client.query(`DELETE FROM seed WHERE id = $1;`, [seedId])
    const jobs = await client.query(`SELECT 1 FROM job WHERE id = $1;`, [jobId])
    expect(jobs.rows).toHaveLength(0)
  })
})

describe('the seed table\'s own constraints — `04` §6.5', () => {
  it.each([0, 101])('refuses a count of %i', async (count) => {
    await expect(
      client.query(`INSERT INTO seed (subject_id, domain, level, count) VALUES ('jlpt-vocab', 'tech', 'N3', $1);`, [count]),
    ).rejects.toThrow(/seed_count/)
  })

  it('refuses a draft that is both submitted and discarded', async () => {
    const { seedId } = await requested()
    await expect(
      client.query(`UPDATE seed SET submitted_at = now(), discarded_at = now() WHERE id = $1;`, [seedId]),
    ).rejects.toThrow(/seed_disposition/)
  })
})

describe('openSeed — what Ingest shows the requester', () => {
  it('is nothing for a reader who never asked', async () => {
    expect(await openSeed(db, OWNER)).toBeNull()
  })

  it('says it is waiting while the job is queued', async () => {
    const { seedId } = await requested()
    expect(await openSeed(db, OWNER)).toMatchObject({ id: seedId, state: 'waiting', terms: [], ...REQUEST })
  })

  it('says it is drafting once a worker has claimed it', async () => {
    const { seedId } = await requested()
    await client.query(`UPDATE job SET state = 'claimed', claimed_by = 'w', claimed_at = now(), heartbeat_at = now() WHERE seed_id = $1;`, [seedId])
    expect(await openSeed(db, OWNER)).toMatchObject({ state: 'drafting' })
  })

  it('carries the list once it has come back', async () => {
    const { seedId } = await requested()
    await answered(seedId, ['会議', '予算'])
    expect(await openSeed(db, OWNER)).toMatchObject({ state: 'ready', terms: ['会議', '予算'] })
  })

  it('carries the job\'s error when it failed', async () => {
    const { seedId } = await requested()
    await client.query(`UPDATE job SET state = 'failed', finished_at = now(), last_error = 'the model provider answered 529 after 3 attempts' WHERE seed_id = $1;`, [seedId])
    expect(await openSeed(db, OWNER)).toMatchObject({
      state: 'failed',
      error: 'the model provider answered 529 after 3 attempts',
    })
  })

  it('is the newest open one', async () => {
    await requested()
    const second = await requested()
    expect((await openSeed(db, OWNER))?.id).toBe(second.seedId)
  })

  it('is never another reader\'s', async () => {
    await requested(OTHER)
    expect(await openSeed(db, OWNER)).toBeNull()
  })
})

describe('discardSeed', () => {
  it('takes the draft off the screen and keeps the row and its cost — ADR 0070 §2', async () => {
    const { seedId } = await requested()
    await answered(seedId, ['会議'])

    expect(await discardSeed(db, { seedId, requestedBy: OWNER })).toBe(true)
    expect(await openSeed(db, OWNER)).toBeNull()

    const cost = await client.query<{ cost: number }>(`SELECT cost_micro_usd::int AS cost FROM seed WHERE id = $1;`, [seedId])
    expect(cost.rows[0]!.cost).toBe(4800)
  })

  it('refuses another reader\'s draft', async () => {
    const { seedId } = await requested(OTHER)
    expect(await discardSeed(db, { seedId, requestedBy: OWNER })).toBe(false)
    expect((await seedRow(seedId)).discarded_at).toBeNull()
  })

  it('refuses a draft already submitted', async () => {
    const { seedId } = await requested()
    await answered(seedId, ['会議'])
    await submit(seedId)
    expect(await discardSeed(db, { seedId, requestedBy: OWNER })).toBe(false)
  })

  it('refuses an id that is not an id, rather than failing', async () => {
    expect(await discardSeed(db, { seedId: 'nope', requestedBy: OWNER })).toBe(false)
  })
})

async function submit(seedId: string | undefined, submittedBy = OWNER) {
  return recordSource(db, {
    subjectId: 'jlpt-vocab',
    kind: 'word_list',
    title: 'tech · N3 · 25 words',
    content: '会議',
    characterCount: 2,
    submittedBy,
    seedId,
  })
}

describe('submitting a draft — ADR 0070 §1', () => {
  it('links the seed to the source it became and takes it off the screen', async () => {
    const { seedId } = await requested()
    await answered(seedId, ['会議'])

    const written = await submit(seedId)

    const row = await seedRow(seedId)
    expect(row.source_id).toBe(written.sourceId)
    expect(row.submitted_at).not.toBeNull()
    expect(await openSeed(db, OWNER)).toBeNull()
  })

  it('is an ordinary word_list source with its own ingestion — no new kind', async () => {
    const { seedId } = await requested()
    await answered(seedId, ['会議'])
    const written = await submit(seedId)

    const source = await client.query<{ kind: string }>(`SELECT kind FROM source WHERE id = $1;`, [written.sourceId])
    expect(source.rows[0]!.kind).toBe('word_list')
    const job = await client.query<{ kind: string }>(`SELECT kind FROM job WHERE ingestion_id = $1;`, [written.ingestionId])
    expect(job.rows[0]!.kind).toBe('ingest')
  })

  it('does not link a seed that has not come back yet', async () => {
    const { seedId } = await requested()
    await submit(seedId)
    expect((await seedRow(seedId)).submitted_at).toBeNull()
  })

  it('does not link another reader\'s seed', async () => {
    const { seedId } = await requested(OTHER)
    await answered(seedId, ['会議'])
    await submit(seedId)
    expect((await seedRow(seedId)).submitted_at).toBeNull()
  })

  it('writes the source whatever the seed field says — the reader typed a list either way', async () => {
    const written = await submit('not-a-uuid')
    expect(written.sourceId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('⚠️ stays submitted when the source is hard-deleted, rather than reappearing as a draft', async () => {
    const { seedId } = await requested()
    await answered(seedId, ['会議'])
    const written = await submit(seedId)

    await client.query(`DELETE FROM source WHERE id = $1;`, [written.sourceId])

    const row = await seedRow(seedId)
    expect(row.source_id).toBeNull()
    expect(row.submitted_at).not.toBeNull()
    expect(await openSeed(db, OWNER)).toBeNull()
  })
})
