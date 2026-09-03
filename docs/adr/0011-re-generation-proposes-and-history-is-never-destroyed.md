# Re-generation proposes; history is never destroyed

Most of `BRIEF.md` §4.11 is already settled elsewhere — ADR 0004 records model and prompt version per
note and files wrong-flags against source and prompt version, ADR 0006 freezes accepted notes and
links occurrences to source positions, ADR 0008 keeps sources durable. Provenance is therefore
**a feature, not debugging**, and "delete everything that came from that bad PDF" is the capability
that proves it — the one thing impossible to retrofit, because the links must be recorded at
ingestion time.

Two things remained open.

## Re-generation is real, and it only ever proposes

Re-running a source produces **candidates**, diffed against the existing notes; differences enter the
vetting queue flagged. Never a silent rewrite. This is ADR 0006's freeze rule applied rather than a
new decision.

## Whether changed text resets scheduling depends on the field

**The subject declares which of its fields are memory-bearing** — in the ADR 0003 declaration,
alongside the identity key and the level precedence order.

A change to `meaning` invalidates what was memorised, so the card starts over. A change to
`example_sentence` leaves the memory of the term intact, so its history stands. Treating every edit
the same is wrong in both directions: reset always and a typo fix costs six months; reset never and a
corrected definition keeps a history that describes learning the wrong thing.

## Reset is not deletion, and neither is source deletion

`BRIEF.md` §2.4: review history is the one thing in this system that cannot be regenerated.

- A **reset** card begins a new scheduling epoch. The prior history is retained and exportable.
- **Deleting a source suspends its cards.** Hard deletion is a separate, deliberate act, and even
  then history survives.

Two independent guards on the irreplaceable thing — the pattern `CLAUDE.md` records as having worked
in `lfca-lab`: pin irreplaceable data by identity and guard it in more than one place.
