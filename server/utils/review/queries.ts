/**
 * `04` §12's due query, the words a lesson can start and the *session*
 * snapshot — the reads *Review* makes.
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

import { and, asc, count, desc, eq, exists, gt, gte, inArray, isNotNull, isNull, lte, notExists, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import * as schema from '../../db/schema'
import { DUE_READ_CEILING } from '../../../shared/review/compose'
import type { DueCard, NewCard } from '../../../shared/review/compose'
import type { ComposedSession } from '../../../shared/review/brake'
import { retrievability } from '../../../shared/review/scheduler'
import { resolveZone } from '../../../shared/time/local-day'
import type { SessionFilter } from '../../../shared/review/filter'
import { levelAuthority } from '../../../shared/category/category'
import { NO_FILTER } from '../../../shared/review/filter'
import type { Grade } from '../../../shared/review/scheduler'
import { stageOfEpoch } from '../../../shared/review/stage'
import { jlptVocab, levelValues } from '../../../shared/subject/declaration'
import type { IngestDatabase } from '../ingest/record'
import { CURRENT_SUBJECT_ID, noteInCurrentSubject, sessionInCurrentSubject } from '../subject'
import { kanjiReadingsOf } from './kanji'
// ⚠️ **The snapshot's shape lives in `shared/`, not here.** It is what crosses
// the wire, and `shared/review/snapshot.ts` carries the one rule about how a
// later answer may touch it — the *grades* move, the words do not (PRD §5).
import type { ReviewSnapshot, SessionKind } from '../../../shared/review/snapshot'

export type { ReviewPosition, ReviewSnapshot } from '../../../shared/review/snapshot'

/**
 * The *cards* whose live *scheduling epoch* has come due — every one of them,
 * up to ADR 0066 §5's ceiling, each with what it takes to rank it.
 *
 * ⚠️ **Suspension is on the `card` and cannot be in the epoch's partial
 * predicate** (`04` §11) — `scheduling_epoch_owner_due_idx` covers
 * `(owner_id, due) WHERE superseded_at IS NULL`, and the join to `card` is what
 * drops a *card* `S9` or `S11` withdrew.
 *
 * ⚠️ **No `LIMIT size`, since #21.** The *session* size used to be the limit,
 * which made the most overdue twenty the only twenty `compose` could see. Two
 * things need the whole set: the fifty-*card* gate counts it (ADR 0066 §2), and
 * a backlog is ordered by retrievability, which SQL cannot compute. **The count
 * is this read's length** — one read, so the gate and the run agree about what
 * was due. The ceiling is ordered `due` ascending, so past 2,000 it is the
 * oldest that are ranked, and the gate is long since shut.
 */
export async function dueCards(
  db: IngestDatabase,
  ownerId: string,
  now: Date = new Date(),
): Promise<DueCard[]> {
  const epoch = schema.schedulingEpoch

  const rows = await db
    .select({
      cardId: schema.card.id,
      due: epoch.due,
      stability: epoch.stability,
      difficulty: epoch.difficulty,
      scheduledDays: epoch.scheduledDays,
      learningSteps: epoch.learningSteps,
      reps: epoch.reps,
      lapses: epoch.lapses,
      state: epoch.state,
      lastReview: epoch.lastReview,
    })
    .from(epoch)
    .innerJoin(schema.card, eq(schema.card.id, epoch.cardId))
    .where(dueWhere(db, ownerId, now))
    .orderBy(asc(epoch.due), asc(schema.card.id))
    .limit(DUE_READ_CEILING)

  return rows.map(({ cardId, ...state }) => ({
    cardId,
    due: state.due,
    retrievability: retrievability(state, now),
  }))
}

/**
 * How many due *cards* the reader owes, for the end screen's sentence
 * (ADR 0066 §7). ⚠️ **The same predicate as `dueCards`, by construction** — a
 * run composed from one set and a sentence counted over another would tell the
 * reader the gate is shut on a number the gate never saw.
 */
export async function dueCount(
  db: IngestDatabase,
  ownerId: string,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(schema.schedulingEpoch)
    .innerJoin(schema.card, eq(schema.card.id, schema.schedulingEpoch.cardId))
    .where(dueWhere(db, ownerId, now))

  return row?.count ?? 0
}

// ⚠️ **The current *subject* only** (ADR 0075 §1): a *card* of the corpus the
// reader left is still due in the database and is not owed on any screen.
function dueWhere(db: IngestDatabase, ownerId: string, now: Date) {
  return and(
    eq(schema.schedulingEpoch.ownerId, ownerId),
    isNull(schema.schedulingEpoch.supersededAt),
    lte(schema.schedulingEpoch.due, now),
    isNull(schema.card.suspendedAt),
    noteInCurrentSubject(db, schema.card.noteId),
  )
}

