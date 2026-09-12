# An accepted note is frozen against every writer, and any reader's acceptance freezes it

**`S6`'s "once *accepted*, the *note*'s fields are frozen" is a guard in the `WHERE` of both write
paths rather than a property held by who happens to be calling. The application refuses the write
when *any* reader has accepted the *note* — not only the one sending the request — because `note` is
shared and there is one copy of the fields.**

## It was true by accident, which is the state `04` warns about

Until #11, `server/utils/vet/decide.ts` was the application's only writer of `note.fields`, and it
refuses a *note* that is not `pending` for the reader sending the keystroke. So nothing could rewrite
an accepted *note* — not because anything said no, but because nobody asked. A property held by the
absence of a caller lasts exactly until the next caller, and the next caller is #13's flag path,
#14's backfill, or a script.

⚠️ **The *note* is also the row that cannot be rebuilt.** `04` §10 names `generation_cache` as the
only table safe to truncate *because* the corpus is what a re-ingestion cannot reproduce — and an
accepted *note*'s fields carry the reader's own corrections on top of that. There are *cards*
pointing at them and, after #12, a review history measured against them.

## The guard, and where it is not

**`server/utils/note/fields.ts` is the one write path**, and the refusal is a `NOT EXISTS` in the
statement's own `WHERE` — the same shape as `decide()`'s `state = 'pending'`, and for the same
reason: a check performed before the write is a check another transaction can walk between.

**Not a trigger.** `04` §7.5 has exactly one trigger and says so. That is
[ADR 0011](0011-re-generation-proposes-and-history-is-never-destroyed.md)'s *pin the irreplaceable
data and guard it in more than one place*, and it names `review_log` — the append-only table whose
loss cannot be detected, let alone repaired. A second trigger would be a second owner of a rule the
statements can already state, and `03` §4.2 keeps one migration owner.

**The worker's half was already right and is now tested.** `pipeline/write_pending.py`'s
`_insert_note` is `ON CONFLICT (subject_id, identity_key) DO NOTHING`, which is
[ADR 0006](0006-note-identity-is-a-declared-key-and-collision-appends-an-occurrence.md)'s own
sentence: a second sighting **appends an *occurrence*** and leaves the *note* alone. The obvious
version of that function is an upsert, and an upsert there would let a re-ingestion rewrite a *note*
the reader accepted and studied — silently, with the *cards* still pointing at it.
`worker/tests/test_generation.py` now sabotages to red on exactly that change. ⚠️ **The worker needs
no knowledge of `note_vetting` to do this**, which is why the rule is spelled twice rather than
shared: the two write paths refuse for different reasons and neither refusal depends on the other.

## Any reader's acceptance, not the requesting reader's

`04` §4 makes `note` **shared** and `note_vetting` **personal**. So the *note* at the head of one
reader's queue can be a *note* another reader has already accepted, minted a *card* from and
reviewed — and there is exactly one `fields` document underneath both of them.

**Owner-scoped freeze** — refuse only when *this* reader accepted. Rejected: it is the rule that
reads naturally from `decide()` and it lets the second reader rewrite the first reader's *cards*
under them, which is the failure `S6` names with the word *frozen*.

**Freeze on any acceptance.** Taken. The fields are what some reader confirmed, and confirmation is
the event `S6` freezes on regardless of whose it was. The second reader is not blocked from
*deciding* — a plain acceptance writes no fields and still mints their own *card*; what they cannot
do is change the text.

⚠️ **A rejection freezes nothing.** [ADR 0012](0012-identity-is-invite-only-and-personal-data-carries-an-owner.md):
a rejection is a claim about the reader, not about the word. Nobody confirmed the fields, so there is
nothing to protect.

⚠️ **Unreachable in v1, and written anyway.** ADR 0012 invites one reader, so no *note* can have two
`note_vetting` rows today. The cost of the guard is one `NOT EXISTS`; the cost of discovering it was
needed is a corpus nobody can tell has been rewritten.

## The refusal is a refusal, not a silent drop

`decide()` returns `frozen` and writes **nothing** — no state, no *card*, no `human` provenance. An
acceptance that committed with the edit dropped would be the reader accepting the value they had just
said was wrong, arriving as a success. `10` §4.8's keystroke-that-failed message carries it.

## Revisit if

- A second reader is ever invited (ADR 0012's revisit condition), at which point this branch becomes
  reachable and the message in `10` §4.8 becomes something a person can actually see.
- A re-vetting path exists — `S9`'s flag returns an *accepted* *note* to the queue, which is #13's.
  ⚠️ **That path has to unfreeze something**, and the decision it needs is whether a flagged *note*
  goes back to `pending` (which lifts the freeze through the existing guard, since `pending` is not
  `accepted`) or is corrected under a different rule. The guard is written so the first answer is
  free.
