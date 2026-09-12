/**
 * `09` §4.7 steps 2 and 3 — the run the reader is in, or a new one.
 *
 * ⚠️ **A `POST`, and never a `GET`, because it writes.** Composing a *session*
 * inserts `review_session` and `size` rows of `review_session_card`; a `GET`
 * that writes is actioned by a prefetch, a back button or a link preview, and
 * this one would compose a run nobody asked for and then answer the reader's
 * real request with the leftovers. `10` §6.2's resume control carries the same
 * argument for the same reason.
 *
 * ⚠️ **Resume and compose are one endpoint on purpose.** The alternative — a
 * `GET` that reports and a `POST` that composes — is two round trips on the only
 * screen in the app with a latency criterion (`03` §8), and the decision between
 * them is the server's: `09` §4.7 says *session* size is never set mid-session,
 * so a client that chose would be choosing with the one fact it does not have.
 *
 * ⚠️ **The answer is the whole *session*, prefetched as a unit** (`S8`,
 * ADR 0007). Every *card*'s fields travel with it, so the run is decided once
 * and the interface never asks the network for the next *card* — which is what
 * makes a *session* answerable underground, and what makes PRD §5's "the
 * snapshot wins" a mechanism rather than a promise.
 */
import { nothingToStudy } from '../../utils/review/queries'
import { parseSessionSize } from '../../../shared/review/request'
import { requireOwnerId } from '../../utils/reader'
import { resumeOrCompose } from '../../utils/review/session'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  const ownerId = requireOwnerId(event)
  const db = useDatabase()

  // ⚠️ `readBody` on a request with no body answers `undefined` rather than
  // throwing, and `parseSessionSize` reads that as the default twenty — which is
  // the first-ever *session*, before the knob has anywhere to live (`09` §4.7).
  const size = parseSessionSize(await readBody(event).catch(() => undefined))

  const session = await resumeOrCompose(db, ownerId, size)

  return {
    session,
    // ⚠️ Only when there is no *session*, and it is what tells `10` §5.7's two
    // empty states apart: *nothing ever accepted* points the reader at *Vet*,
    // *nothing due* names the instant the next *card* comes back. One is a dead
    // end and the other is a tomorrow, and a single "nothing to review" would
    // send a reader with four hundred *cards* to go and paste more text.
    empty: session ? null : await nothingToStudy(db, ownerId),
  }
})
