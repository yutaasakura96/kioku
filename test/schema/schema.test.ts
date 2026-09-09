// The schema tier of `11-testing-plan.md` §1 and §5: every constraint, trigger
// and delete rule in `04-database-schema.md`, run against PGlite by Drizzle's
// own migrations — so the test database is built by the same migrations as
// production rather than by a second copy of the schema that drifts
// (ADR 0038, verification §14.4).
//
// ⚠️ **These are the tests that matter most and also the cheapest.** `04` puts
// the load-bearing rules in the schema, and the framing this tier was designed
// under — *a mock cannot fail a foreign key* — turned out to be true and
// irrelevant: PGlite is not a mock, it is Postgres, and every refusal below is
// the real error message from the real constraint.
//
// ⚠️ **What is deliberately not here:** the job claim under two workers, the
// stale-claim sweep, and a `LISTEN` torn down and recovered by the poll. All
// three need a second session, PGlite is single-connection, and all three belong
// to the Python worker and a real Postgres 18 container (ADR 0038, `11` §4).

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { freshDatabase, grade, reset, seed } from './harness'

let client: PGlite

beforeAll(async () => {
  ({ client } = await freshDatabase())
}, 30_000)

beforeEach(async () => {
  await reset(client)
})

describe('the shape the migrations actually build', () => {
  // ⚠️ Half of a pin, and the half nothing else will tell you about. `04`
  // defaults every primary key to `uuidv7()`, a Postgres 18 built-in
  // (verification §10.1), and PGlite does not document which PostgreSQL it
  // builds — 0.5.8 = 18.3 was measured (ADR 0038, verification §14.1). A PGlite
  // that regressed to 17 fails on the first `CREATE TABLE`; this says so in one
  // line instead of leaving a migration to fail obscurely.
  it('is PostgreSQL 18 or later, because uuidv7() is a Postgres 18 built-in', async () => {
    const version = await client.query<{ v: string }>('SELECT version() AS v;')
    expect(version.rows[0]!.v).toMatch(/PostgreSQL 1[89]|PostgreSQL [2-9]\d/)

    const generated = await client.query<{ id: string }>('SELECT uuidv7() AS id;')
    expect(generated.rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('has the eighteen tables of 04 plus the auth library\'s four', async () => {
    const ours = await client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '__drizzle_migrations'
      ORDER BY table_name;
    `)
    expect(ours.rows.map(r => r.table_name)).toEqual([
      'card',
      'card_flag',
      'generation_cache',
      'ingestion',
      'ingestion_chunk',
      'job',
      'level_claim',
      'note',
      'note_field_provenance',
      'note_vetting',
      'occurrence',
      'review_log',
      'review_session',
      'review_session_card',
      'scheduling_epoch',
      'source',
      'source_chunk',
      'vetting_session',
    ])

    // `04` §8: in a separate `auth` Postgres schema, which makes "this project
    // does not own these four tables" structural rather than a comment — and
    // keeps `user`, a reserved word, out of `public`.
    const theirs = await client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'auth' ORDER BY table_name;
    `)
    expect(theirs.rows.map(r => r.table_name)).toEqual([
      'account',
      'session',
      'user',
      'verification',
    ])
  })

  // `04` §14 and §7.5. The trigger is singular on purpose: ADR 0011's pattern is
  // to pin the irreplaceable data and guard it in more than one place, and it
  // names exactly one thing as irreplaceable. A second trigger appearing here is
  // a decision someone owes an argument for.
  it('carries exactly one trigger, on review_log', async () => {
    const triggers = await client.query<{ table: string, trigger: string }>(`
      SELECT c.relname AS table, t.tgname AS trigger
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal;
    `)
    expect(triggers.rows).toEqual([
      { table: 'review_log', trigger: 'review_log_append_only' },
    ])
  })
})

describe('review_log is append-only', () => {
  // `04` §7.5, §14. Enforced twice: the application never issues either
  // statement, and this trigger raises if anything does. A guard that lives only
  // in application code is one a migration or a psql session walks past.
  it('refuses an UPDATE', async () => {
    const ids = await seed(client)
    await grade(client, ids)

    await expect(client.exec('UPDATE review_log SET rating = 4;')).rejects.toThrow(
      /append-only/,
    )
  })

  // ⚠️ The `DELETE` half is the one an "archive old rows" cleanup would reach
  // for, which is why `11` §5 names it separately.
  it('refuses a DELETE', async () => {
    const ids = await seed(client)
    await grade(client, ids)

    await expect(client.exec('DELETE FROM review_log;')).rejects.toThrow(/append-only/)
  })
})

describe('nothing irreplaceable cascades', () => {
  // `04` §9. The epoch and the log are the history; a card is never deleted.
  it('refuses to delete a card that has a review_log', async () => {
    const ids = await seed(client)
    await grade(client, ids)

    await expect(client.exec(`DELETE FROM card WHERE id = '${ids.cardId}';`)).rejects.toThrow(
      /violates RESTRICT setting of foreign key constraint/,
    )
  })

  // `04` §3, and the second of ADR 0011's two independent guards — the first
  // being that the app has no delete-account path at all.
  //
  // ⚠️ This is the correction, not the default. Better Auth's generated schema
  // wires every child of `user` with `onDelete: "cascade"` (verification §10.2),
  // and copying that convention onto personal entities would make deleting one
  // row destroy every scheduling epoch and review log beneath it — which
  // `03` §13.6 names as the worst thing an attacker could do.
  it('refuses to delete the owner while any history references it', async () => {
    const ids = await seed(client)
    await grade(client, ids)

    await expect(
      client.exec(`DELETE FROM auth."user" WHERE id = '${ids.ownerId}';`),
    ).rejects.toThrow(/violates RESTRICT setting of foreign key constraint/)
  })
})

describe('Z un-mints the card its own acceptance created', () => {
  // ADR 0033, `04` §9.1 as amended 2026-09-07. The undo is legal precisely
  // because the card it removes is provably historyless — minted inside the run
  // that is now taking it back.
  it('deletes a historyless card in the same transaction', async () => {
    const ids = await seed(client)

    await client.exec(`
      BEGIN;
      UPDATE note_vetting SET state = 'pending', vetted_at = NULL
        WHERE note_id = '${ids.noteId}' AND owner_id = '${ids.ownerId}';
      DELETE FROM scheduling_epoch WHERE card_id = '${ids.cardId}';
      DELETE FROM card WHERE id = '${ids.cardId}';
      COMMIT;
    `)

    const remaining = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM card WHERE id = '${ids.cardId}';`,
    )
    expect(remaining.rows[0]!.n).toBe(0)
  })

  // ⚠️ **And if that proof is ever wrong, the database refuses and `Z` fails
  // visibly** — which is the whole reason `review_log → card` and
  // `review_session_card → card` are both `RESTRICT` rather than a comment
  // saying it cannot happen.
  it('fails on the RESTRICT if that card has reached a review_log', async () => {
    const ids = await seed(client)
    await grade(client, ids)

    await expect(
      client.exec(`DELETE FROM card WHERE id = '${ids.cardId}';`),
    ).rejects.toThrow(/violates RESTRICT setting of foreign key constraint/)
  })

  it('fails on the RESTRICT if that card has reached a review_session_card', async () => {
    const ids = await seed(client)
    await client.exec(`
      INSERT INTO review_session_card (review_session_id, ordinal, card_id, owner_id)
      VALUES ('${ids.reviewSessionId}', 0, '${ids.cardId}', '${ids.ownerId}');
    `)

    await expect(
      client.exec(`DELETE FROM card WHERE id = '${ids.cardId}';`),
    ).rejects.toThrow(/violates RESTRICT setting of foreign key constraint/)
  })
})

describe('scheduling state hangs off the epoch, never off the card', () => {
  // `04` §7.4. Without the partial unique index "the current epoch" is a
  // convention; with it, it is a constraint that happens to be the lookup.
  it('refuses a second scheduling_epoch with superseded_at IS NULL', async () => {
    const ids = await seed(client)

    await expect(client.exec(`
      INSERT INTO scheduling_epoch
        (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
      VALUES ('${ids.cardId}', '${ids.ownerId}', 2, now(), 0.4, 5.2, 1);
    `)).rejects.toThrow(/scheduling_epoch_one_live_per_card/)
  })

  // **A reset is an `INSERT`, not an `UPDATE` over the history it is meant to
  // preserve.** This is the row a system that stored state on the card would no
  // longer have, and `S12` exports it.
  it('leaves ordinal 1 intact after a reset, with its original stability, reps and lapses', async () => {
    const ids = await seed(client)

    await client.exec(`
      BEGIN;
      UPDATE scheduling_epoch
        SET superseded_at = now(), superseded_reason = 'memory_bearing_field_changed'
        WHERE id = '${ids.epochId}';
      INSERT INTO scheduling_epoch
        (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days, reps, lapses, state)
      VALUES ('${ids.cardId}', '${ids.ownerId}', 2, now(), 0.4, 5.2, 1, 0, 0, 0);
      COMMIT;
    `)

    const first = await client.query<{
      stability: number
      reps: number
      lapses: number
    }>(`SELECT stability, reps, lapses FROM scheduling_epoch WHERE ordinal = 1;`)

    expect(first.rows[0]).toEqual({ stability: 61.4, reps: 7, lapses: 1 })
  })
})

describe('soft-deleting a source', () => {
  // `09` §4.11, `S11`, ADR 0011. The two statements below are the ones the
  // handler will issue — #6 owns the handler. **What is under test here is that
  // the schema lets exactly that happen and nothing more:** no cascade reaches
  // the history, and the source is still readable afterwards.
  it('suspends its cards, leaves review_log identical, and leaves the source readable', async () => {
    const ids = await seed(client)
    await grade(client, ids)

    const before = await client.query('SELECT * FROM review_log ORDER BY id;')

    await client.exec(`
      BEGIN;
      UPDATE source SET deleted_at = now() WHERE id = '${ids.sourceId}';
      UPDATE card SET suspended_at = now(), suspended_reason = 'source_deleted'
        WHERE id = '${ids.cardId}';
      COMMIT;
    `)

    const suspended = await client.query<{ suspended_reason: string }>(
      `SELECT suspended_reason FROM card WHERE id = '${ids.cardId}';`,
    )
    expect(suspended.rows[0]!.suspended_reason).toBe('source_deleted')

    // **Row for row identical.** Nothing about a source disappearing may touch
    // the one thing that cannot be regenerated.
    const after = await client.query('SELECT * FROM review_log ORDER BY id;')
    expect(after.rows).toEqual(before.rows)

    // A soft delete, not a delete: the source stays readable.
    const stillThere = await client.query<{ title: string, deleted_at: Date }>(
      `SELECT title, deleted_at FROM source WHERE id = '${ids.sourceId}';`,
    )
    expect(stillThere.rows).toHaveLength(1)
    expect(stillThere.rows[0]!.deleted_at).not.toBeNull()
  })

  it('refuses an unlisted suspended_reason', async () => {
    const ids = await seed(client)

    await expect(client.exec(`
      UPDATE card SET suspended_at = now(), suspended_reason = 'because'
      WHERE id = '${ids.cardId}';
    `)).rejects.toThrow(/card_suspended_reason/)
  })
})

describe('the CHECKs refuse what the handler also refuses', () => {
  // `04` §5.1 — `S2`'s cap as a constraint, refused before any spend. The
  // handler checks it server-side too (`03` §13.2); this is the schema refusing
  // it as well, which is the half that survives a second writer.
  it('refuses a character count above the cap', async () => {
    await expect(client.exec(`
      INSERT INTO source (subject_id, title, content, content_hash, char_count)
      VALUES ('jlpt-vocab', 'too long', 'x', 'deadbeef', 100001);
    `)).rejects.toThrow(/source_char_count_cap/)
  })

  // ⚠️ `04` §7.5 — `Manual = 0` is excluded, matching `ts-fsrs`'s own `Grade`
  // type (verification §1.1). Four grades, and ADR 0034's labels name recall
  // because they cannot name a time.
  it.each([0, 5])('refuses rating %i', async (rating) => {
    const ids = await seed(client)

    await expect(grade(client, ids, rating)).rejects.toThrow(/review_log_rating/)
  })

  it('accepts every rating from 1 to 4', async () => {
    const ids = await seed(client)

    for (const rating of [1, 2, 3, 4])
      await expect(grade(client, ids, rating)).resolves.toBeDefined()
  })
})

describe('a card appears once per session', () => {
  // `04` §7.7 — ADR 0016's *no same-day relearning* expressed as a constraint.
  // With `enable_short_term` off a graded card leaves the session, so twenty
  // cards is twenty answers and the *progress rail* knows its own length.
  it('refuses the same card twice in one review_session', async () => {
    const ids = await seed(client)
    await client.exec(`
      INSERT INTO review_session_card (review_session_id, ordinal, card_id, owner_id)
      VALUES ('${ids.reviewSessionId}', 0, '${ids.cardId}', '${ids.ownerId}');
    `)

    await expect(client.exec(`
      INSERT INTO review_session_card (review_session_id, ordinal, card_id, owner_id)
      VALUES ('${ids.reviewSessionId}', 1, '${ids.cardId}', '${ids.ownerId}');
    `)).rejects.toThrow(/review_session_card_session_card_key/)
  })
})

describe('content_hash detects, it does not prevent', () => {
  // `04` §5.1, PRD §5. Resubmitting identical content creates a **new** source
  // and offers to open the existing one. A unique index here would turn a
  // product decision into a 500.
  it('allows the same content_hash twice', async () => {
    const insert = `
      INSERT INTO source (subject_id, title, content, content_hash, char_count)
      VALUES ('jlpt-vocab', '社説', '同じ本文', 'same-hash', 4);
    `
    await client.exec(insert)
    await client.exec(insert)

    const rows = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM source WHERE content_hash = 'same-hash';`,
    )
    expect(rows.rows[0]!.n).toBe(2)
  })
})

describe('the note\'s identity is a constraint, not a convention', () => {
  // ADR 0006 — a collision cannot create a second note; it appends an
  // *occurrence*. `開く␟ひらく` and `開く␟あく` stay two notes, which is the pair
  // the ADR exists to keep apart.
  it('refuses a second note with the same (subject_id, identity_key)', async () => {
    await client.exec(`
      INSERT INTO note (subject_id, identity_key, fields)
      VALUES ('jlpt-vocab', '開く␟ひらく', '{}'::jsonb);
    `)

    await expect(client.exec(`
      INSERT INTO note (subject_id, identity_key, fields)
      VALUES ('jlpt-vocab', '開く␟ひらく', '{}'::jsonb);
    `)).rejects.toThrow(/note_subject_identity_key/)

    // The other reading of the same key is a different note.
    await expect(client.exec(`
      INSERT INTO note (subject_id, identity_key, fields)
      VALUES ('jlpt-vocab', '開く␟あく', '{}'::jsonb);
    `)).resolves.toBeDefined()
  })

  // `04` §5.6 — `authority_key IS NULL` means the model estimated it, and
  // `UNIQUE NULLS NOT DISTINCT` is what makes "exactly one model estimate" true.
  // Without it every null would be distinct from every other and the constraint
  // would enforce nothing on the half that needs it most.
  it('allows one claim per authority and exactly one model estimate', async () => {
    const note = await client.query<{ id: string }>(`
      INSERT INTO note (subject_id, identity_key, fields)
      VALUES ('jlpt-vocab', '図書館␟としょかん', '{}'::jsonb) RETURNING id;
    `)
    const noteId = note.rows[0]!.id

    await client.exec(`
      INSERT INTO level_claim (note_id, authority_key, level)
      VALUES ('${noteId}', 'jlpt-tango-n3', 'N3');
    `)
    await client.exec(`
      INSERT INTO level_claim (note_id, level, model_id, prompt_version)
      VALUES ('${noteId}', 'N4', 'claude-sonnet-5', 'v3');
    `)

    await expect(client.exec(`
      INSERT INTO level_claim (note_id, level, model_id, prompt_version)
      VALUES ('${noteId}', 'N5', 'claude-sonnet-5', 'v3');
    `)).rejects.toThrow(/level_claim_note_authority_key/)

    // And the two halves cannot drift: a named authority never carries a model.
    await expect(client.exec(`
      INSERT INTO level_claim (note_id, authority_key, level, model_id)
      VALUES ('${noteId}', 'jlpt-tango-n4', 'N4', 'claude-sonnet-5');
    `)).rejects.toThrow(/level_claim_attribution/)
  })
})
