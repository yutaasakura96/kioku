# Grade by swipe is refused, because it could only ever have been additive

**v1 ships no swipe gesture. The four grade controls are the whole of *Review*'s phone grading
surface, sized to 44 × 44 CSS pixels.** The tempting version — swipe *instead of* four targets — is
not available at any conformance level we are willing to ship, and the version that is available
buys nothing the four controls do not already give.

ADR 0026 deferred this by name, to this document, "against a drawn screen". `10-screen-specifications.md`
§10 draws the screen, so it is answered rather than deferred again.

## The deferral assumed a trade that does not exist

ADR 0026 called swipe "a genuinely good idea for a phone", and the idea it was good *as* is a
grading surface with no buttons on it: one card, one gesture, no chrome, four values reachable
without lifting a thumb to a target. That version would have paid for itself by removing the four
controls.

It cannot remove them. Verified 2026-09-07 (verification §13.2):

> **SC 2.5.1 Pointer Gestures (Level A)** — All functionality that uses multipoint or path-based
> gestures for operation can be operated with a single pointer without a path-based gesture, unless
> a multipoint or path-based gesture is essential.

> **SC 2.5.7 Dragging Movements (Level AA)** — All functionality that uses a dragging movement for
> operation can be achieved by a single pointer without dragging …

Grading is a choice among four values. It is not an essential path-based gesture by any reading —
essential means the path *is* the information, as in a signature or a freehand drawing. So a swipe
implementation owes a single-pointer equivalent, and the equivalent is four targets on the screen.

**Swipe was therefore never a replacement; it was always a second way in.** ADR 0024 already
committed this system to AA, so this is not a standard we are choosing to adopt here — it is one the
project adopted in Round 3 and this is the first screen where it bites.

## A second way in is not free on the one write that cannot be corrected

Having established that swipe adds rather than replaces, the question becomes whether the addition
earns its cost. It does not, and the reason is in ADR 0016:

**the *grade* is arithmetic, not a label.** `G` appears inside the stability formula, and `03` §2.4
makes review history the one asset that cannot be regenerated. A *grade* has no undo: `Z` is *Vet*'s
key and does not exist in *Review*, and `X` suspends a *card* and returns its *note* to the queue
(`09` §4.9), which is a different act with different consequences and is not a correction.

So a mis-swipe writes a wrong number into permanent history with nothing to take it back. A mis-tap
does too — but a tap has a target the thumb can see, and a four-way gesture on a phone does not have
four unambiguous directions to offer it. Down is the scroll and the pull-to-refresh; the horizontal
edges are the browser's own back and forward. What is left is two comfortable directions for four
values, which means diagonals or velocity thresholds, which means a mis-hit rate nobody has measured
on the one action that cannot be undone.

And **there is no measurement to justify it against.** `S10`'s numbers are about generation quality,
not input. Kioku is, in ADR 0026's own words, "a desktop application that can be studied on a
phone"; the phone path is daily but it is not where the thesis is tested.

## Alternatives considered

**Swipe as an addition, with the four controls kept** — the conformant version, and the one actually
on the table. Rejected on the paragraph above: it adds an input path with an un-undoable failure
mode, to a screen whose four targets already clear the AAA size floor. It is the fallback if tapping
turns out to be the problem, and it is not the first answer.

**Swipe for the two extremes only** — left for `Forgot`, right for `Easy`, taps for `Hard` and
`Good`. Genuinely the best version of the idea, because two directions really are unambiguous.
Rejected because it makes the four grades two kinds of thing, and ADR 0016's whole argument for
shipping four is that `w₃`, `w₄` and the Hard-penalty weight need all four to be given evenly.
A surface that makes two of them cheaper to reach biases the training data the ADR exists to protect.

**Swipe up to flag, replacing `X` on the phone** — deferred rather than rejected, and out of scope
here. It has the same SC 2.5.1 problem, but flagging is reversible and low-frequency, so the
argument is different and belongs to whichever document reopens it.

## What it costs

**The phone keeps four targets on a small screen, and that is real.** At 375px the four controls
take a full row beneath the card and the card gets less height for it (`10` §10.4). The alternative
would have given that height back.

And **ADR 0026's "genuinely good idea" is now recorded as refused rather than pending**, which is the
point of answering it: a deferral that survives two documents becomes a thing everyone assumes is
coming.

## Revisit if

Measured phone use shows the four controls being mis-tapped or reached awkwardly. The first answer
then is **bigger and better-placed targets**, not a gesture — SC 2.5.5's 44 × 44 is a floor, not a
ceiling, and a thumb-reachable arc is cheaper and safer than a fifth input path. Swipe-as-addition
is the second answer, and it arrives with the four controls still on the screen.
