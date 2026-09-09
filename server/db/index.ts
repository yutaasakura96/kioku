// The app's database handle. `03` §4.1 — **two connection strings, on purpose.**
//
// | Consumer          | String                          | Why                                      |
// | ----------------- | ------------------------------- | ---------------------------------------- |
// | This, the Nuxt app| **pooled** (`-pooler` in the host) | Connection-per-request, PgBouncer transaction mode |
// | The Python worker | **direct**                      | ⚠️ **The pooled endpoint cannot `LISTEN` at all** |
//
// That is not a tuning preference. PgBouncer in transaction mode supports
// neither `LISTEN`/`NOTIFY` nor `SET`, `PREPARE`, `WITH HOLD CURSOR` or
// session-level advisory locks — confirmed against both Neon's and PgBouncer's
// own lists (verification §7.2, §9.2). A worker on the pooled string does not
// run slowly; **it silently never wakes.** The worker's string arrives with #7,
// in a gitignored `.env` on the laptop (`03` §13.1); it is never read here.
//
// ⚠️ **The string is used verbatim as issued.** ADR 0027 is explicit: no
// `options=endpoint%3D…` rewriting, no hand-edited TLS parameters. Neon's issued
// string already carries what it needs.
//
// ⚠️ **The repo is public** (`03` §13.1), so this file names the variable and
// never the value. `.env.example` carries the names and nothing else.
//
// The driver is `node-postgres`, not `@neondatabase/serverless`. ADR 0022's
// whole premise is that the move to EC2 or Lightsail stays a Nitro preset change
// plus a `pg_dump`; a Neon-specific driver is a second thing that move would
// have to undo, for no gain over a pooled endpoint speaking ordinary Postgres.

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

/**
 * Reads the pooled connection string, or stops the process.
 *
 * ⚠️ A missing value is a dead process, not a degraded one. `08` §4.3 makes the
 * same choice for `KIOKU_INVITED_EMAIL` and for the same reason: a misconfigured
 * deploy should fail loudly at the boundary rather than answer requests in a
 * shape nobody chose.
 */
function pooledConnectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url)
    throw new Error('DATABASE_URL is not set. The app takes Neon\'s pooled string, verbatim (`03` §4.1).')

  return url
}

let pool: Pool | undefined

/**
 * The connection pool, created once per server instance and reused across
 * requests. Neon's direct endpoint is bounded by `max_connections` — 97 usable
 * at 0.25 CU — but this is the *pooled* endpoint, whose `max_client_conn` is
 * 10000, so a pool per instance is what the topology expects (`03` §4.1).
 */
function connectionPool(): Pool {
  pool ??= new Pool({ connectionString: pooledConnectionString() })
  return pool
}

/** The Drizzle handle. `08` §10 passes this to `drizzleAdapter(db, …)`. */
export function useDatabase() {
  return drizzle(connectionPool(), { schema })
}

export { schema }
