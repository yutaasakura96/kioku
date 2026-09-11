# Provenance kind is decided by who produced the value, and two of the four are unreachable in v1

**`note_field_provenance.kind` records the mechanism that produced the value, not the declaration's
label for the field.** `lookup` is a value read out of a **dictionary**. `generated` is the model
writing one with no dictionary behind it. `judgement` is the model **choosing** among senses a
dictionary supplied — which is ADR 0004's *"which dictionary sense applies here"*, in as many words.
`human` is the reader.

⚠️ **The word is *dictionary*, and it is deliberately not *authority*.** `CONTEXT.md` scopes
*Authority* to *a named external body of opinion a **level claim** cites* (ADR 0005) — a community
word list, a published exam guide — and gives it an `_Avoid_` list. SudachiPy's is not one of those,
and borrowing the word would put two meanings on a term ADR 0005 spent a whole decision keeping
single. *Dictionary* is the concrete thing, `note_field_provenance` already has a
`dictionary_version` column naming it, and in v1 it is the only such thing there is.

In v1 that means the tokeniser's three fields are `lookup`, the model's three are `generated`, and
**`judgement` is unreachable** — because nothing in the pipeline hands the model a set of senses to
choose from.

Decided 2026-09-12 with [#9](https://github.com/yutaasakura96/kioku/issues/9), which is the first
code to write this column.

## The column has four values and nothing said which one to write

`04` §5.4 gives `CHECK (kind IN ('lookup','judgement','generated','human'))` and one worked pair —
`reading` as `lookup`, `example_sentence` as `generated`. The *subject* declaration has its own
`kind` with two values, `lookup` and `judgement`, and `subjects/jlpt-vocab.json` marks `meaning`,
`example_sentence` and `example_gloss` as `judgement`.

**Read as a mapping, that puts `meaning` at `judgement` and `example_sentence` at `generated`, and
nothing explains the difference.** Both are written by the same model in the same response from the
same prompt. A distinction that cannot be derived from anything the code knows is a distinction that
will be written inconsistently the first time somebody adds a field.

## The two kinds are asking different questions

The declaration's `kind` is a **declaration-time** fact and it is about the reader: `03` §6 and
`10` §5 use it to decide what *Vet* foregrounds and what edit may reach. ADR 0004: *vetting seven
authored fields is proofreading, vetting one or two judgements is a decision.*

`note_field_provenance.kind` is a **runtime** fact and it is about trust: ADR 0004 again — *trust is
a property of where a field came from, recorded per field, and never a model-reported confidence
score.* It answers *what mechanism produced this string*, which is the only question a stored row can
answer honestly after the fact.

So they are not two spellings of one thing, and mapping one onto the other was the mistake available
here.

## The rule, and why `judgement` is empty

- **`lookup`** — the value was read out of a dictionary. SudachiPy and `SudachiDict-core` are that
  dictionary for `term`, `reading` and `part_of_speech`, and the row carries `dictionary_version` and
  the raw `is_oov` flag the classification was derived from (`04` §5.4, ADR 0019).
- **`generated`** — the model wrote the value, with no dictionary behind it. The row carries
  `model_id` and `prompt_version`, which is what makes `04` §12's eighth query — *acceptance rate and
  false-accept rate grouped by model and prompt* — ADR 0018's instrument.
- **`judgement`** — the model **chose** among senses a dictionary supplied. **v1 produces none of
  these**, and that is a fact about v1 rather than a gap: SudachiPy supplies no glosses, so there is
  no sense inventory to choose from. ADR 0004's *"which dictionary sense applies here"* describes the
  system this becomes when one is wired in, and on that day `meaning` becomes `judgement` without
  anything else moving.
- **`human`** — the reader wrote it. That is *Vet*'s edit action and belongs to
  [#10](https://github.com/yutaasakura96/kioku/issues/10) / [#11](https://github.com/yutaasakura96/kioku/issues/11),
  not to the pipeline.

**Two of four unreachable is the honest state and is better than a populated column nobody can
interpret.** A `judgement` row written today would claim a choice was made among alternatives that
never existed, and `04` §12's eighth query would be grouping over a distinction with no mechanism
behind it.

## Consequences

- **The mapping is derived, not listed.** `pipeline/write_pending.py` asks the declaration which
  fields are `judgement` and writes `generated` for those and `lookup` for the rest. Adding a field
  to `subjects/jlpt-vocab.json` needs no change here.
- **`is_oov` rides on the looked-up rows only.** It is the signal `kind` was derived from and it says
  something about the tokeniser's answer; there is nothing for it to say about a sentence the model
  wrote.
- **`dictionary_version` and `model_id` are mutually exclusive on a row**, which makes the column
  readable in `\d` and a row that carries both a sign that something wrote it by hand.

## Revisit if

A dictionary with sense inventories is wired into stage 6 — at which point `meaning` becomes a choice
among supplied alternatives and `judgement` becomes reachable — or a field arrives that is produced
by a mechanism none of the four names, which would be a fifth value and an amendment to `04` §5.4
rather than a reinterpretation of these.
