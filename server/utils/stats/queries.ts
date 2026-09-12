/**
 * Everything `/stats` reads — `10` §8, `09` §4.10, `03` §12.
 *
 * ⚠️ **There are no metrics tables** (`04` §13). Every figure below is a query
 * over rows the code that produced them wrote — *acceptance rate* and
 * *seconds-per-note* from `note_vetting`, *false-accept rate* from `card_flag`,
 * *time-to-first-review* from `source.submitted_at` to the first
 * `review_log.received_at`, tokens and cost from `ingestion`. That is what makes
 * the numbers survive ADR 0022's move, and it is also why **every way one can be
 * wrong is a bug rather than a fact about a corpus.**
 *
 * ⚠️ **Counts out, no rates.** `11` §8: the seam is *counts in, a rate out*, and
 * the rate lives in `shared/metrics/`. In particular **`acceptance.ts` is the
 * *acceptance rate* arithmetic and this module must not re-derive it in SQL**
 * (§ Carrying) — a `COUNT(*) FILTER (WHERE state = 'accepted')` divided here
 * would drop `S6`'s edited accept and every *pending note*, flatter the thesis,
 * and look entirely reasonable in a diff.
 *
 * ⚠️ **Every read is sequential, and that is not style.** Measured 2026-09-12
 * (§ Carrying): the end-to-end tier's database is a single-connection PGlite
 * behind `@electric-sql/pglite-socket`, so a `Promise.all` in a request handler
 * opens four connections, three are reset, the route answers `500`, and nothing
 * in the test output names the cause. `server/utils/vet/queries.ts` and
 * `server/utils/review/queries.ts` are sequential for the same reason.
 *
 * ⚠️ **Personal rows are owner-scoped; shared rows are not** (`04` §4).
 * `note_vetting`, `card_flag`, `card` and `review_log` carry an owner, so every
 * read of them is filtered. `source` and `ingestion` assert something about the
 * material rather than about the reader — `ingestion.submitted_by` is documented
 * as "an audit line, not an owner" — so the ledger and the *source* count have
 * no filter, exactly as `recentRuns` has none. **Adding one would be a product
 * change**, not a fix.
 */

