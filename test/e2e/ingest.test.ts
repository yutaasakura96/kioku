// `S2`'s second half, and the one assertion #6 cannot make anywhere else.
//
// `11` §8, "End to end only, because there is no seam to hold them":
//
//   ⚠️ The `POST`-redirect-`GET` pair. The over-cap paste is answered `200`
//   **with the text still in it** (`09` §4.2), which is a property of the
//   response body and cannot be checked at a seam.
//
// ⚠️ **This file also restores the half of assertion 1 the gate took away**
// (`11` §6.1): that Ingest, Sources and Stats ship no JavaScript **to a reader
// who is in**. Since #5 that was only observable through `/auth/refused`, which
// is public and carries the same rule but is not a *place*. It is observable
// again here, on the three routes it is actually about.

import { fileURLToPath } from 'node:url'
import { setup, fetch as nuxtFetch } from '@nuxt/test-utils/e2e'
import { ankiDeck } from '../unit/anki-deck'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TEST_ENVIRONMENT } from './environment'
import { SOURCE_CHARACTER_CAP } from '../../shared/ingest/submission'
import { signIn } from './session'
import { startTestDatabase } from './database'
import type { TestDatabase } from './database'

const database: TestDatabase = await startTestDatabase()
const reader = await signIn(database.client)

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  // ⚠️ **`DATABASE_URL` points at something real here, and that is new.**
  // `test/e2e/environment.ts` points it at nothing on purpose, and says the day
  // a test signs in that stops being enough. This is that day.
  env: { ...TEST_ENVIRONMENT, DATABASE_URL: database.connectionString },
})

afterAll(async () => {
  await database.stop()
})

/** Signed in, and following no redirects — the status *is* the assertion. */
function asReader(path: string, init: RequestInit = {}) {
  return nuxtFetch(path, {
    ...init,
    redirect: 'manual',
    headers: { cookie: reader.cookie, ...init.headers },
  })
}

function form(fields: Record<string, string>) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  } satisfies RequestInit
}

/**
 * The same `POST /`, sent the way a browser sends the form that has a file input
 * on it — ADR 0063.
 *
 * ⚠️ **No `content-type` header is set**, deliberately: `FormData` makes
 * `undici` write `multipart/form-data` *with its own boundary*, and a header
 * written by hand here would name a boundary the body does not use.
 */
function upload(fields: Record<string, string>, file?: { name: string, text: string }) {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields))
    body.set(name, value)
  if (file)
    body.set('file', new Blob([file.text], { type: 'text/plain' }), file.name)

  return { method: 'POST', body } satisfies RequestInit
}

/**
 * The same again, with **bytes** rather than text — ADR 0068, #26.
 *
 * ⚠️ **This is the half a `.txt` upload never exercised.** Until #26 every
 * upload was decoded as UTF-8 on arrival, which is right for a `.txt` and
 * destroys a zip; a deck that survived that decode would be a deck that
 * happened to be valid UTF-8.
 */
function uploadBytes(fields: Record<string, string>, file: { name: string, bytes: Uint8Array }) {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields))
    body.set(name, value)
  body.set(
    'file',
    new Blob([file.bytes as unknown as BlobPart], { type: 'application/zip' }),
    file.name,
  )

  return { method: 'POST', body } satisfies RequestInit
}

