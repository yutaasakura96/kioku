/**
 * Stage `unpack` — a `.apkg` read into the text of a *word list* (ADR 0068 §1).
 *
 * ⚠️ **It runs in the app, at submit, and that is the reversal ADR 0068 makes.**
 * `anki-apkg-research.md` §4.3 recommended the worker; the ADR moved it here
 * because of who owns `chunk`. `shared/ingest/chunk.ts` writes the
 * `source_chunk` rows inside the submit transaction, before any worker claims
 * the job, and `source_chunk.content_hash` is the first element of the
 * generation cache key (`04` §6.3) — so a worker-side unpack needs either a
 * second chunker or a second job kind that writes `source.content` after the
 * fact. `source.content` is `text NOT NULL` capped at 100,000 code points, and
 * a worker-side unpack leaves nothing to put in it.
 *
 * ⚠️ **`unpack` is nonetheless a declared stage** (ADR 0068 §4). It joins
 * `chunk` in `STAGES_RUN_ELSEWHERE`, so `subjects/jlpt-vocab.json` still says
 * in order what happens to an `anki` *source* (ADR 0003) even though two of
 * those things happen before a worker sees the row.
 *
 * ⚠️ **Every refusal here happens before any row and before any spend**
 * (`09` §4.2, `03` §13.2), and each carries its own code so the screen can say
 * which of them it was.
 */

import { ankiLines } from '../../../../shared/ingest/anki/line'
import type { DeckLines } from '../../../../shared/ingest/anki/line'
import { collectionBytes, DeckTooNew, layoutOf, NoCollection, readCollection } from './collection'
import type { Layout } from './collection'
import { NotAZip, readZip } from './zip'

/**
 * ⚠️ **4 MB, and the number above it is not ours to move.** A Vercel Function's
 * request body is capped at **4.5 MB** (research §4.4), and anything above that
 * is refused by Vercel with `413 FUNCTION_PAYLOAD_TOO_LARGE` **before this
 * code runs** — so nothing here can render a refusal for it, and *Ingest* ships
 * no JavaScript that could (ADR 0020). A reader who uploads a 6 MB deck with
 * audio in it sees Vercel's error page, not this one.
 *
 * ⚠️ **Do not work around it.** Vercel Blob is on ADR 0022's forbidden list —
 * the whole premise of that ADR is that the move to EC2 stays a Nitro preset
 * change plus a `pg_dump`. The honest answer is the one ADR 0068 §8 gives:
 * media is out of scope, and a text-only deck fits easily (the 7,734-note deck
 * research §2.3 measured is 1.57 MB).
 *
 * The 0.5 MB of headroom is for the multipart envelope, which the reader's own
 * file does not account for.
 */
export const DECK_BYTE_CAP = 4 * 1024 * 1024

/**
 * Why a deck was refused. ⚠️ **Each is its own code**, because "that file did
 * not work" is the message a reader cannot act on: a `.colpkg`, a deck from a
 * newer Anki and a `.zip` of `.apkg` files all fail, and the three repairs are
 * different.
 */
export type UnpackFailureCode
  = | 'no_file'
    | 'too_large'
    | 'not_a_zip'
    | 'no_collection'
    | 'unsupported_version'
    | 'unreadable_collection'
    | 'no_words'

export type UnpackResult
  = | { ok: true, content: string, layout: Layout, deck: DeckLines }
    | { ok: false, code: UnpackFailureCode, message: string }

const MESSAGES: Record<UnpackFailureCode, string> = {
  no_file: 'Choose a .apkg file — an Anki deck is a file, not something to paste.',
  too_large: `That deck is over ${DECK_BYTE_CAP / 1024 / 1024} MB. Export it without media, or one subdeck at a time.`,
  not_a_zip: 'That file is not an Anki deck — a .apkg is a zip, and this one is not.',
  no_collection: 'That file is a zip with no Anki collection in it. Export the deck again as .apkg.',
  unsupported_version: 'That deck was written by a newer Anki than this reader knows. Re-export it with "Support older Anki versions" ticked.',
  unreadable_collection: 'That deck\'s collection could not be read. Re-export it from Anki.',
  no_words: 'That deck was read, and none of its notes had a word in the first field. Kioku reads field 1 as the term.',
}

function refuse(code: UnpackFailureCode): UnpackResult {
  return { ok: false, code, message: MESSAGES[code] }
}

/**
 * The deck's bytes, as one line per *note*.
 *
 * ⚠️ **The cap on the *text* is not applied here.** `readSubmission` refuses an
 * over-cap *source* exactly as it refuses an over-cap paste, on the same screen
 * and before the same row — ADR 0068 §7 keeps `S2`'s 100,000-code-point cap
 * rather than raising it for a deck, because the cap is a ceiling on spend and
 * a 5,000-note import is 200 model requests before the first *review*.
 */
export function unpackDeck(bytes: Uint8Array | undefined): UnpackResult {
  if (bytes === undefined || bytes.byteLength === 0)
    return refuse('no_file')

  if (bytes.byteLength > DECK_BYTE_CAP)
    return refuse('too_large')

  let entries: ReadonlyMap<string, Uint8Array>
  try {
    entries = readZip(bytes)
  }
  catch (error) {
    if (error instanceof NotAZip)
      return refuse('not_a_zip')
    throw error
  }

  let layout: Layout
  let collection: Uint8Array
  try {
    layout = layoutOf(entries)
    collection = collectionBytes(entries, layout)
  }
  catch (error) {
    if (error instanceof DeckTooNew)
      return refuse('unsupported_version')
    if (error instanceof NoCollection)
      return refuse('no_collection')
    throw error
  }

  let deck: DeckLines
  try {
    deck = ankiLines(readCollection(collection))
  }
  catch {
    // ⚠️ **Caught broadly and on purpose.** What is behind it is a corrupt
    // SQLite file, a zstd frame that is not one, or a collection whose tables
    // are not the ones research §2.1 names — three failures with one repair,
    // which is to export the deck again. The alternative is a `500` on a route
    // whose whole contract is that it answers with this screen.
    return refuse('unreadable_collection')
  }

  // ⚠️ **Its own code, because the other two sentences are both false here.**
  // The collection was read — so `no_collection`'s *"a zip with no Anki
  // collection in it"* is wrong and tells the reader to re-export a file that
  // is fine — and `readSubmission`'s `empty` would tell them to paste some
  // text, which is not a thing one does to a deck. What actually happened is
  // that every term came out blank, and the repair is to look at which field
  // the deck puts the word in.
  if (deck.lines.length === 0)
    return refuse('no_words')

  return { ok: true, content: deck.lines.join('\n'), layout, deck }
}
