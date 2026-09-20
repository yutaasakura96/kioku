// The `.apkg` reader, against generated fixtures in all three layouts — #26.
//
// ⚠️ **Nothing here comes from a real deck.** The fixtures are built at test
// time by `anki-deck.ts` with invented notes; the repository is public and
// AnkiWeb's Shared Deck License is personal-studies-only
// (`anki-apkg-research.md` §3.3, §6).

import { describe, expect, it } from 'vitest'
import zlib from 'node:zlib'

import { ankiDeck, dummyCollection, metaFor, rawZip } from './anki-deck'
import type { FixtureNote, Layout as FixtureLayout } from './anki-deck'
import { layoutOf, metaVersion } from '../../server/utils/ingest/anki/collection'
import { NotAZip, readZip } from '../../server/utils/ingest/anki/zip'
import { DECK_BYTE_CAP, unpackDeck } from '../../server/utils/ingest/anki/unpack'

const VOCAB: FixtureNote[] = [
  {
    fields: [
      { name: 'expression', value: '図書館' },
      { name: 'reading', value: 'としょかん' },
      { name: 'meaning', value: 'library' },
    ],
    tags: ['JLPT_5', 'Genki'],
    deck: 'JLPT::N5',
  },
  {
    fields: [
      { name: 'expression', value: '<b>新聞</b>' },
      { name: 'reading', value: 'しんぶん' },
      { name: 'meaning', value: 'newspaper' },
    ],
    tags: ['JLPT_5'],
    deck: 'JLPT::N5',
  },
]

function unpacked(layout: FixtureLayout, notes: FixtureNote[] = VOCAB) {
  const result = unpackDeck(ankiDeck({ layout, notes }))
  if (!result.ok)
    throw new Error(`the fixture was refused: ${result.code}`)
  return result
}

describe('readZip', () => {
  it('reads a stored entry and a deflated one', () => {
    const entries = readZip(rawZip([
      { name: 'stored', data: Buffer.from('あ', 'utf8'), method: 0 },
      { name: 'deflated', data: Buffer.from('い'.repeat(200), 'utf8'), method: 8 },
    ]))

    expect(Buffer.from(entries.get('stored')!).toString('utf8')).toBe('あ')
    expect(Buffer.from(entries.get('deflated')!).toString('utf8')).toBe('い'.repeat(200))
  })

  it('refuses something that is not a zip', () => {
    expect(() => readZip(Buffer.from('not a zip at all', 'utf8'))).toThrow(NotAZip)
  })

  it('finds the directory behind a zip comment', () => {
    // ⚠️ The end-of-central-directory record is found by scanning backwards
    // because a comment of up to 65,535 bytes can follow it. A reader that
    // looks only at the last 22 bytes is wrong for any zip with a comment.
    const zip = Buffer.from(rawZip([{ name: 'a', data: Buffer.from('x'), method: 0 }]))
    zip.writeUInt16LE(5, zip.length - 2)
    const withComment = Buffer.concat([zip, Buffer.from('hello')])

    expect(readZip(withComment).has('a')).toBe(true)
  })
})

describe('metaVersion', () => {
  it('reads the two-byte form every measured exporter writes', () => {
    expect(metaVersion(metaFor(1))).toBe(1)
    expect(metaVersion(metaFor(2))).toBe(2)
    expect(metaVersion(metaFor(3))).toBe(3)
  })

  it('is a varint and not byte 1', () => {
    // ⚠️ Research §4.3 flags its own `meta[1]` sketch for this. A one-byte
    // varint is its own value, so the shortcut is right by coincidence until a
    // version passes 127 — and then it reads 0x80 as 128 where the varint says
    // 128 lives in two bytes.
    expect(metaVersion(new Uint8Array([0x08, 0x80, 0x01]))).toBe(128)
  })

  it('skips a field it does not need rather than giving up', () => {
    // A length-delimited field 2, then the version. A `meta` that grows a field
    // before this one still reads.
    expect(metaVersion(new Uint8Array([0x12, 0x02, 0x61, 0x62, 0x08, 0x03]))).toBe(3)
  })

  it('answers 0 for a `meta` with no version in it', () => {
    expect(metaVersion(new Uint8Array([]))).toBe(0)
  })
})

describe('layoutOf', () => {
  it('reads `meta` before it looks at any collection', () => {
    expect(layoutOf(readZip(ankiDeck({ layout: 'LEGACY_2', notes: VOCAB })))).toBe(2)
    expect(layoutOf(readZip(ankiDeck({ layout: 'LATEST', notes: VOCAB })))).toBe(3)
  })

  it('infers LEGACY_1 from a package with no `meta`', () => {
    expect(layoutOf(readZip(ankiDeck({ layout: 'LEGACY_1', notes: VOCAB })))).toBe(1)
  })

  it('infers LEGACY_2 from `collection.anki21` with no `meta`', () => {
    const entries = readZip(rawZip([
      { name: 'collection.anki21', data: Buffer.from('x'), method: 0 },
      { name: 'collection.anki2', data: Buffer.from('y'), method: 0 },
    ]))
    expect(layoutOf(entries)).toBe(2)
  })
})

