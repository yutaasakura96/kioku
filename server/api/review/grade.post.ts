/**
 * One *grade* — `1`, `2`, `3` or `4` (`S7`, ADR 0016, ADR 0034).
 *
 * ⚠️ **The interface never waits on this** (`S8`, ADR 0007). The selected state
 * on the control is visible for exactly as long as it takes the next *card* to
 * render and it is not a loading state, so the answer here is bookkeeping the
 * client folds in when it arrives rather than the thing that lets the reader
 * move. #13 puts an outbox in front of it; until then a lost request is a lost
 * *grade*, which is what that ticket exists to close.
 *
 * ⚠️ **`not_in_session` and `already_graded` are `200`s, not `409`s** — the same
 * reading as `/api/vet/decision`'s `not_pending`. Neither is an error: one is a
 * stale tab and the other is a held key, and the whole remedy is the fresh
 * snapshot that comes back with it. Answering `409` would make the client's
 * error path and its success path do the same thing, which is how one of them
 * stops being tested.
 *
 * ⚠️ **The server does not stamp the *grade***. `reviewed_at` arrives from the
 * client and `received_at` is written beside it (`03` §8.1, `04` §7.5).
 */
import { parseGrade } from '../../../shared/review/request'
import { recordGrade } from '../../utils/review/grade'
import { requireOwnerId } from '../../utils/reader'
import { snapshotOf } from '../../utils/review/queries'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const parsed = parseGrade(await readBody(event))

  if (!parsed.ok)
    throw createError({ statusCode: 400, statusMessage: parsed.code })

  const db = useDatabase()
  const outcome = await recordGrade(db, ownerId, parsed.grade)

  return {
    outcome: outcome.ok ? ('ok' as const) : outcome.reason,
    session: outcome.ok
      ? outcome.snapshot
      : await snapshotOf(db, ownerId, parsed.grade.sessionId),
  }
})
