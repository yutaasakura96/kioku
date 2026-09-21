/**
 * ADR 0069 §2 — the outbox's third entry type (`shared/review/outbox.ts`).
 *
 * ⚠️ **`not_in_session` is a `200`**, the flag's and the *grade*'s reading: a
 * stale tab rather than an error. ⚠️ **No snapshot comes back.** A synonym moves
 * nothing on the rail, and the screen already holds it (`withSynonym`), so the
 * answer is the outcome alone.
 */
import { parseSynonym } from '../../../shared/review/request'
import { recordSynonym } from '../../utils/review/synonym'
import { requireOwnerId } from '../../utils/reader'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const parsed = parseSynonym(await readBody(event))

  if (!parsed.ok)
    throw createError({ statusCode: 400, statusMessage: parsed.code })

  const outcome = await recordSynonym(useDatabase(), ownerId, parsed.synonym)

  return { outcome, session: null, brake: null }
})
