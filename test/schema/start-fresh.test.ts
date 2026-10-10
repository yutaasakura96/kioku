// "Start fresh" — ADR 0075 §1, #68, against a real database.
//
// The *subject* id moved from `jlpt-vocab` to `jlpt-vocab-2` and nothing was
// deleted. What changed is that no screen reads the old corpus, and that is one
// predicate on every read a screen makes (`server/utils/subject.ts`).
//
// ⚠️ **With one *subject* in the database every one of these reads passes
// without its predicate**, which is how a new read would ship without it. So
// each test here seeds a whole reader's history under the old id — a *source*,
// a run, an accepted *note*, a new *card*, a due *card*, a *grade*, an open
// flag, an unfinished *session* — and asks for nothing back.
//
// ⚠️ **And the last three tests are the other half**: the rows are still there.
// The export hands them over, the ledger still shows what was spent, and a
// *source* opened by id is still readable.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { exportEverything } from '../../server/utils/export/queries'
import { allSources, recentRuns, sourceDetail, startBlockCounts } from '../../server/utils/ingest/queries'
import { dueCards, dueCount, newCards, nothingToStudy, readerZone, recentlyComposed, snapshotOf } from '../../server/utils/review/queries'
import { recordGrade } from '../../server/utils/review/grade'
import { recordFlag } from '../../server/utils/review/flag'
import { recordSynonym } from '../../server/utils/review/synonym'
import { liveSession, resumeOrCompose } from '../../server/utils/review/session'
import { ledger, statsRows } from '../../server/utils/stats/queries'
import { CURRENT_SUBJECT_ID } from '../../server/utils/subject'
import { flaggedCount, queueBatch } from '../../server/utils/vet/queries'
import { freshDatabase, reset } from './harness'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase

const OWNER = 'usr_test'
/** The id every row carried until #68. */
const OLD_SUBJECT_ID = 'jlpt-vocab'
const NOW = new Date()

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
  const result = await client.query<{ id: string }>(sql)
  return result.rows[0]!.id
}

/**
 * One reader's whole history under one *subject*: everything a screen reads.
 * `tag` keeps two histories' unique keys apart.
 */
