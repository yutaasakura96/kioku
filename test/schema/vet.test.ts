// *Vet*'s three keystrokes, minting and undo — `server/utils/vet/`, against a
// real database.
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
import { queueBatch, runningIngestion, vetQueue } from '../../server/utils/vet/queries'
import { undoLastDecision } from '../../server/utils/vet/undo'
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
  { owner = OWNER, minutesAgo = 0, fields = FIELDS, flagged = false } = {},
): Promise<string> {
  const note = await one<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab', '${key}', '${JSON.stringify(fields)}'::jsonb)
    RETURNING id;
  `)

  await client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, created_at, flagged_at)
    VALUES ('${note.id}', '${owner}', now() - interval '${minutesAgo} minutes',
            ${flagged ? 'now()' : 'null'});
  `)

  return note.id
}

function accept(noteId: string, overrides: Partial<VetDecision> = {}) {
  return decide(db, OWNER, { noteId, action: 'accept', secondsToVet: 3.41, edits: null, ...overrides })
}

function reject(noteId: string) {
  return decide(db, OWNER, { noteId, action: 'reject', secondsToVet: 1.2, edits: null })
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

describe('the queue — `04` §12\'s first query', () => {
  it('is this owner\'s pending notes, oldest first', async () => {
    const second = await pending('二␟に', { minutesAgo: 5 })
    const first = await pending('一␟いち', { minutesAgo: 9 })
    await pending('三␟さん', { minutesAgo: 1, owner: OTHER })

    const batch = await queueBatch(db, OWNER)

    expect(batch.map(note => note.noteId)).toEqual([first, second])
  })

  it('carries the fields, the provenance and the level claims the screen renders', async () => {
    const noteId = await pending('図書館␟としょかん')
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

  it('marks a note returned by a flag — `10` §4.3\'s aside', async () => {
    await pending('開く␟ひらく', { flagged: true })

    expect((await queueBatch(db, OWNER))[0]!.flagged).toBe(true)
  })

  // ⚠️ `note.origin_ingestion_id` is `SET NULL` on a hard delete, because a
  // *note* outlives the run that made it (`04` §9). An inner join to `ingestion`
  // for the chrome bar's *source* name would drop those notes out of the queue.
  it('keeps a note whose source has been hard-deleted', async () => {
    await pending('図書館␟としょかん')

    const batch = await queueBatch(db, OWNER)

    expect(batch).toHaveLength(1)
    expect(batch[0]!.sourceTitle).toBeNull()
  })

  it('drops a note the moment it is decided', async () => {
    const noteId = await pending('図書館␟としょかん')
    await accept(noteId)

    expect(await queueBatch(db, OWNER)).toEqual([])
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

describe('`Z` — ADR 0033, and the one exception to `04` §9.1', () => {
  it('un-mints the card it minted and returns the note to the head of the queue', async () => {
    const older = await pending('一␟いち', { minutesAgo: 9 })
    await pending('二␟に', { minutesAgo: 5 })
    await accept(older)

    expect(await undoLastDecision(db, OWNER)).toEqual({ ok: true, noteId: older })

    expect(await count('card')).toBe(0)
    expect((await queueBatch(db, OWNER))[0]!.noteId).toBe(older)
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

describe('what the empty states are told — `10` §4.5, `09` §7', () => {
  async function ingestion(status: string, { chunks = 4, complete = 1 } = {}) {
    const source = await one<{ id: string }>(`
      INSERT INTO source (subject_id, title, content, content_hash, char_count)
      VALUES ('jlpt-vocab', '朝日新聞 社説', '駅の近くに図書館があります。', 'a3f9', 14) RETURNING id;
    `)
    for (let ordinal = 0; ordinal < chunks; ordinal += 1) {
      await client.exec(`
        INSERT INTO source_chunk (source_id, ordinal, char_start, char_end, content_hash)
        VALUES ('${source.id}', ${ordinal}, ${ordinal}, ${ordinal + 1}, 'c${ordinal}');
      `)
    }
    const run = await one<{ id: string }>(`
      INSERT INTO ingestion (source_id, source_title, subject_id, status, submitted_by)
      VALUES ('${source.id}', '朝日新聞 社説', 'jlpt-vocab', '${status}', '${OWNER}') RETURNING id;
    `)
    for (let ordinal = 0; ordinal < complete; ordinal += 1) {
      await client.exec(`
        INSERT INTO ingestion_chunk (ingestion_id, source_chunk_id, status)
        SELECT '${run.id}', id, 'complete' FROM source_chunk
        WHERE source_id = '${source.id}' AND ordinal = ${ordinal};
      `)
    }
    return run.id
  }

  it('reports a running ingestion, in the formatter `/` already uses', async () => {
    await ingestion('running', { chunks: 4, complete: 1 })

    expect(await runningIngestion(db)).toEqual({
      title: '朝日新聞 社説',
      status: 'running',
      detail: '1 of 4 chunks',
    })
  })

  it('reports a queued ingestion that nothing has picked up', async () => {
    await ingestion('queued', { complete: 0 })

    expect((await runningIngestion(db))?.detail).toMatch(/^queued .*, not yet picked up$/)
  })

  // ⚠️ `incomplete` is resumable (`04` §6.1) and **nothing is coming for it**
  // until somebody presses resume, so reporting it here would tell a reader to
  // wait for something that is not on its way.
  it.each(['complete', 'incomplete', 'failed'])('says nothing is running for %s', async (status) => {
    await ingestion(status)

    expect(await runningIngestion(db)).toBeNull()
  })

  it('answers the whole screen in one call', async () => {
    await pending('一␟いち', { minutesAgo: 9 })
    await reject(await pending('二␟に', { minutesAgo: 5 }))
    await ingestion('running', { chunks: 4, complete: 1 })

    expect(await vetQueue(db, OWNER)).toMatchObject({
      pending: 1,
      vetted: 1,
      rejections: 1,
      running: { title: '朝日新聞 社説' },
    })
  })
})
