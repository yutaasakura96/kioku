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
// - ⚠️ **Retention counts `state = 2` and nothing else** (ADR 0062). `state` is
//   the state *before* the grade, so a `count(*)` with no filter folds in
//   first-ever answers, which asked nothing about retention, and relearning
//   answers, which let one act of forgetting count twice. It is the naive query
//   and it reads low, always.
// - ⚠️ **Consistency's instants are `reviewed_at`, not `received_at`.** The
//   outbox can replay a Tuesday-night *grade* on Wednesday morning (ADR 0039),
//   and the reader studied on Tuesday. This is the one metric where the two
//   columns disagree in a way a reader would notice.
// - ⚠️ **Flag rate's numerator is `count(distinct card_id)`** (ADR 0062) — the
//   line that changed from *false-accept rate*, whose `count(*)` was right when
//   the denominator was acceptances and is wrong over minted *cards*, because a
//   share of the deck cannot exceed one.
// - ⚠️ ***Time-to-first-review* is per *source*.** `11` §3 names the near-miss
//   implementation — *the first grade of any card* — and says it is wrong the
//   moment a second *source* exists. Every test here seeds two.
// - ⚠️ **The ledger survives a hard delete** (`04` §9, `10` §8.3):
//   `ingestion.source_id` is `SET NULL` and `ingestion.source_title` is
//   snapshotted, so the spend stays readable after the material is gone.
// - ⚠️ **Personal rows are owner-scoped and shared rows are not** (`04` §4).
//   `card`, `card_flag` and `review_log` carry an owner; `source` and
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
 * One *review*.
 *
 * ⚠️ **`reviewed_at` and `received_at` are separate parameters on purpose.**
 * `04` §7.5 says the two columns are not redundant and #23 is the ticket that
 * makes that measurable: *time-to-first-review* reads `received_at`, because it
 * is a **difference** between two instants and those have to be on one clock;
 * retention and consistency read `reviewed_at`, because the reader answered when
 * they answered and the outbox may have delivered it the next morning.
 *
 * `state` defaults to `2` — `ts-fsrs`'s Review — because that is the only state
 * retention counts, and a test that wants to prove the filter says so by
 * passing another.
 */
