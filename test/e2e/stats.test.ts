// `S10` end to end — the six figures, on a document a signed-in reader is
// actually served.
//
// ⚠️ **This is the only place the three halves meet.** The arithmetic has a unit
// seam (`test/unit/stats-metrics.test.ts`), the rows have a schema-tier one
// (`test/schema/stats.test.ts`), and the grid has a component one
// (`test/nuxt/stats-figures.test.ts`). None of them can observe the middleware
// reader, the *place* that calls it and the renderer agreeing — which is exactly
// the joint ADR 0001 cares about, because **the numbers are the deliverable**
// and a figure that is correct in three modules and absent from the page is a
// milestone that did not close.
//
// ⚠️ **The boundary is crossed by one decision, not by two fixtures.** Nineteen
// vetted *notes* are seeded, the document is read, **one more *note* is
// rejected**, and the document is read again. That is the reader's own path
// across `S10`'s only branch, and it is the arrangement that catches a boundary
// evaluated once at boot or cached across a page load.
//
// ⚠️ **No threshold is asserted here either** (ADR 0037). The seeded median is
// four seconds because a fixture needs a number, and nothing below says four is
// good.
//
// ⚠️ **That the three *places* ship no `<script>` while signed in is
// `test/e2e/ingest.test.ts`'s** — #6 paid `11` §6.1's debt there and `/stats` is
// in its list. It is not re-asserted here.

import { fileURLToPath } from 'node:url'
import { $fetch as nuxtFetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TEST_ENVIRONMENT } from './environment'
import { signIn } from './session'
import { startTestDatabase } from './database'
import type { TestDatabase } from './database'

const database: TestDatabase = await startTestDatabase()
const reader = await signIn(database.client)

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  env: { ...TEST_ENVIRONMENT, DATABASE_URL: database.connectionString },
})

afterAll(async () => {
  await database.stop()
})

function stats() {
  return nuxtFetch<string>('/stats', { headers: { cookie: reader.cookie } })
}

async function one(sql: string): Promise<string> {
  return (await database.client.query<{ id: string }>(sql)).rows[0]!.id
}

