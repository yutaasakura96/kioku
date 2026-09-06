# Space is the forward action, and Z is the confirm

**Vetting is `space` accept, `E` edit, `R` reject, `Z` undo, `Esc` leave. Reviewing is `space` to
reveal, `1`–`4` to grade, `X` to flag, `Esc` to leave. Rejection gets no confirmation dialog,
because `Z` is the confirmation.** The canvas drew `A` / `E` / `R`; `A` does not survive.

This is one decision, not two. ADR 0006 makes rejection permanent and re-ingestion-proof — a
*rejected* term is never re-asked — so "which key rejects" cannot be settled without settling what
happens when the wrong key is pressed.

## Space, because one key has to mean "continue" in both modes

*Review* already reveals with `space`; that was on the canvas and is not in dispute. Leaving *Vet*'s
accept on `A` means the largest, most-hit key on the keyboard does the main thing on one
keyboard-driven screen and nothing at all on the other. Making `space` the default forward action in
both is the rule the rest of the map hangs off: `E` and `R` are the two departures from forward, and
they are letters because they are departures.

## Rejection needs a way back, and a dialog is the wrong one

PRD S3 measures **one keystroke per accepted note**. A confirmation step spends a second keystroke
on the single most repeated action in the application, to protect against an error that is rare —
and it spends it on *every* rejection, not just the mistaken ones. An undo spends nothing on the
happy path and everything it needs on the unhappy one.

So the rejection is written immediately, in the outbox shape ADR 0007 already established for
*grades*, and `Z` reverses the last committed action while the vetting session is open.

## The undo horizon is the session, and that is a real limit

`Z` cannot outlive the session. Once vetting ends, ADR 0006 takes over: the *rejected* note is
permanent and re-ingestion will not resurface it. There is no key that undoes that, and inventing
one would reopen ADR 0006 rather than extend this decision.

That horizon has to be visible rather than assumed — *Vet*'s footer legend is where it goes, because
the legend is already the surface that names the keys.

## Alternatives considered

**`A` accept, as drawn** — rejected. It leaves `space` unused on one of the two keyboard screens and
gives up the one rule that makes the map memorable.

**`R` with a confirm step and no undo** — rejected on PRD S3. It taxes every rejection to protect
against a subset of them.

**A recoverable *rejected* state in the database, undoable indefinitely** — rejected because it is
ADR 0006's decision, not this one. If accidental rejections turn out to survive the session
boundary in practice, that is the ADR to reopen.

## What it costs

The *key cap* component's primary state is drawn with `A` in `05-design-system.md` §7. A space bar
is not a square, so the primary cap is now the widest cap in the legend rather than the same size as
the others.

## Revisit if

Measured vetting shows accidental rejections being discovered *after* the session ends — at which
point the answer is a recoverable state in ADR 0006, not a longer-lived undo stack here.
