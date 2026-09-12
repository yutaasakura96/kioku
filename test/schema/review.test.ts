// The *session* composer, the snapshot and the *grade* — `server/utils/review/`,
// against a real database.
//
// ⚠️ **These are in the schema tier rather than the unit one because what they
// are about is rows.** `compose` is a pure function and has its own tests
// (`test/unit/review-compose.test.ts`); what is here is that the *session* is
// **written** the way `04` §7.6 and §7.7 describe — `size` rows, a *card* once,
// a server-side `snapshot_taken_at` — and that a *grade* mints the *card*'s
// first *scheduling epoch* and one `review_log` row that can never be taken
// back.
//
// ⚠️ **One test asserts an absence in the other direction from
// `test/schema/vet.test.ts`'s.** That file asserts acceptance mints **no**
// epoch; this one asserts the *grade* mints exactly one, at ordinal 1. The two
// together are the whole of "the first epoch belongs to the *session* that first
// schedules the *card*" (`04` §9, ADR 0033), and either alone reads as tidiness.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { dueCards, newCards, nothingToStudy, snapshotOf } from '../../server/utils/review/queries'
import { freshDatabase, reset } from './harness'
import { recordGrade } from '../../server/utils/review/grade'
import { resumeOrCompose } from '../../server/utils/review/session'
import type { Grade } from '../../shared/review/scheduler'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase

const OWNER = 'usr_test'
const OTHER = 'usr_other'

const DAY = 24 * 60 * 60 * 1000

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
 */
