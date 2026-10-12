/**
 * The reader's study settings — ADR 0076 §2, `04` §7.10.
 *
 * ⚠️ **No row is the defaults, and nothing writes one until the reader saves
 * the form.** A row per reader inserted at sign-in would be a second place the
 * defaults live, and it would drift from `DEFAULT_LIMITS` the first time one
 * of them moved.
 */

import { eq, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { DEFAULT_LIMITS, clampLimits } from '../../../shared/review/limits'
import type { StudyLimits } from '../../../shared/review/limits'
import type { IngestDatabase } from '../ingest/record'

/**
 * ⚠️ **Clamped on the way out as well as on the way in** (`limits.ts`): the
 * table's checks are only a floor, and a composition must never see a value
 * the form would not have taken.
 */
export async function readLimits(db: IngestDatabase, ownerId: string): Promise<StudyLimits> {
  const [row] = await db
    .select({
      lessonSize: schema.studySetting.lessonSize,
      dailyNew: schema.studySetting.dailyNew,
      pauseAbove: schema.studySetting.pauseAbove,
    })
    .from(schema.studySetting)
    .where(eq(schema.studySetting.ownerId, ownerId))
    .limit(1)

  return row ? clampLimits(row) : { ...DEFAULT_LIMITS }
}

/** The form's values, clamped, as the reader's one row. Answers what was stored. */
export async function writeLimits(db: IngestDatabase, ownerId: string, raw: unknown): Promise<StudyLimits> {
  const limits = clampLimits(raw)

  await db
    .insert(schema.studySetting)
    .values({ ownerId, ...limits })
    .onConflictDoUpdate({
      target: schema.studySetting.ownerId,
      set: { ...limits, updatedAt: sql`now()` },
    })

  return limits
}
