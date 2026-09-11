# Generation is one request per chunk, and notes are written as each chunk returns

**Stage 6 makes one provider call per *chunk*, carrying that chunk's text and all of its surviving
*candidates*, and stage 7 writes that chunk's *pending notes* the moment the call returns.** The unit
of generation, the unit of the cache key and the unit of the streamed write are all the *chunk*.

Decided 2026-09-12 with [#9](https://github.com/yutaasakura96/kioku/issues/9), because the documents
disagreed and nothing had had to resolve them before.

## The two documents said different things

`03` §5.1's table calls stage 6 **"Generate — the LLM, per surviving note"**, which reads as one
request per word. `04` §6.3 keys `generation_cache` on **(content-chunk hash, dictionary version,
prompt version, model id)** and stores `{"notes": […]}` under it — plural, under a key whose first
element is a property of the *chunk*.

**Those cannot both be true.** One request per candidate, cached on the chunk's hash, puts every
candidate in a chunk under one four-tuple: 214 candidates across 84 chunks would write and overwrite
84 rows, each holding whichever word happened to finish last. The cache would not be wrong
occasionally; it would be wrong structurally.

**The cache is the half that could not be wrong**, because `03` §5.3 spent a whole section correcting
its key and `03` §11 promises the reader that an identical *source* resubmitted costs no LLM spend.
So the chunk is the unit, and `03` §5.1's phrase is about **scaling** — stage 6 scales with *new
notes only*, which is ADR 0010's entire argument and is unaffected.

## The passage is in the prompt, and the key depends on it

Keying on `source_chunk.content_hash` is only sound if the chunk's text is part of what was asked.
Otherwise a hit answers a question the request never contained, and a change to the chunking rule
would not invalidate a single cached row.

It is also the better prompt. ADR 0004 says what the model contributes is **judgement** — *which
dictionary sense applies here* — and "here" is the passage. A word list with no context is a request
for the first sense of each word.

## Writing per chunk is what `S2` asks for, and nothing finer is available

`S2` requires *notes* to appear as produced, and #9's own acceptance criterion is that **the first is
vettable while later chunks generate**. Writing one chunk's notes as that chunk returns satisfies
that exactly: a 31-chunk *source* puts its first notes in the queue after one request rather than
after thirty-one.

**Finer than that is not available and was not attempted.** Writing each note as it streamed would
mean parsing incomplete JSON, and ADR 0018 already recorded the relevant fact: *Gemini is the only
provider documenting that streamed chunks are valid partial JSON*, and Anthropic and OpenAI document
constrained decoding without documenting partial validity. Building on undocumented behaviour is the
thing `CLAUDE.md` § Working agreements forbids, and the gain would be seconds inside a request that
the chunk boundary already bounds.

**The per-chunk write is also what closes cross-chunk duplication**, which `00-status.md` § Carrying
had been carrying as an open trap. Tokenisation is per chunk (`03` §5.1), so a word in chunks 1 and 3
is two groups and stage 4 cannot see across one. Because chunk 1's *note* exists by the time chunk 3
is deduplicated, chunk 3's sighting is an `already_known` rather than a second thing to pay for. **A
run that batched its writes to the end would pay twice for every word that spans chunks.**

## What follows from it

- **The model is asked only for the *judgement* fields**, and echoes the *identity key* fields back
  so a returned note can be matched to the group that asked for it. `term`, `reading` and
  `part_of_speech` are the tokeniser's (ADR 0004), and a model free to write `term` would be free to
  change `note.identity_key` (ADR 0006). The echo is matched, never merged.
- **Matching is on the rendered identity key, not on position.** A model that reorders its answers
  would otherwise attach 図書館's meaning to 開く. The term alone is not enough either: 開く is both
  ひらく and あく, which is the pair `04` §5.3 gives as the reason ADR 0006's key has two halves.
- **A missing note and an unasked-for note are both errors**, and the *chunk* fails. Half a chunk is
  not a unit anything resumes from; `03` §5.4's partial results are kept at chunk granularity.
- **A cached response may answer more than a run needs and never less.** The key is the chunk's
  content, which cannot change; the survivor set can, and only downward, because stages 4 and 5
  shrink as the corpus grows (`S5`). A hit that does not answer every survivor is treated as a miss,
  because serving it would lose a *note* in silence — the chunk would still be marked `complete`, so
  no resume would come back for it.

## Alternatives

**One request per candidate.** What `03` §5.1's wording suggests. It gives the model no context to
choose a sense from, multiplies request overhead by the number of words, and breaks `04` §6.3's key
outright. Nothing recommends it except the sentence that implied it.

**One request per *source*.** Would make the cache key a property of the source and the streamed
write impossible: `S2`'s *time-to-first-review* would be back at the mercy of document size, which is
the failure `03` §5.1 stage 7 exists to prevent. It also makes a part-way failure lose everything,
against ADR 0015.

**Per-note streaming inside a chunk.** Rejected above: undocumented partial-JSON validity, for a gain
the chunk boundary has already mostly taken.

## Revisit if

A provider documents that its streamed structured output is valid partial JSON at every boundary, and
`S3`'s first real run shows *time-to-first-review* dominated by a single chunk's generation rather
than by the number of chunks. Then the write unit can move inside the chunk without the cache key
moving with it.
