// The starter set, loaded — `scripts/starter/load.ts` and
// `server/utils/category/queries.ts`, against a real database (ADR 0075, #68).
//
// ⚠️ **The committed bundle, all of it.** #68's criterion is that *each word
// carries its list-sourced JLPT level and a category*, and a sample cannot say
// "each". 8,273 *notes* load in under a second, once, in `beforeAll`; the tests
// that write on top of them clean up the rows they added.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import {
  StarterBundleRefused,
  loadStarterSet,
  readStarterBundle,
} from '../../scripts/starter/load'
import type { StarterBundle, StarterLoad } from '../../scripts/starter/load'
import * as schema from '../../server/db/schema'
import { categories, categoriesOfNote, listedLevel, noteInCategory } from '../../server/utils/category/queries'
import { newCards } from '../../server/utils/review/queries'
import { queueBatch } from '../../server/utils/vet/queries'
import { categoryKey, parseCategoryKey } from '../../shared/category/category'
import { answerSteps } from '../../shared/review/answer'
import { jlptVocab, levelValues, renderIdentityKey } from '../../shared/subject/declaration'
import { freshDatabase } from './harness'
import type { SchemaDatabase } from './harness'

let client: PGlite
let db: SchemaDatabase
let bundle: StarterBundle
let first: StarterLoad

const OWNER = 'usr_test'
const LEVELS = levelValues(jlptVocab)

beforeAll(async () => {
  ({ client, db } = await freshDatabase())
  await client.exec(`
    INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('${OWNER}', 'Reader', 'reader@example.test', true, now(), now());
  `)
  bundle = readStarterBundle()
  first = await loadStarterSet(client, bundle)
}, 60_000)

// Everything a test below adds hangs off a *source* or a *card*; the starter
// *notes* themselves are put back by the tests that touch them.
//
// ⚠️ `DELETE`, not `TRUNCATE … CASCADE`: `note.origin_ingestion_id` references
// `ingestion`, so truncating that table cascades into every starter *note*.
afterEach(async () => {
  await client.exec(`
    DELETE FROM card_flag;
    DELETE FROM card;
    DELETE FROM note_vetting;
    DELETE FROM occurrence;
    DELETE FROM source_chunk;
    DELETE FROM source;
    DELETE FROM level_claim WHERE authority_key IS NULL;
    DELETE FROM level_claim WHERE note_id IN (SELECT id FROM note WHERE subject_id <> 'jlpt-vocab-2');
    DELETE FROM note WHERE subject_id <> 'jlpt-vocab-2' OR identity_key LIKE 'own-%';
  `)
})

async function one<T = { id: string }>(sql: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(sql, values)
  return result.rows[0]!
}

async function noteOf(term: string, reading: string): Promise<string> {
  const { id } = await one(
    'SELECT id FROM note WHERE subject_id = $1 AND identity_key = $2',
    [jlptVocab.subject_id, renderIdentityKey(jlptVocab, { term, reading })],
  )
  return id
}

async function source(kind: 'anki' | 'word_list' | 'prose', title: string, subjectId = jlptVocab.subject_id) {
  const { id } = await one(
    `INSERT INTO source (subject_id, kind, title, content, content_hash, char_count)
     VALUES ($1, $2, $3, '会う', $4, 2) RETURNING id`,
    [subjectId, kind, title, `hash-${title}`],
  )
  const chunk = await one(
    `INSERT INTO source_chunk (source_id, ordinal, char_start, char_end, content_hash)
     VALUES ($1, 0, 0, 2, 'c') RETURNING id`,
    [id],
  )
  return { id, chunkId: chunk.id }
}

async function seenIn(noteId: string, from: { id: string, chunkId: string }) {
  await client.query(
    `INSERT INTO occurrence (note_id, source_id, source_chunk_id, char_start, char_end, surface_form)
     VALUES ($1, $2, $3, 0, 2, '会う')`,
    [noteId, from.id, from.chunkId],
  )
}

