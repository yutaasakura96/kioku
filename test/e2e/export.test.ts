// `S12` — the export, read back. `11` §4 is this file, step by step.
//
// ⚠️ **`S12` calls an untested export "a belief, not an export"**, which is why
// the route, the link and this test ship together (#31). The test is the only
// thing that turns "the route answers JSON" into "the file holds what the
// database holds", and the difference is the superseded *scheduling epoch*: it
// is the row a system that stored state on `card` would no longer have
// (`04` §7.4), so it is the row an export that looked right could quietly drop.
//
// ⚠️ **Counts are reconciled against the database, not against the fixture.**
// A fixture count is what the test believes it wrote; `SELECT count(*)` is what
// is there. The owner filter is on both sides, and a second reader's rows are
// seeded so that an export which forgot the filter is one this test fails.

import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TEST_ENVIRONMENT } from './environment'
import { signIn } from './session'
import { startTestDatabase } from './database'
import type { TestDatabase } from './database'

const database: TestDatabase = await startTestDatabase()
const reader = await signIn(database.client)

// ⚠️ **A second owner, written directly rather than signed in.** `signIn` writes
// the invited address, and `auth.user.email` is unique; this reader never makes
// a request, so it needs a row to own things and nothing else.
const other = { userId: 'usr_other' }
await database.client.exec(`
  INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
  VALUES ('${other.userId}', 'Other', 'other@example.invalid', true, now(), now());
`)

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  env: { ...TEST_ENVIRONMENT, DATABASE_URL: database.connectionString },
})

afterAll(async () => {
  await database.stop()
})

/** A string nothing but `source.content` holds, so its absence is an assertion. */
const SOURCE_TEXT = '図書館で借りた本の全文、読者だけのもの'

interface Export {
  notes: { id: string, state: string }[]
  cards: { id: string, noteId: string }[]
  schedulingEpochs: { id: string, cardId: string, supersededAt: string | null }[]
  grades: { id: string, schedulingEpochId: string }[]
}

async function one(sql: string): Promise<string> {
  return (await database.client.query<{ id: string }>(sql)).rows[0]!.id
}

async function count(sql: string): Promise<number> {
  return Number((await database.client.query<{ n: number }>(sql)).rows[0]!.n)
}

async function note(key: string, ingestionId: string): Promise<string> {
  return one(`
    INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
    VALUES ('jlpt-vocab', '${key}', '{"term":"${key}"}'::jsonb, '${ingestionId}')
    RETURNING id;
  `)
}

async function grade(cardId: string, epochId: string, ownerId: string): Promise<void> {
  await database.client.exec(`
    INSERT INTO review_log
      (card_id, scheduling_epoch_id, owner_id, rating, state, due, stability, difficulty,
       scheduled_days, learning_steps, reviewed_at)
    VALUES ('${cardId}', '${epochId}', '${ownerId}', 3, 0, now(), 3.1, 5.2, 1, 0, now());
  `)
}

let pendingNoteId: string
let resetCardId: string
let supersededEpochId: string

beforeAll(async () => {
  const sourceId = await one(`
    INSERT INTO source (subject_id, kind, title, content, content_hash, char_count)
    VALUES ('jlpt-vocab', 'word_list', '私的な本', '${SOURCE_TEXT}', 'hash', 19)
    RETURNING id;
  `)

  const ingestionId = await one(`
    INSERT INTO ingestion (source_id, source_title, subject_id, status, worker_environment)
    VALUES ('${sourceId}', '私的な本', 'jlpt-vocab', 'complete', 'laptop')
    RETURNING id;
  `)

  // The *card* `11` §4 is about: minted, graded, reset, graded again.
  const acceptedNoteId = await note('図書館', ingestionId)
  await database.client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
    VALUES ('${acceptedNoteId}', '${reader.userId}', 'accepted', now());
  `)

  resetCardId = await one(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${acceptedNoteId}', '${reader.userId}', 'recognition')
    RETURNING id;
  `)

  supersededEpochId = await one(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days,
       superseded_at, superseded_reason)
    VALUES ('${resetCardId}', '${reader.userId}', 1, now(), 3.1, 5.2, 1,
            now(), 'manual_reset')
    RETURNING id;
  `)
  await grade(resetCardId, supersededEpochId, reader.userId)
  await grade(resetCardId, supersededEpochId, reader.userId)

  const liveEpochId = await one(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
    VALUES ('${resetCardId}', '${reader.userId}', 2, now() + interval '1 day', 3.1, 5.2, 1)
    RETURNING id;
  `)
  await grade(resetCardId, liveEpochId, reader.userId)

  // ⚠️ **The nastiest case** (`11` §4): a *note* still `pending` — the *note*
  // is the reader's, and a *card* for it would be one minted before acceptance.
  pendingNoteId = await note('借りる', ingestionId)
  await database.client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state)
    VALUES ('${pendingNoteId}', '${reader.userId}', 'pending');
  `)

  // Someone else's word, *card*, epoch and *grade*: none of it is this reader's.
  const otherNoteId = await note('本', ingestionId)
  await database.client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
    VALUES ('${otherNoteId}', '${other.userId}', 'accepted', now());
  `)
  const otherCardId = await one(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${otherNoteId}', '${other.userId}', 'recognition')
    RETURNING id;
  `)
  const otherEpochId = await one(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
    VALUES ('${otherCardId}', '${other.userId}', 1, now(), 3.1, 5.2, 1)
    RETURNING id;
  `)
  await grade(otherCardId, otherEpochId, other.userId)
})

