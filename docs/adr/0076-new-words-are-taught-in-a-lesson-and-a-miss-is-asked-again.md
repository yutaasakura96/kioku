# New words are taught in a lesson, and a miss is asked again

**Review becomes the quiz the prototype shows. A new word is taught in a short lesson before it is
ever asked, the quiz asks the meaning and then the reading, a wrong answer comes back in the same
*session* until it is right, and a near miss in a meaning is accepted without the reader's say. The
scheduler does not change.** Decided by Yuta on 2026-10-10
([#67](https://github.com/yutaasakura96/kioku/issues/67), answers 2, 3, 4, 5 and 10 of the prototype
review) and stated as rules on [#70](https://github.com/yutaasakura96/kioku/issues/70). This ADR is
the record of those rules and of what #70 settled to build them. The reference for how each screen
reads is [`docs/prototype/`](../prototype/).

## What changed, and why

Until now a new *card* arrived in the second half of a *session* and the reader was asked to type the
reading of a word nobody had shown them. That was survivable while every word was one the reader had
chosen. With a starter set of 8,273 words they did not choose (ADR 0075), the first question about
each would be a guess. The prototype put a lesson in front of the quiz, and Yuta kept it.

## What this overturns

| Earlier decision | What becomes of it |
| --- | --- |
| [ADR 0060](0060-review-is-answered-by-typing-and-the-check-proposes-the-grade.md) §2: the reading, then the meaning | **Reversed.** The meaning, then the reading (§3) |
| ADR 0060 §5: edit distance 0 up to 3 characters, 1 for 4 to 7, 2 from 8 | **Tightened** to the prototype's: exact under 5, 1 for 5 to 8, 2 from 9 (§5) |
| [ADR 0069](0069-the-check-is-the-grade.md) §2: a refused meaning can be added as a synonym | **Removed.** There is no manual override. The synonyms already stored are still accepted (§5) |
| `S7`, and [ADR 0016](0016-four-grades-and-no-same-day-relearning.md)'s *a graded card leaves the session and never returns* | A missed word is asked again in the same *session*. It is still **graded once**, so the half of ADR 0016 that is about the record stands (§4) |
| `S7`: a *session* is due *cards* first, new *cards* filling the remainder | **Two kinds of *session*.** A review run holds due *cards* only. New words arrive only through a lesson (§1) |
| [ADR 0066](0066-the-review-load-has-a-brake.md) §1 and §2: ten a day and fifty due are constants and not knobs | **Both are settings**, with the lesson's size beside them (§2). ADR 0066 §3 to §7 stand |
| [ADR 0064](0064-a-chosen-word-mints-its-cards-on-arrival.md) §1, as ADR 0075 §4 left it: nothing mints a starter word | **A lesson does** (§1) |
| ADR 0026, ADR 0032: a *mode*'s one way out is Done, and leaving mid-*session* is a pause | The quiz's way out is **Finish early**, which ends the run and shows the summary (§6). Leaving a lesson before its quiz is still a pause |
| `10` §5.2: the *progress rail* is *Review*'s header | The header is the prototype's bar: a name, one track, a count of words, the exit. The rail's ticks go |
| `05` §2: no colour means *right* or *wrong* | Two colours are added for exactly that, each beside a word that says the same thing (§8) |

Not overturned, and relied on: FSRS as configured (ADR 0016's `enable_short_term: false`), the check
as the *grade* with only Good and Forgot (ADR 0069 §1), the kana-only rule (ADR 0069 §4), the one
kanji-reading retry (ADR 0069 §5), the accepted-meanings list (ADR 0069 §3), `X` to flag a bad
*card* (`S9`), the outbox and its stamp (ADR 0007, ADR 0039), the snapshot (PRD §5), and counting the
day's allowance from what was offered (ADR 0066 §3).

## What is decided

### §1 — A *session* is a lesson or a review run, and a lesson is where a word starts

`review_session.kind` is `'review'` or `'lesson'` (migration `0013`, additive).

- **A review run is due *cards* only**, least likely to be remembered first when not all of them fit
  (ADR 0066 §5), up to the *session* size.
- **A lesson is new words only**, up to the lesson size. It teaches each word on one screen — the
  word, its reading, its meaning, its part of speech and *level*, and its example when the *note* has
  one — and then quizzes the same words.
- **Which words.** First the reader's own *cards* that have never been scheduled, oldest first: a
  word they brought is taught like any other. Then starter words they have not started, **easiest
  *level* first**, and inside a *level* in a fixed shuffle (`md5` of the *note* id). The list's own
  order is alphabetical by reading, and fifty words in a row beginning with あ are easy to confuse.
- **Starting a starter word is its acceptance.** The lesson writes `note_vetting` at `accepted` and
  mints through `mint_cards`, in the transaction that composes the run: the same two writes the
  worker makes for a chosen word (ADR 0064, ADR 0067). From then the *note* is frozen for this
  reader (ADR 0052), which is what stops a starter refresh rewriting a word under someone studying
  it.
- **The lesson's quiz gives the word its first *grade***, and with it its first *scheduling epoch*.
  Right first try is Good; a miss is Forgot. A word the reader does not get right in the quiz is not
  graded, has no epoch, and is taught again in the next lesson: *get a word right and it enters your
  reviews*.
- **Until #69 there is no active *category***, so the pool is every *level* in order. The *session*
  filter (ADR 0065 §5) narrows it and stays where it was, on the screen before a run starts.
  ⚠️ **#69 is built (2026-10-14, [ADR 0077](0077-the-reader-has-one-active-category.md))**: the pool is the
  reader's active *category*, the filter is gone, and the two orders above hold inside it.

⚠️ **The prototype says the first review is in four hours.** That is sample text from a scheduler
this app does not run. With short-term scheduling off, a word graded Good comes back in about three
days and one graded Forgot tomorrow, and the summary says the real date.

### §2 — Three settings, on a *place*

`/settings` is a fourth *place*: a form, no JavaScript, post-redirect-get. One row per reader in
`study_setting`.

| Setting | Default | Range |
| --- | --- | --- |
| New words per lesson | 5 | 1 to 20 |
| New words a day | 10 | 0 to 100 |
| No new words while this many reviews wait | 50 | 1 to 2,000 |

A value out of range is clamped, as the *session*-size knob clamps. Zero new words a day is allowed:
it is how a reader stops new words without touching anything else.

⚠️ **ADR 0066 §1 argued against exactly this**, on the ground that a knob is set by the reader who is
feeling keen. Yuta's answer on the prototype is that both are adjustable. What ADR 0066 was guarding
is kept by the defaults and by §3 of that ADR: the count is still of what was offered.

### §3 — The quiz asks the meaning, then the reading, one answer at a time

For each word, the meaning and then the reading, back to back. A word written only in kana asks the
meaning alone (ADR 0069 §4). Each answer is checked when it is given and the result is shown before
the next question: *Correct*, or *Not quite* with the answer.

### §4 — A miss is asked again until it is right, and the word is graded once

- A wrong answer sends **that question** to the back of the queue. It returns before the run ends,
  as often as it takes.
- **The word's *grade* is given when every question about it has been answered right**: Good if none
  was missed, Forgot if any was. One *grade* per word per *session*, one `review_log` row, stamped at
  the answer that completed the word. This is ADR 0069 §1's rule with a queue in front of it.
- **A graded word is still a position that is answered**, so the snapshot, the outbox, the rail's
  arithmetic and `completed_at` mean what they meant. Asking again is the screen's business and the
  database never sees it.
- **Which questions are still owed, and which words were missed, are kept in `localStorage`** beside
  the snapshot, so a reload does not forgive a miss. On a device that has neither, an unfinished word
  is simply asked again from its first question.

Giving the *grade* at the first miss was the alternative. It makes the miss durable a few seconds
sooner, and it makes the server call a run finished while the reader is still being asked its
questions, so every reader of `completed_at` and every resume would need a second notion of *done*.

### §5 — A near miss in a meaning is right; a reading is exact

- **One edit for an accepted meaning of 5 to 8 letters, two for 9 or more, none under 5**, counted
  after ADR 0060 §5's normalising. These are the prototype's numbers. Four-letter words are where one
  edit most often makes another word (*cold*, *gold*), and nothing can overrule the check now.
- The answer is compared with every accepted meaning: the gloss's pieces, the *note*'s list and the
  reader's stored synonyms (ADR 0069 §3).
- A near miss is marked right and shown the answer: *Close enough*.
- **A reading is one exact string.** The one kanji-reading retry stays (ADR 0069 §5): it is a prompt
  to type again, not a pass.
- **Nothing the reader can press changes a result.** The synonym key, its outbox entry and its
  endpoint are removed. `meaning_synonym` and its rows stay and are still read, so an answer that
  was accepted before is still accepted.
- An answer in the wrong script is not an answer: Japanese in the meaning field, or anything but
  kana in the reading field, is refused with a line saying what is wanted, and nothing is counted.

### §6 — Finish early ends the run

In the quiz the exit is **Finish early**, and `Esc`. It ends the run and shows the summary of what
was answered.

- In a review run, a word that was missed and not yet got right is **graded Forgot** as the run ends:
  *the word still counts as missed*. A word not reached is left due.
- In a lesson, a word not got right is left ungraded and returns in the next lesson.
- It is an outbox entry of its own (`finish`), behind the *grades* it follows, and the server stamps
  `completed_at`. It answers no position.
- **The lesson's teaching screens exit with Leave**, which is a pause: the lesson is resumed.
- An abandoned lesson has still spent its share of the day (ADR 0066 §3, unchanged).

### §7 — A stage is read from the scheduler, and there are three

| Stage | The live epoch's stability |
| --- | --- |
| Learning | under 7 days |
| Familiar | 7 days to under 21 |
| Known | 21 days or more |

Stability is the scheduler's own figure for how long the word lasts, and at the configured retention
it is close to the interval. Twenty-one days is the line Anki draws between young and mature. A word
with no epoch has no stage. ⚠️ **Both thresholds are this ticket's and neither is measured**; they
are two constants in `shared/review/stage.ts`.

The summary says where each word went — *now Learning*, *up to Familiar*, *stays Known*, *down to
Learning* — and when it is back, both from what the server recorded and never from the client's own
arithmetic. An answer that has not reached the server yet says so.
An answer the server refused is shown as not recorded and is excluded from the summary's learned,
missed and right-first-try figures, although the quiz still moves past it.

### §8 — The screens

The lesson, the quiz and the summary are the prototype's. Three things are this ticket's:

- **The screen before a run**, which the prototype puts on Home (#71). Until Home exists, `/review`
  opens on what is waiting — reviews and a lesson, each with its count — and the reader starts one.
  The start block on each *place* links to each directly. ⚠️ **A changed filter asks again without
  taking the screen away**: the offer already drawn stays until the new count arrives, and stays if
  it does not.
- **The summary's lesson is counted through the reader's filter.** The filter stays in the page's
  memory for the next run (ADR 0065 §5), so each *grade*, flag and finish carries it and the offer
  that comes back with the answer that ends a run is counted through it. It is added when an entry
  is sent and never stored with one; an answer with no filter, or one that is not legal, is counted
  unfiltered and never refused. When that filter matches no new word the summary says so, in the
  start screen's words (`No new word matches the filter.`), not that no new words are left.
- **The summary's *What next* waits for the offer that comes back with the answer that ends the
  run.** The offer read when a run is composed or resumed was counted before it was answered and is
  not kept, so a summary whose last answer has not landed draws the way out and no count.
- **Finish early with nothing left is *Next*.** On the result of the run's last answer the exit
  control and `Esc` show the ordinary summary: the run is not marked finished early and no `finish`
  entry is queued.
- **The example sentence is drawn when the *note* has one** (ADR 0075 §7's open point). A starter
  word has none and its lesson screen is shorter. No sentence source is added.
- **Two colours**, `--k-right` and `--k-wrong`, with a tint each, as the prototype has them. Every
  use is beside the word *Correct* or *Not quite*, so neither is the only signal (SC 1.4.1).

### Settled by the build (2026-10-12)

Things #70 had to choose to build §1 to §8, none of which changes a rule above.

- **The start block's links say which run to start**: `/review?start=review` and
  `/review?start=lesson`. The page reads `start` once and takes it out of the address, because a
  lesson spends the day's allowance by being composed (ADR 0066 §3) and a reload on the summary must
  not compose the next one. Opening `/review` without it composes nothing.
- **The start block has a third control**, *Lesson · n new*, beside *Review · n due*. #33's *n new*
  moved there from the Review control, because a review run never holds a new word. It counts the
  next lesson's words, capped by lesson size, today's remaining allowance and available words; it
  reads zero while the review backlog pauses lessons.
- **Six tokens** in `tokens.css`: `--k-right`, `--k-right-tint`, `--k-right-ink`, `--k-wrong`,
  `--k-wrong-tint`, `--k-wrong-ink` (`05` §2). The prototype's stage ramp is not added: nothing draws
  a stage in colour until #71.
- **Two of the prototype's inks are not used**, on measured contrast. Its placeholder (`#b5aa9a`) is
  2.29:1 on the field and the field has no other label on screen, so the placeholder is
  `--k-ink-secondary`; and the meaning band's second line is `--k-ink-value`, because
  `--k-ink-secondary` on the key face is 4.17:1.
- **Zero new words a day has its own sentence** — *New words are switched off in settings.* — rather
  than *You have had today's new words*, which would be false.
- **A run that stopped short says what it left**: words not reached are still due (a review run), or
  will be taught again (a lesson).
- **The flag is a control on the result as well as the `X` key**, because a phone has no `X`.
- **The way out is named for the *place* it goes to.** `/` is called *Home* on the summary, as the
  prototype has it, though the nav still calls it Ingest; #71 puts the dashboard there.
- **A lesson screen shows up to three more of the word's meanings** under the first, because the quiz
  accepts any of them.
- **`Enter` checks through the form's own submission**, and the container refuses the `Enter` a
  system IME uses to finish a conversion (ADR 0060 §7, unchanged in effect).
- **A reload on the summary of a finished run opens the screen before a run.** The summary is held
  in the browser store only until the server has answered that nothing is live. With answers still
  unsent and no network, the summary stays.
- **`study_setting` is not in `S12`'s export**, whose scope is named in `02` and does not include
  settings.
- **The *session*-size knob caps a review run only.** A lesson's size is its own setting.
- **The summary's three figures are the height the prototype's stylesheet asks for, not the height
  it draws.** Its `.tally div` rule also matches the two `div`s inside each figure, so the padding
  is applied twice and *Right first try* wraps onto three lines in the phone frame. The app's
  figures take the padding once.
- **A kana-only word is drawn once.** Its reading is the word (ADR 0069 §4), so the lesson and the
  summary row leave the second line out.
- **The lesson's footnote counts in figures** (*after all 5*), because the size is a setting.

## Alternatives considered

- **Keep one kind of *session* and teach inside it.** A lesson then has no size of its own, and the
  quiz would mix words the reader was just shown with words they last saw a month ago.
- **Give a lesson word an epoch without a *grade***, due at once. It needs an epoch with no
  `review_log` row behind it, which is the state `04` §7.4 says cannot exist.
- **Do not count a lesson-quiz miss.** WaniKani does not. But then the first *grade* of every word is
  Good by construction, and the first row of its history says nothing.
- **Turn short-term scheduling on**, so a miss is re-scheduled minutes later by FSRS itself. That
  reopens ADR 0016 whole, and the owner's answer was to keep the scheduler.
- **Add a sentence source for the lesson** (Tatoeba). A second licence and a matching problem, for a
  line the lesson works without.

## Revisit if

- **The stages feel wrong** — a word called Known that the reader keeps missing. Move the two
  constants, or read retrievability instead.
- **A lesson-quiz miss turns out to be mostly typing**, so new words start at Forgot unfairly. Not
  counting a miss in a lesson is one branch.
- **The reader wants a missed review word back sooner than tomorrow.** That is ADR 0016's question.
- ~~**#69 builds the active *category*.** The lesson's pool takes it, and the filter on the start
  screen goes.~~ ⚠️ **Done 2026-10-14** ([ADR 0077](0077-the-reader-has-one-active-category.md)). §8's two
  bullets about counting through the reader's filter are superseded with it: the count is of the
  active *category*, which the server reads, and an answer carries nothing about the next lesson.
  The sentence for a *category* with nothing left is *There are no new words left in JLPT N5.*
- ~~**#71 builds Home.** The screen before a run moves there.~~ ⚠️ **Done 2026-10-14**
  ([ADR 0078](0078-home-is-the-landing-place-and-more-holds-the-rest.md)): Home's *Reviews* and
  *Lessons* cards start a run with `?start=`. `/review` opened bare still draws its screen, without
  the *category* line, which moved to Home.
