/**
 * The placement test, the placement and *Your level* — [ADR 0079](../../../docs/adr/0079-a-level-is-proved-and-placement-is-checked.md).
 * The rules are `shared/level/`'s; this file reads and writes rows.
 *
 * ⚠️ **Sequential reads and no correlated `sql` templates**, for the two
 * reasons at the head of `server/utils/review/queries.ts`.
 *
 * ⚠️ **Everything here is the current *subject*'s** (ADR 0075 §1).
 */

import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { categoryKey, levelAuthority } from '../../../shared/category/category'
import { estimateLevel } from '../../../shared/level/estimate'
import type { LevelEstimate, LevelEvidence, StandingPlacement } from '../../../shared/level/estimate'
import { knownLevels, placementQuestion, startLevel } from '../../../shared/level/placement'
import type { PlacementQuestion, PlacementWord } from '../../../shared/level/placement'
import { interleave, spotCheckDues, tallyChecks } from '../../../shared/level/spot-check'
import { ESTIMATE_WINDOW_DAYS, PLACEMENT_WORDS_PER_LEVEL, SPOT_CHECKS_PER_LEVEL } from '../../../shared/level/thresholds'
import { knownEpoch } from '../../../shared/review/scheduler'
import { jlptVocab, levelValues } from '../../../shared/subject/declaration'
import { chooseCategory } from '../category/active'
import type { IngestDatabase } from '../ingest/record'
import { unstartedNotes } from '../review/queries'
import { startNotes } from '../review/session'
import { CURRENT_SUBJECT_ID, noteInCurrentSubject } from '../subject'

/** Words read a level beyond the test's own, for the wrong choices to come from. */
const CHOICE_POOL = 40

/**
 * A fresh test: `PLACEMENT_WORDS_PER_LEVEL` starter words a level, easiest
 * level first, each with its choices.
 *
 * ⚠️ **Random on every call**, so a retake is a different test. The test is
 * not stored: the words and the answers come back together when the result is
 * accepted, and the server scores them again (`acceptedTest`).
 */
export async function placementTest(db: IngestDatabase): Promise<PlacementQuestion[]> {
  const questions: PlacementQuestion[] = []

  for (const level of levelValues(jlptVocab)) {
    const words = await wordsAt(db, level, PLACEMENT_WORDS_PER_LEVEL + CHOICE_POOL)
    const asked = words.slice(0, PLACEMENT_WORDS_PER_LEVEL)

    for (const word of asked)
      questions.push(placementQuestion(word, words))
  }

  return questions
}

async function wordsAt(db: IngestDatabase, level: string, limit: number): Promise<PlacementWord[]> {
  const rows = await db
    .select({ noteId: schema.note.id, fields: schema.note.fields, level: schema.levelClaim.level })
    .from(schema.note)
    .innerJoin(schema.levelClaim, eq(schema.levelClaim.noteId, schema.note.id))
    .where(
      and(
        eq(schema.note.subjectId, CURRENT_SUBJECT_ID),
        eq(schema.levelClaim.authorityKey, levelAuthority()),
        eq(schema.levelClaim.level, level),
      ),
    )
    .orderBy(sql`random()`)
    .limit(limit)

  return rows.map(row => toWord(row))
}

function toWord(row: { noteId: string, fields: unknown, level: string }): PlacementWord {
  const fields = (row.fields ?? {}) as Record<string, string>

  return {
    noteId: row.noteId,
    level: row.level,
    term: fields.term ?? '',
    meaning: fields.meaning ?? '',
    partOfSpeech: fields.part_of_speech ?? '',
  }
}

/**
 * The words a test asked, with the level and meaning the server holds for
 * each — what `acceptedTest` scores the answers against. A *note* that is not
 * a starter word of this *subject* is left out, and so is its answer.
 */
export async function testedWords(db: IngestDatabase, noteIds: string[]): Promise<PlacementWord[]> {
  if (noteIds.length === 0)
    return []

  const rows = await db
    .select({ noteId: schema.note.id, fields: schema.note.fields, level: schema.levelClaim.level })
    .from(schema.note)
    .innerJoin(schema.levelClaim, eq(schema.levelClaim.noteId, schema.note.id))
    .where(
      and(
        inArray(schema.note.id, noteIds),
        eq(schema.note.subjectId, CURRENT_SUBJECT_ID),
        eq(schema.levelClaim.authorityKey, levelAuthority()),
      ),
    )

  return rows.map(row => toWord(row))
}

export interface RecordedPlacement {
  placementId: string
  /** The level lessons start at, which is now the active *category*. */
  start: string
  /** How many words were chosen to spot-check. */
  checks: number
}

/**
 * Write a placement, in one transaction: the row, the active *category* at the
 * level lessons start at, and the spot-check — a sample of each level marked
 * known, accepted and minted as a lesson would, each with the placement's
 * *Known* epoch due on its check day (ADR 0079 §4).
 *
 * ⚠️ **Only words the reader has not started are sampled**, so a word they
 * are already learning keeps its own schedule, and a retake samples new ones.
 */
