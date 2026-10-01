/**
 * `POST /api/source/:id/delete` — `S11`'s soft delete (`09` §1, §4.11).
 *
 * ⚠️ **A form submit and a `303`**, post-redirect-get like the *source*
 * submission: the confirmation page ships no JavaScript (`10` §7.3), and the
 * reader's back button then lands on a document rather than a resubmission.
 * The redirect is to `/sources/:id`, now marked deleted — the *source* stays
 * readable (`04` §9.1).
 *
 * ⚠️ **An id that is not an id is a `404`, the same as an id nothing has.** It
 * arrives in the URL, and a malformed one should not reach Postgres as a cast
 * error.
 */
import { isUuid } from '../../../../shared/utils/uuid'
import { deleteSource } from '../../../utils/ingest/delete'
import { requireOwnerId } from '../../../utils/reader'
import { useDatabase } from '../../../db'

export default defineEventHandler(async (event) => {
  requireOwnerId(event)

  const id = getRouterParam(event, 'id')
  if (!isUuid(id))
    throw createError({ statusCode: 404, statusMessage: 'No such source' })

  const suspended = await deleteSource(useDatabase(), id)
  if (suspended === null)
    throw createError({ statusCode: 404, statusMessage: 'No such source' })

  return sendRedirect(event, `/sources/${id}`, 303)
})
