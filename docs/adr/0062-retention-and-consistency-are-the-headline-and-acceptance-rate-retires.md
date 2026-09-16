# Retention and consistency are the headline, and acceptance rate retires with vetting

**Decided 2026-09-16, from the conversation that changed what the app is for.**
*Acceptance rate* and median *seconds-per-note* are retired. The headline numbers are **retention**
and **consistency**, with **flag rate** as the check on the model's fields. *Time-to-first-review*
survives with a new starting instant, and the token and cost figures are untouched.

This ADR is written first because [ADR 0063](0063-the-input-is-a-chosen-word-list.md),
[ADR 0064](0064-a-chosen-word-mints-its-cards-on-arrival.md) and
[ADR 0066](0066-the-review-load-has-a-brake.md) all hang off it. If the numbers do not move, nothing
below them has a reason to.

## What changed

`docs/01-project-brief.md` §5 made the project falsifiable with one claim: generate-then-vet beats
hand-authoring. *Acceptance rate* measures the generating and *seconds-per-note* measures the
vetting, and [ADR 0001](0001-smallest-loop-is-japanese-end-to-end-and-instrumented.md) made both an
output of the first loop rather than reporting added afterwards.

Yuta then said what he wants the app for, and it is not that. He wants to learn tech and business
vocabulary, he will choose the words himself or have a model seed a list, and he does not want to
look at a queue of proposals. ADR 0063 makes the input a list of chosen words and ADR 0064 takes the
human accept out of the loop. **Both instruments lose their subject at once.** Nothing is proposed,
so nothing is accepted, so there is no accept to count and no keystroke to time.

The first run already said the same thing from the other end. 474 *pending notes* came out of about
3,400 characters, the reader stopped after 39, and *acceptance rate* read **8%**
([ADR 0037](0037-a-measured-criterion-is-reported-not-asserted.md) § Amendment). That 8% is a fact
about how long a person keeps going, not about how good the generation was. A headline number whose
value is set by the reader's patience cannot tell the project anything.

## What is decided

**Retention is the headline.** Of the *grades* given to a *card* that was in the Review state when it
was asked, the share that were Good or Easy, over a trailing 30 days.

- `review_log.rating >= 3` over `count(*)`, filtered to `review_log.state = 2`.
- **State 2 only, and that is the part to get right.** `state` is the state *before* the grade
  (`04` §7.5). A first-ever answer is state 0 and is not retention, because nothing has been
  retained yet. A relearning answer is state 3, and counting it lets one forgotten *card* push the
  number down twice for one act of forgetting. Anki's true-retention table splits on the same line.
- Suppressed under twenty qualifying rows, with the raw pair shown
  ([ADR 0058](0058-a-suppressed-ratio-shows-the-evidence-behind-it-as-a-pair.md)).

**Consistency is the second headline.** Days with at least one *grade* in the last 30, over 30, or
over the days since the first *grade* while that is fewer.

- Not a streak. A streak is zero the morning after one missed day, which is the exact morning the
  number is being read, and a metric that punishes the reader for coming back is the wrong
  instrument for the thing this app is trying to survive.
- Suppressed until there have been fourteen days to have been consistent over.

**Flag rate replaces false-accept rate.** Distinct *cards* with an unresolved or resolved
`card_flag`, over *cards* minted.

- The old denominator was *notes accepted at vetting*, which after ADR 0064 equals every *note*
  there is. Counting minted *cards* says the same thing in the word that still means something.
- **Distinct cards, not rows.** ADR 0037's table counted a second flag on the same *card* as a second
  row, which was correct when the denominator was acceptances and is wrong here: a share of the deck
  cannot exceed one.
- This is now the only routine reading on the model's fills, so it is also the instrument
  [ADR 0018](0018-the-model-provider-is-a-boundary-and-acceptance-rate-picks-the-winner.md) has left.
- Suppressed under twenty minted *cards*.

**Time-to-first-review survives, and its clock starts at the list.** `source.submitted_at` to the
first `review_log` for a *card* from that *source*, unchanged in arithmetic
([ADR 0057](0057-time-to-first-review-is-a-median-over-the-sources-that-have-one.md)). What changes
is that the *source* is now a list of words rather than two pages of prose, and the number no longer
has a vetting queue inside it. **It gets more useful, not less:** it was measuring the reader's
stamina and now it measures the pipeline.

**Tokens and cost are untouched.** They are taken from the API response and never estimated
(`04` §6.1).

**Acceptance rate and seconds-per-note are retired, not demoted.** They are removed from `/stats`
rather than left on it under a smaller heading. A number nobody acts on is a number somebody will
eventually act on by accident.

## What it costs, and this is the real price

ADR 0018 made the model choice a measurement rather than a decision, and its instrument was
*acceptance rate*: walk down from Opus 5 until the rate degrades. **That experiment took an
afternoon.** Flag rate is the same experiment run through a person's review history, and it takes
weeks, because a wrong meaning is found when the *card* comes back and not when it is made.

I am not going to dress that up. The project has traded a fast instrument for a slow one, and it did
so because the fast instrument measured a step the reader no longer performs. What partly pays it
back is that the slow instrument measures something the fast one never did: whether the *card* was
any good a month later, which is `S9`'s question and the one the brief called out as the hard one.

ADR 0018's revisit condition stands. Until flag rate has a reading, the model walk waits.

## Alternatives considered

**Keep acceptance rate as a diagnostic of the fill step.** Tempting, because the pipeline still
generates. Rejected: after ADR 0064 there is no accept event to count, so the rate is 100% by
construction, and a number that is always 100% is decoration.

**Use FSRS's own predicted retention.** `ts-fsrs` will tell you the probability it thinks a *card*
will be recalled. Rejected: that is the scheduler's opinion of itself, and the whole point of
measuring retention is to have something the scheduler did not produce. If the two ever disagree
badly, the measured one is the evidence and the predicted one is the bug.

**A streak, because it is what every other app shows.** Rejected above. WaniKani's pile-up is what
made Yuta quit it, and a streak is the number that makes a pile-up feel like a personal failure.

**Keep seconds-per-note, re-pointed at the typed answer.** Rejected as `S3`'s name on a different
measurement. Time to answer a *card* is interface latency plus recall time, and ADR 0037 already
refused that substitution once.

## Consequences named where they land

- **`S10` changes its list of numbers.** PRD §2 `S10` and §5 are amended with a dated block.
- **`S3` and `S6` lose their criteria**, because both measure vetting. Amended by ADR 0064.
- **ADR 0001's loop is amended**, in that ADR, to the loop this one can measure.
- **ADR 0037 is not superseded.** Its argument was that a measured criterion is reported rather than
  asserted, and that holds for retention exactly as it held for *seconds-per-note*. Its table of what
  the suite asserts is re-pointed at the new numbers.
- **`/stats` is rebuilt rather than edited.** Two of its six figures go, one is redefined, two
  survive, and two arrive. The ticket says so.

## Revisit if

- Flag rate reads above roughly 10% for a month. That is the model failing at the fills, and the
  project needs a faster instrument again rather than a different headline.
- Retention sits above 95% for a month. That is the scheduler being too cautious, and what moves is
  FSRS's request retention, not this ADR.
- A second reader arrives (ADR 0012's condition). Consistency is a single-reader number and would
  need a per-owner denominator, which it already has in the column but not in the story.
