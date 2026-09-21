// `POST /` carrying a `seed_action` field — *Ingest*'s seed controls, ADR 0070.
//
// ⚠️ **The same path as the submission and the resume, for the resume's
// reason**: one write surface, one CSRF story (`SameSite=Lax`, `09` §1), and the
// forms told apart by a hidden field, which is how a page with no JavaScript has
// always distinguished its actions (ADR 0020).
//
// ⚠️ **It sorts after `submit-resume.ts` and before `submit-source.ts`** — the
// filename order `shell-data.ts` documents: `submit-re`, `submit-se`,
// `submit-so`. The main form posts `multipart/form-data` and carries no
// `seed_action`, so it falls through to `submit-source.ts` untouched.
//
// ⚠️ **Two actions, and neither reports its outcome.** A request writes a seed
// and a queued job; a discard takes the requester's open draft off the screen.
// Either way the answer is a `303` to `/`, and the page says where the draft is,
// read fresh — `09` §7's rule, as the resume control follows it. A request the
// form could not have produced (a *domain* outside the set, a count not offered)
// writes nothing: a seed is a job, and a job is money on the worker's key.

import { discardSeed, recordSeed } from '../utils/ingest/seed'
import { readSeedRequest } from '../../shared/ingest/seed'
import { jlptVocab } from '../../shared/subject/declaration'
import { useDatabase } from '../db'

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST')
    return

  if ((event.path.split('?')[0] ?? '/') !== '/')
    return

  const session = event.context.session
  if (!session)
    return

  // The main form is multipart and never carries `seed_action`; reading it here
  // would parse a file upload for nothing.
  if (getRequestHeader(event, 'content-type')?.startsWith('multipart/form-data'))
    return

  const body = await readBody<Record<string, unknown>>(event)
  const action = typeof body?.seed_action === 'string' ? body.seed_action : ''

  if (action === 'request') {
    const request = readSeedRequest(body, jlptVocab)
    if (request) {
      await recordSeed(useDatabase(), {
        subjectId: jlptVocab.subject_id,
        request,
        requestedBy: session.user.id,
      })
    }
    return sendRedirect(event, '/', 303)
  }

  if (action === 'discard') {
    await discardSeed(useDatabase(), {
      seedId: typeof body?.seed_id === 'string' ? body.seed_id.trim() : '',
      requestedBy: session.user.id,
    })
    return sendRedirect(event, '/', 303)
  }
})
