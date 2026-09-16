# A chosen word mints its cards on arrival, and Vet becomes the flag queue

**Decided 2026-09-16, with [ADR 0062](0062-retention-and-consistency-are-the-headline-and-acceptance-rate-retires.md)
and [ADR 0063](0063-the-input-is-a-chosen-word-list.md).**
A *note* written from a chosen word is `accepted` when it is written, and its *card* is minted in the
same transaction. Nobody is asked. *Vet* keeps its screen, its keystrokes and its undo, and the only
thing that arrives on it is a *card* the reader flagged during *review*.

## Why the accept goes

The 2026-09-15 handoff said vetting is the reader's judgement and worth his time. That was true when
the pipeline chose the words, because then a *note* was a proposal and somebody had to decide whether
the proposal was any good. **ADR 0063 moves the choosing to the reader, which moves it before the
model runs.** By the time a *note* exists, the only judgement left is whether the model filled six
fields correctly, and that judgement is cheap to defer: a wrong meaning shows up the first time the
*card* is answered, costs one keystroke to flag, and the reader was going to see the *card* anyway.

Yuta's own statement of the requirement was shorter. He does not want to do anything manually beyond
studying.

## What is decided

**1. `write_notes` mints.** In one transaction: the `note`, its `note_field_provenance` rows, its
*occurrences*, a `note_vetting` row with `state = 'accepted'`, `edited = false`,
`seconds_to_vet = NULL`, `vetting_session_id = NULL`, `vetted_at = now()`, and the `card`.

- ⚠️ **The existing mint path is reused rather than copied.** Acceptance still means what `04` §7.3
  says it means, *minting its cards*, and there is still exactly one place that does it. What changed
  is who triggers it.
- `seconds_to_vet` and `vetting_session_id` are null because no person and no run were involved, and
  a zero would be a lie that ADR 0062's retired metric would have believed.

**2. The *ingestion*'s requester owns what it produces, and `04` §4 is amended.** `job.requested_by`
is described in the schema as an audit line and not an owner. It becomes the owner for this one
purpose, because a *source* carries no owner (ADR 0012: *sources* and *note* fields are shared) and
the *cards* being minted are personal from the first row written.

⚠️ **If `requested_by` is null, the run writes its *notes* and mints nothing**, and says so in the
log. That column is `SET NULL` when a user row goes, so the case is reachable, and the alternative,
guessing the single allowed reader from the allowlist, is the kind of shortcut that is correct until
the day ADR 0012's revisit condition fires.

**3. *Vet* becomes the flag queue, and that is the whole of the re-vetting ticket ADR 0056 owed.**
The queue query is `04` §11's `card_flag (note_id) WHERE resolved_at IS NULL`, oldest first
([ADR 0049](0049-the-vet-queue-is-oldest-first-and-the-client-holds-no-position-in-it.md) is
unchanged). ⚠️ **`note_vetting.flagged_at` finally has a reader**, which has been carried as a debt
since #13.

A flagged *card* is already *suspended* (`S9`), and resolving it has three outcomes:

- **Fix.** Edit the fields, resolve the flag, unsuspend the *card*. This is `S6`'s editor, on the
  other side of the loop from where it was built.
- **Keep.** Resolve the flag, unsuspend, change nothing. The reader flagged it and then decided the
  *card* was fine.
- **Drop.** Resolve the flag, leave the *card* suspended, and write the *note* `rejected` so the term
  never comes back through `filter_known`. `S5` survives the pivot in exactly this form: the reader
  still says no once and means it, he just says it later.

**4. ADR 0052's freeze lifts for a flagged *note*, and only for one.**
[ADR 0052](0052-an-accepted-note-is-frozen-against-every-writer-and-any-readers-acceptance-freezes-it.md)
named this as an argument to have, so here it is. The freeze exists because a *card* with review
history behind it must not have its text swapped under that history. **An unresolved `card_flag` is
the reader saying the text is already wrong**, so refusing the edit protects a history that is
measuring the wrong thing. The guard in both write paths keeps its `WHERE`, with one more condition:
an unresolved flag on that *note*'s *card*.

**5. Editing a *memory-bearing field* supersedes the *scheduling epoch*.** `04` §7.4 says a change to
one invalidates what was memorised, `scheduling_epoch.superseded_reason` already carries
`memory_bearing_field_changed`, and **nothing in the application has ever written one**. This is the
first. For `jlpt-vocab` that means `reading` and `meaning`; a fixed example sentence leaves the
history standing.

**6. The keystrokes do not move.** `Space`, the four *grades*, `Z`, `X`, `Esc`, the *facts strip*,
the *modes* rule, the undo, the *vetting session* row that makes a drop reversible until the run
ends. All of it is built and all of it applies to a queue of three flagged *cards* exactly as it
applied to a queue of 474 proposals. **The pivot deletes a workload, not a screen.**

## What this breaks, named

- **`S3` retires.** *Vet a note in one keystroke* measured a step nobody performs. Its criterion goes
  with ADR 0062's *seconds-per-note*.
- **`S4` narrows.** *Only look at what needs looking at* was about foregrounding *judgement fields*
  among lookups. On the flag queue every field is suspect, because the reader is there precisely
  because one of them is wrong. The *facts strip* and the zoning stay; the argument for them is
  weaker and they cost nothing.
- **`S6` moves.** *Fix a note before accepting it* becomes *fix a card after flagging it*, which is
  the same editor and a different moment.
- **`S5` moves**, as above, to the drop outcome.
- **`S9` gets its second half.** *Catch a bad card after a month* said the *note* returns to the
  vetting queue. Until now there was no queue it could return to.

## Alternatives considered

**Keep vetting as an optional review of what the model filled.** Rejected, and this is the one worth
being blunt about. An optional check is a check that is skipped, and the 474-note queue is what an
optional check looks like in practice after a fortnight. Worse, it would keep *acceptance rate*
alive as a number computed over whatever fraction of *notes* the reader happened to look at, which is
the exact defect ADR 0062 retired it for.

**Mint at first *session* composition instead of at write.** It avoids amending `04` §4, because the
app knows the reader. Rejected: it makes the existence of a *card* depend on somebody opening
*Review*, and the *card* count on *Sources* would then be a number that changes when you look at it.

**A confidence threshold, where the model flags its own low-confidence fills for a human.** Rejected
on [ADR 0004](0004-trust-follows-provenance-not-confidence.md), which refused exactly this once
already. Trust follows *provenance*, and a model's self-reported confidence is a number it generated.

**Delete the `note_vetting` table and the `pending` state.** Rejected: `pending` is still what the
474 *notes* are, `rejected` is still `S5`, and `accepted` is still what mints a *card*. The states
earn their place; only the person clicking through them has gone.

## Revisit if

- Flag rate reads above roughly 10% (ADR 0062's own revisit condition). That is the model's fills
  being wrong often enough that catching them during *review* costs more than checking them up front,
  and a batch check before minting becomes worth its keystrokes again.
- A second reader arrives, at which point `job.requested_by` as owner needs to become a real owner
  column rather than a promoted audit line.
- An imported Anki deck lands with fields worth trusting less than the model's, which would make
  *vetting* an import-time step for one *source kind* rather than a retired one.