describe.each<FixtureLayout>(['LEGACY_1', 'LEGACY_2', 'LATEST'])('unpackDeck — %s', (layout) => {
  it('reads every note as one `term⇥reading⇥hint` line', () => {
    const result = unpacked(layout)

    expect(result.content.split('\n')).toEqual([
      '図書館\tとしょかん\tJLPT_5 JLPT N5',
      '新聞\tしんぶん\tJLPT_5 JLPT N5',
    ])
    expect(result.deck.notes).toBe(2)
    expect(result.deck.dropped).toBe(0)
  })

  it('never reports the dummy "please update Anki" note', () => {
    // ⚠️ **The trap the `meta`-first order exists for.** Every export writes a
    // dummy `collection.anki2` (research §1.1), and research §1.3 measured a
    // real AnkiWeb download where opening it first returns that one note.
    const result = unpacked(layout)

    expect(result.content).not.toContain('Please update')
    expect(result.content.split('\n')).toHaveLength(2)
  })

  it('carries the level from the deck of the note\'s first card', () => {
    const result = unpacked(layout, [{
      fields: [{ name: 'expression', value: '会議' }, { name: 'reading', value: 'かいぎ' }],
      deck: 'JLPT::N3',
    }])

    expect(result.content).toBe('会議\tかいぎ\tJLPT N3')
  })

  it('never carries the deck\'s meaning', () => {
    // ADR 0068 §3's measurement: with the meaning, every real deck is over
    // `S2`'s cap.
    expect(unpacked(layout).content).not.toContain('library')
  })

  it('reads a furigana deck through Anki\'s own transforms', () => {
    const result = unpacked(layout, [{
      fields: [
        { name: 'Expression', value: '内陸[ないりく]' },
        { name: 'English definition', value: 'inland' },
      ],
      tags: ['JLPT_N1'],
    }])

    expect(result.content).toBe('内陸\tないりく\tJLPT_N1')
  })

  it('drops a note with no word in it and counts it', () => {
    const result = unpacked(layout, [
      ...VOCAB,
      { fields: [{ name: 'expression', value: '[sound:a.mp3]' }, { name: 'reading', value: '' }] },
    ])

    expect(result.deck.notes).toBe(3)
    expect(result.deck.dropped).toBe(1)
    expect(result.content.split('\n')).toHaveLength(2)
  })
})

describe('unpackDeck — schema 18', () => {
  it('reads field names through the join, not from `fields` alone', () => {
    // ⚠️ Research §2.1 measured **18 `fields` rows for 1 notetype**: Anki's
    // exporter deletes the stock notetypes and leaves their fields behind. A
    // reader that skips the join calls field 1 `Back` and finds no reading.
    const result = unpacked('LATEST', [{
      fields: [
        { name: 'expression', value: '図書館' },
        { name: 'reading', value: 'としょかん' },
      ],
    }])

    expect(result.content).toBe('図書館\tとしょかん\t')
  })

  it('gives a note no field names when its notetype row is gone', () => {
    // ⚠️ **This is what the join actually buys.** Anki's exporter runs
    // `DELETE FROM notetypes` and leaves the `fields` rows behind, so a note
    // whose notetype went with them still has names sitting in `fields` under
    // its `mid`. Reading `fields` alone hands that note a *deleted* notetype's
    // names; the join hands it none, and a column nobody named stays out of
    // the reading.
    const result = unpackDeck(ankiDeck({
      layout: 'LATEST',
      orphanedNote: true,
      notes: [{
        fields: [
          { name: 'expression', value: '図書館' },
          { name: 'notes to self', value: 'のーと' },
        ],
      }],
    }))

    expect(result.ok).toBe(true)
    // Without the join the ghost's second field is called `Reading` and のーと
    // arrives as this note's reading.
    expect(result.ok === true && result.content).toBe('図書館\t\t')
  })

  it('reads a deck whose names carry `COLLATE unicase`', () => {
    // ⚠️ ADR 0068 §2's measurement, reproduced: `node:sqlite` has no
    // `createCollation`, so the reader's queries must never order or compare by
    // `notetypes.name`, `fields.name`, `decks.name` or `tags.tag`. The fixture
    // carries the collation, so a query that grew an `ORDER BY name` fails
    // here with `no such collation sequence` rather than in production.
    const result = unpackDeck(ankiDeck({ layout: 'LATEST', notes: VOCAB, unicase: true }))

    expect(result.ok).toBe(true)
  })

  it('reads one that does not, so the guard is not the only thing under test', () => {
    const result = unpackDeck(ankiDeck({ layout: 'LATEST', notes: VOCAB, unicase: false }))

    expect(result.ok).toBe(true)
  })
})

