# Three screens are places; Vet and Review are modes

**Ingest, Sources and Stats carry a persistent shell with navigation. *Vet* and *Review* replace it
entirely — no header, no nav, no back button — and are left with `Esc`.** The same split decides
rendering: the shell's three screens are server-rendered, the two modes are client-owned.

This closes the navigation gap the decision log has carried since Phase 2, where empty *Vet* could
only point at Ingest in plain text because there was nothing to point with.

## The split was already implied by decisions that were made

Two logged decisions constrain it. *Review* carries **no screen label in any of its four states** —
the *progress rail* stands in for its header. *Vet* is a *facts strip* under a rule, keyboard-only,
with one keystroke per *note* as a measured criterion (PRD S3).

A nav bar on *Review* reopens the first. A nav bar on *Vet* puts a pointer target on the screen
whose thesis is that the pointer is never reached for. Ingest, Sources and Stats were never drawn,
are generic, and carry no such constraint — so they get the conventional thing for free.

## Rendering follows the same line, so the two models cannot disagree

ADR 0007 and PRD S8 already decided the hard half: the *session* is prefetched as a unit, each
*grade* is stamped client-side at the moment it is given, and the interface never waits on the
flush. *Review* is client-owned state and was never negotiable. S3 says the same of *Vet*.

The other three are a form, a list and five numbers, with no latency criterion between them.
Server-rendering them means **they never ship state-management code**, and the client budget is
spent entirely on the two screens that earn it.

## Alternatives considered

**One persistent nav across all five** — rejected because it reopens the *Review* header decision
on grounds of convention alone, which is not new information.

**A global keyboard switcher (`g`-then-key) layered on the modes** — not rejected, deferred. It
would make the transition one gesture while keeping the modes chrome-free, but no artboard has the
mechanism and nothing yet shows the transition is frequent enough to need it.

## What it costs

*Vetting* → *reviewing* is `Esc` then a click rather than one key. This is accepted as correctly
slow: the workflow is a batch of vetting, then a session of studying, not an alternation.

## Revisit if

Measured behaviour shows the two modes are alternated within a sitting rather than batched — at
which point the deferred keyboard switcher is the answer, not a nav bar.
