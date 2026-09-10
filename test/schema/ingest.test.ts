// `S2`'s first half, at the tier `11-testing-plan.md` §2 puts it in.
//
//   **S2** Wall of text → notes | `POST /api/source` writes `source` +
//   `source_chunk` + `ingestion(queued)` + `job(queued)` **in one transaction**
//   and answers before the worker runs | schema + worker
//
// ⚠️ **"In one transaction" is the assertion, and it is only meaningful if it can
// fail.** Four separate inserts pass every test that checks the rows exist
// afterwards; what separates them is what is on disk when the third one throws.
// So the transaction is tested by breaking it in the middle and asserting that
// nothing survives — `04` §6.4's job row is the queue, and a `job` with no
// `ingestion` behind it, or an `ingestion` whose `source` never landed, is work
// the worker will claim and cannot do.
//
// The other half of `S2` — that a *note* is vettable while later chunks are
// still generating — belongs to the worker tier and arrives with #7 and #8.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { recordSource } from '../../server/utils/ingest/record'
import { CHUNK_TARGET_CHARACTERS } from '../../shared/ingest/chunk'
import { freshDatabase, reset } from './harness'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase
let ownerId: string

/** Long enough to chunk, and punctuated so the boundaries are the interesting ones. */
const TWO_PAGES = '駅の近くに図書館があります。'.repeat(400)

beforeAll(async () => {
  ({ client, db } = await freshDatabase())
}, 30_000)

beforeEach(async () => {
  await reset(client)
  await client.exec(`
    INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('usr_test', 'Reader', 'reader@example.test', true, now(), now());
  `)
  ownerId = 'usr_test'
})

/**
 * ⚠️ **Drizzle wraps the database's error and Vitest's `toThrow` reads only the
 * outer message.** `schema.test.ts` asserts constraint names directly because it
 * issues raw SQL through PGlite; everything here goes through Drizzle, whose
 * message is `Failed query: insert into "job" …` with the constraint name down
 * in `cause`. Asserting the outer message would pass on *any* failed insert,
 * which is exactly the assertion these two tests must not make.
 */
async function expectRefusal(work: Promise<unknown>, constraint: RegExp): Promise<void> {
  const error = await work.then(() => null, (thrown: unknown) => thrown)
  expect(error, 'expected the write to be refused').not.toBeNull()

  const chain: string[] = []
  for (let link: unknown = error; link instanceof Error; link = link.cause)
    chain.push(link.message)

  expect(chain.join('\n')).toMatch(constraint)
}

