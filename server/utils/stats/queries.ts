/**
 * Everything `/stats` reads — `10` §8, `09` §4.10, `03` §12.
 *
 * ⚠️ **Rebuilt by [#23](https://github.com/yutaasakura96/kioku/issues/23)**
 * ([ADR 0062](../../../docs/adr/0062-retention-and-consistency-are-the-headline-and-acceptance-rate-retires.md)).
 * The *vetting* reads are gone with *acceptance rate* and *seconds-per-note*:
 * after [ADR 0064](../../../docs/adr/0064-a-chosen-word-mints-its-cards-on-arrival.md)
 * a chosen word is accepted when it is written, so `note_vetting` no longer
 * records a judgement anyone is measuring. **Do not reintroduce a count over it
 * to fill the fifth column** — `card` is the count that means something now.
 *
 * ⚠️ **There are no metrics tables** (`04` §13). Every figure below is a query
 * over rows the code that produced them wrote — retention and consistency from
 * `review_log`, flag rate from `card_flag` over `card`,
 * *time-to-first-review* from `source.submitted_at` to the first
 * `review_log.received_at`, tokens and cost from `ingestion`. That is what makes
 * the numbers survive ADR 0022's move, and it is also why **every way one can be
 * wrong is a bug rather than a fact about a corpus.**
 *
 * ⚠️ **Counts out, no rates.** `11` §8: the seam is *counts in, a rate out*, and
 * the rate lives in `shared/metrics/stats.ts`. The one thing that looks like an
 * exception and is not: `count(distinct card_id)` for flag rate's numerator is
 * **deduplication, not arithmetic** — it has to happen where the rows are, and
 * ADR 0062 makes it the difference between a share of the deck and a count of
 * complaints.
 *
 * ⚠️ **The day boundary is *not* here.** ADR 0066 puts it at 04:00 in the
 * reader's zone, and Postgres cannot be told the zone on a route that ships no
 * JavaScript. This module hands over **instants** and
 * `shared/time/local-day.ts` buckets them. A `date_trunc('day', …)` written
 * here would be a different rule — midnight, in UTC — in the shortest possible
 * SQL.
 *
 * ⚠️ **Every read is sequential, and that is not style.** Measured 2026-09-12
 * (§ Carrying): the end-to-end tier's database is a single-connection PGlite
 * behind `@electric-sql/pglite-socket`, so a `Promise.all` in a request handler
 * opens several connections, the rest are reset, the route answers `500`, and
 * nothing in the test output names the cause. `server/utils/vet/queries.ts` and
 * `server/utils/review/queries.ts` are sequential for the same reason.
 *
 * ⚠️ **Personal rows are owner-scoped; shared rows are not** (`04` §4).
 * `card_flag`, `card` and `review_log` carry an owner, so every read of them is
 * filtered. `source` and `ingestion` assert something about the material rather
 * than about the reader — `ingestion.submitted_by` is documented as "an audit
 * line, not an owner" — so the ledger and the *source* count have no filter,
 * exactly as `recentRuns` has none. **Adding one would be a product change**,
 * not a fix.
 */

