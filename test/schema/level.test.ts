// The placement test, the placement and *Your level* — `server/utils/level/queries.ts`,
// against a real database (ADR 0079). The rules are `shared/level/`'s and are
// unit tested; what is tested here is which rows they are given and what a
// placement writes.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { placementTest, readLevelEstimate, recordPlacement, testedWords } from '../../server/utils/level/queries'
import { recordGrade } from '../../server/utils/review/grade'
import { dueCards } from '../../server/utils/review/queries'
import { resumeOrStart } from '../../server/utils/review/session'
import { PLACEMENT_CHOICES, PLACEMENT_WORDS_PER_LEVEL, SPOT_CHECKS_PER_LEVEL } from '../../shared/level/thresholds'
import { freshDatabase, reset } from './harness'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase

const OWNER = 'usr_test'
const OTHER = 'usr_other'
const DAY = 86_400_000

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

/** A starter word at `level`, with no *card*. */
async function starterWord(level: string): Promise<string> {
  words += 1
  const fields = { term: `語${words}`, reading: 'よみ', part_of_speech: 'noun', meaning: `meaning ${words}; sense ${words}` }
  const note = await one(
    `INSERT INTO note (subject_id, identity_key, fields) VALUES ('jlpt-vocab-2', $1, $2::jsonb) RETURNING id`,
    [`w${words}␟よみ`, JSON.stringify(fields)],
  )
  await client.query(`INSERT INTO level_claim (note_id, authority_key, level) VALUES ($1, 'tanos-jlpt', $2)`, [note.id, level])
  return note.id
}

async function starterWords(level: string, count: number): Promise<string[]> {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1)
    ids.push(await starterWord(level))
  return ids
}

/** A *card* the reader studies, graded `ratings` at `at`. */
async function studied(level: string, ratings: number[], { owner = OWNER, at = 'now()' } = {}) {
  const noteId = await starterWord(level)
  await client.query(`INSERT INTO note_vetting (note_id, owner_id, state) VALUES ($1, $2, 'accepted')`, [noteId, owner])
  const card = await one(`INSERT INTO card (note_id, owner_id, template_key) VALUES ($1, $2, 'recognition') RETURNING id`, [noteId, owner])
  const epoch = await one(
    `INSERT INTO scheduling_epoch (card_id, owner_id, ordinal, due, state, stability, difficulty, scheduled_days)
     VALUES ($1, $2, 1, now() + interval '3 days', 2, 3, 5.2, 3) RETURNING id`,
    [card.id, owner],
  )
  for (const rating of ratings) {
    await client.query(
      `INSERT INTO review_log
         (card_id, scheduling_epoch_id, owner_id, rating, state, due, stability, difficulty,
          scheduled_days, learning_steps, reviewed_at)
       VALUES ($1, $2, $3, $4, 2, now(), 3, 5.2, 3, 0, ${at})`,
      [card.id, epoch.id, owner, rating],
    )
  }
}

async function one(sql: string, params: unknown[] = []) {
  return (await client.query<{ id: string }>(sql, params)).rows[0]!
}

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await client.query<T>(sql, params)).rows
}

describe('placementTest', () => {
  it('asks five words a level, easiest first, each with four choices', async () => {
    for (const level of ['N5', 'N4', 'N3', 'N2', 'N1'])
      await starterWords(level, 8)

    const questions = await placementTest(db)

    expect(questions).toHaveLength(5 * PLACEMENT_WORDS_PER_LEVEL)
    expect(questions.map(question => question.level)).toEqual(
      ['N5', 'N4', 'N3', 'N2', 'N1'].flatMap(level => Array<string>(PLACEMENT_WORDS_PER_LEVEL).fill(level)),
    )
    for (const question of questions) {
      expect(question.choices).toHaveLength(PLACEMENT_CHOICES)
      expect(question.choices).toContain(question.answer)
    }
  })

  it('reads only the current subject\'s starter words', async () => {
    await starterWords('N5', 3)
    await client.query(`
      INSERT INTO note (subject_id, identity_key, fields) VALUES ('jlpt-vocab', 'old', '{"term":"古","meaning":"old"}'::jsonb)
    `)

    expect(await placementTest(db)).toHaveLength(3)
  })

  it('holds the meaning the server scores against, for a word of this subject only', async () => {
    const [id] = await starterWords('N4', 1)

    expect(await testedWords(db, [id!, '00000000-0000-7000-8000-000000000000'])).toEqual([
      expect.objectContaining({ noteId: id, level: 'N4', meaning: expect.stringMatching(/^meaning /) }),
    ])
  })
})

