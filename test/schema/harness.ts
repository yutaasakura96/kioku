// The schema tier's database — `11-testing-plan.md` §1 and §5, ADR 0038.
//
// ⚠️ **Built by the real migrations, through Drizzle's own PGlite migrator**
// (verification §14.4). A hand-written test schema would be a second copy of
// `04`, and `04` §13's entire argument is that copies drift — in the most
// damaging direction, because the copy is what the tests would then be proving
// correct.
//
// PGlite 0.5.8 is **PostgreSQL 18.3**, measured rather than read: its own
// documentation does not state which PostgreSQL it builds (verification §14.1).
// That measurement is load-bearing — `04` defaults every primary key to
// `uuidv7()`, a Postgres 18 built-in, so a PGlite that regressed to 17 fails on
// the first `CREATE TABLE`. **Nothing will tell you when the two halves of that
// pin diverge except a `uuidv7()` that stops existing**, which is why
// `schema.test.ts` asserts the version out loud.
//
// ⚠️ PGlite is **single-connection**, and that is where this tier stops: `04`
// §6.4's job claim (`FOR UPDATE SKIP LOCKED`) and ADR 0028's reconnect loop both
// need a second session to mean anything, and its multiplexer is an
// approximation of the very thing under test. Those three behaviours belong to
// the Python worker and a real Postgres 18 container (`11` §4).

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { fileURLToPath } from 'node:url'

import * as schema from '../../server/db/schema'

const MIGRATIONS = fileURLToPath(new URL('../../server/db/migrations', import.meta.url))

export type SchemaDatabase = Awaited<ReturnType<typeof freshDatabase>>['db']

/** Boots an in-process Postgres and runs every migration in order. ~1 s. */
export async function freshDatabase() {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS })
  return { client, db }
}

/**
 * Every table in the schema, in no particular order — `TRUNCATE … CASCADE`
 * does not care, and listing them explicitly means a table added without a
 * thought about test isolation shows up as a stale row rather than a mystery.
 *
 * ⚠️ `TRUNCATE` does not fire the `FOR EACH ROW` trigger on `review_log`, which
 * is what makes a reset between tests possible at all. That is a property of
 * `TRUNCATE`, not a hole in the guard: it is DDL-adjacent and takes an
 * `ACCESS EXCLUSIVE` lock, and no application path issues one.
 */
const ALL_TABLES = [
  'card_flag',
  'review_log',
  'review_session_card',
  'review_session',
  'scheduling_epoch',
  'card',
  'note_vetting',
  'vetting_session',
  'level_claim',
  'note_field_provenance',
  'occurrence',
  'note',
  'job',
  'ingestion_chunk',
  'generation_cache',
  'ingestion',
  'source_chunk',
  'source',
  'auth."verification"',
  'auth."account"',
  'auth."session"',
  'auth."user"',
]

export async function reset(client: PGlite) {
  await client.exec(`TRUNCATE ${ALL_TABLES.join(', ')} CASCADE;`)
}

/**
 * The chain milestone 1 walks, end to end: an owner, a *source*, a *note*, an
 * acceptance, a *card*, its first *scheduling epoch*, a *session* and one graded
 * *review log* row. Every test below reaches for some prefix of it.
 *
 * ids are fixed rather than generated so a failure names a row you can find.
 */
export async function seed(client: PGlite) {
  const rows = await client.query<{ id: string }>(`
    INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('usr_test', 'Reader', 'reader@example.test', true, now(), now())
    RETURNING id;
  `)
  const ownerId = rows.rows[0]!.id

  const source = await one<{ id: string }>(client, `
    INSERT INTO source (subject_id, title, content, content_hash, char_count)
    VALUES ('jlpt-vocab', '朝日新聞 社説', '駅の近くに図書館があります。', 'a3f9', 14)
    RETURNING id;
  `)

  const sourceChunk = await one<{ id: string }>(client, `
    INSERT INTO source_chunk (source_id, ordinal, char_start, char_end, content_hash)
    VALUES ('${source.id}', 0, 0, 14, '7c11')
    RETURNING id;
  `)

  const note = await one<{ id: string }>(client, `
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab', '図書館␟としょかん', '{"term":"図書館","reading":"としょかん"}'::jsonb)
    RETURNING id;
  `)

  const vettingSession = await one<{ id: string }>(client, `
    INSERT INTO vetting_session (owner_id) VALUES ('${ownerId}') RETURNING id;
  `)

  await client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, seconds_to_vet, vetting_session_id, vetted_at)
    VALUES ('${note.id}', '${ownerId}', 'accepted', 3.41, '${vettingSession.id}', now());
  `)

  const card = await one<{ id: string }>(client, `
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${note.id}', '${ownerId}', 'recognition')
    RETURNING id;
  `)

  const epoch = await one<{ id: string }>(client, `
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days, reps, lapses, state)
    VALUES ('${card.id}', '${ownerId}', 1, now(), 61.4, 5.2, 63, 7, 1, 2)
    RETURNING id;
  `)

  const reviewSession = await one<{ id: string }>(client, `
    INSERT INTO review_session (owner_id, size) VALUES ('${ownerId}', 20) RETURNING id;
  `)

  return {
    ownerId,
    sourceId: source.id,
    sourceChunkId: sourceChunk.id,
    noteId: note.id,
    vettingSessionId: vettingSession.id,
    cardId: card.id,
    epochId: epoch.id,
    reviewSessionId: reviewSession.id,
  }
}

/** One graded answer — the row the whole schema is arranged to protect. */
export async function grade(
  client: PGlite,
  ids: { cardId: string, epochId: string, ownerId: string, reviewSessionId: string },
  rating = 3,
) {
  return one<{ id: string }>(client, `
    INSERT INTO review_log
      (card_id, scheduling_epoch_id, owner_id, review_session_id,
       rating, state, due, stability, difficulty, scheduled_days, learning_steps, reviewed_at)
    VALUES ('${ids.cardId}', '${ids.epochId}', '${ids.ownerId}', '${ids.reviewSessionId}',
            ${rating}, 2, now(), 61.4, 5.2, 63, 0, now())
    RETURNING id;
  `)
}

async function one<T>(client: PGlite, sql: string): Promise<T> {
  const result = await client.query<T>(sql)
  return result.rows[0]!
}
