/**
 * `POST /api/placement` — the reader accepts the test's result (ADR 0079 §1).
 *
 * ⚠️ **The server scores the answers again**, against the meanings it holds,
 * with the same rules the screen walked the test with (`shared/level/placement.ts`).
 * The body says which word and which choice, never whether it was right.
 *
 * Writes the placement, the active *category* at the level lessons start at,
 * and the spot-check, in one transaction (`recordPlacement`).
 */
import { parseAnswers, placedLevel, scoreAnswers, tally } from '../../../shared/level/placement'
import { recordPlacement, testedWords } from '../../utils/level/queries'
import { requireOwnerId } from '../../utils/reader'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const db = useDatabase()

  const answers = parseAnswers(await readBody(event).catch(() => undefined))
  if (!answers)
    throw createError({ statusCode: 400, statusMessage: 'invalid_answers' })

  const words = await testedWords(db, answers.map(answer => answer.noteId))
  const level = placedLevel(tally(scoreAnswers(answers, words)))
  const recorded = await recordPlacement(db, ownerId, { kind: 'test', level })

  return { level, start: recorded.start, checks: recorded.checks }
})
