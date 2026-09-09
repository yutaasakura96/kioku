import type { BetterAuthOptions } from 'better-auth/minimal'
import { afterEach, describe, expect, it, vi } from 'vitest'

// `08-authentication.md` §10 as an assertion, plus the two tests §11 hands
// forward that are not end-to-end: **the process refuses to start with
// `KIOKU_INVITED_EMAIL` unset** (§4.3), and **an uninvited account is refused on
// sign-in as well as at signup** (§3.1).
//
// ⚠️ `11` §9: this asserts **our** configuration, never Better Auth's
// correctness. That `validateUserInfo` actually fires on the sign-in pass with a
// fresh provider profile is the library's behaviour and its own suite's problem;
// what is ours is that the callback we hand it refuses without looking at which
// door was tried, and that every value in §10 is the value that got written.
//
// It reads `auth.options`, which Better Auth types as the exact object passed in
// — so this is a seam, not a reimplementation of one.

/** ⚠️ Names, never values (`03` §13.1). These are fixtures and none is real. */
const ENVIRONMENT: Record<string, string> = {
  DATABASE_URL: 'postgres://kioku@localhost:5432/kioku',
  BETTER_AUTH_SECRET: 'fixture-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'fixture-client-id',
  GOOGLE_CLIENT_SECRET: 'fixture-client-secret',
  KIOKU_INVITED_EMAIL: 'reader@example.com',
}

const INVITED = ENVIRONMENT.KIOKU_INVITED_EMAIL!

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
  vi.resetModules()
})

/**
 * Imports the module fresh under a given environment.
 *
 * ⚠️ Fresh matters: `08` §4.3 reads the invited address **once, at
 * construction**, so a module cached from an earlier case would be carrying an
 * earlier environment and every refusal test would pass for the wrong reason.
 */
async function loadAuth(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules()

  for (const [name, value] of Object.entries({ ...ENVIRONMENT, ...overrides })) {
    if (value === undefined)
      delete process.env[name]
    else
      process.env[name] = value
  }

  const { auth } = await import('../../server/utils/auth')
  return auth
}

/**
 * The same options, widened to the library's own type.
 *
 * ⚠️ Better Auth types `auth.options` as the **exact object literal** passed in,
 * which is a stronger contract than it first looks: an option that is absent on
 * purpose — `cookieCache`, `useSecureCookies`, `advanced.cookies` — is not a
 * property that reads `undefined`, it is a property the type does not have, and
 * `expect(…).toBeUndefined()` on it does not compile.
 *
 * That is a nice guarantee and a useless test, so the absence assertions read
 * through this widened view instead. They stay meaningful in the direction that
 * matters: the day somebody adds one of those keys, the literal type grows it
 * and the runtime assertion is what refuses the value.
 */
async function loadOptions(overrides: Record<string, string | undefined> = {}) {
  return (await loadAuth(overrides)).options as BetterAuthOptions
}

/** The gate, called the way Better Auth calls it. */
async function validate(user: { email?: string | null }, providerId = 'google') {
  const auth = await loadAuth()
  const validateUserInfo = auth.options.user?.validateUserInfo

  expect(validateUserInfo, 'validateUserInfo is not configured at all').toBeTypeOf('function')

  return validateUserInfo!({
    user,
    source: { action: 'sign-in', method: 'oauth', oauth: { providerId, profile: {} } },
  } as Parameters<NonNullable<typeof validateUserInfo>>[0])
}

describe('the process refuses to start without its environment', () => {
  // ⚠️ `08` §4.3: a missing variable must stop the process, not soften the
  // comparison. The failure mode this forbids is a deploy that answers requests
  // with an allowlist that admits everyone, which looks exactly like a working
  // deploy until somebody else signs in.
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('throws when KIOKU_INVITED_EMAIL is %s', async (_label, value) => {
    await expect(loadAuth({ KIOKU_INVITED_EMAIL: value })).rejects.toThrow(/KIOKU_INVITED_EMAIL/)
  })

  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])('throws when %s is unset', async (name) => {
    await expect(loadAuth({ [name]: undefined })).rejects.toThrow(new RegExp(name))
  })

  it('names the variable and never a value', async () => {
    // ⚠️ The repo is public and so is a stack trace in a deployment log
    // (`03` §13.1, §13.4).
    await expect(loadAuth({ KIOKU_INVITED_EMAIL: undefined })).rejects.not.toThrow(
      new RegExp(INVITED),
    )
  })
})

