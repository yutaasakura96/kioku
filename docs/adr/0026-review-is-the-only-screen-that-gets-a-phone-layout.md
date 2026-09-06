# Review is the only screen that gets a phone layout

**v1 draws a phone layout for *Review* alone. Ingest, Sources and Stats reflow with no bespoke
layout. *Vet* renders a message saying vetting needs a keyboard rather than degrading into a
tappable version of itself.** Every *mode* also gains a persistent **Done** control, on every
viewport — which changes what a mode is.

## The split follows what each screen is for, not what fits

*Reviewing* is the thing you would actually do on a train: one card, one answer, four grades. It
survives a narrow column because it barely uses one.

*Vetting* is not a small version of that. PRD S3 measures **one keystroke per note**, ADR 0013 made
*Vet* a mode because the pointer is never reached for, and ADR 0023 just spent the map on
`space` / `E` / `R` / `Z`. A tap-target version of that screen is a different product with the same
name, and it would be the version the *acceptance rate* and *seconds-per-note* numbers get measured
against. Refusing is cheaper and more honest than half-supporting it.

Ingest, Sources and Stats are a form, a list and five numbers. They reflow. Nothing is owed.

## The `Esc` problem forces a change to every mode, not just the phone

ADR 0013 defines a mode as a screen that replaces the shell and **is left with `Esc`**. A phone has
no `Esc`, so *Review* on a phone would be a screen with no exit — and the obvious patch, a
swipe-to-dismiss gesture on phones only, buries the exit on the one platform where it is least
discoverable.

So the exit becomes visible everywhere: **a persistent Done control in the mode's own header**, the
same target on desktop and phone. Desktop keeps `Esc` *and* gains a visible way out, which it
arguably always needed — the canvas never showed a first-time reader how to leave *Vet*.

This is a change to the *mode* definition, not a phone concession, and `CONTEXT.md` carries it.

## Alternatives considered

**No phone layout at all in v1** — rejected. *Review* is the screen with a genuine mobile use, and
the frequency it needs is daily.

**A phone layout for all five** — rejected on *Vet*, and unnecessary for the three that reflow.

**Swipe-to-dismiss on phone only** — rejected. It makes the exit platform-specific and invisible, on
the platform where an invisible exit is worst.

**Grade by swipe direction rather than by tapping four controls** — deferred. It is a genuinely good
idea for a phone and it is not needed to ship one; the four grade controls already exist and already
have geometry. It wants deciding in `10-screen-specifications.md` against a drawn screen.

## What it costs

Every mode now carries chrome it did not have — one control in a header that ADR 0013 was proud to
have emptied. The *progress rail* on *Review* has to share its row with it.

And Kioku is now a desktop application that can be studied on a phone, which is a narrower claim
than "it works on a phone". That should be said plainly wherever the product is described.

## Revisit if

Measured use shows vetting being attempted on a phone often enough that refusing is costing notes —
at which point the question is whether a *reduced* vetting mode (accept and reject only, no editing)
is worth its own measurement, not whether *Vet* should reflow.