async function exported(): Promise<{ response: Response, body: string }> {
  const response = await fetch('/api/export', { headers: { cookie: reader.cookie } })
  return { response, body: await response.text() }
}

describe('GET /api/export — `11` §4', () => {
  it('answers a file, not a page', async () => {
    const { response, body } = await exported()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="kioku-export-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(response.headers.get('content-type')).toMatch(/^application\/json/)
    expect(() => JSON.parse(body)).not.toThrow()
  })

  it('reconciles every count against the database, superseded epochs included', async () => {
    const file = JSON.parse((await exported()).body) as Export
    const owner = `owner_id = '${reader.userId}'`

    // ⚠️ **`11` §4 says reconcile `note`, and `note` has no owner** (`04` §4):
    // it is shared, and a *note* is this reader's through `note_vetting`. So the
    // *note* count is taken there — which is also what makes the second owner's
    // word, a `note` row like any other, one this reconciliation excludes.

    expect(file.notes).toHaveLength(await count(`SELECT count(*) AS n FROM note_vetting WHERE ${owner};`))
    expect(file.cards).toHaveLength(await count(`SELECT count(*) AS n FROM card WHERE ${owner};`))
    expect(file.schedulingEpochs).toHaveLength(await count(`SELECT count(*) AS n FROM scheduling_epoch WHERE ${owner};`))
    expect(file.grades).toHaveLength(await count(`SELECT count(*) AS n FROM review_log WHERE ${owner};`))

    // ⚠️ The numbers the fixture was built to produce, so that a reconciliation
    // of zero against zero cannot pass for one.
    expect([file.notes.length, file.cards.length, file.schedulingEpochs.length, file.grades.length])
      .toEqual([2, 1, 2, 3])
  })

  it('keeps the superseded epoch and the grades given under it', async () => {
    const file = JSON.parse((await exported()).body) as Export

    const superseded = file.schedulingEpochs.find(epoch => epoch.id === supersededEpochId)
    expect(superseded?.supersededAt).not.toBeNull()
    expect(file.grades.filter(g => g.schedulingEpochId === supersededEpochId)).toHaveLength(2)
  })

  it('includes a pending note and no card for it', async () => {
    const file = JSON.parse((await exported()).body) as Export

    expect(file.notes.find(n => n.id === pendingNoteId)?.state).toBe('pending')
    expect(file.cards.filter(c => c.noteId === pendingNoteId)).toEqual([])
    expect(file.cards.map(c => c.id)).toEqual([resetCardId])
  })

  // `03` §13.4: *source* text is the reader's private material, and an export
  // is a file that leaves the machine.
  it('carries no source text and no email', async () => {
    const { body } = await exported()

    expect(body).not.toContain(SOURCE_TEXT)
    expect(body).not.toContain(TEST_ENVIRONMENT.KIOKU_INVITED_EMAIL)
  })

  // ⚠️ **302 and not the 401 every other `/api/**` route answers** (`08` §6.3,
  // as amended by #31). The export is reached by following a link, which makes
  // the caller a browser rather than a *mode*'s `fetch`, and a 401 would hand a
  // signed-out reader a bare error document where the door belongs.
  it('sends a signed-out request to the door rather than a file', async () => {
    const response = await fetch('/api/export', { redirect: 'manual' })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth')
    expect(response.headers.get('content-disposition')).toBeNull()
  })
})

describe('the link on /stats — `10` §8.4', () => {
  it('is a plain anchor reading Export everything', async () => {
    const document = await (await fetch('/stats', { headers: { cookie: reader.cookie } })).text()

    expect(document).toMatch(/<a href="\/api\/export"[^>]*>Export everything<\/a>/)
  })
})
