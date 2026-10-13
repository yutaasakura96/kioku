# A level is a set of attributed claims, and it only filters

Verified against the JLPT's own FAQ (both language editions, 2026-09-03): 『出題基準』became
**非公開** with the 2010 revision, and the stated reason is that publishing a list of vocabulary,
kanji and grammar items "was not necessarily appropriate" given what the test measures. What replaced
it is prose — 「認定の目安」, 「試験問題の構成」 and sample questions. There is no official word list,
by design, and no amount of sourcing will make "N3" a fact about a word.

So a **level** is a set of **level claims** — *(authority, level)* pairs — and a display value is
derived from them. The set is never collapsed at ingestion.

## Decisions

- **Don't collapse the set.** Disagreement between authorities is information: it nearly always means
  the word genuinely sits on a boundary, which is worth knowing. A single best-guess value is cheaper
  and destroys that signal permanently, because it will never be re-derived.
- **Precedence is declared per subject**, alongside the schema in ADR 0003, with the user's own
  override always winning and disagreement never silently resolved. Not a vote — three community
  lists are not a sample, and averaging them would manufacture a rigour that does not exist.
  Precedence states an honest thing ("I trust this list more") and is a one-line change.
- **A level backed by a named authority and a level estimated by the model must be visually
  distinguishable** — one bit of difference, not a caveat paragraph — with the authority available on
  inspection. A bare "N3" on a model-estimated word is the app asserting what the JLPT declines to
  assert; a footnote on every card is unusable. One visual distinction and a hover is the whole
  honesty budget.
- **The same mechanism covers the tech subjects, unevenly.** AWS and the CNCF publish exam guides, so
  some terms will have better provenance than any JLPT word ever will; others will be pure model
  estimate. Same field, same mechanism, different provenance.
- **Level filters; it never orders the queue.** If level gates what is shown, a misclassification
  costs real study time and the probabilistic-classification problem stops being cosmetic. As a
  filter it is a nuisance fixed in a keystroke. Ordering what is learned by difficulty is WaniKani's
  prerequisite graph (§4.8) — a real feature that should arrive through the front door rather than
  sneak in through a field the JLPT will not vouch for.

Sources: https://www.jlpt.jp/e/faq/index.html · https://www.jlpt.jp/faq/

## Amended 2026-10-10: there is an authority, and the declaration orders them

This ADR left v1 with model estimates only and precedence as a thing to declare later.
[ADR 0075](0075-the-words-are-ready-made-and-a-level-comes-from-a-list.md) §2 declares it:
`authorities: ["tanos-jlpt"]` in `subjects/jlpt-vocab.json`, with Jonathan Waller's JLPT lists as
the first *authority* and the starter set as what carries its claims.

**A model's estimate is no longer read as a *level*.** The set is still not collapsed — the
estimate's row stays where it is and is still exported — but the filter, the *Vet* strip and the
JLPT *categories* read declared *authorities* only, so a word no list places has no level rather
than a guessed one. That is stricter than "visually distinguishable", and it is what the owner asked
for on [#67](https://github.com/yutaasakura96/kioku/issues/67): levels from a known list. The
reader's own override, which this ADR says always wins, is still unbuilt.
