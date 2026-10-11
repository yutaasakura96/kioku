# The words are ready-made, a level comes from a list, and the corpus starts again

**Kioku becomes a ready-to-study flashcard app. Its words come first from a starter JLPT set built
from open data — JMdict for the word, its reading, its meanings and its part of speech, and
Jonathan Waller's JLPT lists for the level — and second from what the reader brings: an Anki deck or
their own words. A word's *level* is the list's claim, and a model's estimate is no longer read as
one. A word is in one or more *categories*, derived from rows that already exist. The corpus starts
again under a new *subject* id, and nothing is deleted.** Decided by Yuta on 2026-10-10
([#67](https://github.com/yutaasakura96/kioku/issues/67), both decision comments); this ADR is the
record of that decision and of what [#68](https://github.com/yutaasakura96/kioku/issues/68), the
first build step, settled to carry it out.

## What changed, and why

Yuta reviewed the deployed app on 2026-10-10 and found it was not the app he had meant: it was built
around pasting text, having it turned into *notes* and reviewing them, and it was not clear what it
was for. What he wanted is a flashcard quiz in the manner of WaniKani — open it, choose what to
study, and be quizzed on words that are already there, with progress tracked and a level worked out
from results. He also asked why the app writes its own words, meanings and levels when well-known
resources exist.

A clickable prototype of the new direction was built and reviewed the same day, kept as built, and
the twelve product questions under it were answered. The prototype is committed at
[`docs/prototype/`](../prototype/) as the reference for #69 to #72; the answers are on #67.

This is a larger change than the pivot of 2026-09-16 (ADRs 0062 to 0066). That one changed what the
reader typed in. This one changes what the app is for: the deck is no longer something the reader
builds, and `docs/01-project-brief.md` §5's thesis — that building the deck is what stops people —
is answered by not asking them to.

## What this overturns

| Earlier decision | What becomes of it |
| --- | --- |
| The brief's thesis, and [ADR 0001](0001-smallest-loop-is-japanese-end-to-end-and-instrumented.md)'s loop of *paste, generate, study* | The loop is *choose a category, learn, be quizzed*. Pasting stays, tucked away as *Add my own words* |
| [ADR 0063](0063-the-input-is-a-chosen-word-list.md): the input is a word list the reader chose | The first input is the starter set, which nobody types. A word list, pasted prose and an Anki deck are the second |
| [ADR 0065](0065-a-domain-is-a-claim-like-a-level-and-the-filter-only-touches-new-cards.md) §3: every word carries a model-estimated *level* | **Superseded for the *level*.** §2 below. The *domain* half stands until topic categories are built (#69 puts them after the JLPT levels) |
| [ADR 0005](0005-a-level-is-a-set-of-attributed-claims.md): v1 has no *authority*, and precedence is left open | There is one, `tanos-jlpt`, and the declaration's `authorities` list is the precedence. The rest of ADR 0005 is what makes this possible and stands whole |
| [ADR 0064](0064-a-chosen-word-mints-its-cards-on-arrival.md) §1: a word is `accepted` and minted when it is written | True of a word the reader brought. **A starter word is nobody's until they start it** (§4) |
| `02` §3, and the decision log's 2026-09-05 entry: five screens and deliberately no home screen | A home dashboard, a category screen, lessons and a placement test are coming (#69 to #72). Nothing in #68 builds a screen |
| [ADR 0003](0003-a-subject-is-a-declared-schema-and-a-pipeline.md): every field of this *subject* is required | The two example fields are optional (§7) |

Not overturned, and relied on: the *note* and *card* split, the *identity key*
([ADR 0006](0006-note-identity-is-a-declared-key-and-collision-appends-an-occurrence.md)), FSRS and
the brake ([ADR 0066](0066-the-review-load-has-a-brake.md)), the typed check as the *grade*
([ADR 0069](0069-the-check-is-the-grade.md)), provenance per field
([ADR 0004](0004-trust-follows-provenance-not-confidence.md)), the freeze
([ADR 0052](0052-an-accepted-note-is-frozen-against-every-writer-and-any-readers-acceptance-freezes-it.md)),
the export, and the deployment ([ADR 0022](0022-the-first-deployment-is-deliberately-temporary.md)).

## What is decided

### §1 — The corpus starts again under a new *subject* id, and nothing is deleted

Yuta's decision was that existing *cards* and review history start fresh. The *subject* id moves
from `jlpt-vocab` to **`jlpt-vocab-2`** in `subjects/jlpt-vocab.json` (the file keeps its name), and
every reader-facing read is scoped to the current id by three predicates in
`server/utils/subject.ts`.

- **No old row is written to.** The old *notes*, *cards*, *sessions*, flags and `review_log` rows
  stay where they are. `review_log` is append-only by trigger (`04` §9) and could not have been
  removed by an application path anyway.
- **It is reversible by one string.** Putting the id back shows the old corpus again, with the
  starter set invisible instead.
- **Three reads are deliberately not scoped:** the spend ledger on `/stats`, because the money was
  spent; `GET /api/export`, because `S12` is *everything*; and a read by id, so a *source* opened
  directly is still readable (`S11`).
- **A *session* carries no `subject_id`** (`04` §7.6), so its membership says which corpus it was. A
  run left open before the change is not resumed, an answer, flag or synonym sent to it by id is
  refused, and what it introduced does not spend today's allowance.
- **The worker refuses a run of another *subject*.** A run queued before the change would otherwise
  write under the old id with today's declaration, and no screen would show it.
- **Deleting the old rows from production is the owner's step and is not done here.** Nothing
  requires it.

### §2 — A *level* is the list's, and a model's estimate is not one

The declaration gains **`authorities: ["tanos-jlpt"]`**, ordered, highest precedence first. A word's
*level* is the first declared *authority*'s `level_claim`, and a word that *authority* does not
place has no level.

- The starter loader writes one `level_claim` per word with `authority_key = 'tanos-jlpt'` and no
  model.
- The *session* filter's level half, the *Vet* strip and the JLPT *categories* read declared
  *authorities* only (`shared/category/category.ts`, `levelAuthority`).
- **The model is still asked for its estimate, and the row is still written**, for a word the
  dictionary lacks. Nothing reads it as a level. Removing it from the prompt would change
  `PROMPT_VERSION` and every cache key for no reader-visible gain; it is one line to take out when
  the prompt next changes for its own reasons.
- **The JLPT publishes no list** (ADR 0005, verified 2026-09-03). `tanos-jlpt` is an opinion with a
  name on it, which is exactly the thing ADR 0005 built `authority_key` to hold.

### §3 — A *category* is derived, not stored

`shared/category/category.ts` names them and `server/utils/category/queries.ts` asks for them:

- `jlpt:N5` … `jlpt:N1` — the *notes* the *authority* places at that *level*.
- `deck:<source id>` — the *notes* seen in one imported Anki deck that is still live.
- `my-words` — the *notes* seen in any live word list or pasted text.

A word can be in several, and nothing picks one: 会う is `jlpt:N5` from the list and is also in the
deck that taught it. The prototype's two shelves are *JLPT levels* and *My decks*. #69 builds the
screen and the reader's one active category; #68 supplies the keys, the counts and the membership
predicate.

⚠️ **The word was on two `_Avoid_` lists and comes off both.** `CONTEXT.md` refused *category* as a
name for a *subject* and for a *deck*, and it is neither: a *subject* is declared and a *category* is
a set of words inside one. It is close kin to [ADR 0009](0009-a-deck-is-a-saved-query.md)'s *deck*,
which is a saved query over *cards* that owns nothing; a *category* is a query over *notes* that
owns nothing, and it exists before the reader has a single *card*. *My decks* is the prototype's
label for a shelf, and an imported Anki deck is still a *source*.

### §4 — The starter set is shared rows, loaded by a script, and mints nothing

`worker/starter.py` builds `subjects/starter/jlpt-vocab.json` and `scripts/starter/load.ts` loads it
(`npm run starter:build`, `npm run starter:load`). Each word becomes a *note*, its four fields'
*provenance* as `lookup` under the JMdict version, one *level claim*, and its accepted meanings in
`note_meaning`.

- **No *card* is minted.** A starter word is true whoever is asking, and 8,273 *cards* minted for
  every reader on day one would be 8,273 new *cards* against a brake of ten a day. The *card* is
  minted when the reader starts the word, which is the lesson's job (#70). **Until #70, a starter
  word is in the corpus and in its category and cannot be studied.**
- **Repeatable.** A second run of the same bundle writes nothing. A newer bundle adds its new words
  and brings a word nobody has started up to the current entry; **a word a reader has accepted keeps
  its fields** (ADR 0052), and so does a *note* any field of which a model or a person wrote. A list of accepted meanings
  the dictionary wrote gains the new entry's phrases and loses none, so an answer that was accepted
  stays accepted.
- **`dev:session` loads it** into its local database, so the screens #69 to #72 build have words in
  them.
- **Loading production is the owner's step.**

The built set, from JMdict as of 2026-10-09 and the lists at `b062d4e`:

| Level | Words |
| --- | --- |
| N5 | 684 |
| N4 | 640 |
| N3 | 1,730 |
| N2 | 1,811 |
| N1 | 3,408 |
| **All** | **8,273** |

Twenty of the lists' 8,293 rows are not in it: fourteen name a kanji with no JMdict entry number,
four are a word listed again at a harder level, and two are a spelling and reading JMdict does not
have.

### §5 — A word the reader brings is looked up before any model is asked

A new pipeline stage, **`lookup`**, sits after `filter_known` and before `generate` in all three
pipelines. A word the corpus does not hold is looked for in JMdict. Found, its *note* is written from
the dictionary at no cost; only what the dictionary lacks goes to the model.

- **A word on a JLPT list never gets that far.** The starter set is in the corpus, so the word is a
  collision: the reader is handed the *note* that is already there, with its list level.
- **A dictionary *note* makes no claim** about *level* or *domain*. Its *level* is the list's or it
  has none.
- **Entries that share a form are ranked from JMdict's priority tags on that spelling and reading,
  then by the lowest entry number.** This also resolves a tie between common entries such as かける.
  When the reader supplied no reading, a kana term keeps its own reading; otherwise the chosen
  entry's highest-priority applicable reading is used. The reading follows ADR 0045's script rule
  before it becomes the note's key. Priority tags on unrelated forms do not affect either choice
  ([JMdict DTD](https://www.edrdg.org/jmdict/jmdict_dtd_h.html)).
- **A dictionary entry with a blank meaning or part of speech lacks usable content.** It goes to
  generation; an entry with usable content does not.
- **The worker downloads JMdict** to `worker/.cache/`, which is ignored, indexes it in SQLite and
  fetches it again once it is thirty days old. It is never committed. A fetch that fails with no
  copy on disk fails the *chunk*, resumably, and says why.
- `note_meaning` gains `dictionary_version` and a check that a row is attributed to a dictionary or
  to a model and never both (migration `0011`, additive).

### §6 — Three sources, and what each one's licence asks

Checked on 2026-10-10 from each source's own page, before anything was bundled.
[`subjects/starter/NOTICE.md`](../../subjects/starter/NOTICE.md) is the full record.

| Source | Licence | What it asks |
| --- | --- | --- |
| JMdict (EDRDG) | CC BY-SA 4.0 | Acknowledgement with links in the documentation and on the site, and that the data be kept current |
| Jonathan Waller's JLPT lists (tanos.co.uk) | Creative Commons BY | Credit the site |
| `stephenmk/yomitan-jlpt-vocab`, the form the lists were read in | CC BY-SA 4.0 | Attribution and share-alike |

The bundle is adapted from all three and is CC BY-SA 4.0.

⚠️ **`www.tanos.co.uk` did not resolve on 2026-10-10.** Its terms were read from the Internet
Archive's capture of the site's own licence page, dated 2025-11-14. That is the official page as
last seen and not the page as served that day, and it is said here so that nobody reads "verified"
as more than it was.

⚠️ **The lists are pinned by commit and JMdict is not.** EDRDG publishes only today's file and asks
that copies be kept current, so a rebuild is a refresh.

### §7 — A dictionary word has no example sentence, so the example fields are optional

JMdict has none, and no other source was added for them. `example_sentence` and `example_gloss` are
`required: false` in the declaration. The model's output schema still names both as properties, the
*card* draws only the fields a *note* carries, and *Vet*'s fix accepts a blank optional field.

⚠️ **The cost, named:** a model that answers an example with an empty string was refused before
this and passes now, because the validator has no way to say *optional for a dictionary, required of
a model*. The schema asks for the property and the prompt asks for the sentence, and that is all
that holds it.

⚠️ **The prototype's lesson screen shows an example sentence**, and the starter set cannot fill it.
That is #70's to settle: draw the lesson without one, or add a sentence source under its own licence
check. Tatoeba is the obvious candidate and was deliberately not added here, because it was not one
of the two sources #68 named.

### §8 — The acknowledgement is under every *place*

The prototype puts the sentence naming the sources on the Welcome screen, which #71 builds. Until
then it is in the *shell*'s footer, beside the KANJIDIC2 line that has been there since #30, with a
link to each source and each licence.

## Alternatives considered

- **Delete the old corpus.** It is what "start fresh" says most literally. It is also irreversible,
  it would have to defeat the append-only trigger on `review_log`, and the brief for this work
  forbids destroying production data. Scoping the reads gives the reader the same fresh start.
- **Keep one *subject* id and mark the old rows with a cutoff date.** No id change and no fixture
  churn, but every read would carry a timestamp comparison whose meaning nobody would remember, and
  an old word re-ingested after the cutoff would be half old and half new.
- **Store a `category` column on the *note*.** Simpler to read. It would be a second copy of
  `level_claim` and `occurrence`, it could hold only one value where a word is in several, and a
  refresh of the lists would have to rewrite it.
- **Mint every starter *card* at load.** Studyable today without #70, but it puts thousands of new
  *cards* behind a brake of ten a day and orders them by insertion rather than by anything the
  reader chose.
- **Take the level from JMdict's own tags.** JMdict carries no JLPT level.
- **Bundle the raw JMdict file for the worker.** It would put a ten-megabyte file that changes daily
  in the repository and make its currency a commit. A cache that refetches is what the licence asks.
- **Keep the model as the first source for a reader's own words.** That is what #67 and the
  prototype's eleventh answer decided against: meanings should come from a known source.

## Revisit if

- **tanos.co.uk returns with different terms, or stays gone.** The lists are also carried by other
  projects under their own licences; the notice and this ADR are what to change.
- **A second level list is wanted** — a textbook's, say. It is a second key in `authorities` and a
  second loader; the precedence is the order.
- **Topic categories are built** (#69). They need a named source for a word's topic, which is the
  *domain* half of ADR 0065 meeting the same question the *level* half met here.
- **The reader misses the old history.** It is one string away, and nothing was lost.
- **Dictionary misses are common in practice.** `ingest.looked_up` logs how many words each *chunk*
  took from the dictionary; the model's share is the run's spend.
