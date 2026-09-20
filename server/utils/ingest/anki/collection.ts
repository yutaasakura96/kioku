/**
 * Which layout a `.apkg` is, and the *notes* inside it — ADR 0068 §2,
 * `anki-apkg-research.md` §1.1 and §2.
 *
 * ⚠️ **The detection order is `meta`, then `collection.anki21`, then
 * `collection.anki2`, and getting it wrong is silent.** **Every** export writes
 * a dummy `collection.anki2` holding one note that says to update Anki
 * (`write_dummy_collection`, research §1.1) — legacy exports included. A reader
 * that looks for `collection.anki2` first finds that file, opens it without
 * error, and reports a one-note deck. Research §1.3 measured exactly that on a
 * real AnkiWeb download.
 *
 * ⚠️ **`node:sqlite` is a release candidate and zlib's zstd is experimental**
 * (ADR 0068 §2). The contract is deliberately small — one decompress call and
 * four `SELECT`s — and the fixtures cover all three layouts, so a breaking
 * change in a Node release fails `npm run test` rather than production.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import zlib from 'node:zlib'

import type { AnkiNote } from '../../../../shared/ingest/anki/line'
import { BLANK_RUN } from '../../../../shared/subject/validate'

/** Anki's `PackageMetadata.version` — research §1.1's table. */
export type Layout = 1 | 2 | 3

/** Anki's own refusal for a package from a newer version — `ImportError::TooNew`. */
export class DeckTooNew extends Error {}

export class NoCollection extends Error {}

const COLLECTION_BY_LAYOUT: Record<Layout, string> = {
  1: 'collection.anki2',
  2: 'collection.anki21',
  3: 'collection.anki21b',
}

/**
 * The layout, read the way Anki reads it — `VersionExt`/`MetaExt` in
 * `rslib/src/import_export/package/meta.rs`.
 *
 * ⚠️ **`meta` wins whenever it is present**, and an unknown version is refused
 * rather than falled back from. Anki raises `TooNew`; so does this, because the
 * alternative is opening a file whose shape nothing here understands and
 * reporting whatever comes out.
 */
export function layoutOf(entries: ReadonlyMap<string, Uint8Array>): Layout {
  const meta = entries.get('meta')

  if (meta !== undefined) {
    const version = metaVersion(meta)
    if (version !== 1 && version !== 2 && version !== 3) {
      throw new DeckTooNew(
        `the package declares format version ${version}, and this reader knows 1, 2 and 3`,
      )
    }
    return version
  }

  if (entries.has('collection.anki21'))
    return 2
  if (entries.has('collection.anki2'))
    return 1

  throw new NoCollection('the package carries no collection')
}

/**
 * `PackageMetadata.version`, decoded as a protobuf varint.
 *
 * ⚠️ **A varint, and not byte 1.** Research §4.3 flags its own sketch for
 * taking `meta[1]`: it happens to be right for every version an exporter has
 * ever written (`08 01`, `08 02`, `08 03`), and it is right by arithmetic
 * coincidence — a one-byte varint *is* its own value. The first version above
 * 127, or the first exporter that writes another field before this one, ends
 * that. Decoding costs six lines.
 */
export function metaVersion(meta: Uint8Array): number {
  let offset = 0

  while (offset < meta.length) {
    const [tag, afterTag] = varint(meta, offset)
    const field = tag >>> 3
    const wire = tag & 0x07

    if (field === 1 && wire === 0) {
      const [value] = varint(meta, afterTag)
      return value
    }

    // Anything else is a field this reader does not need. Skip it by its wire
    // type, so a `meta` that grows a field stays readable.
    offset = skip(meta, afterTag, wire)
  }

  // No version field at all. `PackageMetadata`'s default is 0, which is not a
  // layout, and `layoutOf` refuses it by the same rule as a future one.
  return 0
}

