/**
 * `S9`'s `X` — one keystroke, four rows, one transaction (`04` §7.8, `09` §4.9).
 *
 * ⚠️ **It is the outbox's second entry type and not a second outbox**
 * (`03` §8.1 as amended 2026-09-07, ADR 0039). `S9` says the suspension is
 * immediate, and immediate has to survive the same tunnel the *grades* do — so a
 * flag queues behind the *grade* the reader gave before it and lands after it.
 *
 * ⚠️ **`not_in_session` is a `200`**, the same reading as `/api/vet/decision`'s
 * `not_pending` and the *grade*'s: it is a stale tab rather than an error, and
 * the fresh snapshot that comes back with it is the whole remedy.
 *
 * ⚠️ **No stamp.** `card_flag.flagged_at` defaults to `now()` and nothing
 * computes anything from it, which is the difference between the two entry
 * types: a *grade* carries the moment it was given because FSRS schedules on
 * elapsed time (ADR 0007), and a flag replayed an hour late is still a flag.
 */
import { parseFlag } from '../../../shared/review/request'
import { recordFlag } from '../../utils/review/flag'
import { requireOwnerId } from '../../utils/reader'
import { snapshotOf } from '../../utils/review/queries'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const parsed = parseFlag(await readBody(event))

  if (!parsed.ok)
    throw createError({ statusCode: 400, statusMessage: parsed.code })

  const db = useDatabase()
  const outcome = await recordFlag(db, ownerId, parsed.flag)

  return {
    outcome: outcome.ok ? ('ok' as const) : outcome.reason,
    session: outcome.ok
      ? outcome.snapshot
      : await snapshotOf(db, ownerId, parsed.flag.sessionId),
  }
})
