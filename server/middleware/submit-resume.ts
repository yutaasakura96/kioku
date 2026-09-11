// `POST /` carrying a `resume` field — `10` §6.2's resume control.
//
// ⚠️ **The same path as the submission, and on purpose.** ADR 0042 moved the
// *source* submission to `POST /` because the over-cap refusal has to be
// rendered *by the place*, and `09` §1's route table is amended to say so. A
// resume needs none of that — it has no refusal a reader composes and nothing to
// hand back — but giving it a second path would add a second row to that table,
// a second write surface and a second CSRF story, to save one `if`. The two
// forms are told apart by a hidden field, which is how a form without JavaScript
// has always distinguished its actions.
//
// ⚠️ **It sorts before `submit-source.ts` and after `session.ts`**, which is the
// same filename-ordering mechanism `shell-data.ts` documents: `session` on the
// `e`, `shell-data` on the `h`, then `submit-resume` before `submit-source` on
// the `r`. If the order ever changed, this would read `undefined` for the
// session and fall through without writing — `session.ts` has already answered
// an unauthenticated document request, so the worst case is a control that does
// nothing rather than one that writes for nobody.
//
// ⚠️ **No JavaScript.** Ingest ships none (ADR 0020, `03` §2.1), so this is a
// form submit and a `303` — post-redirect-get, exactly like the submission, and
// the reader's back button lands on a document rather than on a resubmission.

import { recordResume } from '../utils/ingest/resume'
import { useDatabase } from '../db'

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST')
    return

  if ((event.path.split('?')[0] ?? '/') !== '/')
    return

  const session = event.context.session
  if (!session)
    return

  const body = await readBody<Record<string, unknown>>(event)
  const ingestionId = typeof body?.resume === 'string' ? body.resume.trim() : ''

  // Not a resume — `submit-source.ts` is next and this is its request.
  //
  // ⚠️ **`readBody` caches the parsed body on the event, so reading it here does
  // not consume the stream** — which is the one thing that could have made this
  // middleware quietly break the submission it sits in front of. It is asserted
  // rather than assumed: `test/e2e/ingest.test.ts`'s over-cap block posts a
  // 100,001-character `content` with no `resume` field and expects it back
  // inside the textarea, which only happens if `submit-source.ts`'s own
  // `readBody` still sees the body after this one has read it.
  if (!ingestionId)
    return

  // ⚠️ **The outcome is not reported to the reader, and that is `09` §7's rule
  // rather than laziness.** The run list is what says where a run is, read fresh
  // on every request, and the next render tells the truth whichever way this
  // went: a resumed run shows a queued job, a run that stopped being resumable
  // shows the state it moved to. A flash message would be a second, staler
  // account of the same fact — and there is no client to hold one.
  await recordResume(useDatabase(), {
    ingestionId,
    // ⚠️ `job.requested_by` — an audit line, not an owner (`04` §4).
    requestedBy: session.user.id,
  })

  return sendRedirect(event, '/', 303)
})
