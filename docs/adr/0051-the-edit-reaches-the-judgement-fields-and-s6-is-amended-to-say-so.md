# The edit reaches the judgement fields, and `S6` is amended to say so

**`S6`'s "any field is editable before acceptance" is narrowed to "any *judgement field*". The
*term*, the *reading*, the part of speech and the *level* are not editable at *vetting* — everything
above the *facts strip*'s lower rule is context and the edit reaches only under it (`CONTEXT.md`,
`10` §4.4) — and `02-product-requirements.md` §S6 now says that rather than the opposite.**

## Two documents disagreed, and the code had already picked one

`02-product-requirements.md` §S6 says *any field is editable before acceptance*.
`10-screen-specifications.md` §4.4 says *edit reaches the **judgement fields** only — the *meaning*,
the example sentence and the example gloss*, and gives two reasons that are not about taste. #10
built `10` §4.4's version, in `app/components/VetNote.vue` **and** in `shared/vet/decision.ts`,
because the request arrives from a client anybody can read.

So the contradiction was never live in the code. It was live in the acceptance criteria, where #11
inherited a checkbox — *any field is editable before acceptance* — that the build had already
decided against for reasons the PRD does not carry.

## `10` §4.4's two reasons, which are the argument

⚠️ **Editing the *term* or the *reading* changes which *note* this is.**
[ADR 0006](0006-note-identity-is-a-declared-key-and-collision-appends-an-occurrence.md) makes
`note.identity_key` the subject's declared key fields, NFC-normalised and joined — so an edit to
either does not correct a *note*, it makes the row a *note* about a different word while every
*occurrence* underneath it still points at the sightings of the old one. `04` §5.3 states the same
thing from the other end: changing the rendering rule is *a reviewed data event with a re-ingestion
plan, never a refactor*. A text box on the *term* is that event, once per keystroke, with nobody
reviewing it.

⚠️ **Editing a *level* manufactures a claim with no *authority*.**
[ADR 0005](0005-a-level-is-a-set-of-attributed-claims.md) makes a *level* an attributed claim
rather than a fact: `level_claim.authority_key` names who says so, and `NULL` means the model
estimated it. The *provenance marker* — filled for a named *authority*, hollow for an estimate — is
`S4`'s one visible honesty bit. A reader typing `N3` into a box produces a claim that is neither: not
an authority's, not the model's, and not distinguishable from either afterwards. **Correcting a
*level* is a different feature** — it is a claim with the reader as its *authority*, and it needs a
row that can say so.

Both are the zoning `CONTEXT.md` already states and `10` §4 draws: everything above the lower rule is
context, everything under it is a *judgement field*. The edit reaches under the rule.

## What was chosen instead

**Widen the code to match `S6`.** Rejected: it is the option that has to be argued against ADR 0006
and ADR 0005 rather than merely chosen, and neither of them is in doubt.

**Leave the contradiction and let each document be right in its own scope.** Rejected because the
acceptance criteria are read by whoever implements next, and a criterion that the code deliberately
fails is a criterion that gets satisfied by somebody who does not know why it was not.

**Narrow `S6`.** Taken. `S6`'s story — *I want to correct a wrong meaning at vetting, so that a small
error doesn't cost the whole note* — is about the *meaning*, in its own words. The three *judgement
fields* are the three the model wrote, and they are exactly the set a small error lands in. `S6` loses
nothing it was written to promise.

## What the reader does with the other three

⚠️ **`R` — reject — is the answer, and it is already one keystroke.** A wrong *term* or a wrong
*reading* is not a small error in a good *note*; it is a *note* about the wrong word, and `S5` makes
the rejection stick across every later *ingestion*. A wrong *level* is a claim the reader disagrees
with, which is `S9`'s shape rather than `S6`'s.

## Revisit if

- A *subject* declares a key field the reader can reasonably correct without changing the identity of
  the thing — at which point the rule is about `identity_key` membership rather than about the
  *facts strip*, and the declaration already knows which fields those are (ADR 0003).
- *Level claims* gain a reader-as-authority row, at which point editing a *level* stops manufacturing
  an unattributed claim and becomes an attributed one. ADR 0005's authority list is owed and no
  ticket owns it; that ticket is where this would be argued.