async function reviewed(
  cardId: string,
  minutesAgo: number,
  {
    owner = OWNER,
    rating = 3,
    state = 2,
    receivedMinutesAgo = null as number | null,
  } = {},
): Promise<void> {
  const epoch = await one<{ id: string }>(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
    VALUES ('${cardId}', '${owner}', 1, now() + interval '1 day', 3.1, 5.2, 1)
    ON CONFLICT (card_id, ordinal) DO UPDATE SET due = excluded.due
    RETURNING id;
  `)

  const received = receivedMinutesAgo ?? minutesAgo

  await client.exec(`
    INSERT INTO review_log
      (card_id, scheduling_epoch_id, owner_id, rating, state, due, stability, difficulty,
       scheduled_days, learning_steps, reviewed_at, received_at)
    VALUES ('${cardId}', '${epoch.id}', '${owner}', ${rating}, ${state}, now() + interval '1 day',
            3.1, 5.2, 1, 0,
            now() - interval '${minutesAgo} minutes',
            now() - interval '${received} minutes');
  `)
}

async function flagged(cardId: string, noteId: string, owner = OWNER): Promise<void> {
  await client.exec(`
    INSERT INTO card_flag (card_id, note_id, owner_id, prompt_version, model_id)
    VALUES ('${cardId}', '${noteId}', '${owner}', 'v3', 'claude-sonnet-5');
  `)
}

describe('retention — the share recalled, over reviews of a card already learned', () => {
  async function card(key: string, owner = OWNER): Promise<string> {
    const run = await ingested(`src-${key}`)
    return minted(await vetted(run.ingestionId, key, { owner }), owner)
  }

  it('has nothing before the first review', async () => {
    expect((await statsRows(db, OWNER, new Date())).retention).toEqual({ recalled: 0, qualifying: 0 })
  })

  // ⚠️ `1 Forgot · 2 Hard · 3 Good · 4 Easy` (ADR 0034). **Hard counts against
  // retention** — it is a recall the reader struggled through, and it is the
  // convention the number is only comparable to other apps under.
  it('counts Good and Easy as recalled, and Forgot and Hard as not', async () => {
    for (const [key, rating] of [['a', 1], ['b', 2], ['c', 3], ['d', 4]] as const)
      await reviewed(await card(key), 10, { rating })

    expect((await statsRows(db, OWNER, new Date())).retention).toEqual({ recalled: 2, qualifying: 4 })
  })

  // ⚠️ **The test the ticket asks for by name.** `review_log.state` is the state
  // *before* the grade (`04` §7.5). A first-ever answer is state 0: nothing had
  // been retained, so it is not a failure to retain one.
  it('excludes a first answer, which is state 0', async () => {
    await reviewed(await card('new'), 10, { state: 0, rating: 1 })
    await reviewed(await card('learned'), 10, { state: 2, rating: 3 })

    expect((await statsRows(db, OWNER, new Date())).retention).toEqual({ recalled: 1, qualifying: 1 })
  })

  // ⚠️ And the other half, which is a different mistake: state 3 is a
  // relearning answer, and counting it lets **one** act of forgetting push the
  // number down twice — once when the *card* lapsed and again on the way back.
  it('excludes a relearning answer, which is state 3', async () => {
    await reviewed(await card('lapsed'), 10, { state: 3, rating: 1 })
    await reviewed(await card('learned'), 10, { state: 2, rating: 3 })

    expect((await statsRows(db, OWNER, new Date())).retention).toEqual({ recalled: 1, qualifying: 1 })
  })

  it('excludes a learning answer, which is state 1', async () => {
    await reviewed(await card('learning'), 10, { state: 1, rating: 4 })

    expect((await statsRows(db, OWNER, new Date())).retention.qualifying).toBe(0)
  })

  // The window is trailing thirty days, and it is measured on `reviewed_at`.
  it('drops a review older than the window', async () => {
    await reviewed(await card('old'), 31 * 24 * 60)
    await reviewed(await card('recent'), 10)

    expect((await statsRows(db, OWNER, new Date())).retention.qualifying).toBe(1)
  })

  it('counts only this reader — a review is personal (`04` §4)', async () => {
    await reviewed(await card('theirs', OTHER), 10, { owner: OTHER })

    expect((await statsRows(db, OWNER, new Date())).retention.qualifying).toBe(0)
  })
})

describe('the grade instants — consistency\'s numerator, before it is bucketed', () => {
  async function card(key: string, owner = OWNER): Promise<string> {
    const run = await ingested(`src-${key}`)
    return minted(await vetted(run.ingestionId, key, { owner }), owner)
  }

  // ⚠️ **The bucketing is not here.** ADR 0066's day starts at 04:00 in the
  // reader's zone, and Postgres is not told the zone on a route that ships no
  // JavaScript — so this query hands over instants and
  // `shared/time/local-day.ts` turns them into days. A `date_trunc('day', …)`
  // here would be a different rule in the shortest possible SQL.
  it('hands over instants rather than days', async () => {
    await reviewed(await card('a'), 10)

    const [minute] = (await statsRows(db, OWNER, new Date())).gradeMinutes
    expect(minute).toBeInstanceOf(Date)
    expect(Date.now() - minute!.getTime()).toBeGreaterThan(9 * 60_000)
  })

  // ⚠️ **`reviewed_at`, not `received_at`, and this is the case that separates
  // them.** The outbox replays in order when the connection returns (ADR 0039),
  // so a *grade* given on Tuesday night can be received on Wednesday morning —
  // and the reader studied on Tuesday. Reading `received_at` here would credit
  // the wrong day and, on a Wednesday with no other study, invent one.
  it('takes the moment the reader answered, not the moment the server heard', async () => {
    const threeDays = 3 * 24 * 60
    await reviewed(await card('a'), threeDays, { receivedMinutesAgo: 1 })

    const [minute] = (await statsRows(db, OWNER, new Date())).gradeMinutes
    const minutesAgo = (Date.now() - minute!.getTime()) / 60_000
    expect(Math.round(minutesAgo / 60)).toBe(72)
  })

  // Truncation to the minute is a size reduction, not an answer: several grades
  // in one minute are one row out.
  it('folds several grades in one minute into one instant', async () => {
    const a = await card('a')
    await reviewed(a, 10)
    await reviewed(a, 10)

    expect((await statsRows(db, OWNER, new Date())).gradeMinutes).toHaveLength(1)
  })

  // ⚠️ **A day wider than the window** (`statsRows`), because the trimming is
  // done in local days and a zone is up to fourteen hours from UTC.
  it('reaches back a day further than the window, and no further', async () => {
    await reviewed(await card('inside'), 30 * 24 * 60 + 60)
    await reviewed(await card('outside'), 32 * 24 * 60)

    expect((await statsRows(db, OWNER, new Date())).gradeMinutes).toHaveLength(1)
  })

  // ⚠️ **The first grade is *not* windowed** — the denominator is *days there
  // were to study*, which for a reader three days in is three rather than
  // thirty, and that is the difference between 3/3 suppressed and 3/30 reported.
  it('reports the first grade ever, however far outside the window it is', async () => {
    await reviewed(await card('ancient'), 400 * 24 * 60)
    await reviewed(await card('today'), 10)

    const rows = await statsRows(db, OWNER, new Date())
    expect(rows.gradeMinutes).toHaveLength(1)
    expect(Math.round((Date.now() - rows.firstGradeAt!.getTime()) / 86_400_000)).toBe(400)
  })

  it('has no first grade before the first review', async () => {
    expect((await statsRows(db, OWNER, new Date())).firstGradeAt).toBeNull()
  })

  it('counts only this reader', async () => {
    await reviewed(await card('theirs', OTHER), 10, { owner: OTHER })

    const rows = await statsRows(db, OWNER, new Date())
    expect(rows.gradeMinutes).toEqual([])
    expect(rows.firstGradeAt).toBeNull()
  })
})

describe('flag rate — distinct cards flagged, over cards minted', () => {
  // ⚠️ **The one line #23 changes about the old *false-accept rate*.** That
  // figure counted rows, deliberately, because its denominator was acceptances;
  // over *cards minted* a `count(*)` would let a reader who flagged one *card*
  // three times read 150% of a two-*card* deck.
  it('counts a second flag on the same card once', async () => {
    const run = await ingested('一')
    const note = await vetted(run.ingestionId, 'a')
    const card = await minted(note)
    await flagged(card, note)
    await flagged(card, note)

    expect((await statsRows(db, OWNER, new Date())).flaggedCards).toBe(1)
  })

  it('counts two flagged cards as two', async () => {
    const run = await ingested('一')
    for (const key of ['a', 'b']) {
      const note = await vetted(run.ingestionId, key)
      await flagged(await minted(note), note)
    }

    expect((await statsRows(db, OWNER, new Date())).flaggedCards).toBe(2)
  })

  // ⚠️ **No `resolved_at IS NULL` filter, and one must not be added.** A *note*
  // that was flagged and then fixed **was still wrong when it was minted**. A
  // figure that fell every time the reader repaired something would report a
  // pipeline that needs repairing as one that is working.
  it('keeps counting a card whose flag has been resolved', async () => {
    const run = await ingested('一')
    const note = await vetted(run.ingestionId, 'a')
    const card = await minted(note)
    await flagged(card, note)
    await client.exec(`UPDATE card_flag SET resolved_at = now() WHERE card_id = '${card}';`)

    expect((await statsRows(db, OWNER, new Date())).flaggedCards).toBe(1)
  })

  it('counts every card the reader owns as the denominator', async () => {
    const run = await ingested('一')
    for (const key of ['a', 'b', 'c'])
      await minted(await vetted(run.ingestionId, key))

    expect((await statsRows(db, OWNER, new Date())).cardsMinted).toBe(3)
  })

  // ⚠️ A suspended *card* was minted and was paid for. Dropping it would
  // improve the figure by deleting the evidence — the same argument
  // `sourcesIngested` makes for a soft-deleted *source*.
  it('counts a suspended card', async () => {
    const run = await ingested('一')
    const card = await minted(await vetted(run.ingestionId, 'a'))
    await client.exec(`UPDATE card SET suspended_at = now(), suspended_reason = 'flagged' WHERE id = '${card}';`)

    expect((await statsRows(db, OWNER, new Date())).cardsMinted).toBe(1)
  })

  it('counts only this reader — a card and a flag are both personal', async () => {
    const run = await ingested('一')
    const note = await vetted(run.ingestionId, 'a', { owner: OTHER })
    const card = await minted(note, OTHER)
    await flagged(card, note, OTHER)

    const rows = await statsRows(db, OWNER, new Date())
    expect(rows.flaggedCards).toBe(0)
    expect(rows.cardsMinted).toBe(0)
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

    const seconds = (await statsRows(db, OWNER, new Date())).timeToFirstReview
    expect(seconds.map(value => Math.round(value / 60)).sort((x, y) => x - y)).toEqual([30, 60])
  })

  // ⚠️ ADR 0057: it is the **first** review, and a later one must not move it.
  it('takes the earliest review of the source\'s cards', async () => {
    const run = await ingested('一', { minutesAgo: 180 })
    const a = await minted(await vetted(run.ingestionId, 'a'))
    const b = await minted(await vetted(run.ingestionId, 'b'))
    await reviewed(b, 30) // 150 minutes after submission
    await reviewed(a, 120) // 60 minutes after submission

    const [seconds] = (await statsRows(db, OWNER, new Date())).timeToFirstReview
    expect(Math.round(seconds! / 60)).toBe(60)
  })

  // ⚠️ ADR 0057: a *source* nobody has studied has no duration. Counting it as
  // a long one would invent a measurement; counting it as zero would flatter.
  it('excludes a source whose cards have never been reviewed', async () => {
    const studied = await ingested('一', { minutesAgo: 60 })
    await ingested('二', { minutesAgo: 60 })
    await reviewed(await minted(await vetted(studied.ingestionId, 'a')), 30)

    const rows = await statsRows(db, OWNER, new Date())
    expect(rows.timeToFirstReview).toHaveLength(1)
    expect(rows.sourcesIngested).toBe(2)
  })

  it('counts only this reader\'s reviews', async () => {
    const run = await ingested('一', { minutesAgo: 60 })
    const note = await vetted(run.ingestionId, 'a', { owner: OTHER })
    await reviewed(await minted(note, OTHER), 30, { owner: OTHER })

    expect((await statsRows(db, OWNER, new Date())).timeToFirstReview).toEqual([])
  })

  // ⚠️ `03` §12: figures measured against a laptop are not comparable across
  // ADR 0022's move, and the environment rides on the number. Two environments
  // behind one figure is the state the line exists to make visible.
  it('carries every environment the measured runs used, not one of them', async () => {
    const laptop = await ingested('一', { minutesAgo: 60 })
    const server = await ingested('二', { minutesAgo: 60, environment: 'server' })
    await reviewed(await minted(await vetted(laptop.ingestionId, 'a')), 30)
    await reviewed(await minted(await vetted(server.ingestionId, 'b')), 30)

    expect((await statsRows(db, OWNER, new Date())).workerEnvironments).toEqual(['laptop', 'server'])
  })

  it('names no environment when nothing has been measured', async () => {
    await ingested('一')
    expect((await statsRows(db, OWNER, new Date())).workerEnvironments).toEqual([])
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

    expect((await statsRows(db, OWNER, new Date())).sourcesIngested).toBe(2)
  })
})

describe('the ledger — tokens and cost per ingestion', () => {
  it('carries what `10` §8.3 renders', async () => {
    const run = await ingested('朝日新聞 社説')

    expect(await ledger(db)).toEqual([
      expect.objectContaining({
        kind: 'ingestion',
        id: run.ingestionId,
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

// ADR 0070 §2: *each seeding request has its own ledger row*, and `/stats`'
// cost includes them — **a discarded draft among them**, because it was paid for.
describe('the ledger — seed rows, ADR 0070 §2', () => {
  async function seeded(options: { minutesAgo?: number, discarded?: boolean, answered?: boolean } = {}) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO seed (subject_id, domain, level, count, requested_by, requested_at, completed_at,
         model_id, prompt_version, input_tokens, output_tokens, cost_micro_usd,
         price_table_effective_date, discarded_at)
       VALUES ('jlpt-vocab', 'tech', 'N3', 25, '${OWNER}', now() - make_interval(mins => $1),
         CASE WHEN $2 THEN now() END,
         CASE WHEN $2 THEN 'claude-sonnet-5' END, CASE WHEN $2 THEN 'seed-v1' END,
         CASE WHEN $2 THEN 1200 END, CASE WHEN $2 THEN 300 END, CASE WHEN $2 THEN 5400 END,
         CASE WHEN $2 THEN '2026-09-12'::date END,
         CASE WHEN $3 THEN now() END)
       RETURNING id;`,
      [options.minutesAgo ?? 0, options.answered ?? true, options.discarded ?? false],
    )
    return result.rows[0]!.id
  }

  it('carries a seed request, named for what it asked', async () => {
    const id = await seeded()

    expect(await ledger(db)).toEqual([
      expect.objectContaining({
        kind: 'seed',
        id,
        sourceId: null,
        title: 'tech · N3 · 25 words',
        modelId: 'claude-sonnet-5',
        inputTokens: 1200,
        outputTokens: 300,
        costMicroUsd: 5400n,
        workerEnvironment: 'laptop',
      }),
    ])
  })

  it('⚠️ carries a discarded draft, because it was paid for', async () => {
    await seeded({ discarded: true })
    expect((await ledger(db)).map(row => row.costMicroUsd)).toEqual([5400n])
  })

  it('carries a seed that has not come back, with nothing recorded yet', async () => {
    await seeded({ answered: false })
    expect(await ledger(db)).toEqual([
      expect.objectContaining({ kind: 'seed', modelId: null, costMicroUsd: null }),
    ])
  })

  it('points at the source a submitted draft became', async () => {
    const run = await ingested('tech · N3 · 25 words')
    const id = await seeded()
    await client.query(`UPDATE seed SET source_id = $1, submitted_at = now() WHERE id = $2;`, [run.sourceId, id])

    const row = (await ledger(db)).find(row => row.kind === 'seed')
    expect(row!.sourceId).toBe(run.sourceId)
  })

  it('interleaves with the ingestions, newest first', async () => {
    await ingested('ふるい', { minutesAgo: 90 })
    await seeded({ minutesAgo: 30 })
    await ingested('あたらしい')

    expect((await ledger(db)).map(row => row.kind)).toEqual(['ingestion', 'seed', 'ingestion'])
  })
})

