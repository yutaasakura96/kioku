/**
 * A zip, read from its central directory — ADR 0068 §2.
 *
 * ⚠️ **`node:zlib` and no dependency.** ADR 0068 §2 weighs this against
 * `ankipack`, the one current and clean Node reader, and takes the built-ins:
 * four dependencies including `sql.js`'s WASM, to do what `inflateRawSync` and
 * `node:sqlite` already do. `ankipack` stays named there as the fallback, and
 * #26's own criterion is that reaching for it means amending the ADR first
 * rather than adding it quietly.
 *
 * ⚠️ **The central directory and never the local headers' sizes.** A zip written
 * with a streaming writer sets bit 3 and leaves the local header's sizes at
 * zero, putting the true ones in a data descriptor *after* the data; the central
 * directory always carries them. Reading the local header's sizes works on every
 * file measured and fails on the first one written by a streaming exporter, with
 * an empty entry rather than an error.
 *
 * ⚠️ **Zip64 is not handled, and the upload cap is why that is safe.** The
 * fields that overflow are 4 GiB sizes and 65,535 entries; `unpack.ts` refuses
 * anything over 4 MB before this function is called (Vercel's request body
 * limit is 4.5 MB, research §4.4). A `.apkg` that needed zip64 could not have
 * been uploaded.
 */

import zlib from 'node:zlib'

const LOCAL_HEADER = 0x04034B50
const CENTRAL_HEADER = 0x02014B50
const END_OF_DIRECTORY = 0x06054B50

/** The two methods a real `.apkg` uses — research §1.1's measured exports. */
const STORED = 0
const DEFLATE = 8

/** The largest a zip comment can be, and therefore how far back the end can sit. */
const MAX_COMMENT = 0xFFFF

export class NotAZip extends Error {}

/**
 * Every entry's bytes, by name.
 *
 * ⚠️ **Everything is decompressed eagerly, and the cap is what makes that
 * sound.** A `.apkg`'s entries are a `meta` of two bytes, a collection, a media
 * index and — for a deck with media — numbered files this reader ignores
 * entirely (ADR 0068 §8). Deferring would buy a little memory and cost the
 * simplicity of a `Map`, on an input already bounded at 4 MB.
 */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = findEndOfDirectory(view, bytes.byteLength)

  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)

  const entries = new Map<string, Uint8Array>()

  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL_HEADER)
      throw new NotAZip('the central directory ends before it says it does')

    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)

    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    entries.set(name, readEntry(bytes, view, localOffset, method, compressedSize))

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function readEntry(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  method: number,
  compressedSize: number,
): Uint8Array {
  if (offset + 30 > bytes.byteLength || view.getUint32(offset, true) !== LOCAL_HEADER)
    throw new NotAZip(`an entry's local header is not where the directory says`)

  // ⚠️ The name and extra lengths are read from the **local** header and the
  // sizes from the central one. They are the same name, and the extra field is
  // routinely a different length in the two places.
  const nameLength = view.getUint16(offset + 26, true)
  const extraLength = view.getUint16(offset + 28, true)
  const start = offset + 30 + nameLength + extraLength

  if (start + compressedSize > bytes.byteLength)
    throw new NotAZip('an entry runs past the end of the file')

  const body = bytes.subarray(start, start + compressedSize)

  if (method === STORED)
    return body
  if (method === DEFLATE)
    return new Uint8Array(zlib.inflateRawSync(body))

  throw new NotAZip(`an entry uses compression method ${method}, which is neither stored nor deflate`)
}

/**
 * The end-of-central-directory record, found by scanning backwards.
 *
 * ⚠️ **Backwards, because the record is last and its own length is variable.**
 * A zip comment sits after it, up to 65,535 bytes, so its position is only
 * findable by searching — which is also why a file that is not a zip at all is
 * detected *here*, as the absence of a signature, rather than by looking at the
 * first four bytes. A `.apkg` whose first entry happens to start with something
 * else is still a zip.
 */
function findEndOfDirectory(view: DataView, length: number): number {
  const floor = Math.max(0, length - MAX_COMMENT - 22)

  for (let offset = length - 22; offset >= floor; offset--) {
    if (view.getUint32(offset, true) === END_OF_DIRECTORY)
      return offset
  }

  throw new NotAZip('no end-of-central-directory record: this is not a zip')
}
