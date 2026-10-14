/**
 * `09` §4.7 — the run the reader is in, the one they asked to start, and what
 * is waiting.
 *
 * ⚠️ **A `POST`, and never a `GET`, because it writes.** Composing a *session*
 * inserts `review_session` and its positions, and a lesson accepts and mints the
 * words it starts; a `GET` that writes is actioned by a prefetch, a back button
 * or a link preview, and this one would start a lesson nobody asked for.
 *
 * ⚠️ **It composes only when `start` names a kind** (ADR 0076 §1, §8). With no
 * `start` it resumes a live run or answers `session: null` with the offer —
 * which is the screen before a run. ⚠️ Until #70 the mount composed: opening
 * `/review` was the action. A lesson spends the day's allowance by being
 * composed (ADR 0066 §3), so opening a page must not be one.
 *
 * ⚠️ **Resume and start are one endpoint on purpose.** The alternative — a
 * `GET` that reports and a `POST` that composes — is two round trips on the only
 * screen in the app with a latency criterion (`03` §8), and the decision between
 * them is the server's: `09` §4.7 says *session* size is never set mid-session,
 * so a client that chose would be choosing with the one fact it does not have.
 *
 * ⚠️ **The answer is the whole *session*, prefetched as a unit** (`S8`,
 * ADR 0007). Every word's fields travel with it, so the run is decided once
 * and the interface never asks the network for the next question — which is
 * what makes a *session* answerable underground, and what makes PRD §5's "the
 * snapshot wins" a mechanism rather than a promise.
 */
import { parseSessionSize, parseStart } from '../../../shared/review/request'
import { requireOwnerId } from '../../utils/reader'
import { offerOf, resumeOrStart } from '../../utils/review/session'
import { canonicalZone, resolveZone } from '../../../shared/time/local-day'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const db = useDatabase()

  // ⚠️ `readBody` on a request with no body answers `undefined` rather than
  // throwing, and `parseSessionSize` reads that as the default twenty — which is
  // the first-ever *session*, before the knob has anywhere to live (`09` §4.7).
  const body = await readBody(event).catch(() => undefined)
  const size = parseSessionSize(body)

  const start = parseStart(body)
  if (!start.ok)
    throw createError({ statusCode: 400, statusMessage: start.code })

  // ⚠️ **The reader's zone rides every request, the mount's included** (ADR
  // 0066 §4). A zone that is not one is dropped to `null` rather than refused:
  // the worst a wrong value can do is move one reader's own boundary by a few
  // hours, and a *session* that would not start over it would be the brake
  // taking the run away.
  const zone = canonicalZone((body as Record<string, unknown> | undefined)?.zone)
  const session = await resumeOrStart(db, ownerId, { start: start.start, size, zone })

  return {
    session,
    // ADR 0076 §8 — what is waiting, counted after the run so that a lesson's
    // own words are in the day (ADR 0066 §7). Always: the screen before a run
    // is made of it, and so is the summary's *What next*. A lesson's words
    // are counted in the reader's active *category* (ADR 0077 §1), which the
    // server reads: the request names none.
    offer: await offerOf(db, ownerId, resolveZone(zone)),
  }
})
