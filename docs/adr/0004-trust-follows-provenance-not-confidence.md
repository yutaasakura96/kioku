# Trust follows provenance, not confidence; vetting is mandatory in v1

`BRIEF.md` §4.3 asks how much to trust "the LLM", as though a card were one thing a model wrote. It
is not. For JLPT vocabulary `term`, `reading`, `part_of_speech` and the candidate `meaning`s are
**dictionary lookups**, not generations. What the LLM contributes is **judgement** — which words in
this source are worth a note, which dictionary sense applies here, and sometimes an example sentence.

So trust is **a property of where a field came from**, recorded per field, and never a
model-reported confidence score. This is what makes §5's assumption survivable: vetting seven
authored fields is proofreading, vetting one or two judgements is a decision, and the difference is
roughly the factor that decides whether the project has a reason to exist.

## Decisions

- **Vetting is mandatory for every note in v1** — not because it is safest, but because no
  auto-acceptance rule can be calibrated before acceptance-rate data exists, and producing that data
  is the entire point of v1 (ADR 0001). A threshold written now would assume the number the project
  exists to discover. v2 sets one from evidence.
- **The unit of vetting is the note** (forced by ADR 0002), keyboard-only accept / edit / reject. The
  screen foregrounds only the **judgement fields**; looked-up fields render without asking for
  attention. At thirty notes this is academic; at eight hundred it is the whole question.
- **There is no provisional card state.** A note is *pending*, *accepted* or *rejected*, and a
  pending note mints no cards. A visible-but-unverified card ships known-unverified material into
  memory and makes vetting optional in practice, which §4.3 itself says is worse than having no deck.
  It creates no bottleneck because acceptance is per-note: ingest 800, vet 30, study those 30
  tonight while 770 wait.
- **A "this is wrong" action during review** suspends the card immediately, returns the note to the
  queue flagged, and records the flag **against the note's source and prompt version**. The third
  part is the one that matters — without it you learn "some cards are bad" rather than "prompt v3
  writes bad example sentences", and only the second is actionable.

## The third metric

Acceptance rate shows whether the *pipeline* works. It cannot show whether *vetting* works — §5
explicitly worries the vetting step may be theatre. **False-accept rate** — notes accepted at vetting
that were later flagged wrong — is what detects that, and like the other two it is cheap to record
from day one and impossible to reconstruct later.

A free fourth signal, named but not built: a card with an anomalously high lapse count is a bad-card
suspect, and the scheduler produces it for nothing.
