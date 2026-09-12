/**
 * One keystroke — `space`, `R`, or `Enter` out of an edit (`S3`, `S6`).
 *
 * ⚠️ **The answer is the whole queue, every time.** `S3` measures one keystroke
 * per *note* with nothing moving between them, so the client must never wait on
 * a second round trip to paint the next *note* — and the cheapest way to make
 * that true without client-side bookkeeping is for the client to hold no
 * position at all: the head of this answer **is** the *note* the reader is
 * looking at (`server/utils/vet/queries.ts`). The chrome bar's counts arrive with
 * it, so they are never more than one keystroke old.
 *
 * ⚠️ **`not_pending` is a `200`, not a `409`.** It is not an error: it is a held
 * key, a second tab, or a client that got ahead of itself, and the whole
 * remedy is the fresh queue that comes back with it. Answering `409` would make
 * the client's error path and its success path do the same thing, which is how
 * one of them stops being tested.
 */
import { decide } from '../../utils/vet/decide'
import { jlptVocab } from '../../../shared/subject/declaration'
import { parseDecision } from '../../../shared/vet/decision'
import { requireOwnerId } from '../../utils/reader'
import { useDatabase } from '../../db'
import { vetQueue } from '../../utils/vet/queries'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)

  // ⚠️ **The declaration is `jlptVocab` because v1 ships one *subject*** (ADR
  // 0003). The validator is derived from whatever it is handed, so a second
  // subject is a lookup here and nothing else — and until there is one, choosing
  // by the *note*'s `subject_id` would mean reading the row before validating
  // the request that names it.
  const parsed = parseDecision(await readBody(event), jlptVocab)

  if (!parsed.ok)
    throw createError({ statusCode: 400, statusMessage: parsed.code })

  const db = useDatabase()
  const outcome = await decide(db, ownerId, parsed.decision)

  if (!outcome.ok && outcome.reason === 'unknown_subject') {
    throw createError({
      statusCode: 500,
      statusMessage: 'This build has no declaration for that subject',
    })
  }

  return {
    outcome: outcome.ok ? ('ok' as const) : outcome.reason,
    queue: await vetQueue(db, ownerId),
  }
})