import { and, count, desc, eq, gte, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { IngestDatabase } from '../ingest/record'
import { WINDOW_DAYS } from '../../../shared/metrics/stats'
import { seedTitle } from '../../../shared/ingest/seed'
import type { StatsContext, StatsRows } from '../../../shared/metrics/stats'

/**
 * One row of `10` §8.3's spend ledger — an *ingestion*, or since #25 a *seed*
 * request (ADR 0070 §2).
 */
export interface LedgerRow {
  kind: 'ingestion' | 'seed'
  /** `ingestion.id` or `seed.id`, by `kind`. */
  id: string
  /**
   * ⚠️ Null once the *source* has been hard-deleted — `04` §6.1's `SET NULL` —
   * and, for a seed, until its draft is submitted.
   */
  sourceId: string | null
  /**
   * `ingestion.source_title`, snapshotted at submit so the ledger survives; for
   * a seed, what it asked for (`seedTitle`).
   */
  title: string
  modelId: string | null
  inputTokens: number | null
  outputTokens: number | null
  /** ⚠️ Micro-USD, **from the API response** (`04` §6.1). Null means unrecorded. */
  costMicroUsd: bigint | null
  workerEnvironment: string
  submittedAt: Date
}

/** What one page load of `/stats` is made of. */
export interface StatsData {
  rows: StatsRows
  ledger: LedgerRow[]
  /**
   * ⚠️ **The clock and the zone travel with the rows**, so the arithmetic on
   * the page reads the window against the instant the rows were read rather
   * than against a second `new Date()` a few milliseconds later. `09` §2's *as
   * of this page load* is one instant, not two.
   */
  context: StatsContext
}

/**
 * The figures' inputs, in seven sequential reads.
 *
 * ⚠️ Nothing here is cached: `09` §2 stamps every figure "as of this page load",
 * and a *place* ships no JavaScript so it cannot poll. The request *is* the
 * instant — which is also why `now` is a parameter rather than a `new Date()`
 * taken inside: the window and the day bucketing have to be read against **one**
 * instant, and a test that cannot choose it cannot assert a boundary.
 */
export async function statsRows(db: IngestDatabase, ownerId: string, now: Date): Promise<StatsRows> {
  const retention = await retentionCounts(db, ownerId, daysBefore(now, WINDOW_DAYS))
  // ⚠️ **A day wider than the window, deliberately.** The trimming is done in
  // local days by `summarise`, and a zone is up to fourteen hours from UTC — so
  // a set cut to exactly thirty days here would be missing the far end of the
  // reader's thirtieth day. Handing over one extra day costs a few rows and
  // makes the two ends agree.
  const gradeMinutes = await gradeMinuteSamples(db, ownerId, daysBefore(now, WINDOW_DAYS + 1))
  const firstGradeAt = await firstGrade(db, ownerId)
  const flaggedCards = await flaggedCardCount(db, ownerId)
  const cardsMinted = await cardCount(db, ownerId)
  const durations = await firstReviewPerSource(db, ownerId)
  const sourcesIngested = await sourceCount(db)

  return {
    retention,
    gradeMinutes,
    firstGradeAt,
    flaggedCards,
    cardsMinted,
    timeToFirstReview: durations.map(row => row.seconds),
    sourcesIngested,
    // ⚠️ The environments **behind the measured durations**, not every
    // environment on record: `03` §12 puts the label on the number so a future
    // session cannot average across ADR 0022's move, and an environment no
    // figure was measured in would say the opposite of that.
    workerEnvironments: [...new Set(durations.flatMap(row => row.environments))].sort(),
  }
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000)
}

/**
 * Retention's two counts — ADR 0062.
 *
 * ⚠️ **`state = 2` is the whole of the decision and it is the part to get
 * right.** `review_log.state` is the state the *card* was in **before** the
 * grade (`04` §7.5, and the column says so). State 0 is a first-ever answer:
 * nothing had been retained, so it is not a failure to retain. State 3 is a
 * relearning answer, and counting it lets **one** act of forgetting push the
 * number down twice — once when the *card* lapsed and again on every step back
 * up. Anki's true-retention table splits on the same line. A `count(*)` with no
 * `state` filter is the naive implementation and it reads low, always.
 *
 * ⚠️ **`rating >= 3` is Good or Easy** (`1 Forgot · 2 Hard · 3 Good · 4 Easy`,
 * ADR 0034). Hard is a recall the reader struggled through and it counts against
 * retention, which is the convention the number is only comparable under.
 *
 * ⚠️ **The window is on `reviewed_at`, not `received_at`.** This is the one
 * place the two columns disagree in a way that matters: the outbox can replay a
 * Tuesday-night *grade* on Wednesday morning (ADR 0039), and the reader answered
 * it on Tuesday. `03` §8.2's validator is what makes the client stamp usable —
 * a clock more than two minutes out is refused rather than recorded (ADR 0054).
 * *Time-to-first-review* keeps `received_at` for the opposite reason: it is a
 * **difference** between two instants, and those have to be on one clock.
 */
async function retentionCounts(db: IngestDatabase, ownerId: string, since: Date) {
  const [counts] = await db
    .select({
      recalled: sql<number>`count(*) filter (where ${schema.reviewLog.rating} >= 3)::int`,
      qualifying: sql<number>`count(*)::int`,
    })
    .from(schema.reviewLog)
    .where(
      and(
        eq(schema.reviewLog.ownerId, ownerId),
        eq(schema.reviewLog.state, REVIEW_STATE),
        gte(schema.reviewLog.reviewedAt, since),
      ),
    )

  return counts ?? { recalled: 0, qualifying: 0 }
}

/**
 * ⚠️ **`ts-fsrs`'s `State.Review`, written out because the number is the
 * contract.** `04` §7.5 stores the enum's integer and nothing in this repository
 * imports the enum to read it back; 0 is New, 1 Learning, 2 Review, 3
 * Relearning (verification §1.1).
 */
const REVIEW_STATE = 2

/**
 * The distinct minutes the reader graded in — consistency's numerator, before
 * it has been bucketed into days.
 *
 * ⚠️ **Minutes, and the truncation is a size reduction that cannot change an
 * answer.** Every day boundary this project can produce falls on a whole minute:
 * 04:00 in a zone whose offset is a whole number of hours, half-hours or
 * quarter-hours is still :00, :30 or :45 past the hour in UTC. Truncating to the
 * **hour** would be the same reduction and it *would* move an instant across the
 * boundary in Kolkata — `test/unit/local-day.test.ts` has that case.
 *
 * ⚠️ **It is not `date_trunc('day', …)`,** which is the obvious version of this
 * query and answers a different question in the wrong zone. See the head of the
 * file.
 */
