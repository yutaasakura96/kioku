/**
 * `Z` — ADR 0033. The target is read from the database, never sent by the
 * client, which is what lets the undo survive a reload.
 *
 * ⚠️ **`reviewed` is a `200` carrying a reason, not a `500`.** It is the
 * `RESTRICT` on `review_session_card → card` and `review_log → card` refusing a
 * delete (`04` §9.1), which is the guard working rather than failing — and `10`
 * §4.8 renders it as a message in place of the footer legend, **not on a timer**,
 * because the reader's eyes are on the *term* rather than on the footer.
 */
import { requireOwnerId } from '../../utils/reader'
import { undoLastDecision } from '../../utils/vet/undo'
import { useDatabase } from '../../db'
import { vetQueue } from '../../utils/vet/queries'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const db = useDatabase()
  const outcome = await undoLastDecision(db, ownerId)

  return {
    outcome: outcome.ok ? ('ok' as const) : outcome.reason,
    queue: await vetQueue(db, ownerId),
  }
})