describe('refusal one — the profile validator', () => {
  it('admits the invited account', async () => {
    expect(await validate({ email: INVITED })).toBeUndefined()
  })

  it('refuses an uninvited account', async () => {
    expect(await validate({ email: 'someone@example.com' })).toMatchObject({
      error: 'not_invited',
    })
  })

  it.each(['github', 'apple', 'some-provider-added-later'])(
    'refuses an uninvited account arriving through %s, because it never reads the source',
    async (providerId) => {
      // ⚠️ `08` §4.3, and the failure this test exists for: Better Auth's own
      // documented example opens with
      // `if (source.oauth?.providerId !== "google") return`, which is correct
      // for a domain check across several providers and **fails open** as an
      // allowlist — the day a second provider is enabled, everyone it admits
      // walks past this gate. A narrowing implementation returns `undefined`
      // here and this test goes red.
      expect(await validate({ email: 'someone@example.com' }, providerId)).toMatchObject({
        error: 'not_invited',
      })
    },
  )

  it('admits the invited account through any provider, so the gate is a comparison and not a filter', async () => {
    expect(await validate({ email: INVITED }, 'github')).toBeUndefined()
  })

  it('refuses a profile that carries no email at all', async () => {
    expect(await validate({ email: undefined })).toMatchObject({ error: 'not_invited' })
  })
})

describe('refusal two — the provider-level signup switch', () => {
  it('disables signup on google, which is where the switch lives', async () => {
    // ⚠️ `08` §3.2: there is **no global `disableSignUp`**. It is per provider,
    // so it has to be set wherever a method is enabled — which is the fact that
    // goes stale silently when a second provider is added.
    const auth = await loadAuth()

    expect(auth.options.socialProviders?.google).toMatchObject({ disableSignUp: true })
  })

  it('enables exactly one provider, so there is nowhere for the switch to be missing from', async () => {
    const auth = await loadAuth()

    expect(Object.keys(auth.options.socialProviders ?? {})).toEqual(['google'])
  })

  it('has no email-and-password method', async () => {
    // ADR 0012 rejected rather than deferred it. `validateUserInfo` would still
    // fire, but `disableSignUp` would not — the second refusal is per provider.
    const options = await loadOptions()

    expect(options.emailAndPassword?.enabled).toBeFalsy()
  })
})

describe('both refusals land in the same place', () => {
  it('sends a programmatic API error to /auth/refused rather than the library page', async () => {
    // ⚠️ Verification §11.5: `onAPIError.errorURL` otherwise defaults to
    // `/api/auth/error` and Better Auth's own styled page — a page with a retry
    // on it, on the one flow where there is nowhere onward (`08` §2.1). The
    // redirect half is `errorCallbackURL` on the sign-in call, in
    // `app/pages/auth/index.vue`.
    const auth = await loadAuth()

    expect(auth.options.onAPIError?.errorURL).toBe('/auth/refused')
  })
})

describe('the session, and the two options that are absent on purpose', () => {
  it('is a 7-day database session with a 1-day sliding refresh', async () => {
    const auth = await loadAuth()

    expect(auth.options.session).toMatchObject({
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    })
  })

  it('leaves cookieCache off', async () => {
    // ⚠️ `08` §5.4. A cached session stays valid for the cache window after the
    // row is gone, so revoking a session would take up to five minutes to mean
    // anything — which is the exact property database sessions were chosen over
    // JWTs to get. This is not a performance decision and must not be reversed
    // as one.
    const options = await loadOptions()

    expect(options.session?.cookieCache).toBeUndefined()
  })

  it('sets sameSite, path and httpOnly explicitly', async () => {
    // ⚠️ `08` §5.1: these **match** the library's defaults; writing them out is
    // the decision, so an upstream change shows up as a diff we can see.
    const auth = await loadAuth()

    expect(auth.options.advanced?.defaultCookieAttributes).toMatchObject({
      sameSite: 'lax',
      path: '/',
      httpOnly: true,
    })
  })

  it('does not pin sameSite to strict, which would break sign-in', async () => {
    // ⚠️ `08` §5.2, and it is worth its own assertion because `strict` is the
    // reflexive hardening move. `defaultCookieAttributes` applies to **every**
    // cookie the library mints, the OAuth state cookie included, and Google's
    // callback is a top-level cross-site GET — which a `Strict` cookie is not
    // sent on. The symptom is `state_security_mismatch`, not a cookie warning.
    const options = await loadOptions()

    expect(options.advanced?.defaultCookieAttributes?.sameSite).not.toBe('strict')
    expect(options.advanced?.cookies?.session_token).toBeUndefined()
  })

  it('leaves useSecureCookies to resolve', async () => {
    // ⚠️ `08` §5.3. Pinning `true` buys nothing in production, where `baseURL`
    // already resolves it, and breaks the laptop — which ADR 0022 makes a real
    // environment rather than a convenience.
    const options = await loadOptions()

    expect(options.advanced?.useSecureCookies).toBeUndefined()
  })
})

describe('the seam at API-key verification, kept shut', () => {
  it('enables no plugins', async () => {
    // ⚠️ `08` §9: `validateUserInfo` gates sign-in and does **not** gate API-key
    // verification. `apiKey()` or `bearer()` would leave any endpoint they
    // authenticate protected by *only keys I issued exist* rather than by the
    // allowlist — which makes `S1`'s "refused at every route" nearly true, and
    // nearly true is the failure mode this project keeps refusing.
    //
    // ADR 0015 closes it by having the worker read the database directly. There
    // is no HTTP job endpoint, and adding "just one convenience endpoint" is a
    // change to ADR 0015, not a change to a route table.
    const auth = await loadAuth()

    expect(auth.options.plugins ?? []).toEqual([])
  })
})
