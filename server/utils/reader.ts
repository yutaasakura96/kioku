/**
 * The owner of a `/api/**` request.
 *
 * ⚠️ **It re-derives nothing.** `server/middleware/session.ts` resolves the
 * session once per request and already answers `401` to an unauthenticated
 * `/api/**` call — ADR 0030's rule that no route re-derives the session, and
 * `08` §6.2's that the cookie is never handed to application code. This reads
 * the resolved value and exists only so that the `null` the type carries becomes
 * a refusal rather than an `ownerId` of `undefined` in a `WHERE` clause.
 *
 * ⚠️ **The throw is unreachable through the gate and is not decoration.** It is
 * the same failure the *places* guard with "renders its empty state rather than
 * guessing" — except an API route has no empty state, so it answers the status
 * its caller can act on. A middleware reordering that skipped the gate would
 * turn one reader's queue into another's without it.
 */
import type { H3Event } from 'h3'

export function requireOwnerId(event: H3Event): string {
  const ownerId = event.context.session?.user.id

  if (!ownerId)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  return ownerId
}
