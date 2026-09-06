# Kioku — authentication

**Date:** 2026-09-06
**Status:** Phase 4. The mechanism behind `S1`, in full. Most of it is citation; three things are
decided here, and one of those is [ADR 0030](adr/0030-the-session-is-read-in-server-middleware-and-a-place-never-reads-it-from-the-client.md).

Vocabulary is [`../CONTEXT.md`](../CONTEXT.md). Requirements are
[`02-product-requirements.md`](02-product-requirements.md), cited `S1`–`S12`. Mechanisms are
[`03-technical-design.md`](03-technical-design.md) and [`04-database-schema.md`](04-database-schema.md),
cited by section. Verified facts are [`phase-4-verification.md`](phase-4-verification.md), cited by
section — **do not re-verify it.**

⚠️ **This file is `08-authentication.md`, not `08-auth-and-permissions.md`.** ADR 0012 triggered it
under the older name. **There are no permissions to specify:** `S1` gives every action in the app to
the one invited reader, so a permissions section would be a page saying so at length. The
shared/*personal* label that would become a permission model if a second reader were ever invited is
already written down, in `04` §4, and ADR 0012 owns the revisit condition.

---

## 0. What this document decides, and what it does not

**Decides — three things, and nothing else here is new:**

1. **Where the invited-account allowlist lives**, and the shape that stops it failing open (§4).
2. **The session cookie's `sameSite` and `path`**, which §2.2 of the verification flagged as
   unverified defaults and §11.1 has now settled (§5).
3. **How the session is read on a route that ships no JavaScript** — the real collision between
   ADR 0013's rendering split and Better Auth's documented Nuxt behaviour.
   [ADR 0030](adr/0030-the-session-is-read-in-server-middleware-and-a-place-never-reads-it-from-the-client.md)
   (§6).

**Cites, and does not reopen:** the library and its version, the provider, the session strategy and
lifetime, the two refusals and the code paths they fire on (ADR 0017, verification §2); the four
tables and the schema they live in (`04` §8); the owner foreign key and its delete rule (`04` §3);
the seam at API-key verification (ADR 0017, ADR 0015).

**Does not decide:** anything about a second reader. ADR 0012 and ADR 0017 both carry the same
revisit condition and it has not fired.

**There is still no code.** Better Auth's schema is generated with
`npx auth@latest generate --adapter drizzle --dialect pg` and lands in Drizzle's migration flow;
**running that is Phase 6** (`03` §4.2, `04` §8). The configuration below is documentation of what
will be written, in the same sense that `04` is documentation of tables that do not exist yet.

---

## 1. The shape, in one paragraph

**Better Auth 1.7.3, Google as the only social provider, database sessions, invite-only, refused
twice.** The catch-all is `server/api/auth/[...all].ts`; the client is `createAuthClient` from
`better-auth/vue` (`03` §2.2). Sessions live in Postgres and expire in 7 days with a sliding 1-day
refresh. There is no email-and-password method, no magic link, no second provider and no
self-registration path — not deferred, rejected (ADR 0012). The whole of access control is: the
right Google account, or nothing.

---

## 2. The sign-in flow, end to end

**Six routes exist, and one of them is not in ADR 0013's taxonomy.** ADR 0013 named three *places*
and two *modes*; those are the five screens of the app. The door is not a screen of the app, and it
is added here rather than by amending ADR 0013.

| Route | Rendering | Public? |
| --- | --- | --- |
| `/auth` — **the door**: sign in, and sign out | Universal. **The one route that ships JavaScript and is neither a *place* nor a *mode*** | Yes |
| `/auth/refused` | `noScripts: true` | Yes |
| `/api/auth/**` — Better Auth's catch-all | Nitro | Yes, and §3.3 is why that is safe |
| Ingest, Sources, Stats | `noScripts: true` (`03` §2.1) | No |
| *Vet*, *Review* | `ssr: false` (`03` §2.1) | No |

**The flow:**

1. An unauthenticated request to any non-public route is redirected to `/auth` by the server
   middleware (§6.3). There is nothing on `/auth` but one button.
2. The button calls
   `authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/auth/refused" })`.
3. Better Auth stores the OAuth state — payload in verification storage, state value in a signed
   cookie, because `account.storeStateStrategy` defaults to `"database"` when a database is
   configured (verification §11.2) — and redirects to Google.
4. Google returns to **`/api/auth/callback/google`**, the default callback URI for a provider
   (verification §11.6). That exact string is what Google's console holds.
5. The state cookie is checked against the callback's `state`. §5.2 is why this step constrains
   `sameSite` and is not a formality.
6. **`user.validateUserInfo` runs on the fresh Google profile** (§3.1). If the email is not the
   invited one, the flow ends here — before any row is written, on the create-user path, because the
   internal adapter runs the check ahead of `createWithHooks` (verification §11.5).
7. On success a `session` row is written, the session cookie is set (§5), and the reader lands on
   `/`.

**Sign-out** lives on `/auth` too, for the reason the door ships JavaScript at all: `authClient` is a
client library, and a *place* has no client to call it from.

> **Carried into implementation, not decided here:** whether Better Auth's sign-in and sign-out
> endpoints accept a plain `<form method="post">`. If they do, `/auth` needs no JavaScript either and
> the app ships none outside the two *modes*. Nothing was found either way, so nothing is claimed —
> the door ships JavaScript until somebody checks.

### 2.1 What an uninvited account sees

`03` §11 says **a 403 and no path onward**, and that is right, but the reader never sees a bare 403.
Verification §11.5: a `validateUserInfo` rejection triggers "a redirect to the error URL **or**
returning a 403 API error" — the redirect is the browser path, the 403 is the programmatic one.

So both are configured to land in the same place:

- `errorCallbackURL: "/auth/refused"` on the social sign-in call, for the flow that starts at the
  door.
- **`onAPIError.errorURL: "/auth/refused"`**, which otherwise defaults to `/api/auth/error` and
  Better Auth's own styled page (verification §11.5).

`/auth/refused` is a `noScripts` route with the message and **no sign-in button, no retry, no
support link**. There is nowhere onward because there is nowhere to go: there is no account to
create, no request to make and nobody to ask. `S1`'s "no path to create an account from inside the
app" is only true if the refusal page honours it too.

⚠️ **The refusal is not remembered.** No row is written, so a rejected sign-in leaves no rate-limit
state and no audit trail beyond the request log (`03` §11 — an id, never the email). At one reader
that is correct; it is also the thing to notice first if this ever becomes a login worth attacking.

---

## 3. The two refusals

ADR 0017's requirement is that an uninvited account is refused twice by mechanisms that **do not
share a failure mode**. This is the `lfca-lab` pattern `CLAUDE.md` names: pin irreplaceable data by
identity and guard it in more than one place.

### 3.1 `user.validateUserInfo` — the gate that re-fires

Fires on **`create-user`, `link-account` and `sign-in`**, and on the sign-in pass it receives the
**fresh provider profile** rather than the stored row (verification §2.1, §11.5).

That last clause is the whole reason this is the load-bearing refusal rather than the tidy one. **A
gate that only fired at signup would admit an already-created account forever** — including a row
that reached the table before this configuration existed, or through a migration, or from a restored
snapshot. This one re-asks on every entry, against what Google says today.

Rejection returns `{ error, errorDescription }`; §2.1 covers what that produces.

### 3.2 `socialProviders.google.disableSignUp: true` — per provider

An unknown account gets a documented `signup_disabled` error (verification §2.1). ⚠️ **There is no
global `disableSignUp`.** It is per-provider, so it is set wherever a method is enabled — which
today is one place, and which is exactly the kind of fact that goes stale silently when a second
provider is added by someone who read only the first refusal.

### 3.3 Why two, and why they do not share a failure mode

They fail differently on purpose:

| | Fails if | |
| --- | --- | --- |
| `validateUserInfo` | Our comparison is wrong, our environment is wrong, our code is wrong | **Ours** |
| `disableSignUp` | Better Auth's provider handling is wrong | **Theirs** |

A misconfigured allowlist does not disable `disableSignUp`, and a Better Auth regression in
`disableSignUp` does not stop the comparison running. `validateUserInfo` also covers a case
`disableSignUp` structurally cannot: an account that already exists.

This is also why **Better Auth's own catch-all is public** and that is not a hole. `/api/auth/**`
must be reachable unauthenticated or nobody can ever sign in. What protects it is not a session
check — it is that every path through it that mints an identity passes both refusals.

---

## 4. Where the allowlist lives — decided

**Decision: one environment variable, `KIOKU_INVITED_EMAIL`, read where the `betterAuth()` instance
is constructed. Not a repo constant, not a table.**

`03` §13.1 already lists it — *Invited email address · Nuxt app · Vercel environment variables, per
environment · one value, per ADR 0017*. This section is why, and what the shape has to be.

### 4.1 Why not the repo

An email address is not a credential, so `03` §13.1's "never in the repo" is not automatically
decisive. Two things make it decisive anyway. `03` §13.4 already classifies the reader's email as
sensitive data — never logged, an id instead — and a constant in the repository is a weaker place
than a log. And there is **no git remote yet** (`03` §13.5): the decision that puts a personal email
into version control is made once and is effectively permanent, before the repository has an
audience.

The environment variable also gets **per-environment values for free**, which matters because Neon
runs a branch per environment and production has never shared a string with development.

### 4.2 Why not a table

ADR 0017's revisit condition is precise: the allowlist stops being a single constant **when a second
reader is invited**, and at that point `validateUserInfo` needs a table behind it rather than a
comparison. That has not happened, and building the table early costs three things — a database read
inside every sign-in, a row in `public` that is really about identity, and a bootstrapping problem
with no answer. **There is no admin surface to insert the first row**, and there must not be: an
in-app path that adds an allowed account is a self-registration path with an extra step, which
ADR 0012 rejected rather than deferred.

Restated so it is not rediscovered: **the table is the right shape at two readers and the wrong
shape at one.** The trigger is the second reader, not the discomfort of an environment variable.

### 4.3 The shape, because a list-shaped allowlist fails open

The value is a single address, compared unconditionally:

```ts
// At construction. Throws if unset or empty — the process does not start without it.
const INVITED_EMAIL = requireEnv("KIOKU_INVITED_EMAIL").trim().toLowerCase()

user: {
  validateUserInfo: ({ user }) => {
    if (user.email?.trim().toLowerCase() !== INVITED_EMAIL) {
      return { error: "not_invited", errorDescription: "Access is invite-only" }
    }
  },
}
```

Four things in that are deliberate:

- **No `|| ""` and no `if (INVITED_EMAIL)` guard.** A missing variable must stop the process, not
  soften the comparison. Better Auth itself fails closed in the same situation — a missing endpoint
  context throws `FORBIDDEN`, it does not skip the check (verification §11.5) — and this matches it.
- ⚠️ **No list.** `if (allowed.length && !allowed.includes(email))` is the natural way to write an
  allowlist and it **admits everyone when the list is empty**. The single constant is not merely
  simpler; it is the shape that has no empty case.
- ⚠️ **No provider narrowing.** Better Auth's documented example opens with
  `if (source.oauth?.providerId !== "google") return;` (verification §11.5), which is correct for a
  domain check across several providers and is a fail-open gate for an allowlist. The comparison here
  runs for every source, so adding a provider cannot silently bypass it.
- **Case-insensitive on our side.** The internal adapter lowercases on the create-user path;
  **nothing documents the same for the sign-in path** (verification §11.5), and this comparison has to
  hold on both.

### 4.4 How it is changed

Edit the environment variable for that environment and redeploy. That is the whole procedure, and
its properties are the point: it is not editable from inside the app, it leaves a deployment record,
and it cannot be done by anyone who is not already the deployer.

---

## 5. Sessions — decided

**Database sessions, `expiresIn` 7 days, `updateAge` 1 day (sliding), `freshAge` 1 day** — ADR 0017
and verification §2.2, cited not reopened.

### 5.1 `sameSite: "lax"` and `path: "/"`, set explicitly

```ts
advanced: {
  defaultCookieAttributes: { sameSite: "lax", path: "/", httpOnly: true },
}
```

Verification §2.2 recorded these as **unverified defaults**. §11.1 settles them: `sameSite: "lax"` is
stated in the security reference, and `path: "/"`, `httpOnly: true` are hard defaults in
`createCookieGetter`. So these values **match** the library rather than differing from it.

They are still written out, and that is the decision. A hard default inside a source file is a
weaker contract than a value in our own configuration: writing it means an upstream change shows up
as a behavioural diff we can see, and it removes the thing `03` §13.4 objects to, which is depending
on a default nobody checked.

### 5.2 Why `lax` and not `strict`, twice over

⚠️ **`defaultCookieAttributes` applies to every cookie Better Auth mints, not only the session
token** (verification §11.1) — the OAuth state cookie included. And the callback from Google is a
top-level cross-site GET redirect, which a `Strict` cookie is not sent on. Better Auth's own
`state_security_mismatch` page names "`SameSite` policy issues preventing the cookie from being sent"
as a cause (verification §11.2). **`Strict` here breaks sign-in.**

The obvious repair is to scope `Strict` to the session cookie alone, via
`advanced.cookies.session_token.attributes`, which sits highest in the merge order. **That is
rejected on a second, independent reason:** the three *places* are server-rendered documents whose
session is read on the server (§6). Under `Strict`, arriving at Kioku from any external link — a
bookmark bar is fine, a link in a note is not — sends no cookie on the first request, so the reader
gets the signed-out document and has to navigate again inside the site to be recognised.

What `lax` gives up, stated plainly: it permits the cookie on cross-site **top-level GET**. Nothing
in this app mutates on GET — every mutation is a POST to a Nitro route — and Better Auth carries a
CSRF check and an origin check that are enabled unless explicitly disabled
(`advanced.disableCSRFCheck`, `advanced.disableOriginCheck`; verification §11.1), with
`trustedOrigins` derived from `baseURL` plus anything declared (§11.6). Neither is turned off.

`path: "/"` is forced rather than chosen — the middleware resolves a session on every request,
including `/` and `/api/**` — which is precisely why it is written down instead of assumed.

### 5.3 `secure` is left to resolve, and that is deliberate

`useSecureCookies` is **not set**. It resolves in a documented order (verification §11.1): the
explicit option, then the `baseURL` protocol, then `NODE_ENV === "production"`. Production is HTTPS
end to end (`03` §13.3), so `baseURL` resolves it to `true`; local development over `http` resolves
it to `false` and works. Pinning `true` would buy nothing in production and break the laptop, which
ADR 0022 makes a real environment rather than a convenience.

### 5.4 `session.cookieCache` is off

It is opt-in and serves the session from a signed cookie to skip the database read (verification
§2.2, §11.6). **Declined, and not for performance.** A cached session stays valid for the cache
window after the row is gone, so revoking a session would take up to five minutes to mean anything.
Database sessions were chosen over JWTs for exactly the property the cache gives back. At one reader
on a pooled Neon connection the read it saves is not a cost worth having the conversation about.

### 5.5 Nothing is remapped

No `cookiePrefix`, no `advanced.cookies[…].name`. The session cookie keeps its default name, for the
same reason `04` §8 does not rename the four tables: a rename buys tidiness and costs the ability to
regenerate a configuration and diff it against what is deployed.

### 5.6 The expiry the *modes* have to survive

⚠️ A session can expire during a *Review* session, and ADR 0007's outbox is where that stops being
cosmetic. A flush that fails with **401 is not a network error** and must not be retried on the same
backoff forever: it means sign in again. `03` §11 already requires the end screen to report grades
still unsent rather than implying they landed — this is the case that makes that line load-bearing.
Seven days with a sliding refresh makes it rare; the outbox is the one place in the system where
client-authored data becomes permanent history, so rare is not the same as ignorable.
**`11-testing-plan.md` owns the test.**

---

## 6. Reading the session — decided

Full argument in
[ADR 0030](adr/0030-the-session-is-read-in-server-middleware-and-a-place-never-reads-it-from-the-client.md).
Summary, and the parts that are configuration.

### 6.1 The collision, and why the documented fix is void here

Better Auth documents that client actions other than `useSession` **do not forward cookies during
SSR**, and offers `<ClientOnly>` or `useRequestHeaders(['cookie'])` (verification §5.5). ⚠️
**`<ClientOnly>` renders nothing on a route that ships no JavaScript**, and Ingest, Sources and Stats
are exactly those routes. `03` §2.2 flagged this and left it open. It is now closed.

### 6.2 One middleware, and two ways down from it

`server/middleware/session.ts` calls `auth.api.getSession({ headers: event.headers })` — the Nuxt
spelling; ⚠️ the Nitro integration page's `event.req.headers` is the h3 v2 shape and Nuxt 4.5.2 pins
`nitropack ^2.13.4` (verification §11.3) — and writes `event.context.session`. Nuxt documents server
middleware as running "on every request before any other server route" and as existing to "extend the
request context".

| Route | Reads the session by |
| --- | --- |
| Ingest, Sources, Stats | `useRequestEvent()!.context.session`, server-side, in the page component |
| *Vet*, *Review* | `useSession()` from `better-auth/vue`, in the browser |
| Every `/api/**` route | `event.context.session` — **no route re-derives it** |

The two halves cannot overlap. A `ssr: false` page never runs on the server, so there is no SSR pass
to forward a cookie during. A `noScripts` page never runs in the browser, so there is no client to
call from. **The session cookie is never handed to application code**; the middleware hands over a
resolved session.

`event.context.session` is typed in `server/types/`, which Nuxt scans for server-only types.

### 6.3 Refusal is a second step, and the public set is written out

The middleware resolves; it does not reject. Rejection is explicit, because attaching a session and
refusing a request are different concerns and the exception list should be readable in one glance:

| Public | Everything else |
| --- | --- |
| `/api/auth/**`, `/auth`, `/auth/refused` | Document request → **302 to `/auth`**. `/api/**` → **401** |

`S1` says refused at **every** route including the ingest endpoint, and `03` §13.2 says route
protection is Nitro server middleware with no client guard anywhere to bypass. Three of the five
screens have no client to guard on, which makes the usual mistake structurally impossible rather
than merely avoided.

### 6.4 ⚠️ Three route rules are now forbidden on the *places*

Each of them is the ordinary advice for a route that renders a form, a list and five numbers, and
each silently disables the gate (verification §11.4):

| Rule | What it does to a session-gated route |
| --- | --- |
| `prerender: true` | Built as a **static asset**. No request, no middleware, no session |
| `swr` | A cached signed-in document, served to whoever asks next |
| `isr` | The same, in **Vercel's CDN** — route rules map onto the platform's native rules automatically |

The `noScripts` smoke test in `00-status.md` uses `{ prerender: true, noScripts: true }` on a
throwaway route. **That combination is correct for the test and forbidden in the app.**

### 6.5 The split is now self-enforcing

`useRequestEvent()` returns `undefined` in the browser (verification §11.3). If a future session
removes `noScripts` from a *place*, that page throws the first time it hydrates. `03` §2.1 gets the
same property from the build; this is a second, independent way for the same mistake to be loud.

---

## 7. The four tables, and how they are generated

**`user`, `session`, `account`, `verification`, in an `auth` Postgres schema.** `04` §8 owns this;
repeated here only because a document about authentication that does not say where the session rows
live is missing its own subject.

- Generated with **`npx auth@latest generate --adapter drizzle --dialect pg`**, then they land in
  Drizzle's migration flow like everything else. **Phase 6 runs it.**
- ⚠️ **`getMigrations` does not work with the Drizzle adapter** (verification §2.3), so **Better Auth
  never runs a migration against this database.** That is what makes `03` §4.2's one-migration-owner
  rule true in practice rather than by agreement.
- **Nothing is remapped** — no `modelName`, no `fields`. A rename costs the ability to regenerate and
  diff.
- The separate schema makes "this project does not own these four tables" structural rather than a
  comment, and keeps `user` — a reserved word, quoted as `auth."user"` — out of `public`.
- `additionalFields` is not used. There is nothing to add to a user when there is one.

---

## 8. The owner foreign key, and the convention that had to be broken

`04` §3 and verification §10.2 carry the argument in full. It is restated here in three lines
because this is where someone will look for it:

**Every `owner_id` on a *personal* entity references `auth."user".id`, typed `text`, with
`ON DELETE RESTRICT`.**

⚠️ Better Auth's generated schema wires **every** child of `user` with `onDelete: "cascade"`.
Copying that convention onto *personal* entities would make deleting one row destroy every
*scheduling epoch* and every *review log* beneath it — `03` §13.6 names destroying review history as
the worst thing an attacker could do, and this is that outcome arriving as a copied ORM default.

**Better Auth keeps its own cascades and they are correct.** Sessions and accounts should disappear
with a user; a sign-in regenerates them. **The rule is not "no cascades" — it is that a cascade must
never reach a table that cannot be rebuilt.** Do not re-derive this; `04` §3 is the authority.

---

## 9. The seam, restated so it cannot be reopened by accident

⚠️ **`validateUserInfo` gates sign-in. It does not gate API-key verification** (ADR 0017,
verification §2.4).

Any endpoint authenticated by `x-api-key` would be protected by *only keys I issued exist*, not by
the allowlist — which makes `S1`'s "refused at every route" **nearly** true instead of true. Nearly
true is the failure mode this project keeps refusing.

**ADR 0015 closes it by having the worker read the database directly rather than calling the app over
HTTP. There is no HTTP job endpoint, and none may be added.**

Two things follow, and both are easy to undo without noticing:

- The `apiKey()` and `bearer()` plugins are **not enabled**, and enabling either reopens the seam
  whether or not a route uses it.
- ADR 0015 now survives on this argument alone. The 9 ms SudachiPy measurement (verification §7.3)
  killed the latency half of its reasoning, so **"the worker needs no HTTP surface" is the whole of
  what is left holding it up** — which makes adding "just one convenience endpoint" a change to
  ADR 0015, not a change to a route table.

`03` §13.1 states the matching property from the other side: **the app tier never holds the model
provider key.** The process with an internet-facing surface cannot spend money; the process that can
spend money has no internet-facing surface.

---

## 10. The configuration, in one place

Not code — the settled shape, so that Phase 6 writes it rather than re-deciding it. Every value here
is cited above.

```ts
betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),

  socialProviders: {
    google: {
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      disableSignUp: true,                       // §3.2 — per provider, there is no global one
    },
  },

  user: {
    validateUserInfo: ({ user }) => { … },       // §4.3 — unconditional, case-insensitive, no list
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,                 // 7 days
    updateAge: 60 * 60 * 24,                     // sliding, 1 day
                                                 // §5.4 — cookieCache deliberately absent
  },

  advanced: {
    defaultCookieAttributes: { sameSite: "lax", path: "/", httpOnly: true },  // §5.1, §5.2
                                                 // §5.3 — useSecureCookies deliberately absent
  },

  onAPIError: { errorURL: "/auth/refused" },     // §2.1 — otherwise /api/auth/error
})
```

**The five environment variables**, and where each lives (`03` §13.1):

| Variable | Held by |
| --- | --- |
| `BETTER_AUTH_SECRET` | Nuxt app — Vercel environment variables, per environment |
| `BETTER_AUTH_URL` | Same. Sets `baseURL`, from which `trustedOrigins` and `secure` both derive |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Same |
| **`KIOKU_INVITED_EMAIL`** | Same — one value, §4 |

**In Google Cloud:** the authorised redirect URI is **`https://<host>/api/auth/callback/google`**
(verification §11.6).

⚠️ **Vercel preview deployments do not sign in, and that is the decision.** Preview URLs are
generated per deployment, so registering them with Google means either a wildcard Google does not
accept or an entry per deploy. Production and one local development origin are registered; a preview
build is for looking at, not for signing into. This is one more thing the move in ADR 0022 tidies
away.

---

## 11. What this hands forward

- **`09-user-flows.md`** — `/auth` and `/auth/refused` are two routes it must draw, and §2's flow is
  the sign-in path end to end. The redirect target for an unauthenticated document request is
  `/auth`, not the requested screen.
- **`10-screen-specifications.md`** — two more screens than ADR 0013 counted. The door has one
  button; the refusal page has a message and **nothing else**, and §2.1 is why the empty space is a
  requirement rather than an omission.
- **`11-testing-plan.md`** — three tests this document generates, none of them about a happy path:
  an uninvited account is refused **on sign-in as well as at signup** (§3.1); the process refuses to
  start with `KIOKU_INVITED_EMAIL` unset (§4.3); and an outbox flush that 401s surfaces on the end
  screen instead of retrying silently (§5.6).
- **Phase 6** — `npx auth@latest generate --adapter drizzle --dialect pg`, once, into Drizzle's
  migration flow (§7).
- **Phase 6, as a review item rather than a task** — whether Better Auth's sign-in and sign-out
  endpoints accept a plain form POST (§2). If they do, `/auth` stops being the exception to the
  rendering split.
