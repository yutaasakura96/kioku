// What `/stats` reads — `server/utils/stats/queries.ts`, against a real database.
//
// ⚠️ **There are no metrics tables** (`04` §13), so every figure is a query over
// rows written by the code that produced them, and **every way a number can be
// wrong is a bug rather than a fact about a corpus.** That is the whole reason
// this file exists: the arithmetic has its own seam
// (`test/unit/stats-metrics.test.ts`), and what cannot be checked there is
// whether the right rows reached it.
//
// Each test below is a state the query gets wrong if it is written the obvious
// way:
//
// - ⚠️ ***Time-to-first-review* is per *source*.** `11` §3 names the near-miss
//   implementation — *the first grade of any card* — and says it is wrong the
//   moment a second *source* exists. Every test here seeds two.
// - ⚠️ **The median's samples are unedited accepts only.** An edited accept took
//   longer by definition, and a median over all accepts silently includes it.
// - ⚠️ **A second flag on the same *card* is a second row** (`11` §3), so the
//   flag count must not be a `count(distinct card_id)`.
// - ⚠️ **The ledger survives a hard delete** (`04` §9, `10` §8.3):
//   `ingestion.source_id` is `SET NULL` and `ingestion.source_title` is
//   snapshotted, so the spend stays readable after the material is gone.
// - ⚠️ **Personal rows are owner-scoped and shared rows are not** (`04` §4).
//   `note_vetting`, `card_flag` and `review_log` carry an owner; `source` and
//   `ingestion` assert something about the material, so the ledger has no filter
//   for the same reason `recentRuns` has none.
//
// ⚠️ **No test here asserts a threshold** (ADR 0037).

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { ledger, statsRows } from '../../server/utils/stats/queries'
import { freshDatabase, reset } from './harness'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase

const OWNER = 'usr_test'
const OTHER = 'usr_other'

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

async function one<T>(sql: string): Promise<T> {
  return (await client.query<T>(sql)).rows[0]!
}

/** A *source* and the *ingestion* that paid for it — #6 writes the pair. */
async function ingested(
  title: string,
  {
    minutesAgo = 0,
    environment = 'laptop',
    tokens = true,
    cost = true,
  }: { minutesAgo?: number, environment?: string, tokens?: boolean, cost?: boolean } = {},
): Promise<{ sourceId: string, ingestionId: string }> {
  const source = await one<{ id: string }>(`
    INSERT INTO source (subject_id, title, content, content_hash, char_count, submitted_at)
    VALUES ('jlpt-vocab', '${title}', '駅の近くに図書館があります。', 'hash-${title}', 14,
            now() - interval '${minutesAgo} minutes')
    RETURNING id;
  `)

  const ingestion = await one<{ id: string }>(`
    INSERT INTO ingestion
      (source_id, source_title, subject_id, status, submitted_at, model_id, prompt_version,
       input_tokens, output_tokens, cost_micro_usd, worker_environment)
    VALUES ('${source.id}', '${title}', 'jlpt-vocab', 'complete',
            now() - interval '${minutesAgo} minutes', 'claude-sonnet-5', 'v3',
            ${tokens ? 4200 : 'null'}, ${tokens ? 900 : 'null'},
            ${cost ? 31_450 : 'null'}, '${environment}')
    RETURNING id;
  `)

  return { sourceId: source.id, ingestionId: ingestion.id }
}

/** A *note* the given run produced, and the reader's judgement of it. */
async function vetted(
  ingestionId: string | null,
  key: string,
  {
    owner = OWNER,
    state = 'accepted',
    edited = false,
    seconds = null as number | null,
  } = {},
): Promise<string> {
  const note = await one<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
    VALUES ('jlpt-vocab', '${key}', '{"term":"図書館"}'::jsonb,
            ${ingestionId ? `'${ingestionId}'` : 'null'})
    RETURNING id;
  `)

  await client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, edited, seconds_to_vet, vetted_at)
    VALUES ('${note.id}', '${owner}', '${state}', ${edited},
            ${seconds === null ? 'null' : seconds}, now());
  `)

  return note.id
}

