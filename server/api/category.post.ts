/**
 * `POST /api/category` — the reader chooses the *category* their new words
 * come from (ADR 0077 §3).
 *
 * ⚠️ **A form submit and a `303`**, post-redirect-get like `/api/settings`:
 * `/categories` ships no JavaScript, and each row of the shelf is a form with
 * one button.
 *
 * ⚠️ **A chosen *category* lands on Home**, as the prototype's choice does:
 * Home names the *category* and counts the lesson in it. ⚠️ Until #71 built
 * Home (ADR 0078) this landed on `/review`'s screen before a run, which stood
 * in for it (ADR 0076 §8). It composes nothing.
 *
 * ⚠️ **Welcome posts here too**, one form a *level*, and choosing is what ends
 * a first visit: the row it writes is how Home tells the reader is not new.
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

  return sendRedirect(event, chosen ? '/' : '/categories', 303)
})
