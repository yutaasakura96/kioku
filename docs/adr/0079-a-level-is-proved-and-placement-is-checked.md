# A level is proved, and a placement is checked

**The reader's level is the level they have proved, with progress to the next, and it is labelled a
vocabulary estimate. A three-minute multiple-choice placement test gives the first estimate, marks
the words below it known, and a sample of those comes back in reviews to make sure. After that the
reader's own answers decide, level by level.** Decided by Yuta on 2026-10-10
([#67](https://github.com/yutaasakura96/kioku/issues/67), answers 6, 7 and 8 of the prototype
review) and stated as rules on [#72](https://github.com/yutaasakura96/kioku/issues/72). The
reference for how each screen reads is [`docs/prototype/`](../prototype/).

⚠️ **Every number here is a proposal.** #67 says so of the 80 % and the fifty words, and of the
spot-check's size; the rest are this ticket's. They are constants in one file,
`shared/level/thresholds.ts`, and the tests read them from there.

## What changed, and why

ADR 0078 left the level card on Home with *No estimate yet* over an empty ladder, and no way in to
the placement test. With a starter set of 8,273 words a reader who already knows N5 would otherwise
be taught 684 words they know before reaching anything new.

## What this overturns

| Earlier decision | What becomes of it |
| --- | --- |
| ADR 0078 §1: *Find my level* is not drawn on Welcome | **Drawn**: a link into the test, the primary control |
| ADR 0078 §1: Welcome's *Start at* chooses the *category* and nothing else | **Starting above N5 is a placement**, as the prototype's `start-at` is: *start at N3* claims N4 (§1) |
| ADR 0078 §2: the level card has no estimate | **It has one** (§2, §3) |
| ADR 0078 §3: More has no *Retake the placement test* | **It has**, entering the test with `from=/more` |
| `shared/review/scheduler.ts`'s `freshEpoch`: a *card*'s first epoch belongs to the *grade* that first schedules it | **One exception**: a spot-checked word's first epoch is the placement's (§4) |

Not overturned, and relied on: the review run is due *cards* only (ADR 0076 §1), a word is graded
once a run with Good meaning right first try (ADR 0076 §4, ADR 0069 §1), the stages (ADR 0076 §7),
the active *category* (ADR 0077) and the starter set's *levels* (ADR 0075 §2).

## What is decided

### §1 — The placement test

`/placement` is a third *mode* (`ssr: false`), the prototype's three screens: an introduction, one
word at a time, and the result.

- **Five starter words a level, easiest level first, about twenty-five in all.** Each shows four
  meanings and *I do not know this one*. A meaning is the gloss's first two pieces. A wrong choice
  shares no piece of meaning with the right one (青 and 青い are both *blue; azure*), and is the same
  rough word class where the level has enough.
- **Four of five passes a level, and the test stops early both ways**: a level is left as soon as it
  is passed, and the test ends as soon as one can no longer be. A reader who knows nothing is done in
  two words; one who knows everything in twenty.
- **The placed level is the hardest of an unbroken run of passed levels from N5.** Lessons start at
  the level after it (N1 for N1), and that becomes the active *category*.
- **Nothing is written until *Start at N3* is pressed.** *Pick a different level* goes to
  `/categories` and records nothing, as the prototype's does. The test is not stored: the answers
  come back with the word ids, and **the server scores them again** against the meanings it holds,
  with the same functions the screen used.
- **A reload starts the test again.** It is three minutes, and a test taken in two sittings measures
  less.
- **Welcome's *Already know your level? Start at N3* is a placement too** (`kind = 'declared'`),
  claiming N4. *Start at N5* claims nothing and only chooses the *category*.
- One row per placement in `placement` (migration `0015`, additive). **The newest stands**; a retake
  adds one.

### §2 — The rule

Over the reader's *grades* in the last **30 days**, per level (the starter list's *level*):

| Status | When |
| --- | --- |
| *proved* | **50 or more** distinct words answered, and **80 % or more** of answers right first try |
| *disproved* | 50 or more, and under 80 % |
| *placed* | fewer than 50, and the placement covers the level |
| *open* | neither |

**The reader's level is the hardest *proved* or *placed* level with nothing *disproved* beneath it.**
An *open* level does not break the run: a reader who proves N4 without answering fifty N5 words has
not shown they lack N5. **Results outrank the placement, level by level**, so a placement at N3 that
answers sixty N4 words at 50 % is at N5.

*Right first try* is a *grade* above Forgot. Since ADR 0076 §4 a word is graded once a run, Good when
none of its questions was missed, so a *grade* is the word's first try in that run. The share is of
answers and the fifty are distinct words, so ten words answered ten times are not fifty.

### §3 — What the card says

The prototype's `levelCard`: the level (or –), *working toward N4* (or *top level*), the ladder with
the next level filled as far as the reader is toward it, one sentence, and *How is this worked out?*,
a `<details>` that needs no script. ***Take the 3 minute placement test*** shows while there is no
placement and no level.

- **Progress toward a level is the less complete of its two conditions**, `min(words / 50, share /
  80 %)`, so the bar is full only when both are met. The prototype drew 68 % for a reader right 68 %
  of the time; that reading would put a bar at 100 % for one word answered right.
- **The sentence says what the level rests on and what moves the reader up**: *You get N5 words right
  94 % of the time and N4 words 68 % of the time. Reach 80 % on N4 to move up.*, or *From your
  placement test. It will sharpen as you answer lessons and reviews.*, or *No estimate yet…*.
- ***Progress by level* reads *placed out*** for a level the placement marks known, with the
  prototype's hatched bar, while the placement still stands for it.

### §4 — The spot-check

**The words below the level lessons start at are marked known.** That is a reading of the placement,
not a row per word: nothing is written for the 684 N5 words a placement at N5 covers.

- **Ten of each such level are spot-checked** (`SPOT_CHECKS_PER_LEVEL`), taken in turns across the
  levels, from words the reader has not started, in the lesson's fixed shuffle.
- **Each is accepted and minted as a lesson word is** (`startNotes`), in the placement's
  transaction, and given **a first epoch the placement writes**: Review state, stability 21 days —
  where *Known* begins — the library's difficulty for a first Easy, `reps` 0, last reviewed at the
  placement, and **due two a day from the day after** (`SPOT_CHECKS_PER_DAY`). The first day is the
  reader's first lesson, not a quiz on words they have just been told they know.
- **From there it is an ordinary due *card***: a review run picks it up, the quiz asks it, and the
  scheduler takes it — right first try *stays Known* and comes back in weeks, a miss goes *down to
  Learning* and is learned like any word.
- **A level's spot-checks overrule the placement** once five have been answered
  (`SPOT_CHECKS_DECIDE_AFTER`) and under 80 % of them were right first try: the placement no longer
  covers that level or any above it, and the card says so. Only each word's first answer counts; its
  later ones are about learning it.
- Which words were chosen is `placement_check`, one row per word and placement.

Writing the epoch here is the one place the application schedules a word no *grade* scheduled. It is
the honest reading of the placement: the reader has told us they know the word, and the check is the
review that tests it. The alternative that kept `freshEpoch`'s rule — mint the word new and let its
first Good start it at *Learning* — would turn every right spot-check into a word being learned.

## Settled by the build (2026-10-15)

- **The test's words are random on every call**, `ORDER BY random()`, so a retake is a different
  test; the forty words beside each level's five are where the wrong choices come from.
- **The screen is sent the right choice** with each question, to walk the test. The server never
  reads it back.
- **`placement_check` names a *note*, not a *card*.** The reader's *card* for it is found by owner and
  *note*, as everything else in the schema is, and a reference to `card` would be one more `RESTRICT`
  in `S11`'s way for a row that is a label.
- **Not exported.** `S12`'s scope is *notes*, *cards*, *grades* and epochs, and the spot-checked
  words' *cards* and epochs are among them; the placement rows are out by name, as `study_setting` is.

## Alternatives considered

- **A row per placed-out word, or a *card* for each.** Up to 7,600 *cards* for a placement at N1,
  each due someday, and *Progress by level* would count 684 words as learned that nobody had shown
  the reader.
- **Leave placed-out words out of lessons.** A reader who later chooses N5 on `/categories` asked for
  N5; lessons there teach it, minus the words already spot-checked.
- **Spot-checks outside the review run**, as a fourth kind of position the quiz knows. Every piece of
  the outbox, the snapshot and the grade path would learn a new kind for a question the review run
  already asks.
- **Score the test on the client and trust it.** One reader, but the level written would then be
  whatever a stale tab said.
- **A timer.** *About three minutes* is a description of twenty-five words; a clock would make *I do
  not know* a race.

## Revisit if

- **The estimate disagrees with how the reader feels about a level** — the thresholds are proposals,
  and each is one line.
- **Spot-checks feel like too many or too few**, or arrive in a lump: `SPOT_CHECKS_PER_LEVEL` and
  `SPOT_CHECKS_PER_DAY`.
- **A level's starter words are too few for five questions and forty choices** — today the smallest,
  N4, has 640.
- **A second *subject*** has levels that are not ordered from easy to hard.