describe('loading the starter set', () => {
  it('creates one note per word and reports the count at each level', () => {
    expect(first.words).toBe(bundle.words.length)
    expect(first.created).toBe(bundle.words.length)
    expect(first.existing).toBe(0)
    expect(first.byLevel).toEqual(bundle.counts)
    // The figures the PR reports. A refresh that moves them is a reviewed diff.
    expect(first.byLevel).toEqual({ N5: 684, N4: 640, N3: 1730, N2: 1811, N1: 3408 })
  })

  it('writes a note of the four fields a dictionary supplies, under the current subject', async () => {
    const { subject_id, fields } = await one<{ subject_id: string, fields: Record<string, string> }>(
      'SELECT subject_id, fields FROM note WHERE id = $1',
      [await noteOf('会う', 'あう')],
    )

    expect(subject_id).toBe('jlpt-vocab-2')
    expect(Object.keys(fields).sort()).toEqual(['meaning', 'part_of_speech', 'reading', 'term'])
    expect(fields.term).toBe('会う')
    expect(fields.reading).toBe('あう')
    expect(fields.part_of_speech).toBe('intransitive verb')
    expect(fields.meaning).toContain('to meet')
  })

  // #68: *each word carries its list-sourced JLPT level* — every one of them,
  // exactly one claim, under the declared authority and at the bundle's level.
  it('gives every word exactly one level claim, the list\'s, and no model\'s', async () => {
    const claims = await client.query<{ authority_key: string | null, model_id: string | null, level: string, n: number }>(`
      SELECT authority_key, model_id, level, count(*)::int AS n
      FROM level_claim GROUP BY authority_key, model_id, level;
    `)

    expect(claims.rows.every(row => row.authority_key === 'tanos-jlpt' && row.model_id === null)).toBe(true)
    expect(Object.fromEntries(claims.rows.map(row => [row.level, row.n]))).toEqual(bundle.counts)

    const unclaimed = await one<{ n: number }>(`
      SELECT count(*)::int AS n FROM note n
      WHERE (SELECT count(*) FROM level_claim c WHERE c.note_id = n.id) <> 1;
    `)
    expect(unclaimed.n).toBe(0)
  })

  it('attributes every field and every accepted meaning to the dictionary, by version', async () => {
    const provenance = await client.query<{ kind: string, dictionary_version: string | null, model_id: string | null, n: number }>(`
      SELECT kind, dictionary_version, model_id, count(*)::int AS n
      FROM note_field_provenance GROUP BY kind, dictionary_version, model_id;
    `)
    expect(provenance.rows).toEqual([
      { kind: 'lookup', dictionary_version: bundle.sources.jmdict.version, model_id: null, n: bundle.words.length * 4 },
    ])

    const meanings = await client.query<{ dictionary_version: string | null, model_id: string | null, n: number }>(`
      SELECT dictionary_version, model_id, count(*)::int AS n
      FROM note_meaning GROUP BY dictionary_version, model_id;
    `)
    expect(meanings.rows).toEqual([
      { dictionary_version: bundle.sources.jmdict.version, model_id: null, n: bundle.words.length },
    ])
  })

  it('mints no card: a starter word is nobody\'s until they start it', async () => {
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM card')).n).toBe(0)
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM note_vetting')).n).toBe(0)
  })

  it('writes nothing the second time', async () => {
    const again = await loadStarterSet(client, bundle)

    expect(again).toEqual({ ...first, created: 0, existing: bundle.words.length, refreshed: 0 })
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM note')).n).toBe(bundle.words.length)
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM level_claim')).n).toBe(bundle.words.length)
  })
})

// `shared/review/answer.ts`: a term written only in kana is its own reading, so
// the card asks for the meaning alone. The starter set must not break that by
// giving a kana word a kanji spelling the list did not use.
describe('the kana-only rule, over the starter set', () => {
  const KANA = /^[ぁ-ゖァ-ヺー]+$/

  it('asks a kana-only starter word for its meaning and never its reading', () => {
    const kana = bundle.words.filter(word => KANA.test(word.term))

    expect(kana.length).toBeGreaterThan(1000)
    expect(kana.filter(word => answerSteps(word.term).join() !== 'meaning')).toEqual([])
    // ADR 0045: the reading is hiragana unless the term is wholly katakana, so
    // サボる reads さぼる. Three words; the rest are their own reading.
    expect(kana.filter(word => word.reading !== word.term).map(word => `${word.term} ${word.reading}`))
      .toEqual(['ローマじ ろーまじ', 'サボる さぼる', 'ダブる だぶる'])
  })

  it('still asks a word with kanji for both', () => {
    expect(answerSteps('会う')).toEqual(['reading', 'meaning'])
    const kanji = bundle.words.filter(word => !KANA.test(word.term))
    expect(kanji.filter(word => answerSteps(word.term).length !== 2).map(word => word.term)).toEqual([])
  })
})

