# The session is read in server middleware, and a *place* never reads it from the client

**One Nitro server middleware resolves the session on every request and writes it to
`event.context.session`. The three *places* read it from the request event and never call anything.
The two *modes* read it in the browser, where the problem does not exist.**

This is the one thing `08-authentication.md` had to decide rather than cite. Better Auth documents a
Nuxt gotcha and offers two fixes; ADR 0013's rendering split makes one of them literally void on the
routes that need it most, and nothing upstream notices the collision because nobody else ships a
route with no JavaScript behind a login.

## The collision

Better Auth's Nuxt page states that client actions other than `useSession` **do not forward cookies
during SSR**, and offers `<ClientOnly>` or `useRequestHeaders(['cookie'])` as the fix
([`../phase-4-verification.md`](../phase-4-verification.md) §5.5).

⚠️ **`<ClientOnly>` renders nothing on a route that ships no JavaScript.** Ingest, Sources and Stats
are exactly those routes — `routeRules: { noScripts: true }`, ADR 0020 and `03` §2.1 — so on all
three the recommended fix produces a permanently empty element. It is not degraded; it is blank.

The second fix, `useRequestHeaders(['cookie'])` forwarded into a client action, works. It is also a
round trip from the server back to our own HTTP surface to ask a question the request already
answers.

## Decision

**The session is never fetched. It is resolved once, before anything else runs.**

`server/middleware/session.ts` calls `auth.api.getSession({ headers: event.headers })` — the Nuxt
spelling, verification §11.3 — and assigns the result to `event.context.session`. Nuxt documents
that server middleware "will run on every request before any other server route" and that its job is
to "extend the request context"; the documented example is `event.context.auth = { user: 123 }`.
This is the shape the framework asks for, used for the thing it was described with.

From there:

| Route | How the session is read |
| --- | --- |
| Ingest, Sources, Stats — *places*, `noScripts` | `useRequestEvent()!.context.session`, server-side, in the page component |
| *Vet*, *Review* — *modes*, `ssr: false` | `useSession()` from `better-auth/vue`, in the browser |
| Every `/api/**` route | `event.context.session`. **No route re-derives it** |

The two halves do not overlap and neither is a fallback for the other. A `ssr: false` page component
never executes on the server, so there is no SSR pass to forward a cookie during — the documented
gotcha does not apply to the *modes* at all. A `noScripts` page never executes in the browser, so
there is no client to call from.

## Why this is better than the fix that would have worked

`useRequestHeaders(['cookie'])` plus a call to `/api/session` would function. It costs an HTTP round
trip per document render and it puts the reader's session cookie into application code so it can be
copied into a fetch. **The middleware never hands the cookie to anything**; it hands over a resolved
session object, and the header stays where the runtime put it.

It also removes a decision from every future page. There is one place a session is obtained, so
"where does this screen get the session" stops being a question a screen can answer differently.

## Consequences

**The rendering split becomes self-enforcing in the auth layer.** `useRequestEvent()` returns
`undefined` in the browser (verification §11.3). If a future session drops `noScripts` from a
*place*, that page throws on hydration the first time it runs — the failure is immediate and local,
not a silently signed-out screen. `03` §2.1 gets the same property from the build; this is the same
guarantee, arriving by a different route.

⚠️ **Three route rules are now forbidden on the *places*, and each looks like a performance win.**

- **`prerender: true`** — a prerendered route is "included in your build as static assets"
  (verification §11.4). There is no request, so no middleware, no session, and a document rendered
  at build time from nobody's session.
- **`swr`** and **`isr`** — a cached signed-in document, served to whoever asks next. Nuxt maps route
  rules onto Vercel's native rules automatically, so `isr` is not a local decision; it is a CDN we do
  not operate holding a personal page.

None of the three is a hypothetical: all three are the ordinary advice for a route that renders a
form, a list and five numbers.

**`event.context.session` is typed in `server/types/`**, which Nuxt scans for server-only types
(files directly inside it — nested directories are ignored).

**The middleware resolves; refusal is a second, explicit step.** Attaching a session and rejecting a
request are different concerns, and the public set — Better Auth's own catch-all, the door, the
refusal page — is small enough to be written out rather than inferred. `08-authentication.md` §6.3
holds it.

**`auth.api.getSession` runs on every request, including asset requests in development.** At one
reader on a pooled Neon connection this is not a cost worth optimising, and the obvious optimisation
— `session.cookieCache` — is declined for a reason that is not performance (`08` §5.4): it would keep
a revoked session alive for up to five minutes, which is the property database sessions were chosen
for.

## Alternatives considered

**`useRequestHeaders(['cookie'])` into a client action.** Better Auth's own second suggestion, and it
works. Rejected above: a round trip per render, and the cookie enters application code.

**`<ClientOnly>`.** Better Auth's first suggestion. Not rejected on preference — it is inoperative on
the three routes that need it, and it would fail by rendering nothing rather than by erroring.

**Drop `noScripts` from the three *places* so the ordinary client-side pattern applies.** This is the
one that would quietly undo the project. ADR 0020 chose Nuxt *because* a route can ship zero
JavaScript, and only three of seven candidate frameworks could (verification §5). Reversing that to
avoid writing eight lines of server middleware would spend the framework decision on nothing.

**A Nuxt route middleware (`app/middleware/`) instead of a Nitro one.** Rejected on the same fact
`03` §2.1 already records: a `noScripts` route has no client-side middleware because it has no
client. Route protection is server-side only, which is a feature — there is no client guard to
bypass.

## Revisit if

Nuxt 5 lands (scheduled Q4 2026, `03` §13.5) and moves to Nitro v3 / h3 v2, at which point
`event.headers` becomes `event.req.headers` (verification §11.3) and this middleware is one of the
files that changes. The decision survives; the spelling does not.
