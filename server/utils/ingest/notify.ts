/**
 * The wake-up — ADR 0028, ADR 0043.
 *
 * ⚠️ **The job table is the truth and this is only an optimisation.** Everything
 * here is allowed to fail: a notification that never arrives costs *latency* and
 * never work, because the worker re-`LISTEN`s and then polls on every connect
 * and reconnect (`03` §3.1). That is the whole reason this function swallows its
 * own errors instead of failing the reader's submission.
 *
 * ⚠️ **It runs after the transaction, never inside it.** Inside, Postgres would
 * queue the notification until commit — which is tidier — and it would put a
 * statement **nobody has run against Neon's pooled endpoint** inside the four
 * writes `S2` depends on. PgBouncer's own matrix says `NOTIFY` works in
 * transaction pooling (ADR 0043) and Neon's summary of that matrix says the pair
 * does not; until one live connection settles it, the safe order is the one
 * where being wrong costs latency. `04` §6.4's guarantee is that a `job` row
 * exists, and the optimisation is not allowed to be able to take that away.
 *
 * ⚠️ **`pg_notify(…)` and not `NOTIFY …`.** `NOTIFY` takes an identifier, which
 * cannot be parameterised; `pg_notify` takes a value, so the channel travels as
 * a bound parameter rather than as interpolated SQL.
 */

import { sql } from 'drizzle-orm'

import type { IngestDatabase } from './record'

/**
 * ⚠️ **A cross-language constant.** The worker subscribes to the same string
 * from Python (`worker/loop.py`), and a mismatch is **silent** — no error, no
 * log, just a worker that never wakes and a queue drained only on reconnect.
 * `test/unit/job-channel.test.ts` reads both spellings and asserts they agree,
 * for the same reason `03` §6's drift test exists at all.
 */
export const JOB_CHANNEL = 'kioku_job'

/**
 * Tell any listening worker the job table is worth re-reading.
 *
 * ⚠️ **The payload is empty on purpose** (ADR 0028): the wake-up says the table
 * changed and the query decides what is in it. Sending the job id would make the
 * worker's correctness depend on receiving it, and would walk into Postgres's
 * 8000-byte payload limit for no gain.
 *
 * Answers whether the notification went out, for the caller that wants to log
 * it. Nothing in the request path branches on it.
 */
export async function notifyJobQueued(db: IngestDatabase): Promise<boolean> {
  try {
    await db.execute(sql`SELECT pg_notify(${JOB_CHANNEL}, '')`)
    return true
  }
  catch {
    // Deliberately silent about the reason. The pooled endpoint is PgBouncer in
    // transaction mode, whose own feature matrix says `NOTIFY` works there and
    // `LISTEN` never does (verification §7.2, amended) — but Neon's summary of
    // that matrix names the pair, and nobody has run this against Neon yet.
    // Whichever way that resolves, the answer here is the same one ADR 0028
    // already gives: the next poll catches the work up.
    return false
  }
}