async function gradeMinuteSamples(db: IngestDatabase, ownerId: string, since: Date): Promise<Date[]> {
  const rows = await db
    .selectDistinct({
      // Single-table query, so the bare identifier an interpolated column emits
      // (§ Carrying, drizzle-orm 0.45.2) cannot bind to the wrong table.
      minute: sql<string | Date>`date_trunc('minute', ${schema.reviewLog.reviewedAt})`,
    })
    .from(schema.reviewLog)
    .where(and(eq(schema.reviewLog.ownerId, ownerId), gte(schema.reviewLog.reviewedAt, since)))

  return rows.map(row => new Date(row.minute))
}

/**
 * The reader's first *grade* ever — consistency's denominator.
 *
 * ⚠️ **Not windowed.** *Days there were to study* is capped at thirty by the
 * arithmetic, and a reader three days in has three days rather than thirty —
 * which is the difference between 3/3 suppressed and 3/30 reported as 10%.
 */
async function firstGrade(db: IngestDatabase, ownerId: string): Promise<Date | null> {
  const [first] = await db
    .select({ at: sql<string | Date | null>`min(${schema.reviewLog.reviewedAt})` })
    .from(schema.reviewLog)
    .where(eq(schema.reviewLog.ownerId, ownerId))

  return first?.at ? new Date(first.at) : null
}

/**
 * Flag rate's numerator — ⚠️ **distinct *cards*, not rows** (ADR 0062).
 *
 * ⚠️ **This is the one line #23 changes about the old *false-accept rate*.**
 * `count(*)` was right when the denominator was acceptances, and `11` §3 said so
 * in as many words; over *cards minted* it is wrong, because a share of the deck
 * cannot exceed one, and a second flag on one *card* is the reader finding the
 * same fault twice rather than a second bad *card*.
 *
 * ⚠️ **No `resolved_at IS NULL` filter, and one must not be added.** A *note*
 * that was flagged and then fixed **was still wrong when it was minted**, which
 * is the thing this number exists to report. Filtering to the open flags would
 * make the figure fall every time the reader repaired something — reporting a
 * pipeline that needs repairing as a pipeline that is working. `/vet`'s queue is
 * where `resolved_at` belongs and it already reads it (#20).
 *
 * ⚠️ **A replayed outbox entry is refused at the write** and not here
 * (`server/utils/review/flag.ts`, keyed on `(review_session_id, card_id)`) —
 * by the time a row exists a retry and a second flag are indistinguishable.
 */
async function flaggedCardCount(db: IngestDatabase, ownerId: string): Promise<number> {
  const [flagged] = await db
    .select({ n: sql<number>`count(distinct ${schema.cardFlag.cardId})::int` })
    .from(schema.cardFlag)
    .where(eq(schema.cardFlag.ownerId, ownerId))

  return flagged?.n ?? 0
}

/**
 * Flag rate's denominator, and the one raw count on the screen — `10` §8.1.
 *
 * ⚠️ **A suspended *card* is counted.** It was minted, and if it was suspended
 * because it was wrong then removing it from the denominator would improve the
 * figure by deleting the evidence — the same argument `sourceCount` makes for a
 * soft-deleted *source*, and `S11` keeps both readable for the same reason.
 */
async function cardCount(db: IngestDatabase, ownerId: string): Promise<number> {
  const [cards] = await db
    .select({ n: count() })
    .from(schema.card)
    .where(eq(schema.card.ownerId, ownerId))

  return cards?.n ?? 0
}

/**
 * One duration per *source* that has been studied — `S10`, ADR 0057.
 *
 * ⚠️ **Per *source*, and `11` §3 names the near-miss**: *the first grade of any
 * card* returns one plausible number and is wrong the moment a second *source*
 * exists.
 *
 * ⚠️ **The link is `note.origin_ingestion_id`, not `occurrence`.**
 * `CONTEXT.md` defines the criterion as the first *card* **generated from** the
 * *source*, and an *occurrence* is a sighting of a *note* that some earlier
 * *source* already paid to generate — joining through it would let a *source*
 * inherit a *review* of a *card* that existed before it was pasted.
 *
 * ⚠️ **`received_at`, never `reviewed_at`.** `03` §12 requires the submit
 * instant and the first grade instant to be **on the same clock**, and
 * `reviewed_at` is the client's stamp — on a laptop an hour fast it would
 * produce a negative duration and on one an hour slow an invented one. `04` §7.5
 * says the two columns are not redundant; this is the metric's one.
 */
