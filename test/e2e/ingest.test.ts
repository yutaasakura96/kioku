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
  it.each(['/', '/sources', '/stats'])('%s without a session is a 302 to /auth', async (path) => {
    const response = await nuxtFetch(path, { redirect: 'manual' })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth')
  })
})

describe('assertion 1, signed in — the places ship no JavaScript', () => {
  it.each(['/', '/sources', '/stats'])('%s contains no <script', async (path) => {
    const response = await asReader(path)

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('<script')
  })

})

describe('ADR 0031 — signing in lands on Ingest', () => {
  it('serves the form at /, with both start controls and neither disabled', async () => {
    const html = await asReader('/').then(response => response.text())

    expect(html).toContain('name="content"')
    expect(html).toContain('Vet')
    expect(html).toContain('Review')

    // ⚠️ ADR 0032, ADR 0035: **nothing in v1 is disabled.** A zero is how the
    // reader reaches the written empty state behind the control, so the word
    // must not appear on a screen with two zeros on it.
    expect(html).not.toContain('disabled')
  })

  it('says every figure is as of this page load — `09` §2', async () => {
    const html = await asReader('/').then(response => response.text())
    expect(html).toContain('as of this page load')
  })
})

describe('an accepted submission — `S2`', () => {
  it('answers 303 to / and has already written the four rows', async () => {
    const response = await asReader('/', form({
      title: '朝日新聞 社説',
      content: '駅の近くに図書館があります。'.repeat(50),
    }))

    // ⚠️ `303`, and it is the answer *before the worker runs*. The rows are on
    // disk by the time this status is read — that is what `S2`'s "returns
    // control immediately" means (`09` §4.2).
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/')

    expect(await count('source')).toBe(1)
    expect(await count('ingestion')).toBe(1)
    expect(await count('job')).toBe(1)
    expect(await count('source_chunk')).toBeGreaterThan(0)
  })

  it('lists the queued run above the form, without the screen polling', async () => {
    const html = await asReader('/').then(response => response.text())

    expect(html).toContain('朝日新聞 社説')
    expect(html).toContain('queued')
    expect(html).toContain('not yet picked up')

    // `09` §2, §7: no *place* auto-refreshes and none of them polls.
    expect(html).not.toContain('<script')
    expect(html).not.toContain('http-equiv="refresh"')
  })

  it('⚠️ never diagnoses a dead worker, and never names the provider', async () => {
    const html = await asReader('/').then(response => response.text())

    expect(html).not.toMatch(/worker is (down|not running)|offline/i)
    expect(html).not.toMatch(/anthropic|openai|rate.?limit/i)
  })
})

describe('⚠️ the over-cap paste — `09` §4.2, and the reason this file exists', () => {
  const tooMuch = 'あ'.repeat(SOURCE_CHARACTER_CAP + 1)

  it('answers 200 rather than redirecting', async () => {
    const response = await asReader('/', form({ title: '', content: tooMuch }))

    // A `303` here would lose the paste. There is no client to hold it, and the
    // reader may not be able to get it back.
    expect(response.status).toBe(200)
  })

  it('names the count and says to split it', async () => {
    const html = await asReader('/', form({ title: '', content: tooMuch }))
      .then(response => response.text())

    expect(html).toContain('100,001 characters — the cap is 100,000. Split it and submit the halves.')
  })

  it('⚠️ re-renders the form with the reader\'s text still in it', async () => {
    const marked = `見つけてください。${'あ'.repeat(SOURCE_CHARACTER_CAP)}`
    const html = await asReader('/', form({ title: '社説の下書き', content: marked }))
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
    const html = await asReader('/', form({ title: '', content: marked }))
      .then(response => response.text())

    const textarea = html.match(/<textarea\b[^<>]*>([\s\S]*?)<\/textarea>/)?.[1]

    // The rendered children carry one newline more than the value, and the
    // parser eats exactly that one — so what a browser reads back is `marked`.
    expect(textarea).toBe(`\n${marked}`)
  })

  it('⚠️ escapes a paste that contains markup, on a page that ships no scripts', async () => {
    // The refusal hands the reader's own bytes back into the document, which is
    // the one place in the three *places* where reader input reaches the HTML.
    // Vue escapes it; this is the assertion that says so, because the cost of
    // being wrong is a `<script>` on a route whose whole contract is that it has
    // none — and `test/e2e/no-scripts.test.ts` would go on passing, since it
    // never posts anything.
    const nasty = `</textarea><script>alert(1)</script>${'あ'.repeat(SOURCE_CHARACTER_CAP)}`
    const html = await asReader('/', form({ title: '<b>bold</b>', content: nasty }))
      .then(response => response.text())

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;/textarea&gt;')
  })

  it('refused before any spend — nothing was written', async () => {
    const before = await count('source')
    await asReader('/', form({ title: '', content: tooMuch }))

    expect(await count('source')).toBe(before)
    expect(await count('job')).toBe(await count('ingestion'))
  })

  it('refuses an empty paste the same way, with one sentence', async () => {
    const response = await asReader('/', form({ title: '', content: '   ' }))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Nothing to ingest — paste the text you want notes from.')
  })
})

describe('an identical source resubmitted — PRD §5', () => {
  const content = '同じ文章をもう一度貼りました。'.repeat(10)

  it('creates a new source and points at the earlier one', async () => {
    const first = await asReader('/', form({ title: '一回目', content }))
    expect(first.headers.get('location')).toBe('/')

    const second = await asReader('/', form({ title: '二回目', content }))

    // ⚠️ `04` §5.1: `content_hash` is indexed and **not** unique. Detection, not
    // prevention — resubmission is a choice rather than an error.
    expect(second.status).toBe(303)
    expect(second.headers.get('location')).toMatch(/^\/\?existing=[0-9a-f-]{36}$/)
  })

  it('offers to open it, by name, on the page the redirect lands on', async () => {
    const location = await asReader('/', form({ title: '三回目', content }))
      .then(response => response.headers.get('location')!)

    const html = await asReader(location).then(response => response.text())

    expect(html).toContain('Identical to an earlier source')
    expect(html).toContain('二回目')
  })

  it('ignores an `existing` that is not an id, rather than failing the page', async () => {
    const response = await asReader('/?existing=not-an-id')

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