describe('refreshing from a newer bundle', () => {
  const newer = (term: string, meaning: string): StarterBundle => ({
    ...bundle,
    sources: { ...bundle.sources, jmdict: { created: '2026-11-09', version: 'JMdict 2026-11-09' } },
    words: bundle.words
      .filter(word => word.term === term)
      .map(word => ({ ...word, level: 'N4', meaning, meanings: [meaning] })),
  })

  async function restore() {
    await client.exec('DELETE FROM note_field_provenance; DELETE FROM note_meaning;')
    await client.query(
      `UPDATE note SET fields = jsonb_set(fields, '{meaning}', to_jsonb($2::text)) WHERE id = $1`,
      [await noteOf('会う', 'あう'), bundle.words.find(word => word.term === '会う')!.meaning],
    )
    await loadStarterSet(client, bundle)
  }

  it('brings a word nobody has started up to the current entry, and says which version', async () => {
    const id = await noteOf('会う', 'あう')

    const load = await loadStarterSet(client, newer('会う', 'to meet up'))

    expect(load).toMatchObject({ created: 0, existing: 1, refreshed: 1 })
    expect((await one<{ meaning: string }>(`SELECT fields->>'meaning' AS meaning FROM note WHERE id = $1`, [id])).meaning)
      .toBe('to meet up')
    expect(await listedLevel(db, id)).toBe('N4')
    const versions = await client.query<{ field_name: string, dictionary_version: string }>(
      'SELECT field_name, dictionary_version FROM note_field_provenance WHERE note_id = $1 ORDER BY field_name',
      [id],
    )
    expect(versions.rows).toEqual([
      { field_name: 'meaning', dictionary_version: 'JMdict 2026-11-09' },
      { field_name: 'part_of_speech', dictionary_version: 'JMdict 2026-11-09' },
      { field_name: 'reading', dictionary_version: bundle.sources.jmdict.version },
      { field_name: 'term', dictionary_version: bundle.sources.jmdict.version },
    ])
    expect((await one<{ meanings: string[] }>('SELECT meanings FROM note_meaning WHERE note_id = $1', [id])).meanings)
      .toEqual(['to meet up'])

    await restore()
  })

  // `S6`'s freeze (ADR 0052): the fields a reader is studying are not rewritten
  // under their review history. The accepted-meanings list is not the card.
  it('leaves the fields of a word a reader has started, and still widens what is accepted', async () => {
    const id = await noteOf('会う', 'あう')
    const before = await one<{ meaning: string }>(`SELECT fields->>'meaning' AS meaning FROM note WHERE id = $1`, [id])
    await client.query(
      `INSERT INTO note_vetting (note_id, owner_id, state, vetted_at) VALUES ($1, $2, 'accepted', now())`,
      [id, OWNER],
    )

    const load = await loadStarterSet(client, newer('会う', 'to meet up'))

    expect(load.refreshed).toBe(0)
    expect(await one(`SELECT fields->>'meaning' AS meaning FROM note WHERE id = $1`, [id])).toEqual(before)
    expect((await one<{ meanings: string[] }>('SELECT meanings FROM note_meaning WHERE note_id = $1', [id])).meanings)
      .toEqual(['to meet up'])

    await client.exec('DELETE FROM note_vetting;')
    await restore()
  })

  it('leaves a note a person edited, whoever has or has not started it', async () => {
    const id = await noteOf('会う', 'あう')
    await client.query(
      `UPDATE note_field_provenance SET kind = 'human', dictionary_version = NULL
       WHERE note_id = $1 AND field_name = 'meaning'`,
      [id],
    )

    expect((await loadStarterSet(client, newer('会う', 'to meet up'))).refreshed).toBe(0)

    await restore()
  })

  it('never replaces a list of accepted meanings a model wrote', async () => {
    const id = await noteOf('会う', 'あう')
    await client.query(
      `UPDATE note_meaning SET meanings = '{see}', dictionary_version = NULL, model_id = 'm', prompt_version = 'v6'
       WHERE note_id = $1`,
      [id],
    )

    await loadStarterSet(client, bundle)

    expect((await one<{ meanings: string[] }>('SELECT meanings FROM note_meaning WHERE note_id = $1', [id])).meanings)
      .toEqual(['see'])

    await restore()
  })
})

