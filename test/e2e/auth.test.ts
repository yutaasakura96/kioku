import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

import { TEST_ENVIRONMENT } from './environment'

// `S1`, as far as it goes without Google. `11` §2 maps `S1` to the e2e tier and
// `11` §8 puts the flow **through** Google's redirect in the end-to-end-only
// column; this file asserts everything around it — the gate, the two doors, and
// the shape of the refusal — none of which needs a provider or a database.
//
// ⚠️ Nothing here signs in, so nothing here proves a session works. What it
// proves is the half that fails silently: that an unauthenticated request is
// refused **at every route**, that the refusal answers differently for a
// document and for `/api/**`, and that the page a refused reader lands on offers
// nothing.

await setup({
  rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  env: TEST_ENVIRONMENT,
})

/**
 * ⚠️ The five screens, and `S1` says **every** route. The two *modes* are in
 * this list and it would be easy to leave them out: `ssr: false` makes them feel
 * client-side, but the document still comes from the server and the middleware
 * still runs on it (`03` §2.1 — an app shell, not a blank page). A mode that was
 * not gated would hand out its shell and then 401 on every fetch inside it.
 */
const GATED_DOCUMENTS = ['/', '/sources', '/stats', '/vet', '/review']

const PUBLIC_DOCUMENTS = ['/auth', '/auth/refused']

describe('the gate — an unauthenticated document request', () => {
  it.each(GATED_DOCUMENTS)('%s answers 302 to /auth', async (path) => {
    const response = await fetch(path, { redirect: 'manual' })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/auth')
  })

  it.each(GATED_DOCUMENTS)('%s sends the reader to the door, not to the screen they asked for', async (path) => {
    // `08` §11: the redirect target is `/auth`, not the requested screen. There
    // is no `?redirect=` to carry, which is one fewer redirect target arriving
    // in a URL for somebody to trust later.
    const location = (await fetch(path, { redirect: 'manual' })).headers.get('location')

    expect(location).not.toContain('?')
    expect(location).not.toContain(path === '/' ? 'redirect' : path.slice(1))
  })

  it.each(PUBLIC_DOCUMENTS)('%s is public and answers 200', async (path) => {
    expect((await fetch(path, { redirect: 'manual' })).status).toBe(200)
  })
})

describe('the gate — an unauthenticated API request', () => {
  it('answers 401 rather than redirecting', async () => {
    // ⚠️ Two answers because the caller is different (`08` §6.3). A 302 to an
    // HTML page is indistinguishable from success to `fetch`, which is how an
    // outbox flush ends up posting grades into a sign-in page and reporting
    // them sent (`08` §5.6, ADR 0039).
    const response = await fetch('/api/anything', { redirect: 'manual' })

    expect(response.status).toBe(401)
  })

  it('answers 401 before it answers 404, so a missing route cannot look public', async () => {
    // The route does not exist. If the gate ran after routing, this would be a
    // 404 — and every future `/api/**` route would be gated only by having been
    // remembered.
    expect((await fetch('/api/no/such/route', { redirect: 'manual' })).status).toBe(401)
  })

  it('leaves /api/auth/** reachable, because nobody could sign in otherwise', async () => {
    // ⚠️ `08` §3.3: the catch-all being public is not a hole. What protects it
    // is that every path through it that mints an identity passes both refusals.
    const response = await fetch('/api/auth/get-session', { redirect: 'manual' })

    expect(response.status).not.toBe(401)
    expect(response.status).not.toBe(302)
  })
})

describe('/auth/refused — where the empty space is the requirement', () => {
  it('carries no link of any kind', async () => {
    // ⚠️ `08` §2.1 and `10` §9.2: no sign-in button, no retry, no support link —
    // **including a logo that happens to be one**. `S1` says there is no path to
    // create an account from inside the app, and the refusal page is inside the
    // app. The reader gets back to the door by typing the URL (`09` §4.1).
    const html = await $fetch<string>('/auth/refused')

    expect(html).not.toMatch(/<a[\s>]/i)

    // ⚠️ **Amended 2026-09-11 by #6, and narrowed rather than dropped.** This
    // read `not.toMatch(/\bhref=/i)` — no `href` anywhere in the document — and
    // #6's token layer broke it by adding the one `href` a *place* has always
    // been going to have: `<link rel="stylesheet">`. A stylesheet is not a link
    // the reader can follow, and `10` §9.2's requirement is about where the
    // reader can *go*, so the assertion is now every `href` that is not one.
    //
    // It still catches everything it was written for — an anchor, a logo that
    // happens to be one, an `<area>`, a `<base href>` — because none of those is
    // a stylesheet link.
    const links = [...html.matchAll(/<[^>]*\bhref=/gi)].map(match => match[0])
    expect(links.filter(link => !/rel="stylesheet"/i.test(link))).toEqual([])
  })

  it('carries no control of any kind either', async () => {
    const html = await $fetch<string>('/auth/refused')

    expect(html).not.toMatch(/<button[\s>]/i)
    expect(html).not.toMatch(/<form[\s>]/i)
  })

  it('says what happened and nothing that reads as a next step', async () => {
    const html = await $fetch<string>('/auth/refused')

    expect(html).toContain('This account is not invited.')
  })
})

describe('/auth — the door', () => {
  it('offers a sign-in control to a reader with no session', async () => {
    const html = await $fetch<string>('/auth')

    expect(html).toContain('Continue with Google')
  })

  it('offers exactly one control, because there is nothing else to do here', async () => {
    // `08` §2: "There is nothing on `/auth` but one button." Sign-out lives here
    // too and is the *other* state of the same screen, not a second control on
    // this one.
    const html = await $fetch<string>('/auth')

    expect(html.match(/<button[\s>]/gi) ?? []).toHaveLength(1)
    expect(html).not.toContain('Sign out')
  })
})
