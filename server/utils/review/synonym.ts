/**
 * [ADR 0069](../../../docs/adr/0069-the-check-is-the-grade.md) §2 — **a refused
 * meaning the reader said was right**, recorded as their own synonym for the
 * *note*.
 *
 * ⚠️ **The *note* is resolved from the *card*, inside the *session*, for this
 * reader** — the flag's guard (`flag.ts`). A synonym for a *card* the *session*
 * does not hold is a stale tab, and the `owner_id` in the `WHERE` is what makes
 * it also not an attack.
 *
 * ⚠️ **`ON CONFLICT DO NOTHING`, and here that is right** where `flag.ts` says
 * it must not be. A second flag is a second signal; a second identical synonym
 * is the same fact, and the outbox re-sending one whose acknowledgement was lost
 * is the only way to reach it. The unique key `(owner_id, note_id, text)` is the
 * idempotency.
 *
 * ⚠️ **It changes no *grade*.** The screen re-runs the check with the synonym in
 * it before the *grade* is committed, and the *grade* is its own outbox entry
 * behind this one. Nothing here reads or writes `review_log`.
 */

import { and, count, eq } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { IngestDatabase } from '../ingest/record'
import type { SynonymBody } from '../../../shared/review/request'

export type SynonymOutcome = 'ok' | 'not_in_session'

export async function recordSynonym(
  db: IngestDatabase,
  ownerId: string,
  request: SynonymBody,
): Promise<SynonymOutcome> {
  const [member] = await db
    .select({ noteId: schema.card.noteId })
    .from(schema.reviewSessionCard)
    .innerJoin(schema.card, eq(schema.card.id, schema.reviewSessionCard.cardId))
    .where(
      and(
        eq(schema.reviewSessionCard.reviewSessionId, request.sessionId),
        eq(schema.reviewSessionCard.cardId, request.cardId),
        eq(schema.reviewSessionCard.ownerId, ownerId),
      ),
    )
    .limit(1)

  if (!member)
    return 'not_in_session'

  await db
    .insert(schema.meaningSynonym)
    .values({ ownerId, noteId: member.noteId, text: request.text })
    .onConflictDoNothing()

  return 'ok'
}

/**
 * ADR 0069's revisit signal — how many synonyms this reader has added. ⚠️ **Not
 * on `/stats` yet** (#28): a count read here is enough to tell thin lists from
 * good ones, and a figure on the screen owes the suppression rules ADR 0057 sets.
 */
export async function synonymCount(db: IngestDatabase, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.meaningSynonym)
    .where(eq(schema.meaningSynonym.ownerId, ownerId))

  return row?.n ?? 0
}