/**
 * The runs whose `new_count` might belong to today, for the day's allowance
 * (ADR 0066 §3).
 *
 * ⚠️ **A window, not a day.** Which of these are *today* is decided by
 * `shared/review/brake.ts` over `shared/time/local-day.ts`'s key — the day is
 * 04:00 in the reader's zone, and `date_trunc('day', …)` here would be midnight
 * in the database's (§ Carrying). Forty-eight hours is wider than any local day
 * can be, daylight saving included, and a reader composes a handful of runs in
 * it. Only runs that introduced something are read.
 */
export async function recentlyComposed(
  db: IngestDatabase,
  ownerId: string,
  now: Date = new Date(),
): Promise<ComposedSession[]> {
  return db
    .select({ startedAt: schema.reviewSession.startedAt, newCount: schema.reviewSession.newCount })
    .from(schema.reviewSession)
    .where(
      and(
        eq(schema.reviewSession.ownerId, ownerId),
        gt(schema.reviewSession.newCount, 0),
        gte(schema.reviewSession.startedAt, new Date(now.getTime() - RECENT_WINDOW_MS)),
        // ADR 0075 §1: what the corpus the reader left introduced today does
        // not spend this one's allowance.
        sessionInCurrentSubject(db),
      ),
    )
}

const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000

/** The *authority* a *level* is read from — the declaration's first (ADR 0075 §2). */
const LEVEL_AUTHORITY = levelAuthority()

/**
 * The zone the reader's client last reported (ADR 0066 §4, as amended by #21),
 * resolved — so a reader who never sent one, or sent nonsense, is in the
 * fallback.
 *
 * ⚠️ **It is the newest run's, and only the *session* request carries one.**
 * `/stats` ships no JavaScript (ADR 0020) and has no client to ask, so this is
 * how the day on `/stats` becomes the reader's rather than UTC's. A run composed
 * before #21 stored nothing and is skipped.
 */
export async function readerZone(db: IngestDatabase, ownerId: string): Promise<string> {
  const [row] = await db
    .select({ zone: schema.reviewSession.zone })
    .from(schema.reviewSession)
    .where(and(eq(schema.reviewSession.ownerId, ownerId), isNotNull(schema.reviewSession.zone), sessionInCurrentSubject(db)))
    .orderBy(desc(schema.reviewSession.startedAt))
    .limit(1)

  return resolveZone(row?.zone)
}

/**
 * The *cards* that have never been scheduled — minted by an acceptance and
 * carrying no *scheduling epoch* at all.
 *
 * ⚠️ **`NOT EXISTS` over every epoch, not over the live one.** A *card* whose
 * only epoch was superseded has a history; it is not new, it is due or it is
 * not, and asking for the absence of a *live* epoch would put a reset *card*
 * back among the ones the reader has never seen.
 *
 * ⚠️ **The *session* filter lives here and only here** (ADR 0065 §5). It
 * narrows the new half, in SQL rather than in `compose`, because this read has a
 * `LIMIT` on it: filtering twenty unfiltered rows afterwards would answer *no
 * `tech` cards* to a reader with a hundred of them behind the first twenty.
 *
 * ⚠️ **The *level* is the list's, and a model's estimate is not one** (ADR 0075
 * §2, #68). The declaration's `authorities` is the precedence ADR 0005 left
 * open, and the level filter reads the first declared authority's claim and no
 * other: a *note* that authority does not place matches no level. ⚠️ **This
 * said *a claim in the set, any claim* until #68**, when every claim was a
 * model's. The *domain* filter still reads any claim — nothing with a name on
 * it says a *domain* yet.
 *
 * ⚠️ **The current *subject* only** (ADR 0075 §1).
 */
export async function newCards(
  db: IngestDatabase,
  ownerId: string,
  limit: number,
  filter: SessionFilter = NO_FILTER,
): Promise<NewCard[]> {
  const epoch = schema.schedulingEpoch

  const rows = await db
    .select({ cardId: schema.card.id, mintedAt: schema.card.createdAt })
    .from(schema.card)
    .where(
      and(
        eq(schema.card.ownerId, ownerId),
        isNull(schema.card.suspendedAt),
        noteInCurrentSubject(db, schema.card.noteId),
        notExists(
          db.select({ one: sql`1` }).from(epoch).where(eq(epoch.cardId, schema.card.id)),
        ),
        noteInFilter(db, filter, schema.card.noteId),
      ),
    )
    .orderBy(asc(schema.card.createdAt), asc(schema.card.id))
    .limit(limit)

  return rows
}

