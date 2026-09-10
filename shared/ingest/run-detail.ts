/**
 * The detail line of a run row — `10` §6.2's table, and `09` §7's flow.
 *
 * ⚠️ **This function exists to hold one rule that is easier to break than to
 * state.** `09` §7:
 *
 *   Ingest reports what the job table knows. `job.heartbeat_at` is refreshed
 *   every 30 seconds *while working* (`04` §6.4), so an idle worker looks
 *   exactly like an absent one. There is no liveness signal in the schema and
 *   this document does not invent one.
 *
 * So a run that has been queued for two days says it has been queued for two
 * days. It does not say the worker is down, because nothing in the database
 * knows that — at one reader the worker runs on the laptop in front of the
 * person reading the screen, and "queued for four minutes, not picked up" is the
 * actionable sentence. `test/unit/ingest-run-detail.test.ts` asserts the absence
 * as well as the presence, because the absence is the decision.
 *
 * ⚠️ **And the provider is never named** (`03` §11). `ingestion_chunk.last_error`
 * is in the same query as everything below and is the one string on the screen
 * that could carry a vendor name or a `429`. It is not read here.
 */

export type RunStatus = 'queued' | 'running' | 'complete' | 'incomplete' | 'failed'

/**
 * What the run list knows about one *ingestion*. Every field is a column or a
 * count over one — nothing here is inferred.
 */
export interface RunFacts {
  /** `ingestion.status` — `04` §6.1. */
  status: RunStatus
  /** `ingestion.submitted_at`, the left-hand end of *time-to-first-review*. */
  submittedAt: Date
  /** `job.claimed_at` — null until a worker looks. */
  claimedAt: Date | null
  /** `count(source_chunk)` for the *source*. */
  totalChunks: number
  /** `count(ingestion_chunk) where status = 'complete'`. */
  completeChunks: number
  failedChunks: number
  /** `count(note) where origin_ingestion_id = …`. */
  notesProduced: number
}

/**
 * `now` is a parameter rather than a call so this stays pure and so the caller
 * stamps every row on a page with **one** instant — `09` §2 requires every
 * figure in the *shell* to be as of page load, and two rows computed a
 * millisecond apart would be two page loads.
 */
export function runDetail(facts: RunFacts, now: Date): string {
  switch (facts.status) {
    case 'queued':
      return queuedDetail(facts, now)

    case 'running':
      return `${facts.completeChunks} of ${facts.totalChunks} chunks`

    case 'complete':
      // ⚠️ PRD §5: zero new *notes* is "a success, not an error, and the
      // expected steady state as the corpus grows". The filter tally sits
      // beneath this line and explains it (`10` §6.2); this line must not read
      // as a failure above it.
      return facts.notesProduced === 0 ? 'no new notes' : pluralise(facts.notesProduced, 'note')

    case 'incomplete':
      // `04` §6.1: **`incomplete` is `S2`'s resumable state, not an error.** It
      // says what completed, which is also what the resume will not redo.
      return `${facts.completeChunks} of ${facts.totalChunks} chunks · ${pluralise(facts.notesProduced, 'note')} so far`

    case 'failed':
      return `${facts.failedChunks} of ${facts.totalChunks} chunks failed`
  }
}

function queuedDetail(facts: RunFacts, now: Date): string {
  const waiting = elapsed(facts.submittedAt, now)

  if (!facts.claimedAt)
    return `queued ${waiting}, not yet picked up`

  return `queued ${waiting}, picked up ${elapsed(facts.claimedAt, now)} ago`
}

/**
 * Seconds under a minute, minutes under an hour, then hours and minutes. Coarse
 * on purpose: the figure is as of page load and a reader who wants a live one
 * reloads (`09` §2).
 */
function elapsed(from: Date, to: Date): string {
  const seconds = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000))

  if (seconds < 60)
    return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)
    return `${minutes}m`

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function pluralise(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