async function firstReviewPerSource(
  db: IngestDatabase,
  ownerId: string,
): Promise<{ seconds: number, environments: string[] }[]> {
  const rows = await db
    .select({
      submittedAt: schema.source.submittedAt,
      // ⚠️ Only `review_log` has a `received_at` and only `ingestion` has a
      // `worker_environment`, so the bare identifiers a `sql` template emits for
      // an interpolated column (§ Carrying, measured against drizzle-orm 0.45.2)
      // are unambiguous here. **`submitted_at` is not** — `source` and
      // `ingestion` both have one — which is why it is selected through the
      // query builder rather than interpolated.
      firstReviewAt: sql<string | Date>`min(${schema.reviewLog.receivedAt})`,
      environments: sql<string>`string_agg(distinct ${schema.ingestion.workerEnvironment}, ',')`,
    })
    .from(schema.source)
    .innerJoin(schema.ingestion, eq(schema.ingestion.sourceId, schema.source.id))
    .innerJoin(schema.note, eq(schema.note.originIngestionId, schema.ingestion.id))
    .innerJoin(
      schema.card,
      and(eq(schema.card.noteId, schema.note.id), eq(schema.card.ownerId, ownerId)),
    )
    .innerJoin(
      schema.reviewLog,
      and(eq(schema.reviewLog.cardId, schema.card.id), eq(schema.reviewLog.ownerId, ownerId)),
    )
    .groupBy(schema.source.id, schema.source.submittedAt)

  return rows.map(row => ({
    seconds: (new Date(row.firstReviewAt).getTime() - row.submittedAt.getTime()) / 1000,
    environments: (row.environments ?? '').split(',').filter(Boolean),
  }))
}

/**
 * Every *source* ingested — the denominator of *time-to-first-review*'s pair.
 *
 * ⚠️ **A soft-deleted *source* is counted.** It was ingested and it was paid
 * for; dropping it would improve the figure by deleting the evidence, and `S11`
 * keeps it readable for the same reason.
 */
async function sourceCount(db: IngestDatabase): Promise<number> {
  const [sources] = await db.select({ n: count() }).from(schema.source)
  return sources?.n ?? 0
}

/**
 * `10` §8.3's ledger — tokens and cost per *ingestion* and per *seed* request,
 * newest first.
 *
 * ⚠️ **It reads `ingestion` and `seed` and joins nothing.** `04` §9 makes
 * `ingestion.source_id` `SET NULL` and snapshots `source_title` at submit
 * precisely so **the spend ledger survives a hard delete**; a ledger built by
 * joining `source` would lose the row the moment the material is gone, which is
 * the one case the snapshot exists for.
 *
 * ⚠️ **Every seed row, discarded ones included** (ADR 0070 §2): a draft the
 * reader never submitted was still paid for. Two sequential reads merged here
 * rather than a `UNION`, for the reason at the top of this file and because the
 * two titles are made differently.
 */
export async function ledger(db: IngestDatabase): Promise<LedgerRow[]> {
  const ingestions = await db
    .select({
      id: schema.ingestion.id,
      sourceId: schema.ingestion.sourceId,
      title: schema.ingestion.sourceTitle,
      modelId: schema.ingestion.modelId,
      inputTokens: schema.ingestion.inputTokens,
      outputTokens: schema.ingestion.outputTokens,
      costMicroUsd: schema.ingestion.costMicroUsd,
      workerEnvironment: schema.ingestion.workerEnvironment,
      submittedAt: schema.ingestion.submittedAt,
    })
    .from(schema.ingestion)

  const seeds = await db
    .select({
      id: schema.seed.id,
      sourceId: schema.seed.sourceId,
      domain: schema.seed.domain,
      level: schema.seed.level,
      count: schema.seed.count,
      modelId: schema.seed.modelId,
      inputTokens: schema.seed.inputTokens,
      outputTokens: schema.seed.outputTokens,
      costMicroUsd: schema.seed.costMicroUsd,
      workerEnvironment: schema.seed.workerEnvironment,
      submittedAt: schema.seed.requestedAt,
    })
    .from(schema.seed)

  const rows: LedgerRow[] = [
    ...ingestions.map(row => ({ kind: 'ingestion' as const, ...row })),
    ...seeds.map(({ domain, level, count, ...row }) => ({
      kind: 'seed' as const,
      ...row,
      title: seedTitle({ domain, level, count }),
    })),
  ]
  return rows.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
}

/** One page load, in one lazy read — `server/middleware/shell-data.ts`. */
export async function statsData(
  db: IngestDatabase,
  ownerId: string,
  context: StatsContext,
): Promise<StatsData> {
  // Sequential, for the reason at the top of this file.
  const rows = await statsRows(db, ownerId, context.now)
  return { rows, ledger: await ledger(db), context }
}
