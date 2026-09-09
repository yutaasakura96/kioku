// The Better Auth instance. `08-authentication.md` §10 is the settled shape and
// this file is that shape written out — every value in it is cited there, and
// nothing here is a new decision except the import on the next line.
//
// ⚠️ **`better-auth/minimal`, not `better-auth`.** Measured 2026-09-09 while
// building #5: the default entry point is documented as "full mode (with
// Kysely)" and its own JSDoc points a `drizzleAdapter` configuration at
// `better-auth/minimal` instead. `08` §10 wrote `betterAuth` unqualified
// because it was written before there was a package on disk to read; the export
// map has carried both since 1.7.x. `08` §10 is amended. This is not a
// behavioural change — it is declining to bundle a second query builder into a
// serverless function that already has Drizzle.
//
// ⚠️ **`getMigrations` does not work with the Drizzle adapter** (verification
// §2.3), so Better Auth never runs a migration against this database. That is
// what makes `03` §4.2's one-migration-owner rule true in practice rather than
// by agreement — the four tables arrived through drizzle-kit like the other
// eighteen, in #4.

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'

import { useDatabase } from '../db'
import { requireEnv } from './env'
import { refuseUninvited } from './invited'

/**
 * ⚠️ Read **once, at construction**, and deliberately not inside the callback.
 *
 * `08` §4.3: no `|| ''` and no `if (INVITED_EMAIL)` guard. A missing variable
 * must stop the process, and a process that starts and then refuses everyone at
 * sign-in is a worse failure than one that never starts — it looks like the
 * allowlist working.
 */
const INVITED_EMAIL = requireEnv('KIOKU_INVITED_EMAIL').trim().toLowerCase()

export const auth = betterAuth({
  // `schemaName` lives here, on the *configured* adapter, which is why the
  // generator has to be pointed at this file with `--config` rather than told
  // `--adapter drizzle --dialect pg`. Those flags make the CLI synthesise an
  // adapter, and a synthesised one has no `schemaName` — see the header of
  // `server/db/schema/auth.ts`, which is the file that comes out.
  database: drizzleAdapter(useDatabase(), { provider: 'pg', schemaName: 'auth' }),

  socialProviders: {
    google: {
      clientId: requireEnv('GOOGLE_CLIENT_ID'),
      clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),

      // ⚠️ Refusal two of two (ADR 0017, `08` §3.2). **There is no global
      // `disableSignUp`** — it is per provider, so it is set wherever a method
      // is enabled, which today is one place. That is exactly the kind of fact
      // that goes stale silently when a second provider is added by someone who
      // read only the first refusal.
      //
      // It fails differently from `validateUserInfo` on purpose: this one is
      // wrong if *Better Auth's* provider handling is wrong; that one is wrong
      // if *ours* is (`08` §3.3). Neither disables the other.
      disableSignUp: true,
    },
  },

  user: {
    // ⚠️ Refusal one of two, and the load-bearing one. It fires on
    // `create-user`, `link-account` **and `sign-in`**, and on the sign-in pass
    // it receives the fresh provider profile rather than the stored row
    // (`08` §3.1, verification §2.1). A gate that only fired at signup would
    // admit an already-created account forever — including a row that reached
    // the table before this configuration existed, through a migration, or from
    // a restored snapshot.
    //
    // ⚠️ `source` is deliberately unread. Narrowing on `source.oauth.providerId`
    // is the library's own documented example and it is a fail-open gate for an
    // allowlist: it admits every provider added after it was written.
    validateUserInfo: ({ user }) => refuseUninvited(user, INVITED_EMAIL),
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days — ADR 0017, verification §2.2
    updateAge: 60 * 60 * 24, // sliding, 1 day

    // ⚠️ `cookieCache` is deliberately absent (`08` §5.4). It serves the session
    // from a signed cookie to skip the database read, and a cached session stays
    // valid for the cache window after the row is gone — so revoking a session
    // would take up to five minutes to mean anything. Database sessions were
    // chosen over JWTs for exactly the property the cache gives back.
  },

  advanced: {
    // ⚠️ `sameSite: "lax"` twice over (`08` §5.2). `defaultCookieAttributes`
    // applies to **every** cookie Better Auth mints, the OAuth state cookie
    // included, and Google's callback is a top-level cross-site GET redirect —
    // which a `Strict` cookie is not sent on. `Strict` here breaks sign-in.
    // Scoping `Strict` to the session token alone is rejected separately: the
    // three *places* are server-rendered documents whose session is read on the
    // server, so under `Strict` an external link would serve the signed-out
    // document on first arrival.
    //
    // These match the library's own defaults (verification §11.1). Writing them
    // out is the decision: a hard default inside a source file is a weaker
    // contract than a value in our own configuration, and an upstream change
    // then shows up as a behavioural diff we can see.
    defaultCookieAttributes: { sameSite: 'lax', path: '/', httpOnly: true },

    // ⚠️ `useSecureCookies` is deliberately absent (`08` §5.3). It resolves from
    // the explicit option, then the `baseURL` protocol, then `NODE_ENV`.
    // Production is HTTPS end to end so `baseURL` resolves it to `true`; the
    // laptop over `http` resolves it to `false` and works. Pinning `true` buys
    // nothing in production and breaks the environment ADR 0022 makes real.
  },

  // ⚠️ Without this a programmatic refusal lands on `/api/auth/error` and Better
  // Auth's own styled page (verification §11.5) — which is a page with a retry
  // on it, on the one flow where there is nowhere onward. The redirect half of
  // the same refusal is `errorCallbackURL` on the sign-in call, in
  // `app/pages/auth/index.vue`. Both land here (`08` §2.1).
  onAPIError: { errorURL: '/auth/refused' },

  // ⚠️ No `apiKey()` and no `bearer()` (`08` §9). `validateUserInfo` gates
  // sign-in and does **not** gate API-key verification, so either plugin would
  // reopen the seam whether or not a route used it — and `S1`'s "refused at
  // every route" would become nearly true. ADR 0015 closes that seam by having
  // the worker read the database directly; there is no HTTP job endpoint, and
  // none may be added.
  plugins: [],
})
