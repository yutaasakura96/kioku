/**
 * The reader's one active *category* — ADR 0077, `04` §7.11. New words come
 * from it and from nowhere else; reviews never read it.
 *
 * ⚠️ **No row is the default, and so is a row that names nothing.** A reader
 * who has chosen none studies the first declared *level*; one whose deck was
 * deleted is back there too, rather than in a lesson that can never hold a
 * word. Nothing is written on a read.
 *
 * ⚠️ **The key is checked against the database on the way in and on the way
 * out.** `parseCategoryKey` knows a key's shape; whether `deck:<id>` is a live
 * deck of this *subject* is a row.
 */

import { and, eq, isNull, ne, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import {
  MY_WORDS_LABEL,
  categoryKey,
  defaultCategory,
  levelCategoryName,
  parseCategoryKey,
} from '../../../shared/category/category'
import type { CategoryRef } from '../../../shared/category/category'
import type { IngestDatabase } from '../ingest/record'
import { CURRENT_SUBJECT_ID } from '../subject'

export interface ActiveCategory {
  key: string
  ref: CategoryRef
  /** What the screens call it: *JLPT N5*, a deck's title, *My words*. */
  name: string
}

/**
 * The *category* as the screens name it, or `null` when it is not one today:
 * a deck that was deleted or never was, or *My words* with nothing in it.
 */
async function named(db: IngestDatabase, ref: CategoryRef): Promise<ActiveCategory | null> {
  const key = categoryKey(ref)

  if (ref.kind === 'level')
    return { key, ref, name: levelCategoryName(ref.level) }

  if (ref.kind === 'deck') {
    const [deck] = await db
      .select({ title: schema.source.title })
      .from(schema.source)
      .where(
        and(
          eq(schema.source.id, ref.sourceId),
          eq(schema.source.kind, 'anki'),
          isNull(schema.source.deletedAt),
          eq(schema.source.subjectId, CURRENT_SUBJECT_ID),
        ),
      )
      .limit(1)

    return deck ? { key, ref, name: deck.title } : null
  }

  // ⚠️ The shelf lists *My words* only once it holds something
  // (`categories`), and a category the shelf does not list cannot be the
  // active one.
  const [own] = await db
    .select({ one: sql`1` })
    .from(schema.occurrence)
    .innerJoin(schema.source, eq(schema.source.id, schema.occurrence.sourceId))
    .where(
      and(
        isNull(schema.source.deletedAt),
        ne(schema.source.kind, 'anki'),
        eq(schema.source.subjectId, CURRENT_SUBJECT_ID),
      ),
    )
    .limit(1)

  return own ? { key, ref, name: MY_WORDS_LABEL } : null
}

/** The *category* the reader's next lesson is drawn from. */
export async function readActiveCategory(db: IngestDatabase, ownerId: string): Promise<ActiveCategory> {
  const [row] = await db
    .select({ key: schema.activeCategory.categoryKey })
    .from(schema.activeCategory)
    .where(eq(schema.activeCategory.ownerId, ownerId))
    .limit(1)

  const ref = row ? parseCategoryKey(row.key) : null
  const chosen = ref ? await named(db, ref) : null

  return chosen ?? (await named(db, defaultCategory()))!
}

/**
 * Make `key` the reader's active *category*. Answers it, or `null` for a key
 * that names none — and then nothing is written.
 *
 * ⚠️ **It composes nothing and touches no run.** A lesson already composed
 * keeps the words it was composed with (PRD §5: the snapshot wins); the next
 * one is drawn from here.
 */
export async function chooseCategory(
  db: IngestDatabase,
  ownerId: string,
  key: unknown,
): Promise<ActiveCategory | null> {
  const ref = parseCategoryKey(key)
  const chosen = ref ? await named(db, ref) : null

  if (!chosen)
    return null

  await db
    .insert(schema.activeCategory)
    .values({ ownerId, categoryKey: chosen.key })
    .onConflictDoUpdate({
      target: schema.activeCategory.ownerId,
      set: { categoryKey: chosen.key, chosenAt: sql`now()` },
    })

  return chosen
}
