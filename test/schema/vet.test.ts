// *Vet*'s three keystrokes, minting and undo — `server/utils/vet/`, against a
// real database.
//
// ⚠️ **Since #20 *Vet* is the flag queue** (ADR 0064): the only *note* on it is
// an accepted one whose *card* carries an unresolved `card_flag`, and `space`,
// `E` and `R` are keep, fix and drop. `decide()` still answers a *pending*
// *note* the way it always did — the 474 of them are a cache now, unreachable
// from the queue — so the tests of that path stay, and they are what proves `Z`
// still un-mints inside the run that made it.
//
// ⚠️ **Three of these tests are about a delete rule rather than about vetting**,
// and they are the reason this file is in the schema tier rather than the unit
// one. ADR 0033 carves the single exception to `04` §9.1's "there is no path to
// delete a card": `Z` un-mints the *card* its own acceptance created. The
// argument that it is safe is that such a *card* is provably historyless — and
// the ADR then says the argument is not what the code relies on, because
// `review_session_card → card` and `review_log → card` are `RESTRICT`. **A
// `RESTRICT` is not assertable anywhere but against Postgres.**
//
// ⚠️ And one of them asserts an **absence**: acceptance mints a *card* and does
// **not** mint a *scheduling epoch*. That is not tidiness either — the epoch is
// `RESTRICT` too, so writing one here would make `Z` fail on every acceptance
// the application has ever made, and the failure would look like a database
// problem rather than like a decision.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { decide } from '../../server/utils/vet/decide'
import { endOpenRun, openRunTally, sweepIdleRuns } from '../../server/utils/vet/run'
import { freshDatabase, reset } from './harness'
import { queueBatch, vetQueue } from '../../server/utils/vet/queries'
import { undoLastDecision } from '../../server/utils/vet/undo'
import { writeNoteFields } from '../../server/utils/note/fields'
import type { SchemaDatabase } from './harness'
import type { VetDecision } from '../../shared/vet/decision'

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

const FIELDS = {
  term: '図書館',
  reading: 'としょかん',
  part_of_speech: '名詞',
  meaning: 'library',
  example_sentence: '駅の近くに図書館があります。',
  example_gloss: 'There is a library near the station.',
}

/** One *pending* *note*, `minutesAgo` old so the queue's order is assertable. */
async function pending(
  key: string,
  { owner = OWNER, minutesAgo = 0, fields = FIELDS } = {},
): Promise<string> {
  const note = await one<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab', '${key}', '${JSON.stringify(fields)}'::jsonb)
    RETURNING id;
  `)

  await client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, created_at)
    VALUES ('${note.id}', '${owner}', now() - interval '${minutesAgo} minutes');
  `)

  return note.id
}

/**
 * One *note* on the flag queue: accepted a day ago, its *card* flagged
 * `minutesAgo` — which is the state `server/utils/review/flag.ts` leaves.
 *
 * ⚠️ **`flags` rows, because a *card* can carry more than one** (`11` §3): a
 * second flag in a later *session* is a second row, and a resolution resolves
 * all of them.
 */
async function flagged(
  key: string,
  { owner = OWNER, minutesAgo = 0, fields = FIELDS, flags = 1 } = {},
): Promise<{ noteId: string, cardId: string }> {
  const note = await one<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab', '${key}', '${JSON.stringify(fields)}'::jsonb)
    RETURNING id;
  `)

  await client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, vetted_at, flagged_at)
    VALUES ('${note.id}', '${owner}', 'accepted', now() - interval '1 day',
            now() - interval '${minutesAgo} minutes');
  `)

  const card = await one<{ id: string }>(`
    INSERT INTO card (note_id, owner_id, template_key, suspended_at, suspended_reason)
    VALUES ('${note.id}', '${owner}', 'recognition', now() - interval '${minutesAgo} minutes', 'flagged')
    RETURNING id;
  `)

  for (let flag = 0; flag < flags; flag += 1) {
    await client.exec(`
      INSERT INTO card_flag (card_id, note_id, owner_id, flagged_at)
      VALUES ('${card.id}', '${note.id}', '${owner}', now() - interval '${minutesAgo + flag} minutes');
    `)
  }

  return { noteId: note.id, cardId: card.id }
}

/** A *card* with one graded review behind it, on a live epoch at ordinal 1. */
async function graded(cardId: string, owner = OWNER): Promise<string> {
  const epoch = await one<{ id: string }>(`
    INSERT INTO scheduling_epoch (card_id, owner_id, ordinal, due, stability, difficulty,
                                  scheduled_days, reps, lapses, state, last_review)
    VALUES ('${cardId}', '${owner}', 1, now() + interval '63 days', 61.4, 5.2, 63, 7, 1, 2,
            now() - interval '2 days')
    RETURNING id;
  `)
  await client.exec(`
    INSERT INTO review_log (card_id, scheduling_epoch_id, owner_id, rating, state, due,
                            stability, difficulty, scheduled_days, learning_steps, reviewed_at)
    VALUES ('${cardId}', '${epoch.id}', '${owner}', 3, 2, now(), 61.4, 5.2, 63, 0, now());
  `)
  return epoch.id
}

