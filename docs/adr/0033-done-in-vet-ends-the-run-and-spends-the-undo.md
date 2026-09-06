# Done in Vet ends the run and spends the undo; Done in Review spends nothing

**One control, two consequences.** Done in *Vet* sets `vetting_session.ended_at`, which makes every
*rejection* in the run permanent (ADR 0006, `04` §7.1) and stops `Z` working. Done in *Review* leaves
a *session* that can be resumed and makes nothing permanent that was not already.

So **Done in *Vet* asks, once, and only when the run holds at least one rejection.** `Esc` asks the
same question, because `04` §7.1 gives the two the same effect. `Z` works right up to the moment the
question is answered.

## The asymmetry is in the schema, and it is not a matter of taste

`04` §7.1 makes `note_vetting → vetting_session` `RESTRICT` for one stated reason: the reversibility
rule is a query against `vetting_session.ended_at`, and losing the column would make a permanent
rejection look reversible. `CONTEXT.md` defines *rejected* as reversible only inside the session that
declined it. `04` §7.1 says it plainly: "Ending the session is what makes a rejection permanent."

Nothing comparable happens on the other side. A *grade* is stamped and written to the outbox at the
keystroke that gave it (ADR 0007); the snapshot and the outbox both survive in `localStorage`
(ADR 0014). Leaving *Review* mid-session sets nothing, commits nothing and destroys nothing —
`review_session.completed_at` stays null and the reader picks the session up where they left it.

**ADR 0026 gave both modes the same control. It did not give them the same meaning, and until now
nothing said so.**

## `Z` works up to the press, and the press is what ends it

`Z` reverses the last vetting decision while `vetting_session.ended_at IS NULL` (ADR 0023, `04`
§7.2). Done is what sets that column. So the undo covers a rejection made one keystroke earlier and
stops covering it the instant the run ends. There is no window in between and no grace period, and
there is no key that reaches back past the boundary — inventing one would reopen ADR 0006 rather than
extend ADR 0023.

**`Z`'s target is read from the database, not from client memory.** It is the most recent decision in
the open run — the highest `vetted_at` in `note_vetting` for this `vetting_session_id`. That is what
lets the undo survive a reload, which vetting needs and *Review*'s snapshot solves differently. It is
the same rule as ADR 0028 and ADR 0014 for the third time: the durable record decides.

## Asking here does not reopen ADR 0023

ADR 0023 refused a confirmation on **rejection**, and the reason was arithmetic: PRD S3 measures
seconds-per-note, a dialog spends a second keystroke on the most repeated action in the application,
and it spends it on every rejection rather than on the mistaken ones.

Done is pressed once per run. A run is hundreds of notes. The confirmation is off the measured path
entirely, and it guards the only irreversible act in the application a reader can trigger by pointing
at something.

It is also skipped when it would be theatre: **a run with no rejections in it has nothing to lose, so
Done just leaves.** The question only appears when the answer matters.

It is answered from the keyboard, using keys that already mean these things:

| Key | Does |
| --- | --- |
| `space` | End the run. ADR 0023 makes `space` the forward action in both modes |
| `Z` | Back into the queue. `Z` already means "no, undo that" |

## ⚠️ The idle sweep cannot be asked, so the legend has to carry the horizon anyway

`04` §7.1 ends a vetting session three ways: `Esc`, the Done control, and **a 30-minute idle sweep**.
The sweep fires while nobody is looking. A reader who walks away mid-run comes back to a run that
ended without them, with the undo spent and no dialog anywhere in the story.

This is why the confirmation is the second line of defence and not the first. ADR 0023 already put
the undo horizon in *Vet*'s footer legend, because the legend is the surface that names the keys.
That placement is now load-bearing rather than tidy: it is the only thing that tells the reader the
horizon exists before they find out that it closed.

## ⚠️ `Z` reaches acceptances too, and that un-mints a card

ADR 0023 says `Z` "reverses the last committed action" and argues the whole case from rejection.
Vetting commits three kinds of action — accept, accept-with-edit, reject — and a reader who hits
`space` a beat too fast expects the key labelled undo to fix it. **`Z` reverses the last decision of
either kind, returning the *note* to *pending* at the head of the queue.**

For an acceptance that means the *card* minted by it (`04` §7.3, "minted at acceptance, never
before") is deleted in the same transaction. `04` §9.1 says there is no path to delete a card,
anywhere in the app or the worker. **That sentence needs one exception and this is it**, because the
card being deleted is provably historyless:

- A card minted inside an open run cannot have been reviewed. Reaching *Review* from *Vet* means
  leaving *Vet*, and every exit from *Vet* ends the run
  ([ADR 0032](0032-a-mode-is-entered-from-a-start-control-and-done-is-the-only-way-out.md): Done goes
  to a *place*, and a mode has no path to another mode).
- The argument does not have to hold on its own. `review_session_card → card` and `review_log → card`
  are both `RESTRICT` (`04` §9.1), so a card that reached a snapshot in a second tab **cannot** be
  deleted: the database refuses, and `Z` fails with a message instead of tearing a hole in a session.

The rule `04` §9 actually states is that a cascade must never reach a table that cannot be rebuilt.
A card with no `review_log` and no `scheduling_epoch` is rebuilt by accepting the note again, which
is the next thing the reader will do.

## Alternatives considered

**Confirm on every Done, in both modes** — rejected. Done in *Review* costs nothing, and a dialog
that appears when there is nothing to lose teaches the reader to dismiss it without reading, which is
exactly how the *Vet* one stops working.

**No confirmation, and a count on the Done control instead** — "Done · 3 permanent". Genuinely
tempting, and chrome-free in a way the dialog is not. Rejected because a misread label loses the
undo with no second chance, and because ADR 0026 has the Done control sharing a row with the
*progress rail* on *Review*, so a variable-width label there is already awkward. It is the fallback
if the dialog turns out to be irritating in practice.

**Leaving `Z` to rejections only** — rejected. An accidental acceptance is currently recoverable
only through S9's flag during a review a month later, which is a strange thing to make the reader
wait for when the note is still on the screen.

## What it costs

*Vet* gains a dialog, on the screen ADR 0013 emptied and ADR 0026 already put one control back onto.
It is the second piece of chrome that mode has acquired since it was defined, and both times the
reason was that the exit means more than it looks like it does.

And `04` §9.1 needs a sentence it did not have. That is a real amendment to a document that is
written and committed, not a note for later.

## Revisit if

The dialog is dismissed reflexively and rejections still turn out to be regretted after the boundary
— at which point the answer is ADR 0006's recoverable *rejected* state, which is where ADR 0023
already pointed, and not a longer-lived undo stack here.
