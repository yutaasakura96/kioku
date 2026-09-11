// ⚠️ **One string, two languages, and nothing else will tell you when they
// disagree** — ADR 0043, ADR 0028.
//
// The app sends `pg_notify('kioku_job', '')` from TypeScript and the worker
// issues `LISTEN kioku_job` from Python. A mismatch raises nothing, logs
// nothing and breaks nothing visible: the worker simply never wakes, and every
// run waits for the next reconnect instead. `09` §7 then reports the truthful
// version of that — "queued 4m, not yet picked up" — which is exactly the
// sentence a reader would read as *the worker is not running*.
//
// It is the same shape as `03` §6's cross-language drift test and it is here for
// the same reason: **a divergence no compiler can see is caught by the thing
// that can.** This half is cheap enough to live in the unit tier — it reads a
// file and a regex, needs no Python, and fails in milliseconds.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { JOB_CHANNEL } from '../../server/utils/ingest/notify'

const LOOP = fileURLToPath(new URL('../../worker/loop.py', import.meta.url))

describe('the job channel, across the two toolchains', () => {
  it('is the same string in worker/loop.py as in notify.ts', () => {
    const python = readFileSync(LOOP, 'utf8')
    const declared = /^JOB_CHANNEL = "([^"]+)"$/m.exec(python)

    expect(declared, 'worker/loop.py no longer declares JOB_CHANNEL at the top level').not.toBeNull()
    expect(declared![1]).toBe(JOB_CHANNEL)
  })

  it('is a bare identifier, because LISTEN cannot take anything else', () => {
    // `LISTEN` takes an identifier and cannot be parameterised, so the worker
    // interpolates this constant into its one statement. Anything needing
    // quoting would make that interpolation a place where a channel name could
    // become SQL.
    expect(JOB_CHANNEL).toMatch(/^[a-z_][a-z0-9_]*$/)
  })
})
