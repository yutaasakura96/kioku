# A measured criterion is reported, not asserted

**`S3`'s median *seconds-per-note* and `S10`'s four numbers get no threshold assertion in the test
suite. What the suite asserts is that each number is *recorded correctly* — the right rows, the right
clock, the right denominator, the right suppression below twenty. The thresholds are reported by the
app, which is what `S10` says they are for.**

This is the shape of the whole testing plan, so it is decided first.

## A threshold assertion would be a test of the corpus, not of the code

`S3`'s criterion is "median *seconds-per-note* for an unedited accept is **under 5 seconds**,
measured over a run of at least 20". `S10`'s is that the app *reports* four numbers.

A test asserting `median < 5` needs twenty vetted *notes* to measure. Those come from one of two
places, and both are wrong:

- **Fixtures.** Then the test asserts that a number computed from a file the test wrote is under
  five, which is a test of the fixture. It passes forever and it passes on the day the real median is
  eleven seconds.
- **A real run.** Then the suite requires a human at a keyboard, and it fails when the human is
  tired. That is not a test, it is a stopwatch with a CI badge.

**Neither version can fail for the reason the criterion exists.** `S3` says the story
`docs/01-project-brief.md` §5 lives or dies on is whether *vetting* is fast **for the reader**. That
is a fact about a person and a corpus that does not exist yet. A green suite asserting it would be
the project telling itself the thesis holds before there is any evidence either way, which is the
exact failure ADR 0018 refused when it declined to pick a model from documentation.

## The same argument, from the other end: ADR 0018 already decided this

ADR 0018 made the model choice a **measurement**, not a decision, because verification §3 found no
benchmark that tests Japanese structured extraction. Its instrument is *acceptance rate*.

If the suite asserted a floor on *acceptance rate*, the instrument would be constrained by the
harness that is supposed to read it. The model walk in ADR 0018 — Opus 5 as a ceiling probe, down
toward `gpt-5.6-luna` until *acceptance rate* degrades — **requires the number to be free to fall.**
A test that fails when it falls turns the experiment into a regression.

## What a test can hold, and it is most of what matters

The number is derived from rows (`03` §12, `04` §13 — **there are no metrics tables**). Rows are
testable, and every way the number can be wrong is a bug in code rather than a fact about a corpus:

| The number | What the suite asserts |
| --- | --- |
| *Acceptance rate* | An **edited** accept counts as an edit and not an acceptance (`S6`, `note_vetting.edited`). The denominator is notes generated, not notes seen |
| Median *seconds-per-note* | `seconds_to_vet` is stamped per *note* at the keystroke, from the first run; the median is over **unedited accepts only**; an even count takes the mean of the middle two |
| *False-accept rate* | `count(card_flag) / count(note_vetting WHERE state='accepted')`, and a second flag on the same *card* is a second row |
| *Time-to-first-review* | `source.submitted_at` to the first `review_log` for a *card* **from that source** — not the first grade of any card |
| Tokens and cost | Taken from the API response and never estimated (`04` §6.1); the price table has an effective date (ADR 0018) |
| All ratios | **Suppressed below twenty vetted notes**, with raw counts shown and a line saying why (`S10`, PRD §4) |

**Nineteen and twenty are a boundary test, and it is the one that will actually catch something.**
The suppression rule is the only branch in `S10` and it is off by default in every naive
implementation.

⚠️ **The clock is where these tests earn their place.** *Time-to-first-review* needs the submit
instant and the first grade instant on the same clock, and `03` §8.2 makes the grade instant
**client-stamped**. A grade replayed with a wrong clock is rejected and surfaced, so the number has a
validated input rather than a trusted one — and *that* rejection is assertable, precisely.

## What replaces the assertion

**The numbers are an output of v1, not a gate on merging** (`S10`: "the loop is not complete until
these are emitted — they are the output of v1, not reporting added to it"). So:

- The suite asserts the arithmetic and the recording.
- The **app** reports the values, on `/stats`, which is the screen that exists for it.
- ⚠️ **The first real run of twenty notes is an experiment with a written-down expectation**, on the
  first-week list beside the `noScripts` smoke test and the `psycopg.connect()` probe — not a test
  case. If the median comes back at eleven seconds, that is the project learning something, and a red
  suite is the wrong way to be told.

## Alternatives considered

**Assert the threshold, marked as a known-failing test until real data exists** — rejected. A test
that is expected to fail is ignored within a week, and it would be ignored on the day it started
failing for a real reason.

**Assert a loose threshold — median under 30 seconds — as a smoke test** — genuinely tempting,
because it would catch a *seconds-per-note* of 400 caused by a stamping bug. Rejected because the
stamping bug is caught directly and precisely by the recording tests above, and a loose threshold on
synthetic data catches nothing the precise test misses.

**Benchmark the vetting keystroke path for latency instead** — rejected as a different measurement
wearing `S3`'s name. `S3` measures the reader's decision time, not the interface's response time. If
the interface ever becomes the bottleneck the four numbers will say so.

## What it costs

**The suite cannot tell you the thesis is failing.** That is the honest position and it is worth
stating plainly: green tests on this project mean the instrument is built correctly, and say nothing
about what it will read. `docs/01-project-brief.md` §5 is answered by `/stats`, by a person, after
twenty notes.

## Revisit if

Real numbers exist and stabilise — at which point a **regression** assertion becomes meaningful,
because there is a measured baseline to regress from. That is a different assertion from the one
refused here: "not materially worse than the last fifty runs" is a fact about the code; "under five
seconds" is a fact about the reader.
