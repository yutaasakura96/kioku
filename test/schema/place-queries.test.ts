// What the three *places* read — `server/utils/ingest/queries.ts`, against a
// real database.
//
// ⚠️ **These read as trivial and two of them are not.** `startBlockCounts`'s due
// query carries `04` §11's whole argument for why it joins `card`: suspension
// lives on `card` (`S9` flags, `S11` deletes) and therefore cannot be in
// `scheduling_epoch`'s partial index, so a count over epochs alone offers a
// *session* of *cards* that have already been withdrawn. And `recentRuns` counts
// through four correlated subqueries rather than joins, because a join over
// `ingestion_chunk` and `note` at once multiplies rows — which returns a
// plausible wrong number the day a *source* is re-ingested, and only then.
//
// Each test below is a state the query gets wrong if it is written the obvious
// way.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import {
  allSources,
  recentRuns,
  sourceDetail,
  sourceTitle,
  startBlockCounts,
} from '../../server/utils/ingest/queries'
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

function submission(overrides: Record<string, unknown> = {}) {
  return {
    subjectId: 'jlpt-vocab',
    title: '朝日新聞 社説',
    content: '駅の近くに図書館があります。'.repeat(100),
    characterCount: 1400,
    submittedBy: OWNER,
    ...overrides,
  }
}

describe('recentRuns', () => {
  it('is empty with nothing ingested', async () => {
    expect(await recentRuns(db)).toEqual([])
  })

  it('carries what the run row renders — `10` §6.2', async () => {
    const written = await recordSource(db, submission())
    const [run] = await recentRuns(db)

    expect(run).toMatchObject({
      ingestionId: written.ingestionId,
      sourceId: written.sourceId,
      title: '朝日新聞 社説',
      status: 'queued',
      claimedAt: null,
      totalChunks: written.chunkCount,
      completeChunks: 0,
      failedChunks: 0,
      notesProduced: 0,
    })
  })

  it('is newest first', async () => {
    const first = await recordSource(db, submission({ title: 'ひとつめ' }))
    await client.exec(`UPDATE ingestion SET submitted_at = now() - interval '1 hour';`)
    const second = await recordSource(db, submission({ title: 'ふたつめ', content: '別の文章。' }))

    const runs = await recentRuns(db)
    expect(runs.map(run => run.ingestionId)).toEqual([second.ingestionId, first.ingestionId])
  })

  it('honours the limit', async () => {
    for (let index = 0; index < 3; index++)
      await recordSource(db, submission({ content: `文章${index}。`, characterCount: 4 }))

    expect(await recentRuns(db, 2)).toHaveLength(2)
  })

  it('reports the claim, which is what `09` §7 turns into "not yet picked up"', async () => {
    const written = await recordSource(db, submission())
    await client.exec(`
      UPDATE job SET state = 'claimed', claimed_by = 'laptop', claimed_at = now(), heartbeat_at = now()
      WHERE ingestion_id = '${written.ingestionId}';
    `)

    const [run] = await recentRuns(db)
    expect(run!.claimedAt).toBeInstanceOf(Date)
  })

  it('counts complete and failed chunks separately', async () => {
    const written = await recordSource(db, submission())
    const chunks = await client.query<{ id: string }>(
      `SELECT id FROM source_chunk ORDER BY ordinal;`,
    )

    await client.exec(`
      INSERT INTO ingestion_chunk (ingestion_id, source_chunk_id, status) VALUES
        ('${written.ingestionId}', '${chunks.rows[0]!.id}', 'complete'),
        ('${written.ingestionId}', '${chunks.rows[1]!.id}', 'failed');
    `)

    const [run] = await recentRuns(db)
    expect(run).toMatchObject({ completeChunks: 1, failedChunks: 1 })
  })

  it('⚠️ counts notes and chunks independently when a source is re-ingested', async () => {
    // The state a join gets wrong. Two runs over one *source*: the chunk count
    // is per *source* and the note count is per *ingestion*, and a single join
    // across both multiplies one by the other.
    const first = await recordSource(db, submission())
    const second = await recordSource(db, submission())

    await client.exec(`
      INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
      VALUES ('jlpt-vocab', '図書館␟としょかん', '{}'::jsonb, '${second.ingestionId}');
    `)

    const runs = await recentRuns(db)
    const newest = runs.find(run => run.ingestionId === second.ingestionId)!
    const oldest = runs.find(run => run.ingestionId === first.ingestionId)!

    expect(newest.notesProduced).toBe(1)
    expect(newest.totalChunks).toBe(second.chunkCount)
    expect(oldest.notesProduced).toBe(0)
  })

  it('survives the source being hard-deleted, because the ledger has to', async () => {
    // `04` §6.1: `ingestion.source_id` is nullable and `SET NULL` on delete, and
    // `source_title` is snapshotted, **so the spend ledger survives**.
    const written = await recordSource(db, submission())
    await client.exec(`DELETE FROM source WHERE id = '${written.sourceId}';`)

    const [run] = await recentRuns(db)
    expect(run).toMatchObject({ sourceId: null, title: '朝日新聞 社説', totalChunks: 0 })
  })
})

