/**
 * `POST /api/placement/declare` — Welcome's *Already know your level? Start
 * at N3* (ADR 0079 §1). Starting above the first level claims the level below
 * it, as the prototype reads it, and that is a placement: its words are marked
 * known and spot-checked like the test's.
 *
 * ⚠️ **A form submit and a `303` to Home**, as `/api/category` is: `/` ships
 * no JavaScript. Starting at the first level claims nothing and only chooses
 * the *category*; a level that is not one lands back on `/` and writes nothing.
 */
import { categoryKey } from '../../../shared/category/category'
import { declaredLevel } from '../../../shared/level/placement'
import { jlptVocab, levelValues } from '../../../shared/subject/declaration'
import { chooseCategory } from '../../utils/category/active'
import { recordPlacement } from '../../utils/level/queries'
import { requireOwnerId } from '../../utils/reader'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const db = useDatabase()

  const body = await readBody(event).catch(() => undefined)
  const start = (body as Record<string, unknown> | undefined)?.start

  if (typeof start !== 'string' || !levelValues(jlptVocab).includes(start))
    return sendRedirect(event, '/', 303)

  const level = declaredLevel(start)
  if (level === null)
    await chooseCategory(db, ownerId, categoryKey({ kind: 'level', level: start }))
  else
    await recordPlacement(db, ownerId, { kind: 'declared', level })

  return sendRedirect(event, '/', 303)
})
