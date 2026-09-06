# Better Auth with Google OIDC, and two independent refusals

**Identity is Better Auth with Google as the social provider, using database sessions.** An
uninvited account is refused twice over, by two mechanisms that do not share a failure mode.

ADR 0012 parked this as a **stated but unverified preference** and required it be checked against
real documentation before becoming a decision. Verified 2026-09-06; it survives. Full findings in
[`../phase-4-verification.md`](../phase-4-verification.md) §2.

## The mechanism PRD S1 needs exists and is first-class

S1 requires that an uninvited account is refused **at every route**, with no path to create an
account from inside the app. The load-bearing mechanism is `user.validateUserInfo`, which fires on
`create-user`, `link-account` **and `sign-in`** — and on the sign-in pass it receives the *fresh*
provider profile rather than the stored row. Rejection is a 403 programmatically.

This matters more than it first appears: a gate that only fires at signup would let an
already-created account through forever. This one re-checks on every entry.

The second refusal is `socialProviders.google.disableSignUp: true`, which is per-provider — there is
no global equivalent, so it is set wherever a method is enabled.

**Two independent refusals is deliberate**, and is the "pin irreplaceable data by identity and guard
it in more than one place" pattern `CLAUDE.md` takes from `lfca-lab`.

## Alternatives considered

**Auth.js / NextAuth v5** — its `signIn` callback is an equally first-class allowlist and it is
lighter. Rejected because **v5 has been `5.0.0-beta.32` for years**, it is more framework-coupled,
and it offers no API-key story.

**Clerk** — has a literal invite-only mode as a dashboard toggle, so almost no auth code. Rejected
on a verified fact: **since August 2025 its allowlist applies to sign-ups only, not sign-ins**,
which fails S1's wording directly. Restriction features also require a paid plan in production, and
it adds a third-party account boundary to a single-reader personal app.

**Lucia** — ruled out, not weighed. It is deprecated and now points at a migration guide.

## Consequences for the schema

Better Auth owns four tables — `user`, `session`, `account`, `verification` — all remappable via
`modelName` / `fields` and extendable via `additionalFields`. Whether ADR 0012's *personal*
entities take their owner foreign key against `user.id` directly or against an app-level table is a
`04-database-schema.md` decision, not settled here.

Sessions are database-backed rather than JWTs, expiring in 7 days with a sliding refresh.

## The seam, named so it is not rediscovered

`validateUserInfo` gates *sign-in*. It does **not** gate API-key verification. Any HTTP endpoint
authenticated by `x-api-key` is protected by "only keys I issued exist", not by the allowlist —
which would make S1's "every route" nearly true rather than true. **ADR 0015 closes this by having
the worker read the database directly rather than calling the app over HTTP.** If that ever changes,
this seam reopens with it.

## Revisit if

A second reader is ever invited — at which point the allowlist stops being a single constant and
`validateUserInfo` needs a table behind it rather than a comparison.
