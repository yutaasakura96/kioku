# A stray note is dropped, not the chunk

**Decided 2026-09-23, by Yuta, from [#36](https://github.com/yutaasakura96/kioku/issues/36)'s triage.**
A note in a model response that matches no group the worker asked about is **dropped, and the chunk
keeps the notes that did match**. It was a refusal of the whole *chunk*. **A group that went
unanswered stays an error**, unchanged — that half of the contract is what the reader paid for.

This reverses half of `notes_for`'s docstring in `worker/pipeline/generate.py`, which is where the
strictness was recorded; no earlier ADR carries it.

## Why now

The first full Open Anki JLPT N3 import (2026-09-22/23) finished `incomplete` with **4 of 86 chunks
failed**, all with the same message — *the response carries a note for a word that was not asked
for*. Each of those chunks had ~24 usable notes in the same response.

**The rule cost 100 words on the first pass.** A plain resume, same prompt, cleared three of the four
chunks; chunk 58 failed the same way twice and its 25 words are still out.

That is the evidence the docstring's argument was missing. *"Neither is worth half a chunk"* was
written about a chunk that is half wrong. What the import actually produced was a chunk 24/25 right,
discarded whole, four times.

## What is decided

**1. The live path drops the stray.** `notes_from` passes `allow_extra=True`, which is what the cache
path (`notes_for_cached`) has always passed. The mechanism is not new; what changes is which paths
use it.

**2. An unanswered group is still an error.** The `unanswered` check runs after the match loop and is
unconditional, so this falls out of the flag rather than needing to be defended. It is the model
quietly dropping a word the reader paid for, and `03` §5.4 keeps the *chunk* as the unit that fails.

**3. The drop is said, per *chunk*, as a count and never as a value.** `ingest.note_dropped`, beside
`ingest.claim_refused`, which is the same shape for the same reason: a stray term is model output
about the reader's material, and `03` §13.4 keeps that out of the log. A prompt that starts inventing
words shows up as a rising count rather than as silence.

## What this does not fix

**Chunk 58's 25 words are probably not recovered by this.** If its stray is 地 answered as some other
word — the ticket's reading of the evidence, which is a guess and not a proof — then dropping the
stray leaves 地's group unanswered and the chunk still fails, with `missing 1 of 25` in place of the
old message. Recovering those words needs a different decision: whether an unanswered *word* may fail
alone instead of taking its chunk with it. **That is not decided here**, it weakens the guarantee §2
keeps, and it is not in #36.

### Amended 2026-09-23 — the resume recovered them, and proved neither reading

The resume ran on this decision's code the same day and **chunk 58 completed on its third attempt
with all 25 words**, 地␟ち among them, for $0.0386. The run is `complete`: 2,140 *cards* for $4.335.

⚠️ **Nothing was dropped.** `ingest.note_dropped` is emitted only when the count is non-zero and it
never fired, so the response carried no stray at all — the chunk was not rescued by this decision,
it simply answered correctly on a third ask.

That is a **third outcome**, and the two this section and `00-status.md` § Next both named are still
unresolved by it: the ticket's 地-rewrite reading is neither proven nor disproven, because the
failure did not reproduce. What the run does settle is the *cost* side of §2's argument — 25 words
sat out for a day behind a transient model slip, which is the case for dropping rather than
refusing, made on evidence rather than on the guess. **Whether an unanswered *word* may fail alone
is still undecided and still unticketed**, and nothing has raised its price.

## Alternatives considered

- **Keep the strictness.** A stray is evidence the response is untrustworthy, so nothing in it should
  be believed. Rejected on the run's own numbers: 82 of 86 chunks were clean and three of the four
  failures cleared on a resume with an unchanged prompt, so the stray reads as noise rather than as a
  response that has come apart. The `note.fields` half of the fear is answered anyway — a dropped
  note reaches nothing.
- **Keep the stray as a *note*.** Never seriously on the table. A word nobody asked about has no
  *candidate*, no `identity_key` the corpus agreed to, and no *occurrence*; ADR 0006 and `04` §5.4
  have no place to put it.
- **Retry the chunk with a sharper prompt.** More model money for a fault that a resume already
  cleared three times out of four, and it leaves the rule in place for the fourth.

## Revisit if

- The `ingest.note_dropped` count stops being rare — a *chunk* dropping more than one or two notes is
  a response that has come apart, and this ADR's premise was that they have not been.
- A dropped note is ever found to have been a *renamed* one rather than an invented one, and matching
  it back to its group is cheaper than losing it. `_matched`'s `by_term` fallback is the precedent
  and already does exactly this for words the dictionary could not read (ADR 0063).
