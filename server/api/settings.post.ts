/**
 * `POST /api/settings` — the reader's three study settings (ADR 0076 §2).
 *
 * ⚠️ **A form submit and a `303`**, post-redirect-get like `S11`'s delete:
 * `/settings` ships no JavaScript, and the reader's back button then lands on a
 * document rather than a resubmission.
 *
 * ⚠️ **Nothing is refused.** A value out of range is clamped and a blank one is
 * the default (`shared/review/limits.ts`), and the page the redirect lands on
 * shows what was stored — which is how the reader learns the bound.
 */
import { requireOwnerId } from '../utils/reader'
import { writeLimits } from '../utils/review/settings'
import { useDatabase } from '../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const body = await readBody(event).catch(() => undefined)

  await writeLimits(useDatabase(), ownerId, body)

  return sendRedirect(event, '/settings?saved=1', 303)
})
