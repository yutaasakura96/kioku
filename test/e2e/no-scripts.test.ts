import { fileURLToPath } from 'node:url'
import { $fetch, createPage, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

// `11-testing-plan.md` §6.1 — four assertions, three over a built and running
// app and one over the configuration (that one is `test/unit/route-rules.test.ts`,
// because it needs neither a build nor a request).
//
// This is ADR 0020's revisit condition. Neither Nuxt nor Vercel documents that
// the `noScripts` rule survives the Vercel preset and nothing upstream tests the
// combination (verification §8), so it is tested here, before anything is built
// on top of it.

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  browser: true,
})

// The three *places* and the refusal page. ⚠️ `/auth/refused` is **not** a
// fourth *place* — it is the door's other half (`00-status.md` § Carrying,
// "There are six routes, not five"). What the four share is that they ship no
// JavaScript, and that is what this list is named for. `/sources/:id` and
// `/sources/:id/delete` join it when those routes exist (#6).
const SCRIPT_FREE_ROUTES = ['/', '/sources', '/stats', '/auth/refused']

const MODES = ['/vet', '/review']

describe('assertion 1 — a place ships no JavaScript', () => {
  it.each(SCRIPT_FREE_ROUTES)('%s contains no <script', async (path) => {
    expect(await $fetch<string>(path)).not.toContain('<script')
  })
})

describe("assertion 2 — a mode's Done control is a real anchor", () => {
  // ⚠️ This one has to run in a browser, and that is not a preference.
  // `ssr: false` means the server returns an app shell with an empty
  // `<div id="__nuxt">` — measured 2026-09-09, and `11` §6.1 is amended to
  // match. The Done control only exists once the client has rendered it, so
  // `$fetch` cannot see it and neither can `curl`.
  //
  // Clicking it is what makes the test discriminating. A bare <NuxtLink> would
  // client-render the *place* inside the *mode*'s running application, and the
  // document afterwards would still carry the mode's scripts — the exact
  // outcome `noScripts` exists to prevent, with no error anywhere
  // (ADR 0032, verification §12.1). `external` forces a real document load, and
  // the document that arrives has no scripts in it.
  it.each(MODES)('%s Done lands on the origin as a script-free document', async (mode) => {
    const page = await createPage(`${mode}?from=/stats`)

    const done = page.getByRole('link', { name: 'Done' })
    await expect.poll(() => done.getAttribute('href')).toBe('/stats')

    await Promise.all([page.waitForURL('**/stats'), done.click()])

    expect(await page.content()).not.toContain('<script')
    await page.close()
  })

  it('falls back to Ingest when the mode was reached without a from parameter', async () => {
    // ADR 0032: a mode reached by a typed URL or a bookmark returns to `/`,
    // which ADR 0031 makes Ingest. The allowlist is three strings long and it
    // is a redirect target arriving in a URL — `test/unit/origin.test.ts`
    // carries the attacks.
    const page = await createPage('/vet')

    await expect
      .poll(() => page.getByRole('link', { name: 'Done' }).getAttribute('href'))
      .toBe('/')

    await page.close()
  })
})

describe('assertion 3 — features.noScripts was not set app-wide', () => {
  // Asserting the negative alone would pass on a globally broken configuration
  // — `features.noScripts` is typed 'production' | 'all' | boolean and applies
  // to everything (`03` §2.1). Both *modes* need JavaScript.
  it.each(MODES)('%s does ship JavaScript', async (mode) => {
    expect(await $fetch<string>(mode)).toContain('<script')
  })

  it('/auth ships JavaScript, and is neither a place nor a mode', async () => {
    // `08` §2: the door is the one universal route, because `authClient` is a
    // client library and a *place* has no client to call it from.
    expect(await $fetch<string>('/auth')).toContain('<script')
  })
})
