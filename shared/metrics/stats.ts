/**
 * `S10`'s figures, as arithmetic over counts — `11` §3 and §8.
 *
 * ⚠️ **Rebuilt rather than edited by [#23](https://github.com/yutaasakura96/kioku/issues/23)**
 * ([ADR 0062](../../docs/adr/0062-retention-and-consistency-are-the-headline-and-acceptance-rate-retires.md)).
 * *Acceptance rate* and median *seconds-per-note* are **retired**, not demoted,
 * and `shared/metrics/acceptance.ts` went with them: after
 * [ADR 0064](../../docs/adr/0064-a-chosen-word-mints-its-cards-on-arrival.md)
 * there is no accept event to count, so the rate is 100% by construction and a
 * number that is always 100% is decoration. **Retention** and **consistency**
 * are the headline; **flag rate** is *false-accept rate* with a denominator that
 * still means something; *time-to-first-review*, tokens and cost are untouched.
 *
 * ⚠️ **There are no metrics tables** (`04` §13). Every input below is a count or
 * a sample read straight off the rows the code that produced them wrote, so
 * every way a number can be wrong is a bug rather than a fact about a corpus.
 * The queries are `server/utils/stats/queries.ts`; what is here is the
 * arithmetic, and it is separate because `11` §3 calls this the most likely
 * error in the application.
 *
 * ⚠️ **No threshold, anywhere, ever** (ADR 0037, ADR 0018). Nothing here
 * compares a figure against a target and nothing in the suite asserts one. ADR
 * 0062 names the cost this exacts — the model walk has traded a fast instrument
 * for a slow one — and the answer is still that every number has to be free to
 * fall. **Do not add one later "to be safe".**
 */

import { distinctLocalDays, localDayKey, localDaysBetween, windowStartKey } from '../time/local-day'

/**
 * **Retention's evidence threshold: twenty qualifying reviews** (ADR 0062).
 *
 * ⚠️ **Qualifying, not total.** A reader with two hundred first-ever answers has
 * no retention reading at all, because none of them asked whether anything was
 * retained — and the pair on the screen is what says so.
 */
export const RETENTION_APPEARS_AT = 20

/**
 * **Consistency's: fourteen days to have been consistent over** (ADR 0062).
 *
 * ⚠️ It is a threshold on the **denominator**, not on the numerator. A reader on
 * day three who has studied all three days is at 100% and that is not a finding.
 */
export const CONSISTENCY_APPEARS_AT = 14

/**
 * **Flag rate's, and *time-to-first-review*'s: twenty minted *cards***.
 *
 * ⚠️ **Twenty *cards* is the old boundary in the word that still means
 * something.** `RATIOS_APPEAR_AT` was twenty *vetted notes* — the size of the
 * thing the reader had built — and ADR 0064 took vetting out of the loop
 * without changing what the number was standing in for. This is the same move
 * ADR 0062 makes for flag rate's denominator, applied to the boundary.
 *
 * ⚠️ ***Time-to-first-review* is governed by it too, and the ticket did not say
 * so.** #23 names a threshold for the three figures it redefines and calls this
 * one "carried over untouched"; untouched includes its suppression, which was
 * the corpus-size boundary rather than one of its own. Its `have / possible` is
 * still *sources*, because that is its evidence (ADR 0058) — what is shared is
 * only the gate.
 */
export const CARDS_APPEAR_AT = 20

/**
 * The trailing window both headline numbers are read over — ADR 0062.
 *
 * ⚠️ **The two read it differently, and that is the ADR's split rather than an
 * inconsistency.** Retention is "over a trailing 30 days" — an interval, and the
 * query cuts it as one, because a rate over a rolling 720 hours is a rate.
 * Consistency is "days with at least one grade in the last 30, over 30" —
 * **days**, which have to be local days or the unit is not the one the reader
 * experiences. So retention's cut is in SQL against an instant and consistency's
 * is here against a day key, and a session that "unifies" them has to decide
 * which of ADR 0062's two sentences to discard.
 */
export const WINDOW_DAYS = 30

/**
 * **Retention** — of the *grades* given to a *card* that was already in the
 * Review state, the share that were Good or Easy (ADR 0062).
 *
 * ⚠️ **The filtering is the query's and the division is this function's**
 * (`11` §8: *counts in, a rate out*). What `state = 2` means, and why states 0
 * and 3 are excluded, is on the query.
 *
 * @returns `null` over nothing — **not zero**, which would be a claim that the
 * reader has forgotten everything they have been asked.
 */
export function retention({ recalled, qualifying }: { recalled: number, qualifying: number }): number | null {
  if (qualifying === 0)
    return null

  return recalled / qualifying
}

/**
 * **Consistency** — days with at least one *grade*, over days there were to
 * study (ADR 0062).
 *
 * ⚠️ **Not a streak, and the reason is the whole decision.** A streak is zero
 * the morning after one missed day, which is the exact morning the number is
 * being read, and an app whose job is to survive the reader's Thursday must not
 * punish them for coming back.
 *
 * @returns `null` before the first *grade*. A reader who has never studied is
 * not 0% consistent; there is nothing to be consistent about yet.
 */
