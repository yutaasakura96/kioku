// The *session* composer, the snapshot and the *grade* — `server/utils/review/`,
// against a real database.
//
// ⚠️ **These are in the schema tier rather than the unit one because what they
// are about is rows.** The two compositions are pure functions and have their
// own tests (`test/unit/review-compose.test.ts`); what is here is that the
// *session* is **written** the way `04` §7.6 and §7.7 describe — `size` rows, a
// *card* once, a server-side `snapshot_taken_at` — that a lesson accepts and
// mints the words it starts (ADR 0076 §1), and that a *grade* mints the
// *card*'s first *scheduling epoch* and one `review_log` row that can never be
// taken back.
//
// ⚠️ **One test asserts an absence in the other direction from
// `test/schema/vet.test.ts`'s.** That file asserts acceptance mints **no**
// epoch; this one asserts the *grade* mints exactly one, at ordinal 1. The two
// together are the whole of "the first epoch belongs to the *session* that first
// schedules the *card*" (`04` §9, ADR 0033), and either alone reads as tidiness.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { dueCards, newCards, nextDueAt, readerZone, snapshotOf, unstartedNotes } from '../../server/utils/review/queries'
import { freshDatabase, reset } from './harness'
import { recordFlag } from '../../server/utils/review/flag'
import { recordGrade } from '../../server/utils/review/grade'
import { brakeReading, finishSession, offerIfFinished, offerOf, resumeOrStart } from '../../server/utils/review/session'
import { readLimits, writeLimits } from '../../server/utils/review/settings'
import { DEFAULT_LIMITS } from '../../shared/review/limits'
import { chooseCategory, readActiveCategory } from '../../server/utils/category/active'
import type { CategoryRef } from '../../shared/category/category'
import type { Grade } from '../../shared/review/scheduler'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase

const OWNER = 'usr_test'
const OTHER = 'usr_other'

const DAY = 24 * 60 * 60 * 1000

/** The *category* a reader who has chosen none studies (ADR 0077 §2). */
const N5: CategoryRef = { kind: 'level', level: 'N5' }

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

const FIELDS = {
  term: '図書館',
  reading: 'としょかん',
  part_of_speech: '名詞',
  meaning: 'library',
  example_sentence: '駅の近くに図書館があります。',
  example_gloss: 'There is a library near the station.',
}

/**
 * An accepted *note* and the *card* it minted — ⚠️ **and no *scheduling epoch***,
 * because that is what acceptance actually leaves behind (`server/utils/vet/decide.ts`).
 *
 * ⚠️ **The list places it at N5 unless `level` says otherwise**, so it is in
 * the *category* a reader who has chosen none studies (ADR 0077 §2). `null` is
 * a word no list carries: in no *level*, and in a lesson only through the
 * *source* it was seen in.
 */
async function acceptedCard(
  key: string,
  { owner = OWNER, minutesAgo = 0, fields = FIELDS, suspended = false, level = 'N5' as string | null } = {},
): Promise<string> {
  const note = await one<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab-2', '${key}', '${JSON.stringify(fields)}'::jsonb)
    RETURNING id;
  `)

  await client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
    VALUES ('${note.id}', '${owner}', 'accepted', now());
  `)

  const card = await one<{ id: string }>(`
    INSERT INTO card (note_id, owner_id, template_key, created_at, suspended_at, suspended_reason)
    VALUES ('${note.id}', '${owner}', 'recognition', now() - interval '${minutesAgo} minutes',
            ${suspended ? 'now()' : 'null'}, ${suspended ? `'flagged'` : 'null'})
    RETURNING id;
  `)

  if (level !== null) {
    await client.exec(`
      INSERT INTO level_claim (note_id, authority_key, level) VALUES ('${note.id}', 'tanos-jlpt', '${level}');
    `)
  }

  return card.id
}

/** A *card* with a live epoch — `dueInDays` negative means overdue. */
async function scheduled(cardId: string, dueInDays: number, owner = OWNER): Promise<string> {
  const epoch = await one<{ id: string }>(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days, reps, lapses, state)
    VALUES ('${cardId}', '${owner}', 1, now() + interval '${dueInDays} days',
            61.4, 5.2, 63, 7, 1, 2)
    RETURNING id;
  `)

  return epoch.id
}

async function one<T>(sql: string): Promise<T> {
  const result = await client.query<T>(sql)
  return result.rows[0]!
}

async function rows<T>(sql: string): Promise<T[]> {
  return (await client.query<T>(sql)).rows
}

async function count(table: string, where = 'true'): Promise<number> {
  const { n } = await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${where};`)
  return n
}

/** A review run: due *cards* only, capped at `size` (ADR 0076 §1). */
function review(size = 20, owner = OWNER, zone: string | null = null) {
  return resumeOrStart(db, owner, { start: 'review', size, zone })
}

/** A lesson: new words only, as far as the brake and the settings allow. */
function lesson(owner = OWNER, zone: string | null = null) {
  return resumeOrStart(db, owner, { start: 'lesson', size: 20, zone })
}

/** A live *source* of one kind, and its one chunk, for a word to be seen in. */
async function source(kind: 'anki' | 'word_list', title: string) {
  const { id } = await one<{ id: string }>(`
    INSERT INTO source (subject_id, kind, title, content, content_hash, char_count)
    VALUES ('jlpt-vocab-2', '${kind}', '${title}', '会う', 'hash-${title}', 2) RETURNING id;
  `)
  const chunk = await one<{ id: string }>(`
    INSERT INTO source_chunk (source_id, ordinal, char_start, char_end, content_hash)
    VALUES ('${id}', 0, 0, 2, 'c') RETURNING id;
  `)

  return { id, chunkId: chunk.id }
}

async function seenIn(cardId: string, from: { id: string, chunkId: string }) {
  await client.exec(`
    INSERT INTO occurrence (note_id, source_id, source_chunk_id, char_start, char_end, surface_form)
    VALUES ('${await noteOf(cardId)}', '${from.id}', '${from.chunkId}', 0, 2, '会う');
  `)
}

/** An accepted *card* that is due — `daysAgo` since it came due. */
async function dueCard(key: string, daysAgo = 1): Promise<string> {
  const cardId = await acceptedCard(key)
  await scheduled(cardId, -daysAgo)

  return cardId
}

/**
 * A starter word as `scripts/starter-load.ts` leaves one (ADR 0075): a *note*
 * the list places at a *level*, with ⚠️ **no *card*, no vetting row and no
 * example sentence**.
 */
