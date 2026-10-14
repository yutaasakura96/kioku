// What Home reads — `server/utils/home/queries.ts`, against a real database
// (ADR 0078). The arithmetic is `shared/home/dashboard.ts`'s and is unit
// tested; what is tested here is which rows reach it.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { chooseCategory } from '../../server/utils/category/active'
import { homeData } from '../../server/utils/home/queries'
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

let words = 0

/** A starter-like word at `level`, with a *card* the reader owns. */
async function word({ level = 'N5', subject = 'jlpt-vocab-2', owner = OWNER, suspended = false } = {}) {
  words += 1
  const note = await one(
    `INSERT INTO note (subject_id, identity_key, fields)
     VALUES ($1, $2, $3::jsonb) RETURNING id`,
    [subject, `w${words}`, JSON.stringify({ term: `語${words}`, reading: `ご${words}`, meaning: `word ${words}` })],
  )
  await client.query(`INSERT INTO level_claim (note_id, authority_key, level) VALUES ($1, 'tanos-jlpt', $2)`, [note.id, level])
  await client.query(`INSERT INTO note_vetting (note_id, owner_id, state) VALUES ($1, $2, 'accepted')`, [note.id, owner])
  const card = await one(
    `INSERT INTO card (note_id, owner_id, template_key, suspended_at)
     VALUES ($1, $2, 'recognition', ${suspended ? 'now()' : 'NULL'}) RETURNING id`,
    [note.id, owner],
  )
  return card.id
}

/** A live epoch: `state` 2 is the library's Review, and `stability` is days. */
async function scheduled(cardId: string, due: string, { stability = 2, owner = OWNER } = {}) {
  return (await one(
    `INSERT INTO scheduling_epoch (card_id, owner_id, ordinal, due, state, stability, difficulty, scheduled_days)
     VALUES ($1, $2, 1, ${due}, 2, $3, 5.2, 3) RETURNING id`,
    [cardId, owner, stability],
  )).id
}

/** `ratings` in the order given, each a `review_log` row stamped now. */
async function graded(cardId: string, epochId: string, ratings: number[], owner = OWNER) {
  for (const rating of ratings) {
    await client.query(
      `INSERT INTO review_log
         (card_id, scheduling_epoch_id, owner_id, rating, state, due, stability, difficulty,
          scheduled_days, learning_steps, reviewed_at)
       VALUES ($1, $2, $3, $4, 2, now(), 2, 5.2, 1, 0, now())`,
      [cardId, epochId, owner, rating],
    )
  }
}

async function one(sql: string, params: unknown[] = []) {
  return (await client.query<{ id: string }>(sql, params)).rows[0]!
}

describe('a first visit (Welcome)', () => {
  it('is a reader who has chosen nothing and never composed a run', async () => {
    const home = await homeData(db, OWNER, new Date())

    expect(home.firstVisit).toBe(true)
    expect(home.hasHistory).toBe(false)
  })

  it('ends when the reader chooses a level', async () => {
    await chooseCategory(db, OWNER, 'jlpt:N4')

    const home = await homeData(db, OWNER, new Date())
    expect(home.firstVisit).toBe(false)
    expect(home.offer.category.name).toBe('JLPT N4')
  })

  // A reader who studied before #71 has no row and is not new.
  it('is not a reader who has composed a run in this subject', async () => {
    const cardId = await word()
    await client.query(`
      WITH run AS (INSERT INTO review_session (owner_id, size) VALUES ($1, 5) RETURNING id)
      INSERT INTO review_session_card (review_session_id, ordinal, card_id, owner_id)
      SELECT id, 0, $2, $1 FROM run
    `, [OWNER, cardId])

    expect((await homeData(db, OWNER, new Date())).firstVisit).toBe(false)
  })

  it('still is when the only run was in the subject the reader left', async () => {
    const cardId = await word({ subject: 'jlpt-vocab' })
    await client.query(`
      WITH run AS (INSERT INTO review_session (owner_id, size) VALUES ($1, 5) RETURNING id)
      INSERT INTO review_session_card (review_session_id, ordinal, card_id, owner_id)
      SELECT id, 0, $2, $1 FROM run
    `, [OWNER, cardId])

    expect((await homeData(db, OWNER, new Date())).firstVisit).toBe(true)
  })
})

describe('the dashboard', () => {
  it('lists the five levels, in the declaration\'s order', async () => {
    const home = await homeData(db, OWNER, new Date())

    expect(home.levels.map(row => row.label)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1'])
  })

  it('counts what is coming up from the reader\'s live, unsuspended epochs in this subject', async () => {
    await scheduled(await word(), `now() - interval '1 day'`)
    await scheduled(await word(), `now() + interval '2 days'`)
    await scheduled(await word({ suspended: true }), `now() - interval '1 day'`)
    await scheduled(await word({ subject: 'jlpt-vocab' }), `now() - interval '1 day'`)
    await scheduled(await word({ owner: OTHER }), `now() - interval '1 day'`, { owner: OTHER })
    await scheduled(await word(), `now() + interval '30 days'`)

    const { comingUp } = await homeData(db, OWNER, new Date())

    expect(comingUp.now).toBe(1)
    expect(comingUp.now + comingUp.laterToday + comingUp.tomorrow + comingUp.laterThisWeek).toBe(2)
  })

  it('marks today studied once something is graded, and has history from then', async () => {
    const cardId = await word()
    await graded(cardId, await scheduled(cardId, `now() + interval '1 day'`), [3])

    const home = await homeData(db, OWNER, new Date())

    expect(home.hasHistory).toBe(true)
    expect(home.days.at(-1)).toMatchObject({ studied: true, today: true })
    expect(home.days.filter(day => day.studied)).toHaveLength(1)
  })

  it('lists a word missed twice that is still Learning, with how often', async () => {
    const weak = await word()
    await graded(weak, await scheduled(weak, `now() + interval '1 day'`), [1, 3, 1, 1])

    const learned = await word()
    await graded(learned, await scheduled(learned, `now() + interval '30 days'`, { stability: 40 }), [1, 1, 3])

    const once = await word()
    await graded(once, await scheduled(once, `now() + interval '1 day'`), [1, 3])

    const flagged = await word({ suspended: true })
    await graded(flagged, await scheduled(flagged, `now() + interval '1 day'`), [1, 1])

    const theirs = await word({ owner: OTHER })
    await graded(theirs, await scheduled(theirs, `now() + interval '1 day'`, { owner: OTHER }), [1, 1], OTHER)

    const home = await homeData(db, OWNER, new Date())

    expect(home.weak).toHaveLength(1)
    expect(home.weak[0]).toMatchObject({ cardId: weak, misses: 3, answers: 4 })
    expect(home.weak[0]!.fields.term).toBeTruthy()
  })
})
