/**
 * `GET /api/placement` — a fresh placement test (ADR 0079 §1): about
 * twenty-five starter words, five a level, easiest first, each with its
 * choices. The test is not stored, and nothing is written.
 */
import { placementTest } from '../../utils/level/queries'
import { requireOwnerId } from '../../utils/reader'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  requireOwnerId(event)

  return { questions: await placementTest(useDatabase()) }
})