/** One judged *note* from the run that produced it. */
async function note(
  ingestionId: string,
  key: string,
  { state = 'accepted', edited = false, seconds = null as number | null } = {},
): Promise<string> {
  const noteId = await one(`
    INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
    VALUES ('jlpt-vocab', '${key}', '{"term":"図書館"}'::jsonb, '${ingestionId}')
    RETURNING id;
  `)

  await database.client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, edited, seconds_to_vet, vetted_at)
    VALUES ('${noteId}', '${reader.userId}', '${state}', ${edited},
            ${seconds === null ? 'null' : seconds}, now());
  `)

  return noteId
}

let ingestionId: string

beforeAll(async () => {
  const sourceId = await one(`
    INSERT INTO source (subject_id, title, content, content_hash, char_count, submitted_at)
    VALUES ('jlpt-vocab', '朝日新聞 社説', '駅の近くに図書館があります。', 'hash', 14,
            now() - interval '60 minutes')
    RETURNING id;
  `)

  ingestionId = await one(`
    INSERT INTO ingestion
      (source_id, source_title, subject_id, status, submitted_at, model_id, prompt_version,
       input_tokens, output_tokens, cost_micro_usd, worker_environment)
    VALUES ('${sourceId}', '朝日新聞 社説', 'jlpt-vocab', 'complete',
            now() - interval '60 minutes', 'claude-sonnet-5', 'v3', 4200, 900, 31400, 'laptop')
    RETURNING id;
  `)

  // Nineteen decisions: fourteen straight accepts, three the reader fixed
  // (`S6` — an **edit**), two rejections.
  const accepted: string[] = []
  for (let index = 0; index < 14; index++)
    accepted.push(await note(ingestionId, `accept-${index}`, { seconds: 4 }))

  for (let index = 0; index < 3; index++)
    await note(ingestionId, `edit-${index}`, { edited: true, seconds: 30 })

  for (let index = 0; index < 2; index++)
    await note(ingestionId, `reject-${index}`, { state: 'rejected' })

  // One *card*, studied — the right-hand end of *time-to-first-review*.
  const cardId = await one(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${accepted[0]}', '${reader.userId}', 'recognition')
    RETURNING id;
  `)

  const epochId = await one(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
    VALUES ('${cardId}', '${reader.userId}', 1, now() + interval '1 day', 3.1, 5.2, 1)
    RETURNING id;
  `)

  await database.client.exec(`
    INSERT INTO review_log
      (card_id, scheduling_epoch_id, owner_id, rating, state, due, stability, difficulty,
       scheduled_days, learning_steps, reviewed_at, received_at)
    VALUES ('${cardId}', '${epochId}', '${reader.userId}', 3, 0, now() + interval '1 day',
            3.1, 5.2, 1, 0, now() - interval '45 minutes', now() - interval '45 minutes');
  `)

  // One `S9` flag — *false-accept rate*'s numerator, and ⚠️ the *note* stays
  // `accepted` (ADR 0056), which is what keeps the denominator still.
  await database.client.exec(`
    INSERT INTO card_flag (card_id, note_id, owner_id, prompt_version, model_id)
    VALUES ('${cardId}', '${accepted[0]}', '${reader.userId}', 'v3', 'claude-sonnet-5');
  `)
})

describe('nineteen vetted notes — the ratios are suppressed', () => {
  it('says why, in `10` §8.2\'s own sentence', async () => {
    expect(await stats()).toContain('Ratios appear at twenty vetted notes. A rate over seventeen is noise.')
  })

  // `S10`, PRD §4: raw counts show. `10` §8.2 — "not hidden, not dashed out:
  // the reader can see the numbers accumulating toward the threshold".
  it('shows the raw pair behind each ratio rather than a percentage', async () => {
    const document = await stats()

    expect(document).toContain('14 / 19') // unedited accepts ÷ notes generated
    expect(document).toContain('1 / 17') //  flags ÷ accepted notes
    expect(document).toContain('1 / 1') //   sources studied ÷ sources ingested

    // ⚠️ Named rather than a bare `not.toContain('%')`: the document is HTML,
    // and `href="/vet?from=%2Fstats"` alone would satisfy the loose assertion
    // while the screen reported a rate over nineteen *notes*. 14 ÷ 19 is 74%.
    expect(document).not.toContain('74%')
  })

  it('still shows the count the boundary is measured on', async () => {
    expect(await stats()).toContain('NOTES VETTED')
  })
})

describe('the twentieth decision — the ratios appear', () => {
  beforeAll(async () => {
    await note(ingestionId, 'reject-final', { state: 'rejected' })
  })

  // ⚠️ **Nineteen suppresses, twenty reports** (`11` §3), crossed by one
  // keystroke's worth of state. Fourteen unedited accepts over twenty *notes*
  // generated is 70%, and the three edited accepts are **edits** (`S6`).
  it('reads acceptance rate over notes generated, with an edited accept as an edit', async () => {
    const document = await stats()

    expect(document).not.toContain('Ratios appear at twenty vetted notes.')
    expect(document).toContain('70%')
  })

  // One flag over seventeen accepted *notes* — the edited accepts are in this
  // denominator, because they are *notes* the reader vouched for.
  it('reads false-accept rate over every accepted note', async () => {
    expect(await stats()).toContain('6%')
  })

  // ⚠️ Over unedited accepts only (`11` §3): the three thirty-second edits are
  // not in it, and a median that included them would read seven.
  it('reads the median seconds-per-note over unedited accepts only', async () => {
    expect(await stats()).toContain('4.0')
  })

  // Submitted sixty minutes ago, first *reviewed* forty-five minutes ago.
  it('reads time-to-first-review from the source\'s own submission', async () => {
    expect(await stats()).toContain('15m')
  })

  // ⚠️ `03` §12: on the number, not in a paragraph.
  it('names the environment the duration was measured in', async () => {
    expect(await stats()).toContain('laptop')
  })

  it('counts every decided note', async () => {
    expect(await stats()).toContain('20')
  })
})

describe('the ledger — `10` §8.3', () => {
  it('carries the run, its model, its tokens and its cost', async () => {
    const document = await stats()

    expect(document).toContain('朝日新聞 社説')
    expect(document).toContain('claude-sonnet-5')
    expect(document).toContain('4,200')
    expect(document).toContain('$0.0314')
  })
})
