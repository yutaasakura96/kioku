# The reader has one active category, and it feeds new words only

**New words come from one *category* at a time. The reader chooses it on a screen of its own, the
choice is stored, and a lesson draws from it and from nowhere else. Reviews never read it.** Decided
by Yuta on 2026-10-10 ([#67](https://github.com/yutaasakura96/kioku/issues/67), answers 9 and 11 of
the prototype review) and stated as rules on
[#69](https://github.com/yutaasakura96/kioku/issues/69). This ADR is the record of those rules and
of what #69 settled to build them. The reference for how the screen reads is
[`docs/prototype/`](../prototype/).

## What changed, and why

[ADR 0075](0075-the-words-are-ready-made-and-a-level-comes-from-a-list.md) §3 named the
*categories* and left them unread, and [ADR 0076](0076-new-words-are-taught-in-a-lesson-and-a-miss-is-asked-again.md)
§1 drew a lesson's words from every *level* in order, narrowed by a filter the reader set again on
each visit. The owner's answer on the prototype is that there is one active *category* and it is
changed from Home.

## What this overturns

| Earlier decision | What becomes of it |
| --- | --- |
| [ADR 0065](0065-a-domain-is-a-claim-like-a-level-and-the-filter-only-touches-new-cards.md) §5: a *session* filter of *levels* and *domains*, set on the screen before a run and forgotten on a reload | **Removed.** The active *category* replaces it (§1). §5's rule is kept and is now the *category*'s: it touches new words and never due ones |
| ADR 0065 §6: nothing about what to study next is saved | **A choice is saved**, one per reader (§2). It is still not a *deck* ([ADR 0009](0009-a-deck-is-a-saved-query.md)): it holds a key and no query |
| ADR 0076 §1: the pool is every *level*, easiest first | One *category*. Inside it the order is unchanged: the reader's own unscheduled *cards* first, then words not started, in the fixed shuffle |
| ADR 0076 §8: an answer carries the reader's filter so the summary's lesson is counted through it | An answer carries nothing about the next lesson. The server reads the *category* (§1) |
| `04` §2's note that no table holds a *category* | Still true of a *category*. The reader's choice of one is a row (§2) |

`domain_claim` is still written by the worker and is now read only by *Vet*'s strip. Topic
*categories* are a later ticket and are where a *domain* gets a reader again.

## What is decided

### §1 — A lesson is drawn from the active *category*, and a review run is not

- `newCards` and `unstartedNotes` take a *category* and apply ADR 0075 §3's membership predicate
  (`noteInCategory`). A JLPT *category* is the *notes* the declared *authority* places at that
  *level*; a deck is the *notes* seen in one live Anki *source*; *My words* is those seen in any
  other live *source*.
- **The due read takes no *category***, as it took no filter. What is owed is owed.
- **The server reads the choice.** Composing a lesson, counting the next one for the screen before a
  run and for the summary, and the start block's *Lesson · n new* all read the reader's row. No
  request names a *category* except the one that chooses it, so two tabs cannot disagree about it.
- **The offer names it.** `StudyOffer.category` is the key and the name the count was made in, so
  the screen says which *category* the number is of.
- **A lesson already composed keeps its words** (PRD §5: the snapshot wins). Choosing composes
  nothing and touches no run; the next lesson is the first one drawn from the new choice. A word
  taught and not got right waits in the *category* it came from.
- **A word of the reader's with no *card* is started like a starter word**: the lesson accepts and
  mints it (ADR 0076 §1). Normally there is none, because a chosen word is minted when it arrives
  ([ADR 0064](0064-a-chosen-word-mints-its-cards-on-arrival.md)).

### §2 — One row per reader, holding a key

`active_category (owner_id PRIMARY KEY, category_key, chosen_at)`, migration `0014`, additive.

- **A key and not a reference**: `jlpt:N4`, `deck:<source id>` or `my-words`, as
  `shared/category/category.ts` writes them. A *category* is derived and has no table to point at.
- **No row is the first declared *level*.** Until #72's placement test chooses one, a new reader
  starts at N5. Nothing is written on a read.
- **A row that names nothing is read as no row**: a deck that was deleted, or *My words* with
  nothing left in it. The reader is back at the first *level* rather than in a lesson that can never
  hold a word, and the row is left as it is.
- **Checked against the database when it is written.** A key that names no *category* today changes
  nothing.
- **Not a column on `study_setting`.** That table writes nothing until the reader saves the settings
  form, so its three defaults live in one place (ADR 0076 §2). A row inserted there to hold a
  *category* would freeze them.
- **Not in `S12`'s export**, as `study_setting` is not: the export's scope is named in `02` and does
  not include settings.
- **Not per *subject*.** A `deck:` key from a *subject* the reader left names no live deck of this
  one and falls back; a `jlpt:` key carries over only if the level is still declared.

### §3 — The screen is a fifth *place*, and the choice lands before a run

`/categories` is a *place*: no JavaScript, each row a form with one button, post-redirect-get
through `POST /api/category`.

- **It is the prototype's `vCategories`**: *JLPT levels*, *Topics · coming later* as it was
  reviewed, and *My decks*, where an imported deck and *My words* each have a row. A row is the
  *category*'s code, its name, how many words it has and how many the reader has learned, a bar of
  the three stages (ADR 0076 §7), and one action.
- **The active row has no button.** It says *New words come from here*. Every other row says
  *Study N4* or *Study this*.
- **Learned is graded at least once**: a *card* with a live *scheduling epoch* that has left New,
  not suspended. The bar's shares are of the *category*'s words.
- **Choosing answers `303` to `/review`**, with `from=/categories`. The prototype lands on Home,
  where the lesson is counted and the *category* is named. That screen is `/review`'s screen before
  a run until #71 builds Home (ADR 0076 §8), so the line is there:
  *New words come from **JLPT N4** · Change category*. It replaces the filter's two rows of
  checkboxes. ⚠️ **When #71 builds Home the line moves with the rest of that screen**, and the
  redirect follows it.
- **A key that names no *category* answers `303` back to the shelf** and writes nothing. The way a
  reader sends one is a page drawn before a deck was deleted.
- **`/categories` is in the nav**, second, and in the `from` allowlist. The start block is on it as
  on every *place*.
- ***Import an Anki deck* and *Add my own words* link to `/`**, where both are today.
- **Four tokens**, `--k-st-known`, `--k-st-familiar`, `--k-st-learning` and `--k-st-none`, the
  prototype's stage ramp, which ADR 0076 left out until something drew a stage in colour. The bar is
  never the only signal: the line above it says how many are learned and the bar's label says how
  many are at each stage.

### §4 — A finished *category* says so by name

With no new word left in the active *category* the sentence is *There are no new words left in
JLPT N5.*, on the screen before a run and in the summary's *What next*. ⚠️ It was *There are no new
words left to learn*, which with one *level* finished and seven thousand words a screen away would
be false. The app does not move the reader to the next *category*: the choice is theirs.

## Alternatives considered

- **Keep the filter beside the *category*.** Two controls over the same words, one saved and one
  not, and a *level* ticked in the filter that is not the active one would match nothing. ADR 0076
  already said the filter goes when the *category* arrives.
- **No default: a reader with no row has new words from everywhere**, as before #69. The screen
  would then have no *category* to name, and the sentence on it, that new words come from one
  *category* at a time, would be untrue for exactly the reader reading it first.
- **Send the *category* with each request**, as the filter was sent. It would be page memory again,
  and the start block on a *place*, which has no client, could not count in it.
- **Put the choice on `/settings`.** The prototype gives it a screen of its own and a place in the
  nav, and it is the one decision the reader makes before every stretch of study.
- **Move on to the next *level* when one is finished.** Not asked for, and it would change what the
  reader is studying without their saying so.
- **Wait for #71 to place the line on Home.** The *category* would be chosen on one screen and
  named on none until then.

## Revisit if

- **#71 builds Home.** The line and the redirect move there.
- **#72 builds the placement test.** It writes this row, and the default of N5 is then only for a
  reader who skipped it.
- **Topic *categories* are built.** They are a fourth kind of key, and `domain_claim` or a named
  source behind them.
- **A second *subject* is studied beside this one.** The row is then per *subject*.
- **A reader wants new words from two *categories* at once.** That is the filter's question again,
  asked of a saved choice.
