/**
 * What a run is made of — `11` §8's seam for `S7`, and since ADR 0076 §1 two
 * functions, because a *session* is a review run or a lesson and never both.
 *
 * ⚠️ **Queue ordering, new-word introduction and daily caps are the app's job
 * and explicitly not the scheduler's** (`03` §8, verification §1.4). `ts-fsrs`
 * answers one question — given a memory state and a *grade*, when does this
 * come back — and everything about *what to study now* is here. That is why
 * these are pure functions over lists rather than an `ORDER BY` with a `LIMIT`:
 * a wrong order in SQL reads as a fixture problem in the schema tier.
 *
 * ⚠️ **The brake's arithmetic is `shared/review/brake.ts`'s**, and what it
 * allows arrives here as a number (`room`). ⚠️ **This file said *due first, new
 * cards filling the remainder* until #70**: a new word now reaches the reader
 * only through a lesson, which teaches it first.
 */

/** `04` §7.6's default, and the only knob in v1 (ADR 0016, `09` §4.7). */
export const DEFAULT_SESSION_SIZE = 20

/** `04` §7.6's `CHECK` — enforced on the client, and again on the server (`10` §5.8). */
export const MIN_SESSION_SIZE = 1
export const MAX_SESSION_SIZE = 200

/**
 * ⚠️ **ADR 0066 §5's ceiling on the due read.** Enough that the fifty-*card*
 * gate is exact and a real backlog is ordered by retrievability whole, and small
 * enough that a pathological one cannot pull the table into memory.
 */
export const DUE_READ_CEILING = 2000

/** A *card* with a live *scheduling epoch* whose `due` has passed. */
export interface DueCard {
  cardId: string
  due: Date
  /**
   * The probability the reader still remembers it, now — `ts-fsrs`'s
   * `get_retrievability`, computed by the caller through the wrapper
   * (`shared/review/scheduler.ts`) so that this function stays pure.
   */
  retrievability: number
}

/**
 * A *card* with no *scheduling epoch* at all — minted by an acceptance and never
 * yet scheduled. ⚠️ **The first epoch belongs to the *session* that first
 * schedules the *card*** and not to acceptance: `scheduling_epoch.card_id` is
 * `RESTRICT` (`04` §9), so an epoch minted at acceptance would make ADR 0033's
 * `Z` fail on every acceptance the application ever makes.
 */
export interface NewCard {
  cardId: string
  /** `card.created_at` — the order they were accepted in. */
  mintedAt: Date
}

/**
 * A review run's membership, in the order the reader meets it: **due *cards*
 * and nothing else** (ADR 0076 §1).
 *
 * ⚠️ **Least likely to be remembered first — but only when that is a choice**
 * (ADR 0066 §5). When the due set fits in the *session* everything due is
 * studied and the order is `due` ascending. When it does not, the run is the
 * `size` *cards* with the lowest retrievability: a *card* with 200 days of
 * stability three weeks late is better remembered than a shaky one due
 * yesterday, and FSRS can say so exactly. `due` stays the tie-break.
 *
 * ⚠️ **A *card* appears once** (`04` §7.7's `UNIQUE (review_session_id,
 * card_id)`). The dedup guards a query that changes rather than a case that
 * exists today; the constraint it keeps ahead of would otherwise fail the whole
 * compose with a unique violation.
 */
export function composeReview(due: DueCard[], size: number): string[] {
  if (size <= 0)
    return []

  const owed = [...due].sort(due.length > size ? byRetrievabilityThenDue : byDueThenId)

  return distinct(owed.map(card => card.cardId)).slice(0, size)
}

/** What a lesson is made of: *cards* that exist, then *notes* still to start. */
export interface LessonPlan {
  /** The reader's own never-scheduled *cards*, oldest first. */
  cardIds: string[]
  /** Starter *notes* to accept and mint, in the order they were offered. */
  noteIds: string[]
}

/**
 * A lesson's words (ADR 0076 §1): the reader's own unscheduled *cards* first,
 * oldest first, and then words they have not started, in the order given.
 *
 * `room` is what the brake allows this lesson (`lessonRoom`) — the lesson size,
 * or what is left of the day, or nothing. ⚠️ **A word the reader brought is
 * ahead of the starter set** because they asked for it; it is taught like any
 * other, and it spends the day the same way.
 */
export function composeLesson(own: NewCard[], unstarted: string[], room: number): LessonPlan {
  const limit = Math.max(0, Math.floor(room))
  const cardIds = distinct([...own].sort(byMintedThenId).map(card => card.cardId)).slice(0, limit)

  return { cardIds, noteIds: distinct(unstarted).slice(0, limit - cardIds.length) }
}

function distinct(ids: string[]): string[] {
  return [...new Set(ids)]
}

/**
 * The knob's two bounds, in one place because `10` §5.8 puts them in two homes
 * on three screens and the server has to agree with all of them.
 *
 * ⚠️ **Out of range clamps rather than refusing.** `10` §5.8: the field shows
 * the clamped value and an aside names the bound — a *session* that refused to
 * start because a number was too large would be the knob taking the reader's
 * run away over a typo.
 */
export function clampSessionSize(value: unknown): number {
  // ⚠️ `Number(null)` is `0` and `Number('')` is `0`, so a bare `Number(value)`
  // would turn *nothing was sent* into the smallest legal *session* — a
  // one-*card* run rather than the default. Only a number and a non-blank
  // string are values here.
  if (typeof value === 'number')
    return bounded(value)

  if (typeof value === 'string' && value.trim() !== '')
    return bounded(Number(value))

  return DEFAULT_SESSION_SIZE
}

function bounded(size: number): number {
  if (!Number.isFinite(size))
    return DEFAULT_SESSION_SIZE

  return Math.min(MAX_SESSION_SIZE, Math.max(MIN_SESSION_SIZE, Math.floor(size)))
}

/** ⚠️ The id tie-break is not decoration: two *cards* due at the same instant
 *  are ordinary — a *session* composed twice must not answer differently. */
function byDueThenId(a: DueCard, b: DueCard): number {
  return a.due.getTime() - b.due.getTime() || compareIds(a.cardId, b.cardId)
}

function byRetrievabilityThenDue(a: DueCard, b: DueCard): number {
  return a.retrievability - b.retrievability || byDueThenId(a, b)
}

function byMintedThenId(a: NewCard, b: NewCard): number {
  return a.mintedAt.getTime() - b.mintedAt.getTime() || compareIds(a.cardId, b.cardId)
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
