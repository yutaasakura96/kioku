# The landing route is Ingest, and never a decision about data

**`/` is Ingest.** `08` §2's `callbackURL: "/"` puts the reader on the paste box, on the first
sign-in and on every one after it. The landing route inspects nothing — not the *pending* count, not
what is due, not whether a *source* exists — and there is no redirect chooser behind it.

`08` set the callback and never said which screen it names. All three *places* are defensible, and
they imply different first sessions, so the choice had to be made somewhere.

## The PRD answered it once, in a sentence about empty states

PRD §4: Ingest "is the first screen after sign-in until a *source* exists." That is the only line in
the project that names a landing screen, and it names Ingest.

The clause it ends on is what invites a chooser, and this declines the invitation. "Until a source
exists" describes what the reader will do on day one. It does not require the route to move on day
two. A landing route that changes with the data is a home screen with the label filed off, and
PRD §3 cut the home screen deliberately.

## The interesting chooser cannot exist, because it would have to land in a mode

The version worth building sends the reader where the work is: forty-seven *pending notes* means
*Vet*, twelve due *cards* means *Review*. Both are *modes*. A mode replaces the *shell*, and its one
way out is a Done control that returns to the *place* the reader came from
([ADR 0026](0026-review-is-the-only-screen-that-gets-a-phone-layout.md),
[ADR 0032](0032-a-mode-is-entered-from-a-start-control-and-done-is-the-only-way-out.md)). Arriving in
a mode straight from Google leaves that control with no origin, and makes the reader's first sight of
the application a screen with no navigation on it at all.

That leaves a chooser picking between three *places* that are one click apart, at the price of a rule
nobody can predict from the outside.

## `/` is the only landing there is, which raises what it has to be worth

`08` §11 is explicit: an unauthenticated document request is redirected to `/auth`, **not** to the
screen that was asked for. The requested URL is discarded. So a reader whose seven-day session lapsed
while a `/stats` tab was open signs in and arrives at `/` regardless of where they were going.

Every sign-in lands in the same place, which argues for the screen that offers an action over either
of the two that report on work already done.

## Alternatives considered

**Stats** — rejected for v1. It is the screen the project exists to read, and it is the right landing
the day the corpus stops growing. Today the corpus is empty, and PRD §4 already suppresses its ratios
below twenty vetted *notes*, so it would land the reader on a screen that says it cannot tell them
anything yet.

**Sources** — rejected. It answers "what have I fed it", which is a question the reader only has
after they have fed it something.

**A server-side chooser on `/` redirecting to one of the three places** — rejected on the home-screen
argument above, and on a smaller one: `/` would then be the fourth route with a session-dependent
response, and `08` §6.4 already forbids `prerender`, `swr` and `isr` on the three *places* precisely
because a session-gated document is easy to turn into a shared one by accident. A redirect that
depends on the reader's data is one more of those.

## What it costs

The reader who has finished ingesting and only wants to study lands on the paste box every time they
sign in, and clicks once to leave. At a seven-day sliding session that is a handful of clicks a year,
and it is the honest cost of refusing to guess.

## Revisit if

Ingestion becomes rare enough that the landing screen is wrong most of the time — the corpus is
built, the reader signs in to study. The answer then is **Stats**, statically, not a chooser. The
chooser stays rejected for as long as *Vet* and *Review* are *modes*.
