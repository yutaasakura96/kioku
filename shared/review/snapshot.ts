/**
 * The *session* snapshot — the shape that crosses the wire, and the one rule
 * about how a later answer may touch it.
 *
 * ⚠️ **The snapshot wins** (PRD §5, `S8`): a *note* edited while its *card* is
 * in the current *session* shows the old text, and the next *session* picks up
 * the change. The whole run is prefetched as a unit at step 3 (`09` §4.7) and
 * **the fields the reader is handed there are the fields they finish the run
 * with**.
 *
 * ⚠️ **That is not free, and `mergeGrades` is where it is paid.** Every *grade*
 * is answered with a fresh snapshot so the client's counts cannot drift from the
 * database — and `snapshotOf` reads `note.fields` **live**, because `04` §7.7
 * snapshots membership and nothing else. Installing that answer wholesale would
 * quietly re-read the text mid-run: the *card* in front of the reader would
 * change under them, and the rule would hold only as long as nothing could edit
 * a *note*. **So an answer moves the *grades* and never the words.**
 *
 * ⚠️ **Today it is unreachable, and that is the reason to build it rather than
 * not.** An *accepted* *note*'s fields are frozen against every writer
 * (ADR 0052) and a *card* exists only for an accepted *note*, so nothing can
 * edit one mid-*session* — the freeze is doing the work the prefetch is supposed
 * to do. `S9`'s re-vetting path is where lifting that freeze gets argued (#13),
 * and on the day it is lifted this rule has to be already true.
 */

import type { Grade } from './scheduler'

/** One position in the *session*, and one tick on the *progress rail*. */
export interface ReviewPosition {
  /** 0-based, and the rail's order (`04` §7.7). */
  ordinal: number
  cardId: string
  /** Key into the *subject* declaration — **not** a foreign key (`04` §13). */
  templateKey: string
  /** `note.fields` as they stood when the *session* was composed. */
  fields: Record<string, string>
  /**
   * The *grade* this position was given, or `null` while it is still ahead of
   * the reader. ⚠️ **A graded *card* leaves the *session* and never returns to
   * it** (`S7`, ADR 0016), so this is what the rail's graded tick reads and what
   * the end screen counts.
   */
  grade: Grade | null
}

export interface ReviewSnapshot {
  sessionId: string
  /** `review_session.size` — and therefore the rail's length (`04` §14). */
  size: number
  /** ⚠️ **Server-side**, because `03` §8.2's replay rule compares against it. */
  snapshotTakenAt: Date
  positions: ReviewPosition[]
}

/** What `10` §5.7's two non-terminal empty states need to tell the reader apart. */
export interface NothingToStudy {
  /** False means *nothing ever accepted*; true means *nothing due* (`10` §5.7). */
  hasCards: boolean
  /** The "single datum given weight" slot — `Tomorrow, 08:40`. Null when there is none. */
  nextDue: Date | null
}

/**
 * A fresh answer folded into the snapshot the reader is holding: **the *grades*
 * move, the words do not.**
 *
 * ⚠️ **A position the held snapshot does not have is ignored rather than
 * added.** Membership is decided once, at compose (`04` §7.7), so a server
 * answer carrying a *card* this run never had is a different *session* — and
 * appending it would lengthen the *progress rail* mid-run, which is the one
 * thing ADR 0016 turned short-term scheduling off to prevent.
 *
 * ⚠️ **A *grade* is never taken back.** The client paints on the keystroke and
 * the answer arrives after, so a snapshot that has not yet been told about the
 * last *grade* must not un-grade the position the reader has already left.
 */
export function mergeGrades(held: ReviewSnapshot, fresh: ReviewSnapshot): ReviewSnapshot {
  const graded = new Map(fresh.positions.map(position => [position.cardId, position.grade]))

  return {
    ...held,
    positions: held.positions.map(position => ({
      ...position,
      grade: position.grade ?? graded.get(position.cardId) ?? null,
    })),
  }
}
