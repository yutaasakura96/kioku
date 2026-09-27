// `npm run dev:session`'s happy path: the session it prepares is one the app
// accepts. The app here is the built one `setup()` boots, not `nuxt dev`, and it
// boots with exactly the environment the script hands `nuxt dev` — so what is
// proven is the joint that matters, the script's database and secret agreeing
// with the app's gate. The refusals are `test/unit/dev-session-guard.test.ts`.
//
// ⚠️ **Nothing here signs in through Google** (`11` §8, §9), and the app gains
// nothing for this test: the cookie is `test/e2e/session.ts`'s, as everywhere
// else in this tier.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { DEV_READER_ID, prepareDevSession, startHandoff } from '../../scripts/dev-session/prepare'
import type { DevSessionOptions } from '../../scripts/dev-session/prepare'

const stateDir = mkdtempSync(join(tmpdir(), 'kioku-dev-session-'))
const options: DevSessionOptions = {
  stateDir,
  appUrl: 'http://localhost:3000',
  nodeEnv: 'development',
  vercel: undefined,
  realSecrets: [],
}

// Twice over the same directory: the second run finds the reader the first one
// wrote, which is the *reuse* half of "creates or reuses".
const first = await prepareDevSession(options)
await first.database.stop()
const session = await prepareDevSession(options)

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  env: session.appEnv,
})

const handoff = await startHandoff(session.reader, options.appUrl)

afterAll(async () => {
  await handoff.stop()
  await session.database.stop()
  rmSync(stateDir, { recursive: true, force: true })
})

describe('npm run dev:session', () => {
  it('keeps the local database reachable when the app opens several connections', async () => {
    const checks = Array.from({ length: 4 }, async () => {
      const client = new Client(session.database.connectionString)
      try {
        await client.connect()
        return (await client.query('SELECT 1 AS alive')).rows[0]?.alive
      }
      finally {
        await client.end().catch(() => {})
      }
    })

    expect(await Promise.all(checks)).toEqual([1, 1, 1, 1])
  })

  it('reuses one local reader across runs', async () => {
    const users = await session.database.client.query<{ id: string }>('SELECT id FROM auth."user"')
    expect(users.rows.map(row => row.id)).toEqual([DEV_READER_ID])
    expect(session.reader.cookie).toBe(first.reader.cookie)
  })

  it.each(['/', '/stats', '/review'])('serves %s signed in rather than redirecting to /auth', async (path) => {
    const response = await fetch(path, { redirect: 'manual', headers: { cookie: session.reader.cookie } })
    expect(response.status).toBe(200)
  })

  it('would redirect the same request without the cookie', async () => {
    expect((await fetch('/stats', { redirect: 'manual' })).status).toBe(302)
  })

  it('hands the cookie over by redirect, and the app accepts what it set', async () => {
    const response = await globalThis.fetch(handoff.url, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(options.appUrl)

    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/HttpOnly/)
    const cookie = setCookie.split(';')[0]!

    expect((await fetch('/stats', { redirect: 'manual', headers: { cookie } })).status).toBe(200)
  })

  it('writes a Playwright storageState carrying the same cookie', () => {
    const state = JSON.parse(readFileSync(session.storageStatePath, 'utf8'))
    expect(state.cookies).toEqual([expect.objectContaining({
      name: session.reader.cookieName,
      value: session.reader.cookieValue,
      domain: 'localhost',
      path: '/',
    })])
  })
})