/** The *session* filter as a predicate on a *note* id — `undefined` for no filter. */
function noteInFilter(db: IngestDatabase, filter: SessionFilter, noteId: AnyPgColumn) {
  const domain = schema.domainClaim
  const level = schema.levelClaim

  return and(
    filter.domains.length === 0
      ? undefined
      : exists(
          db.select({ one: sql`1` }).from(domain).where(
            and(eq(domain.noteId, noteId), inArray(domain.domain, filter.domains)),
          ),
        ),
    filter.levels.length === 0
      ? undefined
      : exists(
          db.select({ one: sql`1` }).from(level).where(
            and(
              eq(level.noteId, noteId),
              eq(level.authorityKey, LEVEL_AUTHORITY),
              inArray(level.level, filter.levels),
            ),
          ),
        ),
  )
}

/** The declaration's *levels*, easiest first — the order a lesson walks them in. */
const LEVEL_ORDER = levelValues(jlptVocab)

/**
 * The words a lesson can start: *notes* the list places at a *level* that this
 * reader has no *card* for (ADR 0076 §1, ADR 0075 §4).
 *
 * ⚠️ **Easiest *level* first, and inside a *level* a fixed shuffle** — `md5` of
 * the *note* id. The starter set was loaded in the list's order, which is
 * alphabetical by reading, and a lesson of 会う, 青, 青い, 赤, 赤い is five
 * words chosen to be confused. The shuffle is the same on every call, so a
 * lesson composed twice offers the same words.
 *
 * ⚠️ **A word the reader rejected is never offered** (`S5`: say no once and
 * mean it), and one they have a *card* for — suspended or not — is not new.
 *
 * ⚠️ **From `level_claim`, so only the declared *authority*'s words** (ADR 0075
 * §2). A *note* no list places is somebody's own word, and it reaches a lesson
 * as the *card* its *ingestion* minted (`newCards`).
 *
 * ⚠️ **The two `sql` fragments name `level_claim`'s columns, and that is safe
 * here only because the query is not a subquery**: an interpolated column is
 * emitted bare (§ Carrying), and neither `level` nor `note_id` is a column of
 * `note`, the one table joined.
 */
