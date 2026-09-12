# A flag returns a note to the queue through card_flag, not by un-accepting it

**`S9`'s `X` writes `card_flag`, suspends the *card* and stamps `note_vetting.flagged_at`. It leaves
`note_vetting.state` at `accepted`. The *Vet* queue finds a flagged *note* through `card_flag` with a
null `resolved_at` — and ⚠️ **that query, and the re-vetting it leads to, are not #13's.***

## The obvious implementation moves two metrics

`09` §4.9 step 3 says the flag "sets `note_vetting.flagged_at`, returning the *note* to the *vetting*
queue — so the *pending* count in the shell goes up by one, and `/vet` will present it again." The
*Vet* queue is `WHERE state = 'pending'`, so the straightforward reading is *set the state back to
pending*.

**That would move two of `S10`'s four ratios by arithmetic that has nothing to do with either.**

- *False-accept rate* is `count(card_flag) ÷ count(note_vetting WHERE state='accepted')` (`04` §7.8).
  Un-accepting a flagged *note* **raises the numerator and lowers the denominator at the same time**,
  so one flag moves the ratio twice.
- *Acceptance rate*'s numerator is `state = 'accepted' AND edited = false` (`11` §3). A *note* the
  reader accepted last month stops counting as accepted because a *card* made from it turned out to
  be wrong — which is a fact about the *card*, not about the vetting decision.

*False-accept rate* exists to detect *a vetting step that has become theatre* (`11` §3). A
denominator that shrinks every time the numerator grows cannot do that.

## The schema already said so

`04` §11 indexes `card_flag (note_id) WHERE resolved_at IS NULL` and labels it **"The flagged notes
waiting in the *Vet* queue."** That index has been in the schema since Phase 4 and nothing had
queried it. It is only useful under one reading: **the queue is pending *notes* ∪ *notes* with an
unresolved flag**, and the flag itself is the membership.

⚠️ **This is the second time an unused index turned out to be the decision.** The rule it suggests:
when an implementation and an index disagree about how something is found, the index is the older
statement and usually the considered one.

## What #13 does not build, and why that is not half a feature

The queue query and the decision path that follows it are **deliberately left**, and the argument is
the one #10 made when it declined to resolve a flag: *half of `S9` built inside #10 would have been a
guess at the half that was not.*

Showing a flagged *note* in the queue is four lines. **Deciding it is a ticket**, and three separate
decisions sit inside it:

- **`decide()` requires `state = 'pending'`**, so a flagged *note* offered in the queue would answer
  `not_pending` to every keystroke. A queue entry that cannot be decided is worse than one that is
  not shown.
- **ADR 0052 freezes an accepted *note*'s fields against every writer.** Editing is the obvious
  remedy for a bad *card* — it is why `S9` returns the *note* to *vetting* at all — so re-vetting
  means lifting the freeze, which ADR 0052 names as an argument to have rather than a line to change.
- **Editing a *memory-bearing field* resets the *card*** (`CONTEXT.md`, `04` §7.4): a new
  *scheduling epoch*, with the prior one superseded and retained. The schema has the mechanism and
  **no code writes it**. That is the first reset in the application, and it is not a side effect of a
  keystroke in *Review*.

So #13 writes the durable fact — `flagged_at`, and an unresolved `card_flag` row — which is what the
queue will read, and stops there. ⚠️ **The consequence to state plainly: after #13 a flagged *note*
does not yet reappear on `/vet`.** `10` §4.3's `returned by a flag` aside is drawn and its data path
ends one query short.

## Alternatives considered

**Flip `state` to `pending` and fix the metrics in #14's queries** — count *ever accepted* as
`accepted OR (pending AND flagged_at IS NOT NULL)`. Rejected: it puts a correction for `S9` inside
four ratio queries that have nothing to do with `S9`, and `11` §3 already calls this arithmetic the
most likely error in the application.

**Widen the queue in #13 and let `decide()` refuse the edit as frozen.** Rejected: two of the three
outcomes would be wrong. Accepting a flagged *note* would resolve the flag and leave the *card*
suspended — the reader says *this is fine* and the *card* stays gone — and editing, the remedy the
whole story is for, would be refused with no way forward.

**Add a `flagged` value to `note_vetting.state`.** Rejected: `04` §7.2's three states are decided
and `04` §11's index means the flag is already the record. A fourth state would be a second place
where *this note is flagged* is written, and copies drift (`04` §13).

## Consequences

`server/utils/review/flag.ts` writes four rows and touches neither `note_vetting.state` nor
`review_log`. ⚠️ **Both `flagged_at` and `suspended_at` are guarded by `IS NULL`** — a second flag is
a second `card_flag` row (`11` §3) but the instants a *card* left scheduling and a *note* came back
to the queue are facts about the first one.

⚠️ **A replayed flag is refused, and this is the half `/code-review` caught.** The first draft wrote
a second `card_flag` row for a replayed entry and said so in a comment, reading `11` §3's *a second
flag on the same card is a second row* as covering it. It does not: `11` §3 is about a **reader**
flagging twice, and an outbox retry counted as a flag **inflates the numerator of the very ratio this
ADR is about**. `(review_session_id, card_id)` tells them apart — a flagged position is answered, so
the reader cannot reach it again inside that run — and it is the same pair the *grade* path already
guards on (ADR 0055).

The re-vetting path owns: the queue query, `decide()` against a flagged *note*, `card_flag.
resolved_at`, lifting ADR 0052's freeze, and the first *scheduling epoch* reset. It is the natural
home for `04` §7.4's reset, which nothing has needed until now.

## Revisit if

The re-vetting ticket finds that a flagged *note* is better modelled as a fourth state after all —
at which point this ADR's metric argument is the thing to answer, not the index.
