// ⚠️ **The app tier never holds the model provider key** — `03` §13.1, §13.6.
//
// Generation happens only in the worker, so the process with an internet-facing
// surface has no ability to spend money, and the process that can spend money
// has no internet-facing surface. `03` §13.1 says in as many words that this is
// "easy to undo later by adding one convenience endpoint", which is exactly the
// kind of sentence that survives in a document and dies in a diff.
//
// So it is a test. It reads the app's own source and its manifest, because both
// halves of undoing it are visible there: a route that reads the key, and a
// dependency that could call a provider.
//
// ⚠️ **Not a lint rule and not a convention.** #9 is the ticket that made the
// key exist at all, and it is the one that owes the guard.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** The app tier, as `03` §10 lays it out. `worker/` is deliberately absent. */
const APP_DIRECTORIES = ['app', 'server', 'shared']

/** Every provider whose key `03` §13.1 puts on the laptop, plus the SDKs. */
const FORBIDDEN = [
  'ANTHROPIC_API_KEY',
  '@anthropic-ai/sdk',
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
]

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
    } else if (/\.(ts|vue|js|mjs)$/.test(entry)) {
      found.push(path)
    }
  }
  return found
}

describe('the spend surface and the attack surface do not overlap', () => {
  it('names no provider key anywhere in the app tier', () => {
    const offending: string[] = []
    for (const directory of APP_DIRECTORIES) {
      for (const path of sourceFiles(join(ROOT, directory))) {
        const contents = readFileSync(path, 'utf8')
        for (const name of FORBIDDEN) {
          if (contents.includes(name)) offending.push(`${path} mentions ${name}`)
        }
      }
    }

    expect(offending, '`03` §13.1: the app tier never holds the model provider key').toEqual([])
  })

  it('depends on no model provider SDK', () => {
    // ⚠️ The manifest half. A key can be read from `process.env` under any name,
    // so the source check above is necessary and not sufficient; an SDK in
    // `package.json` is the other thing that has to be true for the app to be
    // able to spend.
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const installed = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

    expect(installed.filter(name => /anthropic|openai|@google\/gen|generative-ai/i.test(name))).toEqual(
      [],
    )
  })

  it('leaves the key to the worker, which is where the value lives', () => {
    // The other side of the same sentence: `.env.example` names the variable
    // under the worker's heading and carries no value, ever (`03` §13.1, and
    // the remote is public).
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8')
    const worker = example.slice(example.indexOf('The Python worker'))

    expect(worker).toContain('ANTHROPIC_API_KEY')
    expect(worker).toMatch(/^ANTHROPIC_API_KEY=$/m)
  })
})
