/**
 * The *session* — composed once, snapshotted server-side, and resumed rather
 * than recomposed (`S7`, ADR 0007, `04` §7.6). Since ADR 0076 §1 it is one of
 * two kinds: a review run of due *cards*, or a lesson of new words.
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

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { composeLesson, composeReview } from '../../../shared/review/compose'
import { dueCards, dueCount, newCards, nextDueAt, readerZone, recentlyComposed, snapshotOf, unstartedNotes } from './queries'
import { introducedToday, lessonRoom } from '../../../shared/review/brake'
import type { BrakeReading } from '../../../shared/review/brake'
import type { StudyLimits } from '../../../shared/review/limits'
import type { StudyOffer } from '../../../shared/review/offer'
import { isFinished } from '../../../shared/review/snapshot'
import type { SessionKind } from '../../../shared/review/snapshot'
import { jlptVocab } from '../../../shared/subject/declaration'
import { resolveZone } from '../../../shared/time/local-day'
import type { IngestDatabase } from '../ingest/record'
import { mint } from '../vet/decide'
import { readLimits } from './settings'
import { sessionInCurrentSubject } from '../subject'
import type { SessionFilter } from '../../../shared/review/filter'
import { NO_FILTER } from '../../../shared/review/filter'
import type { ReviewSnapshot } from './queries'

export interface StartRequest {
  /**
   * The run to compose when none is live — or `null`, which composes nothing
   * and answers with whatever is live (ADR 0076 §8: `/review` opens on what is
   * waiting and the reader starts one).
   */
  start: SessionKind | null
  /** The *session*-size knob. A cap on a review run; a lesson has its own. */
  size: number
  /** ADR 0065 §5 — narrows a lesson's words and never a review run's. */
  filter?: SessionFilter
  /** The reader's, already validated (`canonicalZone`); `null` composes in UTC and stores nothing. */
  zone?: string | null
}

/**
 * Resume the run the reader is in, or start the one they asked for.
 *
 * ⚠️ **Resume comes first and `start`, the knob and the filter are ignored
 * while it does.** `09` §4.7: *session* size is never set mid-session — the
 * current one is snapshotted, and a control that appeared to change it would be
 * lying. Leaving a lesson's teaching screens is a pause (ADR 0076 §6), so the
 * live run is what `/review` answers with until it is finished.
 *
 * ⚠️ **A run with nothing left unanswered is completed here rather than resumed.**
 * `review_session.completed_at` is normally stamped by the *grade* that empties
 * the run; a tab closed on the last keystroke is the case that leaves it null,
 * and a row that says *abandoned* about a run the reader finished would be a lie
 * the summary's numbers are read through.
 *
 * ⚠️ **`null` is two answers and the caller tells them apart by `start`**: no
 * run was asked for, or the one asked for has nothing in it. Either way the
 * offer beside it says what is waiting.
 */
export async function resumeOrStart(
  db: IngestDatabase,
  ownerId: string,
  request: StartRequest,
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

  if (request.start === 'review')
    return composeReviewRun(db, ownerId, request.size, request.zone ?? null, now)

  if (request.start === 'lesson')
    return composeLessonRun(db, ownerId, request.filter ?? NO_FILTER, request.zone ?? null, now)

  return null
}

/**
 * Which brake is on, as of now — ADR 0066 §7's sentence, read after the run
 * is composed or resumed so that it counts the run's own new words.
 *
 * ⚠️ **It is a second read of the due set and not the composition's**, and on
 * the endpoint that is the same instant. It is a count rather than a reuse
 * because the summary asks it again when the run finishes, and by then the
 * reader has answered twenty of them.
 */
export async function brakeReading(
  db: IngestDatabase,
  ownerId: string,
  zone: string,
  now: Date = new Date(),
): Promise<BrakeReading> {
  const recent = await recentlyComposed(db, ownerId, now)

  return {
    introducedToday: introducedToday(recent, now, zone),
    dueCount: await dueCount(db, ownerId, now),
  }
}

/**
 * What is waiting — the screen before a run and the summary's *What next*
 * (ADR 0076 §8, `shared/review/offer.ts`).
 *
 * ⚠️ **`lesson` is what the next lesson would hold, counted the way the
 * composition counts it**: the brake's room, and then how many words are
 * actually there to fill it. A second arithmetic here would be a button that
 * says five and a lesson of three.
 *
 * ⚠️ **`waiting` is the same question with the brake taken out of it**, and
 * it is asked only when the brake left no room: with room, the lesson's own
 * count has already answered it.
 */
