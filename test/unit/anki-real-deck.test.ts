// One `.apkg` that **real Anki** wrote, against the fixtures this repo builds
// itself — #26.
//
// ⚠️ **This test exists because `anki-deck.ts` writes with the same three
// built-ins `server/utils/ingest/anki/` reads with** (ADR 0068 §2). A shared
// misunderstanding of the format would pass in both directions and every other
// test in the suite would stay green. `test/fixtures/anki/real-latest.apkg` is
// the outside opinion.
//
// ⚠️ **Its four notes are invented and nothing in it came from a downloaded
// deck.** The repository is public and AnkiWeb's Shared Deck License is
// personal-studies-only (`anki-apkg-research.md` §3.3, and Yuta's first triage
// call in §6).
//
// **How it was made.** Anki 26.09.2 from PyPI, in a throwaway venv, never added
// to `worker/pyproject.toml` — the wheel is 24 MB installed, it is
// AGPL-3.0-or-later and this repository carries no licence file (research §3.3,
// §4.1), and nothing in the product needs it:
//
//     uv venv /tmp/anki-venv --python 3.11
//     uv pip install --python /tmp/anki-venv/bin/python anki
//     /tmp/anki-venv/bin/python make-real-fixture.py test/fixtures/anki/real-latest.apkg
//
// `make-real-fixture.py` opens a fresh collection, puts four Basic notes into a
// deck called `JLPT::N5` with the tags `JLPT_5` and `Genki`, and calls
// `col.export_anki_package(options=ExportAnkiPackageOptions(legacy=False, …))`.
// The four fronts are `内陸[ないりく]`, `図書館`, `(かさを～) さす` and
// `[sound:nothing.mp3]`. Re-running it produces a new file with new ids; the
// assertions below are about shape, never about bytes.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { ankiDeck } from './anki-deck'
import { collectionBytes, layoutOf, readCollection } from '../../server/utils/ingest/anki/collection'
import { readZip } from '../../server/utils/ingest/anki/zip'
import { unpackDeck } from '../../server/utils/ingest/anki/unpack'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/anki/real-latest.apkg')

const REAL = new Uint8Array(readFileSync(FIXTURE))

/** The same four notes, described to this repo's own fixture builder. */
const SAME_NOTES = [
  { name: 'Front', value: '内陸[ないりく]', back: 'inland' },
  { name: 'Front', value: '図書館', back: 'library' },
  { name: 'Front', value: '(かさを～) さす', back: 'to put up (an umbrella)' },
  { name: 'Front', value: '[sound:nothing.mp3]', back: 'media only' },
].map(entry => ({
  fields: [
    { name: 'Front', value: entry.value },
    { name: 'Back', value: entry.back },
  ],
  tags: ['JLPT_5', 'Genki'],
  deck: 'JLPT::N5',
}))

describe('a package real Anki wrote', () => {
  it('carries the entries research §1.1 measured a modern export to carry', () => {
    const entries = readZip(REAL)

    // `meta`, the zstd collection, **the dummy**, and the media index. The
    // dummy is the one that matters: it is a whole 51,200-byte schema-11
    // collection sitting beside the real one.
    expect([...entries.keys()].sort()).toEqual([
      'collection.anki2',
      'collection.anki21b',
      'media',
      'meta',
    ])
    expect(entries.get('meta')).toEqual(new Uint8Array([0x08, 0x03]))
    // The zstd magic, because `LATEST` stores the entry and compresses the
    // bytes rather than the other way round.
    expect([...entries.get('collection.anki21b')!.subarray(0, 4)])
      .toEqual([0x28, 0xB5, 0x2F, 0xFD])
  })

  it('is LATEST, and its collection is schema 18', () => {
    const entries = readZip(REAL)

    expect(layoutOf(entries)).toBe(3)
    // Read through the relational tables rather than `col.models`, which
    // research §2.1 measured to be an empty string in schema 18.
    expect(readCollection(collectionBytes(entries, 3))[0]?.fieldNames).toEqual(['Front', 'Back'])
  })

  it('is read as the deck it is, and not as the dummy beside it', () => {
    const result = unpackDeck(REAL)

    expect(result.ok).toBe(true)
    expect(result.ok === true && result.content).not.toContain('Please update')
    expect(result.ok === true && result.deck.notes).toBe(4)
  })

  it('gives the same three lines this repo\'s own fixture builder gives', () => {
    // ⚠️ **The assertion that makes the other fixtures worth anything.** If
    // `anki-deck.ts` and the reader had agreed on something Anki does not do,
    // this is where the two answers part.
    const real = unpackDeck(REAL)
    const built = unpackDeck(ankiDeck({ layout: 'LATEST', notetype: 'Basic', notes: SAME_NOTES }))

    expect(real.ok && built.ok).toBe(true)
    expect(real.ok === true && real.content).toBe(built.ok === true && built.content)
  })

  it('reads the furigana, the entry shape and the media-only note the same way', () => {
    const result = unpackDeck(REAL)

    expect(result.ok === true && result.deck.lines).toEqual([
      // Anki's own `kanji` and `kana` transforms.
      '内陸\tないりく\tJLPT_5 JLPT N5',
      // No field is named like a reading, so the column is empty rather than
      // guessed — `Back` holds the meaning and the meaning never travels.
      '図書館\t\tJLPT_5 JLPT N5',
      // ⚠️ The entry shape: the term is cleaned and the raw field rides in the
      // hint, because the cleanup is not always right (ADR 0068 §3).
      'さす\t\tJLPT_5 JLPT N5 (かさを～) さす',
    ])
    // The media-only note is dropped and counted (ADR 0068 §8).
    expect(result.ok === true && result.deck.dropped).toBe(1)
  })

  it('never carries the deck\'s meaning', () => {
    const result = unpackDeck(REAL)

    for (const meaning of ['inland', 'library', 'umbrella', 'media only'])
      expect(result.ok === true && result.content).not.toContain(meaning)
  })
})
