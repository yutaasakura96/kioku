/**
 * `npm run dev:session` — the app running locally, with a reader already signed
 * in, so an agent can look at the screens behind the Google gate in a real
 * browser.
 *
 * ⚠️ **The app does not change and gains no way in.** `S1` says refused at
 * every route, and a sign-in shortcut inside the app was refused outright on
 * 2026-09-11 for that reason (decision log). This script lives outside the app:
 * it boots a **local** PGlite database (kept in `.data/dev-session/`), writes a
 * reader and a session into it with the e2e tier's own `signIn`, signs the
 * cookie with a **local fixture** secret, and runs `nuxt dev` against exactly
 * that database and that secret. The cookie opens this laptop's app and nothing
 * else: no deployed process has the secret, and no deployed database has the
 * row. `scripts/dev-session/guard.ts` refuses before anything is written if any
 * of that is not true.
 *
 *   npm run dev:session                      # app on http://localhost:3000
 *   DEV_SESSION_PORT=3100 npm run dev:session
 *
 * It prints three hand-offs, most convenient first: a URL that sets the cookie
 * and redirects into the app; a Playwright `storageState` file; and the cookie's
 * name, value, domain and path. Ctrl-C stops the app and the database.
 *
 * ⚠️ **The root `.env` is not read by the app it starts** — `--dotenv` points
 * `nuxt dev` at `.data/dev-session/app.env` instead — so Neon is never the
 * database behind a forged session. The worker is not started; ingest jobs
 * queue and wait, which is enough to look at every screen.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

import { DevSessionRefused, prepareDevSession, startHandoff } from './dev-session/prepare.ts'
import type { DevSession } from './dev-session/prepare.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STATE_DIR = fileURLToPath(new URL('../.data/dev-session', import.meta.url))
const port = Number(process.env.DEV_SESSION_PORT ?? 3000)
const appUrl = `http://localhost:${port}`

function realSecrets(): string[] {
  const path = fileURLToPath(new URL('../.env', import.meta.url))
  if (!existsSync(path))
    return []

  const secret = parseEnv(readFileSync(path, 'utf8')).BETTER_AUTH_SECRET
  return secret ? [secret] : []
}

async function prepare(): Promise<DevSession> {
  try {
    return await prepareDevSession({
      stateDir: STATE_DIR,
      appUrl,
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL ?? process.env.VERCEL_ENV,
      realSecrets: realSecrets(),
    })
  }
  catch (error) {
    if (!(error instanceof DevSessionRefused))
      throw error

    console.error(`dev:session refused: ${error.message}`)
    process.exit(1)
  }
}

const session = await prepare()

const handoff = await startHandoff(session.reader, appUrl)
const cookieUrl = new URL(appUrl)

console.log(`
dev:session — a local reader is signed in (${session.reader.userId}).

  App          ${appUrl}  (starting below)
  Sign in      open ${handoff.url}  — sets the cookie, redirects to the app
  Playwright   ${session.storageStatePath}  (storageState)
  Cookie       name=${session.reader.cookieName}
               value=${session.reader.cookieValue}
               domain=${cookieUrl.hostname}  path=/  httpOnly  sameSite=Lax

  Local database only (${session.database.connectionString}). Ctrl-C stops everything.
`)

const nuxt = spawn(
  fileURLToPath(new URL('../node_modules/.bin/nuxt', import.meta.url)),
  ['dev', '--port', String(port), '--dotenv', '.data/dev-session/app.env'],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...session.appEnv } },
)

let stopping = false
async function stop(code: number) {
  if (stopping)
    return
  stopping = true
  nuxt.kill('SIGTERM')
  await handoff.stop()
  await session.database.stop()
  process.exit(code)
}

process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
nuxt.on('exit', code => void stop(code ?? 0))
