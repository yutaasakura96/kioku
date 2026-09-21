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
import { unpackDeck } from '../utils/ingest/anki/unpack'
import { readSourceKind } from '../../shared/ingest/kind'
import type { SourceKind } from '../../shared/ingest/kind'
import type { IngestFailure } from '../types/place'
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
  /** The draft's *seed* id, when the text began as one — ADR 0070 §1. */
  seed: string
  /** The `.txt` the reader attached, decoded — empty when they attached none. */
  uploaded: string
  /**
   * The same upload, **undecoded** — ADR 0068, #26.
   *
   * ⚠️ **A `.apkg` is a zip and decoding one as UTF-8 destroys it.** Until #26
   * every upload was `part.data.toString('utf8')` and nothing else, which is
   * right for the `.txt` ADR 0063 asked for and lossy for anything else:
   * `TextDecoder` replaces every byte that is not valid UTF-8 with `U+FFFD`, so
   * the bytes cannot be recovered from the string afterwards. Both are kept
   * because both paths are live, and which one is read is decided by the
   * *kind*.
   */
  uploadedBytes?: Uint8Array
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
      seed: stringField(body, 'seed'),
      uploaded: '',
    }
  }

  const parts = (await readMultipartFormData(event)) ?? []
  const fields: Record<string, unknown> = {}
  let uploaded = ''
  let uploadedBytes: Uint8Array | undefined

  for (const part of parts) {
    if (part.name === undefined)
      continue

    // ⚠️ **A part with a filename is the upload, even when it is empty.** A
    // browser sends the file input whether or not the reader chose anything —
    // as a zero-length part with `filename=""` — so the presence of the part
    // says nothing and its length says everything.
    if (part.filename !== undefined) {
      if (part.data.length > 0) {
        // ⚠️ **Both forms of the same upload, and neither is derived from the
        // other.** A `.txt` is read as text and a `.apkg` as bytes (ADR 0068);
        // going text-first and re-encoding would already have lost every byte
        // that is not valid UTF-8.
        uploadedBytes = new Uint8Array(part.data)
        uploaded = part.data.toString('utf8')
      }
      continue
    }

    fields[part.name] = part.data.toString('utf8')
  }

  return {
    title: stringField(fields, 'title'),
    content: stringField(fields, 'content'),
    kind: stringField(fields, 'kind'),
    seed: stringField(fields, 'seed'),
    uploaded,
    uploadedBytes,
  }
}

function stringField(body: Record<string, unknown> | undefined, name: string): string {
  const value = body?.[name]
  return typeof value === 'string' ? value : ''
}

/** Refused, with a code and a sentence — either reader's. */
interface Refused { ok: false, code: IngestFailure['code'], message: string }

/**
 * What is to be ingested, whichever input the *kind* says to read.
 *
 * ⚠️ **The three kinds read three different things, and the branch is here
 * rather than inside `readSubmission`**: that function is `11` §8's pure seam
 * over *text*, and a `.apkg` is not text until this has run.
 */
function readMaterial(
  kind: SourceKind,
  fields: SubmittedFields,
): { ok: true, content: string } | Refused {
  // ⚠️ **A deck is a file and only a file** (ADR 0068). There is nothing to
  // paste, so an `anki` submission never falls back to the textarea — an empty
  // one is `no_file`, by name, rather than `empty`'s *paste the text you want
  // notes from*.
  if (kind === 'anki') {
    const deck = unpackDeck(fields.uploadedBytes)
    return deck.ok ? { ok: true, content: deck.content } : deck
  }

  // ⚠️ **The file wins when both are given.** Choosing a file is the more
  // deliberate of the two actions: a textarea holds whatever the reader last
  // pasted, including text the browser restored on a back navigation, while a
  // file input is empty until somebody picks something.
  return { ok: true, content: fields.uploaded || fields.content }
}

/**
 * The refusal `app/pages/index.vue` renders — one shape for both readers.
 *
 * ⚠️ **`content` is what goes back into the textarea, and a deck has none to
 * give.** `09` §4.2's rule is that the reader keeps their material; a `.apkg`
 * cannot be put back into a file input by any server (browsers refuse it, and
 * rightly) and must not be spilled into the textarea as bytes, so a refused
 * deck returns whatever they had *typed*.
 */
function refusal(fields: SubmittedFields, failure: Refused, content?: string): IngestFailure {
  return {
    code: failure.code,
    message: failure.message,
    // What the reader typed, back to the reader. The raw body rather than the
    // normalised text: they should get back what they pasted.
    title: fields.title,
    content: content ?? fields.content,
    kind: fields.kind,
    seed: fields.seed,
  }
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
  // both** (ADR 0063, #19) — and since ADR 0068 so does a `.apkg`, by way of the
  // word list it is unpacked into. `readSubmission` refuses an over-cap upload
  // of any of the three exactly as it refuses an over-cap paste.
  const kind = readSourceKind(fields.kind)

  // ⚠️ **`unpack` runs here, inside the same request that writes the four rows**
  // — ADR 0068 §1, and it is the reversal that ADR makes against
  // `anki-apkg-research.md` §4.3. The reader cannot go in the worker because
  // `chunk` is the app's and `source.content` is written in this transaction; a
  // worker-side unpack leaves nothing to put in it. The declaration still names
  // `unpack` as the `anki` pipeline's first stage (ADR 0068 §4), beside `chunk`,
  // which is run here too.
  //
  // ⚠️ **Every refusal renders on this screen, before any row and before any
  // spend** (`09` §4.2, `03` §13.2), like an over-cap paste.
  const material = readMaterial(kind, fields)

  if (!material.ok) {
    event.context.ingestFailure = refusal(fields, material)
    return
  }

  const content = material.content

  const submission = readSubmission({ title: fields.title, content, kind })

  if (!submission.ok) {
    // ⚠️ **Fall through, do not respond.** The router then hands the `POST` to
    // the renderer, `app/pages/index.vue` reads this, and the reader gets their
    // text back. `10` §6.3: the cost is that a browser reload on the error page
    // re-submits, which is the ordinary cost of the ordinary answer.
    event.context.ingestFailure = refusal(fields, submission, content)
    return
  }

  const written = await recordSource(useDatabase(), {
    subjectId: jlptVocab.subject_id,
    // ADR 0063 — what the reader said the material is. `readSourceKind` answers
    // `prose`, `04` §5.1's column default, for anything it does not recognise or
    // that *Ingest* does not offer, and not *Ingest*'s own `word_list`. The form
    // always sends a value, so only a post from somewhere else reaches the
    // fallback, and answering that with `word_list` would chunk a pasted passage
    // at 25 terms (§ Carrying).
    kind,
    title: submission.title,
    content: submission.content,
    characterCount: submission.characterCount,
    submittedBy: session.user.id,
    // ADR 0070 §1: a submitted draft stops being one. Untrusted, and
    // `markSeedSubmitted` treats it that way.
    seedId: fields.seed || undefined,
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
