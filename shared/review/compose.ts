/**
 * `compose(dueEpochs, newCards, size) → ordered card ids` — the first of #12's
 * two seams (`11` §8, `S7`).
 *
 * ⚠️ **Queue ordering, new-*card* introduction and daily caps are the app's
 * job and explicitly not the scheduler's** (`03` §8, verification §1.4).
 * `ts-fsrs` answers one question — given a memory state and a *grade*, when does
 * this come back — and everything about *what to study now* is here. That is why
 * this is a pure function over two lists rather than an `ORDER BY` with a
 * `LIMIT`: a wrong order in SQL reads as a fixture problem in the schema tier,
 * and this is the rule `S7` actually states.
 *
 * ⚠️ **The ordering lives here and not in the query**, deliberately. The query
 * that feeds this one sorts too — it has to, because it has a `LIMIT` on it and
 * an unordered limit picks rows at random — but the answer the *session* is
 * composed from is sorted again here, where the rule is readable and testable.
 * Two sorts that agree cost one comparison per *card* on twenty *cards*.
 */

/** `04` §7.6's default, and the only knob in v1 (ADR 0016, `09` §4.7). */
export const DEFAULT_SESSION_SIZE = 20

/** `04` §7.6's `CHECK` — enforced on the client, and again on the server (`10` §5.8). */
export const MIN_SESSION_SIZE = 1
export const MAX_SESSION_SIZE = 200

/** A *card* with a live *scheduling epoch* whose `due` has passed. */
export interface DueCard {
  cardId: string
  due: Date
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
 * The *session*'s membership, in the order the reader meets it.
 *
 * **Due first, new *cards* filling the remainder** (`S7`). The two halves are
 * never interleaved: a run that mixes them puts a *card* the reader has already
 * failed twice behind one they have never seen, and the *session* is the unit
 * that has to finish.
 *
 * ⚠️ **Most overdue first inside the due half.** A *card* three weeks late has
 * decayed further than one due this morning, and `due` ascending is that order
 * with nothing else to remember.
 *
 * ⚠️ **A *card* appears once** (`04` §7.7's `UNIQUE (review_session_id,
 * card_id)`). Nothing in the schema can produce a *card* in both lists — a *new
 * card* is one with no live epoch and a due one has exactly one — so the dedup
 * below is guarding a query that changes rather than a case that exists today,
 * and the constraint it is keeping ahead of would otherwise fail the whole
 * compose with a unique violation.
 */
export function compose(due: DueCard[], fresh: NewCard[], size: number): string[] {
  if (size <= 0)
    return []

  const ordered = [
    ...[...due].sort(byDueThenId),
    ...[...fresh].sort(byMintedThenId),
  ]

  const chosen: string[] = []
  const seen = new Set<string>()

  for (const card of ordered) {
    if (chosen.length === size)
      break
    if (seen.has(card.cardId))
      continue

    seen.add(card.cardId)
    chosen.push(card.cardId)
  }

  return chosen
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

function byMintedThenId(a: NewCard, b: NewCard): number {
  return a.mintedAt.getTime() - b.mintedAt.getTime() || compareIds(a.cardId, b.cardId)
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