describe('allSources', () => {
  it('is empty with nothing ingested — `09` §8 gives that state a screen', async () => {
    expect(await allSources(db)).toEqual([])
  })

  it('carries what the list row renders — `10` §7.1', async () => {
    const written = await recordSource(db, submission())
    const [source] = await allSources(db)

    expect(source).toMatchObject({
      id: written.sourceId,
      title: '朝日新聞 社説',
      status: 'queued',
      noteCount: 0,
      deletedAt: null,
    })
  })

  it('⚠️ keeps a deleted source in the list — `S11`, `10` §7.1', async () => {
    const written = await recordSource(db, submission())
    await client.exec(`UPDATE source SET deleted_at = now() WHERE id = '${written.sourceId}';`)

    const sources = await allSources(db)
    expect(sources).toHaveLength(1)
    expect(sources[0]!.deletedAt).toBeInstanceOf(Date)
  })

  it('counts notes through every ingestion of the source', async () => {
    const first = await recordSource(db, submission())
    const second = await recordSource(db, submission())

    await client.exec(`
      INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id) VALUES
        ('jlpt-vocab', '図書館␟としょかん', '{}'::jsonb, '${first.ingestionId}'),
        ('jlpt-vocab', '駅␟えき', '{}'::jsonb, '${second.ingestionId}');
    `)

    // Two *sources* here, because identical content creates a new one (PRD §5).
    const sources = await allSources(db)
    expect(sources.map(source => source.noteCount).sort()).toEqual([1, 1])
  })

  it('takes the newest ingestion\'s status when a source has been re-run', async () => {
    const written = await recordSource(db, submission())
    await client.exec(`
      INSERT INTO ingestion (source_id, source_title, subject_id, status, submitted_at)
      VALUES ('${written.sourceId}', '朝日新聞 社説', 'jlpt-vocab', 'complete', now() + interval '1 minute');
    `)

    const [source] = await allSources(db)
    expect(source!.status).toBe('complete')
  })
})

describe('sourceTitle — the line `09` §4.2 puts above the runs', () => {
  it('names the source', async () => {
    const written = await recordSource(db, submission())
    expect(await sourceTitle(db, written.sourceId)).toBe('朝日新聞 社説')
  })

  it('⚠️ does not name a deleted one, so the offer is never to open a deletion', async () => {
    // `S11` keeps a deleted *source* **readable**, which is not the same as
    // offering it as somewhere to go. The offer's whole content is "you already
    // have this, open it instead", and that is not true of one the reader
    // deleted — `server/utils/ingest/record.ts` refuses it as a duplicate for
    // the same reason.
    const written = await recordSource(db, submission())
    await client.exec(`UPDATE source SET deleted_at = now() WHERE id = '${written.sourceId}';`)

    expect(await sourceTitle(db, written.sourceId)).toBeNull()
  })

  it('answers null for an id that is not there, rather than throwing', async () => {
    expect(await sourceTitle(db, '019bd3f1-2c4e-7a91-8b23-0bdc18694aa5')).toBeNull()
  })
})

