// `S11`'s soft delete — `server/utils/ingest/delete.ts`, against a real
// database.
//
// ⚠️ **The testing plan's `S11` row is three assertions and this file is the
// schema half of all three**: deleting a *source* suspends its *cards* and
// leaves `review_log` **row-for-row identical**; the confirmation's count
// matches what the `POST` suspends; and the deleted *source* stays readable.
// `test/e2e/source-delete.test.ts` is the other half, through the page and the
// route.
//
// Each case below is a state the predicate gets wrong if it is written the
// obvious way: a *note* this *source* only re-encountered, a *card* a flag had
// already suspended, and a second delete.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { deleteSource, sourceDeletion } from '../../server/utils/ingest/delete'
import { sourceDetail } from '../../server/utils/ingest/queries'
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

async function one(sql: string): Promise<string> {
  return (await client.query<{ id: string }>(sql)).rows[0]!.id
}

/** A *source* and the run that minted from it. */
async function source(title: string): Promise<{ sourceId: string, ingestionId: string }> {
  const sourceId = await one(`
    INSERT INTO source (subject_id, kind, title, content, content_hash, char_count)
    VALUES ('jlpt-vocab', 'word_list', '${title}', '${title}の本文', '${title}', 4)
    RETURNING id;
  `)
  const ingestionId = await one(`
    INSERT INTO ingestion (source_id, source_title, subject_id, status, worker_environment)
    VALUES ('${sourceId}', '${title}', 'jlpt-vocab', 'complete', 'laptop')
    RETURNING id;
  `)
  return { sourceId, ingestionId }
}

/** A *note* originated by `ingestionId`, its *card*, one epoch and one *grade*. */
async function card(key: string, ingestionId: string): Promise<string> {
  const noteId = await one(`
    INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
    VALUES ('jlpt-vocab', '${key}', '{"term":"${key}"}'::jsonb, '${ingestionId}')
    RETURNING id;
  `)
  const cardId = await one(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${noteId}', '${OWNER}', 'recognition')
    RETURNING id;
  `)
  const epochId = await one(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
    VALUES ('${cardId}', '${OWNER}', 1, now(), 3.1, 5.2, 1)
    RETURNING id;
  `)
  await client.exec(`
    INSERT INTO review_log
      (card_id, scheduling_epoch_id, owner_id, rating, state, due, stability, difficulty,
       scheduled_days, learning_steps, reviewed_at)
    VALUES ('${cardId}', '${epochId}', '${OWNER}', 3, 0, now(), 3.1, 5.2, 1, 0, now());
  `)
  return cardId
}

async function suspension(cardId: string) {
  return (await client.query<{ suspended_at: Date | null, suspended_reason: string | null }>(
    `SELECT suspended_at, suspended_reason FROM card WHERE id = '${cardId}';`,
  )).rows[0]!
}

describe('sourceDeletion — the confirmation\'s count', () => {
  it('is null for no such source', async () => {
    expect(await sourceDeletion(db, '019bd300-0000-7000-8000-000000000000')).toBeNull()
  })

  it('counts the cards whose notes originated in the source', async () => {
    const { sourceId, ingestionId } = await source('一冊目')
    await card('図書館', ingestionId)
    await card('駅', ingestionId)

    expect(await sourceDeletion(db, sourceId)).toMatchObject({
      id: sourceId,
      title: '一冊目',
      deletedAt: null,
      cardCount: 2,
    })
  })

  it('is zero for a source that minted nothing, which the page says in words', async () => {
    const { sourceId } = await source('空')

    expect((await sourceDeletion(db, sourceId))!.cardCount).toBe(0)
  })

  // ⚠️ **The origin, not the occurrence.** A later *source* that contains a word
  // an earlier one minted has an *occurrence* of that *note* and no claim on its
  // *card*.
  it('leaves out a card another source originated', async () => {
    const first = await source('一冊目')
    const second = await source('二冊目')
    await card('図書館', first.ingestionId)

    expect((await sourceDeletion(db, second.sourceId))!.cardCount).toBe(0)
  })
})

