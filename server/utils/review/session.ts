/**
 * The *session* — composed once, snapshotted server-side, and resumed rather
 * than recomposed (`S7`, ADR 0007, `04` §7.6).
 *
 * ⚠️ **The snapshot is taken server-side and prefetched as a unit**, which is
 * two properties rather than one. `snapshot_taken_at` is a server value because
 * `03` §8.2's replay rule compares a client stamp against it, and the whole run
 * is decided in one transaction so it cannot shift underneath the reader while
 * they are in it.
 *
 * ⚠️ **A *note* edited mid-*session* shows the old text** (PRD §5): the client
 * holds the fields it was handed at step 3 and never re-reads one. In v1 that
 * rule is also true for a second reason — an *accepted* *note*'s fields are
 * frozen against every writer (ADR 0052) and a *card* exists only for an
 * accepted *note*, so nothing can edit one mid-*session* today. The prefetch is
 * what keeps the rule true when `S9`'s re-vetting path lifts the freeze.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { compose } from '../../../shared/review/compose'
import { dueCards, newCards, snapshotOf } from './queries'
import { isFinished } from '../../../shared/review/snapshot'
import type { IngestDatabase } from '../ingest/record'
import type { ReviewSnapshot } from './queries'

/**
 * Resume the run the reader is in, or compose one.
 *
 * ⚠️ **Resume comes first and the knob is ignored while it does.** `09` §4.7:
 * *session* size is set on the end screen and on the empty states, **never
 * mid-session** — the current one is snapshotted, and a knob that appeared to
 * change it would be lying. Done mid-*session* is a pause (`10` §5.3), so the
 * live run is what `/review` answers with until it is finished.
 *
 * ⚠️ **A run with nothing left unanswered is completed here rather than resumed.**
 * `review_session.completed_at` is normally stamped by the *grade* that empties
 * the run; a tab closed on the last keystroke is the case that leaves it null,
 * and a row that says *abandoned* about a run the reader finished would be a lie
 * the end screen's numbers are read through.
 */
export async function resumeOrCompose(
  db: IngestDatabase,
  ownerId: string,
  size: number,
  now: Date = new Date(),
): Promise<ReviewSnapshot | null> {
  const live = await liveSession(db, ownerId)

  if (live) {
    const snapshot = await snapshotOf(db, ownerId, live)

    // ⚠️ **Unanswered, not ungraded.** `S9`'s `X` advances without a *grade*
    // (`09` §4.9), so a run whose last position was flagged is finished — and
    // read the other way it resumes forever, onto a *card* the reader has
    // already passed and whose *card* is suspended.
    if (snapshot && !isFinished(snapshot))
      return snapshot

    await completeSession(db, ownerId, live)
  }

  return composeSession(db, ownerId, size, now)
}

/** The newest run the reader has not finished — `04` §7.6's null `completed_at`. */
export async function liveSession(db: IngestDatabase, ownerId: string): Promise<string | null> {
  const [session] = await db
    .select({ id: schema.reviewSession.id })
    .from(schema.reviewSession)
    .where(
      and(
        eq(schema.reviewSession.ownerId, ownerId),
        isNull(schema.reviewSession.completedAt),
      ),
    )
    .orderBy(desc(schema.reviewSession.startedAt))
    .limit(1)

  return session?.id ?? null
}

/**
 * One *session*, written whole.
 *
 * ⚠️ **`review_session.size` is what was composed, not what was asked for.** The
 * knob is a **cap**: `04` §7.7 holds `size` rows and `04` §14 makes the
 * *progress rail*'s length `review_session.size`, so a reader with seven
 * *cards* and a knob at twenty must get a rail of seven — thirteen ticks that
 * can never fill would be the only progress indicator in the app promising work
 * that does not exist. `04` §7.6's `CHECK (size > 0)` is the other half: a
 * *session* of nothing is not a short *session*, it is one of `10` §5.7's empty
 * states, and this answers `null` for it.
 *
 * ⚠️ **Both reads take `size`, and the second one is not `size − due.length`.**
 * `compose` is what decides the split, and narrowing the new-*card* read to the
 * remainder would put half the composition rule back in SQL — where a wrong
 * answer reads as a fixture problem.
 */
async function composeSession(
  db: IngestDatabase,
  ownerId: string,
  size: number,
  now: Date,
): Promise<ReviewSnapshot | null> {
  // Sequential — see `server/utils/review/queries.ts` on why `Promise.all` here
  // fails in the e2e tier and nowhere else.
  const due = await dueCards(db, ownerId, size, now)
  const fresh = await newCards(db, ownerId, size)

  const cardIds = compose(due, fresh, size)

  if (cardIds.length === 0)
    return null

  const sessionId = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(schema.reviewSession)
      // ⚠️ `snapshot_taken_at` and `started_at` are left to their defaults on
      // purpose: both are `now()` **on the server**, and a value computed in
      // this process and sent over would be the application's clock standing in
      // for the database's on the one timestamp `03` §8.2 compares against.
      .values({ ownerId, size: cardIds.length })
      .returning({ id: schema.reviewSession.id })

    await tx.insert(schema.reviewSessionCard).values(
      cardIds.map((cardId, ordinal) => ({
        reviewSessionId: session!.id,
        ordinal,
        cardId,
        ownerId,
      })),
    )

    return session!.id
  })

  return snapshotOf(db, ownerId, sessionId)
}

/**
 * `09` §4.7 step 6 — the end of the run, stamped when the last position is
 * answered.
 *
 * ⚠️ **Finishing is not starting.** Setting `completed_at` is bookkeeping about
 * the run that just ended; `S7`'s "starting another is one deliberate action,
 * never automatic" is about the *next* one, and nothing here composes.
 */
export async function completeSession(
  db: IngestDatabase,
  ownerId: string,
  sessionId: string,
): Promise<void> {
  await db
    .update(schema.reviewSession)
    .set({ completedAt: sql`now()` })
    .where(
      and(
        eq(schema.reviewSession.id, sessionId),
        eq(schema.reviewSession.ownerId, ownerId),
        isNull(schema.reviewSession.completedAt),
      ),
    )
}
