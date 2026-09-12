/**
 * `04` §12's due query and the *session* snapshot — the two reads *Review*
 * makes.
 *
 * ⚠️ **Every read here is sequential and `Promise.all` is a bug you can only
 * find in the e2e tier.** Measured 2026-09-12: `@electric-sql/pglite-socket`
 * fronts a single-connection PGlite, so concurrent reads make `node-postgres`
 * open several connections and the server resets all but one — the route
 * answers `500`, the browser shows an empty screen, and nothing in the test
 * output names the cause. `server/utils/vet/queries.ts` carries the finding in
 * full; composing a *session* is the read it predicted would meet it.
 *
 * ⚠️ **No correlated `sql` templates.** Interpolating a Drizzle column into a
 * `sql` template emits a bare, unqualified identifier, which inside a subquery
 * binds to the inner table and answers with valid SQL and a wrong number
 * (§ Carrying, measured 2026-09-11). Which positions are graded is a second
 * `IN` read rather than an `EXISTS` beside the membership.
 */

import { and, asc, eq, isNull, lte, notExists, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { DueCard, NewCard } from '../../../shared/review/compose'
import type { Grade } from '../../../shared/review/scheduler'
import type { IngestDatabase } from '../ingest/record'
// ⚠️ **The snapshot's shape lives in `shared/`, not here.** It is what crosses
// the wire, and `shared/review/snapshot.ts` carries the one rule about how a
// later answer may touch it — the *grades* move, the words do not (PRD §5).
import type { NothingToStudy, ReviewSnapshot } from '../../../shared/review/snapshot'

export type { NothingToStudy, ReviewPosition, ReviewSnapshot } from '../../../shared/review/snapshot'

/**
 * The *cards* whose live *scheduling epoch* has come due.
 *
 * ⚠️ **Suspension is on the `card` and cannot be in the epoch's partial
 * predicate** (`04` §11) — `scheduling_epoch_owner_due_idx` covers
 * `(owner_id, due) WHERE superseded_at IS NULL`, and the join to `card` is what
 * drops a *card* `S9` or `S11` withdrew.
 *
 * ⚠️ **`limit` is the *session* size and the order is `due` ascending**, so the
 * limit takes the most overdue rather than an arbitrary slice. The order is then
 * applied again by `compose`, where the rule is readable.
 */
export async function dueCards(
  db: IngestDatabase,
  ownerId: string,
  limit: number,
  now: Date = new Date(),
): Promise<DueCard[]> {
  const rows = await db
    .select({ cardId: schema.card.id, due: schema.schedulingEpoch.due })
    .from(schema.schedulingEpoch)
    .innerJoin(schema.card, eq(schema.card.id, schema.schedulingEpoch.cardId))
    .where(
      and(
        eq(schema.schedulingEpoch.ownerId, ownerId),
        isNull(schema.schedulingEpoch.supersededAt),
        lte(schema.schedulingEpoch.due, now),
        isNull(schema.card.suspendedAt),
      ),
    )
    .orderBy(asc(schema.schedulingEpoch.due), asc(schema.card.id))
    .limit(limit)

  return rows
}

/**
 * The *cards* that have never been scheduled — minted by an acceptance and
 * carrying no *scheduling epoch* at all.
 *
 * ⚠️ **`NOT EXISTS` over every epoch, not over the live one.** A *card* whose
 * only epoch was superseded has a history; it is not new, it is due or it is
 * not, and asking for the absence of a *live* epoch would put a reset *card*
 * back among the ones the reader has never seen.
 */
export async function newCards(
  db: IngestDatabase,
  ownerId: string,
  limit: number,
): Promise<NewCard[]> {
  const epoch = schema.schedulingEpoch

  const rows = await db
    .select({ cardId: schema.card.id, mintedAt: schema.card.createdAt })
    .from(schema.card)
    .where(
      and(
        eq(schema.card.ownerId, ownerId),
        isNull(schema.card.suspendedAt),
        notExists(
          db.select({ one: sql`1` }).from(epoch).where(eq(epoch.cardId, schema.card.id)),
        ),
      ),
    )
    .orderBy(asc(schema.card.createdAt), asc(schema.card.id))
    .limit(limit)

  return rows
}

/**
 * The *session*'s membership, its *notes* and which positions have been
 * answered — everything the rail, the *card* and the end screen read.
 */
export async function snapshotOf(
  db: IngestDatabase,
  ownerId: string,
  sessionId: string,
): Promise<ReviewSnapshot | null> {
  const [session] = await db
    .select({
      id: schema.reviewSession.id,
      size: schema.reviewSession.size,
      snapshotTakenAt: schema.reviewSession.snapshotTakenAt,
    })
    .from(schema.reviewSession)
    .where(and(eq(schema.reviewSession.id, sessionId), eq(schema.reviewSession.ownerId, ownerId)))
    .limit(1)

  if (!session)
    return null

  const members = await db
    .select({
      ordinal: schema.reviewSessionCard.ordinal,
      cardId: schema.reviewSessionCard.cardId,
      templateKey: schema.card.templateKey,
      fields: schema.note.fields,
    })
    .from(schema.reviewSessionCard)
    .innerJoin(schema.card, eq(schema.card.id, schema.reviewSessionCard.cardId))
    .innerJoin(schema.note, eq(schema.note.id, schema.card.noteId))
    .where(eq(schema.reviewSessionCard.reviewSessionId, sessionId))
    .orderBy(asc(schema.reviewSessionCard.ordinal))

  // ⚠️ **Ordered by the client's stamp, because the later one wins**
  // (PRD §5, ADR 0039 property 3). A *card* answered twice has two `review_log`
  // rows — the table is append-only and neither can be taken back — so which
  // *grade* the rail and the tally show is decided here, by reading them in the
  // order they were **given** rather than the order they were received.
  const graded = await db
    .select({
      cardId: schema.reviewLog.cardId,
      rating: schema.reviewLog.rating,
      reviewedAt: schema.reviewLog.reviewedAt,
    })
    .from(schema.reviewLog)
    .where(eq(schema.reviewLog.reviewSessionId, sessionId))
    .orderBy(asc(schema.reviewLog.reviewedAt))

  // ⚠️ **A second flag on the same *card* is a second row** (`11` §3):
  // deduplicating flags would under-report exactly the signal `S9` exists for.
  // A `Set` is the right shape to read them with and the wrong shape to write
  // them with, and `04` §7.8 writes them.
  const flags = await db
    .select({ cardId: schema.cardFlag.cardId })
    .from(schema.cardFlag)
    .where(eq(schema.cardFlag.reviewSessionId, sessionId))

  const given = new Map(graded.map(row => [row.cardId, row.rating as Grade]))
  const flagged = new Set(flags.map(row => row.cardId))

  return {
    sessionId: session.id,
    size: session.size,
    snapshotTakenAt: session.snapshotTakenAt,
    positions: members.map(row => ({
      ordinal: row.ordinal,
      cardId: row.cardId,
      templateKey: row.templateKey,
      fields: (row.fields ?? {}) as Record<string, string>,
      grade: given.get(row.cardId) ?? null,
      flagged: flagged.has(row.cardId),
    })),
  }
}

/**
 * `10` §5.7 — which of the two non-terminal empty states the reader is in, and
 * the datum the second one gives weight to.
 *
 * ⚠️ **A *card* the reader has but has not reached is not "nothing to review"**.
 * The difference between the two states is the difference between going to
 * *Vet* and coming back tomorrow, and only one of them is a dead end.
 */
export async function nothingToStudy(
  db: IngestDatabase,
  ownerId: string,
): Promise<NothingToStudy> {
  const [any] = await db
    .select({ cardId: schema.card.id })
    .from(schema.card)
    .where(and(eq(schema.card.ownerId, ownerId), isNull(schema.card.suspendedAt)))
    .limit(1)

  if (!any)
    return { hasCards: false, nextDue: null }

  const [next] = await db
    .select({ due: schema.schedulingEpoch.due })
    .from(schema.schedulingEpoch)
    .innerJoin(schema.card, eq(schema.card.id, schema.schedulingEpoch.cardId))
    .where(
      and(
        eq(schema.schedulingEpoch.ownerId, ownerId),
        isNull(schema.schedulingEpoch.supersededAt),
        isNull(schema.card.suspendedAt),
      ),
    )
    .orderBy(asc(schema.schedulingEpoch.due))
    .limit(1)

  return { hasCards: true, nextDue: next?.due ?? null }
}