export async function unstartedNotes(
  db: IngestDatabase,
  ownerId: string,
  limit: number,
  filter: SessionFilter = NO_FILTER,
): Promise<string[]> {
  if (limit <= 0)
    return []

  const level = schema.levelClaim
  const order = sql.join(LEVEL_ORDER.map(value => sql`${value}`), sql`, `)

  const rows = await db
    .select({ noteId: level.noteId })
    .from(level)
    .innerJoin(schema.note, eq(schema.note.id, level.noteId))
    .where(
      and(
        eq(level.authorityKey, LEVEL_AUTHORITY),
        eq(schema.note.subjectId, CURRENT_SUBJECT_ID),
        filter.levels.length === 0 ? undefined : inArray(level.level, filter.levels),
        // The level half is the line above; this is the domain half.
        noteInFilter(db, { domains: filter.domains, levels: [] }, level.noteId),
        notExists(
          db.select({ one: sql`1` }).from(schema.card).where(
            and(eq(schema.card.noteId, level.noteId), eq(schema.card.ownerId, ownerId)),
          ),
        ),
        notExists(
          db.select({ one: sql`1` }).from(schema.noteVetting).where(
            and(
              eq(schema.noteVetting.noteId, level.noteId),
              eq(schema.noteVetting.ownerId, ownerId),
              eq(schema.noteVetting.state, 'rejected'),
            ),
          ),
        ),
      ),
    )
    .orderBy(sql`array_position(ARRAY[${order}]::text[], ${level.level})`, sql`md5(${level.noteId}::text)`)
    .limit(limit)

  return rows.map(row => row.noteId)
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
      kind: schema.reviewSession.kind,
      size: schema.reviewSession.size,
      snapshotTakenAt: schema.reviewSession.snapshotTakenAt,
    })
    .from(schema.reviewSession)
    .where(and(eq(schema.reviewSession.id, sessionId), eq(schema.reviewSession.ownerId, ownerId), sessionInCurrentSubject(db)))
    .limit(1)

  if (!session)
    return null

  const members = await db
    .select({
      ordinal: schema.reviewSessionCard.ordinal,
      cardId: schema.reviewSessionCard.cardId,
      templateKey: schema.card.templateKey,
      noteId: schema.note.id,
      fields: schema.note.fields,
      meanings: schema.noteMeaning.meanings,
      level: schema.levelClaim.level,
    })
    .from(schema.reviewSessionCard)
    .innerJoin(schema.card, eq(schema.card.id, schema.reviewSessionCard.cardId))
    .innerJoin(schema.note, eq(schema.note.id, schema.card.noteId))
    // ⚠️ **Left**, because a *note* the backfill has not reached has no row and
    // is still a *card* to study — against its gloss alone (ADR 0069 §3).
    .leftJoin(schema.noteMeaning, eq(schema.noteMeaning.noteId, schema.note.id))
    // ⚠️ **Left, and on the declared *authority* alone** (ADR 0075 §2): a word
    // no list places has no *level*, and a model's estimate is not one.
    // `level_claim` is unique on `(note_id, authority_key)`, so this cannot
    // double a position.
    .leftJoin(
      schema.levelClaim,
      and(eq(schema.levelClaim.noteId, schema.note.id), eq(schema.levelClaim.authorityKey, LEVEL_AUTHORITY)),
    )
    .where(eq(schema.reviewSessionCard.reviewSessionId, sessionId))
    .orderBy(asc(schema.reviewSessionCard.ordinal))

  // ADR 0069 §2: this reader's synonyms and nobody else's.
  const noteIds = [...new Set(members.map(row => row.noteId))]
  const synonymRows = noteIds.length === 0
    ? []
    : await db
        .select({ noteId: schema.meaningSynonym.noteId, text: schema.meaningSynonym.text })
        .from(schema.meaningSynonym)
        .where(and(eq(schema.meaningSynonym.ownerId, ownerId), inArray(schema.meaningSynonym.noteId, noteIds)))
        .orderBy(asc(schema.meaningSynonym.createdAt))

  const synonyms = new Map<string, string[]>()
  for (const row of synonymRows)
    synonyms.set(row.noteId, [...(synonyms.get(row.noteId) ?? []), row.text])

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
      // What the *card* was answered **from** (`04` §7.5) — the stage the
      // reader came to it with, once the epoch has moved on.
      state: schema.reviewLog.state,
      stability: schema.reviewLog.stability,
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

  // ⚠️ **The first row, where `given` takes the last.** A position answered
  // twice was answered *from* the state before the first answer; the later row
  // starts from what the first one produced.
  const before = new Map<string, { state: number, stability: number }>()
  for (const row of graded) {
    if (!before.has(row.cardId))
      before.set(row.cardId, { state: row.state, stability: row.stability })
  }

  // ADR 0076 §7 — where each word is now, from its live epoch.
  const cardIds = members.map(row => row.cardId)
  const epochs = cardIds.length === 0
    ? []
    : await db
        .select({
          cardId: schema.schedulingEpoch.cardId,
          state: schema.schedulingEpoch.state,
          stability: schema.schedulingEpoch.stability,
          due: schema.schedulingEpoch.due,
        })
        .from(schema.schedulingEpoch)
        .where(and(inArray(schema.schedulingEpoch.cardId, cardIds), isNull(schema.schedulingEpoch.supersededAt)))
  const live = new Map(epochs.map(row => [row.cardId, row]))

  return {
    sessionId: session.id,
    kind: session.kind as SessionKind,
    size: session.size,
    snapshotTakenAt: session.snapshotTakenAt,
    positions: members.map((row) => {
      const fields = (row.fields ?? {}) as Record<string, string>
      const grade = given.get(row.cardId) ?? null
      const epoch = live.get(row.cardId)
      const after = stageOfEpoch(epoch)

      return {
        ordinal: row.ordinal,
        cardId: row.cardId,
        templateKey: row.templateKey,
        fields,
        meanings: row.meanings ?? [],
        synonyms: synonyms.get(row.noteId) ?? [],
        // ADR 0069 §5: computed here, so the KANJIDIC2 table stays on the server.
        kanjiReadings: kanjiReadingsOf(fields),
        level: row.level ?? null,
        // A graded word's stage is what it was answered from; an ungraded
        // one's is where it stands.
        stage: grade === null ? after : stageOfEpoch(before.get(row.cardId)),
        outcome: grade !== null && epoch && after ? { stage: after, due: epoch.due.toISOString() } : null,
        grade,
        flagged: flagged.has(row.cardId),
      }
    }),
  }
}

/**
 * The next instant one of the reader's words is due — in the past while reviews
 * are waiting, and `null` when nothing has ever been scheduled, which is how
 * the screen before a run tells a first visit from a quiet day
 * (`shared/review/offer.ts`).
 */
export async function nextDueAt(db: IngestDatabase, ownerId: string): Promise<Date | null> {
  const [next] = await db
    .select({ due: schema.schedulingEpoch.due })
    .from(schema.schedulingEpoch)
    .innerJoin(schema.card, eq(schema.card.id, schema.schedulingEpoch.cardId))
    .where(
      and(
        eq(schema.schedulingEpoch.ownerId, ownerId),
        isNull(schema.schedulingEpoch.supersededAt),
        isNull(schema.card.suspendedAt),
        noteInCurrentSubject(db, schema.card.noteId),
      ),
    )
    .orderBy(asc(schema.schedulingEpoch.due))
    .limit(1)

  return next?.due ?? null
}
