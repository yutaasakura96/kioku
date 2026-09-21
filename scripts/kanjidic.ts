/**
 * Regenerates `server/data/kanjidic/readings.json` from EDRDG's KANJIDIC2 —
 * [#30](https://github.com/yutaasakura96/kioku/issues/30), `docs/kanjidic-research.md`
 * §2.4 and §3.2.
 *
 *   node scripts/kanjidic.ts                  # downloads the current file
 *   node scripts/kanjidic.ts kanjidic2.xml.gz # or reads one already downloaded
 *
 * ⚠️ **EDRDG's licence §4 makes the refresh an obligation**: "Failure to keep the
 * versions up-to-date is a violation of the licence to use the data." Yuta's call
 * (research §7) is a monthly manual run of this script and a commit, logged in
 * `docs/00-status.md` § Carrying with the `database_version` it prints.
 *
 * ⚠️ **Only `literal`, `ja_on` and `ja_kun` leave the file.** Every field under a
 * third-party licence (the SKIP codes are CC BY-NC-SA, research §2.1) stays out,
 * and so do nanori, which are names. The raw file is never committed.
 *
 * What the table holds, per kanji (research §3.2 and §3.3):
 * - on readings folded to hiragana, the fold `foldReading` would apply anyway;
 * - kun readings with `-` stripped and the okurigana `.` **kept**, because the
 *   candidate rule needs the stem of 見's み.る and not みる (`shared/review/kanji.ts`).
 *
 * Node has no XML parser, and this file needs none: each `<reading>` sits on its
 * own line (research §3.1), so a regex over each `<character>` block is enough.
 * Run with `node`, which strips the types itself (as `print-subject-view.ts` is).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

import { toHiragana } from 'wanakana'

const SOURCE = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz'
const TARGET = new URL('../server/data/kanjidic/readings.json', import.meta.url)

async function download(): Promise<Buffer> {
  const response = await fetch(SOURCE)
  if (!response.ok)
    throw new Error(`${SOURCE}: HTTP ${response.status}`)

  return Buffer.from(await response.arrayBuffer())
}

function tag(xml: string, name: string): string {
  const found = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))
  if (!found)
    throw new Error(`KANJIDIC2 header has no <${name}>`)

  return found[1]!
}

const path = process.argv[2]
const xml = gunzipSync(path ? readFileSync(path) : await download()).toString('utf8')

const version = tag(xml, 'database_version')
const created = tag(xml, 'date_of_creation')
const readings: Record<string, string[]> = {}

for (const [, block] of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
  const literal = block!.match(/<literal>([^<]+)<\/literal>/)?.[1]
  if (!literal)
    continue

  const found = new Set<string>()

  for (const [, type, text] of block!.matchAll(/<reading r_type="(ja_on|ja_kun)"[^>]*>([^<]+)<\/reading>/g)) {
    const bare = text!.replaceAll('-', '')
    // `convertLongVowelMark: false`, the same option `foldReading` passes.
    found.add(type === 'ja_on' ? toHiragana(bare, { convertLongVowelMark: false }) : bare)
  }

  if (found.size > 0)
    readings[literal] = [...found].sort()
}

// One kanji per line: a refresh that drops or adds a reading is one line in the diff.
const lines = Object.entries(readings).map(([kanji, list]) => `  ${JSON.stringify(kanji)}: ${JSON.stringify(list)}`)
const body = [
  '{',
  `  "source": ${JSON.stringify(SOURCE)},`,
  `  "database_version": ${JSON.stringify(version)},`,
  `  "date_of_creation": ${JSON.stringify(created)},`,
  '  "readings": {',
  lines.map(line => `  ${line}`).join(',\n'),
  '  }',
  '}',
  '',
].join('\n')

writeFileSync(TARGET, body)
console.log(`database_version ${version} (${created}): ${lines.length} kanji → ${TARGET.pathname}`)