async function history(subjectId: string, tag: string) {
  const sourceId = await one(`
    INSERT INTO source (subject_id, kind, title, content, content_hash, char_count)
    VALUES ('${subjectId}', 'word_list', '${tag} の単語', '図書館', 'hash-${tag}', 3) RETURNING id;
  `)
  const ingestionId = await one(`
    INSERT INTO ingestion (source_id, source_title, subject_id, status, submitted_by, cost_micro_usd)
    VALUES ('${sourceId}', '${tag} の単語', '${subjectId}', 'complete', '${OWNER}', 1300) RETURNING id;
  `)

  const cards: Record<'studied' | 'fresh', string> = { studied: '', fresh: '' }
  const notes: Record<'studied' | 'fresh', string> = { studied: '', fresh: '' }

  for (const which of ['studied', 'fresh'] as const) {
    notes[which] = await one(`
      INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
      VALUES ('${subjectId}', '${tag}-${which}', '{"term":"図書館","reading":"としょかん","meaning":"library"}'::jsonb, '${ingestionId}')
      RETURNING id;
    `)
    await client.exec(`
      INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
      VALUES ('${notes[which]}', '${OWNER}', 'accepted', now());
    `)
    cards[which] = await one(`
      INSERT INTO card (note_id, owner_id, template_key)
      VALUES ('${notes[which]}', '${OWNER}', 'recognition') RETURNING id;
    `)
  }

  // The studied *card*: due an hour ago, in an unfinished run that introduced
  // it today, graded once and flagged.
  const epochId = await one(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days, reps, lapses, state)
    VALUES ('${cards.studied}', '${OWNER}', 1, now() - interval '1 hour', 61.4, 5.2, 63, 7, 1, 2)
    RETURNING id;
  `)
  const sessionId = await one(`
    INSERT INTO review_session (owner_id, size, new_count, zone)
    VALUES ('${OWNER}', 1, 1, 'Asia/Tokyo') RETURNING id;
  `)
  await client.exec(`
    INSERT INTO review_session_card (review_session_id, ordinal, card_id, owner_id)
    VALUES ('${sessionId}', 0, '${cards.studied}', '${OWNER}');

    INSERT INTO review_log
      (card_id, scheduling_epoch_id, owner_id, review_session_id,
       rating, state, due, stability, difficulty, scheduled_days, learning_steps, reviewed_at)
    VALUES ('${cards.studied}', '${epochId}', '${OWNER}', '${sessionId}',
            3, 2, now(), 61.4, 5.2, 63, 0, now() - interval '2 hours');

    INSERT INTO card_flag (card_id, note_id, owner_id, review_session_id)
    VALUES ('${cards.studied}', '${notes.studied}', '${OWNER}', '${sessionId}');
  `)

  return { sourceId, ingestionId, sessionId, cards, notes }
}

describe('a reader whose whole history is under the old subject', () => {
  it('is on the subject the declaration names, and it is not the old one', () => {
    expect(CURRENT_SUBJECT_ID).toBe('jlpt-vocab-2')
    expect(CURRENT_SUBJECT_ID).not.toBe(OLD_SUBJECT_ID)
  })

  it('owes nothing and has nothing waiting on Review', async () => {
    await history(OLD_SUBJECT_ID, 'old')

    expect(await dueCards(db, OWNER, NOW)).toEqual([])
    expect(await dueCount(db, OWNER, NOW)).toBe(0)
    expect(await newCards(db, OWNER, 20)).toEqual([])
    expect(await nothingToStudy(db, OWNER)).toEqual({ hasCards: false, nextDue: null, newWaiting: false })
  })

  it('is not handed the run they left open, and composes nothing from it', async () => {
    const old = await history(OLD_SUBJECT_ID, 'old')

    expect(await liveSession(db, OWNER)).toBeNull()
    expect(await resumeOrCompose(db, OWNER, 20)).toBeNull()
    expect(await snapshotOf(db, OWNER, old.sessionId)).toBeNull()
    expect(await readerZone(db, OWNER)).toBe('UTC')
    expect(await recordGrade(db, OWNER, {
      sessionId: old.sessionId, cardId: old.cards.studied, grade: 3, reviewedAt: new Date(),
    })).toEqual({ ok: false, reason: 'not_in_session' })
    expect(await recordFlag(db, OWNER, {
      sessionId: old.sessionId, cardId: old.cards.studied,
    })).toEqual({ ok: false, reason: 'not_in_session' })
    expect(await recordSynonym(db, OWNER, {
      sessionId: old.sessionId, cardId: old.cards.studied, text: 'library',
    })).toBe('not_in_session')
  })

  it('has spent none of today on it', async () => {
    await history(OLD_SUBJECT_ID, 'old')

    expect(await recentlyComposed(db, OWNER, NOW)).toEqual([])
  })

  it('sees an empty start block and an empty flag queue', async () => {
    await history(OLD_SUBJECT_ID, 'old')

    expect(await startBlockCounts(db, OWNER)).toEqual({ flagged: 0, due: 0, newToday: 0 })
    expect(await flaggedCount(db, OWNER)).toBe(0)
    expect(await queueBatch(db, OWNER)).toEqual([])
  })

  it('sees no runs on Ingest and no sources on Sources', async () => {
    await history(OLD_SUBJECT_ID, 'old')

    expect(await recentRuns(db)).toEqual([])
    expect(await allSources(db)).toEqual([])
  })

  it('reads every figure on Stats from zero', async () => {
    await history(OLD_SUBJECT_ID, 'old')

    expect(await statsRows(db, OWNER, NOW)).toEqual({
      retention: { recalled: 0, qualifying: 0 },
      gradeMinutes: [],
      firstGradeAt: null,
      flaggedCards: 0,
      cardsMinted: 0,
      timeToFirstReview: [],
      sourcesIngested: 0,
      workerEnvironments: [],
    })
  })
})

describe('the same reader, once they have a history under the new subject too', () => {
  it('is read from the new one alone, on every screen', async () => {
    await history(OLD_SUBJECT_ID, 'old')
    const now = await history(CURRENT_SUBJECT_ID, 'new')

    expect((await dueCards(db, OWNER, NOW)).map(card => card.cardId)).toEqual([now.cards.studied])
    expect(await dueCount(db, OWNER, NOW)).toBe(1)
    expect((await newCards(db, OWNER, 20)).map(card => card.cardId)).toEqual([now.cards.fresh])
    expect(await liveSession(db, OWNER)).toBe(now.sessionId)
    expect(await recentlyComposed(db, OWNER, NOW)).toHaveLength(1)
    expect(await flaggedCount(db, OWNER)).toBe(1)
    expect((await queueBatch(db, OWNER)).map(note => note.noteId)).toEqual([now.notes.studied])
    expect((await recentRuns(db)).map(run => run.ingestionId)).toEqual([now.ingestionId])
    expect((await allSources(db)).map(source => source.id)).toEqual([now.sourceId])

    const stats = await statsRows(db, OWNER, NOW)
    expect(stats.retention).toEqual({ recalled: 1, qualifying: 1 })
    expect(stats.gradeMinutes).toHaveLength(1)
    expect(stats.flaggedCards).toBe(1)
    expect(stats.cardsMinted).toBe(2)
    expect(stats.timeToFirstReview).toHaveLength(1)
    expect(stats.sourcesIngested).toBe(1)
  })
})

describe('what starting fresh did not do', () => {
  it('deleted nothing: the export still hands over the old history', async () => {
    const old = await history(OLD_SUBJECT_ID, 'old')

    const everything = await exportEverything(db, OWNER)

    expect(JSON.stringify(everything)).toContain(old.cards.studied)
    expect(JSON.stringify(everything)).toContain(old.notes.fresh)
    const counts = await client.query<{ notes: number, cards: number, grades: number }>(`
      SELECT (SELECT count(*)::int FROM note WHERE subject_id = '${OLD_SUBJECT_ID}') AS notes,
             (SELECT count(*)::int FROM card) AS cards,
             (SELECT count(*)::int FROM review_log) AS grades;
    `)
    expect(counts.rows[0]).toEqual({ notes: 2, cards: 2, grades: 1 })
  })

  it('kept the spend ledger whole', async () => {
    const old = await history(OLD_SUBJECT_ID, 'old')
    const now = await history(CURRENT_SUBJECT_ID, 'new')

    expect((await ledger(db)).map(row => row.id).sort()).toEqual([old.ingestionId, now.ingestionId].sort())
  })

  it('left an old source readable by its id', async () => {
    const old = await history(OLD_SUBJECT_ID, 'old')

    expect((await sourceDetail(db, old.sourceId))?.title).toBe('old の単語')
  })
})
