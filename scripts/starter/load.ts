/**
 * Loads the starter set into a database — ADR 0075, #68.
 *
 * The bundle is `subjects/starter/jlpt-vocab.json`, which `worker/starter.py`
 * builds from JMdict and the community JLPT lists. Each word becomes a *note*,
 * its four fields' *provenance*, one *level claim* naming the list as its
 * *authority*, and its *accepted meanings*.
 *
 * ⚠️ **Shared rows only** (`04` §4). A starter word is true whoever is asking;
 * the *card* that puts it in front of a reader is minted when that reader
 * starts it, which is the lesson's job and not this file's.
 *
 * ⚠️ **Repeatable.** A second run of the same bundle writes nothing. A run of
 * a newer bundle — the monthly JMdict refresh — adds the words it gained and
 * restates what this loader owns: the list's *level claim*, an
 * accepted-meanings list a dictionary wrote, and **the fields of a *note* that
 * is still only the dictionary's**.
 *
 * ⚠️ **A *note* some reader has accepted keeps its fields** — `S6`'s freeze,
 * the rule `server/utils/note/fields.ts` enforces for the app (ADR 0052). A
 * refresh that rewrote a gloss under a review history would be measuring
 * recall of a card the reader never saw. So does a *note* any field of which a
 * model or a person wrote: the dictionary is not the author of that one. A
 * model's accepted-meanings list is never replaced either.
 *
 * ⚠️ **Raw SQL over one connection, with no Drizzle schema in reach.** It is
 * run by `node`, which will not resolve the schema's extensionless imports
 * (`00-status.md` § Carrying), and it has to speak to PGlite and to
 * node-postgres alike: `dev:session` loads the same bundle into its local
 * database. Both clients answer `query(text, values)` with `{ rows }`.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { authorityKeys, jlptVocab, levelValues, renderIdentityKey } from '../../shared/subject/declaration.ts'
import type { SubjectDeclaration } from '../../shared/subject/declaration.ts'

export const STARTER_BUNDLE_PATH = fileURLToPath(
  new URL('../../subjects/starter/jlpt-vocab.json', import.meta.url),
)

// A `type`, not an `interface`: `renderIdentityKey` takes a record, and only an
// alias is assignable to an index signature.
export type StarterWord = {
  term: string
  reading: string
  level: string
  part_of_speech: string
  meaning: string
  meanings: string[]
  /** JMdict's entry number, kept so a refresh can be traced to its entry. */
  jmdict: number
}

export interface StarterBundle {
  authority: string
  sources: {
    jmdict: { created: string, version: string }
    jlpt_lists: { repository: string, commit: string }
  }
  counts: Record<string, number>
  dropped: Record<string, number>
  words: StarterWord[]
}

/** One connection: `pg.Client` and `PGlite` both fit. Never a pool. */
export interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>
}

export interface StarterLoad {
  words: number
  /** *Notes* this run created. Zero on a second run of the same bundle. */
  created: number
  /** Words whose *note* was already there, from an earlier run or an *ingestion*. */
  existing: number
  /** Existing *notes* whose fields this run brought up to the bundle's. */
  refreshed: number
  byLevel: Record<string, number>
}

export class StarterBundleRefused extends Error {}

/**
 * The bundle, checked against the declaration it is loaded under.
 *
 * ⚠️ **An authority or a level the declaration does not carry is refused
 * here**, before a row is written: a *level claim* citing an undeclared
 * authority has no precedence, and a level outside the closed set is one no
 * category could list (ADR 0065 §2).
 */
export function readStarterBundle(
  path: string = STARTER_BUNDLE_PATH,
  declaration: SubjectDeclaration = jlptVocab,
): StarterBundle {
  const bundle = JSON.parse(readFileSync(path, 'utf8')) as StarterBundle

  if (!authorityKeys(declaration).includes(bundle.authority))
    throw new StarterBundleRefused(`the subject declares no authority '${bundle.authority}'`)

  const levels = new Set(levelValues(declaration))
  const keys = new Set<string>()

  for (const word of bundle.words) {
    if (!levels.has(word.level))
      throw new StarterBundleRefused(`'${word.term}' is at '${word.level}', which is not a declared level`)
    if (!word.meaning.trim() || word.meanings.length === 0)
      throw new StarterBundleRefused(`'${word.term}' has no meaning`)

    const key = renderIdentityKey(declaration, word)
    if (keys.has(key))
      throw new StarterBundleRefused(`'${word.term}' (${word.reading}) is in the bundle twice`)
    keys.add(key)
  }

  return bundle
}

/** The *note*'s content. A starter word has no example sentence, and says so by absence. */
const NOTE_FIELDS = ['term', 'reading', 'part_of_speech', 'meaning'] as const

const BATCH = 500

