/**
 * `POST /api/category` — the reader chooses the *category* their new words
 * come from (ADR 0077 §3).
 *
 * ⚠️ **A form submit and a `303`**, post-redirect-get like `/api/settings`:
 * `/categories` ships no JavaScript, and each row of the shelf is a form with
 * one button.
 *
 * ⚠️ **A chosen *category* lands on the screen before a run**, as the
 * prototype's choice lands on Home: that screen names the *category* and
 * counts the lesson in it, and until #71 builds Home it is `/review` (ADR 0076
 * §8). It composes nothing — `/review` without `start` never does.
 *
 * ⚠️ **A key that names no *category* changes nothing and lands back on the
 * shelf.** The way a reader sends one is a page drawn before a deck was
 * deleted, and the shelf that comes back shows what is true now.
 */
import { chooseCategory } from '../utils/category/active'
import { requireOwnerId } from '../utils/reader'
import { useDatabase } from '../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const body = await readBody(event).catch(() => undefined)
  const key = (body as Record<string, unknown> | undefined)?.category

  const chosen = await chooseCategory(useDatabase(), ownerId, key)

  return sendRedirect(event, chosen ? '/review?from=%2Fcategories' : '/categories', 303)
})