describe('deleteSource — `09` §4.11 step 3', () => {
  it('is null for no such source and writes nothing', async () => {
    expect(await deleteSource(db, '019bd300-0000-7000-8000-000000000000')).toBeNull()
  })

  it('sets deleted_at and suspends the source\'s cards as source_deleted', async () => {
    const { sourceId, ingestionId } = await source('一冊目')
    const cardId = await card('図書館', ingestionId)

    expect(await deleteSource(db, sourceId)).toBe(1)

    expect((await suspension(cardId))).toMatchObject({ suspended_reason: 'source_deleted' })
    expect((await suspension(cardId)).suspended_at).toBeInstanceOf(Date)
  })

  it('suspends exactly as many cards as the confirmation counted', async () => {
    const { sourceId, ingestionId } = await source('一冊目')
    const other = await source('二冊目')
    for (const key of ['図書館', '駅', '本'])
      await card(key, ingestionId)
    await card('電車', other.ingestionId)

    const counted = (await sourceDeletion(db, sourceId))!.cardCount

    expect(await deleteSource(db, sourceId)).toBe(counted)
    expect(counted).toBe(3)
  })

  it('leaves review_log row-for-row identical, and deletes no note or card', async () => {
    const { sourceId, ingestionId } = await source('一冊目')
    await card('図書館', ingestionId)
    await card('駅', ingestionId)

    const snapshot = async () => ({
      logs: (await client.query('SELECT * FROM review_log ORDER BY id;')).rows,
      epochs: (await client.query('SELECT * FROM scheduling_epoch ORDER BY id;')).rows,
      notes: (await client.query('SELECT * FROM note ORDER BY id;')).rows,
      cards: (await client.query('SELECT id, note_id FROM card ORDER BY id;')).rows,
    })

    const before = await snapshot()
    await deleteSource(db, sourceId)

    expect(await snapshot()).toEqual(before)
  })

  it('leaves the source readable, marked deleted', async () => {
    const { sourceId } = await source('一冊目')
    await deleteSource(db, sourceId)

    const detail = await sourceDetail(db, sourceId)
    expect(detail!.content).toBe('一冊目の本文')
    expect(detail!.deletedAt).toBeInstanceOf(Date)
  })

  it('leaves another source\'s cards scheduled', async () => {
    const first = await source('一冊目')
    const second = await source('二冊目')
    const kept = await card('電車', second.ingestionId)

    await deleteSource(db, first.sourceId)

    expect(await suspension(kept)).toEqual({ suspended_at: null, suspended_reason: null })
  })

  // ⚠️ **A flagged *card* is taken over and keeps its instant.** Left as
  // `flagged`, *Vet*'s keep would unsuspend it and put a deleted *source*'s
  // *card* back into scheduling; `04` §9.1 says nothing un-suspends itself.
  it('takes over a flag\'s suspension without restamping when it left scheduling', async () => {
    const { sourceId, ingestionId } = await source('一冊目')
    const cardId = await card('図書館', ingestionId)
    await client.exec(`
      UPDATE card SET suspended_at = '2026-09-01T00:00:00Z', suspended_reason = 'flagged'
      WHERE id = '${cardId}';
    `)

    expect((await sourceDeletion(db, sourceId))!.cardCount).toBe(1)
    expect(await deleteSource(db, sourceId)).toBe(1)

    const after = await suspension(cardId)
    expect(after.suspended_reason).toBe('source_deleted')
    expect(after.suspended_at!.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('is a no-op the second time: the first instant stands and nothing is counted', async () => {
    const { sourceId, ingestionId } = await source('一冊目')
    const cardId = await card('図書館', ingestionId)

    await deleteSource(db, sourceId)
    const first = (await sourceDeletion(db, sourceId))!
    const suspendedAt = (await suspension(cardId)).suspended_at

    expect(first.cardCount).toBe(0)
    expect(await deleteSource(db, sourceId)).toBe(0)
    expect((await sourceDeletion(db, sourceId))!.deletedAt).toEqual(first.deletedAt)
    expect((await suspension(cardId)).suspended_at).toEqual(suspendedAt)
  })
})

// ⚠️ **A delete made while the ingestion is still running.** The `POST` can only
// suspend the *cards* that exist; every *chunk* written after it mints through
// `mint_cards`, which is where the rule has to hold for those.
describe('mint_cards after the source is deleted', () => {
  async function note(key: string, ingestionId: string): Promise<string> {
    return one(`
      INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
      VALUES ('jlpt-vocab', '${key}', '{"term":"${key}"}'::jsonb, '${ingestionId}')
      RETURNING id;
    `)
  }

  async function mint(noteId: string) {
    await client.exec(`SELECT mint_cards('${noteId}'::uuid, '${OWNER}', ARRAY['recognition']::text[]);`)
    return (await client.query<{ suspended_at: Date | null, suspended_reason: string | null }>(
      `SELECT suspended_at, suspended_reason FROM card WHERE note_id = '${noteId}';`,
    )).rows
  }

  it('mints a later chunk\'s card suspended as source_deleted', async () => {
    const { sourceId, ingestionId } = await source('一冊目')
    await card('図書館', ingestionId)
    await deleteSource(db, sourceId)

    const [minted, ...rest] = await mint(await note('駅', ingestionId))

    expect(rest).toEqual([])
    expect(minted!.suspended_reason).toBe('source_deleted')
    expect(minted!.suspended_at).toBeInstanceOf(Date)
    expect((await sourceDeletion(db, sourceId))!.cardCount).toBe(0)
  })

  it('mints unsuspended for a source that is not deleted', async () => {
    const first = await source('一冊目')
    const second = await source('二冊目')
    await deleteSource(db, first.sourceId)

    expect(await mint(await note('駅', second.ingestionId)))
      .toEqual([{ suspended_at: null, suspended_reason: null }])
  })
})
