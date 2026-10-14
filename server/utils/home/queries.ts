/**
 * What Home reads — [ADR 0078](../../../docs/adr/0078-home-is-the-landing-place-and-more-holds-the-rest.md),
 * the prototype's `vHome`. Welcome or the dashboard, and everything the
 * dashboard draws.
 *
 * ⚠️ **Sequential reads and no correlated `sql` templates**, for the two
 * reasons at the head of `server/utils/review/queries.ts`. The arithmetic is
 * `shared/home/dashboard.ts`'s; this file only reads rows.
 *
 * ⚠️ **Everything here is the current *subject*'s** (ADR 0075 §1).
 */

import { and, count, eq, gte, inArray, isNull, lte } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { comingUp, studyDays, weakWords, WEAK_MIN_MISSES } from '../../../shared/home/dashboard'
import type { HomeData, WeakWord } from '../../../shared/home/dashboard'
import { stageOfEpoch } from '../../../shared/review/stage'
import { categoryShelf } from '../category/queries'
import type { IngestDatabase } from '../ingest/record'
import { readerZone } from '../review/queries'
import { offerOf } from '../review/session'
import { noteInCurrentSubject, sessionInCurrentSubject } from '../subject'

export type { HomeData } from '../../../shared/home/dashboard'

/** A week from now and a day over, so the last local day of the week is read whole. */
const WEEK_AHEAD_MS = 8 * 86_400_000

/** Fifteen days back, wider than the fourteen local days the strip shows. */
const DAYS_BACK_MS = 15 * 86_400_000

export async function homeData(db: IngestDatabase, ownerId: string, now: Date): Promise<HomeData> {
  const zone = await readerZone(db, ownerId)
  const offer = await offerOf(db, ownerId, zone, now)
  const firstVisit = await isFirstVisit(db, ownerId)
  const shelf = await categoryShelf(db, ownerId)

  const dues = await db
    .select({ due: schema.schedulingEpoch.due })
    .from(schema.schedulingEpoch)
    .innerJoin(schema.card, eq(schema.card.id, schema.schedulingEpoch.cardId))
    .where(
      and(
        studied(db, ownerId),
        lte(schema.schedulingEpoch.due, new Date(now.getTime() + WEEK_AHEAD_MS)),
      ),
    )

  const graded = await db
    .select({ reviewedAt: schema.reviewLog.reviewedAt })
    .from(schema.reviewLog)
    .innerJoin(schema.card, eq(schema.card.id, schema.reviewLog.cardId))
    .where(
      and(
        eq(schema.reviewLog.ownerId, ownerId),
        gte(schema.reviewLog.reviewedAt, new Date(now.getTime() - DAYS_BACK_MS)),
        noteInCurrentSubject(db, schema.card.noteId),
      ),
    )

  const [any] = await db
    .select({ n: count() })
    .from(schema.reviewLog)
    .innerJoin(schema.card, eq(schema.card.id, schema.reviewLog.cardId))
    .where(and(eq(schema.reviewLog.ownerId, ownerId), noteInCurrentSubject(db, schema.card.noteId)))

  return {
    firstVisit,
    hasHistory: (any?.n ?? 0) > 0,
    offer,
    levels: shelf.filter(row => row.group === 'jlpt'),
    comingUp: comingUp(dues.map(row => row.due), now, zone),
    days: studyDays(graded.map(row => row.reviewedAt), now, zone),
    weak: await weak(db, ownerId),
  }
}

/** No *category* chosen and no run ever composed in this *subject*. */
async function isFirstVisit(db: IngestDatabase, ownerId: string): Promise<boolean> {
  const [chosen] = await db
    .select({ ownerId: schema.activeCategory.ownerId })
    .from(schema.activeCategory)
    .where(eq(schema.activeCategory.ownerId, ownerId))
    .limit(1)

  if (chosen)
    return false

  const [run] = await db
    .select({ id: schema.reviewSession.id })
    .from(schema.reviewSession)
    .where(and(eq(schema.reviewSession.ownerId, ownerId), sessionInCurrentSubject(db)))
    .limit(1)

  return !run
}

/**
 * The words the reader keeps missing (`shared/home/dashboard.ts`'s rule).
 *
 * ⚠️ **Three reads, narrowest first**: the *cards* missed at least twice, then
 * every *grade* of those, then where each stands and what it says. A reader
 * with a year of history has tens of thousands of `review_log` rows, and only
 * the first read touches all of them.
 */
async function weak(db: IngestDatabase, ownerId: string): Promise<WeakWord[]> {
  const missed = await db
    .select({ cardId: schema.reviewLog.cardId, misses: count() })
    .from(schema.reviewLog)
    .innerJoin(schema.card, eq(schema.card.id, schema.reviewLog.cardId))
    .where(
      and(
        eq(schema.reviewLog.ownerId, ownerId),
        // Forgot — ADR 0034's name for rating 1.
        eq(schema.reviewLog.rating, 1),
        isNull(schema.card.suspendedAt),
        noteInCurrentSubject(db, schema.card.noteId),
      ),
    )
    .groupBy(schema.reviewLog.cardId)

  const candidates = missed.filter(row => row.misses >= WEAK_MIN_MISSES)
  if (candidates.length === 0)
    return []

  const ids = candidates.map(row => row.cardId)

  const answered = await db
    .select({ cardId: schema.reviewLog.cardId, answers: count() })
    .from(schema.reviewLog)
    .where(and(eq(schema.reviewLog.ownerId, ownerId), inArray(schema.reviewLog.cardId, ids)))
    .groupBy(schema.reviewLog.cardId)

  const words = await db
    .select({
      cardId: schema.card.id,
      fields: schema.note.fields,
      state: schema.schedulingEpoch.state,
      stability: schema.schedulingEpoch.stability,
    })
    .from(schema.card)
    .innerJoin(schema.note, eq(schema.note.id, schema.card.noteId))
    .innerJoin(
      schema.schedulingEpoch,
      and(eq(schema.schedulingEpoch.cardId, schema.card.id), isNull(schema.schedulingEpoch.supersededAt)),
    )
    .where(and(inArray(schema.card.id, ids), eq(schema.schedulingEpoch.ownerId, ownerId)))

  const answers = new Map(answered.map(row => [row.cardId, row.answers]))
  const misses = new Map(candidates.map(row => [row.cardId, row.misses]))

  return weakWords(words.map(word => ({
    cardId: word.cardId,
    fields: (word.fields ?? {}) as Record<string, string>,
    answers: answers.get(word.cardId) ?? 0,
    misses: misses.get(word.cardId) ?? 0,
    stage: stageOfEpoch(word),
  })))
}

/** The reader's live epochs on *cards* they are still studying, in this *subject*. */
function studied(db: IngestDatabase, ownerId: string) {
  return and(
    eq(schema.schedulingEpoch.ownerId, ownerId),
    isNull(schema.schedulingEpoch.supersededAt),
    isNull(schema.card.suspendedAt),
    noteInCurrentSubject(db, schema.card.noteId),
  )
}
