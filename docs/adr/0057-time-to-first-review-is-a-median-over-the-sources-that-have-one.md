# Time-to-first-review is a median over the sources that have one

**`S10` renders *time-to-first-review* as one figure and the criterion is defined per *source*. It is
the **median** across *sources*, and a *source* whose *cards* have never been reviewed is
**excluded** rather than counted as a long one. The count of *sources* that contributed is shown
beside it.**

## The documents define it per source and render it once

`CONTEXT.md`: *minutes from submitting a source to answering the first card generated from it*. `10`
§8.1 gives it one 38px slot and calls the figure "a duration". `11` §3 names the failure — *the first
`review_log` for a card from that source, not the first grade of any card* — and says the near-miss
"is wrong the moment a second *source* exists".

So the measurement is a set and the screen is a scalar, and nothing in eleven documents says which
scalar. Three were available.

## Why the median

**The mean is the obvious one and it is the wrong one.** A *source* pasted on a Friday and studied on
the following Wednesday contributes five days to an average of numbers otherwise measured in minutes.
The criterion has a stated boundary — "above roughly ten minutes, Kioku is a different chore rather
than a replacement for hand-authoring" — so one abandoned weekend would push the figure past it while
every *source* the reader actually used came back in eight minutes. The number would be reporting the
reader's schedule rather than the pipeline's turnaround.

**The most recent *source*'s duration** was the other candidate, and it is the freshest reading. It
was rejected because it is a sample of one: on the day a *source* is pasted and not studied until the
evening, the figure reports nine hours and nothing on the screen says it is one measurement.

**The median** is what median *seconds-per-note* already is, on the same screen, for the same reason
— `11` §3 makes that one a median over samples rather than a mean. One idiom for "a typical value"
across two of the five figures is worth more than picking the theoretically best aggregate for each.

## Why an unstudied source is excluded rather than counted

A *source* pasted an hour ago and not yet vetted has **no** *time-to-first-review*. It has a
lower bound — at least an hour — and the two ways of using it are both wrong:

- **Counting it as its age so far** manufactures a measurement out of the reader not having sat down
  yet, and it grows every time the page is loaded.
- **Counting it as zero** flatters, in the direction `11` §3 already warns about for *acceptance
  rate*.

⚠️ **The exclusion is a real bias and it is stated rather than hidden**: the median is over *sources*
the reader chose to study, and a *source* they pasted and abandoned never enters it. That is why the
figure carries `2 / 5` beneath the boundary and why the count is part of the view rather than a
detail of the query (ADR 0058).

## Consequences

`server/utils/stats/queries.ts` groups by *source* and takes `min(review_log.received_at)` per group,
joined through `note.origin_ingestion_id` — ⚠️ **not through `occurrence`**. `CONTEXT.md` says *the
first card **generated from** it*, and an *occurrence* is a sighting of a *note* some earlier
*source* already paid to generate, so the *occurrence* join would let a *source* inherit a *review*
of a *card* that existed before it was pasted.

⚠️ **`received_at`, never `reviewed_at`.** `03` §12 requires the submit instant and the first grade
instant to be on the same clock; `reviewed_at` is the client's stamp (`04` §7.5 says the two columns
are not redundant). On a laptop an hour fast, `reviewed_at` would produce a *negative* duration.

## Revisit if

A second reader exists, or *sources* start being pasted in batches and studied selectively — at which
point the population the median is over stops being "the *sources* this reader worked through" and
the exclusion above starts doing more work than it should.
