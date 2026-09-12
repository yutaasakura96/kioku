/**
 * `S10`'s six figures, as arithmetic over counts — `11` §3 and §8.
 *
 * ⚠️ **This is the other half of the seam `shared/metrics/acceptance.ts` opened.**
 * #11 took *acceptance rate* because it was #11's own acceptance criterion and
 * left a note saying the remaining three numbers and **the suppression boundary**
 * are Stats'. They are here, and *acceptance rate* is **imported rather than
 * re-derived** — § Carrying names re-deriving it in SQL as the failure that
 * "looks entirely reasonable in a diff", and re-deriving it in a second TypeScript
 * module would be the same mistake with a shorter fuse.
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
 * 0018 walks the model *down* until *acceptance rate* degrades, so every number
 * has to be free to fall; a test that reddens when it does turns the experiment
 * into a regression. **Do not add one later "to be safe".**
 */

import type { VettingCounts } from './acceptance'
import { acceptanceRate, notesGenerated } from './acceptance'

/**
 * `S10`, PRD §4, `11` §3 — **nineteen suppresses, twenty reports.**
 *
 * ⚠️ It counts ***vetted*** *notes*, not generated ones: a hundred *pending
 * notes* and nineteen decisions is still suppressed, because what is thin is the
 * evidence rather than the corpus.
 */
export const RATIOS_APPEAR_AT = 20

/** Every *note* the reader has decided — accepted either way, or rejected. */
export function notesVetted(counts: VettingCounts): number {
  return counts.acceptedUnedited + counts.acceptedWithEdit + counts.rejected
}

/**
 * Every accepted *note* — **the denominator of *false-accept rate***.
 *
 * ⚠️ **An edited accept is in it.** `S6`'s split belongs to *acceptance rate*,
 * which asks whether the pipeline wrote *notes* worth keeping as they came.
 * *False-accept rate* asks whether *vetting* has become theatre, and a *note*
 * the reader fixed and then accepted is a *note* they vouched for.
 */
export function acceptedNotes(counts: VettingCounts): number {
  return counts.acceptedUnedited + counts.acceptedWithEdit
}

/** `S10`'s only branch — the one thing on the screen that is an `if`. */
export function ratiosSuppressed(counts: VettingCounts): boolean {
  return notesVetted(counts) < RATIOS_APPEAR_AT
}

/**
 * The median of a sample.
 *
 * ⚠️ **An even count takes the mean of the middle two** (`11` §3, named there
 * out loud). Taking either middle element is right half the time and wrong by
 * half a sample the rest, with nothing on the screen to show it.
 *
 * @returns `null` over nothing — **not zero**, which would be a claim that the
 * reader is vetting instantly.
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
 * *False-accept rate* — `count(card_flag) ÷ count(note_vetting WHERE
 * state='accepted')` (`04` §7.8).
 *
 * ⚠️ **It is not bounded by one and must not be clamped.** A second flag on the
 * same *card* is a second row (`11` §3), so a corpus the reader keeps finding
 * faults in reads above 100% — which is exactly the corpus `S9` exists to
 * report. A clamp would hide it.
 *
 * ⚠️ **A flagged *note* stays `accepted`** (ADR 0056), which is what keeps this
 * denominator from moving every time the numerator does.
 */
export function falseAcceptRate({ flags, accepted }: { flags: number, accepted: number }): number | null {
  if (accepted === 0)
    return null

  return flags / accepted
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
 * ⚠️ `<1m` rather than `0m`. The number this renders is the one the thesis turns
 * on — "above roughly ten minutes, Kioku is a different chore" — and a zero
 * where a real duration was measured reads as a broken figure rather than a fast
 * one.
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
  /** `note_vetting`, in four buckets — the shape `acceptance.ts` declares. */
  vetting: VettingCounts
  /** `note_vetting.seconds_to_vet`, ⚠️ **unedited accepts only** (`11` §3). */
  secondsPerNote: number[]
  /** `count(card_flag)` — ⚠️ a second flag on the same *card* is a second row. */
  flags: number
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
 * percentage", so the reader can watch the numbers accumulate toward twenty.
 */
export interface Figure {
  /** `null` where there is nothing to compute it from. **Never zero.** */
  value: number | null
  /** How much evidence there is. */
  have: number
  /** How much there could have been. */
  possible: number
}

/** The whole screen, as numbers — `10` §8.1 and §8.2. */
export interface StatsView {
  /** ⚠️ `S10`'s only branch: nineteen suppresses, twenty reports. */
  suppressed: boolean
  /** The one figure the boundary never withholds — a raw count (`10` §8.1). */
  notesVetted: number
  acceptance: Figure
  falseAccept: Figure
  /** Seconds; the median. */
  secondsPerNote: Figure
  /** Seconds; the median across *sources* (ADR 0057). */
  timeToFirstReview: Figure
  /** ⚠️ Rendered **on** *time-to-first-review*, not in a paragraph (`03` §12). */
  workerEnvironments: string[]
}

/**
 * The six figures.
 *
 * ⚠️ **Every ratio is computed whether or not it will be shown.** Suppression is
 * a fact about the screen, not about the arithmetic — computing them only above
 * the boundary would make the boundary unobservable from this seam, which is the
 * one place `11` §3 asks for it to be tested at both nineteen and twenty.
 */
export function summarise(rows: StatsRows): StatsView {
  const { vetting } = rows
  const accepted = acceptedNotes(vetting)

  return {
    suppressed: ratiosSuppressed(vetting),
    notesVetted: notesVetted(vetting),

    // ⚠️ **Imported, not re-derived.** § Carrying: the counts are #14's, the
    // rate is #11's, and a `COUNT(*) FILTER (WHERE state = 'accepted')` written
    // straight into a query here is the failure it names.
    acceptance: {
      value: acceptanceRate(vetting),
      have: vetting.acceptedUnedited,
      possible: notesGenerated(vetting),
    },

    falseAccept: {
      value: falseAcceptRate({ flags: rows.flags, accepted }),
      have: rows.flags,
      possible: accepted,
    },

    secondsPerNote: {
      value: median(rows.secondsPerNote),
      have: rows.secondsPerNote.length,
      // ⚠️ The stamp is owed by every unedited accept, so this pair reads as
      // *how many of them carry one* — a median over three of twenty is thin,
      // and the pair is the only thing that would say so.
      possible: vetting.acceptedUnedited,
    },

    timeToFirstReview: {
      value: median(rows.timeToFirstReview),
      have: rows.timeToFirstReview.length,
      // ⚠️ ADR 0057: a *source* nobody has studied has no duration and is
      // excluded from the median rather than counted as a long one. The pair is
      // what keeps that exclusion visible instead of flattering.
      possible: rows.sourcesIngested,
    },

    workerEnvironments: rows.workerEnvironments,
  }
}
