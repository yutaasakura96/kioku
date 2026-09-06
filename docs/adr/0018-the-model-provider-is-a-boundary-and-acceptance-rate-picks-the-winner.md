# The model provider is a boundary, and acceptance rate picks the winner

**Generation sits behind a provider boundary with a declared output schema.** The working default is
**`claude-sonnet-5`**, with **`claude-opus-5`** run once as a ceiling probe. From there the model is
walked *down* toward `gpt-5.6-luna` until measured *acceptance rate* degrades. **Which model wins is
decided by that measurement, not by this document.**

## The documentation cannot decide this, and saying so is the point

The verification found **no published benchmark that tests what this project needs**. Artificial
Analysis's Japanese index does not cover the cheap models this workload would otherwise use. Nejumi
and Swallow are credible but were not confirmed for current frontier models. JGLUE targets
pretrained-model evaluation. Anthropic's own Japanese figure is a vendor self-report. **Nothing
measures reading accuracy, JLPT-level estimation, or Japanese structured extraction.**

Choosing a model from documentation here would be the exact failure `CLAUDE.md` forbids, wearing a
citation. The honest move is to make the choice cheap to change and let §5's instrument settle it.

**The architecture already anticipated this.** ADR 0004 records model and prompt version per field
as *provenance*. ADR 0010 puts the model id in the cache key. ADR 0011 makes re-generation propose
against a diff rather than overwrite. Recording model-per-field only means something if the model
can vary — the boundary is what ADR 0004 already implied.

## The walk goes downward, because a cheap default confounds the instrument

**This ADR originally defaulted to `gpt-5.6-luna`, the cheapest option, and that was wrong.** The
reasoning was that ADR 0019's tokeniser does the morphological work, leaving the model only
"templated extraction". That understates the job: the model produces the *meaning* and the example
sentence, and this project's own Phase 2 design decision states that **the *meaning* is the field
that costs the decision**. Those are the *judgement fields* PRD S4 foregrounds — the ones that
decide whether a *note* is accepted or edited.

The deciding problem is not quality in the abstract, it is **measurement**. If the first *ingestion*
runs on the cheapest model and *acceptance rate* returns 60%, that number cannot distinguish

- the thesis being wrong — generated cards are not good enough to study from — from
- a model too small for the task.

§5 names that assumption as the riskiest one, and ADR 0001 requires the smallest loop to be
instrumented. **A confounded first measurement breaks the instrument the project exists to build.**
Establishing the ceiling first and descending means a poor number is information rather than noise.

## Cost is not the constraint

Per *ingestion*, on the planning assumptions in
[`../phase-4-verification.md`](../phase-4-verification.md) §3.4:

| Model | In / Out per MTok | Per ingestion |
| --- | --- | --- |
| `gpt-5.6-luna` | $0.20 / $1.20 | $0.12 |
| `claude-haiku-4-5` | $1 / $5 | $0.50 |
| **`claude-sonnet-5`** | $2 / $10 | **$1.00** |
| `gpt-5.6-terra` | $2 / $12 | $1.16 |
| `gpt-5.6-sol` | $4 / $20 | $2.00 |
| **`claude-opus-5`** | $5 / $25 | **$2.50** |
| `gpt-6-astra` | $10 / $50 | $5.00 |

Across fifty *ingestions* — a realistic v1 exploration — the whole range is $6 to $250. **The
validity of the thesis measurement is worth more than the difference.**

## Why Anthropic at the strong end

The only evidence that exists: Artificial Analysis's Japanese index top five is Gemini Pro models
and **three Claude Opus entries**. That is older Opus versions on a general-knowledge benchmark
rather than on extraction — **weak evidence, recorded as weak** — but it is the only signal found,
and no OpenAI model appears in it.

`gemini-3.8-flash` was the pre-decision recommendation on a different axis: it is the only provider
documenting that streamed chunks are **valid partial JSON**, which suits PRD S2. It was set aside by
preference for OpenAI or Anthropic. Its docs also decline to use the word *guarantee* about schema
conformance, where Anthropic and OpenAI both document constrained decoding.

## Models rejected, and why

**`gpt-5.6-sol`** — no case. At $2.00 per *ingestion* it is double Sonnet, with no Japanese evidence
in its favour and nothing in this workload that wants a mid-tier reasoning model. If $2 is to be
spent, Opus 5 is $2.50 and carries the only supporting data.

**`gpt-6-astra`** — over 40× luna at **$5.00 per *ingestion***, and nothing about this workload
justifies it. Reachable, unused.

**`gpt-5.6-luna` as the *default*** — rejected for the confounding argument above. **Not rejected as
the destination**: if it matches Sonnet's *acceptance rate* it saves ~88%, and establishing that
costs one *ingestion*.

## Batch mode is ruled out by the PRD

All three providers offer 50% off asynchronous batches, and all three make batch **mutually
exclusive with streaming**. PRD S2 requires *notes* to appear as they are produced, and
*time-to-first-review* has a ten-minute budget against a 24-hour batch ceiling. Halving an already
trivial cost is not worth failing a tracked metric. Chunked streaming is the resolution.

## Consequences

**The price table is configuration with an effective date, not a constant.** PRD S10 reports
cost-per-*ingestion*; Gemini's published prices double on 2027-01-01, and any hard-coded table
begins lying silently on that date.

**Token counts are measured, not estimated.** The 0.85 tokens-per-Japanese-character ratio used for
planning carries ±30% uncertainty and was measured on OpenAI's `o200k_base`; neither Anthropic nor
Google publishes a tokeniser. Real counts come from the API response.

**Output verbosity is the cost lever.** Output is ~80% of spend, so trimming per-*note* output is
worth far more than prompt caching, which saves cents.

**The walk is recorded, not just performed.** Each *ingestion* already stores its model id (ADR
0004, ADR 0010), so the comparison is a query over existing data rather than a separate experiment.

## Revisit if

A benchmark appears that actually measures Japanese structured extraction, or the first real
*acceptance rate* figures separate the arms decisively — in which case this ADR is superseded by
data, which is the outcome it was written to produce.