/** The *card* an acceptance mints — ⚠️ and no epoch, because acceptance mints none. */
async function minted(noteId: string, owner = OWNER): Promise<string> {
  const card = await one<{ id: string }>(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${noteId}', '${owner}', 'recognition')
    RETURNING id;
  `)

  return card.id
}

/**
 * One *review*, at a server instant.
 *
 * ⚠️ `received_at` and not `reviewed_at`: `03` §12 requires
 * *time-to-first-review* to measure the submit instant and the first grade
 * instant **on the same clock**, and `reviewed_at` is the client's.
 */
async function reviewed(cardId: string, minutesAgo: number, owner = OWNER): Promise<void> {
  const epoch = await one<{ id: string }>(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
    VALUES ('${cardId}', '${owner}', 1, now() + interval '1 day', 3.1, 5.2, 1)
    ON CONFLICT (card_id, ordinal) DO UPDATE SET due = excluded.due
    RETURNING id;
  `)

  await client.exec(`
    INSERT INTO review_log
      (card_id, scheduling_epoch_id, owner_id, rating, state, due, stability, difficulty,
       scheduled_days, learning_steps, reviewed_at, received_at)
    VALUES ('${cardId}', '${epoch.id}', '${owner}', 3, 0, now() + interval '1 day', 3.1, 5.2, 1, 0,
            now() - interval '${minutesAgo} minutes', now() - interval '${minutesAgo} minutes');
  `)
}

async function flagged(cardId: string, noteId: string, owner = OWNER): Promise<void> {
  await client.exec(`
    INSERT INTO card_flag (card_id, note_id, owner_id, prompt_version, model_id)
    VALUES ('${cardId}', '${noteId}', '${owner}', 'v3', 'claude-sonnet-5');
  `)
}

describe('the vetting counts — the four buckets acceptance rate divides', () => {
  it('has nothing before the first paste', async () => {
    const rows = await statsRows(db, OWNER)

    expect(rows.vetting).toEqual({
      acceptedUnedited: 0,
      acceptedWithEdit: 0,
      rejected: 0,
      pending: 0,
    })
  })

  // ⚠️ `S6`: an edited accept is an **edit**. Both are `state = 'accepted'` in
  // the table and the split is `edited`, so a query that counts the state alone
  // flatters *acceptance rate* — `11` §3's most likely error in the app.
  it('splits an edited accept out of an unedited one', async () => {
    const run = await ingested('一')
    await vetted(run.ingestionId, 'a')
    await vetted(run.ingestionId, 'b', { edited: true })
    await vetted(run.ingestionId, 'c', { state: 'rejected' })
    await vetted(run.ingestionId, 'd', { state: 'pending' })

    expect((await statsRows(db, OWNER)).vetting).toEqual({
      acceptedUnedited: 1,
      acceptedWithEdit: 1,
      rejected: 1,
      pending: 1,
    })
  })

  it('counts only this reader — a note vetting is personal (`04` §4)', async () => {
    const run = await ingested('一')
    await vetted(run.ingestionId, 'a')
    await vetted(run.ingestionId, 'b', { owner: OTHER })

    expect((await statsRows(db, OWNER)).vetting.acceptedUnedited).toBe(1)
  })
})