export async function recordPlacement(
  db: IngestDatabase,
  ownerId: string,
  placed: StandingPlacement,
  now: Date = new Date(),
): Promise<RecordedPlacement> {
  const start = startLevel(placed.level)

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.placement)
      .values({ ownerId, subjectId: CURRENT_SUBJECT_ID, kind: placed.kind, level: placed.level, placedAt: now })
      .returning({ id: schema.placement.id })
    const placementId = row!.id

    await chooseCategory(tx, ownerId, categoryKey({ kind: 'level', level: start }))

    const samples: Array<Array<{ noteId: string, level: string }>> = []
    for (const level of knownLevels(placed.level)) {
      const noteIds = await unstartedNotes(tx, ownerId, SPOT_CHECKS_PER_LEVEL, { kind: 'level', level })
      samples.push(noteIds.map(noteId => ({ noteId, level })))
    }

    const sample = interleave(samples)
    if (sample.length === 0)
      return { placementId, start, checks: 0 }

    await startNotes(tx, ownerId, sample.map(word => word.noteId))

    const cards = await tx
      .select({ id: schema.card.id, noteId: schema.card.noteId })
      .from(schema.card)
      .where(
        and(
          inArray(schema.card.noteId, sample.map(word => word.noteId)),
          eq(schema.card.ownerId, ownerId),
          isNull(schema.card.suspendedAt),
        ),
      )
      .orderBy(asc(schema.card.id))

    const dues = spotCheckDues(sample.length, now)
    let checks = 0

    for (const [index, word] of sample.entries()) {
      const card = cards.find(candidate => candidate.noteId === word.noteId)
      if (!card)
        continue

      const epoch = knownEpoch(now, dues[index]!)
      await tx.insert(schema.schedulingEpoch).values({ cardId: card.id, ownerId, ordinal: 1, ...epoch })
      await tx.insert(schema.placementCheck).values({ placementId, noteId: word.noteId, ownerId, level: word.level })
      checks += 1
    }

    return { placementId, start, checks }
  })
}

/** The placement that stands: the reader's newest in this *subject*. */
export async function standingPlacement(
  db: IngestDatabase,
  ownerId: string,
): Promise<(StandingPlacement & { id: string, placedAt: Date }) | null> {
  const [row] = await db
    .select({
      id: schema.placement.id,
      kind: schema.placement.kind,
      level: schema.placement.level,
      placedAt: schema.placement.placedAt,
    })
    .from(schema.placement)
    .where(and(eq(schema.placement.ownerId, ownerId), eq(schema.placement.subjectId, CURRENT_SUBJECT_ID)))
    .orderBy(desc(schema.placement.placedAt), desc(schema.placement.id))
    .limit(1)

  if (!row)
    return null

  return { id: row.id, kind: row.kind === 'declared' ? 'declared' : 'test', level: row.level, placedAt: row.placedAt }
}

/**
 * Each level's first-try answers over the window: every *grade* of a word at
 * that level in the last `ESTIMATE_WINDOW_DAYS` days. A *grade* is a word's
 * first try in its run (ADR 0076 §4): Good when it was right first time,
 * Forgot when it was missed and asked again.
 */
export async function levelEvidence(db: IngestDatabase, ownerId: string, now: Date): Promise<LevelEvidence[]> {
  const since = new Date(now.getTime() - ESTIMATE_WINDOW_DAYS * 86_400_000)

  const rows = await db
    .select({
      level: schema.levelClaim.level,
      answers: count(),
      right: sql<number>`count(*) filter (where ${schema.reviewLog.rating} > 1)`.mapWith(Number),
      words: countDistinct(schema.card.noteId),
    })
    .from(schema.reviewLog)
    .innerJoin(schema.card, eq(schema.card.id, schema.reviewLog.cardId))
    .innerJoin(schema.levelClaim, eq(schema.levelClaim.noteId, schema.card.noteId))
    .where(
      and(
        eq(schema.reviewLog.ownerId, ownerId),
        gte(schema.reviewLog.reviewedAt, since),
        eq(schema.levelClaim.authorityKey, levelAuthority()),
        noteInCurrentSubject(db, schema.card.noteId),
      ),
    )
    .groupBy(schema.levelClaim.level)

  return rows.map(row => ({ level: row.level, answers: row.answers, right: row.right, words: row.words }))
}

/** The reader's level, as Home draws it. */
export async function readLevelEstimate(db: IngestDatabase, ownerId: string, now: Date = new Date()): Promise<LevelEstimate> {
  const placement = await standingPlacement(db, ownerId)
  const evidence = await levelEvidence(db, ownerId, now)

  if (!placement)
    return estimateLevel(evidence, null)

  const answers = await db
    .select({
      cardId: schema.card.id,
      level: schema.placementCheck.level,
      rating: schema.reviewLog.rating,
      reviewedAt: schema.reviewLog.reviewedAt,
    })
    .from(schema.placementCheck)
    .innerJoin(
      schema.card,
      and(eq(schema.card.noteId, schema.placementCheck.noteId), eq(schema.card.ownerId, schema.placementCheck.ownerId)),
    )
    .innerJoin(schema.reviewLog, eq(schema.reviewLog.cardId, schema.card.id))
    .where(eq(schema.placementCheck.placementId, placement.id))

  return estimateLevel(evidence, { kind: placement.kind, level: placement.level }, tallyChecks(answers))
}