export function consistency({ daysStudied, daysPossible }: { daysStudied: number, daysPossible: number }): number | null {
  if (daysPossible === 0)
    return null

  return daysStudied / daysPossible
}

/**
 * **Flag rate** — distinct *cards* flagged, over *cards* minted (ADR 0062).
 *
 * ⚠️ **Distinct *cards*, and that is the one thing this changes from
 * *false-accept rate*.** The old numerator counted rows, which was right when
 * the denominator was acceptances; here it is wrong, because **a share of the
 * deck cannot exceed one**. A second flag on one *card* is the reader finding
 * the same fault twice, not a second bad *card*. The deduplication happens in
 * SQL, where the rows are; this function only divides.
 *
 * ⚠️ **It is therefore bounded by one, where its predecessor deliberately was
 * not** — and nothing clamps it, because a value above one would mean the
 * `count(distinct …)` had been lost and a clamp would hide that.
 */
export function flagRate({ flaggedCards, cardsMinted }: { flaggedCards: number, cardsMinted: number }): number | null {
  if (cardsMinted === 0)
    return null

  return flaggedCards / cardsMinted
}

/**
 * The median of a sample.
 *
 * ⚠️ **An even count takes the mean of the middle two** (`11` §3, named there
 * out loud). Taking either middle element is right half the time and wrong by
 * half a sample the rest, with nothing on the screen to show it.
 *
 * @returns `null` over nothing — **not zero**, which would be a claim that the
 * first *card* was answered the instant the list was pasted.
 */
export function median(samples: number[]): number | null {
  if (samples.length === 0)
    return null

  // ⚠️ Copied before sorting: `Array.prototype.sort` is in place, and these
  // arrays come straight from a query result the caller may read again.
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1)
    return sorted[middle]!

  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * `ingestion.cost_micro_usd` as dollars.
 *
 * ⚠️ **Null in, null out — the cost is read, never estimated** (`11` §3, `04`
 * §6.1, `03` §7). An *ingestion* with tokens and no recorded cost has no cost,
 * and the ledger shows that rather than multiplying by a constant: ADR 0018's
 * price table is configuration with an effective date, and a hard-coded copy of
 * it starts lying the day the provider changes a price.
 */
export function costUsd(microUsd: bigint | null): number | null {
  if (microUsd === null)
    return null

  return Number(microUsd) / 1_000_000
}

/**
 * A duration, in the units `CONTEXT.md` states the criterion in: *minutes from
 * submitting a source to answering the first card generated from it*.
 *
 * ⚠️ `<1m` rather than `0m`. A zero where a real duration was measured reads as
 * a broken figure rather than a fast one.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60)
    return '<1m'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)
    return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 48)
    return `${hours}h ${minutes % 60}m`

  return `${Math.floor(hours / 24)}d`
}

/**
 * The rows every figure is read from — one query module's whole output.
 *
 * ⚠️ Each field is a count or a sample, never a rate: *where these come from* is
 * `server/utils/stats/queries.ts` and *what they mean* is here, and the split is
 * `11` §8's "the seam is counts in, a rate out".
 */
export interface StatsRows {
  /** `review_log` over the trailing window, ⚠️ **state 2 only** (ADR 0062). */
  retention: { recalled: number, qualifying: number }
  /**
   * The distinct minutes the reader graded in, over the trailing window.
   *
   * ⚠️ **Instants rather than days, because the zone is not the database's.**
   * The bucketing is `shared/time/local-day.ts`'s, and it is truncated to the
   * minute in SQL only to keep a long month's rows down — every real day
   * boundary falls on a whole minute, so nothing can cross one.
   *
   * ⚠️ **`reviewed_at`, not `received_at`** — see the query.
   */
  gradeMinutes: Date[]
  /** The reader's first *grade* ever, or `null`. Consistency's denominator. */
  firstGradeAt: Date | null
  /** ⚠️ `count(distinct card_id)` over `card_flag` — ADR 0062. */
  flaggedCards: number
  /** Every *card* the reader owns, suspended ones included. */
  cardsMinted: number
  /** Seconds, one per *source* that has a first *review* — ADR 0057. */
  timeToFirstReview: number[]
  /** Every *source* ingested, including soft-deleted ones (`S11`). */
  sourcesIngested: number
  /** Distinct `ingestion.worker_environment` behind the durations — `03` §12. */
  workerEnvironments: string[]
}

