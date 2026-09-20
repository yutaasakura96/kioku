// A `.apkg` built from nothing, in any of Anki's three layouts — #26's fixtures.
//
// ⚠️ **Generated, never downloaded.** The repository is public, and AnkiWeb's
// Shared Deck License is personal-studies-only: a real deck committed as a
// fixture, or a row copied out of one, would be redistribution
// (`anki-apkg-research.md` §3.3, and Yuta's first triage call in §6). Every note
// this file writes is invented.
//
// ⚠️ **It writes with the same three built-ins the reader reads with**
// (ADR 0068 §2), which is a weakness worth naming: a shared misunderstanding of
// the format would pass both ways. `anki-real-deck.test.ts` is the answer — one
// committed `.apkg` that real Anki exported, checked against what this file
// produces.
//
// The DDL is the subset `anki-apkg-research.md` §2.1 names, and no more: `col`,
// `notes` and `cards` in both schemas, plus `notetypes`, `fields`, `decks` and
// `tags` in schema 18.

import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import zlib from 'node:zlib'

/** Anki's `PackageMetadata.version` — research §1.1's table. */
export type Layout = 'LEGACY_1' | 'LEGACY_2' | 'LATEST'

export interface FixtureField {
  name: string
  /** The value, `\x1f`-joined into `notes.flds` in this order. */
  value: string
}

export interface FixtureNote {
  fields: FixtureField[]
  /** Written into `notes.tags` with Anki's leading and trailing space. */
  tags?: string[]
  /** The deck its cards sit in, `::`-separated. */
  deck?: string
}

export interface DeckOptions {
  layout: Layout
  notes: FixtureNote[]
  /** The notetype's name. Every note in a fixture shares one, as real decks do. */
  notetype?: string
  /**
   * ⚠️ **Phantom `fields` rows, on by default for schema 18.** Anki's exporter
   * runs `DELETE FROM notetypes` over the stock notetypes and leaves their
   * `fields` rows behind — research §2.1 measured 18 rows for 1 notetype. A
   * reader that selects `fields` without joining `notetypes` reads those names.
   */
  phantomFields?: boolean
  /**
   * ⚠️ **A note whose notetype row is gone but whose `fields` rows are not.**
   * This is what makes the join in `schema18FieldNames` load-bearing rather
   * than tidy: reading `fields` alone gives that note the **deleted**
   * notetype's field names, and reading it through the join gives it none.
   *
   * ⚠️ **Sharpened past what an export produces, deliberately.** The phantoms a
   * real export leaves behind are the stock notetypes, whose names are `Front`
   * and `Back` — names no rule in `line.ts` would act on, so the mistake would
   * be invisible. The ghost here carries a name that *does* match
   * `READING_NAME`, which turns "the reader used names it should not have" into
   * a reading appearing where the deck supplied none.
   */
  orphanedNote?: boolean
  /**
   * ⚠️ **`COLLATE unicase` on the five text columns Anki collates, on by
   * default for schema 18.** It cannot be written directly — `node:sqlite` has
   * no `createCollation` and `CREATE TABLE … COLLATE unicase` fails outright
   * (measured on Node 24.11) — so the tables are created plain and the stored
   * DDL is rewritten through `PRAGMA writable_schema`. That is what a real
   * export looks like from the outside: the queries the reader needs run, and
   * anything that **orders or compares** by one of those columns fails with
   * `no such collation sequence` (ADR 0068 §2).
   */
  unicase?: boolean
}

const SCHEMA_11_TABLES = `
  create table col (
    id integer primary key, crt integer not null, mod integer not null,
    scm integer not null, ver integer not null, dty integer not null,
    usn integer not null, ls integer not null, conf text not null,
    models text not null, decks text not null, dconf text not null,
    tags text not null
  );
  create table notes (
    id integer primary key, guid text not null, mid integer not null,
    mod integer not null, usn integer not null, tags text not null,
    flds text not null, sfld integer not null, csum integer not null,
    flags integer not null, data text not null
  );
  create table cards (
    id integer primary key, nid integer not null, did integer not null,
    ord integer not null, mod integer not null, usn integer not null,
    type integer not null, queue integer not null, due integer not null,
    ivl integer not null, factor integer not null, reps integer not null,
    lapses integer not null, left integer not null, odue integer not null,
    odid integer not null, flags integer not null, data text not null
  );
`

const SCHEMA_18_TABLES = `
  create table notetypes (
    id integer not null primary key, name text not null,
    mtime_secs integer not null, usn integer not null, config blob not null
  );
  create table fields (
    ntid integer not null, ord integer not null, name text not null,
    config blob not null, primary key (ntid, ord)
  ) without rowid;
  create table decks (
    id integer primary key not null, name text not null,
    mtime_secs integer not null, usn integer not null,
    common blob not null, kind blob not null
  );
  create table tags (
    tag text not null primary key, usn integer not null,
    collapsed boolean not null, config blob null
  ) without rowid;
`

