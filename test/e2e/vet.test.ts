// ⚠️ **`11` §6.2's behavioural proxy, written down as one test** — and it is the
// debt `11` §6.1 has been handing forward since #5: "**#10 cannot be tested at
// all without an authenticated e2e context** … #10 still owes the **browser**."
// #6 paid the context (`test/e2e/database.ts`, `test/e2e/session.ts`); this is
// the browser.
//
// What it holds is a **Level A conformance property**, and `11` §6.2 is explicit
// that it cannot be asserted directly:
//
//   "Where a listener lives" is not assertable. `getEventListeners` is a
//   DevTools API, not a web one; inspecting Vue internals would test the
//   framework's shape and break on upgrade; and a test that mounts the component
//   and checks a property would pass while the app fails.
//
// So the assertion is the **behaviour that distinguishes the two bindings**:
// with focus on the Done control — which is outside the mode container — a
// keystroke changes nothing; with focus returned to the container, the same
// keystroke acts. A `document`-bound handler passes step 3's keypress through
// and fails the assertion. A container-bound one does not.
//
// ⚠️ **It is a proxy and it is written down as one.** It holds the property
// SC 2.1.4 requires without claiming to inspect the binding, and **if the Done
// control is ever moved inside the container this test needs re-thinking rather
// than re-running.** That is ADR 0037's principle applied to a different
// subject: where the thing you care about cannot be asserted, assert its
// observable consequence, and say which one you did.

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

let noteId: string

beforeAll(async () => {
  await database.client.exec(`
    DELETE FROM card;
    DELETE FROM note_vetting;
    DELETE FROM vetting_session;
    DELETE FROM note;
  `)

  const inserted = await database.client.query<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab', '図書館␟としょかん', '${JSON.stringify(FIELDS)}'::jsonb)
    RETURNING id;
  `)
  noteId = inserted.rows[0]!.id

  await database.client.exec(`
    INSERT INTO note_vetting (note_id, owner_id) VALUES ('${noteId}', '${reader.userId}');
  `)
})

async function state(): Promise<string> {
  const result = await database.client.query<{ state: string }>(
    `SELECT state FROM note_vetting WHERE note_id = '${noteId}';`,
  )
  return result.rows[0]!.state
}

/**
 * The *state* and the *card* count as **one value, read in one statement** —
 * [ADR 0059](../../docs/adr/0059-the-e2e-tier-has-no-transaction-isolation-so-a-test-reads-the-pair-in-one-statement.md).
 *
 * ⚠️ **`database.client` and the app's socket connection are one backend
 * session, not two connections**, so a read issued while `decide()` holds its
 * transaction open sees the uncommitted row. This test used to poll `state()`
 * to `'accepted'` and then count *cards* as a second statement; roughly one
 * full-suite run in four caught `'accepted'` in the gap between the
 * `note_vetting` update and the `mint()` behind it, and counted zero. ⚠️ **A
 * committed `accepted` with no *card* is impossible — `decide()` is one
 * transaction by construction — which is why the failure read as a missing
 * `await` for as long as it went unexplained.**
 *
 * Reading the pair in one statement makes a straddling read return
 * `accepted/0`, which is not the expected value, so the poll keeps going
 * instead of passing a wrong answer through. **The rule for the tier: what the
 * app writes in one transaction, the test reads in one statement.**
 */
async function shape(): Promise<string> {
  const result = await database.client.query<{ shape: string }>(
    `SELECT v.state || '/' || (SELECT count(*) FROM card WHERE note_id = v.note_id) AS shape
       FROM note_vetting v WHERE v.note_id = '${noteId}';`,
  )
  return result.rows[0]!.shape
}

/** A browser tab carrying the session cookie `test/e2e/session.ts` forged. */
async function openVet() {
  const page = await createPage()
  const [name, ...rest] = reader.cookie.split('=')

  await page.context().addCookies([{
    name: name!,
    value: rest.join('='),
    domain: '127.0.0.1',
    path: '/',
  }])

  await page.goto(url('/vet?from=/sources'), { waitUntil: 'networkidle' })
  // The *term* is the last thing to arrive: `ssr: false` means the document is
  // an app shell, so waiting for the *note* is waiting for the queue fetch.
  await page.locator('.term').waitFor()

  return page
}

describe('the key handlers bind to the mode container', () => {
  it('does nothing while focus is on the Done control, and acts when it is back', async () => {
    const page = await openVet()

    expect(await state()).toBe('pending')

    // Step 2 — focus **out of the mode container**. `11` §6.2: the browser's own
    // chrome is not reachable, so the Done control's anchor stands in, and it is
    // outside the container by construction (`10` §4.1, §4.3).
    await page.getByRole('link', { name: /Done/ }).focus()
    await page.keyboard.press('r')
    await page.waitForTimeout(250)

    // Step 3 — a `document`-bound handler passes this keypress through.
    expect(await state(), 'a keystroke acted while focus was outside the mode container').toBe('pending')

    // Step 4 — focus back on the container, same key.
    await page.locator('.container').focus()
    await page.keyboard.press('r')
    await expect.poll(state, { timeout: 5_000 }).toBe('rejected')

    await page.close()
  })
})

describe('one keystroke, one decision', () => {
  it('accepts, mints the card, and stamps the time at the keystroke', async () => {
    await database.client.exec(`
      DELETE FROM card;
      UPDATE note_vetting
         SET state = 'pending', vetted_at = null, seconds_to_vet = null, vetting_session_id = null;
      UPDATE vetting_session SET ended_at = now() WHERE ended_at IS NULL;
    `)

    const page = await openVet()

    // ⚠️ **No confirmation, no focus change, no pointer** — `S3`'s criterion,
    // and the reason ADR 0013 made this a *mode* at all. The page is opened and
    // one key is pressed; nothing else happens in this test.
    await page.keyboard.press(' ')
    await expect
      .poll(shape, {
        timeout: 5_000,
        message: 'acceptance mints the card — `04` §7.3, read as one value per ADR 0059',
      })
      .toBe('accepted/1')

    // ⚠️ **Safe as a second statement only because the pair already landed.**
    // `seconds_to_vet` is set by the same `UPDATE` that set the state, so once
    // `accepted/1` has been read there is no torn state left for this to fall
    // into — unlike the *card* count, which sat on the far side of a socket
    // round trip.
    const stamped = await database.client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM note_vetting
        WHERE note_id = '${noteId}' AND seconds_to_vet IS NOT NULL;`,
    )
    expect(stamped.rows[0]!.n, '`S3`\'s stamp is written at the keystroke').toBe(1)

    await page.close()
  })
})