function varint(bytes: Uint8Array, start: number): [number, number] {
  let value = 0
  let shift = 0
  let offset = start

  while (offset < bytes.length) {
    const byte = bytes[offset++]!
    value += (byte & 0x7F) * 2 ** shift
    if ((byte & 0x80) === 0)
      return [value, offset]
    shift += 7
    if (shift > 63)
      break
  }

  throw new DeckTooNew('the package\'s `meta` entry is not a readable protobuf')
}

function skip(bytes: Uint8Array, offset: number, wire: number): number {
  if (wire === 0)
    return varint(bytes, offset)[1]
  if (wire === 5)
    return offset + 4
  if (wire === 1)
    return offset + 8
  if (wire === 2) {
    const [length, after] = varint(bytes, offset)
    return after + length
  }
  throw new DeckTooNew(`the package's \`meta\` entry uses wire type ${wire}`)
}

/**
 * The collection's bytes, decompressed if the layout says they are.
 *
 * ⚠️ **zstd for `LATEST` only.** `meta.rs` makes it "zstd iff not legacy", and
 * the zip entry is *stored* — so a reader that trusted the zip's own
 * compression would hand a zstd frame to SQLite and be told it is not a
 * database.
 */
export function collectionBytes(
  entries: ReadonlyMap<string, Uint8Array>,
  layout: Layout,
): Uint8Array {
  const name = COLLECTION_BY_LAYOUT[layout]
  const raw = entries.get(name)

  if (raw === undefined)
    throw new NoCollection(`the package declares layout ${layout} and carries no ${name}`)

  if (layout !== 3)
    return raw

  return new Uint8Array(zlib.zstdDecompressSync(raw))
}

/**
 * The *notes*, read out of a collection's bytes.
 *
 * ⚠️ **Through a temp file, and it is deleted in a `finally`.**
 * `DatabaseSync.deserialize()` would read the buffer directly and it arrived in
 * Node v24.16.0; `package.json`'s `engines` still admits 22.x, which does not
 * have it (ADR 0068 §2, whose revisit condition is the day the floor moves).
 */
