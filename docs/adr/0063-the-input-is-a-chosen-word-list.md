# The input is a chosen word list, and a source declares which pipeline it runs

**Decided 2026-09-16, with [ADR 0062](0062-retention-and-consistency-are-the-headline-and-acceptance-rate-retires.md).**
A *source* gains a `kind`: `word_list`, `prose`, or `anki`. The *subject* declaration stops naming
one ordered list of *pipeline stages* and names one per kind. Prose ingestion stays built, tested and
reachable, and stops being the way words get in.

## What the first run proved, which is not what it was meant to prove

Two pages of Japanese, about 3,400 characters, produced **474 *pending notes***
(`docs/first-run-expectation.md`). The pipeline worked. Every stage did its job, the cache did its
job, the numbers came out. And the queue was unusable, because 474 decisions is not a thing a person
does after work, and the reader stopped at 39.

Mining prose answers the question *which words are in this text*. Yuta's question is *which words do
I want*, and those have almost nothing to do with each other. A page about a database migration
contains 200 words he already knows, 30 he does not care about, and maybe 6 worth learning, and the
pipeline has no way to tell them apart because the information that separates them is not in the
text.

**So the reader supplies the words and the model fills the fields.** That is ADR 0062's premise and
this ADR's whole subject.

## What is decided

**1. `source.kind`, with three values and a `CHECK`.**

- `word_list` — one term per line. Pasted into *Ingest* or uploaded as a `.txt`. The lines Yuta
  compiles himself, and the lists a model seeds for a domain and level, arrive as the same kind,
  because by the time they reach ingestion there is no difference between them.
- `prose` — what `03` §5.1 already describes, unchanged.
- `anki` — a `.apkg`, in its own ticket, and ⚠️ **the format and the licensing of shared decks are
  both unverified**. That ticket opens with research and this ADR does not pre-decide its answer.

The column defaults to `prose`, so the rows that exist keep their meaning.

**2. The declaration names a pipeline per kind.** `subjects/jlpt-vocab.json`'s `stages` array becomes
a `pipelines` object keyed by *source kind*:

```
"pipelines": {
  "prose":     ["chunk", "tokenise", "extract_candidates", "deduplicate", "filter_known",
                "generate", "write_notes"],
  "word_list": ["chunk", "normalise", "deduplicate", "filter_known", "generate", "write_notes"]
}
```

⚠️ **Both toolchains read this file and neither restates it** (ADR 0003, `03` §6). The stage keys are
also Python module names, so this rename touches `shared/subject/declaration.ts`, its validator, the
worker's stage dispatch, and the tests that assert the shape. It is a small change in four places
rather than a large one in one, which is the shape ADR 0003 chose on purpose.

**3. The word-list pipeline is four of the prose stages plus one new one.**

- `chunk` splits on newlines, **25 terms per *chunk***. Not ADR 0041's 1,200 characters, which is a
  sentence-boundary rule with nothing to hold onto here. 25 puts a request in the same few minutes
  the prose *chunks* took, which is the window
  [ADR 0061](0061-the-worker-heartbeats-while-the-model-streams.md)'s keepalive was sized against.
- `normalise` replaces `tokenise` and `extract_candidates`. One line is one term, so there is nothing
  to extract. What is left is the part that still has to happen: Sudachi gives the dictionary form
  and the reading, and [ADR 0045](0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md)
  decides the script that reading is written in. A reader who types an inflected form gets the
  dictionary form, and the *identity key* is what it has always been.
- ⚠️ **A line Sudachi cannot resolve is kept, not dropped.** It goes to the model with an empty
  reading, the reading comes back as *provenance* `generated` rather than `lookup`, and `is_oov` is
  already on the *candidate* for exactly this (ADR 0019). A list of tech loanwords is going to
  contain words the 2026 dictionary has never seen, and refusing them would refuse the ones this app
  exists for.
- `deduplicate` and `filter_known` are unchanged code. The same word on two lines is one *note* and
  two *occurrences* (ADR 0006), and a line whose *note* already exists costs nothing.
- `generate` fills more fields than it used to, and `write_notes` mints directly (ADR 0064).

**4. The 474 *pending notes* are a cache, not a backlog.** They stay in the database. Nothing mints
them, nothing shows them, and `filter_known` finds them the moment a chosen word matches one, at
which point the *note* is already generated and already paid for and minting it is free. That is the
whole of what the first run bought, and it is worth more as a lookup table than as a queue.

**5. Prose ingestion is kept.** It is built, it has tests, it is the only path that produces
*occurrences* in real text, and `S11` still points at it. What it loses is its place as the default
on *Ingest*. ⚠️ **Deleting it would also delete the evidence for this ADR**, and a project that
removes the code its own decisions were argued from cannot check its reasoning later.

## Alternatives considered

**One pipeline, with the prose-only stages skipping themselves on a word list.** Rejected. A stage
that silently does nothing is the failure mode `03` §5.1 is built to avoid, and the first bug it
produces reads as *the tokeniser is broken* rather than *the tokeniser was not supposed to run*.

**A separate *subject* for word lists.** Rejected: the *fields*, the *templates*, the *identity key*
and the dictionary are all the same, so this would be one declaration copied with two lines changed,
and the copy would drift the first time a field was added.

**Skip Sudachi for word lists and let the model give the reading.** Tempting, because it deletes a
stage and a dependency from this path. Rejected: the reading is half the *identity key* (ADR 0045),
and an *identity key* whose value comes from a model is one that changes when the model does. The
dictionary is what makes the same word the same *note* next year.

**Keep mining prose as a second way in for domain vocabulary.** Not rejected, just not now. The
ordering is a fact about attention rather than about code: prose ingestion already works, so nothing
is lost by leaving it where it is until the chosen-word path has a reading on ADR 0062's numbers.

## Revisit if

- A word list regularly arrives with more than a few hundred lines. 25 terms per *chunk* is sized for
  a list of tens, and a list of thousands wants a different answer about cost before it wants a
  different answer about chunking.
- Anki import lands and its notes turn out to carry fields worth trusting, which would make `anki` a
  kind that skips `generate` rather than one that feeds it.
- Sudachi's OOV rate on tech vocabulary turns out to be high enough that `normalise` is mostly
  passing lines through untouched, at which point the stage is doing less than the dependency costs.
