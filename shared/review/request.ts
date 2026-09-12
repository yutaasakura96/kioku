/**
 * What `POST /api/review/session` and `POST /api/review/grade` will accept.
 *
 * ⚠️ **A *mode* has a client, and the client is a file anybody can read**
 * (`03` §2.3): a typed column validates nothing at runtime, so every value that
 * reaches a query is checked here first. The same rule that governs
 * `shared/vet/decision.ts`, on the screen where a bad value would write to the
 * one table that cannot be rewritten.
 *
 * ⚠️ **This is a parser, not `03` §8.2's grade validator.** The rules for a
 * stamp the server *cannot trust* — rejecting a *grade* stamped in the future
 * beyond a small skew allowance, and one stamped before its own
 * `snapshot_taken_at` — are their own pure seam and they are **#13's**, where
 * the outbox makes a stamp travel far enough from its keystroke to be wrong.
 * What is here is the difference between a request and a shape: a `reviewed_at`
 * that is not a date at all cannot reach a `timestamptz`.
 */

import { clampSessionSize } from './compose'
import { isUuid } from '../utils/uuid'
import type { Grade } from './scheduler'

/**
 * What both answer endpoints report back — ⚠️ **one union, because the outbox
 * sends both entry types through one loop** and a sixth value edited into only
 * one of the two places it is written is `04` §13's drift argument at five
 * string literals.
 */
export type AnswerOutcome
  = | 'ok'
    | 'not_in_session'
    | 'already_graded'
    | 'already_flagged'
    | 'stamped_in_future'
    | 'stamped_before_snapshot'

/**
 * ⚠️ **Which outcomes mean *this entry will never land*.**
 *
 * ADR 0039 property 5 splits the stream's failures in two, and the split is not
 * about status codes: an entry the network could not carry is **held and tried
 * again**, and an entry the server has decided about is **taken out and shown**
 * (`03` §8.2). `not_in_session` and the two `already_` values are the third
 * case — the durable record has already answered, and retrying either forever
 * would be the client's memory arguing with the database.
 */
export function isRefused(outcome: AnswerOutcome): boolean {
  return outcome === 'stamped_in_future' || outcome === 'stamped_before_snapshot'
}

export interface GradeBody {
  sessionId: string
  cardId: string
  grade: Grade
  reviewedAt: Date
}

export type GradeErrorCode
  = | 'not_an_object'
    | 'bad_session_id'
    | 'bad_card_id'
    | 'bad_grade'
    | 'bad_reviewed_at'

export type GradeParseResult
  = | { ok: true, grade: GradeBody }
    | { ok: false, code: GradeErrorCode }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseGrade(body: unknown): GradeParseResult {
  if (!isRecord(body))
    return { ok: false, code: 'not_an_object' }

  const { sessionId, cardId, grade, reviewedAt } = body

  if (!isUuid(sessionId))
    return { ok: false, code: 'bad_session_id' }

  if (!isUuid(cardId))
    return { ok: false, code: 'bad_card_id' }

  // ⚠️ **`Manual = 0` is excluded and `5` has never been a rating**
  // (verification §1.1), which is also `04` §7.5's `CHECK (rating BETWEEN 1 AND
  // 4)`. A rating outside the four is not a *grade* the scheduler has arithmetic
  // for — `ts-fsrs` itself throws on one — so it is refused before it is a row.
  if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4)
    return { ok: false, code: 'bad_grade' }

  // ⚠️ **An absent stamp is not defaulted to `now()`.** `03` §8.1: the server
  // never stamps a *grade* on receipt, and a *grade* silently stamped here would
  // be the exact failure ADR 0007 exists to prevent — a *card* answered
  // underground at 09:00 telling the scheduler that recall took nine hours —
  // arriving as a success.
  if (typeof reviewedAt !== 'string')
    return { ok: false, code: 'bad_reviewed_at' }

  const stamped = new Date(reviewedAt)

  if (Number.isNaN(stamped.getTime()))
    return { ok: false, code: 'bad_reviewed_at' }

  return { ok: true, grade: { sessionId, cardId, grade, reviewedAt: stamped } }
}

export interface FlagBody {
  sessionId: string
  cardId: string
}

export type FlagErrorCode = 'not_an_object' | 'bad_session_id' | 'bad_card_id'

export type FlagParseResult
  = | { ok: true, flag: FlagBody }
    | { ok: false, code: FlagErrorCode }

/**
 * `S9`'s `X` — ⚠️ **and it carries no stamp**, which is the visible difference
 * between the outbox's two entry types.
 *
 * `card_flag.flagged_at` defaults to `now()` (`04` §7.8) and nothing computes
 * anything from it, so a flag replayed an hour after a tunnel is a flag. A
 * *grade* is the opposite case and the reason ADR 0007 exists: the moment it was
 * given is arithmetic, and the server cannot reconstruct it.
 */
export function parseFlag(body: unknown): FlagParseResult {
  if (!isRecord(body))
    return { ok: false, code: 'not_an_object' }

  if (!isUuid(body.sessionId))
    return { ok: false, code: 'bad_session_id' }

  if (!isUuid(body.cardId))
    return { ok: false, code: 'bad_card_id' }

  return { ok: true, flag: { sessionId: body.sessionId, cardId: body.cardId } }
}

/**
 * The *session*-size knob (`10` §5.8, `09` §4.7).
 *
 * ⚠️ **Bounded 1–200, enforced on the client and again here.** The clamp is
 * `clampSessionSize` rather than a second copy of the bounds, and a request with
 * no size at all is the default twenty — which is the first-ever *session*, the
 * one the knob has nowhere to live before.
 */
export function parseSessionSize(body: unknown): number {
  return clampSessionSize(isRecord(body) ? body.size : undefined)
}
