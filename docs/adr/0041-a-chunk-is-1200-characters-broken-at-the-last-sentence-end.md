# A chunk is 1200 characters, broken at the last sentence end

**`source_chunk` boundaries are computed by a target and hard maximum of 1200 characters, broken at
the last of `。`, `！`, `？` or a newline at or before the target, with the terminator belonging to the
chunk it ends. Where the window holds no terminator, the break is at the target. Chunks tile the
content exactly, and every offset is a code point.**

`04` §5.2 states the *property* — "the deterministic division of a source's content. Chunk boundaries
are a function of content, so they are shared and stable across re-ingestions" — and `03` §5.1 names
stage 1, "accept and chunk the source". Neither gives a size or a rule. #6 is the ticket that writes
`source_chunk` rows, so it could not be written without deciding.

## Why 1200

It is `04` §5.2's own worked example — `(019bd3…, source 019bd3…, 0, 0, 1200, '7c11…', …)` — and the
only number about chunking anywhere in eleven documents. Adopting it costs nothing and keeps the
schema's example true.

It is a *target*, not a floor. A chunk is at most 1200 characters and usually a little under, because
the boundary search runs backwards from the target.

## Why the boundary is a sentence end, and why that is not a guarantee

Stage 2 tokenises each chunk with SudachiPy **independently** (`03` §5.1). A cut inside a word yields
two fragments that are not the word, at both edges of the cut — and `03` §5.2 has already established
that stage 2's output feeds `normalized_form`, which is half of ADR 0006's *identity key*. A fragment
that survives to a *note* is a note about a word that does not exist, and it would key *consistently*
strangely, which is how it would survive review.

⚠️ **A sentence terminator is not a word boundary in general**, so this is a reduction in risk rather
than an elimination of it. It is taken because it costs nothing: the search is a backwards scan over
at most 1200 characters, once per chunk.

ASCII `.` is deliberately **not** a terminator. In a Japanese *source* it appears inside numbers, URLs
and Latin abbreviations far more often than it ends a sentence. A newline **is** one, because pasted
prose is paragraphed with it and a paragraph break is the strongest boundary in the text.

## Why it hard-breaks when there is no terminator

A paste with no punctuation is ordinary — a vocabulary list, a table copied out of a PDF, a wall of
text from a page that lost its formatting. A rule that searches backwards without a floor either
returns a chunk of one character or does not terminate. The bounded form always answers, and the cost
is one badly-placed cut in material that had no good cuts in it.

## The three properties that carry the rest of the system

- **The chunks tile the content exactly** — contiguous, no gap, no overlap. `occurrence.char_start`
  is a position **in the source** and `occurrence.source_chunk_id` says which chunk found it
  (`04` §5.5); a gap makes a position unattributable, and an overlap lets one *occurrence* be found
  twice — at which point `04` §5.5's `UNIQUE (note_id, source_id, char_start)` refuses the second and
  the run fails for a reason nobody would look for here.
- **Same content in, same boundaries out.** This is `04` §5.2's "stable across re-ingestions", and it
  is what makes `source_chunk.content_hash` sound as the first element of the generation cache key
  (`04` §6.3).
- ⚠️ **Every offset is a code point, not a UTF-16 unit.** `'𠮟'.length` is 2 and `len('𠮟')` is 1; the
  app writes the offsets and Python reads them. One character outside the BMP would put every later
  offset one out, silently. `shared/ingest/text.ts` carries that argument in full.

## Alternatives

- **Fixed 1200-character windows.** Simplest, and it cuts inside words by construction — the failure
  mode above, on every chunk boundary rather than on the unlucky ones.
- **Paragraph-only breaks.** Unbounded: a *source* with no blank lines becomes one chunk, and the
  cache key then has one entry for 100,000 characters, which is ADR 0010's replay value at its worst.
- **Tokenise first, break on morpheme boundaries.** Correct, and it puts SudachiPy in the app tier —
  which is the split ADR 0019 spent its whole argument drawing, and a 9 ms dictionary load on every
  submission besides.

## Revisit if

The first real *ingestion* shows chunk size driving cost or latency in a way `03` §15 did not
anticipate — that is `S3`'s twenty-note experiment, and it is the right instrument for it.

⚠️ **Moving the number is not free and is not dangerous.** It changes `source_chunk.content_hash` for
every *source* ingested afterwards, and therefore the first element of the generation cache key
(`04` §6.3), so old cache entries stop being found and the next re-ingestion pays full price. **That
is a cost, not a corruption**: unlike a `SudachiDict` bump it cannot change the identity of an
existing *note*, because chunk boundaries never reach `normalized_form`. It is safe to change with a
sentence in the decision log, not a re-ingestion plan.