describe('sourceDetail — `10` §7.2\'s readable half', () => {
  it('carries the material ADR 0008 retained the content for', async () => {
    const written = await recordSource(db, submission())
    const detail = await sourceDetail(db, written.sourceId)

    expect(detail).toMatchObject({
      id: written.sourceId,
      title: '朝日新聞 社説',
      charCount: 1400,
      status: 'queued',
      deletedAt: null,
    })
    expect(detail!.content).toBe(submission().content)
  })

  it('⚠️ still returns a deleted source — `S11` requires it to stay readable', async () => {
    const written = await recordSource(db, submission())
    await client.exec(`UPDATE source SET deleted_at = now() WHERE id = '${written.sourceId}';`)

    const detail = await sourceDetail(db, written.sourceId)
    expect(detail).not.toBeNull()
    expect(detail!.deletedAt).toBeInstanceOf(Date)
  })

  it('answers null for an id that is not there', async () => {
    expect(await sourceDetail(db, '019bd3f1-2c4e-7a91-8b23-0bdc18694aa5')).toBeNull()
  })
})

describe('startBlockCounts', () => {
  it('is two zeros for a reader with nothing — and both controls still render', async () => {
    // ADR 0032, ADR 0035: **neither start control is ever disabled**, so zero is
    // a number this function returns rather than a state it signals.
    expect(await startBlockCounts(db, OWNER)).toEqual({ pending: 0, due: 0 })
  })

  it('counts pending notes and nothing else', async () => {
    await seedVetting('pending')
    await seedVetting('accepted', '駅␟えき')
    await seedVetting('rejected', '本␟ほん')

    expect((await startBlockCounts(db, OWNER)).pending).toBe(1)
  })

  it('counts a card due now', async () => {
    await seedDueCard({ due: `now() - interval '1 hour'` })
    expect((await startBlockCounts(db, OWNER)).due).toBe(1)
  })

  it('does not count a card due later', async () => {
    await seedDueCard({ due: `now() + interval '1 day'` })
    expect((await startBlockCounts(db, OWNER)).due).toBe(0)
  })

  it('⚠️ does not count a suspended card — the join `04` §11 requires', async () => {
    // `S9` flags and `S11` deletes both suspend, and suspension is on `card`, so
    // it cannot live in `scheduling_epoch`'s partial index. A count over epochs
    // alone offers a *session* of cards that have been withdrawn.
    const ids = await seedDueCard({ due: `now() - interval '1 hour'` })
    await client.exec(`
      UPDATE card SET suspended_at = now(), suspended_reason = 'flagged' WHERE id = '${ids.cardId}';
    `)

    expect((await startBlockCounts(db, OWNER)).due).toBe(0)
  })

  it('⚠️ does not count a superseded epoch — a reset is an INSERT, not an UPDATE', async () => {
    // `04` §7.4: a reset begins a new epoch and the prior one is retained. Both
    // rows are due; only the live one is a *card* to study.
    const ids = await seedDueCard({ due: `now() - interval '1 hour'` })
    await client.exec(`
      UPDATE scheduling_epoch
      SET superseded_at = now(), superseded_reason = 'manual_reset'
      WHERE id = '${ids.epochId}';
    `)

    expect((await startBlockCounts(db, OWNER)).due).toBe(0)
  })

  it('counts nothing for a different reader', async () => {
    await client.exec(`
      INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('usr_other', 'Other', 'other@example.test', true, now(), now());
    `)
    await seedVetting('pending')
    await seedDueCard({ due: `now() - interval '1 hour'` })

    expect(await startBlockCounts(db, 'usr_other')).toEqual({ pending: 0, due: 0 })
  })
})

async function seedVetting(state: string, identityKey = '図書館␟としょかん') {
  const note = await client.query<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab', '${identityKey}', '{}'::jsonb) RETURNING id;
  `)
  const noteId = note.rows[0]!.id

  await client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state) VALUES ('${noteId}', '${OWNER}', '${state}');
  `)

  return noteId
}

async function seedDueCard({ due, identityKey = '駅␟えき' }: { due: string, identityKey?: string }) {
  const noteId = await seedVetting('accepted', identityKey)

  const card = await client.query<{ id: string }>(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${noteId}', '${OWNER}', 'recognition') RETURNING id;
  `)
  const cardId = card.rows[0]!.id

  const epoch = await client.query<{ id: string }>(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
    VALUES ('${cardId}', '${OWNER}', 1, ${due}, 12.5, 5.2, 3) RETURNING id;
  `)

  return { cardId, epochId: epoch.rows[0]!.id }
}
