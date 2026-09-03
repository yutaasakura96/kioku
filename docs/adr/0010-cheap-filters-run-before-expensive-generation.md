# Cheap filters run before expensive generation; ingestion is a streaming background job

**Deduplication and the known/rejected filter run before any per-note LLM call.** This is the whole
of `BRIEF.md` §4.9 at the product level.

Whole-document stages (tokenising, candidate extraction) scale with document size. Per-note stages
(sense selection, example generation) scale with the number of *new* notes. Because ADR 0006 made
rejection permanent, the fiftieth document is mostly terms already decided about — so **the expensive
part shrinks as the corpus grows**, but only if the cheap filter runs first. Ordered the other way,
full price is paid to generate notes that are immediately discarded.

## Ingestion never blocks the user

**Ingestion is always a background job, and notes stream into the vetting queue as they are
produced.** A synchronous wait would lose the work on a dropped connection, which §2.2 makes likely.
But "background" must not mean "wait for the whole document" either — that would put
time-to-first-review at the mercy of document size. Vetting begins on the first notes while the rest
generate, which is what reconciles a background job with the ten-minute metric.

## Cache key

**(content-chunk hash, prompt version, model id).** §4.9 proposes hash plus prompt version; the model
belongs in the key too, since the same prompt against a different model is a different result. Beyond
saving money on re-ingestion, this makes the pipeline **replayable**, which is the only way a bad
card can be debugged after the fact.

## The budget is measured, not guessed

A per-10,000-word figure cannot be given without naming a provider, which is §4.12. What is decidable
now is the instrument: **record tokens and cost per ingestion alongside acceptance rate.** Same
discipline as ADR 0001 — the number is produced, not assumed.