async function acceptedCard(
  key: string,
  { owner = OWNER, minutesAgo = 0, fields = FIELDS, suspended = false } = {},
): Promise<string> {
  const note = await one<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab', '${key}', '${JSON.stringify(fields)}'::jsonb)
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

describe('the two reads the composer is built from (`04` §11)', () => {
  it('offers a card whose live epoch has come due, and not one that has not', async () => {
    const overdue = await acceptedCard('一␟いち')
    const later = await acceptedCard('二␟に')
    await scheduled(overdue, -2)
    await scheduled(later, 3)

    expect((await dueCards(db, OWNER, 20)).map(card => card.cardId)).toEqual([overdue])
  })

  // ⚠️ Suspension is on the `card` and cannot live in the epoch index's partial
  // predicate (`04` §11), so it is the join that drops it — and `S9` suspends a
  // *card* while leaving its history and its epoch exactly where they were.
  it('offers neither a due nor a new card once it is suspended', async () => {
    const suspended = await acceptedCard('三␟さん', { suspended: true })
    await scheduled(suspended, -1)

    expect(await dueCards(db, OWNER, 20)).toEqual([])
    expect(await newCards(db, OWNER, 20)).toEqual([])
  })

  it('offers a card with no epoch as new, oldest acceptance first', async () => {
    const second = await acceptedCard('二␟に', { minutesAgo: 5 })
    const first = await acceptedCard('一␟いち', { minutesAgo: 9 })

    expect((await newCards(db, OWNER, 20)).map(card => card.cardId)).toEqual([first, second])
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

    expect(await newCards(db, OWNER, 20)).toEqual([])
  })

  it('offers nothing belonging to another reader', async () => {
    const theirs = await acceptedCard('五␟ご', { owner: OTHER })
    await scheduled(theirs, -1, OTHER)

    expect(await dueCards(db, OWNER, 20)).toEqual([])
    expect(await newCards(db, OWNER, 20)).toEqual([])
  })
})

describe('composing a session (`S7`, `04` §7.6, §7.7)', () => {
  it('writes `size` rows of membership, due first, and a card once', async () => {
    const due = await acceptedCard('一␟いち')
    await scheduled(due, -1)
    const fresh = await acceptedCard('二␟に', { minutesAgo: 1 })
    await acceptedCard('三␟さん')

    const session = await resumeOrCompose(db, OWNER, 2)

    expect(session).not.toBeNull()
    expect(session!.size).toBe(2)
    expect(await count('review_session_card', `review_session_id = '${session!.sessionId}'`)).toBe(2)
    expect(session!.positions.map(p => p.cardId)).toEqual([due, fresh])
    expect(session!.positions.map(p => p.ordinal)).toEqual([0, 1])
  })

  // ⚠️ **`review_session.size` is what was composed, not what was asked for.**
  // `04` §14 makes the *progress rail*'s length `review_session.size`, so a
  // reader with one *card* and a knob at twenty must get a rail of one —
  // nineteen ticks that can never fill would be the only progress indicator in
  // the application promising work that does not exist.
  it('is as long as what there was to study, not as long as the knob', async () => {
    await acceptedCard('一␟いち')

    const session = await resumeOrCompose(db, OWNER, 20)

    expect(session!.size).toBe(1)
    expect(session!.positions).toHaveLength(1)
  })

  it('carries the note fields, so the run is prefetched as a unit (`S8`)', async () => {
    await acceptedCard('図書館␟としょかん')

    const session = await resumeOrCompose(db, OWNER, 20)

    expect(session!.positions[0]!.fields).toEqual(FIELDS)
    expect(session!.positions[0]!.templateKey).toBe('recognition')
  })

  // ⚠️ **Server-side, because `03` §8.2's replay rule compares a client stamp
  // against it** (ADR 0007, `04` §7.6). A value computed in the application and
  // sent over would be this process's clock standing in for the database's on
  // the one timestamp that decides whether a *grade* is believable.
  it('stamps `snapshot_taken_at` on the server', async () => {
    await acceptedCard('一␟いち')

    const before = await one<{ now: Date }>('SELECT now() AS now;')
    const session = await resumeOrCompose(db, OWNER, 20)
    const after = await one<{ now: Date }>('SELECT now() AS now;')

    expect(session!.snapshotTakenAt.getTime()).toBeGreaterThanOrEqual(before.now.getTime())
    expect(session!.snapshotTakenAt.getTime()).toBeLessThanOrEqual(after.now.getTime())
  })

  it('answers nothing when there is nothing to study, and writes no session', async () => {
    expect(await resumeOrCompose(db, OWNER, 20)).toBeNull()
    expect(await count('review_session')).toBe(0)
  })

  // ⚠️ `09` §4.7: *session* size is set on the end screen and on the empty
  // states, **never mid-session** — the current one is snapshotted, and a knob
  // that appeared to change it would be lying. Done mid-*session* is a pause
  // (`10` §5.3), so the live run is what `/review` answers with.
  it('resumes the live run rather than composing a second one', async () => {
    await acceptedCard('一␟いち')
    await acceptedCard('二␟に')

    const first = await resumeOrCompose(db, OWNER, 1)
    const again = await resumeOrCompose(db, OWNER, 20)

    expect(again!.sessionId).toBe(first!.sessionId)
    expect(again!.size).toBe(1)
    expect(await count('review_session')).toBe(1)
  })
})

describe('one grade (`S7`, ADR 0016, `04` §7.4, §7.5)', () => {
  async function session(cards = 1) {
    for (let index = 0; index < cards; index += 1)
      await acceptedCard(`${index}␟${index}`, { minutesAgo: cards - index })

    return (await resumeOrCompose(db, OWNER, cards))!
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

  // A held key, not an error — and it must not write a second irreplaceable row
  // or schedule the *card* twice. The replay rule for two *grades* on one *card*
  // is `03` §8.2's and it is #13's.
  it('answers `already_graded` to a second grade and changes nothing', async () => {
    const run = await session()
    const cardId = run.positions[0]!.cardId

    await grade(run.sessionId, cardId, 1)
    const { due: first } = await one<{ due: Date }>('SELECT due FROM scheduling_epoch LIMIT 1;')

    const outcome = await grade(run.sessionId, cardId, 4)

    expect(outcome).toEqual({ ok: false, reason: 'already_graded' })
    expect(await count('review_log')).toBe(1)
    const { due: unchanged } = await one<{ due: Date }>('SELECT due FROM scheduling_epoch LIMIT 1;')
    expect(unchanged.getTime()).toBe(first.getTime())
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
    const run = (await resumeOrCompose(db, OWNER, 2))!

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

  // ⚠️ **Finishing is not starting** (`S7`): the end screen shows the run's
  // numbers and **never** starts the next one. Nothing on the *grade* path
  // composes, so the *session* count after the last keystroke is still one.
  it('starts nothing when it ends', async () => {
    await acceptedCard('一␟いち')
    await acceptedCard('二␟に')
    const run = (await resumeOrCompose(db, OWNER, 1))!

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
    const first = await acceptedCard('一␟いち', { minutesAgo: 2 })
    const second = await acceptedCard('二␟に', { minutesAgo: 1 })
    const run = (await resumeOrCompose(db, OWNER, 1))!

    await recordGrade(db, OWNER, {
      sessionId: run.sessionId,
      cardId: run.positions[0]!.cardId,
      grade: 3,
      reviewedAt: new Date(),
    })

    const next = (await resumeOrCompose(db, OWNER, 20))!

    expect(run.positions[0]!.cardId).toBe(first)
    expect(next.sessionId).not.toBe(run.sessionId)
    // The graded *card* is a day out, so what is left is the one never seen.
    expect(next.positions.map(p => p.cardId)).toEqual([second])
  })
})

// `10` §5.7 — the two non-terminal empty states, and the difference between
// going to *Vet* and coming back tomorrow.
describe('nothing to study', () => {
  it('says the reader has no cards at all', async () => {
    expect(await nothingToStudy(db, OWNER)).toEqual({ hasCards: false, nextDue: null })
  })

  it('names when the next card is due', async () => {
    const card = await acceptedCard('一␟いち')
    await scheduled(card, 1)

    const answer = await nothingToStudy(db, OWNER)

    expect(answer.hasCards).toBe(true)
    expect(answer.nextDue!.getTime()).toBeGreaterThan(Date.now())
  })
})