/**
 * One figure, and the evidence standing behind it.
 *
 * ⚠️ **`have` and `possible` are not debug output — they are what the screen
 * renders below the boundary** (ADR 0058). `10` §8.2: the ratio columns keep
 * their eyebrows and their 38px slot and "show their raw pair instead of a
 * percentage", so the reader can watch the numbers accumulate toward the
 * threshold.
 *
 * ⚠️ **`suppressed` moved onto the figure with #23, and ADR 0058's argument
 * survives the move intact.** It was one flag on the whole view while all four
 * ratios shared one boundary; ADR 0062 gives each its own, so a screen-wide
 * boolean would have to be four. What ADR 0058 actually refused was
 * *suppressing by not computing* — `value` is filled here whether or not it will
 * be shown, which is what keeps the boundary observable at the one seam `11` §3
 * asks for it to be tested at nineteen **and** twenty.
 * `app/components/StatsFigures.vue` is still the only file that **reads** it.
 */
export interface Figure {
  /** `null` where there is nothing to compute it from. **Never zero.** */
  value: number | null
  /** How much evidence there is. */
  have: number
  /** How much there could have been. */
  possible: number
  /** ⚠️ Computed, never a reason not to compute `value`. */
  suppressed: boolean
}

/** The whole screen, as numbers — `10` §8.1 and §8.2. */
export interface StatsView {
  /** The one figure no boundary withholds — a raw count (`10` §8.1). */
  cardsMinted: number
  retention: Figure
  consistency: Figure
  flagRate: Figure
  /** Seconds; the median across *sources* (ADR 0057). */
  timeToFirstReview: Figure
  /** ⚠️ Rendered **on** *time-to-first-review*, not in a paragraph (`03` §12). */
  workerEnvironments: string[]
}

/** What the arithmetic needs that is not a row: the clock and the reader's zone. */
export interface StatsContext {
  /** ⚠️ The request instant. `09` §2 stamps every figure "as of this page load". */
  now: Date
  /**
   * ⚠️ **Already resolved** — `resolveZone` is the door, and it is the caller's
   * to walk through, because a zone that fell back is a fact about the request
   * rather than about the arithmetic.
   */
  zone: string
}

/**
 * The figures.
 *
 * ⚠️ **Every ratio is computed whether or not it will be shown.** Suppression is
 * a fact about what is rendered, not about the arithmetic — computing them only
 * above the boundary would make the boundary unobservable from this seam, which
 * is the one place `11` §3 asks for it to be tested at both nineteen and twenty
 * (ADR 0058).
 */
export function summarise(rows: StatsRows, { now, zone }: StatsContext): StatsView {
  // ⚠️ The window is counted in **local days**, so the last of thirty is a day
  // and not a rolling 720 hours. The query hands over a slightly wider set of
  // instants than the window needs and the trimming happens here, because only
  // this side knows the zone.
  //
  // ⚠️ **Both ends, and the far end is not symmetry.** `reviewed_at` is the
  // *client's* stamp and `03` §8.2 accepts it up to two minutes ahead of the
  // server (ADR 0054), so a *grade* given seconds before the cutoff on a
  // slightly fast laptop buckets into **tomorrow** — a day `daysPossible` does
  // not contain, and consistency reads 15/14. Dropping it is the window doing
  // its job at the end it was missing, not a clamp: a clamp would hide the same
  // arithmetic going wrong for a different reason.
  const earliest = windowStartKey(now, zone, WINDOW_DAYS)
  const latest = localDayKey(now, zone)
  const daysStudied = [...distinctLocalDays(rows.gradeMinutes, zone)]
    .filter(key => key >= earliest && key <= latest)
    .length

  const daysPossible = rows.firstGradeAt === null
    ? 0
    : localDaysBetween(rows.firstGradeAt, now, zone, WINDOW_DAYS)

  return {
    cardsMinted: rows.cardsMinted,

    retention: {
      value: retention(rows.retention),
      have: rows.retention.recalled,
      possible: rows.retention.qualifying,
      suppressed: rows.retention.qualifying < RETENTION_APPEARS_AT,
    },

    consistency: {
      value: consistency({ daysStudied, daysPossible }),
      have: daysStudied,
      possible: daysPossible,
      // ⚠️ On the **denominator**: there have to have been fourteen days to have
      // been consistent over before the share of them means anything.
      suppressed: daysPossible < CONSISTENCY_APPEARS_AT,
    },

    flagRate: {
      value: flagRate({ flaggedCards: rows.flaggedCards, cardsMinted: rows.cardsMinted }),
      have: rows.flaggedCards,
      possible: rows.cardsMinted,
      suppressed: rows.cardsMinted < CARDS_APPEAR_AT,
    },

    timeToFirstReview: {
      value: median(rows.timeToFirstReview),
      have: rows.timeToFirstReview.length,
      // ⚠️ ADR 0057: a *source* nobody has studied has no duration and is
      // excluded from the median rather than counted as a long one. The pair is
      // what keeps that exclusion visible instead of flattering.
      possible: rows.sourcesIngested,
      // ⚠️ Gated on *cards*, not on its own pair — see `CARDS_APPEAR_AT`.
      suppressed: rows.cardsMinted < CARDS_APPEAR_AT,
    },

    workerEnvironments: rows.workerEnvironments,
  }
}