describe('the seconds-per-note samples', () => {
  // ⚠️ `11` §3: **over unedited accepts only**. An edited accept took longer
  // because it was edited, and a median that includes it measures the editing.
  it('is unedited accepts only', async () => {
    const run = await ingested('一')
    await vetted(run.ingestionId, 'a', { seconds: 3 })
    await vetted(run.ingestionId, 'b', { edited: true, seconds: 41 })
    await vetted(run.ingestionId, 'c', { state: 'rejected', seconds: 2 })

    expect((await statsRows(db, OWNER)).secondsPerNote).toEqual([3])
  })

  // The column is nullable and `10` §8.1 reads it directly. A `null` coerced to
  // zero would pull the median toward an instant nobody spent.
  it('drops an accept with no stamp rather than reading it as zero', async () => {
    const run = await ingested('一')
    await vetted(run.ingestionId, 'a', { seconds: 5 })
    await vetted(run.ingestionId, 'b', { seconds: null })

    expect((await statsRows(db, OWNER)).secondsPerNote).toEqual([5])
  })

  it('arrives as numbers, not as the driver\'s numeric strings', async () => {
    const run = await ingested('一')
    await vetted(run.ingestionId, 'a', { seconds: 4.25 })

    const [sample] = (await statsRows(db, OWNER)).secondsPerNote
    expect(sample).toBe(4.25)
  })

  it('counts only this reader', async () => {
    const run = await ingested('一')
    await vetted(run.ingestionId, 'a', { owner: OTHER, seconds: 9 })

    expect((await statsRows(db, OWNER)).secondsPerNote).toEqual([])
  })
})

describe('the flag count — false-accept rate\'s numerator', () => {
  // ⚠️ `11` §3: a second flag on the same *card* is a **second row**. A
  // `count(distinct card_id)` would under-report exactly the signal `S9` exists
  // for, and it is the reading a careful author would reach for.
  it('counts a second flag on the same card as a second row', async () => {
    const run = await ingested('一')
    const note = await vetted(run.ingestionId, 'a')
    const card = await minted(note)
    await flagged(card, note)
    await flagged(card, note)

    expect((await statsRows(db, OWNER)).flags).toBe(2)
  })

  it('counts only this reader', async () => {
    const run = await ingested('一')
    const note = await vetted(run.ingestionId, 'a', { owner: OTHER })
    const card = await minted(note, OTHER)
    await flagged(card, note, OTHER)

    expect((await statsRows(db, OWNER)).flags).toBe(0)
  })
})

describe('time-to-first-review — the near-miss `11` §3 names', () => {
  // ⚠️ **The whole test.** *The first grade of any card* returns one number and
  // reads plausibly; the criterion is a *source*'s submission to the first
  // *review* of a *card* **from that source**, and it is wrong the moment a
  // second *source* exists. Two sources, two durations.
  it('is measured per source, not from the first grade of any card', async () => {
    const first = await ingested('一', { minutesAgo: 180 })
    const second = await ingested('二', { minutesAgo: 90 })

    const a = await minted(await vetted(first.ingestionId, 'a'))
    const b = await minted(await vetted(second.ingestionId, 'b'))
    await reviewed(a, 120) // 60 minutes after 一 was submitted
    await reviewed(b, 60) //  30 minutes after 二 was submitted

    const seconds = (await statsRows(db, OWNER)).timeToFirstReview
    expect(seconds.map(value => Math.round(value / 60)).sort((x, y) => x - y)).toEqual([30, 60])
  })

  // ⚠️ ADR 0057: it is the **first** review, and a later one must not move it.
  it('takes the earliest review of the source\'s cards', async () => {
    const run = await ingested('一', { minutesAgo: 180 })
    const a = await minted(await vetted(run.ingestionId, 'a'))
    const b = await minted(await vetted(run.ingestionId, 'b'))
    await reviewed(b, 30) // 150 minutes after submission
    await reviewed(a, 120) // 60 minutes after submission

    const [seconds] = (await statsRows(db, OWNER)).timeToFirstReview
    expect(Math.round(seconds! / 60)).toBe(60)
  })

  // ⚠️ ADR 0057: a *source* nobody has studied has no duration. Counting it as
  // a long one would invent a measurement; counting it as zero would flatter.
  it('excludes a source whose cards have never been reviewed', async () => {
    const studied = await ingested('一', { minutesAgo: 60 })
    await ingested('二', { minutesAgo: 60 })
    await reviewed(await minted(await vetted(studied.ingestionId, 'a')), 30)

    const rows = await statsRows(db, OWNER)
    expect(rows.timeToFirstReview).toHaveLength(1)
    expect(rows.sourcesIngested).toBe(2)
  })

  it('counts only this reader\'s reviews', async () => {
    const run = await ingested('一', { minutesAgo: 60 })
    const note = await vetted(run.ingestionId, 'a', { owner: OTHER })
    await reviewed(await minted(note, OTHER), 30, OTHER)

    expect((await statsRows(db, OWNER)).timeToFirstReview).toEqual([])
  })

  // ⚠️ `03` §12: figures measured against a laptop are not comparable across
  // ADR 0022's move, and the environment rides on the number. Two environments
  // behind one figure is the state the line exists to make visible.
  it('carries every environment the measured runs used, not one of them', async () => {
    const laptop = await ingested('一', { minutesAgo: 60 })
    const server = await ingested('二', { minutesAgo: 60, environment: 'server' })
    await reviewed(await minted(await vetted(laptop.ingestionId, 'a')), 30)
    await reviewed(await minted(await vetted(server.ingestionId, 'b')), 30)

    expect((await statsRows(db, OWNER)).workerEnvironments).toEqual(['laptop', 'server'])
  })

  it('names no environment when nothing has been measured', async () => {
    await ingested('一')
    expect((await statsRows(db, OWNER)).workerEnvironments).toEqual([])
  })
})

