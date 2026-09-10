# The *source* submission posts to the *place* that renders its refusal

**The Ingest form's `action` is `/`, not `/api/source`. A Nitro server middleware intercepts
`POST /`, answers `303` on success, and on a validation failure attaches the refusal to
`event.context` and falls through to the renderer, so the Ingest *place* itself answers `200` with
the form re-rendered and the reader's text still in it.**

`09` §1's route table said `POST /api/source` and `09` §4.2 said the refusal is "`200`, the form
re-rendered with the text still in it". Both are amended: they cannot both be true of a Nitro route
handler, because a route handler cannot render a Vue page.

## The requirement that forces it

`09` §4.2 argues the refusal at length, and the argument is not about status codes:

> The over-cap row is the one that had to be argued. A `303` after a rejected 120,000-character paste
> loses the paste, and there is no client to hold it. Re-rendering from the `POST` body keeps it. The
> cost is that a browser reload on the error page re-submits, which is the ordinary cost of the
> ordinary answer.

That last sentence is the tell: a reload only re-submits if the error page **is** the `POST`
response. So the response body has to be the Ingest document, produced from the request that carried
the paste.

## What was measured

Both against the built app, 2026-09-11.

- **Nuxt's page renderer answers `POST` with a fully rendered document** — `200`, `text/html`, the
  page component rendered. A `POST` that reaches the router is therefore served by the *place*
  itself, which is exactly the answer `09` §4.2 asks for.
- ⚠️ **Rewriting `event.node.req.url` inside a middleware does not re-route.** The request `404`s.
  h3 1.15.11's `event.path` reads `_path || node.req.url`, but Nitro's router has already resolved by
  then. So there is no way to accept the `POST` at one path and have it rendered at another.

And read off the source rather than measured: `nitropack` 2.13.4's `localFetch` builds a **fresh**
node request and takes no context, so a rejected 120,000-character paste has no way to travel into an
internal render.

## Alternatives

- **A route handler at `/api/source` that renders the failure itself.** It would have to emit the
  Ingest screen — a second copy of a page that is specified in `10` §6 down to the gutter. Two copies
  of a screen is `04` §13's argument about drift, in the layer where it is most visible.
- **`303` plus a server-side flash.** It works, and it changes the design: `09` §4.2 chose the
  re-render *over* a redirect, and named the cost it accepts. A flash also adds per-session server
  state, which nothing else in this application has — the two *modes* keep client state, the three
  *places* keep none.
- **Waiting for a Nuxt feature.** There is nothing to wait for that is documented.

## What does not change

Everything `09` §1's row was *for*:

- **The write is a form.** The three *places* have no client, so every write they perform is one.
- **It is post-redirect-get.** `303` on success, to `/`.
- ⚠️ **The CSRF story is unchanged and still costs nothing.** `SameSite=Lax` sends the cookie for a
  same-site `POST` and not for a cross-site one — cross-site it is sent only for top-level
  navigations using a safe method, which excludes `POST` (verification §12.2). That is a property of
  the cookie, not of the path.
- **The gate is unchanged.** `server/middleware/session.ts` runs first and has already answered `302`
  for an unauthenticated document request, so the submission middleware never runs without a session.

Only the path in the form's `action` moved, and it moved because **the only path that can render the
refusal is the one the refusal has to appear on.**

## The cost, stated

⚠️ **A submission handler now lives in `server/middleware/` rather than in `server/api/`**, which
means it runs on every request and checks the method and the path itself. `server/middleware/session.ts`
already had that shape for the same structural reason, so it is a second instance of an existing
pattern rather than a new one — but a reader looking for the *source* write under `server/api/` will
not find it, which is why `09` §1's table names the file.

## Revisit if

Nuxt gains a documented way for a server route to render a page with request-scoped data. The handler
is one file and the form's `action` is one attribute; nothing else would move.