export function readCollection(bytes: Uint8Array): AnkiNote[] {
  const directory = mkdtempSync(join(tmpdir(), 'kioku-anki-'))
  const path = join(directory, 'collection.sqlite')

  try {
    writeFileSync(path, bytes)
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      return notesFrom(db)
    }
    finally {
      db.close()
    }
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function notesFrom(db: DatabaseSync): AnkiNote[] {
  const relational = db
    .prepare('select name from sqlite_master where type = \'table\' and name = \'notetypes\'')
    .get() !== undefined

  const fieldNames = relational ? schema18FieldNames(db) : schema11FieldNames(db)
  const deckNames = relational ? schema18DeckNames(db) : schema11DeckNames(db)
  const decksByNote = firstCardDecks(db)

  const rows = db
    .prepare('select id, mid, tags, flds from notes order by id')
    .all() as Array<{ id: number, mid: number, tags: string, flds: string }>

  return rows.map(row => ({
    // ⚠️ **`\x1f`-joined, in `ord` order** — `split_fields`, research §2.2. The
    // same separator `04` §5.3 joins the *identity key* with, which is why
    // `shared/ingest/anki/line.ts` collapses it out of every value before a
    // line is built.
    fields: row.flds.split('\x1f'),
    fieldNames: fieldNames.get(row.mid) ?? [],
    // Anki pads a non-empty tag string at both ends (`join_tags`), so the split
    // has to drop empties rather than trust the shape.
    tags: row.tags.split(BLANK_RUN).filter(tag => tag !== ''),
    deckName: deckNames.get(decksByNote.get(row.id) ?? -1) ?? '',
  }))
}

/**
 * ⚠️ **`fields` joined to `notetypes`, and the join is the finding.** Anki's
 * exporter runs `DELETE FROM notetypes` over the stock notetypes and leaves
 * their `fields` rows behind — research §2.1 measured **18 rows for 1
 * notetype**. Selecting `fields` alone gives phantom names, and the phantoms are
 * `Front` and `Back`, which look entirely plausible as field 0.
 *
 * ⚠️ **No `ORDER BY name`, ever.** `fields.name` is declared
 * `COLLATE unicase`, `node:sqlite` has no `createCollation`, and a query that
 * compares by that column fails with `no such collation sequence` (ADR 0068
 * §2). Ordering by `ord` is what was wanted anyway.
 */
function schema18FieldNames(db: DatabaseSync): Map<number, string[]> {
  const rows = db
    .prepare(
      'select f.ntid as ntid, f.ord as ord, f.name as name '
      + 'from fields f join notetypes n on n.id = f.ntid '
      + 'order by f.ntid, f.ord',
    )
    .all() as Array<{ ntid: number, ord: number, name: string }>

  const names = new Map<number, string[]>()
  for (const row of rows) {
    const list = names.get(row.ntid) ?? []
    list[row.ord] = row.name
    names.set(row.ntid, list)
  }
  return names
}

/** Schema 11 keeps the notetypes as JSON in `col.models` — research §2.1. */
function schema11FieldNames(db: DatabaseSync): Map<number, string[]> {
  const models = jsonColumn(db, 'models')
  const names = new Map<number, string[]>()

  for (const [id, model] of Object.entries(models)) {
    const fields = (model as { flds?: Array<{ name?: unknown, ord?: unknown }> }).flds ?? []
    const list: string[] = []
    fields.forEach((field, index) => {
      const ord = typeof field.ord === 'number' ? field.ord : index
      list[ord] = typeof field.name === 'string' ? field.name : ''
    })
    names.set(Number(id), list)
  }

  return names
}

/**
 * ⚠️ **Schema 18 stores the hierarchy with `\x1f` and shows it with `::`**
 * (`NativeDeckName`, research §2.2). Schema 11's JSON already holds `::`. A
 * deck name with a raw `\x1f` in it would put a separator this project uses for
 * *identity keys* into a hint.
 */
function schema18DeckNames(db: DatabaseSync): Map<number, string> {
  const rows = db.prepare('select id, name from decks').all() as Array<{
    id: number
    name: string
  }>
  return new Map(rows.map(row => [row.id, row.name.replaceAll('\x1f', '::')]))
}

function schema11DeckNames(db: DatabaseSync): Map<number, string> {
  const decks = jsonColumn(db, 'decks')
  const names = new Map<number, string>()

  for (const [id, deck] of Object.entries(decks)) {
    const name = (deck as { name?: unknown }).name
    names.set(Number(id), typeof name === 'string' ? name : '')
  }

  return names
}

/**
 * ⚠️ **In schema 18 these columns are empty strings**, measured in research
 * §2.1, so a `JSON.parse` of one throws. Nothing calls this on that path; the
 * guard is here because the two schemas share the `col` table and the next
 * reader will not expect a `text not null` column to hold nothing.
 */
function jsonColumn(db: DatabaseSync, column: string): Record<string, unknown> {
  const row = db.prepare(`select ${column} as value from col`).get() as
    | { value: string }
    | undefined

  if (row === undefined || row.value === '')
    return {}

  try {
    const parsed: unknown = JSON.parse(row.value)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

/**
 * ⚠️ **A note's deck comes from its cards, not from the note** (research §2.2),
 * and one note's cards can sit in different decks — which is why ADR 0068 §3
 * says *the deck its first card sits in* rather than *its deck*. First is by
 * template (`ord`), then by id.
 */
function firstCardDecks(db: DatabaseSync): Map<number, number> {
  const rows = db
    .prepare('select nid, did from cards order by nid, ord, id')
    .all() as Array<{ nid: number, did: number }>

  const decks = new Map<number, number>()
  for (const row of rows) {
    if (!decks.has(row.nid))
      decks.set(row.nid, row.did)
  }
  return decks
}
