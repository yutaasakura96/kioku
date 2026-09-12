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
  /**
   * ⚠️ **`S9`'s `X`, which advances without a *grade*** (`09` §4.9, `04` §7.8).
   * A flagged position is **passed but not answered**, so it is neither a
   * *grade* nor a position the reader still owes — which is why it is a second
   * field rather than a fifth value in `grade`, and why `10` §5.3 gives the rail
   * a fourth mark for it.
   */
  flagged: boolean
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
 * ⚠️ **Amended by #13: a flag moves too, and the name did not change.** `S9`'s
 * `X` is a second kind of answer (`09` §4.9) and it belongs on the same side of
 * the rule as a *grade* — what the sentence refuses is the **words**, and
 * § Carrying, `test/unit/review-snapshot.test.ts` and this comment all name this
 * function, so renaming it would cost three referents to gain one word.
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
  const answered = new Map(fresh.positions.map(position => [position.cardId, position]))

  return {
    ...held,
    positions: held.positions.map((position) => {
      const server = answered.get(position.cardId)

      return {
        ...position,
        grade: position.grade ?? server?.grade ?? null,
        flagged: position.flagged || (server?.flagged ?? false),
      }
    }),
  }
}

/**
 * ⚠️ **A position is answered by a *grade* **or** by a flag**, and this is the
 * one definition of that.
 *
 * `09` §4.9: `X` advances without a *grade*, so a twenty-*card* run can end with
 * nineteen answers. Three things read *is there anything left* — the screen
 * deciding which *card* is current, the *grade* deciding whether the run is
 * over, and `resumeOrCompose` deciding whether to resume one — and each of them
 * written separately is `04` §13's drift argument at one boolean: the shape that
 * fails is a run whose last position is flagged, which never completes and
 * resumes forever onto a *card* the reader has already passed.
 */
export function isAnswered(position: ReviewPosition): boolean {
  return position.grade !== null || position.flagged
}

/** Whether the run still owes the reader a position (`09` §4.7 step 6). */
export function isFinished(snapshot: ReviewSnapshot): boolean {
  return snapshot.positions.every(isAnswered)
}

/**
 * The snapshot read back out of `localStorage` (ADR 0014).
 *
 * ⚠️ **`snapshotTakenAt` comes back as a `Date` and the fields come back as they
 * were stored**, which is the whole of this function's care: `09` §4.7 step 2
 * resumes from the store, and a resume that re-read `note.fields` from the
 * database would be PRD §5's *a note edited mid-session shows the old text*
 * failing through the mechanism added to make the run survive a reload. What is
 * stored is what the reader was handed.
 *
 * @returns `null` for anything that is not a snapshot — a half-written value, a
 * store from an older shape, a reader who edited it.
 */
export function parseSnapshot(raw: unknown): ReviewSnapshot | null {
  if (!isRecord(raw))
    return null

  const { sessionId, size, snapshotTakenAt, positions } = raw

  if (typeof sessionId !== 'string' || typeof size !== 'number' || !Array.isArray(positions))
    return null

  const takenAt = new Date(typeof snapshotTakenAt === 'string' ? snapshotTakenAt : Number.NaN)

  if (Number.isNaN(takenAt.getTime()))
    return null

  const parsed: ReviewPosition[] = []

  for (const position of positions) {
    const one = parsePosition(position)

    // ⚠️ **A run with a hole in it is not a shorter run.** The rail's length is
    // `review_session.size` and its positions are ordinals, so one dropped
    // member would renumber the rest — the whole snapshot is refused and the
    // server composes or resumes instead.
    if (!one)
      return null

    parsed.push(one)
  }

  return { sessionId, size, snapshotTakenAt: takenAt, positions: parsed }
}

function parsePosition(raw: unknown): ReviewPosition | null {
  if (!isRecord(raw))
    return null

  const { ordinal, cardId, templateKey, fields, grade, flagged } = raw

  if (typeof ordinal !== 'number' || typeof cardId !== 'string' || typeof templateKey !== 'string')
    return null

  if (!isRecord(fields))
    return null

  if (grade !== null && grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4)
    return null

  return {
    ordinal,
    cardId,
    templateKey,
    fields: fields as Record<string, string>,
    grade,
    flagged: flagged === true,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