/** The columns Anki declares `COLLATE unicase` — research §2.1. */
const COLLATED: ReadonlyArray<readonly [string, string]> = [
  ['notetypes', 'name text not null'],
  ['fields', 'name text not null'],
  ['decks', 'name text not null'],
  ['tags', 'tag text not null'],
]

const NOTETYPE_ID = 1_700_000_000_001
/** The notetype Anki's exporter deleted, whose `fields` rows it did not. */
const GHOST_NOTETYPE_ID = 1_700_000_000_002
const FIRST_NOTE_ID = 1_700_000_000_100
const FIRST_DECK_ID = 1_700_000_000_200

function withTemporaryDatabase(build: (db: DatabaseSync) => void): Uint8Array {
  const directory = mkdtempSync(join(tmpdir(), 'kioku-anki-fixture-'))
  const path = join(directory, 'collection.sqlite')
  try {
    const db = new DatabaseSync(path)
    try {
      build(db)
    }
    finally {
      db.close()
    }
    return new Uint8Array(readFileSync(path))
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function deckIds(notes: FixtureNote[]): Map<string, number> {
  const ids = new Map<string, number>()
  for (const note of notes) {
    const name = note.deck ?? 'Default'
    if (!ids.has(name))
      ids.set(name, FIRST_DECK_ID + ids.size)
  }
  return ids
}

function insertNotesAndCards(
  db: DatabaseSync,
  notes: FixtureNote[],
  decks: Map<string, number>,
  options: DeckOptions = { layout: 'LEGACY_1', notes },
): void {
  const note = db.prepare(
    'insert into notes values (?, ?, ?, 0, -1, ?, ?, ?, 0, 0, \'\')',
  )
  const card = db.prepare(
    'insert into cards values (?, ?, ?, ?, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, \'\')',
  )

  notes.forEach((entry, index) => {
    const id = FIRST_NOTE_ID + index
    const mid = options.orphanedNote && index === notes.length - 1
      ? GHOST_NOTETYPE_ID
      : NOTETYPE_ID
    const values = entry.fields.map(field => field.value)
    // Anki pads a non-empty tag string at both ends — `join_tags`, research §2.2.
    const tags = entry.tags?.length ? ` ${entry.tags.join(' ')} ` : ''
    note.run(id, `guid-${index}`, mid, tags, values.join('\x1f'), values[0] ?? '')
    // Two cards on the first note, so "the deck its **first** card sits in" is
    // a claim with something to be wrong about.
    card.run(id * 10, id, decks.get(entry.deck ?? 'Default')!, 0)
    if (index === 0)
      card.run(id * 10 + 1, id, decks.get(entry.deck ?? 'Default')!, 1)
  })
}

function applyUnicase(db: DatabaseSync): void {
  db.exec('pragma writable_schema=ON')
  const update = db.prepare(
    'update sqlite_master set sql = replace(sql, ?, ?) where type = \'table\' and name = ?',
  )
  for (const [table, column] of COLLATED)
    update.run(column, `${column} collate unicase`, table)
  db.exec('pragma writable_schema=OFF')
}

function buildSchema11(options: DeckOptions): Uint8Array {
  const decks = deckIds(options.notes)
  const names = options.notes[0]?.fields.map(field => field.name) ?? []

  const models = JSON.stringify({
    [String(NOTETYPE_ID)]: {
      id: NOTETYPE_ID,
      name: options.notetype ?? 'Kioku Test Vocab',
      sortf: 0,
      flds: names.map((name, ord) => ({ name, ord })),
    },
  })
  const deckJson = JSON.stringify(
    Object.fromEntries([...decks].map(([name, id]) => [String(id), { id, name }])),
  )

  return withTemporaryDatabase((db) => {
    db.exec(SCHEMA_11_TABLES)
    db.prepare(
      'insert into col values (1, 0, 0, 0, 11, 0, 0, 0, \'{}\', ?, ?, \'{}\', \'{}\')',
    ).run(models, deckJson)
    insertNotesAndCards(db, options.notes, decks)
  })
}

function buildSchema18(options: DeckOptions): Uint8Array {
  const decks = deckIds(options.notes)
  const names = options.notes[0]?.fields.map(field => field.name) ?? []

  return withTemporaryDatabase((db) => {
    db.exec(SCHEMA_11_TABLES)
    db.exec(SCHEMA_18_TABLES)
    // ⚠️ `col.models` and `col.decks` are **empty strings** in schema 18, which
    // research §2.1 measured. A reader that falls back to the JSON without
    // noticing the relational tables gets nothing rather than an error.
    db.exec('insert into col values (1, 0, 0, 0, 18, 0, 0, 0, \'{}\', \'\', \'\', \'\', \'\')')

    db.prepare('insert into notetypes values (?, ?, 0, -1, x\'\')')
      .run(NOTETYPE_ID, options.notetype ?? 'Kioku Test Vocab')

    const field = db.prepare('insert into fields values (?, ?, ?, x\'\')')
    names.forEach((name, ord) => field.run(NOTETYPE_ID, ord, name))

    if (options.phantomFields !== false) {
      // Left behind by `DELETE FROM notetypes` — research §2.1's 18 rows for 1
      // notetype. ⚠️ The second name is `Reading` rather than the stock
      // `Back`, so that a reader which skipped the join is *observably* wrong
      // rather than merely reading names it had no right to (see
      // `orphanedNote`).
      field.run(GHOST_NOTETYPE_ID, 0, 'Front')
      field.run(GHOST_NOTETYPE_ID, 1, 'Reading')
    }

    const deck = db.prepare('insert into decks values (?, ?, 0, -1, x\'\', x\'\')')
    for (const [name, id] of decks) {
      // ⚠️ Schema 18 stores the hierarchy with `\x1f` and shows it with `::`
      // (research §2.2). Schema 11's JSON stores it with `::` already.
      deck.run(id, name.replaceAll('::', '\x1f'))
    }

    insertNotesAndCards(db, options.notes, decks, options)

    if (options.unicase !== false)
      applyUnicase(db)
  })
}

/**
 * The dummy `collection.anki2` **every** export writes, legacy ones included —
 * research §1.1, `write_dummy_collection`.
 *
 * ⚠️ **This is the trap the `meta`-first order exists for.** A reader that looks
 * for `collection.anki2` first reads this and reports one note.
 */
export function dummyCollection(): Uint8Array {
  return buildSchema11({
    layout: 'LEGACY_1',
    notetype: 'Basic',
    notes: [{
      fields: [
        { name: 'Front', value: 'Please update to the latest Anki version, then import the deck again.' },
        { name: 'Back', value: '' },
      ],
    }],
  })
}

interface ZipEntry {
  name: string
  data: Uint8Array
  /** `0` stored, `8` deflate — the two methods real `.apkg` files use. */
  method: 0 | 8
}

function zip(entries: ZipEntry[]): Uint8Array {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const body = entry.method === 8
      ? new Uint8Array(zlib.deflateRawSync(entry.data))
      : entry.data
    const crc = zlib.crc32(entry.data)

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034B50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0, 6)
    header.writeUInt16LE(entry.method, 8)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(body.length, 18)
    header.writeUInt32LE(entry.data.length, 22)
    header.writeUInt16LE(name.length, 26)
    local.push(header, name, body)

    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014B50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(entry.method, 10)
    directory.writeUInt32LE(crc, 16)
    directory.writeUInt32LE(body.length, 20)
    directory.writeUInt32LE(entry.data.length, 24)
    directory.writeUInt16LE(name.length, 28)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, name)

    offset += header.length + name.length + body.length
  }

  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)

  return new Uint8Array(Buffer.concat([...local, directory, end]))
}