describe('the sources ingested — what the duration pair is measured against', () => {
  // `S11`, `10` §7.1: a soft-deleted *source* stays readable and stays counted.
  // It was ingested, it was paid for, and removing it from the denominator would
  // improve the number by deleting the evidence.
  it('counts a soft-deleted source', async () => {
    await ingested('一')
    const gone = await ingested('二')
    await client.exec(`UPDATE source SET deleted_at = now() WHERE id = '${gone.sourceId}';`)

    expect((await statsRows(db, OWNER)).sourcesIngested).toBe(2)
  })
})

describe('the ledger — tokens and cost per ingestion', () => {
  it('carries what `10` §8.3 renders', async () => {
    const run = await ingested('朝日新聞 社説')

    expect(await ledger(db)).toEqual([
      expect.objectContaining({
        ingestionId: run.ingestionId,
        sourceId: run.sourceId,
        title: '朝日新聞 社説',
        modelId: 'claude-sonnet-5',
        inputTokens: 4200,
        outputTokens: 900,
        costMicroUsd: 31_450n,
        workerEnvironment: 'laptop',
      }),
    ])
  })

  // ⚠️ `04` §6.1 and `10` §8.3: `ingestion.source_id` is `SET NULL` and
  // `source_title` is snapshotted at submit, **so the spend ledger survives a
  // hard delete**. A ledger built by joining `source` loses the row entirely.
  it('survives a hard-deleted source', async () => {
    const run = await ingested('消えた出典')
    await client.exec(`DELETE FROM source WHERE id = '${run.sourceId}';`)

    expect(await ledger(db)).toEqual([
      expect.objectContaining({ sourceId: null, title: '消えた出典', inputTokens: 4200 }),
    ])
  })

  // ⚠️ `11` §3: tokens and cost come **from the API response, never estimated**.
  // A run that recorded tokens and no cost has no cost, and the ledger is where
  // that shows rather than where a price constant gets applied.
  it('reads a missing cost as missing rather than deriving one from the tokens', async () => {
    await ingested('一', { cost: false })

    const [row] = await ledger(db)
    expect(row!.inputTokens).toBe(4200)
    expect(row!.costMicroUsd).toBeNull()
  })

  it('is newest first', async () => {
    await ingested('ふるい', { minutesAgo: 90 })
    await ingested('あたらしい')

    expect((await ledger(db)).map(row => row.title)).toEqual(['あたらしい', 'ふるい'])
  })
})