export async function loadStarterSet(
  db: Queryable,
  bundle: StarterBundle,
  declaration: SubjectDeclaration = jlptVocab,
): Promise<StarterLoad> {
  const subjectId = declaration.subject_id
  const dictionary = bundle.sources.jmdict.version
  const load: StarterLoad = { words: bundle.words.length, created: 0, existing: 0, refreshed: 0, byLevel: {} }

  for (let start = 0; start < bundle.words.length; start += BATCH) {
    const words = bundle.words.slice(start, start + BATCH)
    const keys = words.map(word => renderIdentityKey(declaration, word))
    const fields = words.map(word =>
      JSON.stringify(Object.fromEntries(NOTE_FIELDS.map(name => [name, word[name]]))),
    )

    // One transaction per batch: a *note* with no *level claim* is a word in no
    // category, and a run that died between the two would leave some.
    await db.query('BEGIN')
    try {
      const created = await db.query(
        `INSERT INTO note (subject_id, identity_key, fields)
         SELECT $1, w.key, w.fields::jsonb
         FROM unnest($2::text[], $3::text[]) AS w(key, fields)
         ON CONFLICT (subject_id, identity_key) DO NOTHING
         RETURNING id`,
        [subjectId, keys, fields],
      )

      const found = await db.query(
        'SELECT id, identity_key FROM note WHERE subject_id = $1 AND identity_key = ANY($2::text[])',
        [subjectId, keys],
      ) as { rows: { id: string, identity_key: string }[] }
      const idOf = new Map(found.rows.map(row => [row.identity_key, row.id]))
      const ids = keys.map(key => idOf.get(key)!)

      // The refresh. Unaccepted, and every field a dictionary's: see the head
      // of the file. Only the two fields the dictionary supplies can differ —
      // the other two are the *identity key*.
      const refreshed = await db.query(
        `UPDATE note n SET fields = w.fields::jsonb
         FROM unnest($1::uuid[], $2::text[]) AS w(note_id, fields)
         WHERE n.id = w.note_id
           AND n.fields <> w.fields::jsonb
           AND NOT EXISTS (
             SELECT 1 FROM note_vetting v WHERE v.note_id = n.id AND v.state = 'accepted')
           AND NOT EXISTS (
             SELECT 1 FROM note_field_provenance p WHERE p.note_id = n.id AND p.kind <> 'lookup')
         RETURNING n.id`,
        [ids, fields],
      ) as { rows: { id: string }[] }

      if (refreshed.rows.length > 0) {
        await db.query(
          `UPDATE note_field_provenance SET dictionary_version = $2
           WHERE note_id = ANY($1::uuid[]) AND field_name = ANY($3::text[])`,
          [refreshed.rows.map(row => row.id), dictionary, ['part_of_speech', 'meaning']],
        )
      }

      // ⚠️ `ON CONFLICT DO NOTHING`: a *note* an *ingestion* made keeps that
      // run's attribution (`worker/pipeline/write_notes.py`).
      await db.query(
        `INSERT INTO note_field_provenance (note_id, field_name, kind, dictionary_version)
         SELECT n, f, 'lookup', $3
         FROM unnest($1::uuid[]) AS n CROSS JOIN unnest($2::text[]) AS f
         ON CONFLICT (note_id, field_name) DO NOTHING`,
        [ids, [...NOTE_FIELDS], dictionary],
      )

      // The list is the *authority* on its own claim, so a rerun restates it.
      await db.query(
        `INSERT INTO level_claim (note_id, authority_key, level)
         SELECT w.note_id, $3, w.level
         FROM unnest($1::uuid[], $2::text[]) AS w(note_id, level)
         ON CONFLICT (note_id, authority_key) DO UPDATE SET level = EXCLUDED.level`,
        [ids, words.map(word => word.level), bundle.authority],
      )

      await db.query(
        `INSERT INTO note_meaning (note_id, meanings, dictionary_version)
         SELECT w.note_id, ARRAY(SELECT jsonb_array_elements_text(w.meanings::jsonb)), $3
         FROM unnest($1::uuid[], $2::text[]) AS w(note_id, meanings)
         ON CONFLICT (note_id) DO UPDATE
           SET meanings = ARRAY(
             SELECT meaning FROM unnest(note_meaning.meanings || EXCLUDED.meanings)
               WITH ORDINALITY AS item(meaning, position)
             GROUP BY meaning ORDER BY min(position)
           ),
               dictionary_version = EXCLUDED.dictionary_version
           WHERE note_meaning.dictionary_version IS NOT NULL`,
        [ids, words.map(word => JSON.stringify(word.meanings)), dictionary],
      )

      await db.query('COMMIT')

      load.created += created.rows.length
      load.existing += words.length - created.rows.length
      load.refreshed += refreshed.rows.length
    }
    catch (error) {
      await db.query('ROLLBACK')
      throw error
    }

    for (const word of words)
      load.byLevel[word.level] = (load.byLevel[word.level] ?? 0) + 1
  }

  return load
}
