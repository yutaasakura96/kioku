// `S10` end to end — the figures, on a document a signed-in reader is actually
// served. ⚠️ **Rebuilt by #23** (ADR 0062).
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
// ⚠️ **The boundary is crossed by one act, not by two fixtures.** Nineteen
// *cards* are minted, the document is read, **one more word is minted**, and the
// document is read again. That is the reader's own path across a boundary, and
// it is the arrangement that catches one evaluated at boot or cached across a
// page load.
//
// ⚠️ **No threshold is asserted here either** (ADR 0037). The seeded retention
// is 75% because a fixture needs a number, and nothing below says 75 is good.
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

/**
 * One column's figure, read out of the document by its own eyebrow.
 *
 * ⚠️ **A bare `toContain` on this screen is an assertion about a haystack, and
 * `/code-review` caught it being exactly that.** `toContain('5%')` for flag rate
 * **passes on retention's `75%`**, because `'75%'.includes('5%')` — measured, it
 * is true — so the assertion held whatever the flag-rate column rendered, or
 * failed to render. `toContain('20')` would likewise pass on the ledger's `900`
 * and on a stylesheet hash, and `toContain('>20<')` fails on a slot the renderer
 * emits as `>20 <!--comment-->`.
 *
 * § Carrying has carried the negative form of this since 2026-09-12 — *a
 * `not.toContain` over markup is an assertion about a haystack*. ⚠️ **The
 * positive form has the same defect and this screen is where it bites**, because
 * four of the five columns render a percentage and every one of them is a
 * substring of some other.
 */
function figure(document: string, eyebrow: string): string {
  const pattern = new RegExp(`${eyebrow}</dt><dd class="figure"[^>]*>([^<]*)<`)
  return document.match(pattern)?.[1]?.trim() ?? ''
}

let ingestionId: string
const cards: string[] = []
const epochs: string[] = []

