/**
 * The *subject* the app is studying, and the three predicates that keep every
 * reader-facing read inside it — ADR 0075 §1, #68.
 *
 * ⚠️ **This is what "start fresh" is.** The *subject* id moved from `jlpt-vocab`
 * to `jlpt-vocab-2` and nothing was deleted: the old *notes*, *cards*,
 * *sessions* and `review_log` rows are still in the database, `review_log` is
 * append-only by trigger (`04` §9) and could not be removed anyway, and
 * `GET /api/export` still hands every one of them over. What changed is that
 * no screen reads them — and that is these predicates, on every read a screen
 * makes.
 *
 * ⚠️ **A read of *cards*, *grades*, flags, *sessions*, *sources* or runs that
 * does not pass through here shows the reader the corpus they left.** With one
 * *subject* in the database every test passes without it, which is why
 * `test/schema/start-fresh.test.ts` seeds both.
 *
 * ⚠️ **Three things are deliberately not scoped.** The spend ledger on `/stats`
 * (the money was spent), the export (`S12` is *everything*), and a read by id —
 * a *source* opened from the ledger is still readable (`S11`).
 *
 * ⚠️ **`exists` over the query builder, never a correlated `sql` template** —
 * § Carrying, measured 2026-09-11: an interpolated column is emitted bare and
 * binds to the inner table.
 */

import { and, eq, exists, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import * as schema from '../db/schema'
import { jlptVocab } from '../../shared/subject/declaration'
import type { IngestDatabase } from './ingest/record'

/** `note.subject_id` for everything the app reads and writes today. */
export const CURRENT_SUBJECT_ID = jlptVocab.subject_id

/**
 * The row's *note* belongs to the current *subject*. `noteId` is the outer
 * query's column — `card.note_id`, `note_vetting.note_id`.
 */
export function noteInCurrentSubject(db: IngestDatabase, noteId: AnyPgColumn) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(schema.note)
      .where(and(eq(schema.note.id, noteId), eq(schema.note.subjectId, CURRENT_SUBJECT_ID))),
  )
}

/**
 * The row's *card* is of a *note* in the current *subject*. For a personal row
 * that names a *card* and is not joined to one — `review_log.card_id`,
 * `card_flag.card_id`.
 *
 * ⚠️ **Not for a query that is itself `FROM card`**: the inner `card` would
 * shadow the outer one. Those use {@link noteInCurrentSubject} on
 * `card.note_id`.
 */
export function cardInCurrentSubject(db: IngestDatabase, cardId: AnyPgColumn) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(schema.card)
      .innerJoin(schema.note, eq(schema.note.id, schema.card.noteId))
      .where(and(eq(schema.card.id, cardId), eq(schema.note.subjectId, CURRENT_SUBJECT_ID))),
  )
}

/**
 * The `review_session` row holds a *card* of the current *subject*.
 *
 * A *session* is composed from one *subject*'s *cards* and carries no
 * `subject_id` of its own (`04` §7.6), so its membership is what says which it
 * was. A run left unfinished before the change is not resumed and its new
 * *cards* do not spend today's allowance.
 */
export function sessionInCurrentSubject(db: IngestDatabase) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(schema.reviewSessionCard)
      .innerJoin(schema.card, eq(schema.card.id, schema.reviewSessionCard.cardId))
      .innerJoin(schema.note, eq(schema.note.id, schema.card.noteId))
      .where(
        and(
          eq(schema.reviewSessionCard.reviewSessionId, schema.reviewSession.id),
          eq(schema.note.subjectId, CURRENT_SUBJECT_ID),
        ),
      ),
  )
}
