/**
 * `S12` — `GET /api/export`, a file on the reader's disk (`09` §4.12).
 *
 * ⚠️ **A `GET`, reached by a plain link on a `noScripts` *place*, and the
 * cross-site nuisance is accepted rather than fixed.** `SameSite=Lax` sends the
 * cookie on a cross-site top-level `GET`, so a malicious link can start this
 * download; it cannot read the response. `09` §4.12 and the 2026-09-07 entry in
 * `06` write that down on purpose, and name the revisit: a `POST` with a form
 * token, at which point the export stops being a plain link.
 *
 * ⚠️ **Unauthenticated, this answers `302` to the door and not the `401` every
 * other `/api/**` route does** — `server/middleware/session.ts` carries the
 * exception and `08` §6.3 the amendment. The caller is a browser following a
 * link, not a *mode*'s `fetch`.
 */
import { requireOwnerId } from '../utils/reader'
import { useDatabase } from '../db'
import { exportEverything } from '../utils/export/queries'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const exportedAt = new Date()
  const collections = await exportEverything(useDatabase(), ownerId)

  const day = exportedAt.toISOString().slice(0, 10)
  setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="kioku-export-${day}.json"`)

  return JSON.stringify({ exportedAt: exportedAt.toISOString(), ownerId, ...collections }, null, 2)
})
