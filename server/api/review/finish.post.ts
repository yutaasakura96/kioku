/**
 * ADR 0076 §6 — *Finish early*. The run is stamped complete with whatever it
 * holds and the summary is what is left of it.
 *
 * ⚠️ **It is the outbox's third entry type and not a request of its own**
 * (`03` §8.1, ADR 0039): it queues behind the *grades* the reader gave before
 * pressing it — the Forgot for each word missed and not yet got right is among
 * them — and lands after them, so the run is never called finished while an
 * answer in it is still on the way.
 *
 * ⚠️ **A run that is not the reader's, or not there, is a `200` with
 * `not_in_session`** — the same reading as the *grade*'s. It is a stale tab
 * and nothing is retryable about it.
 *
 * ⚠️ **No stamp**, as a flag carries none: `completed_at` is the server's
 * `now()` and nothing is scheduled from it.
 */
import { parseFinish } from '../../../shared/review/request'
import { finishSession, offerIfFinished } from '../../utils/review/session'
import { requireOwnerId } from '../../utils/reader'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const body = await readBody(event)
  const parsed = parseFinish(body)

  if (!parsed.ok)
    throw createError({ statusCode: 400, statusMessage: parsed.code })

  const db = useDatabase()
  const session = await finishSession(db, ownerId, parsed.finish.sessionId)

  return {
    outcome: session ? ('ok' as const) : ('not_in_session' as const),
    session,
    offer: await offerIfFinished(db, ownerId, session, session !== null),
  }
})