/**
 * `meta`, as the two-byte protobuf every measured exporter writes: field 1,
 * wire type 0, then the version — research §1.1.
 */
export function metaFor(version: number): Uint8Array {
  return new Uint8Array([0x08, version])
}

/**
 * A `.apkg` in the requested layout, with the entries a real export carries.
 *
 * The compression and the entry set are research §1.1's measured export:
 * `LATEST` stores a zstd-compressed `collection.anki21b`, `LEGACY_2` deflates
 * `collection.anki21`, and both ship the dummy beside it.
 */
export function ankiDeck(options: DeckOptions): Uint8Array {
  if (options.layout === 'LEGACY_1') {
    // ⚠️ **No `meta`.** This is what `genanki` writes, and three of the four
    // decks measured in research §1.3 are this shape.
    return zip([
      { name: 'collection.anki2', data: buildSchema11(options), method: 8 },
      { name: 'media', data: Buffer.from('{}', 'utf8'), method: 0 },
    ])
  }

  if (options.layout === 'LEGACY_2') {
    return zip([
      { name: 'meta', data: metaFor(2), method: 0 },
      { name: 'collection.anki21', data: buildSchema11(options), method: 8 },
      { name: 'collection.anki2', data: dummyCollection(), method: 0 },
      { name: 'media', data: Buffer.from('{}', 'utf8'), method: 0 },
    ])
  }

  return zip([
    { name: 'meta', data: metaFor(3), method: 0 },
    {
      name: 'collection.anki21b',
      data: new Uint8Array(zlib.zstdCompressSync(buildSchema18(options))),
      method: 0,
    },
    { name: 'collection.anki2', data: dummyCollection(), method: 0 },
    { name: 'media', data: new Uint8Array(zlib.zstdCompressSync(Buffer.alloc(0))), method: 0 },
  ])
}

/** A zip of exactly these entries, for the reader's refusal paths. */
export function rawZip(entries: ZipEntry[]): Uint8Array {
  return zip(entries)
}