export async function offerOf(
  db: IngestDatabase,
  ownerId: string,
  zone: string,
  filter: SessionFilter = NO_FILTER,
  now: Date = new Date(),
): Promise<StudyOffer> {
  // Sequential — see `server/utils/review/queries.ts` on why `Promise.all` here
  // fails in the e2e tier and nowhere else.
  const limits = await readLimits(db, ownerId)
  const reading = await brakeReading(db, ownerId, zone, now)
  const room = lessonRoom(reading, limits)

  const lesson = room > 0 ? await lessonWords(db, ownerId, room, filter) : 0
  const waiting = room > 0 ? lesson > 0 : await lessonWords(db, ownerId, 1, filter) > 0
  const next = await nextDueAt(db, ownerId)

  return {
    ...reading,
    lesson,
    waiting,
    limits,
    nextDue: next ? next.toISOString() : null,
  }
}

/** How many words a lesson of up to `room` would hold, the brake aside. */
async function lessonWords(
  db: IngestDatabase,
  ownerId: string,
  room: number,
  filter: SessionFilter,
): Promise<number> {
  const own = await newCards(db, ownerId, room, filter)
  const unstarted = own.length >= room ? [] : await unstartedNotes(db, ownerId, room - own.length, filter)
  const plan = composeLesson(own, unstarted, room)

  return plan.cardIds.length + plan.noteIds.length
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
        // ADR 0075 §1: a run left open in the corpus the reader left is not
        // the run to resume.
        sessionInCurrentSubject(db),
      ),
    )
    .orderBy(desc(schema.reviewSession.startedAt))
    .limit(1)

  return session?.id ?? null
}

/**
 * The offer as the summary should read it — ⚠️ **fresh, once the run is over,
 * and `null` otherwise.** The reading the run was composed with says *63 due*;
 * twenty answers later it is 43, and a sentence that still said 63 would be
 * telling the reader the gate is shut when the next lesson would open it. The
 * zone is the one the run stored, because an answer carries none.
 */
export async function offerIfFinished(
  db: IngestDatabase,
  ownerId: string,
  snapshot: ReviewSnapshot | null,
  finished = snapshot !== null && isFinished(snapshot),
): Promise<StudyOffer | null> {
  if (!finished)
    return null

  return offerOf(db, ownerId, await readerZone(db, ownerId))
}

/**
 * A review run, written whole: due *cards* and nothing else (ADR 0076 §1).
 *
 * ⚠️ **`review_session.size` is what was composed, not what was asked for.** The
 * knob is a **cap**: `04` §7.7 holds `size` rows and the header's count is of
 * them, so a reader with seven due and a knob at twenty gets a run of seven.
 * `04` §7.6's `CHECK (size > 0)` is the other half: a *session* of nothing is
 * not a short *session*, and this answers `null` for it.
 */
async function composeReviewRun(
  db: IngestDatabase,
  ownerId: string,
  size: number,
  zone: string | null,
  now: Date,
): Promise<ReviewSnapshot | null> {
  const cardIds = composeReview(await dueCards(db, ownerId, now), size)

  if (cardIds.length === 0)
    return null

  const sessionId = await db.transaction(tx => writeSession(tx, ownerId, 'review', cardIds, zone))

  return snapshotOf(db, ownerId, sessionId)
}

/**
 * A lesson, written whole: up to the lesson size of new words, as far as the
 * brake allows (ADR 0076 §1, ADR 0066).
 *
 * ⚠️ **Starting a starter word is its acceptance, in this transaction.** A
 * word from the list has no *card* until somebody starts it (ADR 0075 §4), so
 * the lesson writes `note_vetting` at `accepted` and mints through
 * `mint_cards` — the same two writes the worker makes for a chosen word (ADR
 * 0064, ADR 0067). From then the *note* is frozen for this reader (ADR 0052).
 *
 * ⚠️ **The allowance is read before the transaction and written inside it.**
 * Two tabs composing in the same instant can each spend the same ten; ADR 0012
 * invites one reader, a resumed run is what a second tab normally gets, and the
 * brake's sentence reports the overrun rather than hiding it.
 *
 * ⚠️ **`new_count` is the whole lesson**, and it is what the day is counted
 * from (ADR 0066 §3): a lesson left unfinished has still spent its share.
 */