async function count(table: string): Promise<number> {
  const result = await database.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table};`)
  return result.rows[0]!.n
}

beforeAll(async () => {
  await database.client.exec('TRUNCATE job, ingestion, source_chunk, source CASCADE;')
})

describe('the gate is still the gate', () => {
  // ⚠️ Asserting the forgery *works* would pass on an application that had
  // stopped checking. This is the other half: the same routes, no cookie.
  it.each(['/', '/categories', '/more', '/add', '/sources', '/stats', '/settings'])('%s without a session is a 302 to /auth', async (path) => {
    const response = await nuxtFetch(path, { redirect: 'manual' })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth')
  })
})

describe('assertion 1, signed in — the places ship no JavaScript', () => {
  it.each(['/', '/categories', '/more', '/add', '/sources', '/stats', '/settings'])('%s contains no <script', async (path) => {
    const response = await asReader(path)

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('<script')
  })

})

// ⚠️ **Ingest was the landing route, `/`, until #71** (ADR 0031, ADR 0078).
// It is `/add` now and still carries the start block.
describe('Ingest, at /add since ADR 0078', () => {
  it('serves the form at /add, with the start controls and none disabled', async () => {
    const html = await asReader('/add').then(response => response.text())

    expect(html).toContain('name="content"')
    expect(html).toContain('Vet')
    expect(html).toContain('Review')

    // ⚠️ ADR 0032, ADR 0035: **nothing in v1 is disabled.** A zero is how the
    // reader reaches the written empty state behind the control, so the word
    // must not appear on a screen with two zeros on it.
    expect(html).not.toContain('disabled')
  })

  // ⚠️ #33: the new words the brake would allow today are on the block beside
  // the due count — since ADR 0076 on a control of their own, because a lesson
  // teaches them and a review run never holds one. Read as text, because the
  // count and its word are separate spans with a scoped attribute on each.
  it('reads Review · 0 due and Lesson · 0 new for a reader with no cards', async () => {
    const html = await asReader('/add').then(response => response.text())
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

    expect(text).toContain('Vet · 0 flagged')
    expect(text).toContain('Review · 0 due')
    expect(text).toContain('Lesson · 0 new')
    // Each control asks for its own run, and says where to come back to.
    expect(html).toContain('href="/review?start=review&amp;from=%2Fadd"')
    expect(html).toContain('href="/review?start=lesson&amp;from=%2Fadd"')
  })

  it('says every figure is as of this page load — `09` §2', async () => {
    const html = await asReader('/add').then(response => response.text())
    expect(html).toContain('as of this page load')
  })
})

// ADR 0077 §3 — the fifth *place*. A shelf of forms with one button each: no
// JavaScript, a POST, and a `303` to Home (to the screen before a run until
// #71, ADR 0078).
describe('Categories — ADR 0077 §3', () => {
  const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  const shelf = () => asReader('/categories').then(response => response.text())
  /** The keys the shelf offers to study: every row but the active one. */
  const offered = (html: string) => [...html.matchAll(/name="category" value="([^"]+)"/g)].map(match => match[1])

  it('lists the five levels, marks N5 for a reader who has chosen none, and writes no row to do it', async () => {
    const html = await shelf()

    expect(text(html)).toContain('Choose what to study.')
    expect(text(html)).toContain('Reviews always cover everything you have learned')
    expect(offered(html)).toEqual(['jlpt:N4', 'jlpt:N3', 'jlpt:N2', 'jlpt:N1'])
    expect(html.match(/New words come from here/g)).toHaveLength(1)
    expect(html).toContain('action="/api/category"')
    expect(await count('active_category')).toBe(0)
  })

  // ⚠️ Not `/` here: a reader who has chosen nothing is on Welcome, which has
  // no nav (ADR 0078). Home's own block asserts the dashboard's link.
  it('is in the nav of every place', async () => {
    for (const path of ['/categories', '/more', '/add', '/sources', '/stats', '/settings'])
      expect(await asReader(path).then(response => response.text())).toContain('href="/categories"')
  })

  it('stores the choice, answers 303 to Home, and marks it on the shelf', async () => {
    const response = await asReader('/api/category', form({ category: 'jlpt:N3' }))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/')
    expect(offered(await shelf())).toEqual(['jlpt:N5', 'jlpt:N4', 'jlpt:N2', 'jlpt:N1'])

    await asReader('/api/category', form({ category: 'jlpt:N2' }))
    expect(await count('active_category'), 'a second choice wrote a second row').toBe(1)
  })

  // ⚠️ The way a reader sends such a key is a page drawn before a deck was
  // deleted, so the answer is the shelf as it is now and not an error page.
  it('changes nothing for a key that names no category, and lands back on the shelf', async () => {
    for (const category of ['jlpt:N6', 'deck:0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', 'my-words', '']) {
      const response = await asReader('/api/category', form({ category }))

      expect(response.status, category).toBe(303)
      expect(response.headers.get('location'), category).toBe('/categories')
    }

    expect(offered(await shelf())).toEqual(['jlpt:N5', 'jlpt:N4', 'jlpt:N3', 'jlpt:N1'])
  })

  it('puts an imported deck and the reader\'s own words under My decks', async () => {
    await database.client.exec(`
      WITH deck AS (
        INSERT INTO source (subject_id, kind, title, content, content_hash, char_count)
        VALUES ('jlpt-vocab-2', 'anki', 'Core 2k', '会う', 'hash-core-2k', 2) RETURNING id
      ), list AS (
        INSERT INTO source (subject_id, kind, title, content, content_hash, char_count)
        VALUES ('jlpt-vocab-2', 'word_list', '今週の単語', '沼', 'hash-own-list', 1) RETURNING id
      ), piece AS (
        INSERT INTO source_chunk (source_id, ordinal, char_start, char_end, content_hash)
        SELECT id, 0, 0, 1, 'c' FROM list RETURNING id, source_id
      ), word AS (
        INSERT INTO note (subject_id, identity_key, fields)
        VALUES ('jlpt-vocab-2', '沼␟ぬま', '{"term":"沼","reading":"ぬま"}'::jsonb) RETURNING id
      )
      INSERT INTO occurrence (note_id, source_id, source_chunk_id, char_start, char_end, surface_form)
      SELECT word.id, piece.source_id, piece.id, 0, 1, '沼' FROM word, piece;
    `)

    const html = await shelf()
    const [deck, own] = offered(html).slice(-2)

    expect(deck).toMatch(/^deck:/)
    expect(own).toBe('my-words')
    expect(text(html)).toContain('Core 2k 0 words · 0 learned · imported')
    expect(text(html)).toContain('My words 1 word · 0 learned')

    const response = await asReader('/api/category', form({ category: 'my-words' }))
    expect(response.headers.get('location')).toBe('/')
    expect(offered(await shelf())).not.toContain('my-words')
  })

  it('is the reader\'s alone: no session, no write', async () => {
    const response = await nuxtFetch('/api/category', { ...form({ category: 'jlpt:N1' }), redirect: 'manual' })

    expect(response.status).toBe(401)
    expect(offered(await shelf())).not.toContain('my-words')

    // Back to no choice and no sources, for the files' other tests.
    await database.client.exec('DELETE FROM active_category; TRUNCATE occurrence, source_chunk, source CASCADE;')
    await database.client.exec(`DELETE FROM note WHERE identity_key = '沼␟ぬま';`)
  })
})

// ADR 0078 — Home, the landing *place*: Welcome on a first visit, the
// dashboard once the reader has chosen where to start. No JavaScript on either.
describe('Home — ADR 0078', () => {
  const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  const home = () => asReader('/').then(response => response.text())

  it('is Welcome for a reader who has chosen nothing: what Kioku is, and a level to start at', async () => {
    const html = await home()

    expect(text(html)).toContain('Learn the Japanese words you need for the JLPT.')
    expect(text(html)).toContain('I am new to Japanese · start at N5')
    expect([...html.matchAll(/name="category" value="([^"]+)"/g)].map(match => match[1]))
      .toEqual(['jlpt:N5', 'jlpt:N5', 'jlpt:N4', 'jlpt:N3', 'jlpt:N2', 'jlpt:N1'])
    expect(html).toContain('action="/api/category"')
    // ADR 0075 §8: the sources, with their links, on the screen the prototype puts them on.
    expect(html).toContain('href="https://www.tanos.co.uk/jlpt/"')
    // No *shell*: one decision, and no way around it.
    expect(html).not.toContain('href="/more"')
    expect(html).not.toContain('<script')
    expect(await count('active_category')).toBe(0)
  })

  it('is the dashboard once a level is chosen, naming it and explaining what is empty', async () => {
    const response = await asReader('/api/category', form({ category: 'jlpt:N3' }))
    expect(response.headers.get('location')).toBe('/')

    const html = await home()
    const page = text(html)

    expect(page).toContain('Today')
    expect(page).toContain('Reviews 0 words due')
    expect(page).toContain('Nothing to review yet. Words appear here after your first lesson.')
    // No starter set in this database: the lesson card says why it is empty.
    expect(page).toContain('There are no new words left in JLPT N3.')
    expect(page).toContain('New words come from JLPT N3 Change category')
    expect(page).toContain('Your JLPT vocabulary level · estimate')
    expect(page).toContain('No estimate yet.')
    expect(page).toContain('Progress by level')
    expect(page).toContain('as of this page load')
    expect(html).toContain('href="/categories"')
    expect(html).toContain('href="/more"')
    expect(html).toContain('href="/add"')
    // A card with nothing to start has no control, and nothing is disabled.
    expect(html).not.toContain('start=review')
    expect(html).not.toContain('disabled')
    expect(html).not.toContain('<script')

    await database.client.exec('DELETE FROM active_category;')
  })
})

// More — the menu the prototype puts everything else under (ADR 0078).
describe('More — ADR 0078', () => {
  it('reaches Add, Settings, Vet, Sources, Stats, the export and the door', async () => {
    const html = await asReader('/more').then(response => response.text())

    for (const href of ['/add', '/settings', '/vet?from=%2Fmore', '/sources', '/stats', '/api/export', '/auth'])
      expect(html, href).toContain(`href="${href}"`)
    expect(html).not.toContain('<script')
  })
})

// ADR 0076 §2 — the fourth *place*. A form and nothing else: no JavaScript, a
// POST, and a `303` back to the document that shows what was stored.
describe('Settings — ADR 0076 §2', () => {
  const values = (html: string) =>
    ['lessonSize', 'dailyNew', 'pauseAbove'].map(name => html.match(new RegExp(`name="${name}"[^>]*value="(\\d+)"`))?.[1])

  it('shows ADR 0066\'s numbers to a reader who has saved nothing, and writes no row to do it', async () => {
    const html = await asReader('/settings').then(response => response.text())

    expect(values(html)).toEqual(['5', '10', '50'])
    expect(html).toContain('action="/api/settings"')
    expect(html).not.toContain('Saved.')
    expect(await count('study_setting')).toBe(0)
  })

  // ⚠️ Since #71 the bar names Home, Categories and More, and Settings is a
  // row under More (ADR 0078).
  it('is reached from More', async () => {
    expect(await asReader('/more').then(response => response.text())).toContain('href="/settings"')
  })

  it('stores what the form sends, answers 303, and shows it back', async () => {
    const response = await asReader('/api/settings', form({ lessonSize: '3', dailyNew: '6', pauseAbove: '40' }))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/settings?saved=1')

    const html = await asReader('/settings?saved=1').then(page => page.text())

    expect(values(html)).toEqual(['3', '6', '40'])
    expect(html).toContain('Saved.')
  })

  // ⚠️ Nothing is refused: a value out of range is clamped, a blank one is the
  // default, and the page shows what was kept — which is how the bound is learnt.
  it('clamps what is out of range rather than refusing it', async () => {
    await asReader('/api/settings', form({ lessonSize: '500', dailyNew: '-3', pauseAbove: '' }))

    expect(values(await asReader('/settings').then(page => page.text()))).toEqual(['20', '0', '50'])
    expect(await count('study_setting'), 'a second save wrote a second row').toBe(1)
  })

  it('is the reader\'s alone: no session, no write', async () => {
    const response = await nuxtFetch('/api/settings', { ...form({ lessonSize: '9' }), redirect: 'manual' })

    expect(response.status).toBe(401)
    expect(values(await asReader('/settings').then(page => page.text()))).toEqual(['20', '0', '50'])

    // Back to the defaults, for the files' other tests.
    await database.client.exec('DELETE FROM study_setting;')
  })
})

describe('an accepted submission — `S2`', () => {
  it('answers 303 to / and has already written the four rows', async () => {
    const response = await asReader('/add', form({
      title: '朝日新聞 社説',
      content: '駅の近くに図書館があります。'.repeat(50),
    }))

    // ⚠️ `303`, and it is the answer *before the worker runs*. The rows are on
    // disk by the time this status is read — that is what `S2`'s "returns
    // control immediately" means (`09` §4.2).
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/add')

    expect(await count('source')).toBe(1)
    expect(await count('ingestion')).toBe(1)
    expect(await count('job')).toBe(1)
    expect(await count('source_chunk')).toBeGreaterThan(0)
  })

  it('lists the queued run above the form, without the screen polling', async () => {
    const html = await asReader('/add').then(response => response.text())

    expect(html).toContain('朝日新聞 社説')
    expect(html).toContain('queued')
    expect(html).toContain('not yet picked up')

    // `09` §2, §7: no *place* auto-refreshes and none of them polls.
    expect(html).not.toContain('<script')
    expect(html).not.toContain('http-equiv="refresh"')
  })

  it('⚠️ never diagnoses a dead worker, and never names the provider', async () => {
    const html = await asReader('/add').then(response => response.text())

    expect(html).not.toMatch(/worker is (down|not running)|offline/i)
    expect(html).not.toMatch(/anthropic|openai|rate.?limit/i)
  })
})

describe('⚠️ the over-cap paste — `09` §4.2, and the reason this file exists', () => {
  const tooMuch = 'あ'.repeat(SOURCE_CHARACTER_CAP + 1)

  it('answers 200 rather than redirecting', async () => {
    const response = await asReader('/add', form({ title: '', content: tooMuch }))

    // A `303` here would lose the paste. There is no client to hold it, and the
    // reader may not be able to get it back.
    expect(response.status).toBe(200)
  })

  it('names the count and says to split it', async () => {
    const html = await asReader('/add', form({ title: '', content: tooMuch }))
      .then(response => response.text())

    expect(html).toContain('100,001 characters — the cap is 100,000. Split it and submit the halves.')
  })

  it('⚠️ re-renders the form with the reader\'s text still in it', async () => {
    const marked = `見つけてください。${'あ'.repeat(SOURCE_CHARACTER_CAP)}`
    const html = await asReader('/add', form({ title: '社説の下書き', content: marked }))
      .then(response => response.text())

    // ⚠️ **Inside the textarea, not merely somewhere on the page.** Asserting
    // `html.toContain(text)` would pass on a page that printed the rejected
    // paste as a paragraph — which is not the form re-rendered, and is not
    // something the reader can submit again.
    const textarea = html.match(/<textarea\b[^<>]*>([\s\S]*?)<\/textarea>/)?.[1]

    expect(textarea).toBeDefined()
    expect(textarea).toContain('見つけてください。')
    expect(textarea).toContain('あ'.repeat(SOURCE_CHARACTER_CAP))
    expect(html).toContain('社説の下書き')
  })

  it('⚠️ keeps a leading newline, which HTML would otherwise eat', async () => {
    // ⚠️ **The HTML parser drops one newline immediately after `<textarea>`.**
    // So a paste that begins with a blank line comes back one line shorter than
    // it went in — silently, and `09` §4.2's whole point is that a paste which
    // cannot be got back is handed back **unchanged**.
    const marked = `\n\n見つけてください。${'あ'.repeat(SOURCE_CHARACTER_CAP)}`
    const html = await asReader('/add', form({ title: '', content: marked }))
      .then(response => response.text())

    const textarea = html.match(/<textarea\b[^<>]*>([\s\S]*?)<\/textarea>/)?.[1]

    // The rendered children carry one newline more than the value, and the
    // parser eats exactly that one — so what a browser reads back is `marked`.
    expect(textarea).toBe(`\n${marked}`)
  })

  it('⚠️ escapes a paste that contains markup, on a page that ships no scripts', async () => {
    // The refusal hands the reader's own bytes back into the document, which is
    // the one place in the four *places* where reader input reaches the HTML.
    // Vue escapes it; this is the assertion that says so, because the cost of
    // being wrong is a `<script>` on a route whose whole contract is that it has
    // none — and `test/e2e/no-scripts.test.ts` would go on passing, since it
    // never posts anything.
    const nasty = `</textarea><script>alert(1)</script>${'あ'.repeat(SOURCE_CHARACTER_CAP)}`
    const html = await asReader('/add', form({ title: '<b>bold</b>', content: nasty }))
      .then(response => response.text())

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;/textarea&gt;')
  })

  it('refused before any spend — nothing was written', async () => {
    const before = await count('source')
    await asReader('/add', form({ title: '', content: tooMuch }))

    expect(await count('source')).toBe(before)
    expect(await count('job')).toBe(await count('ingestion'))
  })

  it('refuses an empty paste the same way, with one sentence', async () => {
    const response = await asReader('/add', form({ title: '', content: '   ' }))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Nothing to ingest — paste the text you want notes from.')
  })
})

describe('an identical source resubmitted — PRD §5', () => {
  const content = '同じ文章をもう一度貼りました。'.repeat(10)

  it('creates a new source and points at the earlier one', async () => {
    const first = await asReader('/add', form({ title: '一回目', content }))
    expect(first.headers.get('location')).toBe('/add')

    const second = await asReader('/add', form({ title: '二回目', content }))

    // ⚠️ `04` §5.1: `content_hash` is indexed and **not** unique. Detection, not
    // prevention — resubmission is a choice rather than an error.
    expect(second.status).toBe(303)
    expect(second.headers.get('location')).toMatch(/^\/add\?existing=[0-9a-f-]{36}$/)
  })

  it('offers to open it, by name, on the page the redirect lands on', async () => {
    const location = await asReader('/add', form({ title: '三回目', content }))
      .then(response => response.headers.get('location')!)

    const html = await asReader(location).then(response => response.text())

    expect(html).toContain('Identical to an earlier source')
    expect(html).toContain('二回目')
  })

  it('ignores an `existing` that is not an id, rather than failing the page', async () => {
    const response = await asReader('/add?existing=not-an-id')

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('Identical to an earlier source')
  })
})

describe('Sources — `10` §7.1', () => {
  it('lists what has been ingested, newest first', async () => {
    const html = await asReader('/sources').then(response => response.text())

    expect(html).toContain('三回目')
    expect(html).toContain('二回目')
    expect(html.indexOf('三回目')).toBeLessThan(html.indexOf('一回目'))
  })

  it('leads to a readable source', async () => {
    const response = await asReader(`/sources/${await newestSourceId()}`)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('同じ文章をもう一度貼りました。')
  })

  // ⚠️ `/sources/:id` is a *place* too (ADR 0013, `09` §2), and it is the one
  // covered by a **pattern** rather than a literal path — which is the form a
  // route rule silently fails to match in. `test/unit/nuxt-config.test.ts`
  // asserts the rule exists; this asserts it applies.
  it('and that document ships no JavaScript either', async () => {
    const response = await asReader(`/sources/${await newestSourceId()}`)

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('<script')
  })
})

/** The newest *source* in the list, by the link the row renders. */
async function newestSourceId(): Promise<string> {
  const list = await asReader('/sources').then(response => response.text())
  const id = list.match(/\/sources\/([0-9a-f-]{36})/)?.[1]

  expect(id, 'the Sources list rendered no source link').toBeDefined()
  return id!
}

describe('⚠️ the resume control — `10` §6.2, owed since #6 and buildable at #8', () => {
  async function theRun(): Promise<string> {
    const result = await database.client.query<{ id: string }>(
      'SELECT id FROM ingestion ORDER BY submitted_at LIMIT 1;',
    )
    return result.rows[0]!.id
  }

  async function setStatus(status: string): Promise<void> {
    const id = await theRun()
    await database.client.exec(`UPDATE ingestion SET status = '${status}' WHERE id = '${id}';`)
    await database.client.exec(`UPDATE job SET state = 'done', finished_at = now() WHERE ingestion_id = '${id}';`)
  }

  it('is absent on a run that is not incomplete', async () => {
    await setStatus('complete')
    const html = await asReader('/add').then(response => response.text())

    expect(html).not.toContain('name="resume"')
  })

  it('⚠️ is a form and not a link', async () => {
    // A `GET` that writes a job would be actioned by a prefetch, a crawler or a
    // back button — and there is no JavaScript here to intercept anything
    // (ADR 0020), so the method **is** the protection.
    await setStatus('incomplete')
    const html = await asReader('/add').then(response => response.text())

    expect(html).toContain('name="resume"')
    expect(html).toContain('Resume')
    expect(html).toMatch(/<form[^<>]*method="post"[^<>]*>\s*<input type="hidden" name="resume"/)
    expect(html).not.toContain('<script')
  })

  it('writes a queued resume job and answers 303', async () => {
    await setStatus('incomplete')
    const id = await theRun()

    const response = await asReader('/add', form({ resume: id }))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/add')

    const rows = await database.client.query<{ kind: string, state: string }>(
      `SELECT kind, state FROM job WHERE ingestion_id = $1 ORDER BY created_at;`,
      [id],
    )
    expect(rows.rows.at(-1)).toEqual({ kind: 'resume', state: 'queued' })
  })

  it('⚠️ a resume for a run that is not resumable writes nothing and still lands on /', async () => {
    // `09` §7: the run list is what says where a run is, read fresh on every
    // request. There is no flash message, and no client to hold one — the next
    // render tells the truth whichever way the write went.
    await setStatus('complete')
    const id = await theRun()
    const before = await count('job')

    const response = await asReader('/add', form({ resume: id }))

    expect(response.status).toBe(303)
    expect(await count('job')).toBe(before)
  })
})

// ⚠️ ADR 0063, #19: the input is a chosen word list. *Ingest* offers it as the
// default and prose as the other choice, and a `.txt` upload reaches the same
// handler as a paste.
//
// `11` §8's rule puts these here for the same reason the over-cap paste is here:
// the enctype, the checked radio and the repopulated textarea are properties of
// the response body, and there is no seam that holds any of them.
describe('a word list is what Ingest asks for — ADR 0063', () => {
  beforeAll(async () => {
    await database.client.exec('TRUNCATE job, ingestion, source_chunk, source CASCADE;')
  })

  it('offers both kinds, with the word list checked and prose still reachable', async () => {
    const html = await asReader('/add').then(response => response.text())

    expect(html).toContain('name="kind"')
    // The checked one is the default, and the other is on the screen rather than
    // behind anything — ADR 0063 §5 keeps prose, it just stops being first.
    expect(html).toMatch(/value="word_list"[^<>]*checked/)
    expect(html).toContain('value="prose"')
    expect(html).not.toMatch(/value="prose"[^<>]*checked/)
  })

  it('⚠️ posts as multipart, because a urlencoded form cannot carry a file', () => {
    // A urlencoded form sends a file input's *name* and not its bytes. This is
    // the one attribute that makes the upload below possible at all, and it is
    // invisible everywhere except in the markup.
    return asReader('/add')
      .then(response => response.text())
      .then(html => expect(html).toMatch(/<form[^<>]*enctype="multipart\/form-data"/))
  })

  it('writes a word_list source, chunked at 25 terms rather than 1200 characters', async () => {
    const terms = Array.from({ length: 30 }, (_, index) => `語${index}`).join('\n')

    const response = await asReader('/add', upload({ kind: 'word_list', title: '語彙', content: terms }))

    expect(response.status).toBe(303)
    const source = await database.client.query<{ kind: string }>('SELECT kind FROM source;')
    expect(source.rows[0]).toEqual({ kind: 'word_list' })
    // 30 terms is two chunks; the same characters as prose would be one.
    expect(await count('source_chunk')).toBe(2)
  })

  it('accepts a .txt upload and reaches the same handler as a paste', async () => {
    await database.client.exec('TRUNCATE job, ingestion, source_chunk, source CASCADE;')
    const terms = ['図書館', 'あります', 'コーヒー'].join('\n')

    const response = await asReader('/add', upload(
      { kind: 'word_list', title: '', content: '' },
      { name: 'vocab.txt', text: terms },
    ))

    expect(response.status).toBe(303)
    const source = await database.client.query<{ content: string, title: string }>(
      'SELECT content, title FROM source;',
    )
    expect(source.rows[0]!.content).toBe(terms)
    // The derived title is the first line, exactly as it is for a paste — the
    // file went through `readSubmission` and nothing else.
    expect(source.rows[0]!.title).toBe('図書館')
    expect(await count('job')).toBe(1)
  })

  it("⚠️ refuses an over-cap upload before any row, with the file's text in the box", async () => {
    await database.client.exec('TRUNCATE job, ingestion, source_chunk, source CASCADE;')
    const marked = `語彙${'あ'.repeat(SOURCE_CHARACTER_CAP)}`

    const response = await asReader('/add', upload(
      { kind: 'word_list', title: '', content: '' },
      { name: 'too-long.txt', text: marked },
    ))

    // `S2`'s cap applies to a file exactly as it applies to a paste, and it is
    // refused before any spend (`03` §13.2).
    expect(response.status).toBe(200)
    expect(await count('source')).toBe(0)

    // ⚠️ **And the material comes back as text.** No server can repopulate a
    // file input, so the only way `09` §4.2's promise holds for an upload is for
    // the content to arrive in the textarea instead.
    const html = await response.text()
    expect(html).toContain('語彙')
    expect(html).toContain('the cap is 100,000')
  })

  it('keeps the reader\'s answer about the material when it refuses them', async () => {
    const html = await asReader('/add', form({ kind: 'prose', title: '', content: '   ' }))
      .then(response => response.text())

    // Everything else on the form comes back; this must too, or a refusal
    // silently changes what they said the material was.
    expect(html).toMatch(/value="prose"[^<>]*checked/)
  })

  it("⚠️ writes prose when the post carried no kind at all", async () => {
    await database.client.exec('TRUNCATE job, ingestion, source_chunk, source CASCADE;')

    // The form always sends one — a radio is pre-checked and a browser cannot
    // uncheck one — so this is a post that did not come from the form. Every
    // such post is submitting prose or submitting nothing, and answering it
    // `word_list` would chunk a pasted passage at 25 terms. `04` §5.1's column
    // default is `prose` and `readSourceKind` answers with that one, not with
    // the screen's.
    const response = await asReader('/add', form({
      title: '社説',
      content: '駅の近くに図書館があります。'.repeat(50),
    }))

    expect(response.status).toBe(303)
    const source = await database.client.query<{ kind: string }>('SELECT kind FROM source;')
    expect(source.rows[0]).toEqual({ kind: 'prose' })
  })

  it('still writes prose when prose is what was chosen', async () => {
    await database.client.exec('TRUNCATE job, ingestion, source_chunk, source CASCADE;')

    const response = await asReader('/add', form({
      kind: 'prose',
      title: '社説',
      content: '駅の近くに図書館があります。'.repeat(50),
    }))

    expect(response.status).toBe(303)
    const source = await database.client.query<{ kind: string }>('SELECT kind FROM source;')
    expect(source.rows[0]).toEqual({ kind: 'prose' })
  })
})


describe('⚠️ an Anki deck — ADR 0068, #26', () => {
  const deck = () => ankiDeck({
    layout: 'LATEST',
    notes: [
      {
        fields: [
          { name: 'expression', value: '図書館' },
          { name: 'reading', value: 'としょかん' },
          { name: 'meaning', value: 'library' },
        ],
        tags: ['JLPT_5'],
        deck: 'JLPT::N5',
      },
      {
        fields: [
          { name: 'expression', value: '新聞' },
          { name: 'reading', value: 'しんぶん' },
          { name: 'meaning', value: 'newspaper' },
        ],
        tags: ['JLPT_5'],
        deck: 'JLPT::N5',
      },
    ],
  })

  it('offers the kind on the form, and the form still ships no JavaScript', async () => {
    const document = await (await asReader('/add')).text()

    expect(document).toContain('value="anki"')
    expect(document).toContain('Anki deck')
    expect(document).toContain('.apkg')
    // ⚠️ ADR 0020's property, on the route that gained a third radio and an
    // `accept` attribute and must still have no client.
    expect(document).not.toContain('<script')
  })

  it('unpacks the deck at submit and stores it as a word list', async () => {
    const before = await count('source')
    const response = await asReader('/add', uploadBytes(
      { title: 'N5 deck', kind: 'anki' },
      { name: 'deck.apkg', bytes: deck() },
    ))

    expect(response.status).toBe(303)
    expect(await count('source')).toBe(before + 1)

    const row = await database.client.query<{ kind: string, content: string, char_count: number }>(
      'SELECT kind, content, char_count FROM source ORDER BY submitted_at DESC LIMIT 1;',
    )
    expect(row.rows[0]!.kind).toBe('anki')
    // ⚠️ `term⇥reading⇥hint`, one line per *note* — ADR 0068 §1 and §3. What is
    // stored is a word list; the `.apkg` itself is not kept anywhere.
    expect(row.rows[0]!.content).toBe(
      '図書館\tとしょかん\tJLPT_5 JLPT N5\n新聞\tしんぶん\tJLPT_5 JLPT N5',
    )
    // ⚠️ And never the deck's meaning (ADR 0068 §3's measurement).
    expect(row.rows[0]!.content).not.toContain('library')
  })

  it('chunks it by the word-list rule, in the same transaction', async () => {
    // ⚠️ **The whole reason the reader is in the app** (ADR 0068 §1): `chunk`
    // writes `source_chunk` here, so `unpack` has to be here too.
    const chunks = await database.client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM source_chunk
       WHERE source_id = (SELECT id FROM source ORDER BY submitted_at DESC LIMIT 1);`,
    )

    expect(chunks.rows[0]!.n).toBe(1)
  })

  it('⚠️ refuses a file that is not a deck, on this screen, before any row', async () => {
    const before = await count('source')
    const response = await asReader('/add', upload(
      { title: 'not a deck', kind: 'anki' },
      { name: 'notes.txt', text: 'これはテキストです' },
    ))

    expect(response.status).toBe(200)
    const document = await response.text()
    expect(document).toContain('not an Anki deck')
    expect(await count('source')).toBe(before)
  })

  it('⚠️ refuses an anki submission with no file at all, by its own name', async () => {
    // ⚠️ Not `empty`. A deck is a file, and "paste the text you want notes
    // from" is advice the reader cannot take.
    const response = await asReader('/add', upload({ title: 'nothing', kind: 'anki' }))

    expect(response.status).toBe(200)
    const document = await response.text()
    expect(document).toContain('Choose a .apkg file')
  })

  it('keeps the reader\'s choice of kind on the re-rendered form', async () => {
    const response = await asReader('/add', upload(
      { title: 'not a deck', kind: 'anki' },
      { name: 'notes.txt', text: 'これはテキストです' },
    ))
    const document = await response.text()

    // The radio the reader chose is the one still checked — a refusal must not
    // quietly change what they said the material was.
    expect(document).toMatch(/value="anki"[^>]*\n?\s*checked/)
  })

  it('a `.txt` and a paste are unchanged by any of this', async () => {
    const before = await count('source')

    expect((await asReader('/add', upload(
      { title: 'a list', kind: 'word_list' },
      { name: 'list.txt', text: '図書館\n新聞' },
    ))).status).toBe(303)
    expect((await asReader('/add', form({ title: 'a paste', kind: 'prose', content: '本を読む。' }))).status).toBe(303)

    expect(await count('source')).toBe(before + 2)
  })
})

