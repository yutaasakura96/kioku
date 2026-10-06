/**
 * `S11`'s delete — a **soft** delete (`04` §9.1, `09` §4.11).
 *
 * `source.deleted_at` is set, and every *card* whose *note* originated in that
 * *source* is *suspended* with `suspended_reason = 'source_deleted'`. **No review
 * history is touched, no *note* is deleted, no *card* row is removed**, and the
 * *source* stays readable. Hard deletion has no route in v1.
 *
 * ⚠️ **The count and the write share one predicate, `affected`, and must.**
 * `10` §7.3 says the count is the whole reason the confirmation page exists, and
 * the testing plan's `S11` row asks that it match the number of *cards* the
 * `POST` actually suspends. Two queries that each spell the rule out are two queries that can
 * drift apart, and the page would then promise one number and do another.
 *
 * ⚠️ **"Originated" is `note.origin_ingestion_id` → `ingestion.source_id`**
 * (`04` §5.3). A *note* that an earlier *source* minted and this one merely
 * re-encountered is not this *source*'s to withdraw: it has an *occurrence* here
 * and an origin elsewhere, and deleting the second *source* must not suspend
 * the first one's *cards*.
 *
 * ⚠️ **A *card* already suspended as `flagged` is taken over, and its instant is
 * kept.** `S9`'s keep unsuspends only `suspended_reason = 'flagged'`
 * (`server/utils/vet/decide.ts`), so leaving the reason alone would let a keep
 * put a deleted *source*'s *card* back into scheduling — and `04` §9.1 says
 * nothing un-suspends itself. `coalesce` keeps the moment it first left
 * scheduling, which is the fact `server/utils/review/flag.ts` refuses to
 * restamp for the same reason. A *card* already suspended as `source_deleted`
 * is not counted and not written, which is what makes a second `POST` a no-op.
 */

import { and, count, eq, inArray, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { IngestDatabase } from './record'

export interface SourceDeletion {
  id: string
  title: string
  deletedAt: Date | null
  /** The *cards* the `POST` would suspend — `10` §7.3's statement. */
  cardCount: number
}

/** The *cards* this delete suspends — the one predicate both halves read. */
function affected(db: IngestDatabase, sourceId: string) {
  const originated = db
    .select({ id: schema.note.id })
    .from(schema.note)
    .innerJoin(schema.ingestion, eq(schema.ingestion.id, schema.note.originIngestionId))
    .where(eq(schema.ingestion.sourceId, sourceId))

  return and(
    inArray(schema.card.noteId, originated),
    sql`${schema.card.suspendedReason} IS DISTINCT FROM 'source_deleted'`,
  )
}

/** What the confirmation renders — `10` §7.3. `null` for no such *source*. */
export async function sourceDeletion(
  db: IngestDatabase,
  id: string,
): Promise<SourceDeletion | null> {
  const [found] = await db
    .select({
      id: schema.source.id,
      title: schema.source.title,
      deletedAt: schema.source.deletedAt,
    })
    .from(schema.source)
    .where(eq(schema.source.id, id))
    .limit(1)

  if (!found)
    return null

  const [cards] = await db
    .select({ n: count() })
    .from(schema.card)
    .where(affected(db, id))

  return { ...found, cardCount: cards?.n ?? 0 }
}

/**
 * The `POST` — `09` §4.11 step 3. One transaction, so a *source* is never marked
 * deleted with its *cards* still scheduled.
 *
 * Returns the number of *cards* suspended, or `null` for no such *source*.
 * ⚠️ **`deleted_at` is set once**: a second delete keeps the first instant,
 * because that is when the reader withdrew it.
 */
export async function deleteSource(db: IngestDatabase, id: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .update(schema.source)
      .set({ deletedAt: sql`coalesce(${schema.source.deletedAt}, now())` })
      .where(eq(schema.source.id, id))
      .returning({ id: schema.source.id })

    if (!source)
      return null

    const suspended = await tx
      .update(schema.card)
      .set({
        suspendedAt: sql`coalesce(${schema.card.suspendedAt}, now())`,
        suspendedReason: 'source_deleted',
      })
      .where(affected(tx, id))
      .returning({ id: schema.card.id })

    return suspended.length
  })
}