describe('unpackDeck — refusals', () => {
  it('names a missing file', () => {
    expect(unpackDeck(undefined)).toMatchObject({ ok: false, code: 'no_file' })
    expect(unpackDeck(new Uint8Array())).toMatchObject({ ok: false, code: 'no_file' })
  })

  it('names a file that is not a zip', () => {
    expect(unpackDeck(Buffer.from('これはテキストです', 'utf8')))
      .toMatchObject({ ok: false, code: 'not_a_zip' })
  })

  it('names a zip with no collection', () => {
    const zip = rawZip([{ name: 'readme.txt', data: Buffer.from('hello'), method: 0 }])

    expect(unpackDeck(zip)).toMatchObject({ ok: false, code: 'no_collection' })
  })

  it('names a `meta` version this reader does not know — Anki\'s `TooNew`', () => {
    const zip = rawZip([
      { name: 'meta', data: metaFor(4), method: 0 },
      { name: 'collection.anki2', data: dummyCollection(), method: 0 },
    ])

    expect(unpackDeck(zip)).toMatchObject({ ok: false, code: 'unsupported_version' })
  })

  it('refuses rather than falling back to the dummy for an unknown version', () => {
    // ⚠️ The whole point of `TooNew`. The dummy is right there and readable;
    // reporting its one note would be worse than refusing.
    const zip = rawZip([
      { name: 'meta', data: metaFor(9), method: 0 },
      { name: 'collection.anki2', data: dummyCollection(), method: 0 },
    ])
    const result = unpackDeck(zip)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).not.toContain('Please update')
  })

  it('names a declared layout whose collection is absent', () => {
    const zip = rawZip([
      { name: 'meta', data: metaFor(3), method: 0 },
      { name: 'collection.anki2', data: dummyCollection(), method: 0 },
    ])

    expect(unpackDeck(zip)).toMatchObject({ ok: false, code: 'no_collection' })
  })

  it('names a collection it cannot read', () => {
    const zip = rawZip([
      { name: 'meta', data: metaFor(3), method: 0 },
      {
        name: 'collection.anki21b',
        data: new Uint8Array(zlib.zstdCompressSync(Buffer.from('not a database'))),
        method: 0,
      },
    ])

    expect(unpackDeck(zip)).toMatchObject({ ok: false, code: 'unreadable_collection' })
  })

  it('names a deck that is too large before it reads a byte of it', () => {
    // ⚠️ Vercel refuses anything over 4.5 MB itself, with a `413` our code
    // never sees (research §4.4). This is the refusal we *can* render.
    const oversized = new Uint8Array(DECK_BYTE_CAP + 1)

    expect(unpackDeck(oversized)).toMatchObject({ ok: false, code: 'too_large' })
  })

  it('names a deck whose every term came out blank, and not `no_collection`', () => {
    // ⚠️ **Its own code, because the collection *was* read.** `no_collection`
    // would tell the reader to re-export a file that is fine, and `empty` —
    // `readSubmission`'s answer — would tell them to paste some text.
    const zip = ankiDeck({
      layout: 'LATEST',
      notes: [{ fields: [{ name: 'expression', value: '[sound:a.mp3]' }] }],
    })
    const result = unpackDeck(zip)

    expect(result).toMatchObject({ ok: false, code: 'no_words' })
    expect(result.ok === false && result.message).not.toContain('no Anki collection')
  })

  it('gives every refusal its own sentence', () => {
    const codes = [
      'no_file',
      'too_large',
      'not_a_zip',
      'no_collection',
      'unsupported_version',
      'unreadable_collection',
      'no_words',
    ]
    const messages = new Set<string>()

    for (const zip of [
      undefined,
      new Uint8Array(DECK_BYTE_CAP + 1),
      Buffer.from('text'),
      rawZip([{ name: 'readme.txt', data: Buffer.from('x'), method: 0 }]),
      rawZip([{ name: 'meta', data: metaFor(4), method: 0 }]),
      rawZip([
        { name: 'meta', data: metaFor(3), method: 0 },
        { name: 'collection.anki21b', data: new Uint8Array(zlib.zstdCompressSync(Buffer.from('x'))), method: 0 },
      ]),
      ankiDeck({ layout: 'LATEST', notes: [{ fields: [{ name: 'expression', value: '' }] }] }),
    ]) {
      const result = unpackDeck(zip)
      expect(result.ok).toBe(false)
      if (!result.ok)
        messages.add(result.message)
    }

    expect(messages.size).toBe(codes.length)
  })
})
