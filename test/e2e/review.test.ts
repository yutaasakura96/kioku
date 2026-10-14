// *Review* in a browser — `S7` end to end as ADR 0076 left it, and `11` §6.2's
// behavioural proxy on the second *mode*.
//
// What is only observable here:
//
// - ⚠️ **The key handlers bind to the mode container, never to `document`**
//   (ADR 0025, `10` §4.1). `11` §6.2 says where a listener lives is not
//   assertable — `getEventListeners` is a DevTools API, inspecting Vue
//   internals tests the framework's shape — so the assertion is the behaviour
//   that distinguishes the two bindings: with focus on the exit control, which
//   is outside the container, a keystroke changes nothing. **It is a proxy and
//   it is written down as one**; if the exit is ever moved inside the container
//   this test needs re-thinking rather than re-running.
// - ⚠️ **The run is composed server-side and prefetched as a unit**, so the
//   whole of it is in the document before the first keystroke — which is what
//   `S8` is built on. A lesson is composed by the reader's own act: the start
//   block's link, taken out of the address once it is read.
// - ⚠️ **No key gives a *grade*.** A *grade* is arithmetic that cannot be
//   undone (`03` §2.4), and since ADR 0076 it is what the answers were: a digit
//   is typed into the field or does nothing at all.
// - ⚠️ **Romaji becomes hiragana as it is typed** (ADR 0060 §2). `wanakana`'s
//   `bind` works on real `input` events, and this is the tier that has them.
// - ⚠️ **A miss is asked again and still counts** (ADR 0076 §4), against a real
//   scheduler: the word is graded Forgot by the answer that finally gets it.

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
 * One accepted *note* and the *card* it minted — a new word, which a lesson
 * teaches.
 *
 * ⚠️ **Nothing in this file deletes a `review_log` row, and nothing can**:
 * `04` §7.5's trigger refuses the `DELETE`, which is the point of the table
 * (ADR 0011). So the runs below take a *card* each rather than sharing one and
 * cleaning up between them — which is § Carrying's "a committed `review_log`
 * row poisons every later test in the session", met in the tier where it bites.
 *
 * ⚠️ **And every run leaves its words graded or flagged**, because a new word
 * that was not got right is taught again (ADR 0076 §1) and would join the next
 * describe's lesson.
 *
 * ⚠️ **The list places it at N5**, the *category* a reader who has chosen none
 * studies (ADR 0077 §2): a word in no *category* is in no lesson.
 */
async function acceptedCard(key: string, fields: Record<string, string> = FIELDS): Promise<string> {
  const note = await database.client.query<{ id: string }>(`
    INSERT INTO note (subject_id, identity_key, fields)
    VALUES ('jlpt-vocab-2', '${key}', '${JSON.stringify(fields)}'::jsonb)
    RETURNING id;
  `)

  await database.client.exec(`
    INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
    VALUES ('${note.rows[0]!.id}', '${reader.userId}', 'accepted', now());
    INSERT INTO level_claim (note_id, authority_key, level)
    VALUES ('${note.rows[0]!.id}', 'tanos-jlpt', 'N5');
  `)

  const card = await database.client.query<{ id: string }>(`
    INSERT INTO card (note_id, owner_id, template_key)
    VALUES ('${note.rows[0]!.id}', '${reader.userId}', 'recognition')
    RETURNING id;
  `)

  return card.rows[0]!.id
}

