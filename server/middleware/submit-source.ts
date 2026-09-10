// `POST /` — the *source* submission, and the one write Ingest performs.
//
// ⚠️ **This is a middleware rather than a route handler, and the reason is the
// error render.** `09` §4.2 requires an over-cap paste to be answered `200` with
// **the form re-rendered and the reader's text still in it**, and argues the
// point at length: a `303` after a rejected 120,000-character paste loses the
// paste and there is no client to hold it. That answer is an HTML document — the
// Ingest *place*, with a message and the textarea repopulated — and a Nitro
// route handler cannot produce one. Two things were measured on 2026-09-10
// against the built app:
//
//  - **Nuxt's page renderer answers `POST` with a fully rendered document**
//    (`200`, `text/html`). So a `POST` that falls through to the router is
//    served by the *place* itself, which is exactly the answer `09` §4.2 asks
//    for.
//  - ⚠️ **Rewriting `event.node.req.url` in a middleware does not re-route** —
//    the request 404s. So there is no way to accept the `POST` at one path and
//    have it rendered at another. `nitropack` 2.13.4's `localFetch` takes no
//    context either, so the rejected paste cannot travel to an internal render.
//
// ⚠️ **`09` §1's route table therefore says `POST /` rather than
// `POST /api/source`, and it is amended to match.** Everything that table's row
// was *for* is unchanged: the write is a form, it is post-redirect-get, and its
// CSRF story is that `SameSite=Lax` sends the cookie for a same-site `POST` and
// not for a cross-site one (verification §12.2). What changed is only which path
// the form's `action` names, and it changed because the only path that can
// render the refusal is the one the refusal has to appear on.

import { recordSource } from '../utils/ingest/record'
import { readSubmission } from '../../shared/ingest/submission'
import { jlptVocab } from '../../shared/subject/declaration'
import { useDatabase } from '../db'

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST')
    return

  if ((event.path.split('?')[0] ?? '/') !== '/')
    return

  // `session.ts` has already refused an unauthenticated `POST` (`08` §6.3); this
  // is the fail-closed half of the same ordering note in `shell-data.ts`.
  const session = event.context.session
  if (!session)
    return

  // ⚠️ `readBody` parses `application/x-www-form-urlencoded` into an object —
  // this is a browser form post, not JSON, because Ingest ships no JavaScript
  // to serialise anything (`03` §2.1).
  const body = await readBody<Record<string, unknown>>(event)

  const submission = readSubmission({
    title: typeof body?.title === 'string' ? body.title : '',
    content: typeof body?.content === 'string' ? body.content : '',
  })

  if (!submission.ok) {
    // ⚠️ **Fall through, do not respond.** The router then hands the `POST` to
    // the renderer, `app/pages/index.vue` reads this, and the reader gets their
    // text back. `10` §6.3: the cost is that a browser reload on the error page
    // re-submits, which is the ordinary cost of the ordinary answer.
    event.context.ingestFailure = {
      code: submission.code,
      message: submission.message,
      // What the reader typed, back to the reader. The raw body rather than the
      // normalised text: they should get back what they pasted.
      title: typeof body?.title === 'string' ? body.title : '',
      content: typeof body?.content === 'string' ? body.content : '',
    }
    return
  }

  const written = await recordSource(useDatabase(), {
    subjectId: jlptVocab.subject_id,
    title: submission.title,
    content: submission.content,
    characterCount: submission.characterCount,
    submittedBy: session.user.id,
  })

  // ⚠️ **`303`, and it answers before the worker runs.** `S2`'s "returns control
  // immediately" is satisfied by the job row rather than by a fast worker
  // (`09` §4.2) — the four rows are on disk and nothing here waits.
  //
  // `303` rather than `302`: it is the status that means "the response is at
  // another URI, fetch it with `GET`", which is the whole of post-redirect-get.
  const target = written.duplicateOf ? `/?existing=${written.duplicateOf.id}` : '/'

  return sendRedirect(event, target, 303)
})
