// *Review* in a browser — `S7` end to end, and `11` §6.2's behavioural proxy on
// the second *mode*.
//
// Three properties are only observable here:
//
// - ⚠️ **The key handlers bind to the mode container, never to `document`**
//   (ADR 0025, `10` §4.1). `11` §6.2 says where a listener lives is not
//   assertable — `getEventListeners` is a DevTools API, inspecting Vue
//   internals tests the framework's shape — so the assertion is the behaviour
//   that distinguishes the two bindings: with focus on the Done control, which
//   is outside the container, a keystroke changes nothing. **It is a proxy and
//   it is written down as one**; if Done is ever moved inside the container this
//   test needs re-thinking rather than re-running.
// - ⚠️ **The *session* is composed server-side and prefetched as a unit**, so
//   the whole run is in the document before the first keystroke — which is what
//   `S8` is built on.
// - ⚠️ **A digit before the reveal does nothing.** A *grade* is arithmetic that
//   cannot be undone (`03` §2.4) and there is no `Z` on this screen, so the one
//   input that would permanently answer a question the reader has not been shown
//   is the one this asserts is inert.

import { fileURLToPath } from 'node:url'
import { createPage, setup, url } from '@nuxt/test-utils/e2e'
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
  browser: true,
})

afterAll(async () => {
  await database.stop()
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
 * One accepted *note* and the *card* it minted.
 *
 * ⚠️ **Nothing in this file deletes a `review_log` row, and nothing can**:
 * `04` §7.5's trigger refuses the `DELETE`, which is the point of the table
 * (ADR 0011). So the two runs below take a *card* each rather than sharing one
 * and cleaning up between them — which is § Carrying's "a committed
 * `review_log` row poisons every later test in the session", met in the tier
 * where it bites.
 */
async function acceptedCard(key: string): Promise<string> {
  const note = await database.client.query<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab', '${key}', '${JSON.stringify(FIELDS)}'::jsonb)
    RETURNING id;
  `)

  await database.client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
    VALUES ('${note.rows[0]!.id}', '${reader.userId}', 'accepted', now());
  `)

  const card = await database.client.query<{ id: string }>(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${note.rows[0]!.id}', '${reader.userId}', 'recognition')
    RETURNING id;
  `)

  return card.rows[0]!.id
}

beforeAll(async () => {
  await database.client.exec(`
    DELETE FROM review_session_card;
    DELETE FROM review_session;
    DELETE FROM scheduling_epoch;
    DELETE FROM card;
    DELETE FROM note_vetting;
    DELETE FROM vetting_session;
    DELETE FROM note;
  `)

  await acceptedCard('図書館␟としょかん')
})

async function grades(): Promise<number> {
  const result = await database.client.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM review_log;',
  )
  return result.rows[0]!.n
}

async function sessions(where = 'true'): Promise<number> {
  const result = await database.client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM review_session WHERE ${where};`,
  )
  return result.rows[0]!.n
}

/** A browser tab carrying the session cookie `test/e2e/session.ts` forged. */
async function openReview() {
  const page = await createPage()
  const [name, ...rest] = reader.cookie.split('=')

  await page.context().addCookies([{
    name: name!,
    value: rest.join('='),
    domain: '127.0.0.1',
    path: '/',
  }])

  await page.goto(url('/review?from=/sources'), { waitUntil: 'networkidle' })
  // The *term* is the last thing to arrive: `ssr: false` means the document is
  // an app shell, so waiting for it is waiting for the *session* to compose.
  await page.locator('.term').waitFor()

  return page
}

describe('the key handlers bind to the mode container', () => {
  it('does nothing while focus is on the Done control, and acts when it is back', async () => {
    const page = await openReview()

    expect(await grades()).toBe(0)

    await page.getByRole('link', { name: /Done/ }).focus()
    await page.keyboard.press(' ')
    await page.keyboard.press('3')
    await page.waitForTimeout(250)

    // A `document`-bound handler passes both of those through.
    expect(await grades(), 'a keystroke acted while focus was outside the mode container').toBe(0)
    expect(await page.locator('.value.meaning').count(), 'space revealed the answer from outside the container').toBe(0)

    await page.locator('.container').focus()
    await page.keyboard.press(' ')
    await page.locator('.value.meaning').waitFor()
    await page.keyboard.press('3')
    await expect.poll(grades, { timeout: 5_000 }).toBe(1)

    await page.close()
  })
})

describe('one session, from the rail to the end screen', () => {
  // A second *card*, because the first run graded the first one and a graded
  // *card* is a day out (ADR 0016) — so this composes a run of exactly one.
  beforeAll(async () => {
    await acceptedCard('会議␟かいぎ')
  })

  it('reveals, grades, and ends without starting another', async () => {
    const page = await openReview()

    // ⚠️ The rail is the header and the only progress indicator in the app
    // (`10` §5.2). Its length is `review_session.size`, which is what there was
    // to study rather than what the knob asked for.
    expect(await page.locator('.tick').count()).toBe(1)

    // ⚠️ **A digit before the reveal does nothing** — the *card* is face-down
    // and a *grade* cannot be taken back.
    const before = await grades()
    await page.keyboard.press('4')
    await page.waitForTimeout(250)
    expect(await grades(), 'a grade was recorded before the answer was shown').toBe(before)

    await page.keyboard.press(' ')
    await page.locator('.value.meaning').waitFor()
    expect(await page.locator('.value.meaning').textContent()).toContain('library')

    // ADR 0034's labels — recall, not time. `Again` would promise a same-day
    // return this configuration cannot make.
    const footer = await page.locator('.legend').textContent()
    expect(footer).toContain('Forgot')
    expect(footer).not.toContain('Again')

    await page.keyboard.press('3')
    await expect.poll(grades, { timeout: 5_000 }).toBe(before + 1)

    // ⚠️ The end screen shows the run's numbers and **never** starts the next
    // one (`S7`): no *session* is composed until the reader asks for one.
    await page.getByText('Start another session').waitFor()

    const runs = await sessions()
    await page.waitForTimeout(250)
    expect(await sessions(), 'the end screen started the next session').toBe(runs)

    // And the run it ended is finished rather than abandoned.
    expect(await sessions('completed_at is null')).toBe(0)

    await page.close()
  })
})

// ⚠️ **`S8` end to end, because there is no smaller seam** (`11` §8, §6.3).
// `test/nuxt/review-outbox.test.ts` asserts the page's own arithmetic against a
// registered endpoint; what only exists here is a **real browser with the
// network switched off** — a store that survives, and a replay that happens
// because the connection came back rather than because a test called a function.
describe('a session answered with the network off (`S8`, ADR 0007, ADR 0014)', () => {
  beforeAll(async () => {
    await acceptedCard('電車␟でんしゃ')
    await acceptedCard('切符␟きっぷ')
  })

  async function flags(): Promise<number> {
    const result = await database.client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM card_flag;',
    )
    return result.rows[0]!.n
  }

  /**
   * The *flag* and the suspension as **one value, read in one statement** —
   * [ADR 0059](../../docs/adr/0059-the-e2e-tier-has-no-transaction-isolation-so-a-test-reads-the-pair-in-one-statement.md).
   *
   * ⚠️ **`flag()` writes the `card_flag` row and suspends the *card* in one
   * transaction** (`server/utils/review/flag.ts` — four writes, `04` §7.8), and
   * the e2e tier's in-process handle is **inside** that transaction rather than
   * outside it. Polling `flags()` to `1` and then counting suspended *cards* as
   * a second statement is the shape that flaked in `vet.test.ts`: the poll can
   * land between the insert and the update and take an uncommitted `1` as
   * *the flag has landed*. `1/1` cannot be read out of that gap.
   */
  async function flagged(): Promise<string> {
    const result = await database.client.query<{ shape: string }>(`
      SELECT (SELECT count(*) FROM card_flag)::text
             || '/' ||
             (SELECT count(*) FROM card WHERE suspended_reason = 'flagged')::text AS shape;
    `)
    return result.rows[0]!.shape
  }

  it('loses nothing, and replays both entry types in order when it comes back', async () => {
    const page = await openReview()

    const before = await grades()
    expect(await page.locator('.tick').count()).toBe(2)

    await page.context().setOffline(true)

    // ⚠️ **The interface never waits on the flush** (`S8`): both answers are
    // given, and the run ends, with nothing reachable.
    await page.keyboard.press(' ')
    await page.locator('.value.meaning').waitFor()
    await page.keyboard.press('3')

    // `S9`'s `X` — the outbox's second entry type, behind a *grade* for a
    // different *card* (ADR 0039 property 3).
    await page.keyboard.press('x')

    await page.getByText('Start another session').waitFor()
    expect(await page.textContent('.unsent')).toContain('2 answers have not reached the database')

    expect(await grades(), 'a grade reached the database with the network off').toBe(before)
    expect(await flags()).toBe(0)

    // ⚠️ **Both entries are in `localStorage`, not in the page** (ADR 0014).
    const owed = await page.evaluate(() => localStorage.getItem('kioku:review:outbox'))
    expect(JSON.parse(owed!).map((entry: { kind: string }) => entry.kind)).toEqual(['grade', 'flag'])

    await page.context().setOffline(false)

    await expect.poll(grades, { timeout: 10_000 }).toBe(before + 1)

    // `S9`: the *flag* is recorded **and** the *card* left scheduling. `flag()`
    // writes both in one transaction (`04` §7.8), so the test reads them in one
    // statement (ADR 0059). That the *history* stands is asserted after the
    // reload below, which is the only read taken past every write.
    await expect
      .poll(flagged, { timeout: 10_000 })
      .toBe('1/1')

    // ⚠️ **In order, and the two server clocks say so.** `review_log.received_at`
    // and `card_flag.flagged_at` are both stamped at replay, so the flag landing
    // after a *grade* for a **different** *card* is observable rather than
    // asserted (ADR 0039 property 3).
    const order = await database.client.query<{ afterwards: boolean }>(`
      SELECT (SELECT flagged_at FROM card_flag)
             > (SELECT max(received_at) FROM review_log) AS afterwards;
    `)
    expect(order.rows[0]!.afterwards, 'the flag overtook the grade it was given after').toBe(true)

    // ⚠️ **The durable record decides, and it is empty now** (property 4). A
    // reload replays whatever is still owed, so a store that still held these
    // two would grade the same *card* twice on the next visit.
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(500)

    expect(await page.evaluate(() => localStorage.getItem('kioku:review:outbox'))).toBe('[]')
    expect(await grades()).toBe(before + 1)
    expect(await flags()).toBe(1)

    await page.close()
  })
})
