// `S11`'s delete, through the page and the route — `10` §7.3, `09` §4.11.
//
// ⚠️ **The testing plan's `S11` row puts "the confirmation's count matches what
// the `POST` suspends" at both tiers**, and this is the half that reads the
// number out of the rendered page rather than out of the query: a page that
// computed its own count, or printed the wrong one, passes every schema test.
// `test/schema/source-delete.test.ts` carries the predicate's edge cases.
//
// ⚠️ **And the page is a *place*** (`09` §1): it ships no JavaScript, which is
// why the delete is a form and a `303` at all.

import { fileURLToPath } from 'node:url'
import { fetch as nuxtFetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

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

/** Signed in, and following no redirects — the status *is* the assertion. */
function asReader(path: string, init: RequestInit = {}) {
  return nuxtFetch(path, {
    ...init,
    redirect: 'manual',
    headers: { cookie: reader.cookie, ...init.headers },
  })
}

async function one(sql: string): Promise<string> {
  return (await database.client.query<{ id: string }>(sql)).rows[0]!.id
}

async function suspendedBy(sourceId: string): Promise<number> {
  return Number((await database.client.query<{ n: number }>(`
    SELECT count(*) AS n FROM card
    JOIN note ON note.id = card.note_id
    JOIN ingestion ON ingestion.id = note.origin_ingestion_id
    WHERE ingestion.source_id = '${sourceId}' AND card.suspended_reason = 'source_deleted';
  `)).rows[0]!.n)
}

/** A *source*, its run, and `cards` minted *cards* originated by it. */
async function source(title: string, cards: string[]): Promise<string> {
  const sourceId = await one(`
    INSERT INTO source (subject_id, kind, title, content, content_hash, char_count)
    VALUES ('jlpt-vocab', 'word_list', '${title}', '${title}の本文', '${title}', 4)
    RETURNING id;
  `)
  const ingestionId = await one(`
    INSERT INTO ingestion (source_id, source_title, subject_id, status, worker_environment)
    VALUES ('${sourceId}', '${title}', 'jlpt-vocab', 'complete', 'laptop')
    RETURNING id;
  `)
  for (const key of cards) {
    const noteId = await one(`
      INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
      VALUES ('jlpt-vocab', '${key}', '{"term":"${key}"}'::jsonb, '${ingestionId}')
      RETURNING id;
    `)
    await database.client.exec(`
      INSERT INTO card (note_id, owner_id, template_key)
      VALUES ('${noteId}', '${reader.userId}', 'recognition');
    `)
  }
  return sourceId
}

const minted = await source('三枚の本', ['図書館', '駅', '本'])
const single = await source('一枚の本', ['電車'])
const empty = await source('空の本', [])

describe('the way in — `10` §7.2', () => {
  it('links the source to its confirmation, as a link and not a control', async () => {
    const html = await asReader(`/sources/${single}`).then(response => response.text())

    expect(html).toMatch(new RegExp(`<a[^>]*href="/sources/${single}/delete"[^>]*>\\s*Delete this source\\s*</a>`))
  })
})

describe('the confirmation — `10` §7.3', () => {
  it('states the count as the page\'s statement', async () => {
    const response = await asReader(`/sources/${minted}/delete`)
    const html = await response.text()

    expect(response.status).toBe(200)
    // `<!--[-->` is Vue's fragment marker around the slot.
    expect(html).toMatch(/<h1[^>]*class="statement"[^>]*>(?:<!--\[-->)?3 cards will be suspended\.(?:<!--\]-->)?<\/h1>/)
  })

  it('says "card" for one', async () => {
    const html = await asReader(`/sources/${single}/delete`).then(response => response.text())

    expect(html).toContain('1 card will be suspended.')
  })

  // ⚠️ `10` §7.3: 41 and 0 are the difference between a pause and a click, and
  // a page that reads identically in both cases has stopped informing anyone.
  it('says so when the count is zero', async () => {
    const html = await asReader(`/sources/${empty}/delete`).then(response => response.text())

    expect(html).toContain('No cards will be suspended.')
    expect(html).not.toContain('0 cards')
  })

  it('carries a POST to the route and a link back reading "Keep it"', async () => {
    const html = await asReader(`/sources/${minted}/delete`).then(response => response.text())

    expect(html).toMatch(new RegExp(`<form[^>]*method="post"[^>]*action="/api/source/${minted}/delete"`))
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>\s*Delete this source\s*<\/button>/)
    expect(html).toMatch(new RegExp(`<a[^>]*href="/sources/${minted}"[^>]*>\\s*Keep it\\s*</a>`))
  })

  it('says what is not touched', async () => {
    const html = await asReader(`/sources/${minted}/delete`).then(response => response.text())

    expect(html).toContain('no review history')
    expect(html).toContain('stays readable')
  })

  it('ships no JavaScript', async () => {
    const html = await asReader(`/sources/${minted}/delete`).then(response => response.text())

    expect(html).not.toContain('<script')
  })

  it('is a 404 for an id that is not an id, and for one nothing has', async () => {
    expect((await asReader('/sources/not-an-id/delete')).status).toBe(404)
    expect((await asReader('/sources/019bd300-0000-7000-8000-000000000000/delete')).status).toBe(404)
  })
})

describe('the POST — `09` §4.11 step 3', () => {
  it('suspends exactly what the page counted and answers 303 to the source, now deleted', async () => {
    const html = await asReader(`/sources/${minted}/delete`).then(response => response.text())
    const counted = Number(html.match(/(\d+) cards? will be suspended\./)?.[1])

    const response = await asReader(`/api/source/${minted}/delete`, { method: 'POST' })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`/sources/${minted}`)
    expect(await suspendedBy(minted)).toBe(counted)

    const detail = await asReader(`/sources/${minted}`).then(page => page.text())
    expect(detail).toContain('三枚の本の本文')
    expect(detail).toMatch(/class="deleted"[^>]*>deleted</)
  })

  it('leaves the other sources\' cards scheduled', async () => {
    expect(await suspendedBy(single)).toBe(0)
  })

  it('is a 404 for an id that is not an id, and for one nothing has', async () => {
    expect((await asReader('/api/source/not-an-id/delete', { method: 'POST' })).status).toBe(404)
    expect((await asReader('/api/source/019bd300-0000-7000-8000-000000000000/delete', { method: 'POST' })).status)
      .toBe(404)
  })

  it('is refused signed out, and writes nothing', async () => {
    const response = await nuxtFetch(`/api/source/${single}/delete`, { method: 'POST', redirect: 'manual' })

    expect(response.status).toBe(401)
    expect(await suspendedBy(single)).toBe(0)
  })
})
