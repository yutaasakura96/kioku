/**
 * `03` §8.2's *grade* validator — **what the server does with a stamp it cannot
 * trust**, as a pure function (`11` §8's named seam).
 *
 * ADR 0007 decided *that* the client stamps the *grade*, and it had to: FSRS
 * schedules on elapsed time, so a *card* answered at 09:00 underground and
 * flushed at 18:00 would otherwise tell the scheduler that recall took nine
 * hours. ⚠️ **What that buys is a number the server cannot check against its own
 * clock**, and `review_log` is the one table in the system that cannot be
 * rewritten (ADR 0011) — so a laptop back from another timezone writes history
 * FSRS cannot be told to ignore.
 *
 * The two rules, and they are the whole of `03` §8.2: **a stamp beyond a small
 * skew into the future is refused, and so is one from before the *session*'s own
 * snapshot was taken.** Everything between them is accepted as given, which is
 * the entire point of stamping it client-side.
 *
 * ⚠️ **A refusal is surfaced, never dropped** (ADR 0039 property 5). It is one
 * of the few failures the reader can actually fix, and the alternative — a
 * *grade* that quietly did not happen — is the failure `S8` exists to prevent
 * arriving as a success.
 */

/**
 * ⚠️ **Two minutes, and the number is a decision rather than a default**
 * ([ADR 0054](../../docs/adr/0054-the-skew-allowance-is-two-minutes-and-it-covers-both-of-8-2-s-rules.md)).
 * An NTP-synced clock is within milliseconds and an unsynced laptop drifts
 * minutes over weeks, so two minutes absorbs every clock that is merely
 * imprecise and refuses every clock that is wrong — and refusing a wrong clock
 * **is** the feature.
 */
export const SKEW_ALLOWANCE_SECONDS = 120

const ALLOWANCE_MS = SKEW_ALLOWANCE_SECONDS * 1000

export type StampRefusal = 'stamped_in_future' | 'stamped_before_snapshot'

export interface StampContext {
  /** `review_session.snapshot_taken_at` — ⚠️ **a server value** (`04` §7.6). */
  snapshotTakenAt: Date
  /** The server's clock at replay, which is `review_log.received_at`. */
  receivedAt: Date
}

/**
 * @returns the reason to refuse, or `null` for a stamp to record as given.
 *
 * ⚠️ **The allowance applies to both rules, and that is the finding rather than
 * a symmetry.** `03` §8.2 names a skew allowance only for the future rule, but
 * both comparisons put a **client** stamp against a **server** one — a reader
 * three seconds slow answers the first *card* of a run at an instant that is
 * genuinely before `snapshot_taken_at`. A strict before-snapshot rule would
 * refuse the opening *grade* of every *session* on a slightly slow clock, which
 * is the rule catching the thing it was written to tolerate.
 */
export function checkStamp(reviewedAt: Date, context: StampContext): StampRefusal | null {
  const stamped = reviewedAt.getTime()

  if (stamped > context.receivedAt.getTime() + ALLOWANCE_MS)
    return 'stamped_in_future'

  if (stamped < context.snapshotTakenAt.getTime() - ALLOWANCE_MS)
    return 'stamped_before_snapshot'

  return null
}