/** The same, already scheduled and a day overdue — what a review run holds. */
async function dueCard(key: string): Promise<string> {
  const cardId = await acceptedCard(key)

  await database.client.exec(`
    INSERT INTO scheduling_epoch
      (card_id, owner_id, ordinal, due, stability, difficulty, scheduled_days, reps, lapses, state)
    VALUES ('${cardId}', '${reader.userId}', 1, now() - interval '1 day', 12.5, 5.2, 12, 4, 0, 2);
  `)

  return cardId
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

async function scalar(sql: string): Promise<number> {
  const result = await database.client.query<{ n: number }>(sql)
  return result.rows[0]!.n
}

const grades = () => scalar('SELECT count(*)::int AS n FROM review_log;')
const flagRows = () => scalar('SELECT count(*)::int AS n FROM card_flag;')
const sessions = (where = 'true') => scalar(`SELECT count(*)::int AS n FROM review_session WHERE ${where};`)

async function latestRating(): Promise<number> {
  return scalar('SELECT rating AS n FROM review_log ORDER BY received_at DESC LIMIT 1;')
}

/** A browser tab carrying the session cookie `test/e2e/session.ts` forged. */
async function openReview(start: 'lesson' | 'review' | null, ready: string) {
  const page = await createPage()
  const [name, ...rest] = reader.cookie.split('=')

  await page.context().addCookies([{
    name: name!,
    value: rest.join('='),
    domain: '127.0.0.1',
    path: '/',
  }])

  const query = start ? `start=${start}&from=/sources` : 'from=/sources'
  await page.goto(url(`/review?${query}`), { waitUntil: 'networkidle' })
  // `ssr: false` means the document is an app shell, so waiting for the run's
  // first word is waiting for it to compose.
  await page.locator(ready).waitFor()

  return page
}

type Page = Awaited<ReturnType<typeof openReview>>

/** Home, signed in, drawn on the server (ADR 0078). */
async function openHome() {
  const page = await createPage()
  const [name, ...rest] = reader.cookie.split('=')

  await page.context().addCookies([{ name: name!, value: rest.join('='), domain: '127.0.0.1', path: '/' }])
  await page.goto(url('/'), { waitUntil: 'networkidle' })
  await page.locator('.today .statement').waitFor()

  return page
}

/** A lesson, opened the way the start block opens one, on its first word. */
const openLesson = () => openReview('lesson', '.lesson .term')

/** Through the teaching: *Next word* until the last, then *Quiz me*. */
async function throughTeaching(page: Page, words: number) {
  for (let index = 1; index < words; index += 1)
    await page.getByRole('button', { name: 'Next word' }).click()

  await page.getByRole('button', { name: /^Quiz me/ }).click()
  await page.locator('.quizcard input:focus').waitFor()
}

/** One answer, typed and checked with `Enter` — the field has the focus. */
async function answer(page: Page, text: string) {
  await page.locator('.quizcard input:focus').waitFor()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

/** *Next*, by the key: the result took the focus to the one control. */
async function next(page: Page) {
  await page.locator('.quizcard button:focus', { hasText: 'Next' }).waitFor()
  await page.keyboard.press('Enter')
}

async function verdict(page: Page): Promise<string> {
  await page.locator('.quizcard button', { hasText: 'Next' }).waitFor()
  return (await page.locator('.fb .verdict').textContent()) ?? ''
}

const asked = (page: Page) => page.locator('.quizcard .ask b').textContent()

describe('the key handlers bind to the mode container', () => {
  it('does nothing while focus is on the exit control', async () => {
    const page = await openLesson()

    expect(await grades()).toBe(0)

    await throughTeaching(page, 1)
    await page.locator('.modebar .count').evaluate(element => { element.textContent = '200 of 200 words' })
    await page.setViewportSize({ width: 320, height: 700 })
    const narrow = await page.evaluate(() => {
      const bar = document.querySelector('.modebar')!
      const parts = ['.name', '.track', '.count', '.exit'].map(selector => bar.querySelector(selector)!.getBoundingClientRect())
      const bounds = bar.getBoundingClientRect()
      return {
        contained: parts.every(part => part.left >= bounds.left && part.right <= bounds.right),
        separated: parts.every((part, index) => parts.slice(index + 1).every(other =>
          part.right <= other.left || other.right <= part.left || part.bottom <= other.top || other.bottom <= part.top)),
        firstRow: parts[0]!.bottom > parts[3]!.top && parts[3]!.bottom > parts[0]!.top,
        secondRow: parts[1]!.bottom > parts[2]!.top && parts[2]!.bottom > parts[1]!.top,
        ordered: Math.min(parts[1]!.top, parts[2]!.top) >= Math.max(parts[0]!.bottom, parts[3]!.bottom),
        scrollWidth: document.documentElement.scrollWidth,
      }
    })
    expect(narrow.contained).toBe(true)
    expect(narrow.separated).toBe(true)
    expect(narrow.firstRow).toBe(true)
    expect(narrow.secondRow).toBe(true)
    expect(narrow.ordered).toBe(true)
    expect(narrow.scrollWidth).toBeLessThanOrEqual(320)

    await page.setViewportSize({ width: 390, height: 700 })
    const wideRow = await page.evaluate(() => {
      const parts = ['.name', '.track', '.count', '.exit'].map(selector => document.querySelector(`.modebar ${selector}`)!.getBoundingClientRect())
      return Math.max(...parts.map(part => part.top)) < Math.min(...parts.map(part => part.bottom))
    })
    expect(wideRow).toBe(true)

    await answer(page, 'library')
    expect(await verdict(page)).toBe('Correct')

    // ⚠️ `x` and not `Enter`: `Enter` on a focused control activates it, which
    // is the control's behaviour and proves nothing about where the handler
    // lives. The result is on screen, which is the one step `X` is a key on.
    await page.getByRole('button', { name: 'Finish early' }).focus()
    await page.keyboard.press('x')
    await page.waitForTimeout(250)

    // A `document`-bound handler passes that through.
    expect(await flagRows(), 'a keystroke acted while focus was outside the mode container').toBe(0)
    expect(await page.locator('.fb.ok').count(), 'the word moved on from outside the container').toBe(1)

    // Back inside, the word is finished and graded — the offline run below is
    // where `X` is pressed with the focus where it belongs.
    await page.locator('.quizcard button').focus()
    await next(page)
    await answer(page, 'toshokan')
    await expect.poll(grades, { timeout: 5_000 }).toBe(1)

    await page.close()
  })
})

describe('one lesson, from the teaching to the summary', () => {
  // A second new word, because the first run graded the first one and a graded
  // word is a day out (ADR 0016) — so this composes a lesson of exactly one.
  beforeAll(async () => {
    await acceptedCard('会議␟かいぎ')
  })

  it('teaches, quizzes by typing, grades by the answers, and ends without starting another', async () => {
    const page = await openLesson()

    // ⚠️ The link's `start` is taken out of the address once it is read: left
    // there, a reload would start the next lesson and spend the day on it.
    await expect.poll(() => page.url(), { timeout: 5_000 }).not.toContain('start=')
    expect(page.url()).toContain('from=/sources')

    // The teaching: the word with its answers, and no question yet.
    expect(await page.locator('.modebar .count').textContent()).toBe('word 1 of 1')
    expect(await page.locator('.lesson .reading').textContent()).toContain('としょかん')
    expect(await page.locator('.lesson .meaning').textContent()).toContain('library')
    expect(await page.locator('.quizcard').count()).toBe(0)

    const before = await grades()

    // ⚠️ `Enter` on the teaching's own control — it has the focus — starts the quiz.
    await page.locator('.rowbtns .btn:focus').waitFor()
    await page.keyboard.press('Enter')
    await page.locator('.quizcard input:focus').waitFor()

    // The question shows the word and neither answer.
    expect(await asked(page)).toBe('Meaning')
    expect(await page.locator('.quizcard').textContent()).not.toContain('としょかん')

    // ⚠️ **A digit is typed, not obeyed** — a *grade* cannot be taken back.
    await page.keyboard.press('4')
    await page.keyboard.press(' ')
    await page.waitForTimeout(250)
    expect(await grades(), 'a grade was recorded before an answer was given').toBe(before)
    expect(await page.locator('.quizcard input').inputValue()).toBe('4 ')
    await page.locator('.quizcard input').fill('')

    await answer(page, 'the library')
    expect(await verdict(page)).toBe('Correct')

    // ⚠️ **No key overrules or commits anything** (ADR 0076 §5): a `1` or an
    // `s` on the result is nothing.
    await page.keyboard.press('1')
    await page.keyboard.press('s')
    await page.waitForTimeout(250)
    expect(await grades(), 'a key gave a grade the answers did not').toBe(before)
    expect(await page.locator('.fb.ok').count()).toBe(1)

    await next(page)
    expect(await asked(page)).toBe('Reading')

    // ⚠️ `bind` converts as the reader types, in a real browser — and holds a
    // trailing `n` until the next key, because `na` and `ん` both start with it.
    // `Enter` arrives on `としょかn`, and the fold is what finishes it.
    await page.locator('.quizcard input:focus').waitFor()
    await page.keyboard.type('toshokan')
    expect(await page.locator('.quizcard input').inputValue()).toBe('としょかn')
    await page.keyboard.press('Enter')
    expect(await verdict(page)).toBe('Correct')

    // ⚠️ The word's one *grade*, given by the answer that completed it and
    // stamped at that keystroke (ADR 0076 §4): Good, for a word never missed.
    await expect.poll(grades, { timeout: 5_000 }).toBe(before + 1)
    expect(await latestRating()).toBe(3)

    await next(page)

    // ⚠️ The summary shows the run's numbers and **never** starts the next one
    // (`S7`): no run is composed until the reader asks for one.
    await page.getByText('1 new word learned.').waitFor()
    expect(await page.locator('.summary').textContent()).toContain('Lesson complete')

    // Where the word went is the server's: its first epoch, and a real date.
    await page.locator('.wrow .x', { hasText: 'now Learning' }).waitFor()

    const runs = await sessions()
    await page.waitForTimeout(250)
    expect(await sessions(), 'the summary started the next run').toBe(runs)

    // And the run it ended is finished rather than abandoned.
    expect(await sessions('completed_at is null')).toBe(0)
    expect(await scalar(`SELECT count(*)::int AS n FROM review_session WHERE kind = 'lesson';`)).toBe(runs)

    await page.close()
  })

  // ADR 0076 §8: opening *Review* asks what is waiting and composes nothing.
  it('opens on what is waiting and starts nothing, whatever is pressed', async () => {
    const runs = await sessions()
    const page = await openReview(null, '.start .statement')

    expect(await page.locator('.start .statement').textContent()).toContain('All done for now.')

    // ⚠️ **The *session*-size knob sits inside the mode container**, so a key
    // on it bubbles to the container's handler. It moves the knob and starts
    // nothing.
    await page.locator('.start input').first().focus()
    await page.keyboard.press(' ')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
    expect(await sessions(), 'opening Review, or a key on it, started a run').toBe(runs)

    await page.close()
  })
})

// #69, ADR 0077 — the issue's first criterion, end to end and in a browser,
// because the choice crosses a *mode*, a *place* and a form post: the screen
// before a run names the *category*, *Change category* is a document load onto
// a page with no script, and choosing lands back where the lesson is counted.
describe('choosing a category (ADR 0077 §3)', () => {
  beforeAll(async () => {
    for (const [term, level] of [['映画', 'N4'], ['経験', 'N3']] as const) {
      await database.client.exec(`
        WITH word AS (
          INSERT INTO note (subject_id, identity_key, fields)
          VALUES ('jlpt-vocab-2', '${term}␟よみ', '{"term":"${term}","reading":"よみ","meaning":"m"}'::jsonb)
          RETURNING id
        )
        INSERT INTO level_claim (note_id, authority_key, level) SELECT id, 'tanos-jlpt', '${level}' FROM word;
      `)
    }
  })

  // The files' other describes study N5, the *category* of a reader who has
  // chosen none.
  afterAll(async () => {
    await database.client.exec('DELETE FROM active_category;')
  })

  // ⚠️ **Through Home since #71** (ADR 0078): the line naming the *category*
  // moved there from `/review`'s screen before a run, and choosing lands on it.
  // The describes above composed runs, so this reader is past Welcome.
  it('names the category on Home, changes it from the shelf, and comes back', async () => {
    const page = await openHome()

    expect(await page.locator('.studying').textContent()).toContain('New words come from')
    expect(await page.locator('.studying .tag').textContent()).toBe('JLPT N5')

    await page.getByRole('link', { name: 'Change category' }).click()
    await page.waitForURL(/\/categories$/)

    // A *place*: the document, and no script on it.
    expect(await page.locator('script').count()).toBe(0)
    expect(await page.locator('.cat.on .code').textContent()).toBe('N5')
    expect(await page.locator('.cat.on .tag').textContent()).toBe('New words come from here')

    const runs = await sessions()
    await page.getByRole('button', { name: 'Study N4' }).click()
    await page.locator('.today .statement').waitFor()

    expect(new URL(page.url()).pathname).toBe('/')
    expect(await page.locator('script').count()).toBe(0)
    expect(await page.locator('.studying .tag').textContent()).toBe('JLPT N4')
    // ⚠️ The one N4 word, and not the N3 one: the lesson is counted in the
    // *category* just chosen.
    expect(await page.locator('.hero').nth(1).locator('.num').textContent()).toBe('1')
    // ⚠️ Choosing is not starting: nothing was composed.
    expect(await sessions(), 'choosing a category started a run').toBe(runs)
    expect((await database.client.query<{ key: string }>(
      `SELECT category_key AS key FROM active_category WHERE owner_id = '${reader.userId}';`,
    )).rows).toEqual([{ key: 'jlpt:N4' }])

    // And the lesson it starts holds that word alone.
    await page.getByRole('link', { name: 'Start lesson' }).click()
    await page.locator('.lesson .term').waitFor()
    expect(await page.locator('.lesson .term').textContent()).toBe('映画')

    // Left graded, so it joins no later describe's lesson.
    await throughTeaching(page, 1)
    await answer(page, 'm')
    await next(page)
    await answer(page, 'よみ')
    await next(page)
    await page.locator('.summary').waitFor()

    await page.close()
  })
})

// ⚠️ **`S8` end to end, because there is no smaller seam** (`11` §8, §6.3).
// `test/nuxt/review-outbox.test.ts` asserts the page's own arithmetic against a
// registered endpoint; what only exists here is a **real browser with the
// network switched off** — a store that survives, and a replay that happens
// because the connection came back rather than because a test called a function.
describe('a review run answered with the network off (`S8`, ADR 0007, ADR 0014)', () => {
  beforeAll(async () => {
    await dueCard('電車␟でんしゃ')
    await dueCard('切符␟きっぷ')
  })

  /**
   * The *flag* and the suspension as **one value, read in one statement** —
   * [ADR 0059](../../docs/adr/0059-the-e2e-tier-has-no-transaction-isolation-so-a-test-reads-the-pair-in-one-statement.md).
   *
   * ⚠️ **`flag()` writes the `card_flag` row and suspends the *card* in one
   * transaction** (`server/utils/review/flag.ts` — four writes, `04` §7.8), and
   * the e2e tier's in-process handle is **inside** that transaction rather than
   * outside it. Polling `flagRows()` to `1` and then counting suspended *cards*
   * as a second statement is the shape that flaked in `vet.test.ts`: the poll
   * can land between the insert and the update and take an uncommitted `1` as
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
    // ⚠️ A review run: due *cards* only, started by the start block's other link.
    const page = await openReview('review', '.quizcard .term')

    const before = await grades()
    expect(await page.locator('.modebar .name').textContent()).toBe('Reviews')
    expect(await page.locator('.modebar .count').textContent()).toBe('0 of 2 words')
    expect(await scalar(`SELECT new_count AS n FROM review_session WHERE kind = 'review';`)).toBe(0)

    await page.context().setOffline(true)

    // ⚠️ **The interface never waits on the flush** (`S8`): both words are
    // answered, and the run ends, with nothing reachable.
    await answer(page, 'library')
    await next(page)
    await answer(page, 'toshokan')
    await next(page)
    expect(await page.locator('.modebar .count').textContent()).toBe('1 of 2 words')

    // `S9`'s `X` — the outbox's second entry type, behind a *grade* for a
    // different *card* (ADR 0039 property 3). It is a key on the result only,
    // and the focus is inside the container, on *Next*.
    await answer(page, 'library')
    await page.locator('.quizcard button:focus', { hasText: 'Next' }).waitFor()
    await page.keyboard.press('x')

    await page.getByText('Reviews done.').waitFor()
    expect(await page.textContent('.unsent')).toContain('2 answers have not reached the database')
    // ⚠️ No stage and no date for an answer the database has not seen.
    expect(await page.locator('.wrow .x').textContent()).toBe('not sent yet')

    expect(await grades(), 'a grade reached the database with the network off').toBe(before)
    expect(await flagRows()).toBe(0)

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

    // The summary's row catches up with the database: a stage and a date.
    await page.locator('.wrow .x', { hasText: 'back' }).waitFor()

    // ⚠️ **The durable record decides, and it is empty now** (property 4). A
    // reload replays whatever is still owed, so a store that still held these
    // two would grade the same *card* twice on the next visit.
    //
    // ⚠️ **Polled, not slept.** An entry settles out of the store only after its
    // response returns, which is after the row the polls above read has
    // landed; and the mount asks what is waiting only after its own replay, so
    // the screen before a run is the sign that replay has finished.
    const outbox = () => page.evaluate(() => localStorage.getItem('kioku:review:outbox'))
    await expect.poll(outbox, { timeout: 10_000 }).toBe('[]')

    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('.start .statement').waitFor()

    expect(await outbox()).toBe('[]')
    expect(await grades()).toBe(before + 1)
    expect(await flagRows()).toBe(1)

    await page.close()
  })
})

// ADR 0069 §4. Suspend earlier cards so this case also works when selected on
// its own: the file's outer setup creates a kanji card for the other cases.
describe('a kana-only term', () => {
  beforeAll(async () => {
    await database.client.query(
      'UPDATE card SET suspended_at = now() WHERE owner_id = $1 AND suspended_at IS NULL;',
      [reader.userId],
    )
    await acceptedCard('こんな␟こんな', {
      ...FIELDS,
      term: 'こんな',
      reading: 'こんな',
      part_of_speech: '連体詞',
      meaning: 'such, like this',
    })
  })

  it('is asked for its meaning alone, and graded on it', async () => {
    const page = await openLesson()
    const before = await grades()

    await throughTeaching(page, 1)

    expect(await asked(page)).toBe('Meaning')
    await answer(page, 'like this')
    expect(await verdict(page)).toBe('Correct')

    // One question was all the word owed: it is graded, Good, already.
    await expect.poll(grades, { timeout: 5_000 }).toBe(before + 1)
    expect(await latestRating()).toBe(3)

    // And the reading is never asked.
    await next(page)
    await page.getByText('1 new word learned.').waitFor()

    await page.close()
  })
})

// ADR 0076 §4, the criterion in its own words: *a wrong answer is asked again
// in the same session until right; the word still counts as missed for
// scheduling*. ⚠️ Last with the kana case, for the same reason: every earlier
// word is answered, so this lesson is one word.
describe('a missed answer', () => {
  beforeAll(async () => {
    await acceptedCard('経験␟けいけん', {
      ...FIELDS,
      term: '経験',
      reading: 'けいけん',
      part_of_speech: '名詞',
      meaning: 'experience',
    })
  })

  it('is asked again before the run ends, and the word is graded Forgot', async () => {
    const page = await openLesson()
    const before = await grades()

    await throughTeaching(page, 1)

    await answer(page, 'to eat')
    expect(await verdict(page)).toBe('Not quite')
    expect(await page.locator('.fb.no .ans').textContent()).toContain('experience')
    expect(await page.locator('.foot').textContent()).toContain('This one comes back before the session ends.')

    await next(page)
    expect(await asked(page)).toBe('Reading')
    await answer(page, 'keiken')
    expect(await verdict(page)).toBe('Correct')

    // ⚠️ Both questions have been asked and the word is **not** graded: the
    // missed one is still owed.
    await page.waitForTimeout(250)
    expect(await grades(), 'a word was graded with a question still owed').toBe(before)

    await next(page)
    expect(await asked(page)).toBe('Meaning')

    // ⚠️ A near miss is accepted (ADR 0076 §5) — and the miss before it stays.
    await answer(page, 'experiance')
    expect(await verdict(page)).toBe('Correct')
    expect(await page.locator('.fb.ok').textContent()).toContain('Close enough')

    await expect.poll(grades, { timeout: 5_000 }).toBe(before + 1)
    expect(await latestRating(), 'a word that was missed was graded as if it had not been').toBe(1)

    await next(page)
    await page.locator('.sumlist', { hasText: 'Missed · 1' }).waitFor()

    // ADR 0076 §5: nothing was offered that could have turned the miss into a
    // pass, and nothing was stored that would.
    expect(await scalar('SELECT count(*)::int AS n FROM meaning_synonym;')).toBe(0)

    await page.close()
  })
})

// ADR 0069 §5, #30: 夢 answered む, the report that started it. ⚠️ Last, for
// the same reason as the two above: this lesson is the one 夢 word, and む comes
// from the committed KANJIDIC2 table through the server, which is the point.
describe('a kanji\'s reading typed for the word\'s', () => {
  beforeAll(async () => {
    await acceptedCard('夢␟ゆめ', {
      ...FIELDS,
      term: '夢',
      reading: 'ゆめ',
      part_of_speech: '名詞',
      meaning: 'dream',
    })
  })

  it('is a retry that counts nothing, and the second answer is the one checked', async () => {
    const page = await openLesson()
    const before = await grades()

    await throughTeaching(page, 1)
    await answer(page, 'dream')
    await next(page)

    await answer(page, 'mu')

    await page.getByText('That is a reading of the kanji, not of this word.').waitFor()
    expect(await page.locator('.quizcard input').inputValue()).toBe('')
    expect(await page.locator('.quizcard button').textContent()).toContain('Check')

    await answer(page, 'yume')
    expect(await verdict(page)).toBe('Correct')

    await expect.poll(grades, { timeout: 5_000 }).toBe(before + 1)
    expect(await latestRating(), 'the retry was counted as a miss').toBe(3)

    await page.close()
  })
})

// ADR 0076 §1 and §6: a word from the starter set has no *card* until a lesson
// starts it, and a lesson finished early leaves its words to be taught again.
describe('a starter word, and a lesson finished early', () => {
  let noteId: string

  beforeAll(async () => {
    const note = await database.client.query<{ id: string }>(`
      INSERT INTO note (subject_id, identity_key, fields)
      VALUES ('jlpt-vocab-2', '会う␟あう',
              '{"term":"会う","reading":"あう","part_of_speech":"動詞","meaning":"to meet; to encounter"}'::jsonb)
      RETURNING id;
    `)
    noteId = note.rows[0]!.id

    await database.client.exec(`
      INSERT INTO level_claim (note_id, authority_key, level) VALUES ('${noteId}', 'tanos-jlpt', 'N5');
    `)
  })

  it('is accepted and minted by the lesson that teaches it, with its level and no example', async () => {
    expect(await scalar(`SELECT count(*)::int AS n FROM card WHERE note_id = '${noteId}';`)).toBe(0)

    const page = await openLesson()

    expect(await page.locator('.lesson .term').textContent()).toContain('会う')
    expect(await page.locator('.lesson .tags').textContent()).toContain('JLPT N5')
    expect(await page.locator('.lesson .others').textContent()).toContain('to encounter')
    expect(await page.locator('.lesson .example').count()).toBe(0)

    expect(await scalar(`SELECT count(*)::int AS n FROM card WHERE note_id = '${noteId}';`)).toBe(1)
    expect(await scalar(`
      SELECT count(*)::int AS n FROM note_vetting WHERE note_id = '${noteId}' AND state = 'accepted';
    `)).toBe(1)

    // ⚠️ Leaving the teaching is a pause: the lesson is still live.
    expect(await page.getByRole('link', { name: 'Leave' }).getAttribute('href')).toBe('/sources')
    expect(await sessions('completed_at is null')).toBe(1)

    const before = await grades()

    // *Finish early* in the quiz ends the run and grades nothing: a new word
    // enters reviews by being got right.
    await throughTeaching(page, 1)
    await answer(page, 'to eat')
    expect(await verdict(page)).toBe('Not quite')
    await page.getByRole('button', { name: 'Finish early' }).click()

    await page.getByText('Lesson finished early.').waitFor()
    await expect.poll(() => sessions('completed_at is null'), { timeout: 5_000 }).toBe(0)
    expect(await grades()).toBe(before)
    expect(await scalar(`
      SELECT count(*)::int AS n FROM scheduling_epoch e JOIN card c ON c.id = e.card_id WHERE c.note_id = '${noteId}';
    `)).toBe(0)

    await page.close()
  })
})

// ADR 0076 §2, `10` §8A: nothing is refused. The reader's own browser must not
// hold back a value the server would clamp, and this is the tier with a browser.
describe('the settings form, submitted by a browser', () => {
  const FIELDS = ['lessonSize', 'dailyNew', 'pauseAbove']

  afterAll(async () => {
    await database.client.exec('DELETE FROM study_setting;')
  })

  async function save(page: Page, typed: string[]): Promise<string[]> {
    await page.goto(url('/settings'), { waitUntil: 'networkidle' })

    for (const [index, name] of FIELDS.entries())
      await page.locator(`input[name="${name}"]`).fill(typed[index]!)

    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByText('Saved.').waitFor({ timeout: 5_000 })

    return Promise.all(FIELDS.map(name => page.locator(`input[name="${name}"]`).inputValue()))
  }

  it('sends what is out of range or fractional, and shows what was kept', async () => {
    const page = await createPage()
    const [name, ...rest] = reader.cookie.split('=')

    await page.context().addCookies([{
      name: name!,
      value: rest.join('='),
      domain: '127.0.0.1',
      path: '/',
    }])

    expect(await save(page, ['21', '101', '2001'])).toEqual(['20', '100', '2000'])
    expect(await save(page, ['2.5', '7.9', '40'])).toEqual(['2', '7', '40'])

    expect(await scalar('SELECT count(*)::int AS n FROM study_setting;')).toBe(1)
    expect(await scalar('SELECT lesson_size AS n FROM study_setting;')).toBe(2)

    await page.close()
  })
})
