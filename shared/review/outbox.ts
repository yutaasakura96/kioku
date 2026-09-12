/**
 * The outbox — ⚠️ **two kinds of entry in one stream** (`03` §8.1 as amended
 * 2026-09-07, ADR 0039).
 *
 * ⚠️ **Append-only, single-device, replays in order, never merges, resolves no
 * conflicts** (ADR 0007). Every one of those five words is a refusal: there is
 * no deduplication, no reordering, no "latest wins" fold and no merge of two
 * entries into one. The stream is a list, the head is what goes next, and an
 * entry leaves it only when the server has answered about it.
 *
 * ⚠️ **The two entry types are two types on purpose.** ADR 0039: *the ordering
 * that matters is a flag landing after a grade for a **different** card*, and a
 * design that made them one parameterised entry would erase exactly the
 * distinction property 3 exists to protect. So a `flag` carries no *grade* and a
 * `grade` carries no flag, and the stream holds both in the order they were
 * given.
 *
 * ⚠️ **A *grade* carries its own stamp and a flag does not**, and that asymmetry
 * is `04` §7.8 rather than an oversight. FSRS schedules on elapsed time, so the
 * moment a *grade* was given is arithmetic the server cannot reconstruct
 * (ADR 0007); `card_flag.flagged_at` defaults to `now()` and nothing computes
 * anything from it, so a flag replayed an hour late is a flag, not a wrong
 * number six months on.
 *
 * ⚠️ **This module never touches storage.** ADR 0014 puts the stream in
 * `localStorage` and `app/utils/review-store.ts` is the explicit import that does it
 * (`03` §8.1); what is here is the shape and the five properties, which is what
 * `test/unit/` can hold.
 */

import type { Grade } from './scheduler'

/**
 * What a position was answered with — a *grade*, or `S9`'s flag.
 *
 * ⚠️ **The two are one type here and two entry types in the stream**, and both
 * halves matter: the screen asks *is this position answered* and does not care
 * which (`isAnswered`, `shared/review/snapshot.ts`), while the replay has to
 * keep a flag distinguishable from a *grade* or ADR 0039's property 3 has
 * nothing to assert.
 */
export type Answer = Grade | 'flagged'

/** An entry as the screen gives it, before the stream numbers it. */
export type OutboxDraft
  = | {
    kind: 'grade'
    sessionId: string
    cardId: string
    grade: Grade
    /** ISO 8601, stamped at the keystroke (ADR 0007, `03` §8.1). */
    reviewedAt: string
  }
  | {
    kind: 'flag'
    sessionId: string
    cardId: string
  }

/**
 * ⚠️ **`seq` is the stream's own order and not a timestamp.** Replay is in the
 * order the entries were given, and two entries given in the same millisecond
 * still have an order; a stream sorted by stamp would also be a stream that
 * reordered a flag around the *grade* it followed.
 */
export type OutboxEntry = OutboxDraft & { seq: number }

/**
 * ⚠️ **Append, and only append.** Nothing here looks at what is already in the
 * stream — not to deduplicate a second *grade* for the same *card* (PRD §5 says
 * both replay), not to collapse a flag onto the *grade* before it, and not to
 * reorder.
 */
export function append(entries: OutboxEntry[], draft: OutboxDraft): OutboxEntry[] {
  const last = entries[entries.length - 1]

  return [...entries, { ...draft, seq: (last?.seq ?? 0) + 1 }]
}

/** What goes next. The stream replays from the front, one at a time. */
export function head(entries: OutboxEntry[]): OutboxEntry | null {
  return entries[0] ?? null
}

/**
 * The entry the server has answered about, out of the stream.
 *
 * ⚠️ **By `seq`, not by position**, because the reader keeps answering while a
 * flush is in flight: by the time the answer arrives the entry that was the head
 * may have three behind it, and dropping "the first one" would drop whichever
 * one happened to be there.
 */
export function settle(entries: OutboxEntry[], seq: number): OutboxEntry[] {
  return entries.filter(entry => entry.seq !== seq)
}

/**
 * What the stream says about a run that is being resumed — ⚠️ **the durable
 * record deciding rather than client memory** (ADR 0039 property 4).
 *
 * A reload loses the screen's optimism and keeps the stream (ADR 0014), so a
 * *card* answered underground and not yet flushed has to come back answered.
 * Without this the reader is asked it a second time, and PRD §5's *the same card
 * graded twice* stops being an edge case about two devices and becomes what an
 * ordinary reload does.
 *
 * ⚠️ **Later entries overwrite earlier ones**, which is PRD §5's rule — both
 * replay, the later one wins — read on the client's side of the wire.
 */
export function unsentAnswers(entries: OutboxEntry[], sessionId: string): Map<string, Answer> {
  const answers = new Map<string, Answer>()

  for (const entry of entries) {
    if (entry.sessionId !== sessionId)
      continue

    answers.set(entry.cardId, entry.kind === 'grade' ? entry.grade : 'flagged')
  }

  return answers
}

/**
 * The stream read back out of `localStorage`.
 *
 * ⚠️ **A malformed entry is dropped and the rest of the stream still replays.**
 * The store is a string anybody can edit and a half-written value is what a
 * closing tab leaves; refusing the whole stream over one bad entry would lose
 * every *grade* behind it, which is the failure ADR 0014 exists to prevent
 * arriving through the mechanism meant to prevent it.
 */
export function parseOutbox(raw: unknown): OutboxEntry[] {
  if (!Array.isArray(raw))
    return []

  return raw.filter(isEntry)
}

function isEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== 'object' || value === null)
    return false

  const entry = value as Record<string, unknown>

  if (typeof entry.seq !== 'number' || !Number.isFinite(entry.seq))
    return false

  if (typeof entry.sessionId !== 'string' || typeof entry.cardId !== 'string')
    return false

  if (entry.kind === 'flag')
    return true

  if (entry.kind !== 'grade')
    return false

  // The same four *grades* the wire takes — `04` §7.5's `CHECK (rating BETWEEN
  // 1 AND 4)`, refused here rather than carried to a request that cannot work.
  if (entry.grade !== 1 && entry.grade !== 2 && entry.grade !== 3 && entry.grade !== 4)
    return false

  return typeof entry.reviewedAt === 'string' && !Number.isNaN(Date.parse(entry.reviewedAt))
}