async function composeLessonRun(
  db: IngestDatabase,
  ownerId: string,
  filter: SessionFilter,
  zone: string | null,
  now: Date,
): Promise<ReviewSnapshot | null> {
  const limits: StudyLimits = await readLimits(db, ownerId)
  const room = lessonRoom(await brakeReading(db, ownerId, resolveZone(zone), now), limits)

  if (room <= 0)
    return null

  const own = await newCards(db, ownerId, room, filter)
  const unstarted = own.length >= room ? [] : await unstartedNotes(db, ownerId, room - own.length, filter)
  const plan = composeLesson(own, unstarted, room)

  if (plan.cardIds.length + plan.noteIds.length === 0)
    return null

  const sessionId = await db.transaction(async (tx) => {
    const started = await startNotes(tx, ownerId, plan.noteIds)
    const cardIds = [...plan.cardIds, ...started]

    return cardIds.length === 0 ? null : writeSession(tx, ownerId, 'lesson', cardIds, zone)
  })

  return sessionId ? snapshotOf(db, ownerId, sessionId) : null
}

/**
 * Accept and mint each *note*, and answer the *cards* that are now the
 * reader's, in the order the *notes* were given.
 *
 * ⚠️ **`pending` is upgraded and `rejected` is never touched**: the conflict
 * clause is the worker's (`worker/pipeline/write_notes.py`), and a word the
 * reader said no to stays said no to (`S5`) even if a racing read offered it.
 * The *cards* are then read back **through the vetting row**, so a *note* the
 * upsert declined contributes none.
 */
async function startNotes(tx: IngestDatabase, ownerId: string, noteIds: string[]): Promise<string[]> {
  if (noteIds.length === 0)
    return []

  for (const noteId of noteIds) {
    await tx
      .insert(schema.noteVetting)
      .values({ noteId, ownerId, state: 'accepted', vettedAt: sql`now()` })
      .onConflictDoUpdate({
        target: [schema.noteVetting.noteId, schema.noteVetting.ownerId],
        set: { state: 'accepted', vettedAt: sql`now()` },
        setWhere: eq(schema.noteVetting.state, 'pending'),
      })
  }

  const accepted = await tx
    .select({ noteId: schema.noteVetting.noteId })
    .from(schema.noteVetting)
    .where(
      and(
        inArray(schema.noteVetting.noteId, noteIds),
        eq(schema.noteVetting.ownerId, ownerId),
        eq(schema.noteVetting.state, 'accepted'),
      ),
    )
  const ok = new Set(accepted.map(row => row.noteId))

  for (const noteId of noteIds) {
    if (ok.has(noteId))
      await mint(tx, ownerId, noteId, jlptVocab)
  }

  const cards = await tx
    .select({ id: schema.card.id, noteId: schema.card.noteId })
    .from(schema.card)
    .where(
      and(
        inArray(schema.card.noteId, noteIds),
        eq(schema.card.ownerId, ownerId),
        isNull(schema.card.suspendedAt),
      ),
    )
    .orderBy(schema.card.id)

  return noteIds.flatMap(noteId =>
    ok.has(noteId) ? cards.filter(card => card.noteId === noteId).map(card => card.id) : [],
  )
}

/** The `review_session` row and its positions. Answers the *session* id. */
async function writeSession(
  tx: IngestDatabase,
  ownerId: string,
  kind: SessionKind,
  cardIds: string[],
  zone: string | null,
): Promise<string> {
  const [session] = await tx
    .insert(schema.reviewSession)
    // ⚠️ `snapshot_taken_at` and `started_at` are left to their defaults on
    // purpose: both are `now()` **on the server**, and a value computed in
    // this process and sent over would be the application's clock standing in
    // for the database's on the one timestamp `03` §8.2 compares against.
    // ⚠️ `new_count` is what the day's allowance is counted from (ADR 0066
    // §3) and it is written here, by the composition, on purpose — see
    // `shared/review/brake.ts` on why not from the first *grade*. `zone` is
    // what `/stats` reads the reader's day in (`readerZone`).
    .values({
      ownerId,
      kind,
      size: cardIds.length,
      newCount: kind === 'lesson' ? cardIds.length : 0,
      zone,
    })
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
}

/**
 * ADR 0076 §6 — the reader finished early. The run is stamped complete with
 * whatever it holds, and the summary is what is left of it.
 *
 * ⚠️ **It answers no position.** A word the run never reached keeps the
 * schedule it had; a missed one was graded Forgot by the entry ahead of this
 * one in the outbox, which is why this is an entry of its own and behind them.
 *
 * ⚠️ **Idempotent, and a stale tab's is harmless**: `completeSession` is
 * guarded on `completed_at IS NULL` and on the owner, so a replay stamps
 * nothing and somebody else's id matches no row.
 */
export async function finishSession(
  db: IngestDatabase,
  ownerId: string,
  sessionId: string,
): Promise<ReviewSnapshot | null> {
  const snapshot = await snapshotOf(db, ownerId, sessionId)

  if (!snapshot)
    return null

  await completeSession(db, ownerId, sessionId)

  return snapshot
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