async function starterWord(term: string, level: string): Promise<string> {
  const fields = { term, reading: 'よみ', part_of_speech: '名詞', meaning: `meaning of ${term}` }
  const note = await one<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab-2', '${term}␟よみ', '${JSON.stringify(fields)}'::jsonb)
    RETURNING id;
  `)

  await client.exec(`
    INSERT INTO level_claim (note_id, authority_key, level) VALUES ('${note.id}', 'tanos-jlpt', '${level}');
  `)

  return note.id
}

async function noteOf(cardId: string): Promise<string> {
  return (await one<{ noteId: string }>(`SELECT note_id AS "noteId" FROM card WHERE id = '${cardId}';`)).noteId
}

describe('the two reads the composer is built from (`04` §11)', () => {
  it('offers a card whose live epoch has come due, and not one that has not', async () => {
    const overdue = await acceptedCard('一␟いち')
    const later = await acceptedCard('二␟に')
    await scheduled(overdue, -2)
    await scheduled(later, 3)

    expect((await dueCards(db, OWNER)).map(card => card.cardId)).toEqual([overdue])
  })

  // ⚠️ Suspension is on the `card` and cannot live in the epoch index's partial
  // predicate (`04` §11), so it is the join that drops it — and `S9` suspends a
  // *card* while leaving its history and its epoch exactly where they were.
  it('offers neither a due nor a new card once it is suspended', async () => {
    const suspended = await acceptedCard('三␟さん', { suspended: true })
    await scheduled(suspended, -1)

    expect(await dueCards(db, OWNER)).toEqual([])
    expect(await newCards(db, OWNER, 20, N5)).toEqual([])
  })

  it('offers a card with no epoch as new, oldest acceptance first', async () => {
    const second = await acceptedCard('二␟に', { minutesAgo: 5 })
    const first = await acceptedCard('一␟いち', { minutesAgo: 9 })

    expect((await newCards(db, OWNER, 20, N5)).map(card => card.cardId)).toEqual([first, second])
  })

  // ⚠️ **A *card* whose only epoch was superseded is not new.** It has a
  // history; it is due or it is not. Asking for the absence of a *live* epoch
  // rather than of any epoch would put a reset *card* back among the ones the
  // reader has never seen (`S12`, ADR 0011).
  it('does not offer a reset card as new', async () => {
    const reset = await acceptedCard('四␟よん')
    await client.exec(`
      INSERT INTO scheduling_epoch
        (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days, state,
         superseded_at, superseded_reason)
      VALUES ('${reset}', '${OWNER}', 1, now(), 61.4, 5.2, 63, 2, now(), 'manual_reset');
    `)

    expect(await newCards(db, OWNER, 20, N5)).toEqual([])
  })

  it('offers nothing belonging to another reader', async () => {
    const theirs = await acceptedCard('五␟ご', { owner: OTHER })
    await scheduled(theirs, -1, OTHER)

    expect(await dueCards(db, OWNER)).toEqual([])
    expect(await newCards(db, OWNER, 20, N5)).toEqual([])
  })
})

describe('composing a review run (`S7`, `04` §7.6, §7.7, ADR 0076 §1)', () => {
  it('writes `size` rows of membership — due cards only, and a card once', async () => {
    const older = await dueCard('一␟いち', 2)
    const newer = await dueCard('二␟に', 1)
    const fresh = await acceptedCard('三␟さん')

    const session = await review()

    expect(session).not.toBeNull()
    expect(session!.kind).toBe('review')
    expect(session!.size).toBe(2)
    expect(await count('review_session_card', `review_session_id = '${session!.sessionId}'`)).toBe(2)
    expect(session!.positions.map(p => p.cardId)).toEqual([older, newer])
    expect(session!.positions.map(p => p.ordinal)).toEqual([0, 1])
    // ⚠️ ADR 0076 §1: a new word reaches the reader through a lesson, never
    // here — and a review run spends none of the day.
    expect(session!.positions.map(p => p.cardId)).not.toContain(fresh)
    expect(await one(`SELECT kind, new_count FROM review_session;`)).toEqual({ kind: 'review', new_count: 0 })
  })

  // ⚠️ **`review_session.size` is what was composed, not what was asked for.**
  // The header counts the run's words, so a reader with one due and a knob at
  // twenty must get a run of one — a track that can never fill would be the
  // only progress indicator in the application promising work that does not
  // exist.
  it('is as long as what there was to study, not as long as the knob', async () => {
    await dueCard('一␟いち')

    const session = await review(20)

    expect(session!.size).toBe(1)
    expect(session!.positions).toHaveLength(1)
  })

  it('stops at the knob when more is due', async () => {
    await dueCard('一␟いち')
    await dueCard('二␟に')
    await dueCard('三␟さん')

    expect((await review(2))!.positions).toHaveLength(2)
  })

  it('carries the note fields, so the run is prefetched as a unit (`S8`)', async () => {
    await dueCard('図書館␟としょかん')

    const session = await review()

    expect(session!.positions[0]!.fields).toEqual(FIELDS)
    expect(session!.positions[0]!.templateKey).toBe('recognition')
  })

  // ⚠️ **Server-side, because `03` §8.2's replay rule compares a client stamp
  // against it** (ADR 0007, `04` §7.6). A value computed in the application and
  // sent over would be this process's clock standing in for the database's on
  // the one timestamp that decides whether a *grade* is believable.
  it('stamps `snapshot_taken_at` on the server', async () => {
    await dueCard('一␟いち')

    const before = await one<{ now: Date }>('SELECT now() AS now;')
    const session = await review()
    const after = await one<{ now: Date }>('SELECT now() AS now;')

    expect(session!.snapshotTakenAt.getTime()).toBeGreaterThanOrEqual(before.now.getTime())
    expect(session!.snapshotTakenAt.getTime()).toBeLessThanOrEqual(after.now.getTime())
  })

  it('answers nothing when there is nothing to study, and writes no session', async () => {
    expect(await review()).toBeNull()
    expect(await lesson()).toBeNull()
    expect(await count('review_session')).toBe(0)
  })

  // ⚠️ ADR 0076 §8: opening `/review` asks what is waiting and **composes
  // nothing**. A lesson spends the day's allowance by being composed, so the
  // mount must not be the reader starting one.
  it('composes nothing when no run is asked for', async () => {
    await dueCard('一␟いち')
    await acceptedCard('二␟に')

    expect(await resumeOrStart(db, OWNER, { start: null, size: 20 })).toBeNull()
    expect(await count('review_session')).toBe(0)
  })

  // ⚠️ `09` §4.7: *session* size is never set mid-session — the current one is
  // snapshotted, and a control that appeared to change it would be lying. The
  // live run is what `/review` answers with, whatever was asked for.
  it('resumes the live run rather than composing a second one', async () => {
    await dueCard('一␟いち')
    await dueCard('二␟に')
    await acceptedCard('三␟さん')

    const first = await review(1)

    for (const start of ['review', 'lesson', null] as const) {
      const again = await resumeOrStart(db, OWNER, { start, size: 20 })

      expect(again!.sessionId).toBe(first!.sessionId)
      expect(again!.size).toBe(1)
    }

    expect(await count('review_session')).toBe(1)
  })
})

// ADR 0076 §1 — where a word starts. ⚠️ **Starting a starter word is its
// acceptance**: the lesson writes `note_vetting` and mints through
// `mint_cards`, in the transaction that composes the run.
describe('composing a lesson (ADR 0076 §1)', () => {
  it('teaches the reader\'s own unscheduled cards, oldest first, five at a time', async () => {
    const cards: string[] = []
    for (let index = 0; index < 7; index += 1)
      cards.push(await acceptedCard(`新${index}␟しん${index}`, { minutesAgo: 10 - index }))

    const run = (await lesson())!

    expect(run.kind).toBe('lesson')
    expect(run.positions.map(p => p.cardId)).toEqual(cards.slice(0, 5))
    expect(await one(`SELECT kind, size, new_count FROM review_session;`)).toEqual({ kind: 'lesson', size: 5, new_count: 5 })
  })

  it('never holds a due card', async () => {
    const due = await dueCard('一␟いち')
    const fresh = await acceptedCard('二␟に')

    expect((await lesson())!.positions.map(p => p.cardId)).toEqual([fresh])
    expect(due).toBeDefined()
  })

  it('starts starter words by accepting them and minting their cards', async () => {
    const notes = [await starterWord('会う', 'N5'), await starterWord('青', 'N5')]

    expect(await count('card')).toBe(0)

    const run = (await lesson())!

    expect(run.positions).toHaveLength(2)
    expect(await rows(`SELECT note_id, state FROM note_vetting WHERE owner_id = '${OWNER}' ORDER BY note_id;`))
      .toEqual([...notes].sort().map(note_id => ({ note_id, state: 'accepted' })))
    expect(await count('card', `owner_id = '${OWNER}' AND suspended_at IS NULL`)).toBe(2)
    // ⚠️ The epoch still belongs to the first *grade*, not to the lesson that
    // started the word (`04` §9).
    expect(await count('scheduling_epoch')).toBe(0)
  })

  it('takes the reader\'s own words before the starter set', async () => {
    await starterWord('会う', 'N5')
    const own = await acceptedCard('経験␟けいけん')

    const run = (await lesson())!

    expect(run.positions[0]!.cardId).toBe(own)
    expect(run.positions).toHaveLength(2)
  })

  // ⚠️ Until #69 a lesson walked every *level*, easiest first. It is one
  // *category* now (ADR 0077 §1), and a reader who has chosen none is at N5.
  it('takes one level and not the next when the first runs out', async () => {
    await starterWord('概念', 'N1')
    await starterWord('経験', 'N3')
    await starterWord('会う', 'N5')
    await starterWord('映画', 'N4')

    const run = (await lesson())!

    expect(run.positions.map(p => p.level)).toEqual(['N5'])
  })

  // ⚠️ A fixed shuffle: the same words whichever request asks, so the count on
  // the control and the lesson behind it cannot disagree.
  it('offers the same words in the same order each time it is asked', async () => {
    for (let index = 0; index < 12; index += 1)
      await starterWord(`語${index}`, 'N5')

    const once = await unstartedNotes(db, OWNER, 5, N5)
    const twice = await unstartedNotes(db, OWNER, 5, N5)

    expect(once).toHaveLength(5)
    expect(twice).toEqual(once)
  })

  it('offers neither a word the reader rejected nor one they already have a card for', async () => {
    const rejected = await starterWord('嫌', 'N5')
    const started = await starterWord('既', 'N5')
    const open = await starterWord('新', 'N5')
    await client.exec(`
      INSERT INTO note_vetting (note_id, owner_id, state, vetted_at) VALUES ('${rejected}', '${OWNER}', 'rejected', now());
      INSERT INTO note_vetting (note_id, owner_id, state, vetted_at) VALUES ('${started}', '${OWNER}', 'accepted', now());
      INSERT INTO card (note_id, owner_id, template_key, suspended_at, suspended_reason)
      VALUES ('${started}', '${OWNER}', 'recognition', now(), 'flagged');
    `)

    expect(await unstartedNotes(db, OWNER, 5, N5)).toEqual([open])
    expect(await one(`SELECT state FROM note_vetting WHERE note_id = '${rejected}';`)).toEqual({ state: 'rejected' })
  })

  // ⚠️ Only what the declared *authority* places (ADR 0075 §2). A *note* with
  // no list behind it is somebody's own word, and reaches a lesson as a *card*.
  it('offers no note the list does not place, and none from the corpus the reader left', async () => {
    await client.exec(`
      INSERT INTO note (subject_id, identity_key, fields) VALUES ('jlpt-vocab-2', '無␟む', '{"term":"無"}'::jsonb);
    `)
    const old = await one<{ id: string }>(`
      INSERT INTO note (subject_id, identity_key, fields) VALUES ('jlpt-vocab', '旧␟きゅう', '{"term":"旧"}'::jsonb) RETURNING id;
    `)
    await client.exec(`INSERT INTO level_claim (note_id, authority_key, level) VALUES ('${old.id}', 'tanos-jlpt', 'N5');`)

    expect(await unstartedNotes(db, OWNER, 5, N5)).toEqual([])
  })

  it('upgrades a pending vetting row rather than refusing the word', async () => {
    const note = await starterWord('待', 'N5')
    await client.exec(`INSERT INTO note_vetting (note_id, owner_id, state) VALUES ('${note}', '${OWNER}', 'pending');`)

    expect((await lesson())!.positions).toHaveLength(1)
    expect(await one(`SELECT state FROM note_vetting WHERE note_id = '${note}';`)).toEqual({ state: 'accepted' })
  })

  it('gives each reader their own card for the same word', async () => {
    await starterWord('会う', 'N5')

    await lesson()
    await lesson(OTHER)

    expect(await rows(`SELECT owner_id FROM card ORDER BY owner_id;`)).toEqual([{ owner_id: OTHER }, { owner_id: OWNER }])
  })

  // ⚠️ *Get a word right in the quiz and it enters your reviews* — and one that
  // was not got right has no epoch, so it is simply still new.
  it('teaches a word again in the next lesson when it was not graded', async () => {
    const first = await acceptedCard('一␟いち', { minutesAgo: 2 })
    const second = await acceptedCard('二␟に', { minutesAgo: 1 })
    const run = (await lesson())!

    await recordGrade(db, OWNER, { sessionId: run.sessionId, cardId: first, grade: 3, reviewedAt: new Date() })
    await finishSession(db, OWNER, run.sessionId)

    const next = (await lesson())!

    expect(next.sessionId).not.toBe(run.sessionId)
    expect(next.positions.map(p => p.cardId)).toEqual([second])
  })

  it('carries the level the list gives a word, and none for a word no list places', async () => {
    await starterWord('会う', 'N5')
    const list = await source('word_list', '今週の単語')
    await seenIn(await acceptedCard('推し活␟おしかつ', { level: null }), list)

    const listed = (await lesson())!
    expect(listed.positions.map(p => p.level)).toEqual(['N5'])
    await finishSession(db, OWNER, listed.sessionId)

    await chooseCategory(db, OWNER, 'my-words')
    expect((await lesson())!.positions.map(p => p.level)).toEqual([null])
  })
})

// ADR 0076 §7 — a stage is read from the scheduler. What is here is that the
// snapshot carries the stage the reader **came with** and where the *grade*
// **sent** the word, both from rows.
describe('a word\'s stage, in the snapshot (ADR 0076 §7)', () => {
  it('has none for a word that has never been scheduled, and Learning once it is graded', async () => {
    const cardId = await acceptedCard('一␟いち')
    const run = (await lesson())!

    expect(run.positions[0]).toMatchObject({ stage: null, outcome: null })

    const reviewedAt = new Date()
    await recordGrade(db, OWNER, { sessionId: run.sessionId, cardId, grade: 3, reviewedAt })
    const after = (await snapshotOf(db, OWNER, run.sessionId))!.positions[0]!

    // ⚠️ The stage stays what the reader came with — none — so the summary
    // says *now Learning* rather than *stays*.
    expect(after.stage).toBeNull()
    expect(after.outcome!.stage).toBe('learning')
    expect(new Date(after.outcome!.due).getTime() - reviewedAt.getTime()).toBeGreaterThanOrEqual(DAY)
  })

  it('reads the stage a due word came with from its epoch, and keeps it after the grade', async () => {
    // `scheduled` writes 61.4 days of stability: Known.
    const cardId = await dueCard('一␟いち')
    const run = (await review())!

    expect(run.positions[0]!.stage).toBe('known')

    await recordGrade(db, OWNER, { sessionId: run.sessionId, cardId, grade: 1, reviewedAt: new Date() })
    const after = (await snapshotOf(db, OWNER, run.sessionId))!.positions[0]!
    const { stability } = await one<{ stability: number }>(`SELECT stability FROM scheduling_epoch WHERE card_id = '${cardId}';`)

    // A lapse cuts stability, and the stage follows it with no rule of its own.
    expect(stability).toBeLessThan(21)
    expect(after.stage).toBe('known')
    expect(after.outcome!.stage).toBe(stability >= 7 ? 'familiar' : 'learning')
  })
})

describe('the active category (ADR 0077)', () => {
  it('is the first declared level for a reader who has chosen none, and writes nothing to say so', async () => {
    expect(await readActiveCategory(db, OWNER)).toEqual({ key: 'jlpt:N5', ref: N5, name: 'JLPT N5' })
    expect(await count('active_category')).toBe(0)
  })

  it('is one row per reader, and a second choice replaces the first', async () => {
    expect(await chooseCategory(db, OWNER, 'jlpt:N3')).toMatchObject({ key: 'jlpt:N3', name: 'JLPT N3' })
    expect(await chooseCategory(db, OWNER, 'jlpt:N4')).toMatchObject({ key: 'jlpt:N4' })

    expect(await rows(`SELECT owner_id, category_key FROM active_category;`))
      .toEqual([{ owner_id: OWNER, category_key: 'jlpt:N4' }])
    expect((await readActiveCategory(db, OWNER)).key).toBe('jlpt:N4')
    // ⚠️ One reader's choice is not another's.
    expect((await readActiveCategory(db, OTHER)).key).toBe('jlpt:N5')
  })

  // ⚠️ The key arrives from a form. One that names no *category* — a level
  // nobody declared, a deck that is not there, *My words* with nothing in it —
  // changes nothing.
  it('refuses a key that names no category, and keeps the one before it', async () => {
    await chooseCategory(db, OWNER, 'jlpt:N3')

    for (const key of ['jlpt:N6', 'deck:0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', 'my-words', 'tech', '', undefined, 3])
      expect(await chooseCategory(db, OWNER, key), String(key)).toBeNull()

    expect((await readActiveCategory(db, OWNER)).key).toBe('jlpt:N3')
  })

  // ⚠️ **The issue's criterion in its own words: reviews are unaffected by
  // it.** What is owed is owed; a *category* over the due half would let N3
  // rot while the reader studies N5.
  it('leaves a review run alone', async () => {
    const owed = await acceptedCard('会議␟かいぎ', { minutesAgo: 10, level: 'N3' })
    await scheduled(owed, -1)
    const unlisted = await acceptedCard('推し活␟おしかつ', { level: null })
    await scheduled(unlisted, -1)

    const session = await review()

    expect(session!.positions.map(p => p.cardId).sort()).toEqual([owed, unlisted].sort())
  })

  // ⚠️ **And its other criterion: new words come only from the active
  // category.**
  it('teaches only the starter words of the active category', async () => {
    await starterWord('会う', 'N5')
    await starterWord('経験', 'N3')
    await chooseCategory(db, OWNER, 'jlpt:N3')

    const run = await lesson()

    expect(run!.positions.map(p => p.level)).toEqual(['N3'])
    // ⚠️ And only the word the lesson holds was started: the N5 one has no card.
    expect(await count('card')).toBe(1)
  })

  it('teaches the reader\'s own unscheduled cards only when they are in it', async () => {
    const atN5 = await acceptedCard('会う␟あう', { minutesAgo: 3 })
    const atN3 = await acceptedCard('経験␟けいけん', { minutesAgo: 2, level: 'N3' })
    const unlisted = await acceptedCard('推し活␟おしかつ', { minutesAgo: 1, level: null })

    expect((await lesson())!.positions.map(p => p.cardId)).toEqual([atN5])
    expect(atN3).toBeDefined()
    expect(unlisted).toBeDefined()
  })

  it('teaches the words of an imported deck, and of no other source', async () => {
    const deck = await source('anki', 'Core 2k')
    const list = await source('word_list', '今週の単語')
    const fromDeck = await acceptedCard('推し活␟おしかつ', { minutesAgo: 3, level: null })
    const fromList = await acceptedCard('沼␟ぬま', { minutesAgo: 2, level: null })
    // A word the list also carries is in the deck that taught it too.
    const both = await acceptedCard('会う␟あう', { minutesAgo: 1 })
    await seenIn(fromDeck, deck)
    await seenIn(both, deck)
    await seenIn(fromList, list)
    await starterWord('青', 'N5')

    expect(await chooseCategory(db, OWNER, `deck:${deck.id}`)).toMatchObject({ name: 'Core 2k' })

    expect((await lesson())!.positions.map(p => p.cardId)).toEqual([fromDeck, both])
  })

  it('teaches the reader\'s own words under My words', async () => {
    const deck = await source('anki', 'Core 2k')
    const list = await source('word_list', '今週の単語')
    const fromDeck = await acceptedCard('推し活␟おしかつ', { minutesAgo: 3, level: null })
    const fromList = await acceptedCard('沼␟ぬま', { minutesAgo: 2, level: null })
    await seenIn(fromDeck, deck)
    await seenIn(fromList, list)

    expect(await chooseCategory(db, OWNER, 'my-words')).toMatchObject({ key: 'my-words', name: 'My words' })

    expect((await lesson())!.positions.map(p => p.cardId)).toEqual([fromList])
  })

  // ⚠️ A word of the reader's with no *card* is started like a starter word:
  // the lesson accepts it and mints it (ADR 0076 §1).
  it('starts a word of the category that has no card yet', async () => {
    const list = await source('word_list', '今週の単語')
    const minted = await acceptedCard('沼␟ぬま', { level: null })
    await seenIn(minted, list)
    const bare = await one<{ id: string }>(`
      INSERT INTO note (subject_id, identity_key, fields)
      VALUES ('jlpt-vocab-2', '推し活␟おしかつ', '{"term":"推し活","reading":"おしかつ","meaning":"fan activities"}'::jsonb)
      RETURNING id;
    `)
    await client.exec(`
      INSERT INTO occurrence (note_id, source_id, source_chunk_id, char_start, char_end, surface_form)
      VALUES ('${bare.id}', '${list.id}', '${list.chunkId}', 0, 2, '推し活');
    `)
    await chooseCategory(db, OWNER, 'my-words')

    const run = (await lesson())!

    expect(run.positions).toHaveLength(2)
    expect(run.positions[0]!.cardId).toBe(minted)
    expect(await count('card', `note_id = '${bare.id}' AND owner_id = '${OWNER}'`)).toBe(1)
  })

  // ⚠️ `S11`: a deleted *source* is no longer a *category*, so the reader is
  // back at the default rather than in a lesson that can never hold a word.
  it('falls back to the first level once its deck is deleted', async () => {
    const deck = await source('anki', 'Core 2k')
    await chooseCategory(db, OWNER, `deck:${deck.id}`)
    await starterWord('会う', 'N5')

    await client.exec(`UPDATE source SET deleted_at = now() WHERE id = '${deck.id}';`)

    expect((await readActiveCategory(db, OWNER)).key).toBe('jlpt:N5')
    expect((await lesson())!.positions.map(p => p.level)).toEqual(['N5'])
    // ⚠️ Nothing is written on a read: the row still names the deck.
    expect(await rows(`SELECT category_key FROM active_category;`)).toEqual([{ category_key: `deck:${deck.id}` }])
  })

  // PRD §5: the snapshot wins. A lesson already composed keeps its words.
  it('leaves a lesson already composed as it was', async () => {
    await starterWord('会う', 'N5')
    await starterWord('経験', 'N3')
    const before = (await lesson())!

    await chooseCategory(db, OWNER, 'jlpt:N3')
    const resumed = (await lesson())!

    expect(resumed.sessionId).toBe(before.sessionId)
    expect(resumed.positions.map(p => p.level)).toEqual(['N5'])
  })
})

describe('one grade (`S7`, ADR 0016, `04` §7.4, §7.5)', () => {
  async function session(cards = 1) {
    for (let index = 0; index < cards; index += 1)
      await acceptedCard(`${index}␟${index}`, { minutesAgo: cards - index })

    // A lesson of the reader's own words: the run whose *grade* is a first one.
    return (await lesson())!
  }

  function grade(sessionId: string, cardId: string, given: Grade = 3, reviewedAt = new Date()) {
    return recordGrade(db, OWNER, { sessionId, cardId, grade: given, reviewedAt })
  }

  // ⚠️ **The epoch is minted here and nowhere earlier.**
  // `scheduling_epoch.card_id` is `RESTRICT` (`04` §9), so one written at
  // acceptance would make ADR 0033's `Z` fail on every acceptance the
  // application ever makes. `test/schema/vet.test.ts` asserts that absence; this
  // is the other half of the same sentence.
  it('mints the card\'s first scheduling epoch, at ordinal 1', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId

    expect(await count('scheduling_epoch')).toBe(0)

    await grade(run.sessionId, cardId, 3)

    const epochs = await rows<{ ordinal: number, state: number, reps: number }>(`
      SELECT ordinal, state, reps FROM scheduling_epoch WHERE card_id = '${cardId}';
    `)

    expect(epochs).toHaveLength(1)
    expect(epochs[0]!.ordinal).toBe(1)
    // With `enable_short_term` off the library "skips the learning phase and
    // moves cards directly into the review state" (ADR 0016).
    expect(epochs[0]!.state).toBe(2)
    expect(epochs[0]!.reps).toBe(1)
  })

  // ⚠️ **The soonest a graded *card* comes back is tomorrow** (verification
  // §13.1), which is what makes a *session* a fixed size and what retired the
  // word "Again" (ADR 0034). This is the configuration assertion at the far end
  // of the wire from `test/unit/review-scheduler.test.ts`'s.
  it.each([1, 2, 3, 4] as const)('schedules grade %i at least a day out', async (given) => {
    const run = await session()
    const reviewedAt = new Date()

    await grade(run.sessionId, run.positions[0]!.cardId, given, reviewedAt)

    const { due } = await one<{ due: Date }>(`SELECT due FROM scheduling_epoch LIMIT 1;`)

    expect(due.getTime() - reviewedAt.getTime()).toBeGreaterThanOrEqual(DAY)
  })

  it('moves the live epoch rather than opening a second one', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId
    const epochId = await scheduled(cardId, -1)

    await grade(run.sessionId, cardId, 3)

    expect(await count('scheduling_epoch')).toBe(1)
    const { reps, id } = await one<{ reps: number, id: string }>(`
      SELECT id, reps FROM scheduling_epoch WHERE card_id = '${cardId}';
    `)
    expect(id).toBe(epochId)
    expect(reps).toBe(8)
  })

  // ⚠️ **The two timestamps are not redundant** (`04` §7.5): `reviewed_at` feeds
  // the scheduler and `received_at` feeds `03` §12's *time-to-first-review*.
  // **The server never stamps a *grade* on receipt** (ADR 0007) — a *card*
  // answered at 09:00 underground and flushed at 18:00 must not tell the
  // scheduler that recall took nine hours.
  it('writes the reader\'s stamp and the server\'s, and does not confuse them', async () => {
    const run = await session()
    const reviewedAt = new Date(Date.now() - 90_000)

    await grade(run.sessionId, run.positions[0]!.cardId, 2, reviewedAt)

    const log = await one<{ reviewed_at: Date, received_at: Date, clock_skew_seconds: number, rating: number, state: number }>(`
      SELECT reviewed_at, received_at, clock_skew_seconds, rating, state FROM review_log;
    `)

    expect(log.reviewed_at.getTime()).toBe(reviewedAt.getTime())
    expect(log.received_at.getTime()).toBeGreaterThan(reviewedAt.getTime())
    expect(log.clock_skew_seconds).toBeGreaterThanOrEqual(89)
    expect(log.rating).toBe(2)
    // `04` §7.5: the state **before** the grade. A first review starts New.
    expect(log.state).toBe(0)
  })

  // ⚠️ **A graded *card* leaves the *session* and never returns to it** (`S7`,
  // ADR 0016) — which is what lets the *progress rail* know its own length.
  it('takes the card out of the run and leaves the rest', async () => {
    const run = await session(3)

    await grade(run.sessionId, run.positions[1]!.cardId, 4)

    const after = (await snapshotOf(db, OWNER, run.sessionId))!

    expect(after.positions.map(p => p.grade)).toEqual([null, 4, null])
  })

  // ⚠️ **A replay carrying the same stamp is a held key or a lost
  // acknowledgement**, not a second answer — and it must not write a second
  // irreplaceable row or schedule the *card* twice.
  it('answers `already_graded` to an entry replayed at the same instant', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId
    const given = new Date()

    await grade(run.sessionId, cardId, 1, given)
    const { due: first } = await one<{ due: Date }>('SELECT due FROM scheduling_epoch LIMIT 1;')

    const outcome = await grade(run.sessionId, cardId, 4, given)

    expect(outcome).toEqual({ ok: false, reason: 'already_graded' })
    expect(await count('review_log')).toBe(1)
    const { due: unchanged } = await one<{ due: Date }>('SELECT due FROM scheduling_epoch LIMIT 1;')
    expect(unchanged.getTime()).toBe(first.getTime())
  })

  // ⚠️ **PRD §5: *the same card graded twice — both replay; the later timestamp
  // wins*.** `04` §7.5's trigger refuses an `UPDATE` and a `DELETE`, so *later
  // wins* can only ever mean *the later one is also written* — the first row
  // stands, the epoch moves on, and `snapshotOf` reads the rows in stamp order
  // so the rail shows the answer the reader gave last
  // ([ADR 0055](../../docs/adr/0055-later-wins-is-a-second-row-because-review-log-cannot-be-rewritten.md)).
  it('records a genuinely later grade for the same card, and lets it win', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId
    const first = new Date()

    await grade(run.sessionId, cardId, 1, first)
    const outcome = await grade(run.sessionId, cardId, 4, new Date(first.getTime() + 60_000))

    expect(outcome.ok).toBe(true)
    expect(await count('review_log'), 'the first grade was taken back').toBe(2)

    const after = (await snapshotOf(db, OWNER, run.sessionId))!
    expect(after.positions[0]!.grade).toBe(4)

    // One *card*, one epoch: a second answer moves the life it is in rather than
    // starting a new one (`04` §7.4 — a reset is the insert, and this is not a
    // reset).
    expect(await count('scheduling_epoch')).toBe(1)
    const { reps } = await one<{ reps: number }>('SELECT reps FROM scheduling_epoch LIMIT 1;')
    expect(reps).toBe(2)
  })

  it('refuses a card the session does not hold, and one belonging to someone else', async () => {
    const run = await session()
    const elsewhere = await acceptedCard('外␟そと')
    const theirs = await acceptedCard('他␟た', { owner: OTHER })

    expect(await grade(run.sessionId, elsewhere)).toEqual({ ok: false, reason: 'not_in_session' })
    expect(await recordGrade(db, OTHER, {
      sessionId: run.sessionId,
      cardId: run.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(),
    })).toEqual({ ok: false, reason: 'not_in_session' })
    expect(await count('review_log')).toBe(0)
    expect(theirs).toBeDefined()
  })
})

describe('the end of the run (`09` §4.7 step 6, `04` §7.6)', () => {
  it('stamps `completed_at` when the last position is answered, and not before', async () => {
    await acceptedCard('一␟いち', { minutesAgo: 2 })
    await acceptedCard('二␟に', { minutesAgo: 1 })
    const run = (await lesson())!

    await recordGrade(db, OWNER, {
      sessionId: run.sessionId,
      cardId: run.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(),
    })

    expect(await count('review_session', 'completed_at is not null')).toBe(0)

    await recordGrade(db, OWNER, {
      sessionId: run.sessionId,
      cardId: run.positions[1]!.cardId,
      grade: 3,
      reviewedAt: new Date(),
    })

    expect(await count('review_session', 'completed_at is not null')).toBe(1)
  })

  // ⚠️ **Finishing is not starting** (`S7`): the summary shows the run's
  // numbers and **never** starts the next one. Nothing on the *grade* path
  // composes, so the *session* count after the last answer is still one.
  it('starts nothing when it ends', async () => {
    await dueCard('一␟いち')
    await dueCard('二␟に')
    const run = (await review(1))!

    await recordGrade(db, OWNER, {
      sessionId: run.sessionId,
      cardId: run.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(),
    })

    expect(await count('review_session')).toBe(1)
  })

  // And the next one is composed only when the reader asks — from what is left.
  it('composes the next run from what the first one did not take', async () => {
    const cards = [await dueCard('一␟いち'), await dueCard('二␟に')]
    const run = (await review(1))!
    const taken = run.positions[0]!.cardId

    await recordGrade(db, OWNER, { sessionId: run.sessionId, cardId: taken, grade: 3, reviewedAt: new Date() })

    const next = (await review())!

    expect(next.sessionId).not.toBe(run.sessionId)
    // The graded *card* is a day out, so what is left is the one not taken.
    expect(next.positions.map(p => p.cardId)).toEqual(cards.filter(cardId => cardId !== taken))
  })
})

// ADR 0076 §6 — *Finish early*: the run is stamped complete with whatever it
// holds, and it answers no position.
describe('finishing early (ADR 0076 §6)', () => {
  it('stamps the run complete and grades nothing', async () => {
    await dueCard('一␟いち')
    await dueCard('二␟に')
    const run = (await review())!

    const finished = await finishSession(db, OWNER, run.sessionId)

    expect(finished!.sessionId).toBe(run.sessionId)
    expect(await count('review_session', 'completed_at is not null')).toBe(1)
    expect(await count('review_log')).toBe(0)
    // What was not reached is still due, and the next run holds it.
    expect((await review())!.positions).toHaveLength(2)
  })

  it('keeps the grades given before it', async () => {
    const cardId = await dueCard('一␟いち')
    await dueCard('二␟に')
    const run = (await review())!

    await recordGrade(db, OWNER, { sessionId: run.sessionId, cardId, grade: 1, reviewedAt: new Date() })
    const finished = (await finishSession(db, OWNER, run.sessionId))!

    expect(finished.positions.find(p => p.cardId === cardId)!.grade).toBe(1)
    expect(await count('review_log')).toBe(1)
  })

  // A replay of the entry, or a tab left open: nothing is stamped twice.
  it('is harmless twice, and does nothing to a run that is somebody else\'s', async () => {
    await dueCard('一␟いち')
    const run = (await review())!

    expect(await finishSession(db, OTHER, run.sessionId)).toBeNull()
    expect(await count('review_session', 'completed_at is not null')).toBe(0)

    await finishSession(db, OWNER, run.sessionId)
    const { completed_at: first } = await one<{ completed_at: Date }>(`SELECT completed_at FROM review_session;`)
    await finishSession(db, OWNER, run.sessionId)
    const { completed_at: second } = await one<{ completed_at: Date }>(`SELECT completed_at FROM review_session;`)

    expect(second.getTime()).toBe(first.getTime())
  })

  it('answers nothing for a run that does not exist', async () => {
    expect(await finishSession(db, OWNER, '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBeNull()
  })
})

// The screen before a run names when the next word is due, and tells a first
// visit — nothing ever scheduled — from a quiet day (`shared/review/offer.ts`).
describe('when the next word is due', () => {
  it('is nothing for a reader with nothing scheduled', async () => {
    await acceptedCard('一␟いち')

    expect(await nextDueAt(db, OWNER)).toBeNull()
  })

  it('names the soonest live epoch, in the future or already past', async () => {
    await scheduled(await acceptedCard('一␟いち'), 3)
    await scheduled(await acceptedCard('二␟に'), 1)

    const next = (await nextDueAt(db, OWNER))!

    expect(next.getTime()).toBeGreaterThan(Date.now())
    expect(next.getTime()).toBeLessThan(Date.now() + 2 * DAY)

    await dueCard('三␟さん')
    expect((await nextDueAt(db, OWNER))!.getTime()).toBeLessThan(Date.now())
  })

  it('ignores a suspended card, and another reader\'s', async () => {
    await scheduled(await acceptedCard('一␟いち', { suspended: true }), 1)
    await scheduled(await acceptedCard('二␟に', { owner: OTHER }), 1, OTHER)

    expect(await nextDueAt(db, OWNER)).toBeNull()
  })
})

// ADR 0066 — the brake, as rows. The arithmetic has its own unit tests; what is
// here is that the allowance is **read from `review_session.new_count` and
// written by the composition**, that the gate counts the whole due set rather
// than a session's worth, that the zone is stored — and, since ADR 0076 §2,
// that all three numbers are the reader's own.
describe('the review-load brake (ADR 0066, #21, ADR 0076 §2)', () => {
  async function newWords(n: number) {
    for (let index = 0; index < n; index += 1)
      await acceptedCard(`新${index}␟しん${index}`, { minutesAgo: n - index })
  }

  async function overdue(n: number) {
    for (let index = 0; index < n; index += 1)
      await scheduled(await acceptedCard(`古${index}␟ふる${index}`), -1)
  }

  /** Close the live run the way a finished one is closed, without grading it. */
  async function finish() {
    await client.exec(`UPDATE review_session SET completed_at = now() WHERE completed_at IS NULL;`)
  }

  it('teaches five a lesson, and writes how many on the session', async () => {
    await newWords(15)

    const run = (await lesson())!

    expect(run.positions).toHaveLength(5)
    expect(await one<{ new_count: number }>(`SELECT new_count FROM review_session;`))
      .toEqual({ new_count: 5 })
  })

  // ⚠️ **Counted at composition, not from first epochs.** Nothing here is
  // graded, so a count of `ordinal = 1` epochs would say the day is untouched.
  it('spends the day on what was offered, so an unanswered lesson still counts', async () => {
    await newWords(15)

    await lesson()
    await finish()
    expect((await lesson())!.positions).toHaveLength(5)
    expect(await count('scheduling_epoch')).toBe(0)

    await finish()
    expect(await lesson()).toBeNull()
    expect(await brakeReading(db, OWNER, 'UTC')).toEqual({ introducedToday: 10, dueCount: 0 })
  })

  it('offers what is left of the day when that is less than a lesson', async () => {
    await newWords(15)
    await writeLimits(db, OWNER, { lessonSize: 5, dailyNew: 7, pauseAbove: 50 })

    await lesson()
    await finish()

    expect((await lesson())!.positions).toHaveLength(2)
  })

  // ⚠️ **A brake that is silent is a bug report** (ADR 0066 §7): the offer says
  // that words are waiting and none is on offer, which is what lets the screen
  // say *why*.
  it('tells held back apart from nothing left', async () => {
    await newWords(12)

    expect(await offerOf(db, OWNER, 'UTC')).toMatchObject({ lesson: 5, waiting: true, introducedToday: 0 })

    await lesson()
    await finish()
    await lesson()
    await finish()

    expect(await offerOf(db, OWNER, 'UTC')).toMatchObject({ lesson: 0, waiting: true, introducedToday: 10 })
  })

  it('says nothing is waiting when no new word is', async () => {
    await overdue(1)

    expect(await offerOf(db, OWNER, 'UTC')).toMatchObject({ lesson: 0, waiting: false, dueCount: 1 })
  })

  it('counts the starter words in what a lesson would hold', async () => {
    await starterWord('会う', 'N5')
    await starterWord('青', 'N5')
    await newWords(1)

    expect((await offerOf(db, OWNER, 'UTC')).lesson).toBe(3)
    // ⚠️ Asking is not starting: nothing was accepted and nothing minted.
    expect(await count('note_vetting', `owner_id = '${OWNER}'`)).toBe(1)
    expect(await count('card')).toBe(1)
  })

  // ADR 0077 §1: the count is of the active *category*, and the offer names
  // it so the screen can.
  it('counts in the active category, names it, and says when it has nothing left', async () => {
    await starterWord('会う', 'N5')

    expect(await offerOf(db, OWNER, 'UTC'))
      .toMatchObject({ lesson: 1, waiting: true, category: { key: 'jlpt:N5', name: 'JLPT N5' } })

    await chooseCategory(db, OWNER, 'jlpt:N1')

    expect(await offerOf(db, OWNER, 'UTC'))
      .toMatchObject({ lesson: 0, waiting: false, category: { key: 'jlpt:N1', name: 'JLPT N1' } })
  })

  // ⚠️ **A run composed yesterday does not spend today.** The window the query
  // reads is wider than a day on purpose; which runs are *today* is the local
  // day's rule, in the reader's zone.
  it('gives a new day a new allowance', async () => {
    await newWords(15)
    await lesson()
    await finish()
    await lesson()
    await finish()
    await client.exec(`UPDATE review_session SET started_at = now() - interval '30 hours';`)

    expect((await lesson())!.positions).toHaveLength(5)
  })

  it('starts no lesson at fifty due, and the review run holds no new word', async () => {
    await overdue(50)
    await newWords(3)

    expect(await lesson()).toBeNull()
    expect(await count('review_session')).toBe(0)

    const run = (await review(200))!

    expect(run.positions).toHaveLength(50)
    expect(await one<{ new_count: number }>(`SELECT new_count FROM review_session;`))
      .toEqual({ new_count: 0 })
    expect((await brakeReading(db, OWNER, 'UTC')).dueCount).toBe(50)
  })

  it('starts a lesson at forty-nine due', async () => {
    await overdue(49)
    await newWords(3)

    expect((await lesson())!.positions).toHaveLength(3)
  })

  it('moves the gate with the reader\'s setting', async () => {
    await overdue(3)
    await newWords(2)
    await writeLimits(db, OWNER, { lessonSize: 5, dailyNew: 10, pauseAbove: 3 })

    expect(await lesson()).toBeNull()

    await writeLimits(db, OWNER, { lessonSize: 5, dailyNew: 10, pauseAbove: 4 })

    expect((await lesson())!.positions).toHaveLength(2)
  })

  it('starts no lesson for a reader who set no new words a day', async () => {
    await newWords(2)
    await writeLimits(db, OWNER, { lessonSize: 5, dailyNew: 0, pauseAbove: 50 })

    expect(await lesson()).toBeNull()
    expect(await offerOf(db, OWNER, 'UTC')).toMatchObject({ lesson: 0, waiting: true })
  })

  // ⚠️ **The due read lost its `LIMIT size`** — the gate and the order both
  // need the whole set, and the session size is the composition's to apply.
  it('reads every due card, not a session\'s worth', async () => {
    await overdue(25)

    expect(await dueCards(db, OWNER)).toHaveLength(25)
  })

  // ADR 0066 §5, against real epochs: when the backlog is larger than the run,
  // the least remembered is studied first — here the shaky card due yesterday
  // over the sturdy one three weeks late.
  it('takes the least remembered card first when the backlog is bigger than the run', async () => {
    const sturdy = await acceptedCard('丈␟じょう')
    const shaky = await acceptedCard('脆␟もろ')
    await client.exec(`
      INSERT INTO scheduling_epoch
        (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days, reps, lapses, state, last_review)
      VALUES
        ('${sturdy}', '${OWNER}', 1, now() - interval '21 days', 200, 5, 180, 8, 0, 2, now() - interval '201 days'),
        ('${shaky}', '${OWNER}', 1, now() - interval '1 day', 2.3, 7, 3, 2, 1, 2, now() - interval '4 days');
    `)

    const run = (await review(1))!

    expect(run.positions.map(p => p.cardId)).toEqual([shaky])
  })

  it('stores the reader\'s zone on the run, and /stats reads the newest one', async () => {
    await newWords(2)

    expect(await readerZone(db, OWNER)).toBe('UTC')

    await lesson(OWNER, 'Asia/Tokyo')
    await finish()
    await lesson()

    expect(await rows(`SELECT zone FROM review_session ORDER BY started_at;`))
      .toEqual([{ zone: 'Asia/Tokyo' }, { zone: null }])
    expect(await readerZone(db, OWNER)).toBe('Asia/Tokyo')
  })

  it('reads the offer for the summary only once the run is over', async () => {
    await newWords(1)
    const run = (await lesson())!

    expect(await offerIfFinished(db, OWNER, run)).toBeNull()
    expect(await offerIfFinished(db, OWNER, {
      ...run,
      positions: run.positions.map(position => ({ ...position, grade: 3 as Grade })),
    })).toMatchObject({ introducedToday: 1, dueCount: 0, limits: DEFAULT_LIMITS })
    // ADR 0076 §6: a run finished early is over, whatever is unanswered in it.
    expect(await offerIfFinished(db, OWNER, run, true)).toMatchObject({ introducedToday: 1 })
  })

  // ⚠️ The summary's control starts the next lesson from the reader's active
  // *category*, so its count is read in the same one — as it stands when the
  // run ends, and not as it stood when the run was composed.
  it('counts the summary\'s lesson in the category that is active when the run ends', async () => {
    await starterWord('会う', 'N5')
    await starterWord('食べる', 'N5')
    await starterWord('経済', 'N3')
    const run = (await lesson())!

    // Left unfinished, so its two words are still new and still on offer.
    expect(await offerIfFinished(db, OWNER, run, true)).toMatchObject({ lesson: 2, waiting: true })

    await chooseCategory(db, OWNER, 'jlpt:N3')
    expect(await offerIfFinished(db, OWNER, run, true))
      .toMatchObject({ lesson: 1, waiting: true, category: { name: 'JLPT N3' } })

    await chooseCategory(db, OWNER, 'jlpt:N1')
    expect(await offerIfFinished(db, OWNER, run, true)).toMatchObject({ lesson: 0, waiting: false })
  })
})

describe('the study settings (ADR 0076 §2, `04` §7.10)', () => {
  it('is the defaults for a reader with no row, and reading writes none', async () => {
    expect(await readLimits(db, OWNER)).toEqual(DEFAULT_LIMITS)
    expect(await count('study_setting')).toBe(0)
  })

  it('stores what the form sent, clamped, as the reader\'s one row', async () => {
    expect(await writeLimits(db, OWNER, { lessonSize: '8', dailyNew: '999', pauseAbove: '' }))
      .toEqual({ lessonSize: 8, dailyNew: 100, pauseAbove: 50 })
    await writeLimits(db, OWNER, { lessonSize: 3, dailyNew: 0, pauseAbove: 75 })

    expect(await count('study_setting')).toBe(1)
    expect(await readLimits(db, OWNER)).toEqual({ lessonSize: 3, dailyNew: 0, pauseAbove: 75 })
    expect(await readLimits(db, OTHER)).toEqual(DEFAULT_LIMITS)
  })

  // ⚠️ The checks are a floor; the ceiling is the clamp's, on the way out too.
  it('clamps a row that is wider than the form would have taken', async () => {
    await client.exec(`
      INSERT INTO study_setting (owner_id, lesson_size, daily_new, pause_above) VALUES ('${OWNER}', 150, 5000, 90000);
    `)

    expect(await readLimits(db, OWNER)).toEqual({ lessonSize: 20, dailyNew: 100, pauseAbove: 2000 })
  })

  it.each([
    ['a lesson of none', 'lesson_size', 0],
    ['a negative day', 'daily_new', -1],
    ['a gate at nothing', 'pause_above', 0],
  ])('refuses %s at the table', async (_, column, value) => {
    await expect(client.exec(`
      INSERT INTO study_setting (owner_id, ${column}) VALUES ('${OWNER}', ${value});
    `)).rejects.toThrow(/study_setting_/)
  })

  it('refuses a kind of session that is neither', async () => {
    await expect(client.exec(`
      INSERT INTO review_session (owner_id, size, kind) VALUES ('${OWNER}', 1, 'cram');
    `)).rejects.toThrow(/review_session_kind/)
  })
})

// `S9`'s `X` — **four things in one transaction** (`04` §7.8, `09` §4.9), and
// the fifth thing is the absence of a fifth write.
//
// ⚠️ **`review_log` is untouched**, which is the whole of "catching a bad *card*
// costs the *card* and not the record". Nothing here writes a review, an epoch
// or a rating.
describe('the flag (`S9`, `04` §7.8)', () => {
  async function session(cards = 1) {
    for (let index = 0; index < cards; index += 1)
      await acceptedCard(`${index}␟${index}`, { minutesAgo: cards - index })

    // A lesson of the reader's own words: the run whose *grade* is a first one.
    return (await lesson())!
  }

  /** A *note* with the run that generated it, so `04` §7.8 has three things to copy. */
  async function generated(cardId: string): Promise<{ sourceId: string, noteId: string }> {
    const { noteId } = await one<{ noteId: string }>(
      `SELECT note_id AS "noteId" FROM card WHERE id = '${cardId}';`,
    )
    const source = await one<{ id: string }>(`
      INSERT INTO source (subject_id, title, content, content_hash, char_count)
      VALUES ('jlpt-vocab-2', '朝日新聞 社説', '駅の近くに図書館があります。', 'a3f9', 14)
      RETURNING id;
    `)
    const ingestion = await one<{ id: string }>(`
      INSERT INTO ingestion (source_id, source_title, subject_id, model_id, prompt_version)
      VALUES ('${source.id}', '朝日新聞 社説', 'jlpt-vocab-2', 'the-run-model', 'v0')
      RETURNING id;
    `)

    await client.exec(`
      UPDATE note SET origin_ingestion_id = '${ingestion.id}' WHERE id = '${noteId}';
      INSERT INTO note_field_provenance (note_id, field_name, kind, model_id, prompt_version)
      VALUES ('${noteId}', 'meaning', 'generated', 'claude-sonnet-5', 'v3'),
             ('${noteId}', 'term', 'lookup', null, null);
    `)

    return { sourceId: source.id, noteId }
  }

  it('writes the flag, suspends the card, returns the note to the queue — and no review', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId
    const { sourceId, noteId } = await generated(cardId)

    const outcome = await recordFlag(db, OWNER, { sessionId: run.sessionId, cardId })

    expect(outcome.ok).toBe(true)

    const flag = await one<{
      sourceId: string
      promptVersion: string
      modelId: string
      reviewSessionId: string
      noteId: string
    }>(`
      SELECT source_id AS "sourceId", prompt_version AS "promptVersion", model_id AS "modelId",
             review_session_id AS "reviewSessionId", note_id AS "noteId"
      FROM card_flag;
    `)

    // ⚠️ **Denormalised at flag time** (ADR 0004): without the prompt version the
    // reader learns *some cards are bad* rather than *prompt v3 writes bad
    // example sentences*, and only the second is actionable.
    expect(flag).toEqual({
      sourceId,
      noteId,
      promptVersion: 'v3',
      modelId: 'claude-sonnet-5',
      reviewSessionId: run.sessionId,
    })

    const card = await one<{ suspendedAt: Date | null, reason: string | null }>(`
      SELECT suspended_at AS "suspendedAt", suspended_reason AS "reason" FROM card WHERE id = '${cardId}';
    `)
    expect(card.suspendedAt).not.toBeNull()
    expect(card.reason).toBe('flagged')

    expect(await count('note_vetting', 'flagged_at is not null')).toBe(1)
    // ⚠️ **The state is left alone** (`04` §11): the queue finds a flagged *note*
    // through `card_flag … WHERE resolved_at IS NULL`, and flipping it back to
    // `pending` would take it out of the denominator of both *acceptance rate*
    // and *false-accept rate*.
    expect(await count('note_vetting', `state = 'accepted'`)).toBe(1)
  })

  // ⚠️ **The assertion this whole feature is measured by** — `S9`, `04` §7.8.
  it('leaves review history standing', async () => {
    const run = await session(2)
    await recordGrade(db, OWNER, {
      sessionId: run.sessionId,
      cardId: run.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(),
    })

    await recordFlag(db, OWNER, { sessionId: run.sessionId, cardId: run.positions[1]!.cardId })

    expect(await count('review_log')).toBe(1)
    expect(await count('scheduling_epoch')).toBe(1)
  })

  // ⚠️ **A replayed entry is not a second flag, and the two are opposites.**
  // `11` §3's "a second flag is a second row" is about a **reader** flagging the
  // same *card* twice; an outbox retry whose acknowledgement was lost is one
  // flag arriving twice, and counting it inflates `count(card_flag)` — the
  // numerator of *false-accept rate*, which is the metric ADR 0056 exists to
  // protect.
  it('answers `already_flagged` to the same entry replayed, and writes one row', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId

    await recordFlag(db, OWNER, { sessionId: run.sessionId, cardId })
    const { suspendedAt } = await one<{ suspendedAt: Date }>(
      `SELECT suspended_at AS "suspendedAt" FROM card WHERE id = '${cardId}';`,
    )

    const outcome = await recordFlag(db, OWNER, { sessionId: run.sessionId, cardId })

    expect(outcome).toEqual({ ok: false, reason: 'already_flagged' })
    expect(await count('card_flag')).toBe(1)
    const again = await one<{ suspendedAt: Date }>(
      `SELECT suspended_at AS "suspendedAt" FROM card WHERE id = '${cardId}';`,
    )
    expect(again.suspendedAt.getTime()).toBe(suspendedAt.getTime())
  })

  // ⚠️ **And a genuine second flag is a second row** (`11` §3). Deduplicating
  // that would under-report exactly the signal `S9` exists for. It is a
  // different *session*, which is what the guard above keys on — and it is
  // written by hand here because a suspended *card* is never composed into a
  // run, so reaching it needs the re-vetting path that ADR 0056 defers.
  it('writes a second row for a flag given in a later session', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId

    await recordFlag(db, OWNER, { sessionId: run.sessionId, cardId })

    const later = await one<{ id: string }>(`
      INSERT INTO review_session (owner_id, size) VALUES ('${OWNER}', 1) RETURNING id;
    `)
    await client.exec(`
      INSERT INTO review_session_card (review_session_id, ordinal, card_id, owner_id)
      VALUES ('${later.id}', 0, '${cardId}', '${OWNER}');
    `)

    const outcome = await recordFlag(db, OWNER, { sessionId: later.id, cardId })

    expect(outcome.ok).toBe(true)
    expect(await count('card_flag')).toBe(2)
  })

  // ⚠️ **A flag is an answer** (`shared/review/snapshot.ts`). `09` §4.9: a
  // twenty-*card* run can end with nineteen *grades*, and a `completed_at` left
  // null would resume it onto a *card* the reader has already passed — whose
  // *card* is now suspended.
  it('ends a run whose last position was flagged rather than graded', async () => {
    const run = await session(2)
    await recordGrade(db, OWNER, {
      sessionId: run.sessionId,
      cardId: run.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(),
    })

    await recordFlag(db, OWNER, { sessionId: run.sessionId, cardId: run.positions[1]!.cardId })

    expect(await count('review_session', 'completed_at is null')).toBe(0)

    const after = (await snapshotOf(db, OWNER, run.sessionId))!
    expect(after.positions.map(p => p.flagged)).toEqual([false, true])
    expect(after.positions[1]!.grade).toBeNull()
  })

  it('refuses a card the session does not hold, and one belonging to someone else', async () => {
    const run = await session()
    const elsewhere = await acceptedCard('外␟そと')

    expect(await recordFlag(db, OWNER, { sessionId: run.sessionId, cardId: elsewhere }))
      .toEqual({ ok: false, reason: 'not_in_session' })
    expect(await recordFlag(db, OTHER, {
      sessionId: run.sessionId,
      cardId: run.positions[0]!.cardId,
    })).toEqual({ ok: false, reason: 'not_in_session' })
    expect(await count('card_flag')).toBe(0)
  })

  // ⚠️ A *card* with no generation behind it still flags. Every one of the three
  // copied columns is nullable because `04` §9 makes both joins `SET NULL` — the
  // signal survives the thing it is a fact about.
  it('flags a card whose source was hard-deleted', async () => {
    const run = await session()

    await recordFlag(db, OWNER, { sessionId: run.sessionId, cardId: run.positions[0]!.cardId })

    const flag = await one<{ sourceId: string | null, modelId: string | null }>(
      'SELECT source_id AS "sourceId", model_id AS "modelId" FROM card_flag;',
    )
    expect(flag).toEqual({ sourceId: null, modelId: null })
  })
})

// `03` §8.2 — what the server does with a stamp it cannot trust. The rule is a
// pure function (`test/unit/review-stamp.test.ts`); what is here is that it runs
// **in front of the row**, because `review_log` cannot be corrected afterwards.
describe('a stamp the server cannot trust (`03` §8.2)', () => {
  async function run() {
    await acceptedCard('一␟いち')
    return (await lesson())!
  }

  it('refuses a grade stamped an hour into the future, and writes nothing', async () => {
    const session = await run()

    const outcome = await recordGrade(db, OWNER, {
      sessionId: session.sessionId,
      cardId: session.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    expect(outcome).toEqual({ ok: false, reason: 'stamped_in_future' })
    expect(await count('review_log')).toBe(0)
    expect(await count('scheduling_epoch'), 'a refused grade minted an epoch').toBe(0)
  })

  it('refuses a grade stamped before its own snapshot was taken', async () => {
    const session = await run()

    const outcome = await recordGrade(db, OWNER, {
      sessionId: session.sessionId,
      cardId: session.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(Date.now() - 60 * 60 * 1000),
    })

    expect(outcome).toEqual({ ok: false, reason: 'stamped_before_snapshot' })
    expect(await count('review_log')).toBe(0)
  })

  // ⚠️ **A *session* answered underground and flushed hours later is the story**
  // (`S8`), so lateness is never the thing refused.
  it('takes a grade given inside the run and flushed much later', async () => {
    const session = await run()

    const outcome = await recordGrade(db, OWNER, {
      sessionId: session.sessionId,
      cardId: session.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(),
    })

    expect(outcome.ok).toBe(true)
    expect(await count('review_log')).toBe(1)
  })
})

// ADR 0069 §3: what the check is run against. ⚠️ **Nothing adds a synonym since
// ADR 0076 §5** — there is no manual override — and the ones stored before are
// still read, so an answer that was accepted then is accepted now.
describe('accepted meanings and stored synonyms (ADR 0069, ADR 0076 §5)', () => {
  async function session() {
    await acceptedCard('見る␟みる', { fields: { ...FIELDS, term: '見る', reading: 'みる', meaning: 'to see/have (a dream)' } })

    return (await lesson())!
  }

  it('hands the snapshot the note\'s list, and an empty one when there is none', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId

    expect((await snapshotOf(db, OWNER, run.sessionId))!.positions[0]).toMatchObject({ meanings: [], synonyms: [] })

    await client.exec(`
      INSERT INTO note_meaning (note_id, meanings, model_id, prompt_version)
      VALUES ('${await noteOf(cardId)}', ARRAY['see', 'look', 'watch', 'view'], 'claude-sonnet-5', 'v5');
    `)

    expect((await snapshotOf(db, OWNER, run.sessionId))!.positions[0]!.meanings).toEqual(['see', 'look', 'watch', 'view'])
  })

  it('still hands over a synonym the reader stored before, and nobody else\'s', async () => {
    const run = await session()
    const noteId = await noteOf(run.positions[0]!.cardId)

    await client.exec(`
      INSERT INTO meaning_synonym (owner_id, note_id, text) VALUES ('${OWNER}', '${noteId}', 'look');
      INSERT INTO meaning_synonym (owner_id, note_id, text) VALUES ('${OTHER}', '${noteId}', 'gaze');
    `)

    expect((await snapshotOf(db, OWNER, run.sessionId))!.positions[0]!.synonyms).toEqual(['look'])
  })

  it('refuses an empty list and a blank synonym at the table', async () => {
    const run = await session()
    const noteId = await noteOf(run.positions[0]!.cardId)

    await expect(client.exec(`
      INSERT INTO note_meaning (note_id, meanings, model_id, prompt_version)
      VALUES ('${noteId}', ARRAY[]::text[], 'm', 'v5');
    `)).rejects.toThrow(/note_meaning_not_empty/)
    await expect(client.exec(`
      INSERT INTO meaning_synonym (owner_id, note_id, text) VALUES ('${OWNER}', '${noteId}', '   ');
    `)).rejects.toThrow(/meaning_synonym_text/)
  })
})

// ADR 0069 §5, #30: the server computes each position's kanji readings from the
// committed KANJIDIC2 table, so the client never loads it. ⚠️ **The one test that
// reads the real table**, and it asks only what no refresh will change: that 夢
// can be read む.
describe('kanji readings at composition (ADR 0069 §5)', () => {
  it('hands the snapshot the term\'s kanji readings, without the word\'s own', async () => {
    await acceptedCard('夢␟ゆめ', { fields: { ...FIELDS, term: '夢', reading: 'ゆめ', meaning: 'dream' } })
    const run = (await lesson())!

    const readings = (await snapshotOf(db, OWNER, run.sessionId))!.positions[0]!.kanjiReadings

    expect(readings).toContain('む')
    expect(readings).not.toContain('ゆめ')
  })
})
