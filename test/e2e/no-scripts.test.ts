import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

import { TEST_ENVIRONMENT } from './environment'

// `11-testing-plan.md` §6.1. This is ADR 0020's revisit condition: neither Nuxt
// nor Vercel documents that the `noScripts` rule survives the Vercel preset, and
// nothing upstream tests the combination (verification §8), so it is tested here
// before anything is built on top of it.
//
// ⚠️ **Amended 2026-09-09 by #5, and the reason is the gate.** `11` §6.1 listed
// four assertions over the three *places* and the two *modes*. Those five routes
// are now behind a session (`08` §6.3), so an unauthenticated e2e request to any
// of them is a `302` to `/auth` and there is no document to read. What each
// assertion needed is still asserted, and the three moves are each written out
// below rather than left as a shorter file:
//
//  1. **The mechanism** — that the rule strips scripts from a document Nuxt
//     actually emitted — is carried by `/auth/refused`, which is public and
//     carries the same `noScripts: true`. It is the whole of what assertion 1
//     was ever able to observe; the *places* differ from it in nothing that the
//     renderer sees.
//  2. **Which routes carry the rule** is `test/unit/nuxt-config.test.ts`, and
//     always was — it reads `nuxt.config` and needs neither a build nor a
//     request.
//  3. **The `external` Done control** moved to `test/nuxt/modes.test.ts`, where
//     it is now a *stronger* test than the browser one it replaces. ⚠️ It was
//     e2e because the two forms render the same `href` so the assertion has to
//     **click**; measured 2026-09-09, a click is enough and a mounted component
//     can be clicked. The distinguishing bit is `defaultPrevented`.
//
// ⚠️ What is genuinely no longer observed: that a **signed-in** reader's Ingest,
// Sources and Stats documents ship no JavaScript. That needs an authenticated
// browser, which needs a session row, which needs a database in this tier —
// scope ADR 0038 deliberately kept out of the TypeScript suite. #10 cannot be
// tested at all without an authenticated e2e context, so that is where the
// context should land and where these three routes rejoin assertion 1.

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  env: TEST_ENVIRONMENT,
})

describe('assertion 1 — the noScripts rule strips scripts from an emitted document', () => {
  it('/auth/refused contains no <script', async () => {
    // ⚠️ `/auth/refused` is **not** a *place* — it is the door's other half
    // (`00-status.md` § Carrying, "There are six routes, not five"). What it
    // shares with the three *places* is the rule, which is what this asserts.
    expect(await $fetch<string>('/auth/refused')).not.toContain('<script')
  })
})

describe('assertion 3 — features.noScripts was not set app-wide', () => {
  // Asserting the negative alone would pass on a globally broken configuration:
  // `features.noScripts` is typed 'production' | 'all' | boolean and applies to
  // everything (`03` §2.1), and both *modes* need JavaScript.
  //
  // ⚠️ `/auth` is enough to falsify it. If the flag were set app-wide the door
  // would ship no JavaScript either — and the door is the one route that both
  // needs JavaScript and is public, which is why it can still be asked. The
  // *modes* are behind the gate; that they carry `ssr: false` and that the flag
  // is unset are both asserted in `test/unit/nuxt-config.test.ts`.
  it('/auth ships JavaScript, and is neither a place nor a mode', async () => {
    // `08` §2: the door is the one universal route, because `authClient` is a
    // client library and a *place* has no client to call it from.
    expect(await $fetch<string>('/auth')).toContain('<script')
  })
})