/** A word, minted — after ADR 0064 those are one act. */
async function mint(key: string): Promise<{ noteId: string, cardId: string, epochId: string }> {
  const noteId = await one(`
    INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
    VALUES ('jlpt-vocab', '${key}', '{"term":"図書館"}'::jsonb, '${ingestionId}')
    RETURNING id;
  `)

  await database.client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
    VALUES ('${noteId}', '${reader.userId}', 'accepted', now());
  `)

  const cardId = await one(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${noteId}', '${reader.userId}', 'recognition')
    RETURNING id;
  `)

  const epochId = await one(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days)
    VALUES ('${cardId}', '${reader.userId}', 1, now() + interval '1 day', 3.1, 5.2, 1)
    RETURNING id;
  `)

  return { noteId, cardId, epochId }
}

beforeAll(async () => {
  const sourceId = await one(`
    INSERT INTO source (subject_id, kind, title, content, content_hash, char_count, submitted_at)
    VALUES ('jlpt-vocab', 'word_list', '技術語彙', '図書館', 'hash', 3,
            now() - interval '25 days')
    RETURNING id;
  `)

  ingestionId = await one(`
    INSERT INTO ingestion
      (source_id, source_title, subject_id, status, submitted_at, model_id, prompt_version,
       input_tokens, output_tokens, cost_micro_usd, worker_environment)
    VALUES ('${sourceId}', '技術語彙', 'jlpt-vocab', 'complete',
            now() - interval '25 days', 'claude-sonnet-5', 'v3', 4200, 900, 31400, 'laptop')
    RETURNING id;
  `)

  // Nineteen minted words — one short of flag rate's boundary.
  for (let index = 0; index < 19; index++) {
    const { cardId, epochId } = await mint(`word-${index}`)
    cards.push(cardId)
    epochs.push(epochId)
  }

  // Twenty *grades*, every one of them on a *card* already in the Review state
  // (`state = 2`) so every one qualifies: fifteen Good and five Forgot, which is
  // 75%. Fifteen **distinct days**, so consistency reads 15 of 21.
  //
  // ⚠️ **Every instant is `now() - N days` exactly, and the five extra *grades*
  // share the sixth day's instant rather than being spread across it.** The
  // fifteen spine rows are each exactly 24 hours apart, so they fall in fifteen
  // different local days whatever hour the suite runs at — but the first draft
  // offset the extra five by 105 to 133 minutes, and `/code-review` found that
  // a run between about 01:47 and 04:00 UTC pushes them across the 04:00 cutoff
  // into a **sixteenth** day, turning 71% into 76%. A fixture that depends on
  // the wall clock is a test that fails at night.
  //
  // Five rows at one instant is legal and is what the metrics need to see:
  // retention counts rows and reads twenty, and `gradeMinutes` is truncated to
  // the minute so consistency reads one day.
  for (let index = 0; index < 20; index++) {
    const daysAgo = index < 15 ? 20 - index : 6
    const rating = index < 15 ? 3 : 1

    await database.client.exec(`
      INSERT INTO review_log
        (card_id, scheduling_epoch_id, owner_id, rating, state, due, stability, difficulty,
         scheduled_days, learning_steps, reviewed_at, received_at)
      VALUES ('${cards[index % 19]}', '${epochs[index % 19]}', '${reader.userId}',
              ${rating}, 2, now() + interval '1 day', 3.1, 5.2, 1, 0,
              now() - interval '${daysAgo} days', now() - interval '${daysAgo} days');
    `)
  }

  // One `S9` flag, twice on the same *card* — ⚠️ **the pair that separates flag
  // rate from *false-accept rate***. Two rows, one flagged *card*.
  const flagged = await one(`SELECT note_id AS id FROM card WHERE id = '${cards[0]}';`)
  for (let attempt = 0; attempt < 2; attempt++) {
    await database.client.exec(`
      INSERT INTO card_flag (card_id, note_id, owner_id, prompt_version, model_id)
      VALUES ('${cards[0]}', '${flagged}', '${reader.userId}', 'v3', 'claude-sonnet-5');
    `)
  }
})

describe('nineteen minted cards — flag rate is suppressed and the rest are not', () => {
  it('says why, and keeps ADR 0058\'s argument verbatim', async () => {
    const document = await stats()

    expect(document).toContain('flag rate and time to first review at 20 cards')
    expect(document).toContain('A rate over seventeen is noise.')
  })

  // `S10`, PRD §4: raw counts show. `10` §8.2 — "not hidden, not dashed out:
  // the reader can see the numbers accumulating toward the threshold".
  it('shows the raw pair behind the withheld ratio rather than a percentage', async () => {
    const document = await stats()

    // ⚠️ **The pair is the assertion, and a `not.toContain('%')` would not have
    // been one** (§ Carrying, measured 2026-09-12): the document is HTML and
    // `href="/vet?from=%2Fstats"` alone satisfies the loose version while the
    // screen reports a rate over nineteen *cards*. Worse here than there — 1 of
    // 19 and 1 of 20 both round to 5%, so the **only** thing that distinguishes
    // the suppressed screen from the reporting one is the pair and the aside.
    expect(figure(document, 'FLAG RATE')).toBe('1 / 19') // flagged cards ÷ cards minted
    expect(document).toContain('Each ratio appears once there is enough behind it')
  })

  it('names the retired figures nowhere on the screen', async () => {
    const document = await stats()

    expect(document).not.toContain('ACCEPTANCE RATE')
    expect(document).not.toContain('SECONDS PER NOTE')
    expect(document).not.toContain('FALSE-ACCEPT RATE')
    expect(document).not.toContain('NOTES VETTED')
  })

  it('shows the count the boundary is measured on', async () => {
    expect(figure(await stats(), 'CARDS MINTED')).toBe('19')
  })
})

describe('the figures that already have their evidence', () => {
  // ⚠️ Fifteen Good or Easy over twenty *grades* given to *cards* already in the
  // Review state. The five Forgot are in the denominator; a first answer or a
  // relearning answer would not have been in either.
  it('reads retention over reviews of a card already learned', async () => {
    expect(figure(await stats(), 'RETENTION')).toBe('75%')
  })

  // Fifteen distinct days studied, over twenty-one days since the first *grade*.
  it('reads consistency as days studied over days there were to study', async () => {
    expect(figure(await stats(), 'CONSISTENCY')).toBe('71%')
  })

  // Submitted twenty-five days ago, first *reviewed* twenty days ago.
  // ⚠️ **It is suppressed here, and the first draft of this test did not notice.**
  // *Time-to-first-review* is gated on minted *cards*, so at nineteen it shows
  // its pair — one *source* studied of one ingested. The draft asserted
  // `toContain('5d')` and **passed**, on the scoped-style attribute
  // `data-v-5de4d6b0`. The duration itself is asserted below, past the boundary.
  it('withholds time-to-first-review with the rest, showing its own pair', async () => {
    expect(figure(await stats(), 'TIME TO FIRST REVIEW')).toBe('1 / 1')
  })

  // ⚠️ `03` §12: on the number, not in a paragraph.
  it('names the environment the duration was measured in', async () => {
    expect(await stats()).toContain('laptop')
  })
})

describe('the twentieth word — flag rate appears', () => {
  beforeAll(async () => {
    await mint('word-final')
  })

  // ⚠️ **Nineteen suppresses, twenty reports**, crossed by one word arriving.
  it('drops the aside once nothing is withheld', async () => {
    expect(await stats()).not.toContain('Each ratio appears once there is enough behind it')
  })

  // ⚠️ **Two flags, one *card*, twenty minted.** `count(*)` would read 10% here
  // and look entirely reasonable; ADR 0062 makes it a share of the deck.
  // ⚠️ **Two flags, one *card*, twenty minted — so 5% and never 10%.** Read
  // through the column rather than the document: `toContain('5%')` passes on
  // retention's `75%` and would have held with this column blank.
  it('reads flag rate as distinct cards over cards minted', async () => {
    expect(figure(await stats(), 'FLAG RATE')).toBe('5%')
  })

  it('counts the new card', async () => {
    expect(figure(await stats(), 'CARDS MINTED')).toBe('20')
  })

  // Submitted twenty-five days ago, first *reviewed* twenty days ago — and it
  // shares flag rate's gate, so this is the first read where it is a duration.
  it('reads time-to-first-review from the source\'s own submission', async () => {
    expect(figure(await stats(), 'TIME TO FIRST REVIEW')).toBe('5d')
  })
})

describe('the ledger — `10` §8.3', () => {
  it('carries the run, its model, its tokens and its cost', async () => {
    const document = await stats()

    expect(document).toContain('技術語彙')
    expect(document).toContain('claude-sonnet-5')
    expect(document).toContain('4,200')
    expect(document).toContain('$0.0314')
  })
})
