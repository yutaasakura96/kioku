# The smallest loop is Japanese, end to end, and instrumented

The project's reason to exist (`docs/01-project-brief.md` §5) is that generate-then-vet beats
hand-authoring. That is falsifiable, so the first thing built is the smallest loop that produces the
evidence:
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
  only once that shape was load-bearing — the inverse of `docs/01-project-brief.md` §1.2's warning
  that anything hard-coding Japanese has to be undone later.
- **Japanese, generation and vetting only, no scheduling.** Rejected: it deletes the half that shows
  the cards are *studyable* rather than merely *plausible*, and §4.3's real question — what catches a
  bad card after a month of study — is invisible without a review loop.

## Amendment — 2026-09-16, the loop changed shape

The loop ran once, on 2026-09-14, and what it produced is in `docs/first-run-expectation.md`. It did
what this ADR asked: it emitted the two numbers. The numbers then said the thesis this loop was built
to test is not the one the reader wants tested (ADR 0062), so the loop is restated:

**upload a list of chosen words → get *cards* without being asked → study them on two consecutive
days, twice, with no backlog waiting at the end.**

Two things survive unchanged and they are the two this ADR was actually about. The loop is still
end to end, and it is still instrumented from the first commit rather than afterwards. What changed is
which numbers come out of it: retention, consistency and flag rate, per
[ADR 0062](0062-retention-and-consistency-are-the-headline-and-acceptance-rate-retires.md).
*Twice* is new, and it is [ADR 0066](0066-the-review-load-has-a-brake.md)'s doing: one pass through
two days proves the scheduler moved a *card*, and a second pass a week later is the only thing that
proves the load did not pile up.
