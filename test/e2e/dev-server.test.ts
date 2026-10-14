// `nuxt dev`, which `npm run dev:session` runs, serves every page signed in.
// Every other file in this tier boots the built app, so a server setting that
// breaks only the dev bundle passed all of them: from #73 until this test, the
// `@opentelemetry/api` stand-in ran at the dev server's boot and every page
// answered `500` (`nuxt.config.ts`, the `nitro:config` hook).
//
// The environment is `npm run dev:session`'s own, from `prepareDevSession`: a
// local PGlite database and a fixture secret, never the root `.env`.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

import { prepareDevSession } from '../../scripts/dev-session/prepare'

const stateDir = mkdtempSync(join(tmpdir(), 'kioku-dev-server-'))
const session = await prepareDevSession({
  stateDir,
  appUrl: 'http://localhost:3000',
  nodeEnv: 'development',
  vercel: undefined,
  realSecrets: [],
})

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  dev: true,
  env: session.appEnv,
})

afterAll(async () => {
  await session.database.stop()
  rmSync(stateDir, { recursive: true, force: true })
})

describe('nuxt dev', () => {
  it('serves the door signed out', async () => {
    expect((await fetch('/auth', { redirect: 'manual' })).status).toBe(200)
  })

  it.each(['/', '/categories', '/more', '/add', '/sources', '/stats', '/settings', '/vet', '/review', '/placement'])(
    'serves %s signed in',
    async (path) => {
      const response = await fetch(path, { redirect: 'manual', headers: { cookie: session.reader.cookie } })
      expect(response.status).toBe(200)
    },
  )
})