// `04` §6.6: a run of `worker/backfill.py` is model money on the same key, so it
// is a ledger row too — named for what it wrote, since it has no *source*.
describe('the ledger — backfill runs, `04` §6.6', () => {
  async function backfilled({ minutesAgo = 0, written = 475 }: { minutesAgo?: number, written?: number } = {}) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO backfill (prompt_version, requested_at, model_id, request_count, written,
         input_tokens, output_tokens, cost_micro_usd, price_table_effective_date)
       VALUES ('backfill-v1', now() - make_interval(mins => $1), 'claude-sonnet-5', 12, $2,
         17968, 12950, 165434, '2026-09-12')
       RETURNING id;`,
      [minutesAgo, written],
    )
    return result.rows[0]!.id
  }

  it('carries a run, named for the lists it wrote', async () => {
    const id = await backfilled()

    expect(await ledger(db)).toEqual([
      expect.objectContaining({
        kind: 'backfill',
        id,
        sourceId: null,
        title: 'meanings · 475 notes',
        modelId: 'claude-sonnet-5',
        inputTokens: 17968,
        outputTokens: 12950,
        costMicroUsd: 165_434n,
        workerEnvironment: 'laptop',
      }),
    ])
  })

  it('says one note, not one notes', async () => {
    await backfilled({ written: 1 })
    expect((await ledger(db))[0]!.title).toBe('meanings · 1 note')
  })

  it('interleaves with the other kinds, newest first', async () => {
    await ingested('ふるい', { minutesAgo: 90 })
    await backfilled({ minutesAgo: 30 })
    await ingested('あたらしい')

    expect((await ledger(db)).map(row => row.kind)).toEqual(['ingestion', 'backfill', 'ingestion'])
  })
})