describe('a bundle the declaration does not expect', () => {
  function written(patch: (bundle: StarterBundle) => StarterBundle): string {
    const path = join(mkdtempSync(join(tmpdir(), 'kioku-starter-')), 'bundle.json')
    writeFileSync(path, JSON.stringify(patch({ ...bundle, words: bundle.words.slice(0, 3) })))
    return path
  }

  it('is refused for an authority the subject does not declare', () => {
    expect(() => readStarterBundle(written(b => ({ ...b, authority: 'someone-else' }))))
      .toThrow(StarterBundleRefused)
  })

  it('is refused for a level outside the declared set', () => {
    expect(() => readStarterBundle(written(b => ({ ...b, words: [{ ...b.words[0]!, level: 'N6' }] }))))
      .toThrow(/N6/)
  })

  it('is refused for a word with no meaning, or one listed twice', () => {
    expect(() => readStarterBundle(written(b => ({ ...b, words: [{ ...b.words[0]!, meaning: ' ' }] }))))
      .toThrow(/no meaning/)
    expect(() => readStarterBundle(written(b => ({ ...b, words: [b.words[0]!, b.words[0]!] }))))
      .toThrow(/twice/)
  })
})

// #68: *each word carries its list-sourced JLPT level and a category.*
describe('categories', () => {
  it('lists the five JLPT levels with the starter set\'s words in them, and nothing else yet', async () => {
    expect(await categories(db)).toEqual(LEVELS.map(level => ({
      key: `jlpt:${level}`,
      group: 'jlpt',
      label: level,
      words: bundle.counts[level],
    })))
  })

  it('puts every starter word in the category of its level, and in no other level\'s', async () => {
    for (const level of LEVELS) {
      const ref = parseCategoryKey(`jlpt:${level}`)!
      const inIt = await db.$count(schema.note, noteInCategory(db, ref, schema.note.id))
      expect(inIt, level).toBe(bundle.counts[level])
    }

    const id = await noteOf('会う', 'あう')
    expect(await listedLevel(db, id)).toBe('N5')
    expect(await categoriesOfNote(db, id)).toEqual(['jlpt:N5'])
  })

  it('adds an imported deck and the reader\'s own words under My decks', async () => {
    const deck = await source('anki', 'Core 2k')
    const list = await source('word_list', '今週の単語')
    const meet = await noteOf('会う', 'あう')
    const own = (await one(
      `INSERT INTO note (subject_id, identity_key, fields)
       VALUES ('jlpt-vocab-2', 'own-1', '{"term":"推し活","reading":"おしかつ"}'::jsonb) RETURNING id`,
    )).id
    await seenIn(meet, deck)
    await seenIn(meet, list)
    await seenIn(own, list)

    const shelf = await categories(db)

    expect(shelf.slice(LEVELS.length)).toEqual([
      { key: `deck:${deck.id}`, group: 'my-decks', label: 'Core 2k', words: 1 },
      { key: 'my-words', group: 'my-decks', label: 'My words', words: 2 },
    ])
    // A word is in every category that holds it: the list's level, the deck
    // that taught it, and the reader's own list.
    expect(await categoriesOfNote(db, meet)).toEqual(['jlpt:N5', `deck:${deck.id}`, 'my-words'])
    // A word the list does not carry has no level, and is found by where it
    // came from.
    expect(await listedLevel(db, own)).toBeNull()
    expect(await categoriesOfNote(db, own)).toEqual(['my-words'])
    expect(await db.$count(schema.note, noteInCategory(db, { kind: 'deck', sourceId: deck.id }, schema.note.id))).toBe(1)
    expect(await db.$count(schema.note, noteInCategory(db, { kind: 'my-words' }, schema.note.id))).toBe(2)
  })

  it('lists a deck whose import has written nothing yet, at zero', async () => {
    const deck = await source('anki', 'Core 6k')

    expect((await categories(db)).at(-1)).toEqual({
      key: categoryKey({ kind: 'deck', sourceId: deck.id }),
      group: 'my-decks',
      label: 'Core 6k',
      words: 0,
    })
  })

  it('drops a deleted source from the shelf and keeps its words in their level', async () => {
    const deck = await source('anki', 'Core 2k')
    const meet = await noteOf('会う', 'あう')
    await seenIn(meet, deck)
    await db.update(schema.source).set({ deletedAt: new Date() }).where(eq(schema.source.id, deck.id))

    expect(await categories(db)).toHaveLength(LEVELS.length)
    expect(await categoriesOfNote(db, meet)).toEqual(['jlpt:N5'])
  })

  // ADR 0075 §2: a model's estimate is no longer the source of a word's level.
  it('does not let a model\'s estimate put a word at a level', async () => {
    const own = (await one(
      `INSERT INTO note (subject_id, identity_key, fields)
       VALUES ('jlpt-vocab-2', 'own-2', '{"term":"推し活","reading":"おしかつ"}'::jsonb) RETURNING id`,
    )).id
    await client.query(
      `INSERT INTO level_claim (note_id, level, model_id, prompt_version) VALUES ($1, 'N5', 'm', 'v6')`,
      [own],
    )

    expect(await listedLevel(db, own)).toBeNull()
    expect(await categoriesOfNote(db, own)).toEqual([])
    expect((await categories(db))[0]).toMatchObject({ key: 'jlpt:N5', words: bundle.counts.N5 })
  })

  it('counts nothing from the subject the reader left', async () => {
    const old = (await one(
      `INSERT INTO note (subject_id, identity_key, fields)
       VALUES ('jlpt-vocab', 'old-1', '{"term":"古い","reading":"ふるい"}'::jsonb) RETURNING id`,
    )).id
    await client.query(`INSERT INTO level_claim (note_id, authority_key, level) VALUES ($1, 'tanos-jlpt', 'N5')`, [old])
    const deck = await source('anki', 'An old deck', 'jlpt-vocab')
    await seenIn(old, deck)

    expect(await categories(db)).toEqual(LEVELS.map(level => expect.objectContaining({ words: bundle.counts[level] })))

  })
})

