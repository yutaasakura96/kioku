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
// ⚠️ **Since ADR 0063 the form is `multipart/form-data`**, because it carries a
// `.txt` file input beside the textarea. `readSubmittedFields` below reads both
// encodings, and the urlencoded path is still live — the resume control posts
// that way, and so does every test in the e2e tier.
//
// ⚠️ **`09` §1's route table therefore says `POST /` rather than
// `POST /api/source`, and it is amended to match.** Everything that table's row
// was *for* is unchanged: the write is a form, it is post-redirect-get, and its
// CSRF story is that `SameSite=Lax` sends the cookie for a same-site `POST` and
// not for a cross-site one (verification §12.2). What changed is only which path
// the form's `action` names, and it changed because the only path that can
// render the refusal is the one the refusal has to appear on.

import type { H3Event } from 'h3'

import { recordSource } from '../utils/ingest/record'
import { readSourceKind } from '../../shared/ingest/kind'
import { readSubmission } from '../../shared/ingest/submission'
import { jlptVocab } from '../../shared/subject/declaration'
import { useDatabase } from '../db'

/**
 * What the reader sent, whichever of the two ways they sent it.
 *
 * ⚠️ **Two encodings on one path, because ADR 0063 put a file input on the
 * form.** A file cannot travel in `application/x-www-form-urlencoded` — a
 * urlencoded form sends the *name* of the file and not its bytes — so the form
 * carries `enctype="multipart/form-data"`, and the resume control and the e2e
 * tier still post urlencoded. Both are read here.
 *
 * ⚠️ **`readBody` and `readMultipartFormData` can both run on one request, and
 * that is measured rather than assumed** (h3 1.15.11): `readRawBody` caches the
 * body on `event.node.req` under `Symbol.for('h3RawBody')`, so the second reader
 * gets the cached buffer rather than an exhausted stream. It is the same
 * property `submit-resume.ts` depends on and § Carrying records — extended to
 * the encoding that was not there when that note was written.
 */
interface SubmittedFields {
  title: string
  content: string
  kind: string
  /** The `.txt` the reader attached, decoded — empty when they attached none. */
  uploaded: string
}

const MULTIPART = 'multipart/form-data'

async function readSubmittedFields(event: H3Event): Promise<SubmittedFields> {
  const contentType = getRequestHeader(event, 'content-type') ?? ''

  if (!contentType.startsWith(MULTIPART)) {
    // ⚠️ `readBody` parses `application/x-www-form-urlencoded` into an object —
    // a browser form post, not JSON, because Ingest ships no JavaScript to
    // serialise anything (`03` §2.1).
    const body = await readBody<Record<string, unknown>>(event)
    return {
      title: stringField(body, 'title'),
      content: stringField(body, 'content'),
      kind: stringField(body, 'kind'),
      uploaded: '',
    }
  }

  const parts = (await readMultipartFormData(event)) ?? []
  const fields: Record<string, unknown> = {}
  let uploaded = ''

  for (const part of parts) {
    if (part.name === undefined)
      continue

    // ⚠️ **A part with a filename is the upload, even when it is empty.** A
    // browser sends the file input whether or not the reader chose anything —
    // as a zero-length part with `filename=""` — so the presence of the part
    // says nothing and its length says everything.
    if (part.filename !== undefined) {
      if (part.data.length > 0)
        uploaded = part.data.toString('utf8')
      continue
    }

    fields[part.name] = part.data.toString('utf8')
  }

  return {
    title: stringField(fields, 'title'),
    content: stringField(fields, 'content'),
    kind: stringField(fields, 'kind'),
    uploaded,
  }
}

function stringField(body: Record<string, unknown> | undefined, name: string): string {
  const value = body?.[name]
  return typeof value === 'string' ? value : ''
}

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

  const fields = await readSubmittedFields(event)

  // ⚠️ **A `.txt` reaches the same handler as a paste, and the cap applies to
  // both** (ADR 0063, #19). The file is read into the same `content`, so
  // `readSubmission` refuses an over-cap upload exactly as it refuses an
  // over-cap paste — before any row and before any spend (`03` §13.2) — and the
  // refusal renders on the same screen.
  //
  // ⚠️ **The file wins when both are given.** Choosing a file is the more
  // deliberate of the two actions: a textarea holds whatever the reader last
  // pasted, including text the browser restored on a back navigation, while a
  // file input is empty until somebody picks something.
  const content = fields.uploaded || fields.content

  const submission = readSubmission({ title: fields.title, content })

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
      //
      // ⚠️ **An over-cap *upload* comes back in the textarea too**, which is
      // `09` §4.2's rule applied to the input it did not know about: a file
      // input cannot be repopulated by any server (browsers refuse it, and
      // rightly), so the only way the reader keeps the material in front of
      // them is for it to arrive as text. The alternative is a refusal with an
      // empty form and a file they must find again.
      title: fields.title,
      content,
      kind: fields.kind,
    }
    return
  }

  const written = await recordSource(useDatabase(), {
    subjectId: jlptVocab.subject_id,
    // ADR 0063 — what the reader said the material is. `readSourceKind` answers
    // `word_list` for anything it does not recognise, which is *Ingest*'s
    // default rather than `04` §5.1's column default: the column defaults to
    // `prose` so that the rows written before ADR 0063 keep their meaning.
    kind: readSourceKind(fields.kind),
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
