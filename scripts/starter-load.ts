/**
 * Loads the starter set into the database `DATABASE_URL` names — ADR 0075, #68.
 *
 *   DATABASE_URL=… npm run starter:load
 *
 * ⚠️ **It reads no `.env`.** The target is whatever the environment names when
 * it is run, said out loud before anything is written. Production is loaded
 * with the direct string injected for that one command, as `03` §4.2's release
 * step injects it for the migration — and that run is the owner's.
 *
 * Repeatable: a second run creates nothing (`scripts/starter/load.ts`).
 * Rebuilding the bundle itself is `cd worker && uv run python starter.py`.
 */

import pg from 'pg'

import { jlptVocab, levelValues } from '../shared/subject/declaration.ts'
import { loadStarterSet, readStarterBundle } from './starter/load.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('starter:load needs DATABASE_URL in the environment. It reads no .env file.')
  process.exit(1)
}

const bundle = readStarterBundle()
const target = new URL(url)

console.log(
  `Loading ${bundle.words.length} words (${bundle.sources.jmdict.version}, lists at `
  + `${bundle.sources.jlpt_lists.commit.slice(0, 7)}) into ${target.hostname}${target.pathname} `
  + `as subject '${jlptVocab.subject_id}'.`,
)

const client = new pg.Client({ connectionString: url })
await client.connect()

try {
  const load = await loadStarterSet(client, bundle)

  for (const level of levelValues(jlptVocab))
    console.log(`  ${level}  ${load.byLevel[level] ?? 0}`)
  console.log(`  ${load.created} notes created, ${load.existing} already there.`)
}
finally {
  await client.end()
}