describe('⚠️ a seed — ADR 0070, #25', () => {
  // The worker is not running in this tier, so its half is written by hand,
  // exactly as `worker/seeding.py` writes it — `worker/tests/test_seeding.py` is
  // where that half is tested.
  async function answer(terms: string[]) {
    await database.client.query(
      `UPDATE seed SET completed_at = now(), terms = $1, model_id = 'claude-sonnet-5',
         prompt_version = 'seed-v1', input_tokens = 900, output_tokens = 40, cost_micro_usd = 2200
       WHERE submitted_at IS NULL AND discarded_at IS NULL;`,
      [terms],
    )
    await database.client.exec(
      `UPDATE job SET state = 'done', finished_at = now() WHERE kind = 'seed' AND state = 'queued';`,
    )
  }

  async function openSeedId(): Promise<string> {
    const result = await database.client.query<{ id: string }>(
      `SELECT id FROM seed WHERE submitted_at IS NULL AND discarded_at IS NULL ORDER BY requested_at DESC LIMIT 1;`,
    )
    return result.rows[0]!.id
  }

  const request = { seed_action: 'request', domain: 'tech', level: 'N3', count: '25' }

  it('offers a domain, a level and a count from the subject\'s closed sets', async () => {
    const html = await asReader('/add').then(response => response.text())

    expect(html).toContain('DRAFT A LIST')
    expect(html).toContain('name="seed_action" value="request"')
    for (const domain of ['tech', 'business', 'daily', 'academic', 'general'])
      expect(html).toContain(`value="${domain}"`)
    for (const level of ['N5', 'N4', 'N3', 'N2', 'N1'])
      expect(html).toContain(`value="${level}"`)
    expect(html).toMatch(/value="25"[^>]*selected/)
  })

  it('writes nothing for a request the form could not have sent', async () => {
    const before = await count('seed')
    const response = await asReader('/add', form({ ...request, domain: 'cooking' }))

    expect(response.status).toBe(303)
    expect(await count('seed')).toBe(before)
  })

  it('writes a seed and a queued seed job, answers 303, and writes no source', async () => {
    const sources = await count('source')
    const response = await asReader('/add', form(request))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/add')

    const job = await database.client.query<{ kind: string, state: string, ingestion_id: string | null }>(
      `SELECT kind, state, ingestion_id FROM job WHERE seed_id = $1;`,
      [await openSeedId()],
    )
    expect(job.rows).toEqual([{ kind: 'seed', state: 'queued', ingestion_id: null }])
    expect(await count('source')).toBe(sources)
  })

  it('says the draft is not yet picked up, and gives the controls way while it is open', async () => {
    const html = await asReader('/add').then(response => response.text())

    // ⚠️ #34: the page never changes by itself, so the sentence names the reload.
    expect(html).toContain('Drafting 25 tech words at N3 — not yet picked up. Reload to see it.')
    expect(html).not.toContain('DRAFT A LIST')
    expect(html).toContain('Discard the draft')

    // ⚠️ `09` §7 and ADR 0020: it waits the way a queued run waits — no
    // script, no refresh, and no diagnosis of the laptop.
    expect(html).not.toContain('<script')
    expect(html).not.toContain('http-equiv="refresh"')
    expect(html).not.toMatch(/worker is (down|not running)|offline/i)
  })

  it('says the draft is drafting once claimed, and names the reload — #34', async () => {
    await database.client.exec(
      `UPDATE job SET state = 'claimed', claimed_by = 'test', claimed_at = now(), heartbeat_at = now()
       WHERE kind = 'seed' AND state = 'queued';`,
    )
    const html = await asReader('/add').then(response => response.text())

    expect(html).toContain('Drafting 25 tech words at N3 — reload to see it.')
    expect(html).not.toContain('N3 — not yet picked up')

    await database.client.exec(
      `UPDATE job SET state = 'queued', claimed_by = NULL, claimed_at = NULL, heartbeat_at = NULL
       WHERE kind = 'seed' AND state = 'claimed';`,
    )
  })

  it('⚠️ lands pre-filled in the word-list field once it has come back — ADR 0070 §1', async () => {
    await answer(['会議', '予算'])
    const html = await asReader('/add').then(response => response.text())

    expect(html).toContain('2 of 25 tech words at N3 are in the list below.')
    expect(html).toMatch(/<textarea[^>]*>\n会議\n予算<\/textarea>/)
    expect(html).toContain('value="tech · N3 · 25 words"')
    expect(html).toContain(`name="seed" value="${await openSeedId()}"`)
    expect(html).toMatch(/value="word_list"[^>]*\n?\s*checked/)
  })

  it('is submitted as an ordinary word_list source, and the draft leaves the screen', async () => {
    const seedId = await openSeedId()
    const response = await asReader('/add', upload({
      kind: 'word_list',
      title: 'tech · N3 · 25 words',
      // The reader removed one word before submitting.
      content: '会議',
      seed: seedId,
    }))
    expect(response.status).toBe(303)

    const seed = await database.client.query<{ kind: string, content: string, submitted: boolean }>(
      `SELECT s.kind, s.content, seed.submitted_at IS NOT NULL AS submitted
       FROM seed JOIN source s ON s.id = seed.source_id WHERE seed.id = $1;`,
      [seedId],
    )
    expect(seed.rows).toEqual([{ kind: 'word_list', content: '会議', submitted: true }])

    const html = await asReader('/add').then(response => response.text())
    expect(html).toContain('DRAFT A LIST')
    expect(html).not.toContain('name="seed" value=')
  })

  it('says so when the draft did not come back, with the job\'s own sentence', async () => {
    await asReader('/add', form(request))
    await database.client.exec(
      `UPDATE job SET state = 'failed', finished_at = now(),
         last_error = 'the model provider answered 529 after 3 attempts'
       WHERE kind = 'seed' AND state = 'queued';`,
    )

    const html = await asReader('/add').then(response => response.text())
    expect(html).toContain('The draft of tech words at N3 did not come back: the model provider answered 529 after 3 attempts.')
    expect(html).not.toMatch(/anthropic/i)
  })

  it('⚠️ discards it and keeps the row, because a discarded draft was still paid for — ADR 0070 §2', async () => {
    const seedId = await openSeedId()
    const response = await asReader('/add', form({ seed_action: 'discard', seed_id: seedId }))
    expect(response.status).toBe(303)

    const row = await database.client.query<{ discarded: boolean }>(
      `SELECT discarded_at IS NOT NULL AS discarded FROM seed WHERE id = $1;`,
      [seedId],
    )
    expect(row.rows).toEqual([{ discarded: true }])

    const html = await asReader('/add').then(response => response.text())
    expect(html).toContain('DRAFT A LIST')
  })

  it('puts every seed request on the ledger, the discarded one included', async () => {
    const html = await asReader('/stats').then(response => response.text())
    expect(html.match(/tech · N3 · 25 words<span[^>]*> seed<\/span>/g)).toHaveLength(2)
  })
})
