/**
 * What is in each *category* — ADR 0075 §3, #68 — and how far the reader is
 * into each, which is the shelf `/categories` draws (#69, ADR 0077).
 *
 * ⚠️ **Sequential reads and no correlated `sql` templates**, for the two
 * reasons at the head of `server/utils/review/queries.ts`.
 *
 * ⚠️ **Everything here is the current *subject*'s** (ADR 0075 §1).
 */

import { and, asc, count, countDistinct, eq, exists, isNull, ne, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import * as schema from '../../db/schema'
import {
  MY_WORDS_KEY,
  MY_WORDS_LABEL,
  categoryGroup,
  categoryKey,
  levelAuthority,
  levelCategories,
  parseCategoryKey,
} from '../../../shared/category/category'
import type { CategoryGroup, CategoryRef } from '../../../shared/category/category'
import { noProgress } from '../../../shared/category/shelf'
import type { CategoryProgress, CategoryRow, ShelfRow } from '../../../shared/category/shelf'
import { stageOfEpoch } from '../../../shared/review/stage'
import type { IngestDatabase } from '../ingest/record'
import { CURRENT_SUBJECT_ID, noteInCurrentSubject } from '../subject'
import { readActiveCategory } from './active'

export type { CategoryRow, ShelfRow } from '../../../shared/category/shelf'

/**
 * Every *category* there is, JLPT first and in the declaration's order.
 *
 * ⚠️ **A level with no words is still listed**, at zero: the shelf is the
 * declaration's five and an unloaded starter set should read as empty rather
 * than as a shorter list. *My words* is listed only once it holds something,
 * and a deck is a deck the reader imported.
 */
export async function categories(db: IngestDatabase): Promise<CategoryRow[]> {
  const perLevel = await db
    .select({ level: schema.levelClaim.level, words: count() })
    .from(schema.levelClaim)
    .where(
      and(
        eq(schema.levelClaim.authorityKey, levelAuthority()),
        noteInCurrentSubject(db, schema.levelClaim.noteId),
      ),
    )
    .groupBy(schema.levelClaim.level)

  const wordsAt = new Map(perLevel.map(row => [row.level, row.words]))
  const rows: CategoryRow[] = levelCategories().map(ref => ({
    key: categoryKey(ref),
    group: categoryGroup(ref),
    label: ref.kind === 'level' ? ref.level : '',
    words: ref.kind === 'level' ? wordsAt.get(ref.level) ?? 0 : 0,
  }))

  const decks = await db
    .select({
      sourceId: schema.source.id,
      title: schema.source.title,
      words: countDistinct(schema.occurrence.noteId),
    })
    .from(schema.source)
    // ⚠️ **Left**, so a deck whose import has not written a word yet is a
    // category at zero rather than a deck that is not there.
    .leftJoin(schema.occurrence, eq(schema.occurrence.sourceId, schema.source.id))
    .where(and(liveSourceOfKind('anki'), eq(schema.source.subjectId, CURRENT_SUBJECT_ID)))
    .groupBy(schema.source.id, schema.source.title, schema.source.submittedAt)
    .orderBy(asc(schema.source.submittedAt), asc(schema.source.id))

  for (const deck of decks) {
    const ref: CategoryRef = { kind: 'deck', sourceId: deck.sourceId }
    rows.push({ key: categoryKey(ref), group: categoryGroup(ref), label: deck.title, words: deck.words })
  }

  const [mine] = await db
    .select({ words: countDistinct(schema.occurrence.noteId) })
    .from(schema.occurrence)
    .innerJoin(schema.source, eq(schema.source.id, schema.occurrence.sourceId))
    .where(
      and(
        isNull(schema.source.deletedAt),
        ne(schema.source.kind, 'anki'),
        eq(schema.source.subjectId, CURRENT_SUBJECT_ID),
      ),
    )

  if ((mine?.words ?? 0) > 0)
    rows.push({ key: MY_WORDS_KEY, group: 'my-decks', label: MY_WORDS_LABEL, words: mine!.words })

  return rows
}

function liveSourceOfKind(kind: string) {
  return and(isNull(schema.source.deletedAt), eq(schema.source.kind, kind))
}

/**
 * The row's *note* is in this *category*. `noteId` is the outer query's column
 * — `card.note_id` when #70 draws a lesson from a category, `note.id` here.
 *
 * ⚠️ **A deleted *source* is no longer a category its words are in** (`S11`):
 * the words stay in the corpus and under any JLPT level the list gives them.
 */
export function noteInCategory(db: IngestDatabase, ref: CategoryRef, noteId: AnyPgColumn) {
  if (ref.kind === 'level') {
    return exists(
      db.select({ one: sql`1` }).from(schema.levelClaim).where(
        and(
          eq(schema.levelClaim.noteId, noteId),
          eq(schema.levelClaim.authorityKey, levelAuthority()),
          eq(schema.levelClaim.level, ref.level),
        ),
      ),
    )
  }

  return exists(
    db
      .select({ one: sql`1` })
      .from(schema.occurrence)
      .innerJoin(schema.source, eq(schema.source.id, schema.occurrence.sourceId))
      .where(
        and(
          eq(schema.occurrence.noteId, noteId),
          isNull(schema.source.deletedAt),
          eq(schema.source.subjectId, CURRENT_SUBJECT_ID),
          ref.kind === 'deck'
            ? and(eq(schema.source.id, ref.sourceId), eq(schema.source.kind, 'anki'))
            : ne(schema.source.kind, 'anki'),
        ),
      ),
  )
}

/** The *level* the list gives one *note*, or `null` when the list does not carry it. */
export async function listedLevel(db: IngestDatabase, noteId: string): Promise<string | null> {
  const [claim] = await db
    .select({ level: schema.levelClaim.level })
    .from(schema.levelClaim)
    .where(
      and(eq(schema.levelClaim.noteId, noteId), eq(schema.levelClaim.authorityKey, levelAuthority())),
    )
    .limit(1)

  return claim?.level ?? null
}

/** Which *categories* one *note* is in — every one, in the shelf's order. */
export async function categoriesOfNote(db: IngestDatabase, noteId: string): Promise<string[]> {
  const keys: string[] = []

  const level = await listedLevel(db, noteId)
  if (level !== null)
    keys.push(categoryKey({ kind: 'level', level }))

  const seenIn = await db
    .selectDistinct({ sourceId: schema.source.id, kind: schema.source.kind, submittedAt: schema.source.submittedAt })
    .from(schema.occurrence)
    .innerJoin(schema.source, eq(schema.source.id, schema.occurrence.sourceId))
    .where(
      and(
        eq(schema.occurrence.noteId, noteId),
        isNull(schema.source.deletedAt),
        eq(schema.source.subjectId, CURRENT_SUBJECT_ID),
      ),
    )
    .orderBy(asc(schema.source.submittedAt), asc(schema.source.id))

  for (const source of seenIn) {
    if (source.kind === 'anki')
      keys.push(categoryKey({ kind: 'deck', sourceId: source.sourceId }))
  }
  if (seenIn.some(source => source.kind !== 'anki'))
    keys.push(MY_WORDS_KEY)

  return keys
}

/**
 * The shelf as one reader sees it: every *category*, how far they are into
 * each, and which one is active (prototype `vCategories`).
 *
 * ⚠️ **A word is learned once it has been graded**: its *card* has a live
 * *scheduling epoch* that has left the library's New, and the stage is
 * `stageOfEpoch`'s reading of that epoch, the same one the summary shows. A
 * suspended *card* is not counted, as it is not studied.
 *
 * ⚠️ **Counted per *card***, and the *subject* declares one template, so that
 * is per word. A second template would count a word twice here.
 *
 * ⚠️ **One read per shelf under *My decks***. A reader has a handful of decks,
 * and the alternative is one query that joins every epoch to every *source*.
 */
export async function categoryShelf(db: IngestDatabase, ownerId: string): Promise<ShelfRow[]> {
  const rows = await categories(db)
  const active = await readActiveCategory(db, ownerId)

  const atLevel = await db
    .select({
      level: schema.levelClaim.level,
      state: schema.schedulingEpoch.state,
      stability: schema.schedulingEpoch.stability,
    })
    .from(schema.schedulingEpoch)
    .innerJoin(schema.card, eq(schema.card.id, schema.schedulingEpoch.cardId))
    .innerJoin(schema.levelClaim, eq(schema.levelClaim.noteId, schema.card.noteId))
    .where(
and(studied(db, ownerId), eq(schema.levelClaim.authorityKey, levelAuthority())))

  const progress = new Map<string, CategoryProgress>()
  for (const row of atLevel)
    tally(progress, categoryKey({ kind: 'level', level: row.level }), row)

  for (const row of rows) {
    const ref = parseCategoryKey(row.key)
    if (!ref || ref.kind === 'level')
      continue

    const epochs = await db
      .select({ state: schema.schedulingEpoch.state, stability: schema.schedulingEpoch.stability })
      .from(schema.schedulingEpoch)
      .innerJoin(schema.card, eq(schema.card.id, schema.schedulingEpoch.cardId))
      .where(and(studied(db, ownerId), noteInCategory(db, ref, schema.card.noteId)))

    for (const epoch of epochs)
      tally(progress, row.key, epoch)
  }

  return rows.map(row => ({
    ...row,
    progress: progress.get(row.key) ?? noProgress(),
    active: row.key === active.key,
  }))
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

function tally(into: Map<string, CategoryProgress>, key: string, epoch: { state: number, stability: number }) {
  const stage = stageOfEpoch(epoch)
  if (stage === null)
    return

  const counts = into.get(key) ?? noProgress()
  counts[stage] += 1
  into.set(key, counts)
}
