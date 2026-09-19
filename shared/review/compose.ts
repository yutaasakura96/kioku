/**
 * `compose(due, fresh, size, allowance) → the run` — the first of #12's two
 * seams (`11` §8, `S7`), and since #21 the place the brake is (ADR 0066).
 *
 * ⚠️ **Queue ordering, new-*card* introduction and daily caps are the app's
 * job and explicitly not the scheduler's** (`03` §8, verification §1.4).
 * `ts-fsrs` answers one question — given a memory state and a *grade*, when does
 * this come back — and everything about *what to study now* is here. That is why
 * this is a pure function over two lists rather than an `ORDER BY` with a
 * `LIMIT`: a wrong order in SQL reads as a fixture problem in the schema tier,
 * and this is the rule `S7` actually states.
 *
 * ⚠️ **The ordering lives here and not in the query**, deliberately. The due
 * read sorts by `due` too — it has a 2,000-row ceiling and an unordered ceiling
 * picks rows at random — but the order the *session* is composed in is decided
 * here, where the rule is readable and testable. **The brake is arithmetic
 * inside this function and not a thing the client checks** (ADR 0066): the
 * *session* is still composed once and prefetched as a unit.
 */

/** `04` §7.6's default, and the only knob in v1 (ADR 0016, `09` §4.7). */
export const DEFAULT_SESSION_SIZE = 20

/** `04` §7.6's `CHECK` — enforced on the client, and again on the server (`10` §5.8). */
export const MIN_SESSION_SIZE = 1
export const MAX_SESSION_SIZE = 200

/**
 * ⚠️ **ADR 0066 §1: a constant and not a knob.** A knob here is a knob for the
 * version of the reader who is feeling keen, and the pile-up is built by that
 * reader for the one who shows up on Thursday. Counted at composition, over the
 * reader's local day (`shared/review/brake.ts`).
 */
export const DAILY_NEW_CARDS = 10

/**
 * ⚠️ **ADR 0066 §2: the circuit breaker, and also not a knob.** At this many due
 * *cards* or more, no new *card* is composed at all, whatever the day's
 * allowance says. Ten a day is the drip; this is what stops a week away from the
 * app being answered with more words.
 */
export const NEW_CARDS_PAUSED_ABOVE_DUE = 50

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

/** What `compose` decided: the run in order, and how many of it are new. */
export interface Composition {
  cardIds: string[]
  /**
   * ⚠️ **`review_session.new_count`, and the only thing the day's allowance is
   * counted from** (ADR 0066 §3). What was *offered*, not what was answered.
   */
  newCount: number
}

/**
 * The *session*'s membership, in the order the reader meets it.
 *
 * **Due first, new *cards* filling the remainder** (`S7`). The two halves are
 * never interleaved: a run that mixes them puts a *card* the reader has already
 * failed twice behind one they have never seen, and the *session* is the unit
 * that has to finish.
 *
 * ⚠️ **The new half is capped twice** (ADR 0066). By `allowance`, which is
 * what is left of the day's ten; and by the due count, because at fifty due or
 * more there is no new half at all. **The count is `due.length`**, which is
 * exact: the due read is capped at 2,000 and the gate is at fifty. Nothing caps
 * the due half (ADR 0066 §6) — a reader clearing 300 due *cards* does it twenty
 * at a time, and a short run is never backfilled past the allowance.
 *
 * ⚠️ **Least likely to be remembered first — but only when that is a choice**
 * (ADR 0066 §5). When the due set fits in the *session* everything due is
 * studied and the order is `due` ascending. When it does not, the due half is
 * the `size` *cards* with the lowest retrievability. ⚠️ **This replaced a
 * comment that said *a card three weeks late has decayed further than one due
 * this morning***: that is true only at equal stability — a *card* with 200 days
 * of stability three weeks late is better remembered than a shaky one due
 * yesterday, and FSRS can say so exactly. `due` stays the tie-break.
 *
 * ⚠️ **A *card* appears once** (`04` §7.7's `UNIQUE (review_session_id,
 * card_id)`). Nothing in the schema can produce a *card* in both lists — a *new
 * card* is one with no live epoch and a due one has exactly one — so the dedup
 * below is guarding a query that changes rather than a case that exists today,
 * and the constraint it is keeping ahead of would otherwise fail the whole
 * compose with a unique violation.
 */
export function compose(
  due: DueCard[],
  fresh: NewCard[],
  size: number,
  allowance: number,
): Composition {
  if (size <= 0)
    return { cardIds: [], newCount: 0 }

  const room = due.length >= NEW_CARDS_PAUSED_ABOVE_DUE ? 0 : Math.max(0, allowance)
  const owed = [...due].sort(due.length > size ? byRetrievabilityThenDue : byDueThenId)

  const chosen: string[] = []
  const seen = new Set<string>()
  let newCount = 0

  for (const card of owed) {
    if (chosen.length === size)
      break
    if (seen.has(card.cardId))
      continue

    seen.add(card.cardId)
    chosen.push(card.cardId)
  }

  for (const card of [...fresh].sort(byMintedThenId)) {
    if (chosen.length === size || newCount === room)
      break
    if (seen.has(card.cardId))
      continue

    seen.add(card.cardId)
    chosen.push(card.cardId)
    newCount += 1
  }

  return { cardIds: chosen, newCount }
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