/** `space` on the flag queue — ADR 0064 §3's keep. */
function keep(noteId: string) {
  return decide(db, OWNER, { noteId, action: 'accept', secondsToVet: 2.5, edits: null })
}

/** `E`, then `Enter` — the fix. */
function fix(noteId: string, edits: Record<string, string>) {
  return decide(db, OWNER, { noteId, action: 'accept', secondsToVet: 8.1, edits })
}

/** `R` — the drop. */
function drop(noteId: string) {
  return decide(db, OWNER, { noteId, action: 'reject', secondsToVet: 1.9, edits: null })
}

function accept(noteId: string, overrides: Partial<VetDecision> = {}) {
  return decide(db, OWNER, { noteId, action: 'accept', secondsToVet: 3.41, edits: null, ...overrides })
}

function reject(noteId: string) {
  return decide(db, OWNER, { noteId, action: 'reject', secondsToVet: 1.2, edits: null })
}

/**
 * A second reader's own row on the same shared *note* (`04` §4) — the state
 * `decide()` cannot produce for `OWNER` and the freeze is about.
 */
async function alsoVetted(noteId: string, owner: string, state: 'accepted' | 'rejected') {
  await client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
    VALUES ('${noteId}', '${owner}', '${state}', now());
  `)
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

describe('the queue — the flag queue, ADR 0064 §3', () => {
  it('is this owner\'s flagged notes, oldest flag first', async () => {
    const second = await flagged('二␟に', { minutesAgo: 5 })
    const first = await flagged('一␟いち', { minutesAgo: 9 })
    await flagged('三␟さん', { minutesAgo: 1, owner: OTHER })

    const batch = await queueBatch(db, OWNER)

    expect(batch.map(note => note.noteId)).toEqual([first.noteId, second.noteId])
  })

  // ⚠️ The 474 are a cache for stage 5 now (ADR 0063), and a queue that still
  // selected `state = 'pending'` would hand the reader a fortnight's backlog the
  // pivot exists to retire.
  it('never holds a pending note', async () => {
    await pending('一␟いち', { minutesAgo: 90 })
    const { noteId } = await flagged('二␟に', { minutesAgo: 5 })

    expect((await queueBatch(db, OWNER)).map(note => note.noteId)).toEqual([noteId])
  })

  it('never holds an accepted note whose flags are all resolved', async () => {
    const { noteId } = await flagged('二␟に')
    await client.exec(`UPDATE card_flag SET resolved_at = now() WHERE note_id = '${noteId}';`)

    expect(await queueBatch(db, OWNER)).toEqual([])
  })

  it('carries the fields, the provenance and the level claims the screen renders', async () => {
    const { noteId } = await flagged('図書館␟としょかん')
    await client.exec(`
      INSERT INTO note_field_provenance (note_id, field_name, kind, dictionary_version, is_oov)
      VALUES ('${noteId}', 'reading', 'lookup', '20260723', false);
      INSERT INTO note_field_provenance (note_id, field_name, kind, model_id, prompt_version)
      VALUES ('${noteId}', 'meaning', 'generated', 'claude-sonnet-5', 'v3');
      INSERT INTO level_claim (note_id, authority_key, level) VALUES ('${noteId}', 'jlpt-tango-n3', 'N3');
      INSERT INTO level_claim (note_id, authority_key, level, model_id, prompt_version)
      VALUES ('${noteId}', null, 'N4', 'claude-sonnet-5', 'v3');
    `)

    const [note] = await queueBatch(db, OWNER)

    expect(note!.fields).toEqual(FIELDS)
    expect(note!.provenance).toHaveLength(2)
    // ⚠️ ADR 0005: the set is never collapsed, and the named *authority* reads
    // first so the *provenance marker* draws filled-then-hollow.
    expect(note!.levels).toEqual([
      { authorityKey: 'jlpt-tango-n3', level: 'N3' },
      { authorityKey: null, level: 'N4' },
    ])
  })

  // ⚠️ **A second flag orders by itself, not by the first.** `X` stamps
  // `note_vetting.flagged_at` once and nothing clears it, so ordering by that
  // column would put a *note* kept a month ago and flagged again this morning
  // ahead of everything raised in between.
  it('orders by the oldest open flag, not by the note\'s first flag', async () => {
    const reflagged = await flagged('開く␟ひらく', { minutesAgo: 3 })
    await client.exec(`UPDATE note_vetting SET flagged_at = now() - interval '30 days' WHERE note_id = '${reflagged.noteId}';`)
    const waiting = await flagged('閉じる␟とじる', { minutesAgo: 5 })

    const batch = await queueBatch(db, OWNER)

    expect(batch.map(note => note.noteId)).toEqual([waiting.noteId, reflagged.noteId])
  })

  // #10's carried bullet, closed: `note_vetting.flagged_at` was written by `X`
  // since #13 and read by nothing. It is `10` §4.3's aside.
  it('reads `note_vetting.flagged_at` for `10` §4.3\'s aside', async () => {
    await flagged('開く␟ひらく')

    expect((await queueBatch(db, OWNER))[0]!.flagged).toBe(true)
  })

  // ⚠️ `note.origin_ingestion_id` is `SET NULL` on a hard delete, because a
  // *note* outlives the run that made it (`04` §9). An inner join to `ingestion`
  // for the chrome bar's *source* name would drop those notes out of the queue.
  it('keeps a note whose source has been hard-deleted', async () => {
    await flagged('図書館␟としょかん')

    const batch = await queueBatch(db, OWNER)

    expect(batch).toHaveLength(1)
    expect(batch[0]!.sourceTitle).toBeNull()
  })

  it('drops a note the moment it is resolved', async () => {
    const { noteId } = await flagged('図書館␟としょかん')
    await keep(noteId)

    expect(await queueBatch(db, OWNER)).toEqual([])
  })
})

describe('three resolutions, one keystroke each — ADR 0064 §3', () => {
  it('keep resolves the flag and unsuspends the card, and changes nothing else', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')

    expect(await keep(noteId)).toEqual({ ok: true })

    expect(await count('card_flag', `resolved_at IS NULL`)).toBe(0)
    expect(await one(`SELECT suspended_at, suspended_reason FROM card WHERE id = '${cardId}';`))
      .toEqual({ suspended_at: null, suspended_reason: null })
    const vetting = await one<{ state: string, edited: boolean, vetting_session_id: string | null }>(
      `SELECT state, edited, vetting_session_id FROM note_vetting WHERE note_id = '${noteId}';`,
    )
    expect(vetting.state).toBe('accepted')
    expect(vetting.edited).toBe(false)
    expect(vetting.vetting_session_id).not.toBeNull()
    expect((await one<{ fields: Record<string, string> }>(`SELECT fields FROM note WHERE id = '${noteId}';`)).fields)
      .toEqual(FIELDS)
  })

  it('fix edits the fields, resolves the flag and unsuspends the card', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')

    expect(await fix(noteId, { example_gloss: 'A library is near the station.' })).toEqual({ ok: true })

    const note = await one<{ fields: Record<string, string> }>(`SELECT fields FROM note WHERE id = '${noteId}';`)
    expect(note.fields.example_gloss).toBe('A library is near the station.')
    expect(await count('note_field_provenance', `kind = 'human' AND field_name = 'example_gloss'`)).toBe(1)
    expect(await count('card_flag', `resolved_at IS NULL`)).toBe(0)
    expect(await count('card', `id = '${cardId}' AND suspended_at IS NULL`)).toBe(1)
    expect(await count('note_vetting', `edited AND state = 'accepted' AND note_id = '${noteId}'`)).toBe(1)
  })

  // `S5`, moved: *the reader still says no once and means it, he just says it
  // later.* The *card* stays out of scheduling and the term stays out of every
  // later run through stage 5.
  it('drop resolves the flag, leaves the card suspended and writes the note rejected', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')

    expect(await drop(noteId)).toEqual({ ok: true })

    expect(await count('card_flag', `resolved_at IS NULL`)).toBe(0)
    expect(await count('card', `id = '${cardId}' AND suspended_reason = 'flagged'`)).toBe(1)
    const rejected = await rows<{ identity_key: string }>(`
      SELECT n.identity_key FROM note_vetting v
      JOIN note n ON n.id = v.note_id
      WHERE v.owner_id = '${OWNER}' AND v.state = 'rejected';
    `)
    expect(rejected.map(row => row.identity_key)).toEqual(['図書館␟としょかん'])
  })

  it('resolves every open flag on the note, not only the newest', async () => {
    const { noteId } = await flagged('図書館␟としょかん', { flags: 2 })

    await keep(noteId)

    expect(await count('card_flag', `note_id = '${noteId}' AND resolved_at IS NOT NULL`)).toBe(2)
  })

  // ⚠️ `S11`'s reason is not `S9`'s to lift. A *card* whose *source* was deleted
  // and was then flagged keeps the suspension it had first.
  it('leaves a suspension that was not the flag\'s standing', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')
    await client.exec(`UPDATE card SET suspended_reason = 'source_deleted' WHERE id = '${cardId}';`)

    await keep(noteId)

    expect(await count('card', `id = '${cardId}' AND suspended_reason = 'source_deleted'`)).toBe(1)
  })

  it('mints nothing — the card already exists', async () => {
    const { noteId } = await flagged('図書館␟としょかん')

    await keep(noteId)

    expect(await count('card')).toBe(1)
  })

  it('refuses an accepted note with no open flag, as not pending', async () => {
    const { noteId } = await flagged('図書館␟としょかん')
    await keep(noteId)

    expect(await drop(noteId)).toEqual({ ok: false, reason: 'not_pending' })
    expect(await count('note_vetting', `state = 'accepted' AND note_id = '${noteId}'`)).toBe(1)
  })

  // A flag is personal (`04` §4). Another reader's flag on the same shared
  // *note* says nothing about this reader's *card*.
  it('refuses a note only another reader has flagged', async () => {
    const { noteId } = await flagged('図書館␟としょかん', { owner: OTHER })
    await alsoVetted(noteId, OWNER, 'accepted')

    expect(await keep(noteId)).toEqual({ ok: false, reason: 'not_pending' })
  })
})

// ⚠️ **ADR 0052's guard gains one condition rather than losing its clause.**
// Both directions, against the function itself — `decide()` reaching it is one
// caller, and the guard is written for the next one.
describe('the freeze lifts for a flagged note, and only for one — ADR 0052 § Amendment', () => {
  it('lets the write through while the note\'s card carries an open flag', async () => {
    const { noteId } = await flagged('図書館␟としょかん')

    expect(await writeNoteFields(db, noteId, { ...FIELDS, meaning: 'a library' })).toBe(true)
  })

  it('refuses the write to an accepted note that was never flagged', async () => {
    const noteId = await pending('図書館␟としょかん')
    await client.exec(`UPDATE note_vetting SET state = 'accepted' WHERE note_id = '${noteId}';`)

    expect(await writeNoteFields(db, noteId, { ...FIELDS, meaning: 'a library' })).toBe(false)
  })

  it('refuses the write again once the flag is resolved', async () => {
    const { noteId } = await flagged('図書館␟としょかん')
    await client.exec(`UPDATE card_flag SET resolved_at = now() WHERE note_id = '${noteId}';`)

    expect(await writeNoteFields(db, noteId, { ...FIELDS, meaning: 'a library' })).toBe(false)
  })
})

// ⚠️ **The application's first *scheduling epoch* reset.** `04` §7.4: a change
// to a *memory-bearing field* invalidates what was memorised, so the live epoch
// is superseded and ordinal n+1 begins — and the `review_log` rows that were
// measured against the old text stay exactly where they are.
describe('a fix to a memory-bearing field starts a new epoch — `04` §7.4', () => {
  it('supersedes the live epoch and starts the next ordinal from new', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')
    const first = await graded(cardId)

    await fix(noteId, { meaning: 'a public library' })

    const epochs = await rows<{ id: string, ordinal: number, superseded: boolean, superseded_reason: string | null, state: number, reps: number, lapses: number, due_now: boolean }>(`
      SELECT id, ordinal, superseded_at IS NOT NULL AS superseded, superseded_reason, state, reps, lapses,
             due <= now() + interval '1 minute' AS due_now
      FROM scheduling_epoch WHERE card_id = '${cardId}' ORDER BY ordinal;
    `)
    expect(epochs).toHaveLength(2)
    expect(epochs[0]).toMatchObject({ id: first, ordinal: 1, superseded: true, superseded_reason: 'memory_bearing_field_changed' })
    expect(epochs[1]).toMatchObject({ ordinal: 2, superseded: false, superseded_reason: null, state: 0, reps: 0, lapses: 0, due_now: true })

    // The history stands and stays readable, pointing at the epoch it was
    // measured in.
    expect(await rows(`SELECT scheduling_epoch_id FROM review_log WHERE card_id = '${cardId}';`))
      .toEqual([{ scheduling_epoch_id: first }])
  })

  it('leaves the epoch alone when the edit touches no memory-bearing field', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')
    await graded(cardId)

    await fix(noteId, { example_sentence: '図書館で本を借ります。' })

    expect(await count('scheduling_epoch', `card_id = '${cardId}'`)).toBe(1)
    expect(await count('scheduling_epoch', `superseded_at IS NOT NULL`)).toBe(0)
  })

  // `09` §4.3 counts a commit from the edit state as an edit, but a memory
  // is only invalidated by a value that actually changed.
  it('leaves the epoch alone when the memory-bearing value is committed unchanged', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')
    await graded(cardId)

    await fix(noteId, { meaning: FIELDS.meaning })

    expect(await count('scheduling_epoch', `superseded_at IS NOT NULL`)).toBe(0)
  })

  it('writes no epoch for a card that was never scheduled', async () => {
    const { noteId } = await flagged('図書館␟としょかん')

    await fix(noteId, { meaning: 'a public library' })

    expect(await count('scheduling_epoch')).toBe(0)
  })

  it('never resets on a keep', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')
    await graded(cardId)

    await keep(noteId)

    expect(await count('scheduling_epoch', `superseded_at IS NOT NULL`)).toBe(0)
  })
})

describe('acceptance mints the card, in the same transaction', () => {
  it('writes the decision, the stamp and the run together', async () => {
    const noteId = await pending('図書館␟としょかん')

    expect(await accept(noteId)).toEqual({ ok: true })

    const vetting = await one<{ state: string, seconds_to_vet: string, vetting_session_id: string, vetted_at: Date }>(
      `SELECT state, seconds_to_vet, vetting_session_id, vetted_at FROM note_vetting WHERE note_id = '${noteId}';`,
    )

    expect(vetting.state).toBe('accepted')
    expect(Number(vetting.seconds_to_vet)).toBe(3.41)
    expect(vetting.vetting_session_id).not.toBeNull()
    expect(vetting.vetted_at).not.toBeNull()

    const card = await one<{ template_key: string, owner_id: string }>(
      `SELECT template_key, owner_id FROM card WHERE note_id = '${noteId}';`,
    )
    expect(card).toEqual({ template_key: 'recognition', owner_id: OWNER })
  })

  // ⚠️ The absence is the assertion. `scheduling_epoch.card_id` is `RESTRICT`,
  // so an epoch written at minting would make ADR 0033's `Z` fail on **every**
  // acceptance. The epoch belongs to the *session* that first schedules the
  // card, which is #12's.
  it('does not mint a scheduling epoch', async () => {
    await accept(await pending('図書館␟としょかん'))

    expect(await count('scheduling_epoch')).toBe(0)
  })

  it('mints nothing on a rejection', async () => {
    const noteId = await pending('図書館␟としょかん')

    await reject(noteId)

    expect(await count('card')).toBe(0)
    expect(await count('note_vetting', `state = 'rejected' AND note_id = '${noteId}'`)).toBe(1)
  })

  // `S5`, from the other end. `worker/ingest.py`'s rejected filter reads exactly
  // this — `04` §12's third query — and `worker/pipeline/filter_known.py` is
  // what drops the candidate before stage 6 spends anything on it.
  it('leaves the rejection where the pipeline\'s stage 5 looks for it', async () => {
    await reject(await pending('図書館␟としょかん'))

    const rejected = await rows<{ identity_key: string }>(`
      SELECT n.identity_key FROM note_vetting v
      JOIN note n ON n.id = v.note_id
      WHERE v.owner_id = '${OWNER}' AND v.state = 'rejected';
    `)

    expect(rejected.map(row => row.identity_key)).toEqual(['図書館␟としょかん'])
  })

  it('refuses a second keystroke on a note already decided', async () => {
    const noteId = await pending('図書館␟としょかん')
    await accept(noteId)

    expect(await reject(noteId)).toEqual({ ok: false, reason: 'not_pending' })
    expect(await count('note_vetting', `state = 'accepted' AND note_id = '${noteId}'`)).toBe(1)
  })

  it('refuses another owner\'s note', async () => {
    const noteId = await pending('図書館␟としょかん', { owner: OTHER })

    expect(await accept(noteId)).toEqual({ ok: false, reason: 'not_pending' })
  })

  it('records an unmeasured stamp as null rather than refusing', async () => {
    const noteId = await pending('図書館␟としょかん')

    await accept(noteId, { secondsToVet: null })

    expect(await count('note_vetting', `seconds_to_vet IS NULL AND note_id = '${noteId}'`)).toBe(1)
  })
})

describe('`S6` — an edit, and the provenance it writes', () => {
  async function withProvenance(noteId: string) {
    await client.exec(`
      INSERT INTO note_field_provenance (note_id, field_name, kind, model_id, prompt_version)
      VALUES ('${noteId}', 'meaning', 'generated', 'claude-sonnet-5', 'v3'),
             ('${noteId}', 'example_gloss', 'generated', 'claude-sonnet-5', 'v3');
    `)
  }

  it('writes the new value and stamps it `human`', async () => {
    const noteId = await pending('図書館␟としょかん')
    await withProvenance(noteId)

    await accept(noteId, { edits: { meaning: 'a library' } })

    const note = await one<{ fields: Record<string, string> }>(`SELECT fields FROM note WHERE id = '${noteId}';`)
    expect(note.fields).toEqual({ ...FIELDS, meaning: 'a library' })

    const provenance = await one<{ kind: string, model_id: string | null }>(
      `SELECT kind, model_id FROM note_field_provenance WHERE note_id = '${noteId}' AND field_name = 'meaning';`,
    )
    expect(provenance).toEqual({ kind: 'human', model_id: null })
  })

  // ⚠️ ADR 0048: `kind` records **who produced the value**. A field the reader
  // looked at and left alone was produced by the model, and stamping it `human`
  // would take ADR 0018's instrument away one *note* at a time.
  it('leaves an unchanged field\'s provenance alone', async () => {
    const noteId = await pending('図書館␟としょかん')
    await withProvenance(noteId)

    await accept(noteId, {
      edits: { meaning: 'a library', example_gloss: FIELDS.example_gloss },
    })

    const untouched = await one<{ kind: string, model_id: string | null }>(
      `SELECT kind, model_id FROM note_field_provenance WHERE note_id = '${noteId}' AND field_name = 'example_gloss';`,
    )
    expect(untouched).toEqual({ kind: 'generated', model_id: 'claude-sonnet-5' })
  })

  // `09` §4.3 sets `note_vetting.edited` on the **commit**, not on the diff.
  it('counts a commit from the edit state as an edit even when nothing changed', async () => {
    const noteId = await pending('図書館␟としょかん')

    await accept(noteId, { edits: {} })

    expect(await count('note_vetting', `edited AND note_id = '${noteId}'`)).toBe(1)
    expect(await count('note_field_provenance', `kind = 'human'`)).toBe(0)
  })

  it('leaves `edited` false on a plain acceptance', async () => {
    const noteId = await pending('図書館␟としょかん')

    await accept(noteId)

    expect(await count('note_vetting', `edited AND note_id = '${noteId}'`)).toBe(0)
  })
})

// ⚠️ **`S6`'s freeze, and it is a guard rather than a property held by the
// absence of a caller.** `decide()` refuses a *note* that is not `pending` for
// the reader sending the keystroke, which covers the one reader v1 invites — but
// `note` is a **shared** entity (`04` §4) and `note_vetting` is personal, so the
// *note* on this reader's queue can be a *note* another reader has already
// accepted and studied. The guard is in the `WHERE` of the fields write
// (`server/utils/note/fields.ts`), which is why these tests can reach it at all.
describe('`S6` — an accepted note\'s fields are frozen', () => {
  it('refuses an edit to a note another reader has already accepted', async () => {
    const noteId = await pending('図書館␟としょかん')
    await alsoVetted(noteId, OTHER, 'accepted')

    expect(await accept(noteId, { edits: { meaning: 'a library' } })).toEqual({
      ok: false,
      reason: 'frozen',
    })
  })

  // ⚠️ **The refusal is the whole transaction, not just the fields write.** A
  // *note* accepted with the edit silently dropped is the failure `S6` is about
  // — the reader's correction is the reason they pressed `Enter` rather than
  // `space`, and an acceptance without it is an acceptance of something they
  // said was wrong.
  it('decides nothing and mints nothing when it refuses', async () => {
    const noteId = await pending('図書館␟としょかん')
    await alsoVetted(noteId, OTHER, 'accepted')

    await accept(noteId, { edits: { meaning: 'a library' } })

    const note = await one<{ fields: Record<string, string> }>(`SELECT fields FROM note WHERE id = '${noteId}';`)
    expect(note.fields).toEqual(FIELDS)
    expect(await count('note_vetting', `state = 'pending' AND owner_id = '${OWNER}'`)).toBe(1)
    expect(await count('card')).toBe(0)
    expect(await count('note_field_provenance', `kind = 'human'`)).toBe(0)
  })

  // The freeze is about the fields, and a plain acceptance writes none. Refusing
  // here would make a *note* somebody else accepted un-acceptable, which is a
  // different — and wrong — rule.
  it('accepts without an edit even when the note is frozen', async () => {
    const noteId = await pending('図書館␟としょかん')
    await alsoVetted(noteId, OTHER, 'accepted')

    expect(await accept(noteId)).toEqual({ ok: true })
    expect(await count('card', `owner_id = '${OWNER}'`)).toBe(1)
  })

  // ⚠️ **A rejection is a claim about the reader, not about the word** (ADR
  // 0012), so it freezes nothing: the other reader declined to study it and
  // nobody has confirmed the fields.
  it('lets the edit through when the other reader only rejected it', async () => {
    const noteId = await pending('図書館␟としょかん')
    await alsoVetted(noteId, OTHER, 'rejected')

    expect(await accept(noteId, { edits: { meaning: 'a library' } })).toEqual({ ok: true })

    const note = await one<{ fields: Record<string, string> }>(`SELECT fields FROM note WHERE id = '${noteId}';`)
    expect(note.fields).toEqual({ ...FIELDS, meaning: 'a library' })
  })
})

describe('`Z` — ADR 0033, and the one exception to `04` §9.1', () => {
  it('un-mints the card it minted and returns the note to pending', async () => {
    const older = await pending('一␟いち', { minutesAgo: 9 })
    await pending('二␟に', { minutesAgo: 5 })
    await accept(older)

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: true, noteId: older })

    expect(await count('card')).toBe(0)
    expect(await count('note_vetting', `state = 'pending' AND note_id = '${older}'`)).toBe(1)
  })

  // ⚠️ **On the flag queue `Z` never deletes a *card*.** The *card* a flag
  // resolution acted on was minted long before this run and usually has a
  // history; the undo puts the flag back rather than the *card* away, and a
  // `RESTRICT` refusal here would be a bug wearing `reviewed`'s message.
  it('reverses a keep: the flag reopens, the card is suspended again, the note is back at the head', async () => {
    const older = await flagged('一␟いち', { minutesAgo: 9 })
    await flagged('二␟に', { minutesAgo: 5 })
    await graded(older.cardId)
    await keep(older.noteId)

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: true, noteId: older.noteId })

    expect(await count('card', `id = '${older.cardId}' AND suspended_reason = 'flagged'`)).toBe(1)
    expect(await count('card_flag', `note_id = '${older.noteId}' AND resolved_at IS NULL`)).toBe(1)
    expect(await count('note_vetting', `state = 'accepted' AND vetting_session_id IS NULL AND note_id = '${older.noteId}'`)).toBe(1)
    expect((await queueBatch(db, OWNER))[0]!.noteId).toBe(older.noteId)
  })

  it('reverses a drop back to accepted, flagged and suspended', async () => {
    const { noteId, cardId } = await flagged('図書館␟としょかん')
    await drop(noteId)

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: true, noteId })

    expect(await count('note_vetting', `state = 'accepted' AND note_id = '${noteId}'`)).toBe(1)
    expect(await count('card_flag', `resolved_at IS NULL`)).toBe(1)
    expect(await count('card', `id = '${cardId}' AND suspended_at IS NOT NULL`)).toBe(1)
  })

  it('reopens only the flags its own keystroke resolved', async () => {
    const first = await flagged('一␟いち', { minutesAgo: 9 })
    const second = await flagged('二␟に', { minutesAgo: 5 })
    await keep(first.noteId)
    await keep(second.noteId)

    await undoLastDecision(db, OWNER)

    expect(await count('card_flag', `note_id = '${first.noteId}' AND resolved_at IS NULL`)).toBe(0)
    expect(await count('card_flag', `note_id = '${second.noteId}' AND resolved_at IS NULL`)).toBe(1)
  })

  it('reverses a rejection', async () => {
    const noteId = await pending('図書館␟としょかん')
    await reject(noteId)

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: true, noteId })

    const vetting = await one<{ state: string, seconds_to_vet: string | null, vetting_session_id: string | null }>(
      `SELECT state, seconds_to_vet, vetting_session_id FROM note_vetting WHERE note_id = '${noteId}';`,
    )
    expect(vetting).toEqual({ state: 'pending', seconds_to_vet: null, vetting_session_id: null })
  })

  it('reaches the most recent decision, not the first', async () => {
    const first = await pending('一␟いち', { minutesAgo: 9 })
    const second = await pending('二␟に', { minutesAgo: 5 })
    await accept(first)
    await reject(second)

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: true, noteId: second })
    expect(await count('note_vetting', `state = 'accepted' AND note_id = '${first}'`)).toBe(1)
  })

  // ⚠️ `S6`'s count survives the undo, because the edit is still in
  // `note.fields`: the *note* is shared (`04` §4) and the undo is personal.
  it('leaves `edited` standing', async () => {
    const noteId = await pending('図書館␟としょかん')
    await accept(noteId, { edits: { meaning: 'a library' } })

    await undoLastDecision(db, OWNER)

    expect(await count('note_vetting', `edited AND note_id = '${noteId}'`)).toBe(1)
    const note = await one<{ fields: Record<string, string> }>(`SELECT fields FROM note WHERE id = '${noteId}';`)
    expect(note.fields.meaning).toBe('a library')
  })

  it('answers `nothing_to_undo` before the first decision of a run', async () => {
    await pending('図書館␟としょかん')

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: false, reason: 'nothing_to_undo' })
  })

  // ⚠️ **The `RESTRICT` is the guard, and this is the test that it is.** ADR
  // 0033's proof that the card is historyless is an argument; this is the thing
  // the code relies on when the argument is wrong.
  it('is refused once the card has been graded, and changes nothing', async () => {
    const noteId = await pending('図書館␟としょかん')
    await accept(noteId)

    const card = await one<{ id: string }>(`SELECT id FROM card WHERE note_id = '${noteId}';`)
    const epoch = await one<{ id: string }>(`
      INSERT INTO scheduling_epoch (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
      VALUES ('${card.id}', '${OWNER}', 1, now(), 61.4, 5.2, 63) RETURNING id;
    `)
    await client.exec(`
      INSERT INTO review_log (card_id, scheduling_epoch_id, owner_id, rating, state, due,
                              stability, difficulty, scheduled_days, learning_steps, reviewed_at)
      VALUES ('${card.id}', '${epoch.id}', '${OWNER}', 3, 2, now(), 61.4, 5.2, 63, 0, now());
    `)

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: false, reason: 'reviewed' })

    expect(await count('card', `id = '${card.id}'`)).toBe(1)
    expect(await count('note_vetting', `state = 'accepted' AND note_id = '${noteId}'`)).toBe(1)
  })

  it('is refused once the card has reached a session snapshot', async () => {
    const noteId = await pending('図書館␟としょかん')
    await accept(noteId)

    const card = await one<{ id: string }>(`SELECT id FROM card WHERE note_id = '${noteId}';`)
    const session = await one<{ id: string }>(
      `INSERT INTO review_session (owner_id, size) VALUES ('${OWNER}', 20) RETURNING id;`,
    )
    await client.exec(`
      INSERT INTO review_session_card (review_session_id, ordinal, card_id, owner_id)
      VALUES ('${session.id}', 0, '${card.id}', '${OWNER}');
    `)

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: false, reason: 'reviewed' })
    expect(await count('card', `id = '${card.id}'`)).toBe(1)
  })
})

describe('the run boundary — `04` §7.1', () => {
  it('opens one run and reuses it across decisions', async () => {
    await accept(await pending('一␟いち', { minutesAgo: 9 }))
    await reject(await pending('二␟に', { minutesAgo: 5 }))

    expect(await count('vetting_session')).toBe(1)
    expect(await openRunTally(db, OWNER)).toMatchObject({ vetted: 2, rejections: 1 })
  })

  it('Done ends the run and spends the undo', async () => {
    await reject(await pending('図書館␟としょかん'))

    await endOpenRun(db, OWNER)

    expect(await openRunTally(db, OWNER)).toBeNull()
    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: false, reason: 'nothing_to_undo' })
    expect(await count('vetting_session', 'ended_at IS NOT NULL')).toBe(1)
  })

  it('starts a new run after Done, and the old rejection stays permanent', async () => {
    await reject(await pending('一␟いち', { minutesAgo: 9 }))
    await endOpenRun(db, OWNER)

    await accept(await pending('二␟に', { minutesAgo: 5 }))

    expect(await count('vetting_session')).toBe(2)
    expect(await openRunTally(db, OWNER)).toMatchObject({ vetted: 1, rejections: 0 })
  })

  // ⚠️ `04` §7.1's third writer. It has nowhere else to live — this application
  // runs no scheduler — so it runs on the read that would otherwise have found
  // the stale run.
  it('the idle sweep ends a run whose last decision is half an hour old', async () => {
    await reject(await pending('図書館␟としょかん'))
    await client.exec(`UPDATE note_vetting SET vetted_at = now() - interval '31 minutes';`)

    await sweepIdleRuns(db, OWNER)

    expect(await openRunTally(db, OWNER)).toBeNull()
  })

  it('the idle sweep leaves a run the reader is in the middle of', async () => {
    await reject(await pending('図書館␟としょかん'))
    await client.exec(`UPDATE vetting_session SET started_at = now() - interval '4 hours';`)

    await sweepIdleRuns(db, OWNER)

    // Idleness is measured from the last decision, not from `started_at` —
    // otherwise a run longer than half an hour ends under a reader who is
    // still working.
    expect(await openRunTally(db, OWNER)).not.toBeNull()
  })

  it('the sweep ends a run that never decided anything, half an hour after it opened', async () => {
    await reject(await pending('図書館␟としょかん'))
    await client.exec(`
      UPDATE note_vetting SET vetting_session_id = null, vetted_at = null, state = 'pending';
      UPDATE vetting_session SET started_at = now() - interval '31 minutes';
    `)

    await sweepIdleRuns(db, OWNER)

    expect(await openRunTally(db, OWNER)).toBeNull()
  })
})

describe('what the screen is told — `10` §4.5', () => {
  // ⚠️ **No running ingestion any more.** An *ingestion* mints *cards* now
  // (ADR 0064) and never adds to this queue, so "nothing to vet yet, a source is
  // still generating" would tell the reader to wait for something that is not
  // on its way — `10` §4.5's state 2 retires with it.
  it('answers the whole screen in one call', async () => {
    await pending('〇␟れい', { minutesAgo: 30 })
    await flagged('一␟いち', { minutesAgo: 9 })
    await drop((await flagged('二␟に', { minutesAgo: 5 })).noteId)

    const answer = await vetQueue(db, OWNER)

    expect(answer).toMatchObject({ flagged: 1, vetted: 1, rejections: 1 })
    expect(answer).not.toHaveProperty('running')
    expect(answer).not.toHaveProperty('pending')
  })
})
