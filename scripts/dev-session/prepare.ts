/**
 * The parts of `npm run dev:session` a test can drive: a local database, a
 * signed-in reader in it, and the three ways a browser can be handed that
 * reader's cookie. `scripts/dev-session.ts` is the entry point that wires them
 * to `nuxt dev`.
 *
 * ⚠️ **Nothing here is new signing code.** The database is the e2e tier's
 * (`test/e2e/database.ts`) with a directory to keep it in, and the session is
 * the e2e tier's (`test/e2e/session.ts`) with a local secret passed in. Both
 * were already trusted for exactly this — a session the app accepts, with no
 * route that mints one (decision log, 2026-09-11 and 2026-09-25).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

import { startTestDatabase } from '../../test/e2e/database.ts'
import type { TestDatabase } from '../../test/e2e/database.ts'
import { TEST_ENVIRONMENT } from '../../test/e2e/environment.ts'
import { SESSION_SECONDS, signIn } from '../../test/e2e/session.ts'
import type { SignedInReader } from '../../test/e2e/session.ts'
import { refusal } from './guard.ts'
import type { DevSessionTarget } from './guard.ts'

/** The local reader. Reused across runs: the rows are written `ON CONFLICT`. */
export const DEV_READER_ID = 'usr_dev_session'

export interface DevSessionOptions {
  /** Where the database, the env file and the storage state live. */
  stateDir: string
  /** The app the cookie is for. `http://localhost:<port>`. */
  appUrl: string
  nodeEnv: string | undefined
  vercel: string | undefined
  realSecrets: readonly string[]
}

export interface DevSession {
  database: TestDatabase
  reader: SignedInReader
  /** The environment the app has to boot with to accept {@link reader}. */
  appEnv: Record<string, string>
  /** The same values as a dotenv file, for `nuxt dev --dotenv`. */
  envFile: string
  /** A Playwright `storageState` file carrying the cookie. */
  storageStatePath: string
}

/** Thrown when {@link refusal} says no. Its message is the reason. */
export class DevSessionRefused extends Error {}

/**
 * Checks the target, then boots the local database and signs the reader in.
 *
 * ⚠️ **The check runs before anything is written** — the database directory
 * included. The URL it checks is the one PGlite is about to listen on; the port
 * is not known until it does, and the host is the part the rule is about.
 */
export async function prepareDevSession(options: DevSessionOptions): Promise<DevSession> {
  const secret = TEST_ENVIRONMENT.BETTER_AUTH_SECRET!
  const target: DevSessionTarget = {
    nodeEnv: options.nodeEnv,
    vercel: options.vercel,
    databaseUrl: 'postgres://postgres@127.0.0.1/postgres',
    appUrl: options.appUrl,
    secret,
    realSecrets: options.realSecrets,
  }

  const reason = refusal(target)
  if (reason)
    throw new DevSessionRefused(reason)

  mkdirSync(options.stateDir, { recursive: true })
  const database = await startTestDatabase({ dataDir: join(options.stateDir, 'pgdata') })

  const reader = await signIn(database.client, DEV_READER_ID, {
    secret,
    email: TEST_ENVIRONMENT.KIOKU_INVITED_EMAIL,
  })

  const appEnv: Record<string, string> = {
    ...TEST_ENVIRONMENT,
    DATABASE_URL: database.connectionString,
    BETTER_AUTH_URL: options.appUrl,
  }

  const envFile = join(options.stateDir, 'app.env')
  writeFileSync(
    envFile,
    `# Written by npm run dev:session. Local fixtures only; overwritten every run.\n${
      Object.entries(appEnv).map(([key, value]) => `${key}=${value}`).join('\n')}\n`,
  )

  const storageStatePath = join(options.stateDir, 'storage-state.json')
  writeFileSync(storageStatePath, `${JSON.stringify(storageState(reader, options.appUrl), null, 2)}\n`)

  return { database, reader, appEnv, envFile, storageStatePath }
}

/**
 * Playwright's `storageState` shape — what `browser.newContext({ storageState })`
 * and Playwright MCP's `--storage-state` read.
 */
export function storageState(reader: SignedInReader, appUrl: string) {
  return {
    cookies: [
      {
        name: reader.cookieName,
        value: reader.cookieValue,
        domain: new URL(appUrl).hostname,
        path: '/',
        expires: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
        // The attributes `server/utils/auth.ts` gives the real one, over http.
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  }
}

export interface Handoff {
  /** Open this in any browser and it lands on the app, signed in. */
  url: string
  stop: () => Promise<void>
}

/**
 * A one-purpose server **outside the app** that sets the cookie and redirects
 * into it.
 *
 * It works because a cookie is scoped to a host and not to a port (RFC 6265
 * §8.5), so a cookie set by `localhost:<this>` is sent to `localhost:3000`. That
 * is what lets any browser tool — Playwright MCP, chrome-devtools-axi — be
 * signed in by navigating, which is the one thing all of them can do, and it is
 * why the session cookie being `HttpOnly` does not get in the way: nothing has
 * to write it from script.
 *
 * ⚠️ **It lives in this process, on the loopback interface, only while the
 * script runs**, and the cookie it sets opens a database that lives in the same
 * process. It is not a route of the app and the app does not know it exists.
 */
export async function startHandoff(reader: SignedInReader, appUrl: string, port = 0): Promise<Handoff> {
  const host = new URL(appUrl).hostname
  const cookie = [
    `${reader.cookieName}=${reader.cookieValue}`,
    'Path=/',
    `Max-Age=${SESSION_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ')

  const server = createServer((_request, response) => {
    response.writeHead(302, { 'Set-Cookie': cookie, 'Location': appUrl, 'Cache-Control': 'no-store' })
    response.end()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo

  return {
    url: `http://${host}:${address.port}/`,
    stop: () => new Promise(resolve => server.close(() => resolve())),
  }
}