// The read side of *levels from the list*: the *session* filter and the Vet
// strip both stop reading a model's estimate as a level.
describe('a level, wherever a screen reads one', () => {
  async function minted(noteId: string): Promise<string> {
    await client.query(
      `INSERT INTO note_vetting (note_id, owner_id, state, vetted_at) VALUES ($1, $2, 'accepted', now())`,
      [noteId, OWNER],
    )
    return (await one(
      `INSERT INTO card (note_id, owner_id, template_key) VALUES ($1, $2, 'recognition') RETURNING id`,
      [noteId, OWNER],
    )).id
  }

  it('filters new cards by the list\'s level and not by a model\'s estimate', async () => {
    const listed = await minted(await noteOf('会う', 'あう'))
    const own = (await one(
      `INSERT INTO note (subject_id, identity_key, fields)
       VALUES ('jlpt-vocab-2', 'own-3', '{"term":"推し活","reading":"おしかつ"}'::jsonb) RETURNING id`,
    )).id
    const estimated = await minted(own)
    await client.query(
      `INSERT INTO level_claim (note_id, level, model_id, prompt_version) VALUES ($1, 'N5', 'm', 'v6')`,
      [own],
    )

    const atN5 = await newCards(db, OWNER, 20, { domains: [], levels: ['N5'] })
    const unfiltered = await newCards(db, OWNER, 20)

    expect(atN5.map(card => card.cardId)).toEqual([listed])
    expect(unfiltered.map(card => card.cardId).sort()).toEqual([listed, estimated].sort())
  })

  it('shows the Vet strip the list\'s level, and no level for a word only a model placed', async () => {
    const meet = await noteOf('会う', 'あう')
    const own = (await one(
      `INSERT INTO note (subject_id, identity_key, fields)
       VALUES ('jlpt-vocab-2', 'own-4', '{"term":"推し活","reading":"おしかつ"}'::jsonb) RETURNING id`,
    )).id
    await client.query(
      `INSERT INTO level_claim (note_id, level, model_id, prompt_version) VALUES ($1, 'N1', 'm', 'v6'), ($2, 'N3', 'm', 'v6')`,
      [meet, own],
    )
    for (const noteId of [meet, own]) {
      const cardId = await minted(noteId)
      await client.query('INSERT INTO card_flag (card_id, note_id, owner_id) VALUES ($1, $2, $3)', [cardId, noteId, OWNER])
    }

    const queue = await queueBatch(db, OWNER)

    expect(queue.find(note => note.noteId === meet)?.levels).toEqual([{ authorityKey: 'tanos-jlpt', level: 'N5' }])
    expect(queue.find(note => note.noteId === own)?.levels).toEqual([])
  })
})
