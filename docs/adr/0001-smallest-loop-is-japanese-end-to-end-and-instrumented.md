# The smallest loop is Japanese, end to end, and instrumented

The project's reason to exist (`BRIEF.md` §5) is that generate-then-vet beats hand-authoring.
That is falsifiable, so the first thing built is the smallest loop that produces the evidence:
**paste ~two pages of Japanese → get ~30 vetted cards → study them on two consecutive days.**

The loop is not complete until it emits §5's two numbers. **Acceptance rate** and
**time-to-first-review** are the output of the loop, not reporting bolted on afterwards. A loop that
produces thirty good cards and no measurement has shown that the code runs, not that the thesis holds.

Two consecutive days, not one: one day proves a card renders, two proves a grade persisted and the
scheduler moved the card.

## Considered options

- **English technical terminology first** (no morphological analysis, much less to build before the
  first number). Rejected: it pays its cost at the worst moment. The pipeline's shape would be set
  against the easy subject, and tokenisation, readings and dictionary-form normalisation would arrive
  only once that shape was load-bearing — the inverse of `BRIEF.md` §1.2's warning that anything
  hard-coding Japanese has to be undone later.
- **Japanese, generation and vetting only, no scheduling.** Rejected: it deletes the half that shows
  the cards are *studyable* rather than merely *plausible*, and §4.3's real question — what catches a
  bad card after a month of study — is invisible without a review loop.