describe('recordPlacement', () => {
  it('writes the placement and makes the start level the active category', async () => {
    const recorded = await recordPlacement(db, OWNER, { kind: 'test', level: 'N4' })

    expect(recorded.start).toBe('N3')
    expect(await rows(`SELECT kind, level, subject_id FROM placement WHERE owner_id = $1`, [OWNER]))
      .toEqual([{ kind: 'test', level: 'N4', subject_id: 'jlpt-vocab-2' }])
    expect(await rows(`SELECT category_key FROM active_category WHERE owner_id = $1`, [OWNER]))
      .toEqual([{ category_key: 'jlpt:N3' }])
  })

  it('spot-checks a sample of each level marked known, Known and due from tomorrow', async () => {
    await starterWords('N5', SPOT_CHECKS_PER_LEVEL + 5)
    await starterWords('N4', 3)
    await starterWords('N3', 4)
    const now = new Date()

    const recorded = await recordPlacement(db, OWNER, { kind: 'test', level: 'N4' }, now)

    // N5 and N4 are marked known; N3 is where lessons start.
    expect(recorded.checks).toBe(SPOT_CHECKS_PER_LEVEL + 3)
    expect(await rows(`SELECT level, count(*)::int AS n FROM placement_check GROUP BY level ORDER BY level`))
      .toEqual([{ level: 'N4', n: 3 }, { level: 'N5', n: SPOT_CHECKS_PER_LEVEL }])

    const epochs = await rows<{ state: number, stability: number, ordinal: number, reps: number, due: Date }>(`
      SELECT e.state, e.stability, e.ordinal, e.reps, e.due
      FROM scheduling_epoch e JOIN card c ON c.id = e.card_id
      JOIN placement_check p ON p.note_id = c.note_id
    `)
    expect(epochs).toHaveLength(SPOT_CHECKS_PER_LEVEL + 3)
    for (const epoch of epochs) {
      expect(epoch).toMatchObject({ state: 2, ordinal: 1, reps: 0 })
      expect(epoch.stability).toBeGreaterThanOrEqual(21)
      expect(epoch.due.getTime()).toBeGreaterThan(now.getTime())
    }

    // None is due today; two are due tomorrow.
    expect(await dueCards(db, OWNER, now)).toHaveLength(0)
    expect(await dueCards(db, OWNER, new Date(now.getTime() + DAY))).toHaveLength(2)
  })

  it('samples no word the reader has already started', async () => {
    const [started] = await starterWords('N5', 1)
    await client.query(`INSERT INTO note_vetting (note_id, owner_id, state) VALUES ($1, $2, 'accepted')`, [started, OWNER])
    await client.query(`INSERT INTO card (note_id, owner_id, template_key) VALUES ($1, $2, 'recognition')`, [started, OWNER])
    await starterWords('N5', 2)

    await recordPlacement(db, OWNER, { kind: 'test', level: 'N5' })

    const checked = await rows<{ note_id: string }>(`SELECT note_id FROM placement_check`)
    expect(checked).toHaveLength(2)
    expect(checked.map(row => row.note_id)).not.toContain(started)
  })

  it('marks nothing known for a test that placed at none', async () => {
    await starterWords('N5', 3)

    const recorded = await recordPlacement(db, OWNER, { kind: 'test', level: null })

    expect(recorded).toMatchObject({ start: 'N5', checks: 0 })
    expect(await rows(`SELECT level FROM placement`)).toEqual([{ level: null }])
  })
})

describe('readLevelEstimate', () => {
  it('has no estimate for a reader with nothing', async () => {
    expect(await readLevelEstimate(db, OWNER)).toMatchObject({ level: null, next: 'N5', placement: null })
  })

  it('reads the newest placement in this subject, and the levels it places out', async () => {
    await recordPlacement(db, OWNER, { kind: 'test', level: 'N3' }, new Date(Date.now() - 2 * DAY))
    await recordPlacement(db, OWNER, { kind: 'declared', level: 'N5' })

    expect(await readLevelEstimate(db, OWNER)).toMatchObject({
      level: 'N5',
      next: 'N4',
      source: 'placement',
      placement: { kind: 'declared', level: 'N5' },
      placedOut: ['N5'],
    })
  })

  it('proves a level from fifty words answered in the last thirty days', async () => {
    for (let index = 0; index < 50; index += 1)
      await studied('N5', [index < 40 ? 3 : 1])

    expect(await readLevelEstimate(db, OWNER)).toMatchObject({ level: 'N5', next: 'N4', source: 'results' })
  })

  it('does not count answers older than thirty days, or another reader\'s', async () => {
    for (let index = 0; index < 50; index += 1)
      await studied('N5', [3], { at: `now() - interval '31 days'` })
    for (let index = 0; index < 50; index += 1)
      await studied('N5', [3], { owner: OTHER })

    expect(await readLevelEstimate(db, OWNER)).toMatchObject({ level: null })
    expect(await readLevelEstimate(db, OTHER)).toMatchObject({ level: 'N5' })
  })

  it('withdraws the placement for a level whose spot-checks are missed', async () => {
    await starterWords('N5', SPOT_CHECKS_PER_LEVEL)
    await recordPlacement(db, OWNER, { kind: 'test', level: 'N5' }, new Date(Date.now() - 3.5 * DAY))

    // Three days of checks are due: six words, all N5. Each is missed.
    const run = await resumeOrStart(db, OWNER, { start: 'review', size: 20, zone: null })
    expect(run?.positions).toHaveLength(6)
    for (const position of run!.positions)
      await recordGrade(db, OWNER, { sessionId: run!.sessionId, cardId: position.cardId, grade: 1, reviewedAt: new Date() })

    expect(await readLevelEstimate(db, OWNER)).toMatchObject({ level: null, withdrawn: ['N5'], placedOut: [] })
  })

  it('keeps the placement when the spot-checks are right', async () => {
    await starterWords('N5', SPOT_CHECKS_PER_LEVEL)
    await recordPlacement(db, OWNER, { kind: 'test', level: 'N5' }, new Date(Date.now() - 3.5 * DAY))

    const run = await resumeOrStart(db, OWNER, { start: 'review', size: 20, zone: null })
    for (const position of run!.positions)
      await recordGrade(db, OWNER, { sessionId: run!.sessionId, cardId: position.cardId, grade: 3, reviewedAt: new Date() })

    expect(await readLevelEstimate(db, OWNER)).toMatchObject({ level: 'N5', withdrawn: [], placedOut: ['N5'] })
  })
})