async function count(table: string): Promise<number> {
  const result = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table};`)
  return result.rows[0]!.n
}

describe('the four rows, in one transaction', () => {
  it('writes source, source_chunk, ingestion(queued) and job(queued)', async () => {
    const written = await recordSource(db, {
      subjectId: 'jlpt-vocab',
      title: '朝日新聞 社説',
      content: TWO_PAGES,
      characterCount: 5600,
      submittedBy: ownerId,
    })

    expect(await count('source')).toBe(1)
    expect(await count('source_chunk')).toBe(written.chunkCount)
    expect(await count('ingestion')).toBe(1)
    expect(await count('job')).toBe(1)

    const ingestion = await row(`SELECT status, source_title, subject_id, submitted_by FROM ingestion;`)
    expect(ingestion).toMatchObject({
      status: 'queued',
      source_title: '朝日新聞 社説',
      subject_id: 'jlpt-vocab',
      submitted_by: ownerId,
    })

    const job = await row(`SELECT kind, state, ingestion_id, claimed_at, requested_by FROM job;`)
    expect(job).toMatchObject({
      kind: 'ingest',
      state: 'queued',
      ingestion_id: written.ingestionId,
      claimed_at: null,
      requested_by: ownerId,
    })
  })

  it('⚠️ writes no ingestion_chunk rows — that queue is the worker\'s to open', async () => {
    // `04` §6.2: per-chunk progress. The four rows `S2` names do not include it,
    // and a `pending` row per chunk written here would be progress asserted
    // before anything has been claimed. #7 owns it.
    await recordSource(db, submission())
    expect(await count('ingestion_chunk')).toBe(0)
  })

  it('chunks the content, and the chunks tile it — `04` §5.2', async () => {
    const written = await recordSource(db, submission())

    const chunks = await client.query<{ ordinal: number, char_start: number, char_end: number }>(`
      SELECT ordinal, char_start, char_end FROM source_chunk ORDER BY ordinal;
    `)

    expect(chunks.rows).toHaveLength(written.chunkCount)
    expect(chunks.rows[0]!.char_start).toBe(0)
    expect(chunks.rows.at(-1)!.char_end).toBe(5600)

    chunks.rows.forEach((chunk, index) => {
      expect(chunk.ordinal).toBe(index)
      if (index > 0)
        expect(chunk.char_start).toBe(chunks.rows[index - 1]!.char_end)
    })
  })

  it('hashes the source and every chunk — `04` §5.1 and §5.2', async () => {
    await recordSource(db, submission())

    const source = await row<{ content_hash: string, char_count: number }>(
      `SELECT content_hash, char_count FROM source;`,
    )
    expect(source.content_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(source.char_count).toBe(5600)

    const hashes = await client.query<{ content_hash: string }>(
      `SELECT content_hash FROM source_chunk;`,
    )
    for (const chunk of hashes.rows)
      expect(chunk.content_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('⚠️ leaves nothing behind when a write inside the transaction fails', async () => {
    // The assertion the other four cannot make. `job.kind` has a `CHECK`
    // (`04` §6.4), so an unknown kind fails on the last of the four inserts —
    // after `source`, `source_chunk` and `ingestion` have all been written.
    // Without a transaction those three would be on disk and the run would sit
    // in the list forever with no job to claim it.
    await expectRefusal(
      recordSource(db, { ...submission(), jobKind: 'not-a-kind' as 'ingest' }),
      /job_kind/,
    )

    expect(await count('source')).toBe(0)
    expect(await count('source_chunk')).toBe(0)
    expect(await count('ingestion')).toBe(0)
    expect(await count('job')).toBe(0)
  })
})

describe('the cap, which the schema refuses as well', () => {
  // `04` §5.1's `CHECK (char_count > 0 AND char_count <= 100000)` and
  // `03` §13.2's handler check are the same rule stated twice, deliberately —
  // `11` §5. The handler gives the reader a sentence; this refuses a row that
  // arrived by any other path.
  it('refuses a source over 100,000 characters at the constraint', async () => {
    await expectRefusal(
      recordSource(db, { ...submission(), content: 'あ'.repeat(100_001), characterCount: 100_001 }),
      /source_char_count_cap/,
    )

    expect(await count('source')).toBe(0)
    expect(await count('job')).toBe(0)
  })
})

describe('an identical source resubmitted — PRD §5', () => {
  it('⚠️ creates a new source and reports the earlier one, rather than refusing', async () => {
    // `04` §5.1: `content_hash` is indexed and **not** unique. "Detection, not
    // prevention." A second paste of the same text is a choice the reader may
    // have meant — they may have edited the source and pasted it back — and the
    // screen offers to open the existing one (`09` §4.2, `10` §6.3).
    const first = await recordSource(db, submission())
    expect(first.duplicateOf).toBeNull()

    const second = await recordSource(db, submission())

    expect(await count('source')).toBe(2)
    expect(second.sourceId).not.toBe(first.sourceId)
    expect(second.duplicateOf).toMatchObject({ id: first.sourceId })
  })

  it('detects content that differs only by Unicode normalisation', async () => {
    // The hash is of NFC-normalised content (`04` §5.1) and
    // `shared/ingest/submission.ts` normalises on arrival, so a paste from a
    // keyboard that decomposes its dakuten is the same *source*, not a new one.
    const first = await recordSource(db, { ...submission(), content: 'がぎ'.repeat(10), characterCount: 20 })
    const second = await recordSource(db, { ...submission(), content: 'がぎ'.repeat(10), characterCount: 20 })

    expect(second.duplicateOf).toMatchObject({ id: first.sourceId })
  })

  it('does not offer a deleted source — `S11` keeps it readable, not re-openable', async () => {
    const first = await recordSource(db, submission())
    await client.exec(`UPDATE source SET deleted_at = now() WHERE id = '${first.sourceId}';`)

    const second = await recordSource(db, submission())
    expect(second.duplicateOf).toBeNull()
  })

  it('offers the most recent earlier source when there are several', async () => {
    await recordSource(db, submission())
    const second = await recordSource(db, submission())
    const third = await recordSource(db, submission())

    expect(third.duplicateOf).toMatchObject({ id: second.sourceId })
  })

  it('does not confuse two different sources', async () => {
    await recordSource(db, submission())
    const other = await recordSource(db, {
      ...submission(),
      content: '全く違う文章です。'.repeat(10),
      characterCount: 90,
    })

    expect(other.duplicateOf).toBeNull()
  })
})

describe('a source short enough to be one chunk', () => {
  it('still writes a chunk, because the worker has nothing to claim without one', async () => {
    const written = await recordSource(db, {
      ...submission(),
      content: '駅の近くに図書館があります。',
      characterCount: 14,
    })

    expect(written.chunkCount).toBe(1)
    expect(await count('source_chunk')).toBe(1)
  })

  it('splits two pages into several, none of them over the target', async () => {
    const written = await recordSource(db, submission())
    expect(written.chunkCount).toBeGreaterThan(1)

    const widest = await row<{ widest: number }>(
      `SELECT max(char_end - char_start)::int AS widest FROM source_chunk;`,
    )
    expect(widest.widest).toBeLessThanOrEqual(CHUNK_TARGET_CHARACTERS)
  })
})

function submission() {
  return {
    subjectId: 'jlpt-vocab',
    title: '朝日新聞 社説',
    content: TWO_PAGES,
    characterCount: 5600,
    submittedBy: ownerId,
  }
}

async function row<T = Record<string, unknown>>(sql: string): Promise<T> {
  const result = await client.query<T>(sql)
  return result.rows[0]!
}
