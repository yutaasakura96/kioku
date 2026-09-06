# A mode is entered from a start control, and Done is the only way out

**The *shell*'s navigation names the three *places* and never a *mode*. *Vet* and *Review* are
entered from a start control that carries the number waiting inside it, present on all three places,
never disabled. Done is the way out of every mode state, the empty queue included, and it returns to
the place the reader came from.**

[ADR 0013](0013-three-screens-are-places-and-two-are-modes.md) decided that a mode carries no
navigation *out*. Nothing decided the way *in*, and ADR 0013's own closing claim turns out to depend
on the answer.

## Entering a mode is a different act from moving around the shell, so they do not share a row

Putting *Vet* and *Review* in the nav alongside Sources makes five peers out of two kinds of thing.
Three of those links keep the shell; two destroy it, ship a different rendering mode (`03` §2.1) and
strand the reader on a screen whose only exit is one control. A nav row that means two different
things depending on which item is clicked is a nav row that lies.

There is a second difference and it is the useful one. **A mode is worth entering only if something
is in it**, and the shell is the only surface that can say so before the reader commits to a full
document load. Sources does not need a count next to it. *Vet* does, and `05` §7 already puts
"47 pending" in *Vet*'s own chrome bar, so the figure exists and has a treatment.

So the shell carries navigation to Ingest, Sources and Stats, and below it a start block of two
controls:

| Control | Reads | Goes to |
| --- | --- | --- |
| Vet | the *pending* count for this reader | `/vet?from=<the current place>` |
| Review | the number of *cards* due now | `/review?from=<the current place>` |

## The start control is never disabled, because a zero is a thing the reader needs to read

A control reading "Review · 0 due" that cannot be pressed hides PRD §4's most useful empty state: the
one that says **when the next card is due**. Same on *Vet*, where the difference between "nothing to
vet" and "nothing to vet yet, an ingestion is still running" is the difference between going away and
waiting thirty seconds (`09-user-flows.md` §8).

Both screens have written empty states. Disabling their entrances would make those states
unreachable, which is a strange way to honour a requirement.

## Done returns to where the reader came from, and the origin is a validated parameter

The origin travels in a `from` query parameter set by the start control. On the way out, **`from` is
matched against the three place paths and anything else falls back to `/`.** It is a redirect target
arriving in a URL, so it is an open-redirect hole if it is trusted, and the allowlist is three
strings long.

A mode reached without the parameter — a typed URL, a bookmark — returns to `/`, which
[ADR 0031](0031-the-landing-route-is-ingest-and-never-a-decision-about-data.md) makes Ingest.

## ⚠️ The way in is a plain anchor; the way out has to be forced to be one

Place → mode is a full document load for free: the place ships no JavaScript, so its start control is
an `<a href>` and there is nothing that could intercept it.

Mode → place is the direction that breaks silently. *Vet* and *Review* are `ssr: false` routes with a
hydrated Vue Router, and `<NuxtLink to="/stats">` inside one of them does a **client-side**
navigation: Nuxt renders the Stats route component in the page that is already running, and hands the
reader a Stats screen with a live Vue application attached to it. That is the exact outcome
`noScripts` exists to prevent, and nothing errors.

Nuxt documents the fix. The `external` prop makes `<NuxtLink>` "render the link as a standard HTML
`<a>` tag", bypassing Vue Router's routing, and it is the documented handling for a same-domain link
that is not part of the client routes (verification §12.1). So **the Done control is
`<NuxtLink :to="origin" external>`, or `navigateTo(origin, { external: true })`** — never a bare
`<NuxtLink>`. `03` §2.1 accepted the full document load in both directions; this is the line of code
that makes the second direction actually happen.

## ADR 0013 did not close the empty-*Vet* gap, and this is what closes it

ADR 0013 claims it closed "the navigation gap the decision log has carried since Phase 2, where empty
*Vet* could only point at Ingest in plain text because there was nothing to point with." It did not.
The gap is on *Vet*, ADR 0013 made *Vet* a mode, and a mode has no navigation. Nothing to point with
was still true the moment the ADR was written.

Two controls close it, and they are not the same control:

- **Done**, from ADR 0026, returns the reader to the place they came from. That may be Sources.
- **The quiet Ingest affordance in the empty state**, which the Phase 2 canvas already drew —
  `05` §1 names it by that description and §7 gives it geometry. It says what to do instead.

ADR 0013's objection to a pointer target on *Vet* was about the screen with *notes* in it, where PRD
S3 measures one keystroke per note and a reachable pointer is a cost. **An empty queue has no
keystroke to protect.** It is the same route rendering a signpost, and a signpost with nothing to
point with is the thing the decision log has complained about for two phases.

## Alternatives considered

**All five screens in one nav** — rejected above. It also reopens nothing usefully: ADR 0013's
argument was about what a mode carries, and this is about what the shell lists.

**A start control on Ingest only, with the other two places carrying nothing** — rejected. It makes
"start studying" depend on which screen the reader happens to be looking at, and it puts a Review
entrance on the screen with the least to do with reviewing.

**A global keyboard switcher (`g`-then-key)** — still deferred, as ADR 0013 left it. It would make
mode-to-mode movement one gesture. Nothing yet shows the transition is frequent enough, and the
deferral is now cheaper than it was, because the start controls give every transition a visible path.

## What it costs

The shell grows a second row. ADR 0013 gave the three places "the conventional thing for free", and
this is the point at which they stop getting it for free: the nav is conventional, the start block is
not, and `10-screen-specifications.md` has to draw a distinction the canvas never explored.

And the `from` parameter is state in a URL, in an application that otherwise keeps none there. It is
three characters of query string and one allowlist check, and it is the price of Done meaning
"back to where I was" rather than "back to the paste box".

## Revisit if

The start block's counts turn out to be the thing the reader reads on every load, at which point the
question is whether the shell should show more of the same figures rather than fewer — which is
Stats moving into the shell, and a different decision from this one.
