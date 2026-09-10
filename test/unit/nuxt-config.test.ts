import { fileURLToPath } from 'node:url'
import { loadNuxtConfig } from '@nuxt/kit'
import { beforeAll, describe, expect, it } from 'vitest'

// `11-testing-plan.md` §6.1's fourth assertion, and the seam half of its third.
// Both are **configuration** assertions rather than HTTP ones, so they read
// `nuxt.config` once and never build or boot anything.
//
// ⚠️ `prerender`, `swr` and `isr` each turn a session-gated document into a
// shared artifact: a prerendered route is a static asset with no request to
// gate, and Nuxt maps `isr` onto Vercel's own CDN rules — a CDN we do not
// operate (ADR 0030, verification §11.4). Each is also the ordinary advice for
// a route that renders a form, a list and five numbers.
//
// It is the cheapest test in the suite and it guards the most dangerous
// single-line change in the project.

const GATE_DISABLING_RULES = ['prerender', 'swr', 'isr'] as const

// `08-authentication.md` §2. Everything else is behind the session.
const PUBLIC_ROUTES = ['/auth', '/auth/refused', '/api/auth/**']

// The three *places* and the refusal page. ⚠️ `/auth/refused` is **not** a
// fourth *place* — it is the door's other half (`00-status.md` § Carrying,
// "There are six routes, not five"). What the four share is that they ship no
// JavaScript, and that is what this list is named for.
// ⚠️ `/sources/**` added 2026-09-11 by #6. `09` §1's table has carried
// `/sources/:id` and `/sources/:id/delete` since it was written, and both are
// *places*; the rule covers them as a pattern so the delete confirmation does
// not arrive as a default when `S11` builds it.
const SCRIPT_FREE_ROUTES = ['/', '/sources', '/sources/**', '/stats', '/auth/refused']

const MODES = ['/vet', '/review']

let config: Awaited<ReturnType<typeof loadNuxtConfig>>
let routeRules: Record<string, Record<string, unknown>>

beforeAll(async () => {
  config = await loadNuxtConfig({
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
  })
  routeRules = ((config as { routeRules?: unknown }).routeRules ?? {}) as typeof routeRules
})

describe('route rules', () => {
  it('declares a rule for each of the six routes, so none of them is a default', () => {
    // A subset assertion, not an exact one: #6 adds `/sources/:id` and
    // `/sources/:id/delete` with rules of their own, and a test that counts
    // route rules would fail on a correct addition.
    for (const route of ['/', '/sources', '/sources/**', '/stats', '/vet', '/review', '/auth', '/auth/refused'])
      expect(routeRules, `${route} has no route rule`).toHaveProperty([route])
  })

  it('carries no prerender, swr or isr on any non-public route', () => {
    const offenders = Object.entries(routeRules)
      .filter(([route]) => !PUBLIC_ROUTES.includes(route))
      .flatMap(([route, rules]) =>
        GATE_DISABLING_RULES
          .filter(rule => rule in rules)
          .map(rule => `${route} carries ${rule}`),
      )

    expect(offenders).toEqual([])
  })

  it('ships no JavaScript from the three places or the refusal page', () => {
    for (const route of SCRIPT_FREE_ROUTES)
      expect(routeRules[route]).toMatchObject({ noScripts: true })
  })

  it('renders both modes client-side', () => {
    for (const mode of MODES)
      expect(routeRules[mode]).toMatchObject({ ssr: false })
  })

  it('uses the current spelling of the rule, not the deprecated one', () => {
    // `experimentalNoScripts` still exists at v4.5.2 and is deprecated
    // (verification §8). A future session copying an older recommendation
    // reaches for the wrong name, and the wrong name does nothing.
    for (const rules of Object.values(routeRules))
      expect(rules).not.toHaveProperty('experimentalNoScripts')
  })
})

describe('the app-wide noScripts feature flag', () => {
  // ⚠️ `features.noScripts` applies to everything. It is typed
  // 'production' | 'all' | boolean, so setting it strips JavaScript from *Vet*
  // and *Review* too and breaks both (`03` §2.1). The per-route rule is the
  // whole mechanism.
  //
  // The HTTP half of this — that `/vet` and `/review` do ship JavaScript — is
  // `11` §6.1's third assertion, in `test/e2e/no-scripts.test.ts`. This half
  // says why, at a seam, so a failure names the cause.
  it('is not set', () => {
    // `loadNuxtConfig` resolves Nuxt's own defaults, so the flag reads `false`
    // rather than absent. What matters is that it is never enabled — the three
    // enabling values are 'all', 'production' and `true`.
    expect(config.features?.noScripts).toBeFalsy()

    // The deprecated spelling (verification §8).
    expect((config.experimental as Record<string, unknown> | undefined)?.noScripts).toBeFalsy()
  })
})
