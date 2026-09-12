/**
 * A database the **built, running app** can reach — the thing the e2e tier has
 * never had.
 *
 * ⚠️ **This is the debt `11` §6.1 named and handed to #10, paid here instead.**
 * `08` §6.3 put the three *places* and the two *modes* behind a session, so from
 * #5 onwards an unauthenticated e2e request to any of them is a `302` to `/auth`
 * and there is no document to read. `11` §6.1: "That needs an authenticated
 * browser, which needs a session row, which needs a database in the e2e tier —
 * scope ADR 0038 deliberately kept out of the TypeScript suite. **#10 cannot be
 * tested at all without an authenticated e2e context**, so that is where the
 * context should land." `00-status.md` § Next added the escape hatch: "if #6
 * finds it needs an authenticated request sooner, that is the ticket to argue it
 * on".
 *
 * **#6 finds it needs one.** Its acceptance criteria include "⚠️ The over-cap
 * answer re-renders the form **with the reader's text still in it** — tested end
 * to end, because the post-redirect-get pair has no smaller seam (`11` §8)", and
 * every route that pair touches is gated. There is no way to assert it without
 * being signed in.
 *
 * ⚠️ **It is still PGlite, and ADR 0038 is not disturbed.** `11` §1's own table
 * already says the e2e tier's database is PGlite; what was missing was a way to
 * reach an *in-process* database from *another* process.
 * `@electric-sql/pglite-socket` is that — it speaks the PostgreSQL wire protocol
 * over TCP, so `node-postgres` in the built app connects to it exactly as it
 * connects to Neon (ADR 0040). **Docker is still required for exactly three
 * tests and they are all in `worker/`.**
 *
 * ⚠️ **`exactly` is wrong in the one place a test can notice, and the difference
 * is not a nicety** (ADR 0059). The socket does not open its own *session* — it
 * shares this one. Measured 2026-09-12: `client` below and the app's connection
 * report the **same `pg_backend_pid` and the same `txid`**, so a read through
 * `client` while the app is mid-transaction **sees uncommitted rows**, and a
 * write through `client` in that window is **lost to the app's rollback**.
 * **The rule: what the app writes in one transaction, read in one statement.**
 * A poll whose predicate spans two statements is a poll over two snapshots, and
 * `test/e2e/vet.test.ts` failed about one full-suite run in four on exactly
 * that.
 *
 * ⚠️ **The new dependency tightens PIN 6/6 rather than loosening it.**
 * `@electric-sql/pglite-socket` 0.2.11 declares a peer dependency on
 * `@electric-sql/pglite` **0.5.8 exactly** — the same version `03` §13.5 pins
 * because PGlite 0.5.8 is PostgreSQL 18.3 and `04` defaults every primary key to
 * `uuidv7()`, a Postgres 18 built-in. An accidental PGlite bump now fails at
 * install rather than at the first `CREATE TABLE`.
 */

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'

import * as schema from '../../server/db/schema'

const MIGRATIONS = fileURLToPath(new URL('../../server/db/migrations', import.meta.url))

export interface TestDatabase {
  /**
   * In-process handle, for seeding and for reading back what the app wrote.
   * ⚠️ **Reading back is where ADR 0059 bites**: this shares the app's session,
   * so read a multi-write transaction in one statement or not at all.
   */
  client: PGlite
  /** What `DATABASE_URL` becomes for the app under test. */
  connectionString: string
  stop: () => Promise<void>
}

/**
 * Boots PGlite, runs **the real migrations** through Drizzle's own migrator —
 * the same choice `test/schema/harness.ts` argues, and for the same reason: a
 * hand-written test schema is a second copy of `04`, and `04` §13's whole
 * argument is that copies drift in the most damaging direction, because the copy
 * is what the tests would then be proving correct.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite()
  await migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS })

  // Port 0 asks the OS for a free one. A fixed port would make two test files
  // run in parallel into a race whose symptom is a connection refused in
  // whichever one lost.
  const server = new PGLiteSocketServer({ db: client, port: 0, host: '127.0.0.1' })
  await server.start()

  const address = (server as unknown as { server?: { address: () => AddressInfo | null } })
    .server?.address()

  if (!address || typeof address === 'string')
    throw new Error('the PGlite socket server did not report a port')

  return {
    client,
    // PGlite exposes one database and does not authenticate; the user and
    // database names are what `node-postgres` insists on sending, not a
    // credential. ⚠️ Nothing real is in this string — `03` §13.1, the repo is
    // public.
    connectionString: `postgres://postgres@127.0.0.1:${address.port}/postgres`,
    stop: async () => {
      await server.stop()
      await client.close()
    },
  }
}
