# One focus ring, and the modes do not draw it

**A single `--k-focus` token, set to `--k-accent`. A 2px outline at 2px offset, `:focus-visible`
only, never animated. *Vet* and *Review* hold focus on the mode container and draw no ring; the one
exception is *Vet*'s edit state, which rings the field being edited.**

`05-design-system.md` §8 records that no artboard draws hover, focus, active, disabled, loading or
error, and that focus is the one of the six that blocks implementation. This unblocks it without
inventing the other five.

## `:focus-visible`, because the modes are keyboard-only by design

ADR 0013 made *Vet* and *Review* modes precisely because the pointer is never reached for. A ring
that appears on click would therefore appear only in the moments the design says should not happen,
and it would appear on the container — a ring around the whole screen. `:focus-visible` draws for
keyboard traversal and stays silent for pointer activation, which is exactly the split the two modes
already assume.

## The modes hold focus but do not show it, because there is nothing to move between

In *Review* there is one card and four grades reached by digit, not by `Tab`. In *Vet* there is one
note and three actions reached by letter. **Focus never moves within either screen**, so a ring
would mark a position that cannot change — decoration where the system spends nothing on decoration.
The container still takes focus, because keystrokes have to land somewhere and a reload has to
restore it (ADR 0014).

*Vet*'s edit state is the genuine exception: editing is the one moment a *judgement field* becomes a
text target and focus becomes a real, movable position. It rings.

## The accent already means "where you are"

`05-design-system.md` §2 spends the accent on exactly two things — where you are, and what costs you
the decision. A focus ring is the first of those two by definition, so it takes the accent rather
than introducing an eighth colour to say the same thing. At 5.38:1 on the ground it clears the 3:1
non-text contrast minimum comfortably.

## Alternatives considered

**A neutral grey ring** — rejected. It needs a new token to express a meaning the accent already
carries, and greys are the one thing ADR 0024 just proved the palette is short of.

**Rings on the mode containers too, for consistency** — rejected. Consistency with what? Nothing
else on those screens is focusable.

**Defining hover, active, disabled, loading and error at the same time** — deferred, not rejected.
Focus blocks implementation because keyboard navigation is unusable without it; the other five do
not, and each wants deciding against a screen rather than in the abstract. They belong to
`10-screen-specifications.md`.

## What it costs

Five interaction states remain undrawn after this ADR, and the design system will say so rather than
implying the set is complete.

## Revisit if

A screen appears with more than one focusable element inside a mode — at which point the ring stops
being decoration there and the exception list grows past *Vet*'s edit state.

> **Amended 2026-09-07. The condition above fired, exactly as written, and the exception list has
> grown.** *Review*'s end screen carries the *session*-size knob (`09` §4.7), "Start another session"
> and Done — three focusable elements — and both of *Review*'s non-terminal empty states carry the
> knob and Done. **Those three screens draw the ring; the running mode still does not.** The rule
> that covers all of it, and that this ADR was reaching for: *a mode draws no ring while it is
> running, and draws it on the screens where it has stopped.* *Vet*'s edit state and *Review*'s
> terminal screens are the same case — the mode has paused and focus is a real, movable position.
> Full entry in `06-decision-log.md`; the geometry is `10-screen-specifications.md` §4.2.

> **Also 2026-09-07: this ADR turns out to be load-bearing for WCAG conformance**, which nothing
> knew when it was written. ADR 0023's key map is all printable characters, so SC 2.1.4 Character Key
> Shortcuts (**Level A**) applies, and the application passes only on that criterion's "Active only
> on focus" exception — which is true *because* this ADR holds focus on the mode container.
> ⚠️ **Binding the keys to `document` or `window` instead moves the application from passing a Level
> A criterion to failing it, with nothing on screen to show it.** Verification §13.4.