import { and, count, desc, eq, isNotNull, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { IngestDatabase } from '../ingest/record'
import type { StatsRows } from '../../../shared/metrics/stats'

/** One row of `10` §8.3's spend ledger. */
export interface LedgerRow {
  ingestionId: string
  /** ⚠️ Null once the *source* has been hard-deleted — `04` §6.1's `SET NULL`. */
  sourceId: string | null
  /** `ingestion.source_title`, snapshotted at submit so the ledger survives. */
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
}

/**
 * The five figures' inputs, in five sequential reads.
 *
 * ⚠️ Nothing here is cached: `09` §2 stamps every figure "as of this page load",
 * and a *place* ships no JavaScript so it cannot poll. The request *is* the
 * instant.
 */
export async function statsRows(db: IngestDatabase, ownerId: string): Promise<StatsRows> {
  const vetting = await vettingCounts(db, ownerId)
  const secondsPerNote = await secondsToVetSamples(db, ownerId)
  const flags = await flagCount(db, ownerId)
  const durations = await firstReviewPerSource(db, ownerId)
  const sourcesIngested = await sourceCount(db)

  return {
    vetting,
    secondsPerNote,
    flags,
    timeToFirstReview: durations.map(row => row.seconds),
    sourcesIngested,
    // ⚠️ The environments **behind the measured durations**, not every
    // environment on record: `03` §12 puts the label on the number so a future
    // session cannot average across ADR 0022's move, and an environment no
    // figure was measured in would say the opposite of that.
    workerEnvironments: [...new Set(durations.flatMap(row => row.environments))].sort(),
  }
}

/**
 * `note_vetting` in the four buckets `shared/metrics/acceptance.ts` declares.
 *
 * ⚠️ **The split is `edited`, not `state`.** `04` §7.2 stores an edited accept
 * as `state = 'accepted'` with `edited = true`, and `S6` says it counts as an
 * **edit**. One `FILTER` clause is the difference between the number the project
 * exists to answer and a number that flatters it.
 */
async function vettingCounts(db: IngestDatabase, ownerId: string) {
  const [counts] = await db
    .select({
      acceptedUnedited: sql<number>`count(*) filter (where ${schema.noteVetting.state} = 'accepted' and not ${schema.noteVetting.edited})::int`,
      acceptedWithEdit: sql<number>`count(*) filter (where ${schema.noteVetting.state} = 'accepted' and ${schema.noteVetting.edited})::int`,
      rejected: sql<number>`count(*) filter (where ${schema.noteVetting.state} = 'rejected')::int`,
      pending: sql<number>`count(*) filter (where ${schema.noteVetting.state} = 'pending')::int`,
    })
    .from(schema.noteVetting)
    .where(eq(schema.noteVetting.ownerId, ownerId))

  return (
    counts ?? { acceptedUnedited: 0, acceptedWithEdit: 0, rejected: 0, pending: 0 }
  )
}

/**
 * `S3`'s stamps — ⚠️ **over unedited accepts only** (`11` §3).
 *
 * An edited accept took longer because it was edited, so a median that includes
 * it measures the editing rather than the vetting. The `IS NOT NULL` matters as
 * much: the column is nullable, and a missing stamp read as zero would pull the
 * median toward an instant nobody spent.
 */
async function secondsToVetSamples(db: IngestDatabase, ownerId: string): Promise<number[]> {
  const rows = await db
    .select({ seconds: schema.noteVetting.secondsToVet })
    .from(schema.noteVetting)
    .where(
      and(
        eq(schema.noteVetting.ownerId, ownerId),
        eq(schema.noteVetting.state, 'accepted'),
        eq(schema.noteVetting.edited, false),
        isNotNull(schema.noteVetting.secondsToVet),
      ),
    )

  // `numeric` arrives as a string from both drivers — the type that survives a
  // value `double precision` could not represent, and the conversion belongs
  // here rather than in the arithmetic.
  return rows.map(row => Number(row.seconds))
}

/**
 * *False-accept rate*'s numerator.
 *
 * ⚠️ **A second flag on the same *card* is a second row** (`11` §3), so this is
 * `count(*)` and never `count(distinct card_id)` — deduplicating would
 * under-report exactly the signal `S9` exists for. The duplicate that *is*
 * refused is a **replayed outbox entry**, and it is refused at the write
 * (`server/utils/review/flag.ts`, ADR 0056) rather than here, because by the
 * time a row exists the two are indistinguishable.
 *
 * ⚠️ **No `resolved_at IS NULL` filter, and the re-vetting ticket must not add
 * one.** Nothing sets `resolved_at` today, so the two readings agree — and they
 * stop agreeing the moment it ships. `04` §7.8 defines the numerator as
 * `count(card_flag)`, unfiltered, because **re-vetting a *note* does not
 * un-happen the false accept**: a ratio that fell every time the reader fixed
 * something would report a *vetting* step that has become theatre as a *vetting*
 * step that is working, which is the exact inversion `CONTEXT.md` says this
 * number exists to catch.
 */
async function flagCount(db: IngestDatabase, ownerId: string): Promise<number> {
  const [flags] = await db
    .select({ n: count() })
    .from(schema.cardFlag)
    .where(eq(schema.cardFlag.ownerId, ownerId))

  return flags?.n ?? 0
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
 * `10` §8.3's ledger — tokens and cost per *ingestion*, newest first.
 *
 * ⚠️ **It reads `ingestion` alone and joins nothing.** `04` §9 makes
 * `ingestion.source_id` `SET NULL` and snapshots `source_title` at submit
 * precisely so **the spend ledger survives a hard delete**; a ledger built by
 * joining `source` would lose the row the moment the material is gone, which is
 * the one case the snapshot exists for.
 */
export async function ledger(db: IngestDatabase): Promise<LedgerRow[]> {
  return db
    .select({
      ingestionId: schema.ingestion.id,
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
    .orderBy(desc(schema.ingestion.submittedAt))
}

/** One page load, in one lazy read — `server/middleware/shell-data.ts`. */
export async function statsData(db: IngestDatabase, ownerId: string): Promise<StatsData> {
  // Sequential, for the reason at the top of this file.
  const rows = await statsRows(db, ownerId)
  return { rows, ledger: await ledger(db) }
}
