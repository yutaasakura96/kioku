# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 6 — Build. **Open.** Phases 1–5 are closed; the spec and the route are published.
**69 ADRs** — ⚠️ **ADR 0069, the check is the grade, added 2026-09-21** from the reader's first *session* (this said *68* until then). ⚠️ **#26 added none and amended ADR 0068 in place** (2026-09-20: a deck name
contributes only the words in it that name a level, on the re-measurement that ADR asked #26 for).
⚠️ **This said *67* until 2026-09-20, while ADR 0068 had been on disk and in the decision log since
2026-09-19** — the commit that wrote the ADR updated `CLAUDE.md`'s count and not this one.
⚠️ **#21 added none and amended ADR 0066 in place** (2026-09-18: where the zone is
stored, and four other things the build settled). ⚠️ **#23 added none**, and instead **corrected ADR 0037**, whose amended table
contradicted ADR 0066 about where a day starts. ADR 0067, minting as a database function, added
2026-09-17 with #20; ADR 0062 to ADR 0066, the pivot, all added 2026-09-16; ⚠️ **this said 66 until
2026-09-17, 61 until 2026-09-16 and 58 until 2026-09-12** — eleven documents, and **three open
issues**: #1 the spec, #24 the Anki parent (closable now that #26 has landed) and #25 of the pivot,
`needs-triage` — ⚠️ **amended later the same day: #24 is closed** (both halves done, comment on the
ticket), so the three open are **#1** the spec, **#25**, and **#26**, which is built and merged and
whose last close-out criterion was paid 2026-09-20; it has lost `ready-for-agent` and is Yuta's to
close (⚠️ **this said *five* from 2026-09-18 until 2026-09-20 while naming three** — the
parenthetical that recorded #21 closing was added and the number beside it was not; it said eight
before that day, and it counted #26 from 2026-09-19 until #26 was built). **#17**, the worker's heartbeat window, was built and closed in
`26182de` (ADR 0061), and **#18**, typed answers (ADR 0060), is built and closed. ⚠️ **#14 closed
2026-09-15**: `/stats` was read with real data, which was its closing condition (**#5 closed 2026-09-14 on
the first sign-in**, Yuta's call: the run exercises no part of the door that sign-in did not) — plus **the re-vetting
ticket #13 hands on and nobody has opened yet** (§ Next). ⚠️ **This listed #15 as open and #14 as
closing on merge until 2026-09-14**; #15, #13 and #16 are closed.
**#2 through #23, and #26, are built** (⚠️ **this said "#2 through #23" until #26 was built on
2026-09-20, "#2 through #20, #22 and #23" until #21 was built on 2026-09-18, "#2 through #18" before
that, and "#14" until 2026-09-16**). ⚠️ **The ticket frontier is empty of `ready-for-agent` work
again**: #25 has four open questions in its body and is `needs-triage`, and triaging it is a
conversation rather than an `/implement` (§ Next). ~~The frontier is #21, the review-load brake.~~ What stays unticketed is `S12`'s export, which
issue #1 puts outside milestone 1.

⚠️ **A pivot was decided on 2026-09-16 and everything below this paragraph describes the system it
changes.** The input becomes chosen words rather than mined prose, vetting leaves the loop, every
word carries a *domain* and a *level*, the review load gets a brake, and *acceptance rate* retires.
**Five ADRs, 0062 to 0066, carry it, and the code still does the old thing** — `03`, `04`, `09`, `10`
and `11` describe what is built and are accurate; each ticket amends its own document as it lands.
There is a schema, a door, a *subject* declaration both toolchains read, a reader who can paste two
pages of Japanese and get control back, a worker that wakes up and claims the job, a pipeline that
turns that paste into *pending notes* one *chunk* at a time, a reader who can see one, judge it in a
keystroke, and mint a *card* by doing so — whose fields are frozen by a guard rather than by nobody
having asked — a bounded *session* of those *cards* that ends, a *session* that survives the network,
and, since 2026-09-12, **numbers that get read**: `/stats` computes all six, suppresses the four
ratios under twenty vetted *notes* and says why. ⚠️ **What is left is not code.** ADR 0037 makes
`S3`'s median and `S10`'s ratios answerable by **a person, after twenty *notes***. ⚠️ **Two of the
three first-week experiments were run 2026-09-12 and both changed a document** (§ Next); the third is
`S3`'s run itself, and it is the one no session can do.
~~⚠️ **#5 is still open on the tracker while `00-status.md` records it closed.** Nobody has ever
signed in — there is no Google client, no redirect URI and no `.env`. Whether that closes it is
Yuta's call and it is the one thing this file and the tracker disagree about.~~
⚠️ **Half paid 2026-09-12, and the half that is left is the half only a person can do.** There is now
a **real database** — Neon project `kioku` (`small-hat-90514806`), Postgres 18.6,
`aws-ap-southeast-1`, with all twenty-two tables migrated and `uuidv7()` live — and both `.env` files
are written. What is still missing is the **Google OAuth client**, because creating one is a console
visit with a consent screen, and the **Anthropic key**. [`scripts/first-run.sh`](../scripts/first-run.sh)
walks both in five stages and writes the three values where they belong.
~~⚠️ **Nobody has still ever signed in**, so #5 stays open. It closes on the run, not on this paragraph.~~
⚠️ **Paid 2026-09-13: the first sign-in happened.** `first-run.sh` ran, all three values are written
and each was checked live, and the invited address is signed in — after one hand-seeded
`auth."user"` row, because `disableSignUp` refused it too (§ Done, § Carrying). **What is left is
the run**, and it opens with Part 1 of `docs/first-run-expectation.md`, not with Japanese.
⚠️ **Run 2026-09-14 and stopped 2026-09-15 before any review** (§ Done). `S3` holds at 1.76 s. What
comes next is **typed answers**, which the reader named as what he was aiming for. The decision is
made, in **ADR 0060** (2026-09-15, Yuta's four answers): it replaces self-grading, is one *card* with two
steps, the check proposes the *grade* and the digits overrule it, and the meaning match is lenient.
~~**The next command is `/implement 18`, in a fresh window.**~~
⚠️ **#18 built 2026-09-15.** `/review` is answered by typing. `shared/review/answer.ts` does the
check and `app/components/ReviewAnswer.vue` holds the two fields. `Enter` commits the proposal,
`1`–`4` overrule it, and `X` works on the back only. `wanakana` 5.3.1 is the eighth pin (`03` §13.5).
**One thing the build found and ADR 0060 now carries:** the fold is `toHiragana` with
`convertLongVowelMark: false`. With the default, every katakana word with a `ー` would have been
marked wrong.
⚠️ **2026-09-16: the pivot is decided and written (§ Next, ADRs 0062–0066, issues #19–#25).** Yuta
said what he wants the app for, and it moved the input, the vetting step and the headline metric.
**What is left for him is still the reader's run**: a *session* of the 39 *cards* already minted,
which gives *time-to-first-review* its first real reading. Nothing in the pivot needs that run first,
and the run is the only thing no session can do for him.
⚠️ **2026-09-18: #23 is built and the numbers that measure the run have changed under it.**
*Acceptance rate* and *seconds-per-note* are gone from the screen and from the code; retention,
consistency and flag rate are what `/stats` now reads. ⚠️ **All three need *reviews*, and there have
been none** — so the run is worth more than it was this morning, and it is still the only thing no
session can do for him. ⚠️ **And migrations `0003` and `0004` are still unapplied to Neon**, which
blocks the run before any of this matters.
⚠️ **2026-09-18, later: #21 is built — the brake, and the reader's zone.** Ten new *cards* a day,
none at fifty due, a backlog by retrievability, and `/stats` now counts *consistency*'s day in the
zone the newest *session* stored. ⚠️ **Migration `0005_review_brake` joins `0003` and `0004` as
unapplied to Neon**, and all three block the run.
⚠️ **2026-09-19: all six migrations are applied to Neon, and the run is unblocked.** `0003` had
already been applied on 2026-09-16 — its hash was in `drizzle.__drizzle_migrations` — so the three
lines above that called it unapplied were wrong from the day they were written; nobody had checked
the database. `0004` and `0005` were applied 2026-09-19 with `npm run db:migrate` and verified
against the migrations table, `domain_claim`, `review_session.new_count`/`zone` and the
`review_session_new_count` check. ⚠️ **Check the database before writing that it is behind.**
⚠️ **2026-09-20: #26 is built — an Anki `.apkg` is unpacked by the app into a word list.** The
reader is `node:zlib` plus `node:sqlite` and adds no dependency; the three layouts are covered by
generated fixtures and one that real Anki wrote. ⚠️ **The re-measurement ADR 0068 §3 asked for moved
a decision**: a deck name carried whole was the largest column in all four real decks and put two of
them over `S2`'s cap, so only the words in it that name a level now travel (ADR 0068 § Amended
2026-09-20). ~~**Yuta has not reviewed that narrowing.**~~ **Reviewed and kept, 2026-09-20** — the
words dropped are constant across a deck, so they distinguish no word from any other, and the two
alternatives were raising `S2`'s cap or dropping the deck name entirely (research §2.4 rules the
second out: one sampled deck encodes its levels as subdecks and its tags say something else).
⚠️ **And #26's `/tmp` close-out criterion is paid the same day, from the docs** (§ Next).
⚠️ **What is left for him is still the reader's run**, and now also a first real import.

**Updated:** 2026-09-21

Read `CLAUDE.md` first, then this.

## Done

**2026-09-21, latest — #30: a kanji's reading typed for the word's is a retry** (ADR 0069 §5 and
its § Settled by the build of §5; `docs/kanjidic-research.md`).
- **The data.** `server/data/kanjidic/readings.json`, 12,356 kanji, from KANJIDIC2
  `database_version` **2026-264** (created 2026-09-21), by `node scripts/kanjidic.ts`: `ja_on`
  folded to hiragana, `ja_kun` with `-` stripped and the `.` okurigana kept, nothing else.
  `NOTICE.md` beside it carries CC BY-SA 4.0 for that file alone. The *shell* carries the EDRDG
  line (`PlaceShell.vue`, `10` §3).
- **The rule.** `kanjiReadingCandidates` in `shared/review/kanji.ts`, pure, with the table as a
  parameter: stems and whole forms for a term with no kana, stems plus the term's kana otherwise,
  combinations with rendaku and sokuon for compounds; the word's own reading removed; nothing for an
  unknown character or past 1,024 candidates. `readingResult` in `answer.ts` returns right, kanji or
  wrong.
- **Where.** `snapshotOf` computes `kanjiReadings` per position through
  `server/utils/review/kanji.ts`. **Checked in the build output**: the table is in
  `.output/server` and nowhere in `.output/public`.
- **The screen.** One retry per step: the field empties and keeps focus, and `The word's reading,
  not the kanji's` sits under it. A second kanji reading is `WRONG`. Nothing is recorded.
- Tests: unit (the three classes on a hand-written table, the みえる trap, the known compound
  costs, the cap, `readingResult`, a held snapshot without the field), nuxt (retry, second try,
  the next *card*'s own retry, the *shell*'s EDRDG line), schema (夢 gets む from the real table), e2e (夢 typed `mu`, then
  `yume`, graded Good). `10` §3 and §5.4, ADR 0069 and `06` amended.

**2026-09-21, later — #28: the check is the *grade*** (ADR 0069 §1–§3, § Settled by the build).
- **The *grade*.** `gradeOf` (was `proposedGrade`) is typed `1 | 3` and is what `Enter` commits;
  the key map has no digits, and `GradeControls.vue` became `CheckControls.vue` — a commit control
  named for the *grade* and, after a refused meaning, `S` — add as synonym. The tally shows Forgot and
  Good, and Hard or Easy only when a pre-#28 run holds one.
- **Accepted meanings.** `note_meaning` (`04` §5.8), written by `generate` at `PROMPT_VERSION` **v5**
  and by `worker/backfill.py`. `meaningMatches` takes the gloss's pieces, the list and the synonyms
  under ADR 0060 §5's unchanged fold and distance; 見る/look passes.
- **Synonyms.** `meaning_synonym` (`04` §7.9), a third outbox entry kind and
  `/api/review/synonym`. The held snapshot takes the synonym at once (`withSynonym`), so a reload
  keeps it and the re-check has it. `synonymCount` is the revisit signal; not on `/stats`.
- **Migration `0006`**, generated by drizzle-kit, applied to Neon the same day.
- **The backfill ran**: 475 lists for $0.1654 (§ Next, including why 見る still lacks *look*).
- Tests: unit (the check, the key map, the outbox's third kind, the snapshot, the request), nuxt (the
  controls; the page's synonym flow and replay order), schema (the two tables and the synonym path),
  e2e (a digit on the back is inert; 見る/look → `S` → `3` and a `meaning_synonym` row), worker
  (`generate`'s list, a response without it, the backfill's resume). `03`, `04`, `09`, `10`,
  `CONTEXT.md` and ADR 0069 amended.

**2026-09-21 — #27: a kana-only *term* skips the reading step** (ADR 0069 §4).
- `answerSteps(term)` in `shared/review/answer.ts` is the one place that decides, on wanakana's
  `isKana` over the stored *term*. ⚠️ **Measured against wanakana 5.3.1 the same day**: こんな and
  コーヒー are kana (`ー` counts), 見る and 夢 are not, and **the empty string is not** — so a *note*
  with no *term* keeps both steps rather than losing one silently.
- `proposedGrade`'s `reading` is now `boolean | null`, and `null` means *not asked*: a kana-only
  *card* proposes from its meaning alone. The page passes `null` rather than a made-up `true`, so the
  rule stays out of the component (ADR 0060 §6).
- `/review` opens a kana-only *card* on the meaning field with no reading row on either face.
  `resetAnswer` reads the first step from the current *card*; ⚠️ it also runs before the next *card*
  is current, and the `cardId` watcher runs it again before the render, which is what makes that safe.
  The key handler stays on the mode container; nothing about keys changed.
- Tests: unit (the four terms, and the null-reading proposal), nuxt (`ReviewAnswer` without its
  reading row), and an e2e case **last** in `test/e2e/review.test.ts`, so it composes a run of the
  one kana *card*. `10` §5.4 and §5.5 carry dated amendments.
- ⚠️ **#28 will change `proposedGrade` again** (the check becomes the *grade*); the `null` reading is
  the shape it inherits.

**2026-09-20, later — #26's close-out: the narrowing is approved and the `/tmp` question is
answered.** Two things, neither of them code.

- **The deck-name narrowing stands, and it is Yuta's call rather than the build's.** He was given
  the two alternatives — carry the name whole and raise `S2`'s cap, or drop the deck name and rely
  on tags — and kept the narrowing. The cap limits spend (ADR 0068 § Alternatives), and research
  §2.4 rules the second out: a sampled deck encodes its levels as *subdecks* and keeps its tags for
  something else, so there the name is the only level signal there is. #26's checklist described the
  old behaviour and is corrected on the ticket.
- ⚠️ **ADR 0068 §2's `/tmp` question is answered from the docs, and the finding is where it was
  looked for.** §2 wrote *"the docs pages checked (Functions Limits, Node.js versions) do not say"*
  and set a deployment as the close-out. The answer was on a third page all along — **Functions →
  Runtimes**, in a table row under *File system support*: *"Vercel functions have a read-only
  filesystem with writable /tmp scratch space up to 500 MB."* The two pages §2 checked were re-read
  and are still silent: zero matches for `/tmp`, `read-only` or `ephemeral` in either. The other
  half is Node's own documented order — `TMPDIR`, then `TMP`, then `TEMP`, then `/tmp` — and none of
  the three is in Vercel's **system** or **reserved** environment-variable lists (zero matches,
  both re-read the same day). **So `engines` keeps `^22.19.0`, `deserialize()` stays out, and the
  criterion's *stop and amend the ADR* branch does not fire.**
- ⚠️ **What is not settled is what only a deployment can say, and there is no deployment.** No
  `.vercel/`, no `vercel.json`, no Vercel project — this app has never been deployed, which is
  itself worth knowing. Two documented facts composed is weaker evidence than one write, so the
  first deployment carries the observation. ADR 0068 § Revisit now names the failure that reopens
  it (`EACCES`, `EROFS` or `ENOENT` out of `mkdtempSync`) and the fix that answers it
  (`deserialize()`, `engines` to `>=24.16.0`) — **not** a retry, another directory, or Vercel Blob.
- **Written down in five places, in one commit**: ADR 0068 (§2, a new § Amended block, § Revisit),
  `06`'s index line, this file (§ Next, § Carrying, here), and the doc comment on `readCollection`.
  ⚠️ **[#24](https://github.com/yutaasakura96/kioku/issues/24) is closed** — research and build both
  done — and **#26 has lost `ready-for-agent`**; it is built, merged and Yuta's to close.

**2026-09-20 — [#26](https://github.com/yutaasakura96/kioku/issues/26) is built: an Anki `.apkg` is
unpacked by the app into a word list that feeds `generate`.** ADR 0068 in full, with a dated
amendment block for the one thing the re-measurement changed. No new ADR.

- **The reader is three modules and no new dependency** (ADR 0068 §2).
  [`server/utils/ingest/anki/zip.ts`](../server/utils/ingest/anki/zip.ts) reads the central directory
  over `node:zlib`'s `inflateRawSync`;
  [`collection.ts`](../server/utils/ingest/anki/collection.ts) decodes `meta` as a **protobuf
  varint**, decompresses `LATEST` with `zlib.zstdDecompressSync`, and reads the collection through
  `node:sqlite` from a temp file deleted in a `finally`;
  [`unpack.ts`](../server/utils/ingest/anki/unpack.ts) orchestrates and names every refusal.
  ⚠️ **`package.json` is untouched.**
- **The pure half is [`shared/ingest/anki/line.ts`](../shared/ingest/anki/line.ts)** — HTML, Anki's
  two furigana filters, the term cleanup, the reading and the hint. `11` §8's seam rule applied to a
  new reader: the part that can be wrong without anyone noticing is the part with no I/O in it.
- ⚠️ **The detection order is `meta`, then `collection.anki21`, then `collection.anki2`, and it is
  tested by name.** Every export writes a dummy `collection.anki2` saying to update Anki; a reader
  that opens it first reports a one-note deck with no error. **Sabotaged**: putting `collection.anki2`
  first reddens twelve tests including *never reports the dummy*.
- ⚠️ **`fields` is joined to `notetypes`, and the join was not load-bearing until the fixture was
  sharpened.** Dropping the join left the suite green, because the reader keys names by `ntid` and
  looks them up by the note's `mid`. The fixture now carries a note whose notetype row was deleted
  and whose `fields` rows were not — which is what the exporter actually leaves behind — and dropping
  the join then hands that note a deleted notetype's field names. **Sabotaged to red.**
- ⚠️ **`COLLATE unicase` is reproduced in the generated fixture**, through
  `PRAGMA writable_schema` — `node:sqlite` has no `createCollation` and `CREATE TABLE … COLLATE
  unicase` fails outright (measured, Node 24.11). So the fixture is a real test of ADR 0068 §2's
  constraint: **sabotaged**, an `ORDER BY name` on `decks` reddens nine tests with
  `no such collation sequence`.
- ⚠️ **`meta` is a varint and not `meta[1]`** — research §4.3 flagged its own sketch for this.
  **Sabotaged to red** on a two-byte version.
- **Fixtures are generated in all three layouts** by
  [`test/unit/anki-deck.ts`](../test/unit/anki-deck.ts) — a stored-entry zip writer over
  `zlib.crc32`, `zstdCompressSync`, and the schema 11 and 18 DDL subsets research §2.1 names.
  ⚠️ **Nothing from a real deck is committed** (research §3.3, §6).
- ⚠️ **And one committed fixture that real Anki wrote**,
  `test/fixtures/anki/real-latest.apkg`, four invented notes out of the `anki` 26.09.2 wheel in a
  throwaway venv. It exists because the generated fixtures are written with the same three built-ins
  the reader reads with, so a shared misunderstanding of the format would pass both ways.
  **It gives byte-for-byte the same three lines as the helper's `LATEST`.** The wheel is **not** in
  `worker/pyproject.toml` (24 MB, AGPL, and nothing in the product needs it).
- **The line is `term⇥reading⇥hint`** and `normalise` reads column 1 as the term **for every kind**.
  ⚠️ **That is a change for word lists**: a tabbed line used to reach the tokeniser whole and be kept
  whole, and now resolves to its first column. One rule on both paths is what stops them disagreeing
  about what a line is.
- **`generate` carries `deck_reading` and `deck_hint`** on the word's line with a paragraph saying
  they are hints and that the dictionary's reading stands. ⚠️ **`PROMPT_VERSION` is `v4`** — the text
  is identical for every `prose` and `word_list` chunk, and the version moves anyway because the rule
  is *any change to `build_prompt` bumps it*. The cost is that the stored v3 answers are never asked
  for again.
- **`subjects/jlpt-vocab.json` declares `anki`**, `unpack` joins `chunk` in `STAGES_RUN_ELSEWHERE`,
  and adding `anki` to `SUBMITTABLE_SOURCE_KINDS` is what made both validators demand the pipeline —
  by name, in both languages, with the drift test comparing them.
- ⚠️ **The re-measurement moved a decision, and it is ADR 0068's own § Amended 2026-09-20.** Carried
  whole, the deck name was the **largest** column in all four real decks (43,171–62,077 code points,
  more than term and reading together) and put the N3 and N1 decks **over `S2`'s cap**. A deck name
  now contributes only the words in it that name a level. All four then fit, at 54,318–76,984.
  ⚠️ **Yuta has not seen this change yet**, and it narrows a sentence he read in ADR 0068 §3.
- **`/code-review` found five things and all five are fixed.** ⚠️ **Three were documents this commit
  owed and had not paid**: `10` §6.2 still described two radios and `accept=".txt"`, `11` §5's
  *source of an undeclared kind* row still said `anki` was the undeclared one, and `11` §1's unit
  tier still said *Database: none* where the reader now builds a SQLite file in `os.tmpdir()`.
  ⚠️ **One was this repository's own standing rule, broken in the file that cites it**:
  `line.ts`'s `collapse` ended in `.trim()`, which was correct only because the line above had
  already turned every blank into an ASCII space — an ordering dependency nothing stated, in a
  module whose own columns are joined with `U+001F`, one of the six characters `trim()` and
  `str.strip()` disagree about. `collapseBlank` is in `shared/subject/validate.ts` now, beside the
  class, and both readers import it. ⚠️ **And one was a sentence that was simply false**: a deck that
  parsed cleanly and produced no terms was refused as `no_collection` — *"a zip with no Anki
  collection in it"* — which told the reader to re-export a file that was fine. It has its own code.
- ⚠️ **One close-out criterion is outstanding and needs a deployment**: whether `os.tmpdir()` is
  writable in a Vercel Function (ADR 0068 §2). Nothing in this session could answer it.

**2026-09-18 — [#21](https://github.com/yutaasakura96/kioku/issues/21) is built: the review load has
a brake, and the reader has a zone.** ADR 0066 in full, with a dated amendment block for five things
it did not say. No new ADR.

- **`compose(due, new, size, allowance) → { cardIds, newCount }`**, with `DAILY_NEW_CARDS = 10`,
  `NEW_CARDS_PAUSED_ABOVE_DUE = 50` and `DUE_READ_CEILING = 2000` beside `DEFAULT_SESSION_SIZE`. The
  gate reads `due.length` rather than a second argument — the judgement call is below. Sabotaged:
  removing the gate reddens two tests across the unit and schema tiers, and removing the
  retrievability order reddens three.
- **`review_session.new_count` and `review_session.zone`**, migration `0005_review_brake`, with
  `CHECK (new_count >= 0 AND new_count <= size)`. `new_count` is written by the insert that composes
  the run. ~~⚠️ **Not applied to Neon**, like `0003` and `0004`.~~ Applied 2026-09-19.
- **[`shared/review/brake.ts`](../shared/review/brake.ts) is new**: `introducedToday` over
  `local-day.ts`'s day (its second importer, as #23 predicted), `newAllowance`, the sentence and the
  third empty state. The day's runs are read from a 48-hour window and bucketed in TypeScript, not
  with `date_trunc` (§ Carrying).
- **The due read has no `LIMIT size`** and returns each epoch's state; `retrievability()` in the
  scheduler wrapper ranks them. ⚠️ **Measured**: `ts-fsrs` 5.4.2's `get_retrievability` throws for a
  non-`New` card with no `last_review`, so the wrapper answers `0` first.
- **The zone rides every *session* request**, the mount's included, is canonicalised by
  `canonicalZone` (`asia/tokyo` → `Asia/Tokyo`, measured) and stored, or `null` when absent.
  **`server/middleware/shell-data.ts`'s one line changed as predicted**: `/stats` reads
  `readerZone`, the newest stored zone, and UTC only for a reader who never sent one.
- **The screen says which brake is on**: a sentence under the end screen's tally, read again by the
  answer that finishes the run, and a third empty state, *No new words today.* `10` §5.6 and §5.7,
  `09` §4.7, `04` §7.6 and §12, `03` §8, `11` §8 and `CONTEXT.md` (*Brake*) are amended.
- **Tests**: 890 across four tiers (846 before), typecheck and build clean. New:
  `test/unit/review-brake.test.ts`, `test/nuxt/review-brake.test.ts`, and blocks in
  `review-compose`, `review-scheduler`, `local-day` and `test/schema/review.test.ts`.

⚠️ **Judgement calls, none confirmed by Yuta:**

- **The gate counts `due.length`** where #21 asked for a separate due-count argument. The count comes
  from the same read, so a second argument could only disagree with the list beside it.
- **The zone lives on `review_session`**, not on `user` (the auth library's table) and not in a
  settings table that does not exist. `/stats` reads the newest one.
- **"Start screen" is read as the empty states.** *Review* composes on arrival and has no start
  screen, so the brake is named on the end screen and in the empty states.
- **The open state speaks too**: *3 of 10 new words today.* ADR 0066 §7 names only the two shut
  states; saying the number while it is open teaches the cap before it bites.
- **An unanswered run's new *cards* stay new.** A run abandoned with ten new *cards* spends the day's
  ten, and tomorrow those same ten are offered again, because they have no epoch. That is ADR 0066
  §3 as written; it means an abandoned run costs a day, not the words.

**2026-09-18 — [#23](https://github.com/yutaasakura96/kioku/issues/23) is built: retention,
consistency and flag rate are the numbers, and *acceptance rate* is gone from the code.** ADR 0062 in
full. No new ADR — but **one document was found to be wrong and corrected**, which is below.

- **`shared/metrics/acceptance.ts` is deleted**, with `test/unit/acceptance-rate.test.ts`. ADR 0064
  leaves no accept event to count, so the rate is 100% by construction. *Seconds-per-note* went the
  same way. ⚠️ **Removed, not shrunk** — ADR 0062: *a number nobody acts on is a number somebody will
  eventually act on by accident.*
- **Retention** is `rating >= 3` over `count(*)`, **filtered to `state = 2`**, over the trailing 30
  days of `reviewed_at`. States 0, 1 and 3 each have their own schema-tier test. Sabotaged: dropping
  the state filter reddens three.
- **Consistency** is days studied over days there were to study, capped at 30 and floored at the days
  since the first *grade*. ⚠️ **It reads `reviewed_at`, not `received_at`** — the outbox can replay a
  Tuesday-night *grade* on Wednesday morning and the reader studied on Tuesday. Sabotaged: reading
  `received_at` reddens five.
- **Flag rate** is `count(distinct card_flag.card_id)` over `count(card)`. ⚠️ **Distinct is the one
  line that changed from *false-accept rate***, whose `count(*)` was correct over its own
  denominator; a share of the deck cannot exceed one. Sabotaged: `count(*)` reddens four. No
  `resolved_at IS NULL` filter, and a test refuses one.
- **[`shared/time/local-day.ts`](../shared/time/local-day.ts) is new, and it is the project's first
  notion of *today*** (ADR 0066 §4): a day running 04:00 to 04:00 in the reader's zone, bucketed
  through `Intl` rather than through `date_trunc`. ⚠️ **[#21](https://github.com/yutaasakura96/kioku/issues/21)
  is its second importer and the module is shaped for it.** Three sabotages: midnight instead of
  04:00 reddens seven, the tempting `instant − 4h` one-liner reddens exactly the daylight-saving
  test, and a non-inclusive window reddens one here and three in the metrics.
- **Suppression moved onto the `Figure`**, because ADR 0062 gives each ratio its own evidence — twenty
  qualifying reviews, fourteen days, twenty minted *cards*. ⚠️ **ADR 0058 survives the move intact**:
  what it refused was *suppressing by not computing*, and every value is still filled whether or not
  it will be shown, which is what keeps the boundary observable at nineteen and twenty from the seam.
  `StatsFigures.vue` is still the only file that **reads** the flag. Sabotaged both ways.
- ***Time-to-first-review* is gated on minted *cards* rather than on a threshold of its own**, and
  the ticket did not say so. It was gated on twenty *vetted notes* — the size of the corpus rather
  than anything about the figure — and *cards minted* is that quantity in the word that still means
  something. Its **pair** is still *sources*.
- **The aside is rewritten and ADR 0058's argument is not.** *A rate over seventeen is noise* is
  carried verbatim; the rule in front of it named a boundary and a noun that no longer exist, and it
  now names only the ratios actually withheld — and disappears when none is.
- ⚠️ **ADR 0037's amended table was wrong and is corrected in place.** It said *two grades either
  side of midnight are two days*, which is the opposite of ADR 0066 §4's own worked example. **It
  was caught by writing the test from the table rather than from the code** — the assertion failed,
  and the failure was the document's. ADR 0037 carries a dated correction.
- **Tests:** 846 TypeScript (was 808), across four tiers; seven guards checked by sabotage, every one
  red for its own reason. Worker unchanged at 288.
- ⚠️ **`/code-review` found four defects in the tests and two wrong comments, and the tests were the
  worse half.** All are fixed; each is worth carrying because three of them are the *same* class:
  - ⚠️ **`toContain('5%')` on the *whole document* passes on retention's `75%`.** Measured:
    `'75%'.includes('5%')` is true. The flag-rate assertion held whatever that column rendered — or
    failed to render. § Carrying has carried the **negative** form of this since 2026-09-12 (*a
    `not.toContain` over markup is an assertion about a haystack*); **the positive form has the same
    defect**, and `/stats` is where it bites, because four of five columns render a percentage and
    every one is a substring of some other. `test/e2e/stats.test.ts` now reads each figure through
    its own eyebrow.
  - ⚠️ **And that fix immediately exposed a second one**: the assertion that
    *time-to-first-review* reads `5d` was passing on the scoped-style attribute `data-v-5de4d6b0`.
    The figure is **suppressed** at nineteen *cards* and the test never noticed.
  - ⚠️ **The e2e fixture was wall-clock flaky.** Five *grades* were written at `now() - 6 days`
    plus 105 to 133 minutes; a run between roughly 01:47 and 04:00 UTC pushes them over the cutoff
    into a **sixteenth** day and 71% becomes 76%. **A fixture that depends on the hour is a test
    that fails at night.** They share one instant now — the fifteen spine rows are exactly 24 hours
    apart, which is what makes the day count independent of when the suite runs.
  - ⚠️ **A unit test asserted `toBe(1)` for both Tokyo and UTC** and so passed with the zone ignored
    entirely. The two instants now differ by a day in one zone and not in the other.
  - ⚠️ **Consistency could exceed 100%, and the window was the reason.** It had a near end and no
    far end: `reviewed_at` is the **client's** stamp and `03` §8.2 accepts it two minutes ahead
    (ADR 0054), so a *grade* given just before the cutoff on a fast laptop buckets into tomorrow —
    a day `daysPossible` does not contain. Sabotaged: it reads `15 / 14`.
  - ⚠️ **Two comments asserted things from memory**, which is the failure CLAUDE.md § Working
    agreements exists for and the second time this project has shipped one beside measured claims.
    *`hour12: false` can yield `24` in some engines* — measured on the pinned Node 24.11.0, it
    returns `"00"`; the `% 24` stays as defence and now says so. And *`Intl` is the only thing in
    either language that knows a zone's offset at an instant* — Postgres `AT TIME ZONE` does too,
    and the real argument was always the missing input rather than a missing capability.
- **Amended:** `CONTEXT.md` (*Consistency*), `02` §2 `S10`, `03` §12, `10` §8.1/§8.2, `11` §3,
  ADR 0037, and the `note_field_provenance` index comment in `server/db/schema/shared.ts`.
- ⚠️ **What it does not do: `/stats` has no zone, so consistency's day boundary is 04:00 UTC** —
  13:00 in Tokyo. See § Carrying; it is #21's to close and it is one line.
- ⚠️ **Two places where the ticket's letter was not met, both deliberate and both named here rather
  than quietly.** #23 asks for state 0 and state 3 to be excluded *"each with its own unit test"*;
  the filter is **SQL**, so the tests are at the schema tier, and a unit test could only assert a
  duplicate of the filter. And #23 says *time-to-first-review* is *"carried over untouched"*, which
  its arithmetic is — but its **gate** had to move, because the old one was twenty *vetted notes*
  and there is no such thing after ADR 0064. It shares flag rate's twenty *cards*; its pair is
  still *sources*.

**2026-09-17 — [#22](https://github.com/yutaasakura96/kioku/issues/22) is built: every word carries a
*domain* and a *level*, and a *session* can be filtered on the new half.** ADR 0065 in full. No new
ADR.

- **`domain_claim`**, migration `0004_domain_claim.sql`, shaped exactly like `level_claim`: the
  attribution `CHECK`, `UNIQUE NULLS NOT DISTINCT (note_id, authority_key)`, an index on `note_id`.
  Documented as **`04` §5.7**, not §5.5 as the ticket says: §5.5 is `occurrence` and §5.6 is the
  table it mirrors. ~~⚠️ **Migration `0004` is not applied to Neon**, and neither is `0003`.~~ `0004` applied
  2026-09-19; `0003` already was.
- **`subjects/jlpt-vocab.json` declares `levels` (`N5`–`N1`) and `domains`.** `levelValues` /
  `level_values` and `domainValues` / `domain_values` read them on each side, `checkDeclaration`
  refuses an empty set (`no_values`) and a value listed twice (`duplicate_value`) with the same codes
  in the same order, and the drift test compares both lists.
- **Stage 6 asks for `level` and `domain` beside the fields**, in the same request, and takes them
  off the answer before `validate` sees it. The prompt names every legal value and says when
  `general` is right; the schema has no `enum`, because ADR 0065 puts the refusal in the writer.
  `PROMPT_VERSION` is `v3`.
- **Stage 7 writes one `level_claim` and one `domain_claim` per *note*** inside the *note*'s
  transaction, authority-less, with the model and prompt. ⚠️ **A value outside the set is refused
  and the *note* is written without the claim**; `ingest.claim_refused` is logged per *chunk* and
  per claim, without the value. The first estimate stands on a resume.
- **The *session* filter** is `shared/review/filter.ts`: two sets, empty means no restriction, an
  undeclared value is a **400** rather than a silently unfiltered run. It reaches `newCards` only, as
  two `EXISTS` over the claim tables; `dueCards` takes no filter, so it cannot be handed one. A *note*
  with no claim matches no filter, which is every *note* written before today.
- ⚠️ **"*Review*'s start" is read as the knob's three homes**: the end screen and both non-terminal
  empty states (`10` §5.8). The mount's start sends no filter, for the knob's own reason. The filter
  lives in page memory only. **`space` on a checkbox is the checkbox's**: the controls are inside the
  mode container, so the end screen's start handler now ignores `space` from an `<input>`.
- ***Vet*'s *facts strip* gains `DOMAIN`**, rendered by the same template as `LEVEL`: hollow marker
  for an estimate, `estimate` in the document, never a `title`.
- **Tests:** 808 TypeScript (was 790) and 288 worker, **75 needing Docker** (was 275/73). Three
  guards were **checked by sabotage**: the writer's set check, the domain `EXISTS`, and the `space`
  guard, whose e2e assertion failed when the guard was removed.
- **Amended:** `CONTEXT.md` (*Domain*, *Level*, *Facts strip*, *Provenance marker*), `03` §5.1,
  `04` §4/§5.6/§5.7/§9/§11, `10` §4/§5.7/§5.8, `subjects/README.md`, `worker/tests/README.md`.

**2026-09-17 — [#20](https://github.com/yutaasakura96/kioku/issues/20) is built: a chosen word mints
its *card* on arrival, and *Vet* is the flag queue.** ADR 0064 in full, and the re-vetting ticket
ADR 0056 had owed since #13. **One new ADR, 0067**, because "reuse the mint path" had no answer
across two languages.

- **`write_pending` is `write_notes`**, the module and the stage key in both pipelines, the
  deviation #19 carried. A *note* is written `accepted` for **`job.requested_by`**, with `vetted_at`
  stamped and no `seconds_to_vet` or run, and its *card* is minted **in one transaction per *note***.
  ⚠️ The worker's connection is autocommit and `runs.py`'s transaction wraps only the ledger, so
  that block is `write_note`'s own. The first draft wrapped nothing, and `/code-review` found it. A
  null requester writes the *notes*, mints nothing and logs `ingest.unowned`.
- **`mint_cards(note_id, owner_id, template_keys)`**, migration `0003`, is the one mint path. It is
  called by `decide.ts` and the worker, it is not a trigger, and it never writes an epoch
  ([ADR 0067](adr/0067-minting-is-a-database-function-because-two-toolchains-mint.md)).
- ⚠️ **A stage 4 collision mints as well, and this goes beyond the ticket's wording.** A word the
  corpus already holds is accepted and minted for the requester: a `pending` row is upgraded, and a
  `rejected` one is left alone with no *card*. ADR 0064 says *a chosen word*, and the 474 *pending
  notes* are the cache stage 5 hits for everyday words, so without this a list of them produces
  *occurrences* and no *cards*. **The 474 stay pending until a run chooses them**, which is the
  ticket's out-of-scope line read as "no migration of them", not as "never mint them". Prose
  collisions mint too.
- ***Vet* is the flag queue.** It holds accepted *notes* with an open `card_flag` for this owner,
  ordered by the oldest open flag. `space`/`E`/`R` are **keep/fix/drop** in `decide()`, on the same
  wire. All three resolve every open flag, keep and fix unsuspend a `flagged` suspension, and drop
  writes `rejected`. The start block and the chrome bar both count **flagged**, from one function.
  **State 2 ("nothing to vet yet") and the poll are gone**, because an *ingestion* no longer adds to
  this screen. `10` §3.2 and §4 are amended.
- **ADR 0052's freeze gains its condition**: `writeNoteFields` succeeds while the *note*'s *card*
  carries an open flag, from any owner, like the freeze itself.
- **The first *scheduling epoch* reset** is `server/utils/review/epoch.ts`. A fix that changes a
  *memory-bearing field* supersedes every live epoch of the *note*'s *cards* and starts ordinal n+1
  in the new state. `nextOrdinal` moved there from `grade.ts`.
- **`Z` on a resolution** reopens the flags whose `resolved_at` equals the row's `vetted_at` (one
  transaction, one `now()`), suspends the *card* again, and deletes nothing. `Z` still un-mints on
  the *pending* path.
- **Tests:** 790 TypeScript (was 773) and 275 worker, **73 of them needing Docker** (was 267/65).
  The freeze lift and the epoch reset were **each checked by sabotage**. Removing either one turned
  its tests red and nothing else.
- ~~⚠️ **Migration `0003_mint_cards.sql` is not applied to the Neon database.**~~ It was — applied
  2026-09-16, found 2026-09-19 by reading `drizzle.__drizzle_migrations`. `decide()` and the worker
  both call `mint_cards`.
- **Amended:** `03` §5.1, `04` §4/§6.4/§7.3/§7.4/§7.8/§9/§12, `09` §4.3/§4.5/§4.6/§4.9/§7/§8,
  `10` §3.2/§4.3/§4.5/§4.6/§4.7, `11` §5/§7, `worker/tests/README.md`.

**2026-09-16 — [#19](https://github.com/yutaasakura96/kioku/issues/19) is built: the input can be a
word list.** The first ticket of the pivot, and the first code to move since it was decided. ADR 0063
in full, minus nothing.

- **`source.kind`**, `text not null default 'prose'` with a three-value `CHECK`, migrated as
  `0002_source_kind.sql`. ⚠️ **The default is `prose` and *Ingest*'s is `word_list`**, deliberately
  and for different reasons: the column default is what keeps the rows written before ADR 0063
  meaning what they meant, and the screen's default is what the pivot is about. `04` §5.1 is amended.
- **The declaration names one ordered stage list per kind.** `subjects/jlpt-vocab.json`'s `stages`
  array is a `pipelines` object: `prose` is `03` §5.1's seven unchanged, `word_list` is
  `chunk → normalise → deduplicate → filter_known → generate → write_pending`. Both toolchains read
  it and neither restates it (ADR 0003), so the rename touched four places — `shared/subject/
  declaration.ts`, `worker/subject.py`, both validators, and the worker's dispatch.
- **The worker dispatches on the declaration rather than on a sequence written out in Python.**
  `pipeline/__init__.py` folds the stage list over a `StageState`; **a stage key nothing runs is a
  startup failure**, checked in `worker/__main__.py` before any job is claimed. That is #19's
  criterion in its own words, and the reason is that the other answer finds the gap on the chunk that
  needed it, hours into a run.
- **`normalise`** — one line, one term, through SudachiPy. Measured 2026-09-16 against
  `SudachiDict-core` 20260723: あります → 有る␟ある (the lemma's reading, ADR 0045, not あり),
  コーヒー → コーヒー␟コーヒー, ひらがな → 平仮名␟ひらがな, 引越し and 引越 → one *note*. It imports
  `reading_of` and `is_candidate` rather than repeating either — § Carrying records what the last
  duplicated reading rule cost.
- ⚠️ **A line Sudachi cannot resolve is kept, and the model writes its reading.** Three ways to fail:
  a word the dictionary has never seen, a line ADR 0044 would not call vocabulary (**a numeral among
  them** — `normalized_form` rewrites 六 to `6` and `04` §5.3 says numerals never reach the key), and
  a line holding two content words. Each keeps the line whole with an empty reading and `is_oov`;
  stage 6 asks for the reading with `reading=?`, `04` §5.4 records it as `generated` rather than
  `lookup`, and **the *note* is keyed on what it says rather than on what was asked**.
  `PROMPT_VERSION` is `v2` in the same commit, because the prompt changed and `04` §6.3's key covers
  the request.
- **Chunking has a second rule**: 25 terms, not ADR 0041's 1,200 characters. Both rules keep all
  three properties `04` §5.2 states — the chunks tile the content exactly, blank lines included.
- ⚠️ **The blank-character class got a second job and is now one constant per language.**
  `shared/ingest/chunk.ts` counts the terms to place a boundary and `worker/pipeline/normalise.py`
  reads them back out of that chunk, so a character one language calls whitespace and the other calls
  content is a *chunk* holding 25 terms on one side of the repository and 24 on the other. `BLANK`
  and `_BLANK` are built from `BLANK_CLASS` / `BLANK_CLASS`, and the drift test compares the two
  strings.
- **Ingest asks what the material is, first**, as two radios with `word_list` checked; the form is
  `multipart/form-data` and takes a `.txt` beside the textarea. The file is read into the same
  `content`, so `S2`'s cap refuses an over-cap upload at the same seam before any spend — and ⚠️ **the
  file's text comes back in the textarea**, because no server can repopulate a file input and `09`
  §4.2's promise has to hold for the input it did not know about.
- **Amended in the same commit:** `03` §5.1 (the second pipeline, as a table), `04` §5.1 (`kind`),
  `04` §5.2 (two boundary rules).
- ⚠️ **What ADR 0063 calls `write_notes` is the existing `write_pending` stage.** The ADR was
  describing the pipeline *after* [#20](https://github.com/yutaasakura96/kioku/issues/20) mints on
  arrival; #19 is explicit that minting is out of scope and that this ticket still writes *pending
  notes*. Renaming the stage would rename the module and the prose pipeline with it, for a behaviour
  that has not arrived. **#20 is where the name moves, if it moves.**
- **Suite: 773 TypeScript (was 734) and 267 worker (was 222).** `npm run typecheck` and
  `npm run build` both clean.
- ⚠️ **`/code-review` found two defects and both were real.** (1) **する verbs went unresolved** —
  勉強する is 勉強 + する in C mode and ADR 0044's allowlist contains `動詞,非自立可能` on purpose, so
  the *two content words* rule called it a phrase and would have minted a **second *note*** beside
  the 勉強 a prose run had already produced: ADR 0006's exact failure, arriving through the one part
  of speech that is deliberately both auxiliary and a word. The guard is now narrow on both sides —
  head `サ変可能`, follower normalising to 為る — so 気をつける and 持ってくる are still kept whole.
  (2) **`readSourceKind` fell back to `word_list`**, so any post without the radio — a fixture, the
  resume control's encoding, a future caller — would have written a `word_list` *source* and chunked
  a pasted passage at 25 terms. It falls back to `04` §5.1's column default now, with a test at both
  seams.

**2026-09-16 — the pivot is decided: five ADRs and seven issues, no code.** Yuta said what he wants
the app for, and it moved the input, the vetting step, the headline metric and the daily load. The
conversation happened on 2026-09-16 and the writing-down happened the same day, which is the working
agreement rather than a coincidence: the decision log is written as things are decided.

- **[ADR 0062](adr/0062-retention-and-consistency-are-the-headline-and-acceptance-rate-retires.md)** —
  retention and consistency are the headline, *flag rate* checks the model, *acceptance rate* and
  *seconds-per-note* retire. ⚠️ **The cost is real and is named**: ADR 0018's model walk had an
  instrument that read in an afternoon and now has one that reads in weeks.
- **[ADR 0063](adr/0063-the-input-is-a-chosen-word-list.md)** — `source.kind`, a pipeline per kind, a
  `normalise` stage, 25 terms per *chunk*, prose kept and demoted.
- **[ADR 0064](adr/0064-a-chosen-word-mints-its-cards-on-arrival.md)** — mint on arrival, *Vet* is
  the flag queue, ADR 0052's freeze lifts for a flagged *note*, and the first *scheduling epoch*
  reset the application will ever write.
- **[ADR 0065](adr/0065-a-domain-is-a-claim-like-a-level-and-the-filter-only-touches-new-cards.md)** —
  `domain_claim` beside `level_claim`, closed value sets in the *subject*, a filter on the new half
  only. ⚠️ *Domain* came off **subject**'s `_Avoid_` list in `CONTEXT.md` to do it.
- **[ADR 0066](adr/0066-the-review-load-has-a-brake.md)** — ten new a day, none above fifty due,
  counted at composition, local day from 04:00, backlog by retrievability.

**Three things were verified while writing them, rather than asserted:** `compose` and `ts-fsrs` have
no new-*card* cap anywhere (read in `shared/review/compose.ts` and ADR 0016's configuration, which
both say so on purpose); `ts-fsrs` exposes `get_retrievability(card, now, false)` as a number
(context7, 2026-09-16); and **nothing writes a `level_claim` today** — the table, the read path and
the tests exist and no producer does, which is why ADR 0065 is more work than it looks.

**Issues [#19](https://github.com/yutaasakura96/kioku/issues/19) to
[#25](https://github.com/yutaasakura96/kioku/issues/25)** carry it, in the order § Next draws.
⚠️ **#24 (Anki) and #25 (AI-seeded lists) are `needs-triage`**, because the `.apkg` format, shared
decks' licences and four questions about seeding are all genuinely open.

**Amended in the same commit:** `CONTEXT.md` (six terms retired, moved or added), PRD §2 `S2`–`S10`
with dated blocks, ADR 0001, ADR 0018, ADR 0037, ADR 0052 and ADR 0056 with amendment sections, and
`06-decision-log.md`. ⚠️ **`03`, `04`, `09`, `10` and `11` were deliberately left alone**: they
describe the system that is built, the pivot has not changed it yet, and each ticket amends its own
document as it lands.

**Phase 6 — the first real run, 2026-09-14 to 2026-09-15, stopped before review.** The source was
Sōseki's 『夢十夜』 第一夜 and 第二夜 (about 3,400 characters, three *chunks*, `claude-sonnet-5`). It
became **474 *pending notes*** for $0.43. Yuta vetted **39: 39 accepted, 0 edited, 0 rejected, median
1.76 s**, so `S3`'s criterion holds. *Acceptance rate* reads 8%, because the denominator is *notes*
generated (ADR 0037). **No *card* was reviewed.** Yuta chose to stop, so *time-to-first-review*, the
scheduler and the false-accept rate have no real reading yet. Part 1's predictions were Claude's
rather than Yuta's (he chose not to make them), and the form says so. Three findings came out of it:

- **#17:** each *chunk* takes 3–5 minutes, longer than the five-minute heartbeat window. The one
  worker's idle connection dropped, and the job was reclaimed silently with `attempts = 2`. No *note*
  was duplicated, but spend and candidate counters can be. ⚠️ **Decided and built 2026-09-15 —
  [ADR 0061](adr/0061-the-worker-heartbeats-while-the-model-streams.md).** The drop was Neon Free's
  five-minute scale-to-zero, the same length as the stale window. The worker now heartbeats on its
  own connection at most once a minute while the answer streams. The candidate counters commit with
  their *chunk*'s completion. A reconnect and a sweep each log a line. The spend ledger is left as
  one immediate statement on purpose: a retry after a lost cache write is a second real charge.
- **Volume:** roughly one *note* per seven characters of prose. The allowlist (ADR 0044) is not what
  keeps the queue small.
- **Typed answers:** the reader wants WaniKani-style recall — type the reading in hiragana, then the
  English, checked by the app. v1 self-grades one recognition *template*. This is the next work.
  ⚠️ **Built 2026-09-15 as #18 (ADR 0060)**; `/review` no longer self-grades.
  WaniKani-API and Jōyō-kanji import were raised and dropped the same day.

The form is filled in `docs/first-run-expectation.md`, and ADR 0037 carries an amendment with the
numbers.

**Phase 6 — the first sign-in anyone has ever done, 2026-09-13.** `scripts/first-run.sh` ran and
wrote `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env` and `ANTHROPIC_API_KEY` to
`worker/.env`. **Each was checked against the real endpoint, not assumed**: Google's token endpoint
answered `invalid_grant` to a bogus code, which it only does for a client id and secret it accepts;
Google's authorize endpoint accepted the exact redirect URI
`http://localhost:3000/api/auth/callback/google`; and Anthropic's `/v1/models` answered `200`.
⚠️ **That last one is read-only, so account credit is still unconfirmed** — the first *chunk* is
what confirms it. `test/unit/no-provider-key-in-the-app` passes with the key on disk.

⚠️ **The first attempt was refused with `signup_disabled`, and it was the invited address.** Nothing
in the app creates a user row, so `disableSignUp: true` refuses everyone, and `08` §2's step 7 had
assumed a row that no document said how to write. One `auth."user"` row was inserted by hand on Neon
with `email_verified = true` — Better Auth 1.7.3 links a Google account to an existing row by email
only when the local row is verified (`requireLocalEmailVerified` defaults to `true`, read in
`better-auth/dist/oauth2/link-account.mjs`). Confirmed afterwards: **one user, one `google` account
linked to it, one live session.** `08` §3.2 carries a dated amendment saying why neither refusal is
weakened by the seed, and `first-run.sh` stage 5 carries the statement with the address as a
placeholder, because the repository is public. `c43a86f`.

**Phase 6, #15 — the reading is the dictionary form's, 2026-09-13.** **One word is one *note* again.**
`reading_of` read the **surface**'s reading, so あります keyed `有る␟あり` beside ある's `有る␟ある` and
開いた keyed `開く␟ひらい` beside `開く␟ひらく` — every inflecting word class, which is verbs and
i-adjectives, one *note* per form the *source* happened to contain. ⚠️ **And it was never only a key
problem**: `reading` is on the answer side of the recognition *template* (`10` §5), so the first
*card* minted from an inflected word would have shown あり.
[ADR 0045](adr/0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md)
§ Amended 2026-09-13 is the rule and `04` §5.3 carries it as part of the identity.

**The fix is one field on `Token` and one line in stage 3, and the split between them is the whole
design.** Re-tokenising needs the dictionary; `11` §8's seam says stage 3 is *tokens in, candidates
out — no dictionary, no database, no clock*. So `pipeline/tokenise.py` computes the reading of
`dictionary_form` and carries it as `dictionary_form_reading`, and
`pipeline/extract_candidates.reading_of` chooses between that and the token's own. ⚠️ **The predicate
is written once and read twice** — `is_inflected` lives beside `Token` and both stages import it,
because stage 2 uses it to decide whether to spend a second tokenisation and stage 3 uses it to
decide which reading is the word's, and those two answers have to be the same answer.

**Eleven tests, and six of them assert what the rule must not break.** あります/ある and 開いた/開く
collapse to one key each; ⚠️ 六時's 時 still reads じ — it is uninflected, and re-read alone it reads
トキ, which is the measurement that makes the guard load-bearing rather than an optimisation; an
inflected する reads する and never なる — its `normalized_form` is 為る, which alone reads ナル, and
that is the case that reversed #15's own preferred rule; サボった reads さぼる, so ADR 0045's script
rule still runs on the term; and one test asserts the invariant the seam rests on, that
`dictionary_form_reading` is present exactly when the surface inflected. ⚠️ **No deprecated
accessor**: the rule reads `dictionary_form`, and a test tokenises inside
`simplefilter("error", DeprecationWarning)` to keep it that way.

⚠️ **`worker/tests/test_generation.py` seeded `有る␟あり` and now seeds `有る␟ある`** — it was standing
on the defect rather than endorsing it, and it says so. It is still **written out rather than
derived**, because a key computed by calling the pipeline agrees with the pipeline on the day the
pipeline is wrong.

⚠️ **The re-ingestion consequence, stated because `04` §5.3 requires it to be:** this changes the
identity of any *note* written from an inflected form. **None exists.** That is why #15 went in front
of the first run and not after it, and it is the last moment the change is free.

**Phase 6, #16 — the e2e flake, fixed and the tier audited, 2026-09-12.** **The rule from ADR 0059
applied, and it found a second one nobody had seen fail.** `test/e2e/vet.test.ts` polls
`accepted/1` as a single value instead of polling `state` and counting *cards* behind it;
`test/e2e/review.test.ts` polls `1/1` instead of polling `card_flag` and counting suspended *cards*
behind it — `flag()` writes both in one transaction (`04` §7.8), so it was the same shape, and it
had **never been observed to fail**. Neither fix uses a `waitForTimeout`.

**Demonstrated both ways, not argued.** A 150 ms sleep inserted into the gap fails both tests on
**every** run before the change and passes both after it; twenty consecutive full runs are green.
⚠️ **The probe has to be narrowed to the path under test** — widened to every `decide()` it leaves
the *reject* test's transaction open across the next test's page open, which fails on an **empty
queue** and looks like the fix regressing. That is the `Promise.all` trap, not this one.

**The rest of the tier is audited and safe by construction, and the reason is structural.**
`stats.test.ts`, `ingest.test.ts`, `auth.test.ts` and `no-scripts.test.ts` open no browser, so every
read follows an awaited `nuxtFetch` and a response that arrived is a transaction that committed.
⚠️ **The write direction is clean by the narrower margin ADR 0059 predicted**: every test write is
in a `beforeAll` before a page opens, or between two awaited fetches. `11` §6.1, § Carrying,
`06` and ADR 0059's own amendment block all carry this.

**Phase 6, #14 — Stats: six figures and the suppression boundary, 2026-09-12.** **The numbers get
read.** `/stats` carries *acceptance rate*, *false-accept rate*, median *seconds-per-note*,
*time-to-first-review*, the *notes vetted* count and the spend ledger — six figures, **each a query
over rows written by the code that produced them**, with no metrics table added (`04` §13). With it
the milestone closes on the code: paste → *vet* → *review* on two consecutive days → six figures.

**Suite: 693 TypeScript** (was 622) **plus 200 pytest.** Typecheck and build clean.

**The arithmetic is a seam and the rows are a seam, and neither is the screen.**
`shared/metrics/stats.ts` holds the median (⚠️ *mean of the middle two* on an even count),
*false-accept rate* (⚠️ **unclamped** — a second flag on the same *card* is a second row, so a corpus
the reader keeps finding faults in reads above 100%, which is the corpus `S9` exists to report), the
micro-USD conversion (⚠️ **null in, null out** — `11` §3's *never estimated*, because ADR 0018's
price table has an effective date and a constant lies silently) and `ratiosSuppressed`.
⚠️ ***Acceptance rate* is imported from `shared/metrics/acceptance.ts` and re-derived nowhere** —
§ Carrying named that as the failure that "looks entirely reasonable in a diff", and it would have
been the same mistake in a second TypeScript module. `server/utils/stats/queries.ts` is the other
seam: five sequential reads plus the ledger, owner-scoped where `04` §4 says personal and unfiltered
where it says shared.

**⚠️ Two decisions the documents left open, both now argued.**
[ADR 0057](adr/0057-time-to-first-review-is-a-median-over-the-sources-that-have-one.md): the
criterion is per *source* and `10` §8.1 gives it one slot, so the figure is the **median across
*sources***, with an unstudied *source* **excluded** rather than counted as a long one — a mean would
let one *source* studied a week later push the number past the criterion's own ten-minute boundary
while every *source* the reader used came back in eight minutes.
[ADR 0058](adr/0058-a-suppressed-ratio-shows-the-evidence-behind-it-as-a-pair.md): a suppressed ratio
shows `have / possible`, for **all four** — `10` §8.2 decided the pair for the two percentages and
said nothing about the two medians, where a median has no pair and a bare sample count drops the half
that matters. `10` §8.2, `11` §3 and §8, and `09` §4.10 are all amended in this commit.

**The boundary is tested at nineteen and twenty, three times, and once by crossing it.**
`test/unit/stats-metrics.test.ts` asserts `ratiosSuppressed` at both; `test/nuxt/stats-figures.test.ts`
mounts the grid at both; and `test/e2e/stats.test.ts` seeds nineteen decisions, reads the document,
**rejects one more *note***, and reads it again. ⚠️ **That last arrangement is the one that catches a
boundary evaluated once at boot**, which is what a naive implementation with a `computed` outside the
render would be. Sabotaged to red four ways: the median's even branch, `<` to `<=` on the boundary,
`count(*)` to `count(distinct card_id)` on the flags, and `min` to `max` on the first *review*.
⚠️ **One sabotage did not fail and it was the sabotage that was weak** — grouping the duration query
by `source.submitted_at` instead of `source.id` still separates two *sources* with different submit
instants. The near-miss `11` §3 actually names (*the first grade of any card*) is a differently
shaped function, not a one-line edit, and the test catches it by asserting **two** durations.

⚠️ **No threshold is asserted anywhere in the suite** (ADR 0037, ADR 0018). Nothing says the median
is under five seconds or that *acceptance rate* clears a floor; ADR 0018 walks the model *down* until
it degrades, so the number has to be free to fall. **Do not add one later "to be safe".**

⚠️ **`S12`'s export is not built and that is scope, not an omission.** `10` §8.4 puts
`<a href="/api/export">` on this screen; issue #1's own out-of-scope list puts `S12` outside
milestone 1 — "a `MUST` for v1 and not part of the loop" — with the route, its
`Content-Disposition` and the test that reads it back all owed together. A link to a route that does
not exist is not an offer, so the link is absent and `app/pages/stats.vue` says why.

**Phase 6, #13 — the outbox, and the `S9` flag, 2026-09-12.** **A *session* answered underground
loses nothing.** Every answer is written to `localStorage` before the screen paints the next *card*,
the stream replays in order when the connection returns, and it carries **two kinds of entry** — a
*grade*, and `S9`'s `X`, which suspends a *card* and stamps its *note* for return to the queue
without giving it a *grade*. ⚠️ **Stamps it, and does not yet return it**: the queue's own half is
the re-vetting ticket's and § Next carries why.

**Suite: 622 TypeScript** (was 549) **plus 200 pytest.** Typecheck and build clean.

**ADR 0039's five properties are asserted in this project's own idiom, in three tiers.**
`shared/review/outbox.ts` is the arithmetic — append, replay order, settle by `seq`, and what a
resumed run inherits — and what it asserts hardest is an **absence**: there is no deduplicate
anywhere, because PRD §5 says the same *card* graded twice replays twice and ADR 0007 says no
conflict is resolved anywhere. `test/nuxt/review-outbox.test.ts` mounts the page against registered
endpoints and reads `localStorage` rather than the component, because property 4 is *the durable
record decides, not client memory*. `test/e2e/review.test.ts` takes a real browser offline, answers a
whole run, and asserts nothing reached the database until the connection came back.

⚠️ **`03` §8.2's grade validator is built and the allowance covers both of its rules**
([ADR 0054](adr/0054-the-skew-allowance-is-two-minutes-and-it-covers-both-of-8-2-s-rules.md)). 120
seconds, and the finding is the symmetry rather than the number: `03` §8.2 names an allowance for the
future rule only, and read literally the before-snapshot rule is exact — which it cannot be, because
**both comparisons put a client stamp against a server one.** A laptop three seconds slow stamps the
first *grade* of every run before `snapshot_taken_at`, so an exact rule refuses the opening *grade* of
every *session* on a machine that works. Both server instants are now read from the database in one
statement, because measuring the bound against the application server's clock would widen it by
whatever Vercel and Neon disagree by.

⚠️ **PRD §5's *later timestamp wins* could not mean what it sounds like**
([ADR 0055](adr/0055-later-wins-is-a-second-row-because-review-log-cannot-be-rewritten.md)).
`04` §7.5's trigger refuses an `UPDATE` and a `DELETE` on `review_log`, so *later wins* has exactly
one available meaning: **the later one is also written, and everything that reads a *card*'s answer
reads the latest stamp.** The two cases are told apart by the stamp rather than by counting — a
replayed entry carries the **same** stamp and is `already_graded`; a genuinely later answer is a
second row and the epoch moves on. ⚠️ **A *session* can therefore hold more `review_log` rows than it
has positions**, and #14's completion rate stays correct only because it counts positions.

⚠️ **The flag leaves `note_vetting.state` alone, and `04` §11's unused index is what said so**
([ADR 0056](adr/0056-a-flag-returns-a-note-to-the-queue-through-card-flag-not-by-un-accepting-it.md)).
`09` §4.9 says the flag returns the *note* to the queue, and the straightforward implementation —
`state` back to `pending` — **raises the numerator of *false-accept rate* and lowers its denominator
at the same time**, so one flag moves the ratio twice and takes the *note* out of *acceptance rate*
too. `card_flag (note_id) WHERE resolved_at IS NULL` has been in the schema since Phase 4, labelled
*the flagged notes waiting in the Vet queue*, and it only makes sense under the other reading. ⚠️
**The rule worth keeping: when an implementation and an index disagree about how something is found,
the index is the older statement and usually the considered one.**

⚠️ **What #13 did not build, deliberately: re-vetting.** The queue query and the decision path behind
it are the next ticket's, because three decisions sit inside them — `decide()` requires `pending`,
ADR 0052 freezes an accepted *note*'s fields, and editing a *memory-bearing field* resets the *card*
(`04` §7.4, the first reset in the application, and nothing writes one). **So after #13 a flagged
*note* does not yet reappear on `/vet`.** It is the same refusal #10 made when it declined to resolve
a flag, one step later: half of `S9` built here would have been a guess at the half that was not.
⚠️ **This is the one acceptance criterion on #13 that is not met**, and it is named rather than
quietly folded in — `09` §4.9 and `04` §7.8 both carry the amendment.

**The store is ours and `@vueuse` was not added.** `app/utils/review-store.ts` — `readStored`,
`writeStored`, `clearStored`, imported by path. `03` §8.1's rule is about a **name collision**: Nuxt
has a built-in `useStorage` and that is why `@vueuse/nuxt` disables its own, so a composable of that
name here would inherit the hazard without the dependency that explains it. Every call is wrapped,
because the store throws rather than answers in a private window — ⚠️ **a store that cannot be
written is a *Review* that still works**, and degrades to #12's behaviour.

⚠️ **One listener on `window`, and it is not a keystroke.** ADR 0025 binds the key handlers to the
mode container because ADR 0023's map is all printable characters and SC 2.1.4 is Level A — a
criterion about keyboard shortcuts. `online` is ADR 0039's *signal*: removing it entirely changes
when the stream drains and never whether it does, because the next load replays anyway.

**`/code-review` found two things and both were real.** ⚠️ **A replayed flag wrote a second
`card_flag` row** — the code said so in a comment, reading `11` §3's *a second flag on the same card
is a second row* as covering it. It does not: `11` §3 is about a **reader** flagging twice, and an
outbox retry counted as a flag **inflates the numerator of *false-accept rate***, which is the metric
ADR 0056 was written to protect. The *grade* path had exactly this guard on exactly this pair and the
flag path did not. ⚠️ **And a `400` blocked the head of the stream for ever**: `send` could not tell
a body the server cannot read from a network fault, so it held it and everything behind it — the
drop ADR 0039 property 5 exists to prevent, arriving through the mechanism added to prevent it. A
`400` is now a refusal; a `404` or a `500` is still held, because those may work next time.

**Sabotaged to red, seven ways.** Removing the stamp check reddens two schema tests; reading a flagged
position as unanswered reddens the run that ends on a flag; dropping the `localStorage` write reddens
four of the page's twelve; not folding the outbox into a resumed run reddens exactly the one about
asking a *card* twice; removing the flag's replay guard reddens the one that counts `card_flag` rows;
and holding a `400` instead of refusing it reddens the one about the head of the stream.

**Phase 6, #12 — the session composer, the snapshot and four grades, 2026-09-12.** **A *card* can be
reviewed.** `/review` composes a bounded *session* due-first, snapshots it server-side, prefetches it
whole, and takes four *grades* under a *progress rail* that knows its own length. `ts-fsrs` 5.4.2 is
in the manifest and `shared/review/scheduler.ts` is the only file that imports it.

**Suite: 549 TypeScript** (was 412) **plus 200 pytest.** Typecheck and build clean.
⚠️ **`CLAUDE.md`'s command block said 293** — written at #6 and never touched since, the sixth
consecutive stale number. It says 549 now.

**The two seams `11` §8 named are built and both went red under sabotage.**
`shared/review/compose.ts` is `compose(due, new, size) → ordered card ids` — due-first, most-overdue
first, new *cards* filling the remainder, a *card* once (`04` §7.7). ⚠️ **Queue ordering, new-*card*
introduction and daily caps are the app's job and explicitly not the scheduler's** (`03` §8,
verification §1.4), which is why the ordering lives in a pure function rather than in the `ORDER BY`
that also has to have it: in the schema tier a wrong order reads as a fixture problem.
`shared/review/scheduler.ts` is the FSRS wrapper — the mapping to and from `scheduling_epoch` and
`review_log`, and the configuration. **Turning `enable_short_term` back on reddens six of its
eighteen tests**, which is the point: the regression it guards is invisible for months and then
arrives as a worse retention curve.

⚠️ **The first *scheduling epoch* is minted by the *grade*, not by the composition** — and the
literal reading of § Carrying's own sentence would have put it at compose time. A composed *session*
can be abandoned, so composition is not scheduling: an epoch written there is a memory state for a
review that never happened, and `scheduling_epoch.card_id` is `RESTRICT`, so it would also put a
*card* the reader never answered out of ADR 0033's reach. **The rule that generalises is: the epoch
is written by the thing that produces a `review_log` row, and by nothing else.** Recorded in
`06-decision-log.md`.

⚠️ **`review_session.size` is what was composed, not what the knob asked for.** The knob is a cap. A
reader with seven *cards* and a size of twenty gets a rail of seven, because `04` §14 makes the
rail's length `review_session.size` and thirteen ticks that can never fill would be the only progress
indicator in the app promising work that does not exist. Also in the decision log.

⚠️ **`10` §5.6 asks for four figures and never says which four**, so #12 chose them and wrote down
why: they are the *grade* distribution
([ADR 0053](adr/0053-the-end-screens-four-figures-are-the-four-grades.md)). Every *card* ends as
exactly one of four values, so the distribution is a partition of the run rather than a selection
from it; the rail above already says how long the run was, so a `REVIEWED` column would restate it in
38px type; and a ratio would be the first one shipped outside `S10`'s suppression boundary, which is
#14's. `SessionTally.vue` is `10` §11's "one component with a column count, not two".

⚠️ **`/code-review` found the criterion that the code claimed and did not have.** #12's thirteenth
criterion is *a note edited mid-session shows the old text* (PRD §5), and the file comment said the
mechanism was the prefetch — while every *grade* was answered with a fresh snapshot that the client
installed **wholesale**, and `snapshotOf` reads `note.fields` live because `04` §7.7 snapshots
membership and nothing else. So an edit would have reached the remaining positions on the next
*grade*. `shared/review/snapshot.ts`'s `mergeGrades` is the fix and the seam: **an answer moves the
*grades* and never the words.** ⚠️ **It is unreachable today and that is the reason it is built** —
an accepted *note*'s fields are frozen against every writer (ADR 0052) and a *card* exists only for
an accepted *note*, so **the freeze is currently doing the prefetch's job**, and the day `S9`'s
re-vetting lifts it the rule has to be already true.

⚠️ **Three things `10` §5 draws that #12 deliberately does not.** `X` — the `S9` flag — has no key
and no legend line, because it writes four rows in one transaction and rides the outbox, both #13's,
and **a legend naming a key that does nothing is worse than no legend**. `03` §8.2's grade validator
(future-skew, before-snapshot) is #13's named seam, so the *grade* endpoint records
`clock_skew_seconds` rather than judging it. And the *session* resumes from the **server** rather
than from `localStorage` — ADR 0014's storage is the outbox ticket's. What #12 *did* build from that
neighbourhood: `10` §5.3's flagged tick, because the rail's vocabulary is four states and a component
that knew three is a thing #13 would have to rediscover; and `10` §5.6's unsent-grades notice with
its `/auth` link, because a *grade* that does not land has to be surfaced rather than swallowed
(`09` §4.8) even before there is a queue to retry it from.

⚠️ **CONTEXT.md puts *rating* on *Grade*'s `_Avoid_` list, and the first draft used it throughout.**
Caught by review. The application says *grade* everywhere it speaks for itself; `rating` survives in
exactly two places and both are quotations — `review_log.rating`, which is `04` §7.5's column, and
`ts-fsrs`'s own `Rating`.

⚠️ **The lockfile carries 140 lines that are not this change.** npm 11.3.0 normalises metadata the
committed lockfile was written without — `libc` arrays dropped from ~25 rollup entries,
`devOptional` rewritten to `dev` on ~20 esbuild ones. It is disclosed rather than reverted: a revert
is a lockfile the next `npm install` on this machine rewrites again, and the one line that matters is
`ts-fsrs` 5.4.2.

**Phase 6, #11 — the freeze, the contradiction, and the arithmetic, 2026-09-12.** **#11 was three
things, and one of them was a contradiction rather than work.** #10 could not render a *mode*
without rendering the *note* inside it, so eight of eleven acceptance criteria arrived already met —
the quiet/foregrounded split, the *facts strip* and its zoning, the *provenance marker* filled and
hollow, the *authority*'s name in the document rather than behind a hover, both of two disagreeing
*level claims*, `E` at one keystroke, the four-grey ramp, three interaction states. What was left is
what this session did.

**Suite: 412 TypeScript** (was 400) **plus 200 pytest** (was 199). Typecheck, build and
`drizzle-kit check` clean.

⚠️ **`S6` said *any field is editable* and `10` §4.4 said the opposite — the PRD was amended, not
the code.**
[ADR 0051](adr/0051-the-edit-reaches-the-judgement-fields-and-s6-is-amended-to-say-so.md). #10 had
already built `10` §4.4's version in the component *and* in `shared/vet/decision.ts`, and the two
reasons are not stylistic: editing the *term* or the *reading* changes `note.identity_key`, which
`04` §5.3 calls a reviewed data event rather than a refactor (ADR 0006), and editing a *level*
manufactures a claim with no *authority* (ADR 0005). `S6`'s own story is about a wrong *meaning*, so
narrowing it costs the story nothing. **The contradiction was never live in the code — it was live in
the acceptance criteria**, where the next implementer reads it.

⚠️ **The freeze was true because nobody had asked, and it is a guard now — in the `WHERE` of both
write paths.**
[ADR 0052](adr/0052-an-accepted-note-is-frozen-against-every-writer-and-any-readers-acceptance-freezes-it.md).
`server/utils/note/fields.ts` is the application's one write path to `note.fields` and refuses on a
`NOT EXISTS`; `worker/pipeline/write_pending.py`'s `ON CONFLICT DO NOTHING` was already the worker's
half and now has a test that reddens if it becomes an upsert. **Both were sabotaged to red.** Two
things fell out of writing it down:

- ⚠️ **Any reader's acceptance freezes the fields, not just the requesting reader's.** `04` §4 makes
  `note` **shared** and `note_vetting` **personal**, so there is one `fields` document under two
  queues. The owner-scoped rule — the one that reads naturally out of `decide()` — lets a second
  reader rewrite the first reader's *cards* under them. **Unreachable in v1** (ADR 0012 invites one
  reader) and written anyway, because the cost of the guard is one `NOT EXISTS` and the cost of
  finding out is a corpus nobody can tell has been rewritten.
- **A refusal decides nothing.** `decide()` returns `frozen` before the first of the other writes
  rather than rolling them back — an acceptance that committed with the correction dropped would be
  the reader accepting the value they had just called wrong, arriving as a success. `10` §4.8 now
  names a **second** keystroke-that-failed message; `Z` was the only one.

⚠️ **`11` §8's "metric arithmetic" seam is split, and #11 took only its own half.**
`shared/metrics/acceptance.ts` is *acceptance rate* as arithmetic over counts, with the two failures
`11` §3 names — an edited accept counted as an acceptance, and a denominator of *notes seen* rather
than *notes generated* — and **both bias the number the same direction, up.** The other three numbers
and `S10`'s suppression boundary stay #14's: the boundary governs all four ratios at once and belongs
where they are rendered together. **What is not at this seam is the query**; these are counts, and
where they come from is `note_vetting`.

⚠️ **`/code-review` found one real bug in the branch it was reviewing, and it was the client rather
than the guard.** `apply()` keeps an `inFlight` entry for as long as the *note* is still in the
server's answer, and `visible` hides every *note* that has one — correct for a decision that landed,
**wrong for one that was refused.** A `frozen` answer leaves the *note* in the queue, so the entry
would never clear: the *note* would vanish from the reader's screen while still sitting in the
database, with `pending`, `vetted` and `rejections` each a keystroke ahead of it, recoverable only
by a reload. `not_pending` never reached this because that *note* has left the queue. **`frozen`
reloads instead of applying.**

⚠️ **And one test that was green for no reason.** The worker's freeze test asserted the *note* still
had one *occurrence* after the second write — which is what it would have had if the occurrence
append had been **deleted outright**. ADR 0006 has two halves and the freeze is only one: the second
sighting is now written at a different position, and the test asserts both positions are there.
Sabotaged to red both ways.

⚠️ **The ticket carries a second contradiction nobody had noticed, and it is not this one.** #11's
eleventh criterion reads *three interaction states on this screen, not five (ADR 0035)* — but
ADR 0035's three-state rule is about **the three *places*, which ship no JavaScript**, and its own
next paragraph says ***Vet* and *Review* are the opposite case and get both states for real**.
`10` §4.8 specifies *Vet*'s loading and error states and #10 built them. **Satisfying the criterion
literally would mean deleting them.** Nothing in the code is wrong; the criterion is, and it is
recorded here because the ticket will close carrying it.

⚠️ **Four of the eight criteria #10 met are held by source and by a deliberate non-test, not by a
test — and this file said otherwise.** § Next claimed all eight were "covered by
`test/nuxt/vet-note.test.ts` and `test/schema/vet.test.ts`". Verified 2026-09-12 by grepping the
suite: the *provenance marker*, the *authority*'s name, both *level claims* and `E`'s cost are
genuinely asserted; **the quiet/foregrounded split, the *facts strip*'s two rules, the four-grey ramp
and the interaction-state count are asserted nowhere.** They hold in
`app/components/VetNote.vue` — the rules read `--k-rule`, and the file uses exactly four `--k-ink*`
tokens and no hex — and `11` §9 puts **visual regression** on the deliberately-not-tested list,
because a screenshot suite would make the canvas the authority that `05` §9 says it is not. **So it
is a documentation defect rather than a coverage gap**, and it is the seventh consecutive ticket to
ship a sentence that was true when it was written.

⚠️ **Two small readings that are recorded because they will look arbitrary later:** *acceptance rate*
answers **`null`** rather than `0` when nothing has been generated, because `0%` is a claim about a
pipeline that produced nothing usable and a reader who has not pasted anything yet would read it as
one; and a **rejection freezes nothing**, because ADR 0012 makes a rejection a claim about the reader
rather than about the word — nobody confirmed the fields, so there is nothing to protect.

**Phase 6, #10 — *Vet* as a *mode*, 2026-09-12.** **A *pending note* is now on a screen, and one
keystroke turns it into a *card*.** `/vet` replaces the *shell* entirely; `space`, `R` and `E` each
cost one keystroke; acceptance mints in the same transaction; `Z` un-mints and **fails visibly** when
the database refuses; Done ends the run and spends the undo, after asking once if there is anything
to lose. The three empty states, the run-end confirmation, the edit, the phone refusal and the
footer legend are all built.

**Suite: 400 TypeScript** (was 293) **plus 199 pytest**, unchanged — the worker was not touched.
Typecheck, build and `drizzle-kit check` clean.

⚠️ **`11` §6.1's two-ticket debt is paid: the e2e tier opens a browser again.** #5 gated both
*modes* and took the browser assertions away; #6 paid the **context** (a database the built app can
reach, and a forged session); #10 pays the **browser**. `test/e2e/vet.test.ts` is `11` §6.2's
behavioural proxy written down as one test — focus the Done control, press `R`, assert `note_vetting`
is unchanged; focus the container, same key, assert it is `rejected`. **Sabotaged 2026-09-12**:
moving the handler to `document.addEventListener` turns it red and nothing else in the suite notices.
⚠️ It is a proxy and the file says so — **if Done is ever moved inside the container the test needs
re-thinking rather than re-running.**

**Two decisions this session made rather than transcribed:**

- ⚠️ **[ADR 0049](adr/0049-the-vet-queue-is-oldest-first-and-the-client-holds-no-position-in-it.md)
  — the queue is oldest-first and the client holds no position in it.** ADR 0033 said `Z` reads its
  target from the database "so the undo survives a reload" and then said the *note* goes "back at the
  head of the queue" without saying what the head was. Oldest-first makes that free: a *note* just
  decided is older than every *note* still waiting, so returning it to *pending* returns it to the
  front. Every endpoint answers with the whole batch, whose head **is** the *note* on screen, so the
  client renders `notes[0]` and stores no index — two tabs cannot disagree about whose turn it is.
- ⚠️ **[ADR 0050](adr/0050-the-idle-sweep-runs-on-the-next-read-because-there-is-no-scheduler.md) —
  `04` §7.1's idle sweep had no home.** Vercel Cron is forbidden by ADR 0022, a serverless deployment
  holds no timer, and the worker claims `job` rows over **shared** entities and has never touched a
  personal table. It runs on the next read. **The cost is stated**: a run abandoned by a reader who
  never comes back stays open until somebody looks, so a *rejection* in it stays reversible while
  nobody is asking — and is permanent the instant anybody is.

**And three readings recorded in the decision log rather than as ADRs**, each of which is a sentence
somebody had already written without noticing what it decided:

- ⚠️ **Acceptance mints the *card* and **must not** mint a *scheduling epoch*.** `scheduling_epoch.
  card_id` is `RESTRICT` (`04` §9), so an epoch written at acceptance makes ADR 0033's `Z` fail on
  **every** acceptance the application ever makes — with a failure that reads like a database problem
  rather than a decision. ADR 0033 said it in its own words and nothing had put the sentence beside
  the constraint: the *card* it deletes is "a card with no `review_log` and no `scheduling_epoch`".
  `test/schema/vet.test.ts` asserts the **absence**.
- **`human` provenance follows the diff; `note_vetting.edited` follows the commit.** `09` §4.3 sets
  `edited` on the `Enter`, which is a fact about the reader's act; ADR 0048 makes `kind` a fact about
  each value, and a field the reader read and left alone was produced by the model. Stamping it
  `human` would take ADR 0018's instrument away one *note* at a time. `edited` is also monotone — `Z`
  leaves it standing, because the edit is still in `note.fields`.
- **Done does not wait for the run to end when the run holds no rejections.** The anchor's click is
  not prevented — that bit is exactly what `test/nuxt/modes.test.ts` guards — so the end request
  travels beside the document load as a `sendBeacon`. Losing it costs nothing, because the only thing
  `ended_at` decides is whether a *rejection* can be reversed and this branch has none. The branch
  that matters is `10` §4.6's confirmation, and it **awaits**.

⚠️ **Two measurements nobody publishes, both found by a test going red for the right reason:**

- **A `RESTRICT` refusal raises `23001`, not `23503`.** PGlite 0.5.8 / PostgreSQL 18.3, 2026-09-12.
  `23503` is `foreign_key_violation` and belongs to `NO ACTION`; `04` §9 spells every rule in the
  `card` chain `RESTRICT`, so a guard written against `23503` alone would have caught **nothing** —
  and the code path it guards is the one ADR 0033 says the whole argument falls back on. Drizzle also
  **wraps**: the driver error carrying the code is the `cause`, and reading `code` off the top would
  have made the guard silently never match.
- ⚠️ **`@electric-sql/pglite-socket` fronts a single-connection PGlite, so `Promise.all` in a request
  handler fails in the e2e tier and only there.** Four reads at once make `node-postgres` open four
  connections; the socket server resets three, the route answers `500`, and the browser shows an
  empty screen with nothing in the test output naming the cause. **Production would have been fine.**
  `server/utils/vet/queries.ts` runs its reads sequentially and says why.

⚠️ **The documents disagreed about the footer legend and the disagreement is now closed in `10`
§4.7.** §4.4 says "while an edit is open the legend's `Esc` label reads `cancel edit`"; §4.7's legend
has no `Esc` in it, because §4.3 gives that key to the Done cluster. The reading that honours both is
that **the legend names the keys that act on the screen in front of the reader** — four with a
*note*, three inside an edit, `Z` alone on an empty queue with an open run (the undo really does
reach back into an empty screen, because ADR 0033 reads its target from the database), and nothing at
all on the confirmation or on a phone. `10` §4.7 carries the table.

⚠️ **And two things `05` §7 and `05` §4 name without defining, decided in `10` and marked as gaps:**
the ***note* index** is the position in this run (`#19`) — the only monotone figure on the screen, and
the pending count beside it already answers the other direction; and **`05` §4's ramp is written per
*field name***, so `app/components/VetNote.vue` holds a three-entry map from field name to type with
a fallback. The declaration carries `kind`, `required`, `memory_bearing` and `label` and nothing that
says *this value is Japanese prose*. **A second *subject* closes that, in the declaration** (ADR 0003)
rather than in a second map.

⚠️ **`/code-review` found one bug that would have biased `S3`'s own number, and it was a Vue
subtlety rather than a mistake in the arithmetic.** `watch(note, …)` keyed on the *note* **object**;
every answer installs a freshly parsed queue, so the *note* on screen gets a new reference with the
same contents and the timer restarted each time a response landed. `seconds_to_vet` would then have
measured from the previous request's reply rather than from when the *note* rendered — **every
reading understated by one round trip, biased low**, on the one number `S3` exists to produce, from
the first run. The watch keys on `noteId` now.

⚠️ **And it caught the same failure this project has shipped in five consecutive tickets: a comment
that asserts something untrue of the code beside it.** Three of them, all written by the change that
made them false — a `.marker` comment describing a `title` attribute that had been replaced by an
`aria-label` an hour earlier; a style-block header claiming "the vertical rhythm below is not in `05`
or `10`" when `05` §5 names two of its four gaps by meaning, **and the untruth is what licensed the
wrong number** (40px where §5 says 52); and a key-cap comment about `--k-face-mono`'s default sitting
beside a `white-space` rule. **The pattern is now six tickets long and the shape is always the same**:
the sentence was true when it was written.

Four more that were real:

- ⚠️ **`draft` is on `CONTEXT.md`'s `_Avoid_` list — twice**, under **Pending** and under
  **Candidate** — and it was the name of the variable holding the uncommitted edit of a *pending
  note*, which is the exact collision the list exists to prevent. It is `edit`. **Second review
  running that has caught a vocabulary breach**, which makes it a category rather than an accident.
- ⚠️ **ADR 0050's idle horizon had two homes before it was a day old.** `decide.ts` re-inlined the
  sweep's SQL with a literal `interval '30 minutes'` beside a `queries.ts` that exported
  `IDLE_HORIZON` for exactly that, and the run boundary was being found three different ways — one of
  which had dropped the `ORDER BY` that `openRun`'s own doc comment called load-bearing.
  `server/utils/vet/run.ts` is the boundary now, and it is the only file that knows what half an hour
  is.
- **`05` §7's quiet affordance is a bounded control** — `--k-raised`, `1px --k-border-control`,
  `--k-radius-control`, `13px 20px` — and the empty state's was a bare link with an arrow, under a
  comment citing the section it did not implement.
- ⚠️ **A `28px` gap that was 40px.** `10` §4.3 measures the Done cluster `28px` from the counts; the
  chrome bar also carried a `12px` flex gap, which adds. The bar's left group carries its own gap
  now and the bar carries none.

⚠️ **And one place where two sections of `05` disagree with each other**, which is new: §5's scale
snaps the empty-state block's statement-to-body gap `18 → 20` **and gives 20 the meaning that fits it
exactly** — *between a body block and what introduced it* — while §7 restates the canvas's 18 and
`10` §4.5 copies it. §5 wins on its own terms ("New values are added to the scale, never set by hand
beside it"); both other sections carry a dated amendment, and the body's 18px **type size** is
untouched, because §5 exempts type sizes from the snap.

⚠️ **The review also named the edit path as scope creep, and it is right.** #10's criterion is that
*entering* an edit costs one keystroke; #11 owns the edit itself. Shipping `E` as a control that
opens something with no way to commit would have been worse, so it is built — and § Next says exactly
which of #11's criteria that leaves.

**What #10 does not do:** schedule anything. A minted *card* has no *scheduling epoch*, so
`startBlockCounts`'s due figure is zero until #12 — which is correct rather than broken, and is the
reason `Z` works at all. It also does not resolve a flag: `card_flag.resolved_at` is untouched and
`note_vetting.flagged_at` is **rendered** (`10` §4.3's aside) but never written, because `X` is
*Review*'s key and `S9` is #13's.

**Phase 6, #9 — generation and pending notes, 2026-09-12.** **A pasted *source* now becomes
*pending notes*, and the money is on the row.** `worker/provider.py` is ADR 0018's boundary and the
only module in the repository that imports an SDK; `worker/pipeline/generate.py` and
`write_pending.py` are stages 6 and 7, so the seven modules and the seven stage keys are finally the
same seven; `worker/prices.py` is `03` §7's price table as configuration with an effective date. The
worker **refuses to start without a key**, which is `db.require_direct_url`'s shape applied to the
second secret `03` §13.1 names.

**Suite: 293 TypeScript** (was 290) **plus 199 pytest** (was 143), 59 of them needing Docker.
Typecheck, build and `drizzle-kit check` clean.

⚠️ **The two documents disagreed about what stage 6 even is, and the cache settled it.** `03` §5.1
says *the LLM, per surviving note*; `04` §6.3 keys `generation_cache` on the *chunk*'s content hash
and stores a `{"notes": […]}` array under it. One request per candidate would put every candidate in
a chunk under **one** four-tuple — 214 candidates across 84 chunks writing and overwriting 84 rows,
each holding whichever word finished last. That is
[ADR 0047](adr/0047-generation-is-one-request-per-chunk-and-notes-are-written-as-each-chunk-returns.md):
**the chunk is the unit of the request, of the key and of the streamed write**, `03` §5.1's phrase is
about scaling, and the chunk's text is in the prompt because otherwise the key would cover text the
request never saw.

⚠️ **And the streamed write is what closed § Carrying's cross-chunk duplicate**, which is the same
decision seen from the other end: 図書館 is in both of the test *source*'s chunks and is generated
**once**, because chunk 0's *note* exists by the time chunk 1 is deduplicated. A run that batched its
writes to the end of the run would pay twice for every word that spans chunks, and there is a test
that reddens if it does.

**Two more decisions this session made rather than transcribed:**

- ⚠️ **[ADR 0048](adr/0048-provenance-kind-is-decided-by-who-produced-the-value.md) — provenance
  `kind` is decided by who produced the value.** `04` §5.4's `CHECK` gives four values and one worked
  pair; the declaration has its own two-valued `kind` that looks like a mapping and is not one.
  `lookup` is a named authority, `generated` is the model with no authority behind it, `judgement` is
  the model **choosing** among an authority's answers, and `human` is the reader. ⚠️ **`judgement` is
  unreachable in v1** — nothing hands the model a sense inventory — and two of four empty is the
  honest state rather than a gap.
- **The price table is a list of dated tables and the newest effective one wins**, recorded in the
  decision log rather than as an ADR. A price change is a **new entry**, never an edit: editing one
  rewrites history, because every `ingestion` already stamped with that date would then cite a table
  saying something else. An unpriced model raises rather than costing zero — ADR 0018 walks the
  model, so an unrecognised id is the *expected* shape of a mistake, and a free *ingestion* in the
  ledger `S10` reports from is worse than no number.

⚠️ **#9 found a defect it deliberately did not fix, and it is
[#15](https://github.com/yutaasakura96/kioku/issues/15).** `reading_of` reads the **surface's**
reading, so あります keys as `有る␟あり` while ある keys as `有る␟ある` — one word, two *notes*, which
is exactly what ADR 0006 exists to prevent, arriving through the half of the key that § Carrying's
`normalized_form` finding did not cover. It is worse than a key problem: ADR 0045 makes `reading` a
field on the answer side of the *card*, so 開いた would produce a card reading ひらい. **It is #8's
`reading_of` and the fix is a decision, not a patch** — the issue carries both candidate rules and
the measurement behind each. ⚠️ **Amended 2026-09-13: both candidates were ranked backwards and the
cost the losing one was charged is not real.** Re-tokenising `normalized_form` reads **ナル** for
する, because し normalises to 為る; and `開く␟あく` is unreachable under every rule — 48 hits of 48
resolve to ヒラク — so collapsing it was never a cost anyone could pay. The rule adopted is
**re-tokenise `dictionary_form`, and only for a surface that inflected**. See ADR 0045 § Amended
2026-09-13.

⚠️ **The test fixture was serving one test's answers to the next one.** `generation_cache` is keyed on
content rather than on any row a test owns, and it was not in `conftest.py`'s cleanup list — so six of
#9's tests went green for the wrong reason before they went red for the right one: every assertion
about *what the provider was asked* had silently become an assertion about the previous test. It is
in `SCRATCH_TABLES` now, first and alone, because it references nothing and `04` §10 calls it the one
table safe to truncate.

⚠️ **The container count is no longer written in four files, which is what #8's own finding asked
for.** It has moved three times — three, twenty-three, forty, now fifty-four — and shipped stale
twice. `worker/tests/README.md` carries it; `docs/11-testing-plan.md` §7, ADR 0038,
`worker/pyproject.toml` and `worker/tests/conftest.py` now point there, and `conftest.py`'s no-Docker
message names the **files** rather than a count, because the files are what a developer is looking at
when they read it. **This is the first ticket in five that did not ship a stale number**, and the
reason is that it stopped keeping one.

⚠️ **`/code-review` found four things that were wrong rather than stale, and two of them were
tests passing for the wrong reason.**

- ⚠️ **Every "the cache saved us" test was actually watching stage 5.** Re-ingesting an identical
  *source* asks the provider nothing — but that is the **corpus filter**, not `04` §6.3: the first
  run's *notes* are already there, so nothing survives to be generated and the cache is never
  consulted. Two tests asserted `calls == []` and credited ADR 0010's cache in their own docstrings.
  `forget_the_corpus` now empties the *notes* and leaves the cache standing, which is the only state
  in which the cache is the thing doing the work — and it is a real state, because `04` §10 calls
  `generation_cache` the one table safe to truncate *because* the corpus is what cannot be rebuilt.
- ⚠️ **`write_generation_cache` used `ON CONFLICT DO NOTHING`, which would have made a chunk re-pay
  for ever.** A cached row that does not answer every survivor is treated as a miss — so the run pays
  again, and then could not store what it had paid for, because the narrow row held the key. The next
  run would read the same narrow row, miss again, and pay again. It is an upsert now, and the test is
  a **third** run rather than a second.
- ⚠️ **A refused or truncated answer dropped its tokens on the floor.** Both are a 200 that was
  billed; `ProviderRefused` now carries what the call cost and `make_generator` records it before
  re-raising. A ledger that lost them would make a *source* that failed half its chunks look
  **cheaper** than one that succeeded, which is the one direction `S10` must not be wrong in.
- ⚠️ **`03` §11's *the provider is not named at the reader* was a comment `runs.py` could not keep.**
  `runs.py` writes `str(error)` into `ingestion_chunk.last_error` and `10` §6.2 renders it, so an SDK
  exception allowed through would put the vendor, its URL and a request id on a screen. Every
  `anthropic.APIError` is translated at the boundary now, and the `stop_reason` check became an
  **allowlist of one** — `anthropic` 1.5.0 already carries seven, `model_context_window_exceeded`
  among them, and a denylist would have let a future one fall through to `json.loads` and surface as
  *the answer is not JSON*.

And three smaller ones: writing provenance only for a *note* this call created would have lost six
rows for ever if a process died between the two writes (it is unconditional now, with the conflict
clause deciding); a fully-cached run named no model at all, so *what made these notes* is now stamped
separately from *what this run paid*; and two comments in `prices.py` said things that were not true
of the file they were in.

⚠️ **The review also caught two vocabulary breaches, which is new.** The prompt said *"flashcard
fields"* — `CONTEXT.md` puts `flashcard` on *Card*'s `_Avoid_` list, and this stage does not make
*cards* at all — and ADR 0048 called a dictionary an *authority*, a word `CONTEXT.md` scopes to what a
*level claim* cites. Both are the same failure as a stale number: a word that is load-bearing
somewhere else, reused casually here.

**What #9 does not do:** show a *note* to anybody. `note_vetting` rows are written at `pending` and
`04` §12's first query has nothing rendering it — that is
[#10](https://github.com/yutaasakura96/kioku/issues/10).

**Phase 6, #8 — the pipeline, stages 1 to 5, 2026-09-12.** **A pasted *source* now becomes
*candidates*, and stops one stage short of spending anything.** `worker/pipeline/` is one flat module
per stage named by the declaration — `chunk`, `tokenise`, `extract_candidates`, `deduplicate`,
`filter_known` — every one of them pure, with the corpus arriving as two plain collections. The SQL
around them is `worker/ingest.py`, and **`worker/runs.py` is untouched**: the seam really was one
argument.

**Suite: 290 TypeScript** (was 280) **plus 143 pytest** (was 86), 40 of them needing Docker.
Typecheck, build and `drizzle-kit check` clean.

⚠️ **`/code-review` found two real things inside this commit, and the stale-number failure is now
five tickets running — this time it was the count of its own container tests.** #8 amended `11` §7
and `worker/tests/README.md` to forty and left ADR 0038, `worker/pyproject.toml` and
**`worker/tests/conftest.py`'s no-Docker message** — the one a developer actually reads — saying
twenty-three, while `worker/tests/README.md` claimed "ADR 0038 carries the amendment" for a number
ADR 0038 did not carry. All four are fixed and `11` §1's own header, which still said *Docker is
required for exactly three tests* and *there is still no code*, is fixed with them. **The count lives
in five files; the durable fix is for four of them to point at `worker/tests/README.md` rather than
repeat it**, and that is written down where the number is.

⚠️ **And criterion 9 was not met by the test that claimed to meet it.** #8 first shipped
`assert dictionary() is dictionary()` for *"constructed once per process, guarded by a test that
constructs it twice and measures memory"* — an assertion that a memoised accessor memoises, which
cannot fail, against a criterion whose whole fear is a caller that never uses the accessor. The real
guard constructs two `Dictionary()` objects and measures `ru_maxrss`; **sabotaged by swapping them
for the accessor, it reddens.** The `morphemes[:10]` guard `11` §7 also names as a test was likewise
only a docstring; it is a test now.

**Three decisions this session made rather than transcribed, all now ADRs:**

- ⚠️ **[ADR 0044](adr/0044-a-candidate-is-a-content-word-and-a-numeral-is-not-one.md) — what counts
  as a *candidate*.** No document said. `03` §5.1 named the stage and gave one exclusion (numerals),
  and `04` §6.1's `(214, 106, 71, 9)` implied heavy filtering without describing it. The line is
  **content words**: eleven `(pos₀, pos₁)` pairs kept, twenty-seven dropped, enumerated from the
  installed dictionary so the two sets cover all thirty-eight — and a test asserts they do, so a
  `SudachiDict` release that adds a category fails by name rather than dropping a word class in
  silence. **代名詞 is the most arguable exclusion** and the ADR says so.
- ⚠️ **[ADR 0045](adr/0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md)
  — the reading is written in the word's own script.** `04` §5.3's three worked keys are all
  hiragana; `reading_form()` answers in katakana. Nothing had noticed because **until #8 every
  *identity key* in the repository was a test literal written by hand.** The rule is hiragana except
  for a word written wholly in katakana, because コーヒー's reading is こーひー under a mechanical
  conversion — and `reading` is not only half of a key, it is on the answer side of the card.
- ⚠️ **[ADR 0046](adr/0046-a-job-gives-up-after-five-abandonments-and-the-retry-after-the-first-is-deferred.md)
  — the two gaps § Carrying named as one gap, closed.** `available_at` is finally the backoff `04`
  §6.4 always called it and `attempts` finally has a ceiling. The first retry stays immediate,
  because `11` §7 tests that a closed laptop's job lands in the same drain that noticed it.

**And two readings recorded in the decision log rather than as ADRs:** `04` §6.1's four candidate
counters are four disjoint buckets counted per *chunk* (the table gave the columns and one example
and never said what separated them), and a resume is one `job` row written only from `incomplete`.

⚠️ **`10` §6.2's resume control is built**, after three tickets each moved it on for a good reason.
#6 had no resume query; #7 had the query and no chunk processor, so a resume re-settled the run and
changed nothing a reader would see. It is a form `POST /` with a hidden field, answered `303` — a
`GET` that wrote a job would be actioned by a prefetch or a back button, and there is no JavaScript
here to intercept anything.

⚠️ **The test fixture could destroy `review_log`, and now cannot.** `worker/tests/conftest.py`'s
cleanup was `TRUNCATE job, ingestion_chunk, ingestion, source_chunk, source CASCADE`, with a comment
explaining that `review_log` "is not among them and must not be". Measured: the cascade reaches it
through `note.origin_ingestion_id` → `note` → `card` → `review_log`, and a row written before the
statement was gone after it. **`CASCADE` was not decorative either** — without it Postgres refuses
the statement outright, *Table "note" references "ingestion"* — so the one keyword that made the
cleanup run was the one that let it walk to the irreplaceable data. It is ordered `DELETE`s now,
which `04` §9's `RESTRICT` stops two tables short, and `test_scratch_cleanup.py` is the guard the
comment was standing in for.

**What #8 does not do:** stage 6. `generate` is a parameter defaulted to `None`, so a run today does
every stage that shrinks the work, writes `04` §6.1's ledger, and spends nothing. That is ADR 0010's
ordering made literal rather than a placeholder.

**Phase 6, #7 — the worker loop, 2026-09-11.** **`LISTEN`, then poll, then block — and the order is
the decision.** ADR 0028's seven steps are `worker/loop.py`, the claim and the stale sweep are
`worker/jobs.py`, and the chunk queue #6 deliberately left shut is `worker/runs.py`. The process has
**no listening socket, no route and no inbound surface at all** (`03` §1), it takes the **direct**
connection string and refuses the pooled one by name, and it reconnects with a doubling backoff
capped at thirty seconds for as long as it runs.

**Suite: 280 TypeScript** (was 277) **plus 86 pytest** (was 47), 23 of them needing Docker. Typecheck, build and
`drizzle-kit check` clean. ⚠️ **Twenty sabotages, twenty distinct failures** — poll before
`LISTEN` reddens six, dropping `SKIP LOCKED` reddens exactly the one test written for it, polling on
the timeout reddens two, reading the payload reddens one, sweeping on `claimed_by` instead of
`state` reddens the finished-job test by name, and a channel typo reddens the cross-language guard.

**The three tests ADR 0038 required are built and they are three of twenty-three**, which is an
amendment rather than a slip — see § Carrying. ⚠️ **The reconnect test asks the *server* what the
worker is subscribed to**, through `pg_listening_channels()`, at the moment the poll happens: a real
`pg_terminate_backend`, a `NOTIFY` fired while nobody is listening, and an assertion that the
catch-up poll found the job anyway.

**Four things this session decided rather than transcribed:**

- ⚠️ **PgBouncer's feature matrix separates `LISTEN` from `NOTIFY`** — `Never` and `Yes` in
  transaction pooling — and `03` §4.1, verification §7.2 and §9.2 all said the pair. All three are
  amended. It is what lets the app send its own wake-up from the pooled connection, which is
  **ADR 0043**: `pg_notify` after the transaction commits, swallowing its own errors, because the row
  is on disk before the notification exists.
- ⚠️ **The claim is one statement, not two**, and the reason is `autocommit=True`. See § Carrying.
- **The container tier is twenty-three tests, not three** — ADR 0038 and `11` §7 amended, with the
  sentence they were protecting intact.
- ⚠️ **`incomplete` is what every run settles as until #8**, and that is the true answer rather than
  a placeholder. `10` §6.2 is amended again: the resume control moves to #8, because #7 can claim a
  `kind = 'resume'` job and still has nothing to resume *with*.

⚠️ **`/code-review` found the stale-number failure inside this very commit, for the fourth ticket
running.** The amendment that moved ADR 0038's container count from three to twenty-three reached
four documents and **not the two files that cite them as authority** — `worker/pyproject.toml` and
`worker/tests/conftest.py` both still read "exactly three tests… and nothing else". That is
CLAUDE.md's *amend the document, don't leave a note* failing in the direction nobody checks: the
amendment was written, and then the code that quotes it was not re-read. Both fixed.

It also found three things that were wrong rather than stale, all fixed and all now tested:

- ⚠️ **The loop caught `OperationalError` and not `InterfaceError`**, and psycopg makes the second a
  sibling of `DatabaseError` rather than a kind of the first. The server ending the session raises
  one; the next statement against the object it left behind raises the other. **A worker that caught
  only the first would survive the drop it saw and die on the one it did not** — on Neon Free, where
  the compute suspends every five idle minutes, that is a worker that stops overnight for a reason
  nobody could reconstruct. `worker/db.py`'s `CONNECTION_LOST` is both, and deliberately not
  `psycopg.Error`, which would turn a query with a typo in it into an infinite reconnect.
- ⚠️ **`finish_job`, `fail_job` and `heartbeat` matched on the job id alone.** If a run outlives the
  five-minute heartbeat window the sweep returns it to `queued` and a second worker claims it — and
  the first, still going, would stamp `done` over the live claim. Every write to a claimed job now
  matches on `claimed_by` too. ADR 0015's revisit condition **is** a second worker.
- ⚠️ **`HEARTBEAT_EVERY_SECONDS = 30` was declared and never read**, with a docstring describing
  behaviour no code had. `04` §6.4's cadence belongs to the per-chunk loop, which is #8's; the
  constant is gone rather than left looking implemented.

And one claim asserted from memory, in the code **and** in the document it cited: *"`03` §5.1's
seven stages are pure transformations"*. Three of the seven are not — stage 1 chunks the whole
document and the app already did it, stage 6 is the LLM, stage 7 writes. **Stages 2 to 5 are the
pure ones.** `11` §8 carried the same overstatement since it was written and is amended.

**What #7 deliberately did not build:** the per-chunk work. `run_ingestion` takes `process_chunk` as
an argument and #8 supplies it — `03` §5.1's seven stages are pure transformations over one chunk,
and keeping them out of the bookkeeping is what lets them be tested with no database at all
(`11` §8).

**Phase 6, #6 — ingest and sources, 2026-09-11.** **A paste, four rows, one transaction, and control
back before the worker has looked.** Signing in lands on Ingest (ADR 0031); the form posts, the write
records `source` + `source_chunk` + `ingestion(queued)` + `job(queued)` **inside one transaction**,
and the answer is a `303` — `S2`'s "returns control immediately" satisfied by the job row rather than
by a fast worker. The run appears above the form on the way back, the Sources list renders, and
**every figure on all three *places* is stamped `as of this page load`**.

**Suite: 277 TypeScript passing** (was 147) plus 47 pytest. Typecheck, build and `drizzle-kit check`
clean. ⚠️ **Ten sabotages, ten distinct failures** — and two of the first sabotages did *not* fail,
which is where two of the session's findings came from.

⚠️ **`/code-review` found a real bug after the suite was green, for the third ticket running.** A
`<textarea>` bound with `:value` renders as raw children and the HTML parser eats one newline after
the tag — so a refused paste beginning with a blank line came back one line shorter. **The comment
above it asserted the opposite, from memory**, sitting between two claims in the same file that had
been measured. It is in § Carrying, it is fixed, and it is tested. The review also moved the refusal
line to where `10` §6.3 puts it, corrected `/sources/:id`'s typography to `10` §7.2, removed a
per-chunk re-split that cost 88 ms **inside the transaction**, and covered two query functions that
had shipped untested.

**The three things measured this session are all in § Carrying**, and each one changed what got
built: what a `sql` template does to a Drizzle column, what Nuxt's renderer does with a `POST`, and
what JavaScript's `.length` does to a Japanese *source*.

**#6 also paid two debts it did not open.**

- ⚠️ **`05`'s tokens exist.** § Carrying has carried "the tokens do not exist in the repo yet and **no
  ticket owns them** — the first screen ticket to need them lands them" since #5.
  `app/assets/css/tokens.css` is `05` §§1–6, ADR 0024's four greys included. ⚠️ **The font *files* are
  still not shipped and that question is genuinely open** — `05` §4 deferred it to Phase 4 and Phase 4
  never answered; the stacks carry `05` §4's own fallbacks and `06-decision-log.md` records the gap.
- ⚠️ **The end-to-end tier can sign in.** `11` §6.1 handed that to #10 and `00-status.md` § Next left
  the door open for #6 to argue it. #6 argued it, because its own criteria put the over-cap re-render
  in the end-to-end column and every route that pair touches is gated. PGlite behind a socket server,
  a session row, and a cookie signed in the test — **no endpoint mints a session.** Assertion 1's
  signed-in half is back on the three routes it is about.

**What #6 built that its criteria put out of scope, and why:** `/sources/:id`, **readable only**. Two
of its criteria — "offers to open the existing one" and "the Sources list renders" — both link there,
and a link to a `404` is not an offer. It renders the title, the fact line and the retained material;
**the *notes*, the *occurrence* positions and the delete confirmation are still `S11`'s.** `10` §7.2
is amended to say so.

**What #6 deliberately did not build:** `ingestion_chunk` rows. `04` §6.2 is per-chunk *progress*,
and progress before anything has been claimed is a fiction — #7 opens that queue when the worker
claims the job. `S2` names four rows and there are four.

**Phase 6, #3 — the subject declaration, 2026-09-10.** **One file, two toolchains, and a test that
runs one language from the other.** `subjects/jlpt-vocab.json` is ADR 0003's declaration as
language-neutral JSON at the repository root: the six fields with their `kind` and `memory_bearing`
flags, ADR 0006's *identity key*, the one recognition *template*, and `03` §5.1's seven stages in
order. TypeScript reads it through `shared/subject/`, Python through `worker/subject.py`, and
**neither restates it** — every list is derived from the file.

`03` §6's seam exists twice: `validate(declaration, output) → ok | error`, in both languages, over
one file. ⚠️ **The two answer with the same error codes in the same order by contract** — a message
string would not have survived translation — and both suites assert the order.

**Suite: 147 TypeScript passing** (was 106) **plus 47 pytest.** Typecheck, build and
`drizzle-kit check` clean. ⚠️ **Fifteen sabotages, fifteen distinct failures**, and three of them ran
in the language that did not contain the bug.

⚠️ **`/code-review` found two real divergences after both suites were green** — `null`, and six
whitespace characters. Both are in § Carrying, both are fixed, and both are now tested on each side.

**Five things this session decided rather than transcribed**, all in `06-decision-log.md`:

- **A declared field names its own roles; only ordered sets stay lists.** `kind` and `memory_bearing`
  are flags, so neither can name a field that does not exist. `identity_key` and a *template*'s two
  sides stay lists because they are ordered and may repeat a name — and those are exactly what
  `checkDeclaration` guards, in both languages.
- **The memory-bearing fields are `reading` and `meaning`** — the one *template*'s answer (`PRD` §6),
  not the subset that is also editable. ⚠️ `reading` can never change today; encoding that would bake
  ADR 0006's freeze rule into a flag ADR 0011 defines by what was *memorised*.
- ⚠️ **TypeScript's derived types are still only `string`** — measured. See § Carrying.
- ⚠️ **`null` is an absent field, and emptiness is a shared character class** — the two divergences
  the review found. See § Carrying.
- **The worker's toolchain is uv, Python 3.11, and Renovate needed no change.** See § Carrying.
- **The drift test runs `node scripts/print-subject-view.ts` from pytest**, and fails rather than
  skips when Node is missing.

⚠️ **What #3 deliberately did not build: ADR 0005's authority list and its precedence order.** `04`
§5.6 makes `level_claim.authority_key` a key into the declaration and `04` §13 says the precedence
order is declared there too — but which publications count as *authorities* for JLPT levels is a data
decision ADR 0005 left open, and #3's acceptance criteria do not ask for it. The keys are additive, so
the ticket that first renders a *level* lands them without moving anything. It is named in
`subjects/README.md`.

**Phase 6, #5 — identity, 2026-09-09.** **The door, two independent refusals, and the gate.** `S1` is
answered as far as it can be without Google: an unauthenticated request to any of the five screens is
a `302` to `/auth`, an unauthenticated `/api/**` is a `401`, `/api/auth/**` stays reachable because
nothing could sign in otherwise, and `/auth/refused` carries no link, no button and no form.

**One middleware resolves and a second step refuses** (ADR 0030, `08` §6.3) — `server/middleware/
session.ts`. Nothing re-derives a session and no page reads one from the client; the door itself
reads what the middleware already resolved, through `useRequestEvent()`, and carries it into the
payload. **The two refusals are wired as `08` §3 specifies and neither shares a failure mode with
the other**: `validateUserInfo` never reads `source`, so a second provider cannot walk past it, and
`disableSignUp` is set where the only method is enabled.

**Suite: 106 passing**, up from 54. ⚠️ **Ten sabotages, ten distinct failures** — narrowing
`validateUserInfo` on `providerId` (the library's own documented example, and a fail-open gate)
reddens three; softening `requireEnv` to `|| ''` reddens six; flipping `disableSignUp`, dropping
`onAPIError.errorURL`, hardening `sameSite` to `strict`, enabling `cookieCache` and making the
comparison case-sensitive each redden their own; widening the middleware's asset skip to every path
reddens twelve; removing a *mode*'s `external` reddens exactly one, by name. Typecheck and build
clean.

**Four things this session decided rather than transcribed:**

- **One `overrides` entry, not `--legacy-peer-deps`.** `better-auth`'s optional `vitest` peer is
  `^2 || ^3 || ^4` and this repo is on 5. The override is scoped to one subtree; the flag would turn
  off peer checking for the life of the project. `better-auth` is pinned **1.7.3 exactly** — a
  seventh pin in `03` §13.5, because `08` §7's regenerate-and-diff practice needs a known version.
- ⚠️ **The `external` guard is a click, not a browser** — and #5 is what forced the question, by
  gating both *modes* out of the e2e tier's reach. `11` §6.1 is amended; see § Carrying.
- **`better-auth/minimal`** rather than the default entry point, which carries Kysely.
- **`08` §10 gained the `schemaName` it omitted**, which would have undone #4's correction.

**Phase 6, #4 — the schema, 2026-09-09.** **Eighteen tables plus the auth library's four, in one
migration set**, with the tier that tests them. `server/db/schema/` is `04` as Drizzle, split
`shared.ts` / `personal.ts` / `auth.ts` on **`04` §4's own label** rather than on filing convenience —
the label is what decides whether an owner foreign key is `RESTRICT`. All twenty-one indexes of §11,
all eighteen `RESTRICT`s of §9, and the one trigger of §14 are in, and `drizzle-kit check` agrees the
migrations and the schema have not forked.

**The schema tier is fifteen tests in 1.8 s**, built by the real migrations through
`drizzle-orm/pglite/migrator`. ⚠️ **Each guard was checked by sabotage, not assumed**: dropping the
trigger reddens three tests, flipping `review_log → card` to `CASCADE` reddens two, making the
partial index non-unique reddens one, and flipping every `owner_id` to `CASCADE` — the copied ORM
default `04` §3 exists to refuse — reddens exactly the test that names it. Eight sabotages, eight
distinct failures. Suite: **54 passing**. Typecheck and build clean.

**Two things this session decided rather than transcribed**, both now ADR-or-log:

- **ADR 0040** — the app connects with `drizzle-orm/node-postgres` and `pg`, not
  `@neondatabase/serverless`. `03` §4.1 settled which *string* each process gets and never which
  client opens it. The deciding reason is ADR 0022 one step out: **do not depend on the current
  host's shape**, or the move stops being a preset change. ⚠️ `neon-http` would also have made a
  schema decision by accident — it has no session, so it cannot run `04` §9.1's `Z` un-mint as one
  transaction, which is the only thing that gives the `RESTRICT` guard something to protect.
- ⚠️ **The Better Auth generator's documented flags produce the wrong output**, and both documents
  that prescribed them are amended. See § Carrying.

**Phase 6, the spec and the route — 2026-09-08.** `/to-spec` published **issue #1**, scoped to
ADR 0001's first milestone; `/to-tickets` published **#2–#14**, thirteen tracer-bullet tickets, every
one labelled `ready-for-agent`, every one citing the document section it came from, every one listing
its blockers by real issue number. The three missing triage labels — `needs-triage`, `needs-info`,
`ready-for-human` — were created in the same session, so all five canonical roles now exist.

Two decisions from that session that are invisible in the tickets themselves:

- **The outbox and the `S9` flag are one ticket, #13**, not two. ADR 0039's third property — *replays
  in order, never merges* — is only assertable across **two entry types in one stream**, so splitting
  them would have made the property untestable in the first half. The breakdown was drafted as
  fourteen tickets and merged to thirteen on Yuta's call.
- **#12 (Review) is blocked by #10 (Vet mechanics), not by #11 (Vet presentation).** Review needs
  minted *cards*, which #10 delivers; the *facts strip* and the provenance marker do not gate it.
  Confirmed rather than assumed.

**Phase 5 — complete 2026-09-08.** `/setup-matt-pocock-skills` ran. `docs/agents/issue-tracker.md`,
`triage-labels.md` and `domain.md` are written, `CLAUDE.md` § Agent skills points at all three, and
`.claude/settings.json` is committed with `mattpocock-skills` on, `frontend-design` and `superpowers`
off. **No `.mcp.json`; none is needed.** This was Phase 5 of `/project`, run out of the skill's
numbered order because the grilling had to produce the ticket material first.

**Phases 1–3 — complete.** Brief, PRD, design exploration, design system. The canvas link at the top
of [`05-design-system.md`](05-design-system.md) is still the only copy of the six artboards, and that
file holds every value that matters.

**Phase 4, Round 1 — closed 2026-09-06.** Nine questions, seven ADRs (0013–0019): navigation and
rendering, session durability, where ingestion runs, the grade set, identity, the model provider,
the tokeniser.

**Phase 4, Round 2 — closed 2026-09-06. §4.12 is finished.** The brief's last open question.

| # | Question | ADR |
| --- | --- | --- |
| 6 | The framework | [0020](adr/0020-nuxt-is-the-framework-because-a-route-can-ship-no-javascript.md) — **Nuxt 4.5.2**, Vue |
| 7 | The database | [0021](adr/0021-postgres-is-forced-by-two-writers-not-chosen.md) — **Postgres**, Drizzle |
| 8 | The host | [0022](adr/0022-the-first-deployment-is-deliberately-temporary.md) — **Vercel + Neon + a local worker** |

**Phase 4, Round 3 — closed 2026-09-06. The frontier is empty.** Nine questions, six ADRs
(0023–0028) plus one full log entry, and two verification sections. The five design questions left
hanging at the end of Round 2 are answered; so are the three stack follow-ups.

| # | Question | Outcome |
| --- | --- | --- |
| 1 | Keys, and whether vetting has an undo | [0023](adr/0023-space-is-the-forward-action-and-z-is-the-confirm.md) — `space` forward, `Z` instead of a dialog |
| 2 | Four ink values failing WCAG AA | [0024](adr/0024-four-greys-that-pass-not-seven-that-do-not.md) — **seven greys become four** |
| 3 | A focus state | [0025](adr/0025-one-focus-ring-and-the-modes-do-not-draw-it.md) — one token, modes draw no ring |
| 4 | The spacing scale | Regularised to ten 4pt steps — log entry, no ADR |
| 5 | The phone layout | [0026](adr/0026-review-is-the-only-screen-that-gets-a-phone-layout.md) — *Review* only, **and every mode gains a Done control** |
| 6 | The note's storage shape | Deferred again, deliberately, to `04` — **closed there 2026-09-06**, [ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md) |
| 7 | The Python driver | [0027](adr/0027-psycopg-3-is-the-driver-and-neons-table-is-not-a-support-list.md) — psycopg 3, the objection was a misread page |
| 8 | `noScripts` on Vercel | Verification §8 — **it survives**; ADR 0020 amended |
| 9 | The worker's dropped listener | [0028](adr/0028-the-job-table-is-the-truth-and-notify-is-only-an-optimisation.md) — the job table is the truth |

**[`03-technical-design.md`](03-technical-design.md) — written 2026-09-06.** Eighteen sections. It
carries ADR 0028's worker loop (`LISTEN` **then** poll, on every connect and reconnect), the two
connection strings, the psycopg floor as a reason, the current `noScripts` API names, the
construct-`Dictionary()`-once rule, both pipeline findings, ADR 0007's outbox shape and ADR 0013's
split. **The security baseline is §13 and is answered in full.** No schema, no code.

It made **four new decisions**, all logged in [`06-decision-log.md`](06-decision-log.md) and none of
them a stack question: the dictionary version joins ADR 0010's cache key; the *subject* declaration
is language-neutral JSON owned by neither toolchain; a client-stamped *grade* is validated on
replay; Drizzle owns every migration and the worker never issues DDL.

**[`04-database-schema.md`](04-database-schema.md) — written 2026-09-06.** Eighteen tables plus the
four Better Auth owns. **It closes the last two open questions in the project.**

- **The note's storage shape** — [ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md).
  `note.fields` is one `jsonb` document; `note_field_provenance` is relational. ADR 0021's
  recommendation survives **on a different argument than the one it was made on**: the row-lock half
  of Postgres §8.14.2 is weak at one reader, and what decides it is that ADR 0018 made the model
  choice a *measurement*, and that measurement is an aggregation across notes that a GIN index
  cannot serve. The cost is one derived column, `note.identity_key`.
- **The owner foreign key** — directly at `auth."user".id`, typed `text`, **`ON DELETE RESTRICT`**.
  Full entry in the decision log.

Also in it, and worth knowing without opening it: **scheduling state lives on `scheduling_epoch`,
not on `card`**, so a reset is an `INSERT` and the irreplaceable data is never in the path of an
`UPDATE`; **one trigger exists in the whole schema**, making `review_log` append-only; and the
stale-job sweep runs **in the worker**, because ADR 0022 forbids a Vercel Cron dependency.

**[`08-authentication.md`](08-authentication.md) — written 2026-09-06.** Mostly citation, as
expected. **Three things it actually decided**, plus [ADR 0030](adr/0030-the-session-is-read-in-server-middleware-and-a-place-never-reads-it-from-the-client.md):

- **The session is read in one Nitro server middleware**, into `event.context.session` — ADR 0030.
  `03` §2.2 left this open and it was the one real collision in the document: Better Auth's
  documented Nuxt fix is `<ClientOnly>`, which renders **nothing** on a `noScripts` route, and all
  three *places* are those routes. ⚠️ It also **forbids `prerender`, `swr` and `isr` on the three
  *places*** — each is the ordinary advice for a form, a list and five numbers, and each silently
  disables the gate.
- **The allowlist is one environment variable**, `KIOKU_INVITED_EMAIL`. ⚠️ The load-bearing half is
  the *shape*: a list-shaped allowlist admits everyone when the list is empty, and Better Auth's own
  documented example narrows on the provider first, which fails open. Neither is used.
- **`sameSite: "lax"`, `path: "/"`, written out rather than inherited.** ⚠️ `strict` **breaks
  sign-in** — `defaultCookieAttributes` applies to the OAuth state cookie too, and a `Strict` cookie
  is not sent on the top-level redirect back from Google.

Also in it, and worth knowing without opening it: **there are six routes, not five** — `/auth` is the
door, ships JavaScript, and is neither a *place* nor a *mode*; `/auth/refused` is a `noScripts` page
with a message and deliberately nothing else. **`session.cookieCache` is off** because it would keep
a revoked session alive for its window.

**[`09-user-flows.md`](09-user-flows.md) — written 2026-09-07.** Nine sections. The twelve stories
walked end to end, with the concrete path of every route, which nothing had named. **Four things it
decided**, three of them ADRs:

- **`/` is Ingest**, permanently, and it inspects nothing — [ADR 0031](adr/0031-the-landing-route-is-ingest-and-never-a-decision-about-data.md).
  `08` set `callbackURL: "/"` without saying which screen that was. A chooser was rejected because
  the version worth building would land the reader in a *mode*, on their first sight of the app,
  with no navigation on the screen.
- **A *mode* is entered from a start control carrying its own count**, present on all three *places*
  and never disabled — [ADR 0032](adr/0032-a-mode-is-entered-from-a-start-control-and-done-is-the-only-way-out.md).
  ⚠️ **The exit has to be `external`** or Nuxt client-renders a *place* into the already-hydrated
  page, which is what `noScripts` exists to prevent, with no error (verification §12.1).
- **⚠️ ADR 0013 did not close the empty-*Vet* gap and could not** — the gap is on *Vet*, ADR 0013
  made *Vet* a mode, and a mode has no navigation. Done plus the affordance the canvas already drew
  is what closes it. `09` §8.
- **Done in *Vet* ends the run and spends the undo; Done in *Review* spends nothing** —
  [ADR 0033](adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md). It asks once, only when the
  run holds a rejection, and `Z` works up to the answer.
- **`S12`'s export is triggered from Stats**, as a plain `<a href="/api/export">` — full entry in the
  decision log. A link that downloads is the one write-shaped action a `noScripts` *place* can
  perform with no mechanism at all.

Also in it, and worth knowing without opening it: ***Vet* has three empty states, not one** — PRD §4
wrote one, and "nothing to vet yet, an ingestion is running" is a normal event under `S2`, not an
ending. **The streaming queue is visible on *Vet*, not on Ingest**, because Ingest has no client and
no *place* auto-refreshes. **Ingest reports what the job table knows and does not diagnose a dead
worker** — `heartbeat_at` only ticks while working, so an idle worker and an absent one look
identical, and "queued for four minutes, not picked up" is the honest sentence. **Hard-deleting a
*source* has no route in v1.**

⚠️ **It also generates two amendments to written documents**, both in the decision log's carried
list: `04` §9.1's "there is no path" to delete a `card` needs the `Z` exception, and `03` §8.1's
outbox carries `S9` flags as well as *grades*. **Both were applied 2026-09-07 while writing `10`.**

**[`10-screen-specifications.md`](10-screen-specifications.md) — written 2026-09-07.** Eleven
sections, seven screens, **nine new components and four screens that need none.** Mostly citation.
**Five things it decided**, three of them ADRs:

- **The grade labels** — [ADR 0034](adr/0034-the-grade-labels-name-recall-because-they-cannot-name-a-time.md).
  `1 Forgot · 2 Hard · 3 Good · 4 Easy`. ⚠️ **`Again` does not survive**: ADR 0016 turned same-day
  relearning off, and verification §13.1 read `ts-fsrs` at the pinned version — `LongTermScheduler`
  schedules every grade in **days** and `next_interval` clamps at `Math.max(1, …)`, so the soonest a
  graded *card* returns is **tomorrow**. Copying Anki's word for a ten-minute return it cannot make
  teaches the reader something false. `Forgot` names the lapse the library itself counts.
- **The five interaction states are not a set** — [ADR 0035](adr/0035-five-interaction-states-is-not-a-set-and-three-screens-have-three.md).
  ⚠️ **Ingest, Sources and Stats have three, not five.** Loading and error are client concepts and
  those routes ship no JavaScript: loading is the browser's, and an error is a re-rendered document
  (`09` §4.2). Also: **nothing in v1 is disabled**, so `--k-disabled` is not a token.
- **Grade by swipe is refused** — [ADR 0036](adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md).
  ADR 0026 deferred it here by name. ⚠️ **SC 2.5.1 Pointer Gestures is Level A** and SC 2.5.7 is
  Level AA (verification §13.2), so a gesture owes a single-pointer equivalent — the four controls it
  was meant to replace. **Swipe was only ever additive**, which removes the trade the deferral
  assumed.
- **The Done cluster** — the footer legend's own cap-plus-label, at the right of the mode's header.
  On *Review* the header is a three-column grid with a spacer the width of the cluster, so **the rail
  stays optically centred**. On the phone the cap is dropped, because a phone has no `Esc`.
- **The start block** — `05` §7's quiet affordance, **minus its accent arrow**, in the page body
  rather than the bar. Full entries in the decision log for both.

⚠️ **It also amends ADR 0025**, under that ADR's own revisit condition, which fired exactly as
written: *Review*'s end screen has three focusable elements, so **a mode draws no ring while it is
running and draws it on the screens where it has stopped.**

⚠️ **And it found that the key map is regulated.** Verification §13.4: ADR 0023's keys are all
printable characters, so **SC 2.1.4 Character Key Shortcuts (Level A)** applies, and the application
passes only on the "Active only on focus" exception — which is true *because* ADR 0025 holds focus on
the mode container. **Binding the keys to `document` moves the app from passing a Level A criterion
to failing it, with nothing on screen to show it.** It is now a test in `11`'s list.

Also in it, and worth knowing without opening it: **no new colour token and no sixth measure** —
hover borrows `--k-key-face` and active borrows `--k-ink-ground`, and the three undrawn *places* take
existing measures. **`05` §5's three ambiguous spacing values are closed** — `14 → 12`, `30 → 28` as
a gap and `30` stays as padding, and `10` was never a gap at all. ***Vet*'s edit fields are
single-line in value but `<textarea>` in element**, because a 27px Japanese example sentence wraps by
construction and an `<input>` would scroll it out of sight. **The refusal page has no rule**, and the
absent rule is the specification. **The flagged rail tick is 2px tall rather than a new colour.**

**[`11-testing-plan.md`](11-testing-plan.md) — written 2026-09-07. The last document.** Ten
sections. The twelve stories mapped to tests, five tiers, and what is deliberately not tested.
**Five things it decided**, three of them ADRs:

- **A measured criterion is reported, not asserted** — [ADR 0037](adr/0037-a-measured-criterion-is-reported-not-asserted.md).
  ⚠️ `S3`'s median and `S10`'s numbers get **no threshold assertion**. A test asserting `median < 5`
  is a test of its own fixture, and ADR 0018 walks the model *down* until *acceptance rate* degrades
  — the number has to be free to fall. What the suite asserts is that each number is **recorded
  correctly**, including the nineteen/twenty suppression boundary, which is `S10`'s only branch.
- **Two test databases** — [ADR 0038](adr/0038-two-test-databases-split-on-the-line-adr-0019-already-drew.md).
  ⚠️ **The premise inverted under measurement.** "A mock cannot fail a foreign key" is true and
  irrelevant: **PGlite is PostgreSQL 18.3**, measured because its docs never say so, and it refuses
  every `RESTRICT`, trigger, partial index and `CHECK` in `04` — in **946 ms, no Docker**. It is
  single-connection, so the worker's three concurrency behaviours get a real container. That line is
  ADR 0019's, not a new one.
- **The outbox shares a property list, not a harness** — [ADR 0039](adr/0039-the-outbox-pattern-shares-a-property-list-not-a-harness.md).
  Three instances, three processes, two languages. **Five written properties, three harnesses.**
- ⚠️ **The `noScripts` smoke test is promoted from experiment to test**, and it was always three
  assertions plus a config check — `$fetch` returns the HTML (verification §14.3). It leaves the
  first-week list.
- ⚠️ **The key-handler binding is tested by behaviour, not location.** Where a listener lives is not
  assertable; that `R` does nothing while focus is on the Done anchor is. Written down as a proxy.

Also in it, and worth knowing without opening it: **the test database is built by Drizzle's own
migrations** (`drizzle-orm/pglite/migrator`), because a hand-written test schema is the drift `04`
§13 exists to refuse. **Model quality is not tested** — ADR 0018 made it a measurement and
verification §3 found no benchmark, so generation tests use recorded fixtures and never call a
provider; what is tested is the boundary. And **`S3`'s first real run of twenty notes joins the
first-week list** as an experiment with a written-down expectation.

**[`phase-4-verification.md`](phase-4-verification.md) — the facts, checked, with sources.** Now
**fourteen** sections. §1–4 from Round 1 (FSRS, Better Auth, LLM pricing, tokenisers); **§5–7 added in
Round 2** (frameworks, database, hosting + Neon + the SudachiPy measurement); **§8–9 added in
Round 3** (`noScripts` under the Vercel preset; the Python driver and what scale-to-zero does to
`LISTEN`); **§10 added while writing `04`** (Postgres 18's `uuidv7()`; Better Auth's generated
Drizzle types and its cascades); **§11 added while writing `08`** (the cookie defaults, the OAuth
state cookie, the server-side session read, and three route rules that would disable the gate);
**§12 added while writing `09`** (`<NuxtLink external>` as the only real mode exit; `SameSite=Lax`
excluding cross-site `POST`); **§13 added while writing `10`** (what `enable_short_term: false`
actually does to grade 1; the three WCAG criteria the screens are measured against; and the Level A
criterion the key map turns out to be subject to); **§14 added while writing `11`** — and
⚠️ **§14.1 is a measurement, not a citation**: PGlite's PostgreSQL version is not stated in its own
documentation, so it was installed and queried.
Everything against primary sources. **Do not re-run this.**
Re-verify only if older than ~3 months.

⚠️ **§11.1 supersedes the ⚠️ in §2.2.** `sameSite` and `path` are no longer unverified: `lax` is in
the security reference and `path: "/"` is a hard default in `createCookieGetter`. §2.2 is left as
written because §1–9 are not edited.

Seven findings worth knowing without opening it:

- **SudachiPy's dictionary is memory-mapped and loads in 9 ms**, at 93–136 MB steady-state RSS —
  measured, because no published figure exists. It was never the cold-start cost anyone feared, and
  that killed half of ADR 0015's reasoning. **Construct `Dictionary()` once per process** — each
  construction adds its own mapping.
- **`kuromoji`'s dictionary has been frozen since 2007** and lacks 令和. The obvious JS tokeniser is
  a trap; Sudachi's `normalized_form()` is ADR 0006's dedup key for free.
- **No published benchmark tests Japanese structured extraction.** ADR 0018 makes the model a
  boundary because of it. Do not let a future session "just pick the best model" from docs.
- **Blog claims of an "FSRS-7" could not be corroborated.** FSRS-6 is current.
- **Only three of seven frameworks can make a route ship zero JavaScript.** That, not taste, is why
  ADR 0020 landed where it did.
- **`noScripts` occurs in zero files in `nitropack@2.13.4`** — the exact version Nuxt 4.5.2 pins. The
  Vercel preset cannot drop a rule it never reads, and the rule runs inside the handler the preset
  packages verbatim. **Neither vendor documents this and nothing upstream tests it**, so the
  fifteen-minute smoke test survives as regression cover, not as investigation.
- **Neon's driver table is a SNI-compatibility list for non-libpq drivers, not a support list.** An
  earlier session read a page that contains no driver list at all. psycopg 3 is Neon's own documented
  Python driver.

## Next

⚠️ **2026-09-21: the reader's run started, and its first *session* produced
[ADR 0069](adr/0069-the-check-is-the-grade.md) and three tickets.** The typed check becomes the
*grade* with no override; a refused meaning can become the reader's synonym; a *note* carries a list
of accepted meanings; a kana-only term skips the reading step; and a kanji's reading typed for the
word's becomes a retry.
- ~~[#27](https://github.com/yutaasakura96/kioku/issues/27) — kana-only terms skip the reading step.
  Small, `ready-for-agent`.~~ ⚠️ **Built 2026-09-21** (§ Done).
- ~~[#28](https://github.com/yutaasakura96/kioku/issues/28) — the check is the *grade*, accepted
  meanings, reader synonyms, and the backfill. `ready-for-agent`.~~ ⚠️ **Built 2026-09-21** (§ Done)
  **and its backfill has run on Neon.** `--estimate` said $0.17–$0.31 for 475 *notes*; Yuta approved,
  and `--run` wrote **475 lists in 12 requests for $0.1654**, none unanswered (2026-09-21). Output
  came to about 26 tokens a *note*, under the assumed 30–60.
  ⚠️ **The backfilled lists are narrow, and 見る is the proof**: its list is *to see, to have a
  dream, to dream, to view* — no *look*, so the reported failure still fails on that *card*.
  `backfill-v1`'s prompt says *stay within the sense the given meaning names*, and the model read the
  gloss's sense literally. `generate`'s v5 prompt asks for near-synonyms and does not have this
  shape. The designed answer is `S` in the reader's next *session*; the alternative, deleting the
  rows and re-running a loosened prompt, is about $0.17 again and Yuta has not asked for it. ⚠️ The backfill spends model money, and Yuta
  approves that run. ⚠️ **Yuta chose `S` on 2026-09-21**: the lists stay as backfilled, he adds
  *look* in his next *session*, and `synonymCount` is the signal for whether a re-run is ever owed.
- [#29](https://github.com/yutaasakura96/kioku/issues/29) — KANJIDIC2 research. The build ticket
  waits on Yuta's licence call. ⚠️ **The research is written as of 2026-09-21**:
  [`kanjidic-research.md`](kanjidic-research.md), with six calls for Yuta in §7. The licence is
  CC BY-SA 4.0, and EDRDG §4 also requires regular updates: stale data "is a violation of the
  licence". Re-read at the source the same day. ⚠️ **Yuta made the calls the same day** (research
  §7): commit a derived table with a notice and a monthly manual refresh; the acknowledgement goes
  in a notice file and a footer line; **the reach is all three classes, compounds included**, which
  goes past the research's recommendation; the server computes each position's candidates; one
  retry per step; the message names no reading. ~~**The build ticket is
  [#30](https://github.com/yutaasakura96/kioku/issues/30), `ready-for-agent`, and it is the
  frontier.**~~ ⚠️ **#30 built 2026-09-21** (§ Done); #29 is closed. No `ready-for-agent` ticket is
  left.
~~⚠️ **Until #28 lands, the digits still override**, and a correct meaning the check refuses can be
committed as `3`.~~ ⚠️ **#28 landed: the check is the *grade*, and `S` is the answer to a refusal.**

⚠️ **The 2026-09-16 pivot is decided. Five ADRs, 0062 to 0066, and seven issues, #19 to #25.**
It was agreed in conversation on 2026-09-16 and written down the same day. **Read the ADRs, not this
paragraph** — what follows is an index.

- **[ADR 0062](adr/0062-retention-and-consistency-are-the-headline-and-acceptance-rate-retires.md)** —
  *acceptance rate* and *seconds-per-note* are retired. **Retention** (Good or Easy over reviews of
  *cards* in the Review state, trailing 30 days) and **consistency** (days studied over 30) are the
  headline; **flag rate** checks the model's fills; *time-to-first-review* and the cost figures
  survive. ⚠️ **The cost is named in the ADR**: ADR 0018's model walk loses its fast instrument and
  gains one that takes weeks.
- **[ADR 0063](adr/0063-the-input-is-a-chosen-word-list.md)** — `source.kind` is `word_list`, `prose`
  or `anki`, and the *subject* declares one pipeline per kind. Word lists chunk at 25 terms and run
  `normalise` instead of tokenisation and candidate extraction. ⚠️ **The 474 *pending notes* become a
  cache rather than a backlog.**
- **[ADR 0064](adr/0064-a-chosen-word-mints-its-cards-on-arrival.md)** — a chosen word is `accepted`
  when it is written and mints its *card* in the same transaction, owned by `job.requested_by`.
  *Vet* becomes the flag queue with fix, keep and drop. ⚠️ **This is the re-vetting ticket ADR 0056
  owed**, and `note_vetting.flagged_at` finally has a reader. ADR 0052's freeze lifts for a flagged
  *note* and nothing else.
- **[ADR 0065](adr/0065-a-domain-is-a-claim-like-a-level-and-the-filter-only-touches-new-cards.md)** —
  *domain* and *level* are attributed claims, filled by the model from closed sets the *subject*
  declares. `domain_claim` mirrors `level_claim`. ⚠️ **A filtered *session* filters the new half
  only**: what is owed is owed.
- **[ADR 0066](adr/0066-the-review-load-has-a-brake.md)** — ten new *cards* a day, none while fifty
  are due, counted at composition on `review_session.new_count`, over a local day starting 04:00.
  The backlog is ordered by `get_retrievability` ascending. ⚠️ **Nothing caps due reviews.**

⚠️ **[#21](https://github.com/yutaasakura96/kioku/issues/21) built 2026-09-18 (§ Done). No
`ready-for-agent` ticket is left.** #24 opens with research into the `.apkg` format and shared decks'
licences, and #25 has four open questions in its body; both are `needs-triage`, and triaging them is
a conversation with Yuta rather than an `/implement`. ~~⚠️ **What unblocks real use is not a ticket**:
`npm run db:migrate` against Neon, for `0003`, `0004` and `0005`, then the reader's run.~~
⚠️ **Neon is at `0005` as of 2026-09-19 (`0003` already was). What is next is the reader's run** —
a *session* of the 39 *cards* already minted.

⚠️ **#24's research half is done as of 2026-09-19**: [`anki-apkg-research.md`](anki-apkg-research.md)
(58be8ea). It recommends a stdlib reader in the worker with `zstandard` as a floor, imported *notes*
that feed `generate`, and media out of scope. ~~#24 is still `needs-triage` and waits on three calls
by Yuta~~ ⚠️ **Yuta made all three calls on 2026-09-19** (research doc §6): deck text may go to the
model provider and be stored on Neon; deck level tags are **a hint to the model only**, never a
`level_claim`; and real decks were downloaded for measurement (§1.3). ⚠️ **AnkiWeb served
`LEGACY_2`** for one deck. Open Anki JLPT N3, N2 and N1 are in `~/Documents/kioku-decks/`,
**outside the repo, and never to be committed**. Their tags turned out to be cumulative, which
confirms the hint-only call. ~~**What is next for #24** is its build ticket and the
skip-or-feed-`generate` ADR. The research recommends *feed*.~~ ⚠️ **Both exist as of 2026-09-19.**
[ADR 0068](adr/0068-an-imported-deck-is-unpacked-by-the-app-into-a-word-list-that-feeds-generate.md)
decides *feed*, and it **moves the reader from the worker to the app**, on `node:zlib` and
`node:sqlite` with no new dependency. The app owns `chunk` and writes `source_chunk` at submit, and
research §4.3 had missed that. It also drops the deck's meaning from the hint, because with it every
real deck is over `S2`'s cap. ~~**The build ticket is
[#26](https://github.com/yutaasakura96/kioku/issues/26), `ready-for-agent`**, and it is the frontier.
#24 stays open, with no triage label, until #26 lands.~~

⚠️ **[#26](https://github.com/yutaasakura96/kioku/issues/26) built 2026-09-20 (§ Done), so #24 is
closable and the frontier is empty of `ready-for-agent` work again.** The reader reads all three
layouts with no dependency, and it read all four real decks in `~/Documents/kioku-decks/` with no
note dropped. ⚠️ **One decision moved under the build**: the re-measurement ADR 0068 §3 asked this
ticket for found that carrying a deck name whole makes it the **largest** column in the *source* —
43,171 to 62,077 code points across the four decks, more than term and reading together — and puts
the N3 and N1 decks over `S2`'s cap. A deck name now contributes only the words in it that name a
level (ADR 0068 § Amended 2026-09-20), and all four then fit at 54,318–76,984. ~~**Yuta has not
reviewed that narrowing**, and it is a change to a sentence he read.~~ ⚠️ **Reviewed and kept,
2026-09-20.** He was given the two alternatives — carry the name whole and raise `S2`'s cap, or drop
the deck name and rely on tags — and took neither: the cap limits spend (ADR 0068 § Alternatives)
and a deck that encodes its levels as subdecks has no other level signal (research §2.4).
**#26's checklist described the old behaviour and was corrected on the ticket the same day.**
~~⚠️ **And one close-out criterion is unpaid and needs a deployment**: whether `os.tmpdir()` is
writable in a Vercel Function (ADR 0068 §2). If it is not, the ADR needs amending — `deserialize()`
wants Node ≥ 24.16 and `package.json`'s `engines` still admits 22.x.~~
⚠️ **Paid 2026-09-20, and not by a deployment — by reading the page §2 had not read.** Vercel's
**Functions → Runtimes**, under *File system support*: *"Vercel functions have a read-only
filesystem with writable /tmp scratch space up to 500 MB."* Functions Limits and Node.js versions,
the two §2 checked, are still silent — re-read the same day, zero matches for `/tmp`, `read-only` or
`ephemeral`. And `os.tmpdir()` only leaves `/tmp` when `TMPDIR`, `TMP` or `TEMP` is set, which
Vercel's **system** and **reserved** environment-variable lists do not do (zero matches in either).
**So `engines` keeps 22.x, `deserialize()` stays out, and the criterion's *amend the ADR* branch
does not fire** (ADR 0068 § Amended 2026-09-20, the `/tmp` question).
⚠️ **What no page can say is that this app's functions behave that way, and Kioku has no Vercel
project at all** — no `.vercel/`, no `vercel.json`, nothing deployed, as of 2026-09-20. Two
documented facts composed is weaker than one write. **The first deployment carries the observation**
and ADR 0068 § Revisit names what reopens it; it blocks nothing, because nothing is deployed.

**What is next** is not an `/implement`. Two things, and neither is a ticket:
**the reader's run** — a *session* of the 39 *cards* already minted, which is what gives retention,
consistency and flag rate their first denominator — and **a first real import**, now that there is
something to import with. Then **#25**, AI-seeded lists, whose four open questions are a conversation
with Yuta rather than a build.

~~⚠️ **[#23](https://github.com/yutaasakura96/kioku/issues/23) built 2026-09-18 (§ Done). The frontier
is [#21](https://github.com/yutaasakura96/kioku/issues/21) alone.** The next command is `/clear`,
then `/implement 21`.~~ ~~#21 also carries the reader's timezone~~ — it did, and `/stats` reads it
(§ Done).

~~⚠️ **[#22](https://github.com/yutaasakura96/kioku/issues/22) built 2026-09-17 (§ Done). The frontier
is [#23](https://github.com/yutaasakura96/kioku/issues/23), with
[#21](https://github.com/yutaasakura96/kioku/issues/21) buildable beside it.** The next command is
`/clear`, then `/implement 23`.~~

~~⚠️ **[#20](https://github.com/yutaasakura96/kioku/issues/20) built 2026-09-17 (§ Done). The frontier
is [#22](https://github.com/yutaasakura96/kioku/issues/22) and
[#23](https://github.com/yutaasakura96/kioku/issues/23), with #21 buildable beside either.** #23
(stats) was blocked only by #20. ⚠️ **The next command is `/clear`, then `/implement 22`**, in a fresh
window. #22 before #23 because #23's metrics are easier to read once *notes* carry a *level*.~~

~~**The ticket frontier is [#19](https://github.com/yutaasakura96/kioku/issues/19) alone.**~~
⚠️ **[#19](https://github.com/yutaasakura96/kioku/issues/19) built 2026-09-16 (§ Done). The frontier
is [#20](https://github.com/yutaasakura96/kioku/issues/20) and
[#22](https://github.com/yutaasakura96/kioku/issues/22), and #21 is still buildable beside either.**
The rest are open and blocked or out of order:

```
#19 word lists ─┬─→ #20 mint on arrival, Vet is the flag queue ─→ #23 stats  ✔ all built
                ├─→ #22 domain and level, filtered sessions             ✔ built
                └─→ #24 Anki import (research first)
#21 the brake, and the zone #23 needed                                    ✔ built
#22, #19 ─→ #25 AI-seeded lists (not specified yet)
```

⚠️ **#20 before #22, on one argument.** #20 is what makes a chosen word reach a *card* at all, and
until it lands a word list produces *pending notes* nobody mints — the queue #19 was built to stop
filling. #22 makes the *notes* better and #20 makes them reachable.

~~⚠️ **#24 and #25 are `needs-triage` on purpose.** The Anki format and shared decks' licences are
unverified and that ticket opens with research;~~ #24's research is done and its build is #26 (above).
#25 is still `needs-triage`, and its four open questions are in its body.

⚠️ **Two numbers in ADR 0066 are recommendations Yuta approved as a direction, not as figures.** He
said he did not know what they should be, and ten and fifty are mine. Each has a revisit condition in
the ADR, and the first fortnight of real use is what settles them.

**What carries over untouched:** the worker and its heartbeat, generation and its cache, the
scheduler and ADR 0016's configuration, the outbox, typed *review* (ADR 0060), the *modes* rule and
every keystroke on both screens.


**Phase 6 — Build.** It is a hand-off: the commands that drive it all carry
`disable-model-invocation: true`, so **Yuta types them and no session can start one.**

⚠️ **Amended 2026-09-16 (second time today): #19 is built; the next command is `/clear`, then
`/implement 20`, in a fresh window.** ⚠️ **This line named `/implement 19` for one commit** — the
sixth stale number in this section's history, corrected in the commit that built the ticket rather
than in the one after it, which is the whole of the fix for the pattern.
The frontier is not empty any more. The paragraph below was true from 2026-09-12 to 2026-09-16 and is
struck rather than deleted, because the sentence it corrects is the fifth stale number in this
section's history and the pattern is worth keeping visible.

~~⚠️ **The next command is `/implement 14`, in a fresh window.**~~ ~~⚠️ **#14 is built. There is no
next `/implement`, because there is no next ticket** — and the thing to do instead is **not a
command**.~~ `/to-spec` and `/to-tickets` have both run — issue **#1** is the spec and **#2–#14** are
the tickets, all built — and `/grill-with-docs` is retired with an empty frontier. ⚠️ **What the
milestone is now waiting on is the three first-week experiments** (below): they are `S3`'s and
`S10`'s answers, ADR 0037 makes them a person's job rather than the suite's, and they are in #14's
own closing criteria. **The two tickets that need opening first are named below**: re-vetting a
flagged *note*, and `S12`'s export.

⚠️ **This line was stale for one commit and it is the fourth stale number in a row.** `07513ff`'s
subject is *"record #7 as built and move the frontier to #8"* and it updated the strikethroughs
around this sentence without updating the sentence, which then sent the next session at a ticket
that was already built. Corrected 2026-09-12. **The pattern is the finding**: every ticket so far has
shipped one number that was true when it was written and false when it was read.

~~**⚠️ #3 built 2026-09-10.** The frontier is #6 alone.~~ ~~**⚠️ #6 built 2026-09-11.** The frontier
is #7 alone.~~ ~~**⚠️ #7 built 2026-09-11.** The frontier is #8 alone.~~
~~**⚠️ [#8](https://github.com/yutaasakura96/kioku/issues/8) built 2026-09-12. The frontier is
[#9](https://github.com/yutaasakura96/kioku/issues/9) alone.**~~
~~**⚠️ [#9](https://github.com/yutaasakura96/kioku/issues/9) built 2026-09-12. The frontier is
[#10](https://github.com/yutaasakura96/kioku/issues/10) alone.**~~
~~**⚠️ [#10](https://github.com/yutaasakura96/kioku/issues/10) built 2026-09-12. The frontier is
[#11](https://github.com/yutaasakura96/kioku/issues/11) alone** — *the note as presented, and the
edit path*.~~
~~**⚠️ [#11](https://github.com/yutaasakura96/kioku/issues/11) built 2026-09-12. The frontier is
[#12](https://github.com/yutaasakura96/kioku/issues/12) alone** — *review*.~~
~~**⚠️ [#12](https://github.com/yutaasakura96/kioku/issues/12) built 2026-09-12. The frontier is
[#13](https://github.com/yutaasakura96/kioku/issues/13) alone** — *the outbox, and the `S9`
flag*.~~
~~**⚠️ [#13](https://github.com/yutaasakura96/kioku/issues/13) built 2026-09-12. The frontier is
[#14](https://github.com/yutaasakura96/kioku/issues/14) alone** — *Stats: six figures and the
suppression boundary*.~~
**⚠️ [#14](https://github.com/yutaasakura96/kioku/issues/14) built 2026-09-12. The ticket frontier is
empty.** Every ticket `/to-tickets` published is built. What is owed is **unticketed and named
below**: the re-vetting ticket, `S12`'s export, and ⚠️ **the three first-week experiments, which are
not code and which #14's own closing criteria list** — the first real run of twenty *notes* with a
written-down expectation beforehand, one direct `psycopg.connect()` against the real endpoint, and
whether an idle subscription defers the host's scale-to-zero.
**All three of these lines were written in the same commit as the work they describe**, which is the
whole of the fix for the pattern above — three times now.

⚠️ **Amended 2026-09-13: the frontier is not empty. It is
[#15](https://github.com/yutaasakura96/kioku/issues/15) alone, and it is in front of the first run.**
#15 was `needs-triage` and is now `ready-for-agent` — *the reading half of the identity key is the
surface's reading* — with its rule decided ([ADR 0045](adr/0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md)
§ Amended 2026-09-13) and one of its own acceptance criteria withdrawn as unreachable. ⚠️ **The
ordering is the whole of why it moved.** It changes `note.identity_key`, which `04` §5.3 calls a
reviewed data event with a re-ingestion plan; **no *note* has ever been written, so today it costs
nothing**, and it stops costing nothing the moment the first run mints twenty. Every other unticketed
thing below — re-vetting, `S12`'s export — is indifferent to the ordering. This one is not.

**⚠️ [#15](https://github.com/yutaasakura96/kioku/issues/15) built 2026-09-13. The ticket frontier is
empty again**, and what is in front of it is not a ticket: it is
[`scripts/first-run.sh`](../scripts/first-run.sh), then **Part 1 of
[`docs/first-run-expectation.md`](first-run-expectation.md) filled in before any Japanese is pasted**
(ADR 0037 — a prediction written after the run is not a prediction), then the run itself. What stays
unticketed is below: re-vetting a flagged *note*, `S12`'s export, and the three first-week
experiments.

⚠️ **Amended 2026-09-14: `first-run.sh` is done and the sign-in works** (§ Done). The next thing is
**Part 1 of `docs/first-run-expectation.md`**, then the worker
(`cd worker && uv run --env-file .env python .`), then the run: two pages pasted, twenty *notes*
vetted, *review* on two separate days, `/stats` read.

~~⚠️ **#11 is much smaller than its ticket, and the next session should read this before the
ticket.**~~ **All three of its remaining items are closed** — the contradiction in
[ADR 0051](adr/0051-the-edit-reaches-the-judgement-fields-and-s6-is-amended-to-say-so.md), the
freeze in [ADR 0052](adr/0052-an-accepted-note-is-frozen-against-every-writer-and-any-readers-acceptance-freezes-it.md),
and the arithmetic in `shared/metrics/acceptance.ts`. See § Done.

⚠️ **Opened 2026-09-16 as [#20](https://github.com/yutaasakura96/kioku/issues/20)**, inside
ADR 0064 rather than on its own, and its three decisions are settled there (ADR 0056 § Amendment).
What follows is the statement of the debt, kept because it is still the shortest description of what
#20 has to build.

⚠️ **A ticket is owed and nobody has opened it: re-vetting a flagged *note*.**
[ADR 0056](adr/0056-a-flag-returns-a-note-to-the-queue-through-card-flag-not-by-un-accepting-it.md)
is the argument and #13's § Done entry is the state. It owns five things, and the middle three are
decisions rather than code: the *Vet* queue query over `04` §11's
`card_flag (note_id) WHERE resolved_at IS NULL`; `decide()` against a *note* whose `state` is
`accepted`; **lifting ADR 0052's freeze**, which that ADR names as an argument to have; the **first
*scheduling epoch* reset** in the application (`04` §7.4 — editing a *memory-bearing field*
invalidates what was memorised, and nothing writes one today); and `card_flag.resolved_at`.
⚠️ **Until it ships, `note_vetting.flagged_at` is written and still nothing reads it** — which is
#10's own carried bullet, one step further along.

⚠️ **A second ticket is owed and nobody has opened it either: `S12`'s export.** Issue #1's
out-of-scope list puts it outside milestone 1 — "a `MUST` for v1 and **not part of the loop**" — and
#14 therefore did not build it, so `10` §8.4's `<a href="/api/export">` is **absent from `/stats`**
rather than pointing at a route that does not exist. It arrives as one ticket with three parts,
because `S12` itself says an untested export is a belief: the `GET /api/export` route answering
*notes*, *cards*, *grades* and **every *scheduling epoch* including superseded ones** as JSON with
`Content-Disposition: attachment` (`09` §4.12); the link and its aside on `/stats` (`10` §8.4); and
the test that reads it back and reconciles counts (`11` §4). ⚠️ **`09` §4.12 also carries the one
thing not to rediscover**: `SameSite=Lax` sends the session cookie on a cross-site top-level `GET`,
so a malicious link can start the download and cannot read it — an accepted nuisance at one reader,
written down rather than found.

~~⚠️ **#14 inherits four things, and the first two are arithmetic that will look reasonable and be
wrong:**~~ **All four held.** Positions really did have to be counted rather than rows, `size` really
was a count rather than an intention, `acceptance.ts` really was the thing not to re-derive, and the
boundary really was the only branch. Kept because each is still the shortest statement of a thing the
re-vetting ticket may need:

- ⚠️ **A *session* can hold more `review_log` rows than it has positions**
  ([ADR 0055](adr/0055-later-wins-is-a-second-row-because-review-log-cannot-be-rewritten.md)). PRD
  §5's *later timestamp wins* is a **second row** — the table is append-only, so nothing else was
  available — so a completion rate written as *rows ÷ size* is wrong the first time a reader answers
  a *card* twice, and correct-looking until then. **Count positions.**
- ⚠️ **`review_session.size` is what was composed, not what the knob asked for** (§ Carrying). This
  is what makes *graded ÷ size* correct at all, and the other reading is silently wrong.
- ⚠️ **The *acceptance rate* arithmetic is a pure module and Stats must not re-derive it in SQL**
  (§ Carrying, `shared/metrics/acceptance.ts`). The counts are #14's; the rate is not.
  ⚠️ **And a flagged *note* stays `accepted`** (ADR 0056), which is what keeps *false-accept rate*'s
  denominator from moving every time its numerator does.
- ⚠️ **`S10`'s suppression boundary is the only branch in the story** (`11` §3): nineteen suppresses,
  twenty reports, with raw counts and a line saying why. It governs all four ratios at once, and it
  is off by default in every naive implementation.

~~⚠️ **#13 inherited five things, and the first two are what #12 left it on purpose:**~~
**All five held.** `mergeGrades` really was the rule the outbox had to not break, the rail really did
already have its mark, `apply()` really was the shape the outbox slotted into, the `review_log`
trigger really did decide how the e2e fixtures are written, and the `localStorage` resume really did
go in front of the server rather than instead of it. Kept because each is still the shortest
statement of a thing #14 may need:

- ~~⚠️ **`X` has no key, no legend line and no handler**~~ — **built 2026-09-12**, on **both faces**
  (`10` §5.1), and the rail needed nothing: the flagged tick was already there. The original, kept
  because it is still the shortest statement of what the rail's fourth mark is for:
  ⚠️ **`X` has no key, no legend line and no handler — and the rail already has its mark.** `10`
  §5.1 puts `X — flag` in the footer in both faces and #12 draws neither, because the keystroke
  writes four rows in one transaction (`04` §7.8) and rides the same outbox as a *grade*. What is
  built is `10` §5.3's **flagged tick** in `ProgressRail.vue` — 2px rather than 6px, the graded fill,
  *height and not colour* because ADR 0024 left this palette no grey to spare. So #13 supplies the
  key and the transaction and changes nothing in the rail.
- ~~⚠️ **A *grade* is posted as it is given**~~ — **queued 2026-09-12**, and `apply()` really was the
  shape it slotted into: `send` folds the same answer through the same function, and the only thing
  that changed in it is that a flag moves too. The original:
  ⚠️ **A *grade* is posted as it is given, and `apply()` is the shape the outbox slots into.**
  `app/pages/review.vue` already paints on the keystroke and never waits (`S8`): the *grade* goes
  into a local `given` map, the next *card* renders from the snapshot the client holds, and the
  request is chained behind the last one so two answers cannot land out of order. **What is missing
  is only durability** — a failed request increments `unsent` and the end screen says so (`09`
  §4.8), which is the surfacing rule already met and the retry not built. `03` §8.2's validator is
  #13's named seam (`11` §8) and the *grade* endpoint currently **records** `clock_skew_seconds`
  without judging it.
- ⚠️ **`mergeGrades` is the rule the outbox must not break.** `shared/review/snapshot.ts`: a server
  answer moves the *grades* and never the words, because `snapshotOf` reads `note.fields` live and
  the run is meant to be prefetched as a unit (PRD §5). A replay that installs a fresh snapshot
  wholesale reintroduces exactly the defect review caught in #12 — and `localStorage` (ADR 0014)
  makes it reachable in a second way, because a resumed run would then be reading the database's
  text over the snapshot's.
- ⚠️ **A committed `review_log` row cannot be deleted, and the e2e tier is where that bites.**
  `04` §7.5's trigger refuses the `DELETE`, so `test/e2e/review.test.ts` cannot clean up between its
  two runs and gives each one **its own *card*** instead. § Carrying has carried this since #8 as a
  worker-fixture problem; it is a browser-fixture problem too, and the first `beforeAll` that tries
  to reset a graded *session* fails with the trigger's own message.
- ⚠️ **The *session* resumes from the server, and `09` §4.7 step 2 says `localStorage` first.** #12
  built the durable half: `POST /api/review/session` resumes the live run — the newest with a null
  `completed_at` and something ungraded — and composes only when there is none. ADR 0014's snapshot
  in browser storage is #13's, and it goes **in front** of this rather than instead of it.

~~⚠️ **#12 inherited four things, and the first is the one that costs if it is missed:**~~
**All four held.** The epoch really did belong to the *grade* rather than to the acceptance, the
wrapper really was the seam, the freeze really did refuse the one rewrite that would have mattered,
and #15 really is still in front of *Review* on the screen. Kept because each is still the shortest
statement of a thing #13 may need:

- ⚠️ **The first *scheduling epoch* belongs to the *session* that first schedules the *card*, and
  not to acceptance.** `scheduling_epoch.card_id` is `RESTRICT` (`04` §9), so an epoch minted at
  acceptance makes ADR 0033's `Z` fail on **every** acceptance the application ever makes — with a
  failure that reads like a database problem. `test/schema/vet.test.ts` asserts the **absence**, so
  the day #12 reaches for the obvious place to put the first epoch, the *undo* tests redden rather
  than the *Review* ones. **That redness is the message, not a broken test.**
- **The FSRS wrapper is `11` §8's named seam and it is unbuilt.** Not FSRS itself — `ts-fsrs` 5.4.2
  is pinned and has its own suite. What is ours is the mapping to and from `scheduling_epoch`, and
  that **`enable_short_term` is off** while `enable_fuzz` is on (ADR 0016). A test asserting grade 1
  schedules **at least one day out** catches the configuration regression that would otherwise
  surface as a worse retention curve in six months (verification §13.1).
- ⚠️ **A *card*'s fields are frozen now, and #12 is the ticket that makes that matter.** A *card*
  minted from an accepted *note* points at text the reader confirmed; after #12 there is a review
  history measured against it. ADR 0052's guard is in the `WHERE` of both write paths, so a #12 that
  needs to rewrite a *note* will be refused rather than surprised — and `S9`'s re-vetting path
  (#13) is where lifting the freeze gets argued.
- ⚠️ **#15 is in front of #12 on the screen, not behind it.** The reading is on the answer side of
  the recognition *template* (`10` §5), so the first *card* studied from an inflected word shows it.
  Fixing it changes the identity of existing *notes*, which is why it is its own ticket.

**#10 inherited five things from #9 and all five held.** Kept because each is still the shortest
statement of a thing #11 may need:

- ⚠️ **A *pending note* is already four rows and #10 reads all four.** `note`, six
  `note_field_provenance` rows, a `note_vetting` at `pending`, and one `occurrence` per sighting.
  `S4`'s *foreground the judgement fields* is a join onto the second of those, and ADR 0048 says what
  its `kind` column means.
- ⚠️ **`judgement` is unreachable in `note_field_provenance.kind` and `human` is #10's** (ADR 0048).
  An edit writes `human` with no model and no dictionary; nothing else in the pipeline can produce
  one.
- **Rejecting a *note* already shrinks the next run.** `DatabaseCorpus.rejected` is `04` §12's third
  query and it is owner-scoped and tested; `S5` is satisfied the moment #10 writes a `rejected` row.
- ⚠️ **[#15](https://github.com/yutaasakura96/kioku/issues/15) is in front of #10 on the screen, not
  behind it.** The reading is on the answer side of the recognition *template* (`10` §5), so the
  first *card* #10 mints from an inflected word shows it. Fixing it changes the identity of existing
  *notes*, which is why it is its own ticket rather than a patch inside one.
- **The end-to-end tier can sign in** — #6 paid that, and every *Vet* route is gated.

~~**#9 inherited six things from #8**, none of which needed re-deriving:~~ **All six held.** The
seam really was one parameter, the `Group` really did carry every sighting, the streamed write really
did close the cross-chunk duplicate, three of the four key parts really did already exist, `is_oov`
really was already on every *candidate*, and ADR 0046's ceiling really did matter the moment the
handler started making network calls. Kept because each is still the shortest statement of a thing
#10 may need:

- ⚠️ **The seam is one parameter, again.** `ingest.make_chunk_processor(job, *, generate=None)`
  already runs stages 1 to 5 and calls `generate(connection, group)` once per surviving group. #9
  supplies `generate` and wires it in `__main__.py`; nothing else in `runs.py` or `ingest.py` has to
  move. `worker/tests/test_ingest.py`'s `Recorder` is the shape of what it replaces.
- **A `Group` carries every sighting**, not just the first. `group.sightings` is what stage 7's
  *occurrences* are written from once the *note* exists — `ingest.append_occurrences` already does
  exactly that for the corpus-hit case and is the function to reuse.
- ⚠️ **Cross-chunk duplicates are closed by the streaming write, not by stage 4.** A *chunk* is
  tokenised independently, so a word in chunks 1 and 3 is two groups. `03` §5.1 stage 7 says *notes*
  are written **as produced, not at the end**; that is what makes chunk 3's sighting an
  `already_known` rather than a second generation. **If #9 batches the writes to the end of a run, it
  pays twice for every word that spans chunks.**
- **The cache key is four parts and three of them exist.** `04` §6.3's row is
  `(content_hash, dictionary_version, prompt_version, model_id)`; `source_chunk.content_hash` is
  written by #6 and `pipeline.tokenise.DICTIONARY_VERSION` is read from the installed package. #9
  brings the other two.
- **`is_oov` is already on every *candidate***, carried rather than consumed, because `04` §5.4 keeps
  it on `note_field_provenance` to tell a looked-up reading from a generated one (ADR 0019).
- ⚠️ **A job can now fail for good** (ADR 0046), which matters more to #9 than it did to #8: the
  handler is about to start making network calls.

**#8 inherits five things from #7**, none of which needs re-deriving:

- ⚠️ **The seam is one argument.** `worker/runs.py`'s `run_ingestion(connection, job, *,
  process_chunk)` opens the queue, marks each chunk `running`, calls `process_chunk`, marks it
  `complete` or `failed`, heartbeats, and settles the run. **#8 supplies `process_chunk` and needs to
  change nothing else in the loop.**
- **The chunk queue is open by the time #8's code runs**, with `char_start` / `char_end` already
  joined onto each row. ⚠️ They are **code-point offsets**, so `source.content[start:end]` in Python
  is simply correct — which is the point of § Carrying's `.length`-versus-`len()` bullet: the app was
  made to match Python rather than the other way round, so the worker needs no special handling and
  must not add any.
- ⚠️ **Chunk-level retry policy is not built.** `03` §11 says bounded retries then the chunk is
  marked `failed` and the job stays resumable; #7 marks it `failed` on the first raise and moves on,
  which is the `attempts = 1` version of that. **`job.available_at` is the other half and nothing
  sets it** — see § Carrying.
- ✔ **`03` §13.5's container half of PIN 6/6 is guarded** — `worker/tests/conftest.py`'s
  `_assert_postgres_18`, before the migrations run, so a Postgres 17 says so in one line instead of
  failing on the first `uuidv7()`.
- **The end-to-end tier can sign in**, if #8 ever wants a request behind the gate.

~~**#5 closed 2026-09-09.** #6 and #3 are independent; either can go first.~~ **#3 went first.**

~~⚠️ **#6 also inherits a debt #5 could not pay: the e2e tier can no longer see a signed-in
document.** `11` §6.1 points at #10; if #6 finds it needs an authenticated request sooner, that is
the ticket to argue it on.~~ ⚠️ **#6 found it needed one and argued it — paid 2026-09-11.** PGlite
behind `@electric-sql/pglite-socket`, a session row, and a cookie signed in the test. **#10 still
owes the browser; it no longer owes the context.** `11` §1 and §6.1 are amended.

~~**#4 closed 2026-09-09**; the frontier is #3 and #5.~~ **#5 closed the same day.**

**⚠️ [#2](https://github.com/yutaasakura96/kioku/issues/2) closed 2026-09-09** — `86144de`, merged to
`main`. **There is code now.** ADR 0020's revisit condition is a passing test rather than a plan, and
each of its three guards was checked by sabotage rather than assumed: removing `external` fails
assertion 2, dropping `/stats`'s `noScripts` fails three tests, setting `features.noScripts: 'all'`
fails the seam test. The dependency bot arrived in the same commit as the first manifest, carrying
all six pins of `03` §13.5. What it left behind is in § Carrying, and **two of those bullets are
findings that amended `11` §1 and §6.1**.

~~**The frontier is now two tickets** — #3 and #4.~~ **#4 closed 2026-09-09**; the frontier is
#3 and #5, above.

**The dependency order, so no session re-derives it:**

```
#2 scaffold ✔ ─┬─→ #3 subject declaration ✔ ┐
              └─→ #4 schema ✔ ─→ #5 identity ─→ #6 ingest ✔ ┐
                                               #4,#6 ─→ #7 worker loop ✔
                                        #3,#7 ─→ #8 pipeline 1–5 ✔
                                                 #8 ─→ #9 generation ✔
                                  #9 ─→ #10 vet mechanics ✔ ─┬─→ #11 vet presentation ✔
                                                             └─→ #12 review ✔
                                                            #12 ─→ #13 outbox ✔ ─┐
                                                             #6,#13 ─→ #14 stats ✔  ← empty
```

**How the rest of the phase runs:** **`/clear`, then `/implement <n>`** — one ticket per fresh
window. It drives `/tdd` internally and closes with `/code-review`. ⚠️ **It ran thirteen times and
there is no fourteenth until a ticket exists**: the two owed above have to be opened before this
sentence has an argument again, and the three experiments below are not `/implement`'s work at all.

⚠️ **[`START-HERE.md`](../START-HERE.md) §4 constrains the ticket order** and a session that finds it
late will re-order its own work: ADR 0001's vertical slice comes first, the `noScripts` smoke test is
cheap and falsifies what the rendering split rests on, the first dependency manifest owes a bot in
the same commit, and three experiments block nothing. **The published tickets already honour all
four.**

**Three first-week experiments**, none blocking anything.
⚠️ **Two of the three are done as of 2026-09-12 and the third is the one that needs a person.** Both
infrastructure experiments were run against a real Neon project and both changed something written
down: ADR 0043's open half is closed, ADR 0028's carried contradiction is resolved *against*
`00-status.md`'s own old assertion, and verification §9.1 has two corrected numbers. **What is left
on this list is `S3`'s run of twenty notes, and no session can do it.**

- ~~**The `noScripts` smoke test.**~~ ⚠️ **Promoted to a test 2026-09-07** — `11` §6.1. It leaves
  this list. It was always three assertions plus a config check, and `@nuxt/test-utils`' `$fetch`
  returns the HTML, so the `curl`-and-grep is a `expect(...).not.toContain('<script')`.
- ⚠️ **`S3`'s first real run of twenty notes**, with a written-down expectation. **New here**, and it
  is an experiment rather than a test on purpose (ADR 0037): if the median comes back at eleven
  seconds that is the project learning something, and a red suite is the wrong way to be told.
  ⚠️ **The written-down expectation now has somewhere to be written: `docs/first-run-expectation.md`,
  created 2026-09-12 and unfilled.** Part 1 is filled **before** any Japanese is pasted and `/stats`
  is not opened until it has values in it — a prediction recorded afterwards is not a prediction, and
  the ordering is the only thing that makes this evidence rather than a reading.
  ⚠️ **It is now also the instrument for two decisions** — ADR 0044's candidate allowlist and
  ADR 0045's reading script. Both were decided with no real *source* to look at, and the rejected set
  is the evidence: a filter the allowlist should have made shows up as a cluster of rejections
  sharing a part of speech.
- ⚠️ **Nothing comes back for a future-dated `job`, and ADR 0046 made that reachable.** The sweep now
  sets `available_at` forward from the second abandonment, and `03` §3.1 step 6 forbids the timeout
  branch from issuing a query — so a deferred job waits for the next notification or reconnect.
  § Carrying's own sketch of the fix is *a shorter block timeout when and only when the drain saw a
  future-dated row*, which only helps if something then queries; that is the step that would amend
  step 6, and ADR 0028 and `tests/test_loop.py` both pin it. **The cap is thirty minutes so the gap
  stays small rather than closed.** The ticket that wants it closed owns the amendment.
- ~~**One `psycopg.connect()`** against the direct Neon endpoint. Verification §9.1 is documentary; a
  live connection falsifies it cheaply. ⚠️ **A second line settles ADR 0043's open half** in the same
  session: `SELECT pg_notify('kioku_job','')` on the **pooled** string. PgBouncer's matrix says
  `NOTIFY` works in transaction pooling and Neon's summary says the pair does not; the worker is
  correct either way, but one statement says which.~~
  **⚠️ Both run 2026-09-12, and both leave this list.** Verification §9.1 and ADR 0043 carry the
  numbers. The connect works on the plain string in 597 ms; a **pooled** `pg_notify` **is** delivered
  to a **direct** `LISTEN` in 563 ms, so PgBouncer's matrix wins over Neon's summary and the
  production wake-up path is real rather than planned. ⚠️ **The control run is the finding worth
  carrying**: `LISTEN` on the *pooled* string is **accepted with no error** and then receives
  nothing — `03` §4.1's silent-never-wakes, demonstrated. `worker/db.py:require_direct_url` is the
  only thing between that config error and a queue that is never drained; it is load-bearing and must
  not be softened into a warning.
- ~~**Whether an idle `LISTEN` connection defers scale-to-zero.** Neon is silent. ADR 0028 holds
  either way; this settles the *cost* question only.~~
  **⚠️ Run 2026-09-12, and it settled more than the cost question. It does not defer it.** The held
  listener never advanced `last_active` at all — frozen at the last real query — and the compute
  suspended **five minutes and nine seconds** after that query, killing the subscription. So the old
  cost worry was unfounded, and the reason not to hold a daemon open is that **it does not work**
  rather than that it is expensive. ⚠️ **The exception is
  `psycopg.OperationalError: consuming input failed: SSL connection has been closed unexpectedly`,
  and `worker/db.py`'s `CONNECTION_LOST` already catches it** — now verified against the real failure
  rather than a fake connection. **The worker takes its reconnect path every five idle minutes in
  normal operation**; treat that path as the common case, not the exceptional one. ADR 0028 carries
  the table.

## Blocked

Nothing.

## Carrying

- ⚠️ **The KANJIDIC2 table has a licence clock** (EDRDG licence §4: stale data "is a violation of
  the licence"). Yuta's call is a **monthly** manual refresh: `node scripts/kanjidic.ts`, run the
  tests, commit, and log the `database_version` it prints here. **Refresh log:** 2026-264, generated
  2026-09-21 (#30). **Next due by 2026-10-21.** The raw file is never committed.
- ⚠️ **`server/data/kanjidic/readings.json` is imported by `server/utils/review/kanji.ts` and
  nothing else.** Importing it from `shared/` or `app/` puts 0.5 MB into the client bundle, which is
  what research §5 and Yuta's call 4 ruled out. `kanjiReadingCandidates` takes the table as a
  parameter so that the pure half can stay in `shared/` without it.
- ⚠️ **`kanjiReadings` is a position field the server adds**, so the page reads it with `?? []`
  (the snapshot rule below) and `parseSnapshot` accepts it absent.

- ~~⚠️ **Neon is at `0005` and the code expects `0006`** (2026-09-21, #28).~~ ⚠️ **Applied to Neon
  2026-09-21**, the same day: `note_meaning` and `meaning_synonym` both exist there. `snapshotOf`
  joins them, so any database behind this code needs `0006` first. ⚠️ `npm run db:migrate` does not
  read `.env` by itself and `.env` does not source in zsh (line 16); `node --env-file=.env
  ./node_modules/.bin/drizzle-kit migrate` is what worked.
- ⚠️ **A synonym is not an answer, and `unsentAnswers` is where that is enforced** (#28). Read as
  one, a reload would mark its *card* flagged and skip it unanswered. Any new outbox kind that is not
  an answer owes the same line.
- ⚠️ **A server snapshot is installed unparsed** (`start` in `app/pages/review.vue`), so a field the
  server adds to `ReviewPosition` is absent on a tab open across the deploy. `acceptedOf` and
  `withSynonym` read `meanings` and `synonyms` with `?? []` for that reason; a new position field
  owes the same.
- ⚠️ **The gloss is always accepted, even when a list exists** (ADR 0069 § Settled by the build). A
  change that matched the list *instead of* the gloss would refuse the meaning a *card* displays
  after a *Vet* fix.

- ⚠️ **Three flakes were chased on 2026-09-21 and none reproduced**: 15 unit-tier runs, 15 full
  suites and 19 runs of `test/e2e/review.test.ts`, all green. What each one turned out to be:
  - *`auth-config` unset-`KIOKU_INVITED_EMAIL`* is the file's first test, so it pays the cold import
    of `server/utils/auth` — 433 ms alone, ~1.1 s under full-suite load, against the default 5 s.
    Never seen failing.
  - *`review` offline-replay* has a real gap and it is harmless: `flush()` settles an entry only
    after `send()` returns, so the database leads `localStorage` — measured 1 run in 10, 45 ms. A
    reload inside it replays the flag, `recordFlag`'s `(review_session_id, card_id)` guard answers
    `already_flagged`, and the next composition's `holdRefused([])` wipes the refusal. Checked by
    sabotage (the entry re-injected before the reload): the test still passes, and correctly.
    ⚠️ **Replay is driven by the `online` event alone, with no timer** — a missed event would time
    the 10 s poll out. Not observed.
  - *Six e2e files at setup on 2026-09-19*: a forced throw in `startTestDatabase` is reported loudly
    with a stack, so *no error captured* was the output not being kept rather than vitest hiding it.
    Two `.nuxt/test/` build dirs dated 2026-09-19 23:11 had an empty `output/` and no teardown —
    the signature of a process killed mid-build, not of a failing test. The e2e tier peaks at
    5–6 GB (six concurrent Nuxt builds); `--maxWorkers=3` costs nothing in wall time (21 s vs 22 s)
    and was not applied, because nothing showed memory was the cause.
  **If any of them recurs, keep the output** — `npx vitest run > run.log 2>&1` — and start from it.
  Do not carry this list forward again without a log.

- ⚠️ **The `.apkg` reader's one unmeasured assumption is that `os.tmpdir()` can be written to, and
  it is documented rather than observed.** Vercel's Runtimes page says `/tmp` is writable to 500 MB
  and Node only leaves `/tmp` for a `TMPDIR`/`TMP`/`TEMP` Vercel does not set (ADR 0068 § Amended
  2026-09-20). **Nothing has ever deployed this app**, so the composition has never met reality.
  ⚠️ **A first import that throws `EACCES`, `EROFS` or `ENOENT` out of `mkdtempSync` is that
  revisit condition arriving, not a bug in the reader** — and the fix named in the ADR is
  `DatabaseSync.deserialize()` with `engines` moved to `>=24.16.0`, **not** a retry, a different
  directory, or Vercel Blob (ADR 0022's forbidden list). ⚠️ **And do not "simplify" `mkdtempSync`
  into a fixed path**: it is what keeps two concurrent imports on one warm instance apart.
- ⚠️ **A fact absent from two docs pages is not a fact the docs withhold.** ADR 0068 §2 recorded
  *"the docs pages checked … do not say"* about `/tmp`, and the answer was on a third page, in a
  table row, under a heading (*File system support*) that does not contain the word searched for.
  The working agreement is *when the docs are silent, measure it* — **the cost is in deciding that
  they are silent**. The § Next entry above names which pages were read and which were not, which
  is what makes the next check cheap rather than a repeat of this one.
- ⚠️ **`node:sqlite` has no `createCollation`, and four of an Anki collection's text columns are
  declared `COLLATE unicase`.** `notetypes.name`, `fields.name`, `decks.name` and `tags.tag`
  (research §2.1). Opening such a file works and so does every `SELECT` that does not *compare* by
  one of them; the moment a query grows an `ORDER BY name`, a `GROUP BY name` or a `WHERE name = …`,
  it fails with `no such collation sequence: unicase`. The reader orders by `ord` and by `id`, which
  is what it wanted anyway, and **the generated fixture carries the collation** (through
  `PRAGMA writable_schema`, since the DDL cannot be written directly) so the failure lands in
  `npm run test` rather than on a real deck.
- ⚠️ **Nothing queries the `tags` table, and that is not an oversight.** Tags live on `notes.tags`
  (research §2.1 measured the exported `tags` table empty), and `tags.tag` is the one collated
  column that is also a `without rowid` primary key — the case where stock SQLite answers
  `no query solution` rather than a clear error.
- ⚠️ **The `.apkg` reader runs in the *app*, and the reason is `chunk`.**
  `anki-apkg-research.md` §4.3 recommended the worker and ADR 0068 reversed it: the app writes
  `source_chunk` inside the submit transaction and `source.content` is `text NOT NULL`, so a
  worker-side unpack needs either a second chunker or a *source* row with nothing in it. **A session
  that moves the reader to the worker for symmetry re-opens both.** `unpack` being a declared stage
  with no Python module is the shape of the decision, not a gap.
- ⚠️ **A deck name goes into the hint as the words in it that name a level, never whole.** Measured
  2026-09-20 (ADR 0068 § Amended): `Open Anki JLPT N2 Deck` carried whole is 22 code points on each
  of 2,699 lines and the largest column in the *source* — it put two of the four real decks over
  `S2`'s cap. Tags **are** carried whole, because a tag is a token and a deck name is prose. The two
  look like one rule applied inconsistently and are two rules about two shapes.
- ⚠️ **The deck's *meaning* never travels, and the measurement is the only thing holding that line.**
  ADR 0068 §3: with the meaning cut to 40 characters, two of four decks go over the cap; with every
  field, all four do. The model writes the meaning anyway. A session that adds it "to help the model"
  is spending the cap on the column decks disagree about most.
- ⚠️ **`normalise` reads column 1 as the term for a *word list* too, and that changed behaviour.**
  Before #26 a tabbed word-list line reached the tokeniser whole, was called two content words and
  was kept whole under ADR 0063's *kept, not dropped* clause. It now resolves to its first column.
  One rule on both paths is what stops them disagreeing about what a line is — but a reader who was
  pasting `term⇥gloss` lists gets different *notes* than they did.
- ⚠️ **A 4.5 MB upload is refused by Vercel before any of our code runs, and nothing can render
  that.** Research §4.4. The app refuses at 4 MB with a sentence; above Vercel's limit the reader
  gets Vercel's `413` on a route that ships no JavaScript to catch it. ⚠️ **Do not reach for Vercel
  Blob** — ADR 0022's forbidden list — and do not raise the app's cap to meet Vercel's: the 0.5 MB
  is the multipart envelope.
- ⚠️ **`zlib.zstdDecompressSync` is Experimental and `node:sqlite` is a Release candidate**
  (ADR 0068 §2). Two non-stable built-ins in one path, named in the ADR rather than hidden. The
  contract is one decompress call and four `SELECT`s, and the three-layout fixtures are what turn a
  breaking Node release into a red suite. `ankipack` is the named fallback and taking it means
  amending ADR 0068 first.
- ⚠️ **`PROMPT_VERSION` is `v4` and the `anki` text is conditional.** A chunk with no deck behind it
  builds the identical prompt it built at v3 — the deck paragraph and the `deck_*` fields appear only
  when a *candidate* carries one, exactly as `reading_rule` does. The version still moved, because
  the rule is *any change to `build_prompt` bumps it in the same commit*.

- ⚠️ **The brake counts what was *offered*, and the tempting rewrite counts what was *answered*.**
  `review_session.new_count` is written by the composition; the day's allowance is its sum over
  today's runs. Counting first *scheduling epochs* (`ordinal = 1`) needs no column and looks cleaner,
  and it lets a reader compose twenty new *cards*, answer none, and do it again (ADR 0066 §3). The
  schema-tier test *spends the day on what was offered* asserts zero epochs beside a spent day.
- ⚠️ **The day's runs are bucketed in TypeScript over a 48-hour window, and `date_trunc` is still the
  wrong rule.** `recentlyComposed` hands over instants; `introducedToday` keys them with
  `localDayKey`. Same argument as the `/stats` bullet below — the boundary is 04:00 in the reader's
  zone, and it has one implementation.
- ⚠️ **`resumeOrCompose`'s `zone` is `null` for *not sent*, not `'UTC'`.** It composes in UTC either
  way, but it **stores** what it was given, and `readerZone` reads the newest non-null one. A default
  of `'UTC'` would look harmless and would overwrite a Tokyo reader's zone the first time a test, a
  script or an older tab composed without one.
- ⚠️ **The fifty-*card* gate reads `due.length`, and the due read's ceiling is what makes that exact.**
  Lower `DUE_READ_CEILING` below `NEW_CARDS_PAUSED_ABOVE_DUE` and the gate can never shut, with no
  test failing unless it is the one that seeds fifty.
- ⚠️ **The end screen's brake sentence comes from the answer that finishes the run**, not from the
  composition. A run finished offline keeps the composition's reading, which can name a gate that
  twenty answers have since opened; the next start corrects it.
- ⚠️ **Two tabs composing at once can each spend the same ten.** The allowance is read before the
  insert. ADR 0012 invites one reader and a second tab normally resumes the live run, so this is
  reported by the sentence (*12 of 10*) rather than prevented.

- ~~⚠️ **`/stats` has no zone, so *consistency*'s day starts at 04:00 UTC — 13:00 in Tokyo.** ADR 0066
  §4 puts the reader's zone on the *session* request and validates it server-side; `/stats` ships no
  JavaScript (ADR 0020) and no column stores one, so `server/middleware/shell-data.ts` passes
  `resolveZone(null)` and the fallback is UTC. **The arithmetic is right and the input is wrong**,
  which is the shape that gets mistaken for a bug: `test/unit/local-day.test.ts` proves the boundary
  in four zones, and the screen still buckets a Tokyo reader's evening into the wrong day.
  [#21](https://github.com/yutaasakura96/kioku/issues/21) lands the zone and **one line changes**.
  ⚠️ **Do not "fix" it by reading `Accept-Language` or by adding a `<script>` to `/stats`** — the
  first carries no zone and the second is the property ADR 0020 exists to hold.~~ **Paid 2026-09-18
  by #21**: `/stats` reads `readerZone`, the zone the newest *session* stored. ⚠️ **What is still
  true: a reader who has never composed a run from a client that sent a zone is in UTC**, and so is
  every run composed before #21 — `zone` is null on all of them. The warning about `Accept-Language`
  and `<script>` stands.
- ⚠️ **`note_vetting.seconds_to_vet` is written by three paths and read by nothing**, from
  2026-09-18. It is the exact mirror of the `flagged_at` bullet #20 closed, one step in the other
  direction: `app/pages/vet.vue` measures it, `shared/vet/decision.ts` validates it,
  `server/utils/vet/decide.ts` stores it, `server/utils/vet/undo.ts` clears it, and #23 took away
  the only reader. **It is kept rather than dropped** because ADR 0062 retires the *figure*, not the
  measurement, and a column that is still being written costs nothing while a schema change costs a
  migration. ⚠️ **A session that "tidies" it away is deciding that `S3` can never be re-asked.**
- ⚠️ **The em dash on `/stats` is reachable through *time-to-first-review* alone**, and that is a
  property of the new boundaries rather than an oversight. Retention, consistency and flag rate are
  each gated on their own denominator, so a figure that is shown at all has a denominator above
  nineteen and cannot be `null`. *Time-to-first-review* is gated on minted *cards* and divided over
  *sources studied* — so a reader who has minted twenty and reviewed none sees it, **which is exactly
  the state the first run left the database in** (39 minted, none reviewed).
- ⚠️ **`date_trunc('day', …)` is the shortest way to write the wrong rule, and it is one keystroke
  from where the right one goes.** ADR 0066's day is 04:00 in the reader's zone; `date_trunc` is
  midnight in the database's. The bucketing is therefore in TypeScript
  (`shared/time/local-day.ts`) and the query hands over **instants** — truncated to the minute, which
  is a size reduction that cannot move an instant across a boundary, where truncating to the *hour*
  would, in Kolkata. A session that pushes the bucketing "down into SQL for speed" changes the rule.
- ⚠️ **Shifting the *instant* by four hours and formatting that is the tempting one-liner, and it is
  wrong once a year for four hours.** The offset four hours earlier is not the offset now across a
  daylight-saving transition. `localDayKey` reads the local hour first and steps the **calendar date**
  back, which has no such case, and the New York spring-forward test is the only thing that tells the
  two apart — it was written by sabotaging the right implementation into the wrong one.
- ⚠️ **A suppression threshold on *consistency* belongs to the denominator, not the numerator.** A
  reader on day three who studied all three days is at 100%, and a threshold on *days studied* would
  publish that as a finding while withholding a reader who has been going a month and missed half of
  it. It is the one of the three boundaries where the two readings differ, and both look reasonable.
- ⚠️ **ADR 0058's "suppression is a fact about the screen" survived #23 by moving, and the thing it
  actually refuses is narrower than it sounds.** `suppressed` is now a field on each `Figure` rather
  than one flag on the view, because ADR 0062 gives each ratio its own evidence. **What ADR 0058
  refused was returning `null` below the boundary** — throwing the value away makes nineteen and
  twenty indistinguishable from the seam, which is the one place `11` §3 asks for them to be told
  apart. Every value is still computed. **Do not read the ADR as forbidding the flag; read it as
  forbidding the discard.**
- ⚠️ **A document can be wrong, and #23 found one by writing the test from it.** ADR 0037's amended
  table said *two grades either side of midnight are two days*; ADR 0066 §4 says a run from 23:40 to
  00:10 is one sitting. The test asserting the table failed, and the failure was the document's. **The
  general rule worth carrying: when a test written from a document fails, the document is a suspect
  too** — here the deciding ADR and the index ADR disagreed, and the index was the one that had been
  written from memory of a midnight boundary.

- ⚠️ **`Z` on a flag resolution finds its flags by `card_flag.resolved_at = note_vetting.vetted_at`**,
  and that equality only holds because `decide()` writes both with the same transaction's `now()`.
  Stamp either from the application clock, or split the writes into two transactions, and `Z` stops
  matching and falls through to the *pending* path's un-mint. That path deletes nothing on an
  `accepted` row, so the undo answers `ok` and does nothing, with no error. The comparison is in SQL
  on purpose, because a JS `Date` drops the microseconds.
- ⚠️ **The worker's writes are autocommit unless something opens a transaction.** `db.py` connects
  with `autocommit=True` (ADR 0027), and `runs.run_ingestion`'s transaction covers only the ledger
  and the `complete` mark. `write_note` and each collision's accept-and-mint open their own. **A new
  multi-statement write in the worker owes the same block**, and a green test suite won't show that
  one is missing, because nothing in the tests kills the process between statements.
- ⚠️ **The freeze lifts for an open flag from any owner, while the queue offers only this owner's
  flags.** Both are deliberate: the fields are shared (ADR 0052) and a flag is personal (`04` §4).
  Neither is reachable while ADR 0012 invites one reader.
- ⚠️ **An epoch reset is reachable only through `meaning` today.** `reading` is memory-bearing, but
  `10` §4.4's edit reaches the *judgement fields* only, and `reading` is a *lookup*. A word-list
  *note* whose model-written reading is wrong (ADR 0063's unresolved line) can be dropped and not
  fixed. Widening the edit is a screen decision, not a bug.
- ~~⚠️ **A resolution overwrites `vetted_at`, `vetting_session_id` and `seconds_to_vet`**, and `Z`
  leaves `vetted_at` null on an `accepted` row (`04` §7.8, amended). Until #23 retires *acceptance
  rate* and *seconds-per-note*, a resolution counts as a vetting decision in both.~~ **Paid
  2026-09-18 by #23**: neither figure exists, so the overwrite reaches no reader. ⚠️ **The writes
  themselves still happen** — see the `seconds_to_vet` bullet below.
- ⚠️ **`card` is in `worker/tests/conftest.py`'s scratch list now, and `scheduling_epoch` and
  `card_flag` still are not.** The worker mints, so its *cards* are scratch. It writes neither of the
  other two, so a leftover row still means a test did something it should say.

- ⚠️ **`normalise` decides what a *word list* line is, and the rule is wider than "Sudachi knows
  it".** Three things make a line unresolved and each keeps the line **whole** with an empty reading
  and `is_oov`: an out-of-vocabulary word, a head ADR 0044's allowlist would not call vocabulary, and
  a **second content word on the line** — **except する after a `サ変可能` noun**, which is
  inflection. ⚠️ **That exception is not a nicety and `/code-review` is what found it missing:**
  勉強する is 勉強 + する in C mode, `動詞,非自立可能` is in ADR 0044's allowlist on purpose (ある /
  いる / くる are words), so without it a word list holding 勉強する mints a **second *note*** beside
  the 勉強 a prose *source* already produced. One word, two *notes*, keyed apart. The guard is narrow
  on both sides — the head must be `サ変可能` and the follower must normalise to **為る**, not merely
  be `非自立可能` — which is what keeps 気をつける and 持ってくる whole. The second of those is the one a future session will
  "simplify": it is what stops 六 becoming the term `6`, because `normalized_form` rewrites numerals
  (`03` §5.2) and `04` §5.3 says numerals never reach the key. The third is what stops 新しい本
  becoming a *note* about 新しい. **Taking the head and discarding the rest looks tidier and is the
  silent half-answer ADR 0063's *kept, not dropped* clause exists to refuse.**
- ⚠️ **`is_oov` on a word-list *candidate* means *the reading did not come from the dictionary*, not
  *Sudachi had never heard of it*.** That is the question `04` §5.4 asks the column and the bit ADR
  0063 makes stage 6 read, so a line that tokenised perfectly and held two words carries it too. A
  session that reads it as the tokeniser's raw flag — which is what it is on the prose path — will
  find the two paths disagreeing about a column with one name.
- ⚠️ **`readSourceKind` falls back to `prose` and *Ingest* pre-checks `word_list`, and the two
  defaults must stay different.** `04` §5.1's column defaults to `prose` so the rows written before
  ADR 0063 keep their meaning; the screen offers `word_list` because that is what the pivot is about.
  ⚠️ **The function that answers a *post* uses the column's.** It reads the form's default for one
  commit during #19 and `/code-review` caught it: the form always sends a value, so the fallback is
  only reached by a post that did not come from the form — a fixture, the resume control's encoding,
  a future caller — and every one of those is submitting prose or submitting nothing. Answering them
  `word_list` chunks a pasted passage at 25 terms, silently.
- ⚠️ **A *note* from an unread line is keyed on a reading the model wrote, and stage 5 could not have
  filtered it.** `filter_known` ran against `term␟` — the key with the empty reading — so a word the
  corpus already holds under its real key is **not** caught, and the generation is paid for.
  `write_pending`'s `ON CONFLICT DO NOTHING` then finds the existing *note* and appends the
  *occurrences* to it, which is correct and is not free. ⚠️ **The fix is not to key the row on the
  empty reading**: `04` §5.3 renders the key from the fields the *note* carries, and a row
  disagreeing with its own `fields` is a row no re-ingestion could ever match.
- ⚠️ **The blank-character class now decides two different things, and only one of them is about a
  *note*.** It says whether a generated field is empty (`03` §7) **and** which lines of a word list
  are terms — `shared/ingest/chunk.ts` counts them to place a *chunk* boundary and
  `worker/pipeline/normalise.py` reads them back out of that chunk. A character one language calls
  whitespace and the other calls content is now a chunk holding 25 terms on one side of the
  repository and 24 on the other, which is a **silent** off-by-one in the *identity* of what gets
  generated. Both languages build their patterns from one `BLANK_CLASS` constant and
  `test_subject_drift.py` compares the two strings; **do not write the class out a third time.**
  ⚠️ **Python builds two patterns from it and TypeScript builds one**, and that asymmetry is
  deliberate rather than an oversight: only Python needs the class as a *strip*, to give each term
  its span. A `trimBlank` mirrored into TypeScript for symmetry was written and deleted in the same
  session, on `/code-review`'s finding that nothing called it.
- ⚠️ **`PROMPT_VERSION` is part of `04` §6.3's cache key and it moved to `v2` with #19.** Every
  stored `v1` answer is still a correct answer to the `v1` question and will simply never be asked
  for again — the 474 *pending notes* are unaffected, because they are `note` rows and
  `filter_known` finds them by key. **The rule the bump is enforcing: any change to `build_prompt` or
  `FIELD_INSTRUCTIONS` bumps this in the same commit**, or a reworded prompt silently reads back
  answers to the old one.
- ⚠️ **`shared/subject/declaration.ts` imports `../ingest/kind.ts` *with the extension*, and nothing
  in this repository's own build can tell you why.** `scripts/print-subject-view.ts` is run by `node`
  for the drift test; Node's ESM resolver will not extension-guess, while Vite accepts either form.
  So an extensionless import there typechecks, bundles, and breaks the one test that compares the two
  languages. This is § Carrying's existing Node-resolver finding arriving in a second file.
- ~~⚠️ **ADR 0063 names the last word-list stage `write_notes` and the stage is called `write_pending`.**~~
  **Paid 2026-09-17 by #20**: it is `write_notes`, and it mints.
  The ADR is describing the pipeline *after* [#20](https://github.com/yutaasakura96/kioku/issues/20)
  mints on arrival; #19 puts minting out of scope and still writes *pending notes*, so renaming the
  stage would rename the module — and the prose pipeline with it — for a behaviour that has not
  arrived. **#20 owns the rename if there is one.**
- ⚠️ **The `anki` kind is in `04` §5.1's `CHECK`, in no pipeline, and produced by nothing.** That is
  three places where it looks like a gap and is a decision: ADR 0063 says in as many words that it
  does not pre-decide [#24](https://github.com/yutaasakura96/kioku/issues/24), whose first job is
  research into the `.apkg` format and the licensing of shared decks. `stageKeys` / `stage_keys`
  refuse it **by name**, `checkDeclaration` requires a pipeline only for the kinds *Ingest* can
  submit, and `shared/ingest/chunk.ts` routes it to the word-list branch with a comment saying that
  is where #24 will disagree. **Declaring an `anki` pipeline to make a check pass would be deciding
  #24 by the back door.**

- ~~⚠️ **`shared/review/compose.ts` carries a comment that is wrong, and ADR 0066 is the correction.**
  It says a *card* three weeks late has decayed further than one due this morning. That holds only
  when both have the same stability, and FSRS can answer it exactly through
  `get_retrievability`. The code is not wrong yet, because the order only matters once the due set
  is larger than the *session*; the comment's reasoning is what would mislead the next reader.
  [#21](https://github.com/yutaasakura96/kioku/issues/21) fixes both.~~ **Paid 2026-09-18 by #21**:
  the comment is replaced and the order is retrievability when the backlog exceeds the run.
- ~~⚠️ **`level_claim` has a table, a read path, an index, a *provenance marker* and tests, and no
  producer.**~~ **Paid 2026-09-17 by #22**: stage 7's `write_claims` writes one `level_claim` and one
  `domain_claim` per generated *note*. ⚠️ **What is still true: every *note* written before then
  carries no claim**, the 474 *pending* and the 39 accepted among them, and **a filtered *session*
  introduces none of them**. Backfilling is out of #22's scope; until a run re-chooses them, the
  filter only reaches words ingested after 2026-09-17.
- ⚠️ **A *note* is in a filter if *any* of its claims is in the set** (`newCards`). v1 writes at most
  one claim per *note*, so this is not yet a choice; the day an authority's claim disagrees with the
  model's, ADR 0005's precedence has to decide which one filters, and nothing does today.
- ~~⚠️ **The application has never written a superseded *scheduling epoch*.**~~ **Paid 2026-09-17 by
  #20** (`server/utils/review/epoch.ts`).
  `superseded_reason = 'memory_bearing_field_changed'` is in the `CHECK`, `04` §7.4 describes it, and
  the first one is written by [#20](https://github.com/yutaasakura96/kioku/issues/20) when an edit
  touches `reading` or `meaning` on a flagged *note*.
- ⚠️ **There is no notion of *today* anywhere in the app**, and ADR 0066 introduces the first one: a
  local day starting 04:00, with the zone sent by the client. Every other rule in the project is an
  interval between two `timestamptz` values, and a session that reaches for `date_trunc('day', …)`
  in UTC will be writing a different rule than the one that was decided.

- ⚠️ **A fresh database refuses the invited address until its user row is seeded by hand**
  (`08` §3.2, amended 2026-09-13). `disableSignUp: true` does not know who is invited — nothing in
  the app creates a user row, so every first sign-in answers `signup_disabled`. The row goes in
  **before** the first sign-in and must carry `email_verified = true`, or Better Auth refuses the
  implicit Google link instead. This applies to **every** new database — a Neon branch, a restore
  into an empty project, the EC2 move ADR 0022 plans for — and a `pg_dump` carries the row, so only
  an empty target needs it. `scripts/first-run.sh` stage 5 has the statement and how to tell the two
  refusals apart in the dev log. ⚠️ **Do not "fix" this by lifting `disableSignUp`**: it is the
  refusal that is Better Auth's rather than ours (`08` §3.3), and the seed is what keeps both.

- ⚠️ **The e2e tier's single connection is a single *session*, and that means a test can read a
  transaction the app has not committed** ([ADR 0059](adr/0059-the-e2e-tier-has-no-transaction-isolation-so-a-test-reads-the-pair-in-one-statement.md)).
  Measured 2026-09-12: `test/e2e/database.ts`'s in-process handle and the app's socket connection
  report the **same `pg_backend_pid` and the same `txid`**, an in-process read sees the app's
  uncommitted row, and an in-process write issued during the app's transaction is **lost to its
  rollback**. This is the third face of the `Promise.all` and `page.reload()` findings below, and the
  only one that is silent — the other two answer `500`, this one goes green. **The rule: what the app
  writes in one transaction, the test reads in one statement.** `test/e2e/vet.test.ts` polled
  `note_vetting.state` alone, caught `'accepted'` between `decide()`'s two writes, and counted zero
  *cards* — which looked like a missing `await` for as long as it went unexplained, because a
  committed `accepted` with no *card* is impossible. A poll whose predicate spans two statements is
  a poll over two snapshots.
  ⚠️ **Audited 2026-09-12 and it had a second one.** `test/e2e/review.test.ts` polled the `card_flag`
  count and then counted suspended *cards* — `flag()` writes both in one transaction (`04` §7.8), so
  the same shape, never observed to fail and failing **every** run once the gap is widened. Both
  files now poll a pair: `accepted/1` and `1/1`. **The other four e2e files are safe by
  construction** — they have no browser, so every read follows an awaited `nuxtFetch`, and a response
  that arrived is a transaction that committed. ⚠️ **The write direction is clean by a narrower
  margin**: every test write is in a `beforeAll` before a page opens, or between two awaited fetches.
  A `beforeEach` cleanup between two browser actions would join the app's transaction and go with its
  rollback, and nothing would say so.

- ⚠️ **A negative assertion over a whole HTML document is almost never an assertion about the
  screen.** Measured 2026-09-12 while writing `test/e2e/stats.test.ts`: `expect(document).not
  .toContain('%')` — meant as *the ratios are suppressed* — fails on a document that suppresses them
  correctly, because the *shell* renders `href="/vet?from=%2Fstats"` and the inlined tokens carry
  `rgb(70 52 30 / 7%)`. The same shape **passes** for the opposite reason: had the encoded `%`
  not been there, the assertion would have been satisfied by any document with no percent sign in it,
  including one that failed to render the grid at all. ⚠️ **The fix is to name the thing that must be
  absent** — the test asserts `not.toContain('74%')`, which is what fourteen of nineteen would have
  rendered as. **The class is wider than this file**: a `not.toContain` over markup is an assertion
  about a haystack, and the same tier's `not.toContain('<script')` only escapes it because that
  needle cannot occur innocently.
- ⚠️ **Two joined tables that share a column name turn § Carrying's bare-identifier finding from a
  wrong answer into a wrong table.** The measured drizzle-orm 0.45.2 behaviour is below — a column
  interpolated into a `sql` template emits an **unqualified** identifier. On `/stats`'s duration
  query that matters more than it did on Ingest's counts, because `source` **and** `ingestion` both
  have a `submitted_at`: interpolating `reviewLog.receivedAt` into a `min()` is safe, because only
  `review_log` has a `received_at`, and interpolating `source.submittedAt` would not be —
  `"submitted_at"` unqualified is whichever one the planner resolves it to.
  `server/utils/stats/queries.ts` selects that column through the query builder and says so at the
  line. **The rule to carry: interpolate a column into `sql` only in a single-table query, or check
  that the name is unique across every table in the join.**
- ⚠️ **Suppression is a fact about the screen, not about the arithmetic, and building it the other
  way makes it untestable** ([ADR 0058](adr/0058-a-suppressed-ratio-shows-the-evidence-behind-it-as-a-pair.md)).
  `shared/metrics/stats.ts` computes all four ratios whether or not they will be shown;
  `app/components/StatsFigures.vue` is the only file that reads `suppressed`, which is what keeps
  `S10`'s only branch to one `if`. The obvious alternative — return `null` below twenty — moves the
  branch into the seam, and `11` §3 wants it asserted at **nineteen and twenty**, which is exactly
  what a seam that has already thrown the value away cannot show.
- ⚠️ ***Time-to-first-review* joins through `note.origin_ingestion_id`, and `occurrence` is the wrong
  link even though the schema calls `occurrence` the positional one** (ADR 0057).
  `server/utils/ingest/queries.ts` says "**the *occurrence* is the positional link**" and it is right
  about *where a note appears*; this metric is about *what a source generated*, which `CONTEXT.md`
  states in those words — *the first card **generated from** it*. Joining through `occurrence` lets a
  *source* inherit a *review* of a *card* some earlier *source* already paid for, which flatters the
  number and can date it before the paste. ⚠️ **And it is `received_at`, never `reviewed_at`**: `03`
  §12 wants both instants on the same clock, and the client stamp gives a **negative** duration on a
  laptop an hour fast.

- ⚠️ **A retry is not a second event, and every append-only table has to be told which it is
  looking at.** `11` §3's *a second flag on the same card is a second row* and ADR 0007's *the outbox
  replays* describe two different duplicates, and the first draft of #13 conflated them: a replayed
  flag wrote a second `card_flag` row, **inflating the numerator of *false-accept rate***, while the
  *grade* path a hundred lines away already guarded the same pair. Both now key on
  `(review_session_id, card_id)`, and the reason that pair works is a fact about the screen rather
  than about the table — **a flagged or graded position is answered, so the reader cannot reach it
  again inside that run.** ⚠️ **The class is wider than these two tables**: every append-only write
  reachable from a replay owes an idempotency key, and *deduplicating under-reports* and *counting
  retries over-reports* are the same error with the sign flipped.
- ⚠️ **An entry that can never succeed must leave the outbox, or it blocks every answer behind it.**
  The stream replays in order and stops at the first entry the network would not take (ADR 0039), so
  *held* is the right answer for a tunnel and the **wrong** answer for a `400` — the body cannot
  become readable, and holding it is head-of-line blocking that loses the whole run silently, which
  is the drop property 5 exists to prevent. `app/pages/review.vue` refuses a `400` and holds a `404`
  or a `500`, because those can work on the next attempt. ⚠️ **The distinction is *can this ever
  succeed*, not the status class** — and it is a judgement the client has to make, because the server
  does not know it is talking to a replay.
- ⚠️ **An unused index is a decision somebody already made.** `04` §11 has carried
  `card_flag (note_id) WHERE resolved_at IS NULL` since Phase 4, labelled *the flagged notes waiting
  in the Vet queue*, and nothing queried it — and it is the only thing in eleven documents that says
  **how** `09` §4.9's *returns the note to the vetting queue* is meant to work. The straightforward
  reading, `note_vetting.state` back to `pending`, raises the numerator of *false-accept rate* and
  lowers its denominator at once (ADR 0056). **The rule generalises: when an implementation and an
  index disagree about how something is found, the index is the older statement and usually the
  considered one.**
- ⚠️ **`review_log` can hold two rows for one position, and every consumer that counts reviews has to
  know it** ([ADR 0055](adr/0055-later-wins-is-a-second-row-because-review-log-cannot-be-rewritten.md)).
  PRD §5's *the same card graded twice — both replay; the later timestamp wins* had exactly one
  available implementation, because `04` §7.5's trigger refuses an `UPDATE` and a `DELETE`: write the
  later one too, and read the rows in stamp order. ⚠️ **The two consumers that exist are correct and
  the next one is #14's** — a *session* completion rate written as *`review_log` rows ÷ size* is
  wrong the first time a reader answers a *card* twice and correct-looking until then. Count
  positions. **The duplicate that is refused is the exact one**: a replayed outbox entry carries the
  same stamp it was created with, so `reviewed_at >= incoming` catches a lost acknowledgement without
  a heuristic.
- ⚠️ **A client stamp compared against a server instant needs the allowance in both directions**
  ([ADR 0054](adr/0054-the-skew-allowance-is-two-minutes-and-it-covers-both-of-8-2-s-rules.md)).
  `03` §8.2 names a skew allowance for the future rule and reads exact for the before-snapshot one —
  and a laptop three seconds slow stamps the first *grade* of every run before `snapshot_taken_at`,
  so the exact rule refuses the opening *grade* of every *session* on a machine that works. ⚠️ **Both
  server instants are read in one statement** — `snapshot_taken_at` from the row, `extract(epoch from
  now())` beside it — because the application server and the database are different machines (`03`
  §13.1) and measuring the bound against this process's clock widens it by whatever they disagree by.
- ⚠️ **The e2e tier's single connection is not only about `Promise.all`; a reload is the other way
  in.** Measured 2026-09-12: `page.reload()` issued while the **previous** document still has a
  request in flight puts two connections on `@electric-sql/pglite-socket`, one is reset, the route
  answers `500`, and the page's flush stops with the entry still owed — **and nothing in the test
  output names the cause**, exactly as the `Promise.all` bullet below describes for the other shape.
  `test/e2e/review.test.ts` drains the outbox before it reloads. **The class is *overlapping
  requests*, not *concurrent reads inside one handler*.**
- ⚠️ **A `window` listener in a *mode* is not automatically ADR 0025's problem.** The key handlers
  bind to the mode container because ADR 0023's map is all printable characters and **SC 2.1.4
  Character Key Shortcuts** is Level A — a criterion about keyboard shortcuts. `app/pages/review.vue`
  listens for `online` on `window`, which is ADR 0039's *signal*: removing it entirely changes when
  the outbox drains and never whether it does, because the next load replays anyway. ⚠️ **It is also
  the reason the nuxt tier unmounts every page it mounts** — a screen left mounted answers the next
  test's reconnection with its own outbox, on the one `window` they share.
- ⚠️ **A refused *grade* stays painted as answered, and that is deliberate.** `03` §8.2's refusal
  arrives after the reader has moved on; un-painting the position would put a *card* they have
  already left back in front of them, and on a clock that is an hour fast **every** *grade* is
  refused, so the run would loop on the first *card* forever. The end screen names the count and the
  cause instead (`10` §5.6). ⚠️ **The consequence to carry: the end screen's four figures can
  overstate what reached the database**, and the sentence under them is what reconciles it.

- ⚠️ **An answer to a *grade* moves the *grades* and never the words.**
  `shared/review/snapshot.ts`'s `mergeGrades`, added 2026-09-12 by #12 after `/code-review` found the
  criterion the code claimed and did not have. Every *grade* is answered with a fresh snapshot so the
  client's counts cannot drift from the database — and `snapshotOf` reads `note.fields` **live**,
  because `04` §7.7 snapshots membership and nothing else. **Installing that answer wholesale
  re-reads the text mid-run**, which is PRD §5's *a note edited mid-session shows the old text*
  failing quietly, on a screen whose whole contract is that the run was decided once.
  ⚠️ **It is unreachable today and that is why it is written down rather than left to the freeze:**
  an accepted *note*'s fields are frozen against every writer (ADR 0052) and a *card* exists only for
  an accepted *note*, so the freeze is doing the prefetch's job — and `S9`'s re-vetting (#13) is
  where lifting it gets argued. **`localStorage` makes it reachable a second way**: a resumed run
  that rehydrates from the database would be reading the new text over the snapshot's.
- ⚠️ **`review_session.size` is what was composed, not what the reader asked for**, and the two look
  identical until the queue runs short. The knob is a **cap** (`06-decision-log.md`, 2026-09-12):
  `04` §14 makes the *progress rail*'s length `review_session.size` and `04` §7.7 holds `size` rows,
  so a reader with seven *cards* and a knob at twenty gets a rail of seven. **Anything that later
  reads `size` as an intention rather than as a count is wrong** — a *session* completion rate on
  Stats (#14) computed as *graded ÷ size* is correct only because of this, and would be silently
  wrong under the other reading.

- ~~⚠️ **The *acceptance rate* arithmetic is a pure module and Stats must not re-derive it in SQL.**~~
  ⚠️ **The figure was retired 2026-09-18 by #23 and the file is deleted (ADR 0062) — but the rule
  outlived it and is worth restating in the new nouns: the arithmetic is
  `shared/metrics/stats.ts` and `server/utils/stats/queries.ts` must not re-derive a rate in SQL.**
  The one thing in that query module that looks like an exception and is not is
  `count(distinct card_id)`, which is **deduplication** and has to happen where the rows are. The
  original follows, because the SQL shape it names is still the one that looks most reasonable:
- ⚠️ **The *acceptance rate* arithmetic is a pure module and Stats must not re-derive it in SQL.**
  ⚠️ **Held 2026-09-12 by #14**, and the bullet was one word too narrow: `shared/metrics/stats.ts`
  **imports** `acceptanceRate` and `notesGenerated`, and a second copy in TypeScript would have been
  the same failure as a copy in SQL, with a shorter fuse and a prettier diff. The counts are
  `server/utils/stats/queries.ts`'s; the rate is still #11's. The original follows, because the SQL
  shape is the one that looks most reasonable:
  `shared/metrics/acceptance.ts`, added 2026-09-12 by #11, holds the numerator rule (`S6`: an edited
  accept is an **edit**) and the denominator rule (*notes generated*, which includes every *pending
  note*). ⚠️ **Both of the ways to get it wrong bias the number the same direction — up** — and
  `11` §3 calls it the most likely arithmetic error in the app and the one that would flatter the
  thesis. A `COUNT(*) FILTER (WHERE state = 'accepted')` over decided *notes* written straight into
  #14's query is the failure, and it looks entirely reasonable in a diff. **The seam is counts in,
  a rate out**; the query that produces the counts is #14's, and so is `S10`'s suppression boundary,
  which governs all four ratios at once.

- ⚠️ **Acceptance must never mint a *scheduling epoch*, and the constraint that says so is three
  tables away from the code that would.** `scheduling_epoch.card_id` is `RESTRICT` (`04` §9), so an
  epoch written at acceptance makes ADR 0033's `Z` fail on **every** acceptance — the database
  refuses the delete and the undo is dead, with a failure that reads like a database problem rather
  than a decision. ADR 0033 said it in its own words ("a card with no `review_log` and no
  `scheduling_epoch`") and nothing had put the sentence beside the constraint until #10.
  `test/schema/vet.test.ts` asserts the **absence**, so the day #12 reaches for the obvious place to
  put the first epoch the *undo* tests redden rather than the *Review* ones. **The first epoch
  belongs to the *session* that first schedules the *card*.**
- ⚠️ **A `RESTRICT` refusal raises `23001`, and Drizzle wraps it.** Measured 2026-09-12 against
  PGlite 0.5.8 / PostgreSQL 18.3: `23503` is `foreign_key_violation` and belongs to `NO ACTION`;
  `04` §9 spells every rule in the `card` chain `RESTRICT`. A guard written against `23503` alone
  catches **nothing**, and reading `code` off the error Drizzle throws catches nothing either — the
  driver's error is its `cause`, and the wrapper's own `code` is `undefined`. `server/utils/vet/undo.ts`
  walks the chain and accepts both codes. **The class is wider than this file**: every `RESTRICT` in
  `04` §9 is a refusal some future code will have to recognise.
- ⚠️ **The e2e tier's database accepts one connection at a time, so `Promise.all` in a request
  handler fails there and only there.** Measured 2026-09-12: `@electric-sql/pglite-socket` fronts a
  single-connection PGlite (`test/schema/harness.ts` says so of the schema tier and it is just as
  true of the socket), so four concurrent reads make `node-postgres` open four connections and the
  server resets three. The route answers `500`; the browser shows an empty screen; **nothing in the
  test output names the cause**, and production would have been fine. `server/utils/vet/queries.ts`
  runs its four reads sequentially and says why. ~~**#12 composes a *session* out of several reads
  and will meet this on its first browser test.**~~ ⚠️ **#12 did not meet it, because it was written
  down here.** `server/utils/review/queries.ts` and `server/utils/review/session.ts` are sequential
  by construction and both cite this bullet — six reads compose a *session* and none of them raced.
  **That is the bullet working rather than the finding being wrong**, and it is worth saying which,
  because a prediction that never fires reads afterwards like a prediction that was not needed.
- ⚠️ **`04` §7.1's idle sweep runs on the next read and therefore not at all while nobody is
  looking** ([ADR 0050](adr/0050-the-idle-sweep-runs-on-the-next-read-because-there-is-no-scheduler.md)).
  A run abandoned by a reader who never comes back stays open, so a *rejection* inside it stays
  reversible — and becomes permanent the instant anybody reads. In v1 that is one reader with one
  laptop, so the window is theoretical; it stops being theoretical for a second reader, which is the
  ADR's revisit condition. ⚠️ **It is also the reason `Done` may fire its end request without waiting
  when the run holds no rejections**: the sweep is the floor under that.
- ~~⚠️ **`S6`'s "an *accepted* *note*'s fields are frozen" is true by accident, not by a
  guard.**~~ ⚠️ **Paid 2026-09-12 by #11 —
  [ADR 0052](adr/0052-an-accepted-note-is-frozen-against-every-writer-and-any-readers-acceptance-freezes-it.md),
  and the guard is in the `WHERE` of both write paths.** `server/utils/note/fields.ts` is the
  application's one write path to `note.fields` and refuses on a `NOT EXISTS`;
  `worker/pipeline/write_pending.py`'s `ON CONFLICT DO NOTHING` is the worker's half and now has a
  test that reddens if it becomes an upsert. **Both sabotaged to red.** ⚠️ **The part worth carrying
  is who it freezes against:** `note` is *shared* and `note_vetting` is *personal* (`04` §4), so
  **any** reader's acceptance freezes the fields, not just the requesting reader's — the
  owner-scoped rule lets a second reader rewrite the first reader's *cards* under them. Unreachable
  while ADR 0012 invites one reader. **Not a trigger**, deliberately: `04` §7.5 has exactly one and
  ADR 0011 names exactly one irreplaceable thing.
- ~~⚠️ **`note_vetting.flagged_at` is written now and still nothing reads it.**~~ **Paid 2026-09-17 by
  #20**: the queue reads it for the aside and orders by the oldest open `card_flag` instead (§ Carrying,
  top). ⚠️ **Amended
  2026-09-12 by #13**, which is the half of this bullet that moved: `X` stamps it, and the *Vet*
  queue still selects `state = 'pending'` — so `10` §4.3's `returned by a flag` aside is drawn, the
  column is set, and the *note* does not come back. The query that would find it is `04` §11's
  `card_flag (note_id) WHERE resolved_at IS NULL`, and it belongs to the re-vetting ticket with the
  four decisions behind it (ADR 0056, § Next). The original, because the shape of the refusal is the
  same one step earlier:
  ⚠️ **`note_vetting.flagged_at` is rendered and never written.** `10` §4.3's `returned by a flag`
  aside is built, the queue query reads the column, and nothing sets it — `X` is *Review*'s key and
  `S9` is #13's. **#10 also deliberately does not resolve a flag**: `04` §7.8 says
  `card_flag.resolved_at` is "set when the note is re-vetted", and re-vetting a flagged *note* is
  reachable only through machinery that does not exist. Half of `S9` built inside #10 would have been
  a guess at the half that was not.
- ⚠️ **`05` §4's type ramp is written per *field name*, and the *subject* declaration has no role
  that would generalise it.** "*Vet* — the *meaning*" at 40px Newsreader and "*Vet* — example
  sentence" at 27px Mincho are three JLPT field names, not three roles; the declaration carries
  `kind`, `required`, `memory_bearing` and `label` and nothing that says *this value is Japanese
  prose read at length*. `app/components/VetNote.vue` holds a three-entry map with a fallback and
  says it is standing in for something. **A second *subject* closes it in the declaration** (ADR
  0003), not in a second map — and `10` §4.4 now carries the amendment.
  ⚠️ **Amended 2026-09-12 by #12: there are two maps now, and this bullet said *not in a second
  one*.** `app/components/ReviewCard.vue` has its own — `roleOf`, four field names to four entries in
  the ramp, plus a two-name set for the `:lang` hook. It is the same gap seen from the other *mode*:
  `10` §5.4 says "the *meaning* at 36px Newsreader 300" and "the example at 22px Mincho", which are
  field names rather than roles. **The instruction has not changed and is now worth more** — the
  declaration is where this closes, and a second map is evidence that a third is coming rather than a
  reason to keep writing them.

- ⚠️ **The reading half of ADR 0006's *identity key* is the *surface*'s reading, so one word becomes
  several *notes*** — [#15](https://github.com/yutaasakura96/kioku/issues/15), found by #9 and
  deliberately not fixed in it. Measured 2026-09-12: あります gives `normalized_form` 有る with
  `reading_form` アリ, so it keys `有る␟あり`, while ある keys `有る␟ある`; 開いた keys `開く␟ひらい`
  beside `開く␟ひらく`. **§ Carrying's `normalized_form` finding fixed the term half and left the
  reading half on the surface**, and every inflecting word class — verbs and i-adjectives — is
  affected. ⚠️ **It is worse than a key problem**: ADR 0045 makes `reading` a field on the answer side
  of the *card* (`10` §5), so the first *card* #10 mints from an inflected word shows ひらい. The fix
  is a decision rather than a patch. ⚠️ **Decided 2026-09-13, and the measurement reversed both of
  this bullet's own claims** (ADR 0045 § Amended 2026-09-13): re-tokenising `normalized_form` reads
  **ナル** for する — し normalises to 為る — so the candidate this bullet called right is wrong on one
  of the commonest words in the language; and the cost it was weighed against, collapsing
  開く/ひらく into 開く/あく, **is not a cost**, because `開く␟あく` is unreachable — 48 hits of 48
  across sixteen forcing sentences and all three split modes resolve to ヒラク. ⚠️ **`04` §5.3's pair
  is a worked example of the key's shape, not a pair this pipeline mints.** The rule adopted is
  **re-tokenise `dictionary_form`, and only for a surface that inflected** — the guard is
  load-bearing, because 六時's 時 reads ジ in place and トキ alone. ⚠️ **And SudachiPy 0.6.11 does
  expose a public route to the lexicon** — `Dictionary.lookup()` entries carry a public `word_id()`,
  which matches `dictionary_form_word_id` without private API; the deprecated accessor is only needed
  to read the dfwid, and the rule chosen needs neither. **It changes the identity of existing
  *notes***, which is `03` §5.3's reviewed-data-event class — **free today because none exists, and
  not free after the first run**, which is why #15 now sits in front of it.
  ⚠️ **Closed 2026-09-13 by #15, and kept here rather than deleted for one reason**: the re-tokenised
  reading is computed in **stage 2**, and stage 3 only chooses between two fields on `Token`. The
  next person to look for the rule will look in `reading_of`, which is where the defect was and is
  not where the fix is. `pipeline/tokenise.py` owns `dictionary_form_reading` and `is_inflected`;
  `extract_candidates` owns the choice and ADR 0045's script rule; `11` §8's seam is why the line
  falls there and not somewhere more convenient.
- ⚠️ **A test fixture that does not clean a content-keyed table serves one test's answers to the
  next.** `generation_cache` is keyed on `(content_hash, dictionary_version, prompt_version,
  model_id)` — nothing a test owns — and it was not in `conftest.py`'s `SCRATCH_TABLES`. Six of #9's
  tests went **green for the wrong reason** before they went red for the right one: every assertion
  about *what the provider was asked* had quietly become an assertion about the previous test, and
  the one that failed first failed on a `UniqueViolation` rather than on the thing it was about.
  It is in the list now, first and alone, because it references nothing and `04` §10 calls it the one
  table safe to truncate. **The class is wider than this table**: a cleanup list built from "what
  this test wrote" misses anything keyed on content.
- ⚠️ **`03` §5.1 and `04` §6.3 disagreed about what stage 6 is, and only one of them could be
  wrong** — closed 2026-09-12 as
  [ADR 0047](adr/0047-generation-is-one-request-per-chunk-and-notes-are-written-as-each-chunk-returns.md).
  *The LLM, per surviving note* against a cache keyed on the *chunk*'s content hash holding a
  `{"notes": […]}` array: per-candidate requests would put every candidate in a chunk under one
  four-tuple. **The chunk is the unit**, and the chunk's text is in the prompt, because a key that
  does not cover the request is a hit answering a question nobody asked.
- ⚠️ **A cached generation can answer *more* than a run needs and never less, and the asymmetry is
  load-bearing.** The key is the chunk's content, which cannot change; the survivor set shrinks as
  the corpus grows (`S5`). So extra notes in a hit are ignored — and **a hit that misses a survivor
  is treated as a miss**, because serving it would lose a *note* in silence: the chunk would still be
  marked `complete`, so no resume would ever come back for it. The same rule makes a stored response
  that no longer validates a miss rather than an error.
- ⚠️ **`note_field_provenance.kind` has four values and v1 can now produce three** (ADR 0048).
  ⚠️ **Amended 2026-09-12 by #10: `human` is written**, and it is written **only for the fields an
  edit actually changed** — a field the reader read and left alone was produced by the model, and
  stamping it `human` takes ADR 0018's instrument away one *note* at a time. `judgement` stays
  unreachable: v1 hands the model no sense inventory, so a `judgement` row would claim a choice among
  alternatives that never existed and `04` §12's eighth query would be grouping over a distinction
  with no mechanism behind it. **One of four empty is the honest state.**
- ⚠️ **`TRUNCATE … CASCADE` does not stop at the tables you name, and `worker/tests/conftest.py`'s
  cleanup reached `review_log`.** Measured 2026-09-12: `TRUNCATE job, ingestion_chunk, ingestion,
  source_chunk, source CASCADE` follows `note.origin_ingestion_id` → `note` → `card` → `review_log`,
  and a grade written before the statement was gone after it. The comment above that line said
  `review_log` "is not among them and must not be" — true, and beside the point. ⚠️ **`CASCADE` was
  not decorative either**: without it Postgres refuses the statement outright — *cannot truncate a
  table referenced in a foreign key constraint … Table "note" references "ingestion"* — so the one
  keyword that made the cleanup run was the one that let it walk this far. It is ordered `DELETE`s
  now, which is what `04` §9's rules actually apply to: the `RESTRICT` on `card.note_id` refuses two
  tables short, and `review_log`'s `BEFORE DELETE` trigger fires. **A comment was standing in for a
  guard for a day; `test_scratch_cleanup.py` is the guard.**
- ⚠️ **A committed `review_log` row can never be deleted, so a test that writes one poisons every
  later test in the session.** ⚠️ **Amended 2026-09-12 by #12: it is not only the worker's
  fixtures.** `test/e2e/review.test.ts` grades a *card* in its first run, and its second `beforeAll`
  cannot reset the tier by deleting the rows it wrote — the trigger refuses with its own message, in
  the tier where the failure looks like a broken harness. **Each run takes its own *card* instead**,
  which is the only cleanup that exists for this table: none. `04` §7.5's trigger refuses the `DELETE`, which refuses
  `scheduling_epoch`, which refuses `card`, which refuses `note` — and `note` is in the fixture's
  cleanup list. `test_scratch_cleanup.py` runs its whole assertion inside a transaction it rolls back
  (`psycopg.Rollback`, with an inner savepoint for the refusal it expects). **The one table worth
  protecting is the one a test cannot clean up after.**
- ⚠️ **`normalized_form` is the term half of ADR 0006's *identity key*, not `dictionary_form`**, and
  the reason is measurable: 引越し and 引越 both normalise to 引っ越し while `dictionary_form` returns
  each surface unchanged, and ひらいた normalises to 開く where `dictionary_form` stops at ひらく
  (2026-09-12, SudachiPy 0.6.11). Keyed on the lemma, one word becomes three *notes*. `03` §16 is the
  sentence that reconciles ADR 0006's prose — *keys a note on (dictionary-form term, reading)* — with
  the field that does it. **And the same field rewrites 六 to `6`**, which is why the numeral rule is
  not optional: the field that buys the deduplication is the field that writes a digit where a word
  should be.
- ⚠️ **The four `ingestion.candidates_*` columns are four disjoint buckets counted per *chunk*, and
  `04` §6.1 never said so.** Extracted counts **sightings**; deduplicated is the sightings folded
  within one chunk; already-known and rejected are groups. A rejected word matches both of the last
  two filters — `04` §7.2 keys a rejection on `note_id` — and is counted **once**, under rejected,
  because `03` §11 shows the reader *which* filter removed the work. `04` §6.1 is amended and the
  decision log carries the reading in full.
- ⚠️ **A word in two *chunks* is two groups, and stage 4 cannot see across a chunk.** Tokenisation is
  per chunk (`03` §5.1), so #8 alone would ask for the same word twice. **`03` §5.1 stage 7's
  streamed write is what closes it** — once chunk 1's *note* exists, chunk 2's sighting is an
  `already_known`. So the streaming is not only `S2`'s time-to-first-review; it is also what keeps a
  long *source* from being generated twice. **#9 must not batch its writes to the end of a run.**
- ⚠️ **The reading is a field on the card, not only half of a key.** That is what decided ADR 0045:
  a mechanical katakana→hiragana conversion gives コーヒー the reading こーひー, which is fine in a key
  nobody sees and wrong on the answer side of a *review*. The rule looks at the **term** rather than
  the surface, and ひらがな is the case that proves it has to — its normalized form is 平仮名.
- ⚠️ **`worker/pipeline/` module names are the declaration's stage keys and a test asserts the
  correspondence — all seven since #9.** It asserted five while stages 6 and 7 had no module, and
  `generate.py` and `write_pending.py` are those modules. ⚠️ **Two of the seven are not pure**, and
  `03` §5.1 never said they were: `generate.py` is still a pure function over a declaration and a
  chunk (the socket is `provider.py`), but **`write_pending.py` writes**. Stages 2 to 5 are the pure
  ones, which is what `11` §8 means by the seam.
- ⚠️ **`SudachiPy`'s `MorphemeList` is still not sliceable and the finding is now closed in one
  place.** `morphemes[:3]` raises `TypeError: argument 'idx': 'slice' object cannot be interpreted as
  an integer` (re-measured 2026-09-12, 0.6.11). `pipeline/tokenise.py` iterates it once into plain
  dataclasses, so nothing downstream can rediscover it.
- ⚠️ **`SudachiDict-core` 20260723 declares 1,558 part-of-speech tuples over 16 top-level classes**,
  enumerated with `Dictionary().pos_matcher` rather than read from documentation. ADR 0044's
  allowlist is 11 of the 38 distinct `(pos₀, pos₁)` pairs and its exclusion list is the other 27, and
  a test asserts the two cover the dictionary exactly — **so a dictionary bump that adds a category
  fails by name** instead of silently dropping a word class. That test is a second reason PIN 2/6
  must not move.
- ⚠️ **`readBody` caches on the event, so two middlewares can both read one form post.**
  `submit-resume.ts` reads the body before `submit-source.ts` does, which is the one thing that could
  have made the resume control quietly break the submission it sits in front of. It is asserted
  rather than assumed: the over-cap e2e test posts 100,001 characters with no `resume` field and
  expects them back inside the textarea.
- ⚠️ **The `POST /` handlers are ordered by filename and there are two of them now.** `session` on
  the `e`, `shell-data` on the `h`, then `submit-resume` before `submit-source` on the `r`. It is the
  same mechanism `shell-data.ts` documents and it fails the same way — closed: a reordering makes the
  resume control read `undefined` for the session and fall through without writing.
- ⚠️ **`CANDIDATE_PART_OF_SPEECH` excludes 代名詞, and that is the most arguable line in the
  repository's Japanese.** これ / それ / あなた are genuinely N5 vocabulary and are also in every
  *source*. ADR 0044 says so in its own text and names the first real run as the instrument. Changing
  it does **not** change the identity of an existing *note* — unlike a dictionary bump or the
  rendering rule — so it is cheap to change and it does not re-ask about words already rejected.

- ⚠️ **On an autocommit connection, `SELECT … FOR UPDATE SKIP LOCKED` followed by an `UPDATE` hands
  the same row to two workers.** `04` §6.4 says the two statements go "in the same transaction", and
  the worker's connection runs `autocommit=True` — which is itself not optional (`03` §3.1: without
  it the listening connection sits idle *in a transaction* and Neon's five-minute
  `idle_in_transaction_session_timeout` kills it on a schedule). So there is no ambient transaction
  to put them in, the `SELECT`'s row lock is released the moment it returns, and the window between
  the two statements is exactly the race `SKIP LOCKED` was chosen to close. **The claim is one
  statement** — the select is the `UPDATE`'s sub-select — which is the strongest available form of
  "the same transaction" and the only one available at all here. `04` §6.4 is amended.
- ⚠️ **PgBouncer's own feature matrix gives `LISTEN` = `Never` and `NOTIFY` = `Yes` in transaction
  pooling**, and this project said "does not support `LISTEN`/`NOTIFY`" in three places. Checked
  2026-09-11 against [pgbouncer.org/features.html](https://www.pgbouncer.org/features.html);
  `03` §4.1, verification §7.2 and §9.2 are amended. **The mechanism is why it generalises:**
  `LISTEN` is session state and transaction pooling gives the server connection to the next client at
  commit; `NOTIFY` is a statement whose effect the *server* delivers at commit, and it does not care
  who carried it. This is what let ADR 0043 put the wake-up in the app instead of in a trigger.
  ⚠️ **Still unverified against Neon**, whose own page names the pair — and the design is correct
  either way, which is the only reason it was allowed to ship unverified. The falsifying experiment
  is one statement and it is in § Next.
- ⚠️ **The `LISTEN` channel is a cross-language constant and a mismatch is completely silent.**
  `kioku_job` lives in `server/utils/ingest/notify.ts` and in `worker/loop.py`; get them out of step
  and nothing raises, nothing logs, and the worker simply never wakes — it drains only on connect, so
  every run waits for a reconnect. `09` §7 then reports that honestly as "queued 4m, not yet picked
  up", which reads exactly like *the worker is not running*. Guarded the way `03` §6's declaration
  is: `test/unit/job-channel.test.ts` reads the Python file and asserts the two spellings agree.
- ⚠️ **ADR 0038's "three tests and nothing else" is now twenty-three, and the number was the wrong
  thing to have written down.** What the ADR was protecting is *a laptop with no Docker runs the
  entire TypeScript suite*, and that is untouched. What moved is that #7 writes SQL which is not a
  concurrency behaviour — the chunk queue, the resume query, the settle, the drain — and testing
  Python's SQL needs a database, which in Python means the container. The alternative was testing a
  **copy** of those queries from the TypeScript tier, which is `04` §13's drift argument aimed at the
  tier that exists to prevent drift. ADR 0038 and `11` §7 carry dated amendments.
- ⚠️ **`worker/tests/README.md` asserted that the container tests *skip* without Docker. They go
  red.** ADR 0038: *"it is the worker's three concurrency tests that go red — visibly and for a
  stated reason, rather than the whole suite refusing to start"*, and `11` §7 and #7's own acceptance
  criteria both say red. The sentence was written with #3 as a contrast for the drift test — *"that
  is the opposite of ADR 0038's three container tests"* — and the contrast did not exist: **nothing
  in that directory skips.** Corrected in place. It is the same failure mode as #6's `<textarea>`
  comment: a confident sentence about a decision, written next to the decision, without reading it.
- ~~⚠️ **Nothing sets `job.available_at` forward, and the loop has no branch that would notice if it
  did.**~~ **Half paid 2026-09-12 by #8 — [ADR 0046](adr/0046-a-job-gives-up-after-five-abandonments-and-the-retry-after-the-first-is-deferred.md).**
  The sweep now sets `available_at` forward from the second abandonment and gives up on a job at five,
  so the **infinite re-claim is closed**. ⚠️ **The other half is open and is in § Next**: nothing is
  scheduled to come back for a future-dated job, so the cap is thirty minutes rather than hours and a
  deferred job waits for the next notification or reconnect. The original text, which is still the
  best statement of the problem:

- ⚠️ **Nothing sets `job.available_at` forward, and the loop has no branch that would notice if it
  did.** `04` §6.4 calls it backoff — "a retry sets it forward rather than sleeping in the worker" —
  but `03` §3.1 step 6 forbids the timeout branch from issuing a query, so a job deferred into the
  future has nothing scheduled to come back for it: it waits for the next notification or the next
  reconnect. Today that costs nothing, because the only writer sets `now()`. **The ticket that
  introduces chunk-level retries owns the question**, and it is a genuine one — a timer branch that
  polls is exactly the keepalive `03` §3.1 refused, so the answer is probably a shorter block timeout
  when and only when the drain saw a future-dated row, which is still not a query on expiry.
  ⚠️ **`attempts` has no ceiling either**, and the two gaps are one gap: a job that reliably kills
  the worker is swept back to `queued` and re-claimed immediately, forever, with `attempts` counting
  up and nothing reading it. Today nothing can produce such a job — the handler is bookkeeping — and
  the ticket that makes a job able to fail owns both halves.
- ~~⚠️ **Every ingestion settles `incomplete` until #8 lands a chunk processor**~~ — **#8 landed it
  2026-09-12**, so a run that reads its whole *source* settles `complete` and `incomplete` goes back
  to meaning a run that stopped part-way. `10` §6.2 is amended. Kept because the reasoning is the
  reason `failed` is still not reachable from `settle_run`:

- ⚠️ **Every ingestion settles `incomplete` until #8 lands a chunk processor**, and that was the true
  answer rather than a placeholder: the queue is open, nothing was processed, and every chunk is
  still there. The run row says `0 of 31 chunks · 0 notes so far`. ⚠️ The two other readings would
  both be lies — `running` claims a worker is on it, `failed` claims something broke — and `04` §6.1
  is explicit that **`incomplete` is `S2`'s resumable state, not an error.**
- ⚠️ **`recordSource`'s `jobKind` parameter said "#7 writes `resume`" and #7 does not.** A resume
  enqueues a second `job` against an *ingestion* that already exists (`04` §6.2) and writes no
  `source`, no chunks and no `ingestion` — which is everything else that function does. The parameter
  is reachable only from `test/schema/ingest.test.ts`, where it drives `04` §6.4's `CHECK` through the
  production path instead of by raw SQL. The comment is corrected on the field.

- ⚠️ **`@vue/compiler-ssr` renders a `value` bind on a `<textarea>` as the element's raw children, and
  the HTML parser eats one newline after `<textarea>`.** So a refused paste beginning with a blank
  line came back one line shorter than it went in — which is exactly the loss `09` §4.2 exists to
  prevent, in miniature and harder to notice. `app/pages/index.vue` prepends a newline so the eaten
  one is ours. ⚠️ **This was a comment asserting the opposite from memory** — that `:value` avoided
  the problem — and `/code-review` caught it. It is what CLAUDE.md § Working agreements means by
  "never verify from memory": the two claims either side of it in the same commit *were* measured, and
  this one read exactly like them.
- ⚠️ **A missing `owner_id` filter on `recentRuns`, `allSources` and `sourceDetail` is `04` §4, not a
  bug**, and it was read as one during review. A *source* and an *ingestion* are **shared** — "true
  regardless of who is asking" — and `ingestion.submitted_by` is documented on the column as "**an
  audit line, not an owner**". `startBlockCounts` *is* filtered, because *note vettings* and *cards*
  are personal. **Adding a filter to the first three would be a product change.** The reasoning now
  sits on the function rather than only in `04`.
- ~~⚠️ **`incomplete` owes a resume control and #6 did not build it.**~~ **Paid 2026-09-12 by #8**,
  after #6 moved it to #7 and #7 moved it to #8 — each time correctly, because the control is only
  worth shipping once a resume does something. `server/utils/ingest/resume.ts` writes one `job` row
  at `kind = 'resume'` and refuses any status but `incomplete`; `server/middleware/submit-resume.ts`
  answers the form; `app/components/RunRow.vue` draws it. `10` §6.2 carries the geometry. The
  original, kept because three tickets deferred on its argument:

- ⚠️ **`incomplete` owed a resume control and #6 did not build it.** `10` §6.2 and `09` §7 both give
  that run row "a resume action (the quiet affordance, with its arrow)". The control is a **write** —
  a second `job` at `kind = 'resume'` (`04` §6.4) — and what resuming means is `04` §6.2's resume
  query, which is the worker's and arrives with #7. A control that wrote a job no worker could act on
  would be worse than the line that says what completed. `10` §6.2 is amended to say so.
- ⚠️ **Two of #6's acceptance criteria were met by changing the documents they cite**, and both are
  disclosed rather than quietly folded in. The submission path moved to `POST /` (ADR 0042) and
  `/sources/:id` was built readable-only although criterion 8 puts the detail route out of scope. Each
  has an amendment in the document it contradicts. **Neither is a decision a reviewer should have to
  reconstruct from the diff**; if either is wrong, the amendment is where to argue it.

- ⚠️ **Interpolating a Drizzle column into a `sql` template emits a *bare, unqualified* identifier**,
  and in a correlated subquery that silently binds to the inner table. Measured 2026-09-11,
  drizzle-orm 0.45.2: ``sql`… WHERE ${note.originIngestionId} = ${ingestion.id}` `` emits
  `WHERE "origin_ingestion_id" = "id"`, and inside a subquery over `note` that `"id"` is `note.id`.
  Valid SQL, no error, a number comes back. The fix is to build the subquery with Drizzle and embed
  it — ``sql`${subquery}` `` emits `where "n"."origin_ingestion_id" = "ingestion"."id"`.
  ⚠️ **The worst case was the *pass*, not the failure:** the chunk count written the broken way came
  out as `WHERE "source_id" = "source_id"`, trivially true, counting every chunk in the table — and it
  **agreed with the right answer for as long as there was one *source***. That is why
  `test/schema/place-queries.test.ts` seeds a second *source* and a second *ingestion* for every count
  that has one. **It generalises past that file: any `sql` template meaning to correlate is wrong the
  same way.**
- ⚠️ **JavaScript's `.length` is UTF-16 units and Python's `len()` is code points, and `04`'s offsets
  cross that line.** `'𠮟'.length` is 2; `len('𠮟')` is 1. The app writes `char_start` / `char_end`
  and the worker slices `source.content` by them in Python, so **one character outside the BMP puts
  every later offset one out** — silently, surfacing months later as an *occurrence* highlighting the
  wrong span. Everything in the ingest path goes through `shared/ingest/text.ts`, which iterates code
  points; nothing there uses `.length` or `.slice` on source text. Same class as #3's `trim()` /
  `str.strip()` divergence, closed the same way. ⚠️ `Intl.Segmenter` is the wrong fix — it counts
  *graphemes*, and the contract is with Python's `len()`.
- ⚠️ **Nuxt's page renderer answers `POST` with a fully rendered document, and a middleware cannot
  re-route by rewriting `event.node.req.url`.** Both measured 2026-09-11 against the built app; the
  second `404`s. Together they are why **the *source* submission is `POST /`, not `POST /api/source`**
  (`09` §1 and §4.2 amended): a refused paste must be answered with the Ingest document re-rendered
  and the reader's text in it, and a Nitro route handler cannot render a page. `nitropack` 2.13.4's
  `localFetch` takes no context either, so the paste cannot travel to an internal render. **Everything
  the old row was for is unchanged** — form, post-redirect-get, `SameSite=Lax` CSRF.
- ⚠️ **The three *places* read their data from `event.context`, not from a fetch.** `#5` set the idiom
  (`app/pages/auth/index.vue` reads `useRequestEvent()?.context.session`) and #6 extended it:
  `server/middleware/shell-data.ts` attaches a **lazy reader**. The alternative — `useAsyncData` +
  `$fetch` against new `/api/**` read routes — was rejected on three counts, and **the middle one is
  the trap**: `useAsyncData` serialises its result into the Nuxt payload, which is a
  `<script type="application/json">` **on a route whose whole contract is that it emits no
  `<script>`**. The other two: it adds routes `09` §1's table does not have, and the internal call
  would need `useRequestFetch()` to forward the session cookie.
- **The chunking rule was decided here, not read.** 1200 characters, breaking at the last of
  `。！？\n` at or before the target, terminator belonging to the chunk it ends, hard break where the
  window holds none. `04` §5.2 gave the *property* ("a function of content … stable across
  re-ingestions") and its worked example gave the only number. ⚠️ Moving it changes
  `source_chunk.content_hash` for every *source* ingested afterwards and therefore the first element
  of the generation cache key — **a cost, not a corruption**: unlike a `SudachiDict` bump it cannot
  change the identity of an existing *note*, because boundaries never reach `normalized_form`.
- ⚠️ **`05`'s tokens now exist and the font *files* still do not.** `app/assets/css/tokens.css` is
  `05` §§1–6 — this closes the "no ticket owns them" bullet below. **What did not close:** `05` §4
  calls shipping the faces "a Phase 4 question" and **Phase 4 never answered it.** The stacks carry
  `05` §4's own fallbacks, so a reader today sees Georgia rather than Newsreader. It was left open
  rather than decided in passing because it is a dependency decision with a pin obligation
  (`03` §13.5); the leaning and the reasoning are in `06-decision-log.md`.
- ⚠️ **The e2e tier signs in now, and no endpoint mints a session.** PGlite behind
  `@electric-sql/pglite-socket` 0.2.11 gives the built app a real wire-protocol database;
  `test/e2e/session.ts` writes the row and signs the cookie with Better Auth's own scheme, read off
  `better-call`'s `signCookieValue`. **A test-only sign-in route was refused outright** — `S1` says
  refused at every route, and that would be a hole in the property #5 exists to establish. The forgery
  **cannot pass by accident**: anything wrong resolves to no session and a `302`, so it fails loudly.
  ⚠️ **Sign-in itself is still untested** and `11` §8 and §9 are unchanged.
- ⚠️ **A guard that a sabotage cannot reach is not a tested guard, and one of #6's is not.**
  `server/middleware/shell-data.ts` refuses to attach anything when no session resolved — defence
  against a middleware **reordering**, since Nitro runs `server/middleware/` alphabetically and
  `shell-data` sorts after `session` on the `h`/`e`. Sabotaged 2026-09-11 by giving it a fallback
  owner; **the suite stayed green**, correctly, because `session.ts` has already answered `302` and
  nothing downstream ever runs without a session. The comment in that file says so rather than
  implying coverage. **The general lesson: two of the ten sabotages this session did not fail, and
  both times the first question was whether the sabotage was weak — once it was** (a cross join over
  one row is an inner join) **and once it was not.**
- ⚠️ **`/sources/:id` exists and is only the readable half.** #6's criteria put the detail route in
  `S11`, and two of its other criteria link there — a link to a `404` is not an offer. Title, fact
  line, retained material. **The *notes*, the *occurrence* positions and `/sources/:id/delete` are
  still `S11`'s**; `10` §7.2 is amended to say which half is which.

- ⚠️ **TypeScript widens every string in an imported JSON module, so the declaration is derived and
  still untyped.** `typeof declaration.fields[number]['name']` reads exactly like it produces a union
  of the six field names; it produces `string`, and `const x: FieldName = 'zzz'` compiles — measured
  2026-09-10. **Nothing in `subjects/jlpt-vocab.json` is checked by `tsc`**, which is why both
  languages carry a `checkDeclaration` over the file's own shape as well as the `validate` seam, and
  why `03` §6's "the guard is a test, not a convention" is the only option rather than a preference.
  ⚠️ **A future session will reach for codegen to fix this.** It was considered and lost on what it
  buys: TypeScript's consumers *iterate* the declaration — *Vet* renders the judgement fields,
  *Review* renders a template — rather than naming fields, so a literal union would guard almost
  nothing for a generator, a generated file and a diff test.
- ⚠️ **The declaration's roles are flags, and that is load-bearing.** `kind` and `memory_bearing` sit
  on the field, so neither can name a field that does not exist. `identity_key` and a *template*'s
  `prompt` / `answer` stay lists because they are ordered and may repeat a name — `04` §5.3 renders
  the key "in the order the subject declaration lists them" — and those two are what
  `checkDeclaration` exists to guard. **Do not "regularise" the flags into parallel lists**; it would
  re-open the drift the flags close.
- ⚠️ **A stage key is also a Python module name.** `03` §10 puts one flat module per stage under
  `worker/pipeline/`, named by the declaration. `extract-candidates` with a hyphen parses as JSON,
  reads fine, and cannot be imported — invisible until #8. The drift test asserts every stage key is a
  legal lowercase identifier, which is the only place that is checked.
- ⚠️ **Node's ESM resolver is stricter than Vite, and `scripts/print-subject-view.ts` is where it
  shows.** It will not extension-guess (`ERR_MODULE_NOT_FOUND`, so the import carries `.ts`) and it
  refuses a JSON module without `with { type: 'json' }` (`ERR_IMPORT_ATTRIBUTE_MISSING`). Vite accepts
  both forms, so **the repo's own bundler cannot tell you the import is wrong** — only the drift test
  can, and only because it shells out to Node.
- **The worker's toolchain is uv, `pyproject.toml` and `uv.lock`, on Python 3.11.** ⚠️ The interpreter
  is pinned by `worker/.python-version` and **not** by `.tool-versions`, because uv reads the first
  and not the second and two files pinning one interpreter is the drift this project spends its time
  refusing; `.tool-versions` carries a comment pointing at it. 3.11 is the line verification §7.3
  measured SudachiPy's 9 ms load on. ⚠️ **`03` §13.5's bot rule is satisfied without touching
  `renovate.json`** — Renovate's `pep621` manager matches `pyproject.toml` wherever it sits, reads
  PEP 735 `[dependency-groups]`, and maintains `uv.lock` (verified 2026-09-10). The two Python pins
  written months ago finally have a file to attach to.
- ⚠️ **Two cross-language divergences were found by review, not by the suites, and both are now
  tested.** Both implementations were written, both suites were green, and the two still disagreed.
  **`null`**: TypeScript called it `not_a_string`, Python called it `missing` — and on an *optional*
  field that was one accepting what the other refused. It is an **absent field** in both now.
  **Whitespace**: `trim()` and `str.strip()` differ on exactly six characters across the BMP (swept,
  not recalled) — Python strips `U+001C`–`U+001F` and `U+0085`, JavaScript strips `U+FEFF` — and
  ⚠️ **`U+001F` is what `04` §5.3 joins the *identity key* with.** Emptiness is now a shared character
  class, the union of the two, written the same way on both sides. ⚠️ **It is anchored `\A…\Z` in
  Python and `^…$` in JavaScript deliberately**: Python's `$` also matches before a trailing newline,
  which would have been a seventh divergence. **The lesson is the general one** — "the two agree" was
  in three documents and in neither suite until someone compared the two implementations line by line.
- **The `validate` seam exists twice and the error *codes* are the contract, not the messages.** Both
  languages report declared fields in declaration order and then unknown keys in the order the output
  carried them. ⚠️ **Do not "improve" either side's error strings into prose** — the order and the
  codes are what the two suites assert, and a message would not survive translation.
- ⚠️ **The declaration's `validate` tests use a two-field synthetic, on purpose.** A test written
  against `jlpt-vocab.json`'s real six would pass for the wrong reason the day the validator
  hard-codes one of them. The real file gets its own tests — that it is internally consistent, and
  that it names what ADR 0006, ADR 0011, `03` §5.1 and `PRD` §6 say it must.
- ⚠️ **ADR 0005's authority list is owed and no ticket owns it.** `04` §5.6 makes
  `level_claim.authority_key` a key into the *subject* declaration and `04` §13 puts the precedence
  order there too. #3 did not build either: which publications count as *authorities* is a data
  decision ADR 0005 left open, not something to invent, and #3's acceptance criteria do not ask.
  The keys are additive. **The ticket that first renders a *level* lands them** — same shape as the
  `05` tokens gap below.
- ~~**Use `/grill-with-docs`, always.**~~ ⚠️ **Retired 2026-09-08 — the frontier is empty.** It was
  the right default for Phases 1–4 and it produced 39 ADRs; there is now nothing left for it to ask,
  and `CLAUDE.md` § Working agreements says do not run it and do not offer it. **What survives is the
  half that was never about grilling:** the build commands are `disable-model-invocation: true` too,
  so a session **says which one to type in one line and stops.** It does not substitute an interview
  of its own — `/project`'s included.
- **Grilling asks the whole frontier per round, not one question at a time.** This contradicts
  `CLAUDE.md` § Working agreements, which now records the substitution explicitly. **Rounds win.**
- **Find facts yourself; never ask Yuta for them.** Rounds 1 and 2 dispatched ten background agents
  between them and asked the rest of the frontier while they ran. That is the pattern. Round 2 also
  **measured** a number nobody publishes, rather than citing around it.
- **Recommendations get pushed back on, and that is the process working.** Round 2 recommended
  TanStack Start and got Vue; recommended Render and got Vercel-plus-a-laptop. Both reversals were
  right, and both are argued out in the ADRs rather than quietly swapped.
- **The initial deployment is temporary by design.** ADR 0022. The destination is EC2 or Lightsail.
  **Nothing may depend on a Vercel-only feature** — no Vercel KV, Blob or Cron — or the move stops
  being a preset change.
- **Every *mode* now carries a visible Done control**, on every viewport — ADR 0026. This came out of
  the phone layout (a phone has no `Esc`) but it is not a phone concession: it changes what a mode
  *is*, and `CONTEXT.md`'s definition moved with it. ADR 0013 emptied those headers on purpose, so
  the one control they carry was argued for, not defaulted into.
- **The ink ramp is four greys, not seven** — ADR 0024, and `05-design-system.md` §2 carries the
  outcome. *Vet* now reads heavier than the artboard does. **That is the decision, not drift**; do
  not "restore" the canvas values.
- ⚠️ **The key handlers bind to the mode container, never to `document` or `window`.** ADR 0025 put
  focus there so keystrokes land somewhere and a reload restores it. Verification §13.4 found the
  second reason: ADR 0023's map is all printable characters, so **SC 2.1.4 Character Key Shortcuts
  (Level A)** applies, and the application passes **only** on that criterion's "Active only on focus"
  exception. Binding to `document` is the obvious shortcut and it fails a Level A criterion with
  nothing on screen to show it. ADR 0025 is amended; `10` §4.1 and §11.
- **"Again" is not a grade label here** — ADR 0034. ADR 0016 turned same-day relearning off, so the
  soonest a graded *card* returns is **tomorrow** (verification §13.1, read from `ts-fsrs` source).
  `1 Forgot · 2 Hard · 3 Good · 4 Easy`. Anyone comparing a screenshot with Anki's will think the
  difference is cosmetic; it is the visible end of ADR 0016.
- **Three screens have three interaction states, not five** — ADR 0035. Ingest, Sources and Stats
  ship no JavaScript, so loading is the browser's and an error is a re-rendered document. **The
  asymmetry in `10`'s tables is the decision, not an unfinished table.** And **nothing in v1 is
  disabled**, deliberately — ADR 0032 already refused a disabled start control once.
- ⚠️ **The suite cannot tell you the thesis is failing, and that is the design** — ADR 0037. Green
  tests mean the instrument is built correctly and say nothing about what it will read. `S3` and
  `S10` are answered by `/stats`, by a person, after twenty notes. **Do not add a threshold
  assertion later "to be safe"** — ADR 0018 needs *acceptance rate* free to fall while the model is
  walked down.
- **PGlite is PostgreSQL 18.3 and its version is load-bearing** — ADR 0038, verification §14.1,
  **measured because the docs do not say**. `04` defaults every primary key to `uuidv7()`, a Postgres
  18 built-in, so a PGlite that regressed to 17 fails on the first migration. It joins the four pins
  in `03` §13.5.
- **Docker is required for three tests and nothing else** — ADR 0038. A laptop without it runs the
  whole TypeScript suite. Do not "simplify" the two harnesses into one Testcontainers tier; the
  946 ms inner loop is the thing being bought.
- **Grade by swipe is refused, not pending** — ADR 0036. ADR 0026 called it "genuinely good", which
  is exactly why it needed answering: SC 2.5.1 is **Level A**, so a gesture could only ever have been
  additive, and the trade the deferral assumed never existed.
- **`10-screen-specifications.md` belongs to Phase 4**, not Phase 3. The `/project` skill's own
  phase table says Phase 3; this project overrode it deliberately. Do not let a future session move
  it back on the skill's authority.
- **The ADRs are the decision log's long form.** Add the ADR first, then the index line.
- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Verified
  2026-09-03, recorded in ADR 0005. Do not re-verify; do not re-litigate.
- **ADR 0016 records a real cost, not a simplification.** Dropping same-day relearning is a genuine
  reduction in learning efficiency. If retention later looks poor while *false-accept rate* is
  clean, the answer-bounded session in that ADR is the first thing to try.
- **ADR 0019 was the weakest-held decision of Round 1**, and Round 2 did not disturb it. The Python
  worker's two-toolchain tax is real and the Node route runs an identical engine. It is fine to
  revisit; it is not fine to revisit by forgetting why.
- **ADR 0015 now survives on its second argument only.** The 9 ms measurement killed the latency
  reason for an always-on worker. What stands is that a directly-connected worker needs no HTTP job
  endpoint, which keeps PRD S1's "refused at every route" literally true.
- **Two Neon connection strings, on purpose.** Pooled for the app, direct for the worker. The pooled
  endpoint does not support `LISTEN`/`NOTIFY` — confirmed against Neon's own list and PgBouncer's.
- ⚠️ **This file used to claim a held listener keeps the Neon compute awake and exhausts the month.
  That was never verified and Neon does not document it** — it says what *wakes* an idle compute,
  never what prevents suspension (verification §9.2). What *is* documented: Free cannot disable
  scale-to-zero, and a suspended session destroys the listener along with every notification fired
  while the worker was away. **ADR 0028 is the answer and it holds whichever way the cost question
  resolves** — the job table is the truth, `NOTIFY` only shortens latency, and the worker
  re-`LISTEN`s *then* polls on every reconnect, in that order.
- **⚠️ Two pipeline findings, now carried by `03` §5.2:** numerals come back `is_oov=True` with
  `normalized_form` rewritten to ASCII (六 → `6`), which ADR 0006's *identity key* depends on — the
  rule is that numerals are excluded at candidate extraction rather than reaching the key; and
  `tokenize()`'s result is not sliceable, so anything windowing over morphemes iterates.
- **The dictionary version is now part of the ingestion cache key**, and `SudachiDict-core` is
  pinned at `20260723`. **Moving it can change the identity of existing *notes*** — it is a reviewed
  data event with a re-ingestion plan, never an automated bump. `03` §5.3 and the decision log.
- **⚠️ The laptop is the security weak point, and it is named rather than mitigated.** It holds the
  direct connection string and the model provider key at once. `03` §13.6 states what is true today
  (disk encryption, rotatable credentials, no key in the repo) and what is not (any second factor).
  This is a cost of ADR 0022's temporary shape, and part of what the move buys.
- **Backups are `S12`'s tested export, not Neon.** Free gives six hours of instant restore and one
  snapshot; six hours is not a backup for the one thing that cannot be regenerated. `03` §13.6.
- **⚠️ Better Auth's generated schema cascades from `user`, and ours must not.** Every child it
  generates carries `onDelete: "cascade"` (verification §10.2). Personal entities use **`RESTRICT`**
  instead — `04` §3 — because a copied default would let one deleted row destroy every *scheduling
  epoch* and *review log* beneath it. Better Auth keeps its own cascades; they are correct for data a
  sign-in regenerates. **The rule is not "no cascades" — it is that a cascade must never reach a
  table that cannot be rebuilt.**
- **Scheduling state lives on `scheduling_epoch`, never on `card`.** A reset is then an `INSERT`
  rather than an `UPDATE` over the history it is meant to preserve. Do not "simplify" it back onto
  the card at implementation time; `04` §7.4 is the argument.
- **`note.fields` gets no index.** No v1 query reads inside it — the card browser is cut and there is
  no field search. It is the index a future session adds on the general principle that jsonb wants a
  GIN index. It does not; queries do (`04` §11.1).
- ⚠️ **The spend ledger is not in a transaction with the cache write, and must not be put in one**
  ([ADR 0061](adr/0061-the-worker-heartbeats-while-the-model-streams.md) §4). It looks like the
  fix for a double-count and is the opposite. If the spend commits and the cache write is lost, the
  retry calls the model again, which is a second real charge, so recording it twice is correct.
  Wrapped together, that failure rolls back the record of a request already billed. **The candidate
  counters are the ones that do go in a transaction**, with their *chunk*'s completion, through the
  `runs.ChunkFinish` a processor returns. And **a model request heartbeats through the keepalive it
  is handed**: a provider that reads its response without calling it lets a long request's claim go
  stale and Neon suspend the compute under it.
- **The stale-job sweep runs in the worker**, not on a schedule elsewhere. Vercel Cron is on
  ADR 0022's forbidden list, and the worker already polls on every connect and reconnect, so it costs
  nothing (`04` §6.4).
- ⚠️ **`prerender`, `swr` and `isr` are forbidden on Ingest, Sources and Stats.** Each is the
  ordinary advice for a route that renders a form, a list and five numbers, and each turns a
  session-gated document into a shared artifact — a prerendered route is a static asset with no
  request to gate, and Nuxt maps `isr` onto Vercel's own CDN rules. ADR 0030, verification §11.4.
  The `noScripts` smoke test's `{ prerender: true, noScripts: true }` is correct **for the test**.
- ⚠️ **The allowlist's shape is the decision, not its location.** A list-shaped allowlist admits
  everyone when the list is empty, and Better Auth's documented `validateUserInfo` example narrows on
  the provider before comparing, which fails open the day a second provider exists. `08` §4.3 uses
  neither. A missing `KIOKU_INVITED_EMAIL` stops the process.
- **There are six routes, not five.** `/auth` is the door — it ships JavaScript and is neither a
  *place* nor a *mode* — and `/auth/refused` carries a message and nothing else. This does not amend
  ADR 0013, whose taxonomy is about the five screens of the app; `08` §2 adds the boundary before
  them.
- **The remote is [`yutaasakura96/kioku`](https://github.com/yutaasakura96/kioku), public, added
  2026-09-07.** ⚠️ **Public is the constraint that matters:** `KIOKU_INVITED_EMAIL` and every other
  value in `03` §13.1 stay out of the repository, and `08` §4.1's argument for keeping the allowlist
  in the environment is now stronger than it was when it was written. `/setup-matt-pocock-skills`
  still belongs after planning.
- **`frontend-design` and `superpowers` are off at project scope**, for different reasons.
  `CLAUDE.md` § Tooling state has both correctly.
- ~~⚠️ **Two amendments are owed to documents that are already written.**~~ **Both applied
  2026-09-07** while writing `10`: `04` §9.1 now excepts the card un-minted by `Z`, and `03` §8.1 now
  says the outbox carries *grades* **and** `S9` flags.
- ⚠️ **A *mode*'s Done control must be `external`.** `<NuxtLink :to="origin" external>` or
  `navigateTo(origin, { external: true })`. A bare `<NuxtLink>` client-renders the *place* into the
  page that is already running and hands the reader a `noScripts` screen with a live Vue app on it,
  with no error anywhere (`09` §5.2, verification §12.1). It is not version-specific and no upgrade
  will flag it; the `noScripts` smoke test is the cover.
- **ADR 0013 claimed to close the empty-*Vet* navigation gap and could not** — the gap is on *Vet*,
  and ADR 0013 is what made *Vet* a mode. ADR 0032 closes it with two controls that mean different
  things: Done returns to the *place* the reader came from, the quiet affordance says to go to
  Ingest. Do not "simplify" them into one.
- **The streaming queue is visible on *Vet*, not on Ingest.** Ingest ships no JavaScript, so it
  cannot poll, and no *place* auto-refreshes — a meta refresh on `/` would destroy a paste in
  progress. `S2`'s "vettable while the rest are still generating" works because the screen that has
  to show it is the one with a client (`09` §3, §7).
- ⚠️ **npm 11.3.0 cannot resolve `nuxt@4.5.2` from scratch, and the lockfile is what makes that
  survivable.** Measured 2026-09-09 while scaffolding #2: `npm install` crashes with
  `Cannot read properties of null (reading 'edgesOut')` inside arborist's peer-set walk. It is an
  upstream npm bug and not ours — a `package.json` containing nothing but `nuxt` and `vue`
  reproduces it. **`npm ci` against the committed `package-lock.json` works on 11.3.0**, so the
  normal path is fine; it is **adding or re-resolving a dependency** that needs **npm ≥ 12**
  (12.0.2 verified clean). `--legacy-peer-deps` also gets past it and is the wrong answer, because
  it turns off peer checking for the life of the project.
- **The repo pins Node with `.tool-versions`, at `nodejs 24.11.0`.** asdf's global is 25.1.0, which
  is *outside* Nuxt 4.5.2's `engines` (`^22.19.0 || ^24.11.0 || >=26.0.0`, `03` §2) — an odd-numbered
  line that is not an LTS. 24.11.0 was already installed, so this cost nothing.
- ⚠️ **`ssr: false` does not server-render the page, and `11` §6.1 is amended for it.** The response
  is an app shell with an empty `<div id="__nuxt">`, so a *mode*'s Done control is not in the HTML —
  measured 2026-09-09. **The `external` assertion is a browser assertion**, and it has to *click*
  Done rather than read its `href`, because a bare `<NuxtLink>` renders the same `href`. `03` §2.1's
  "an app shell, not a blank page" is correct; it is thinner than it sounds.
- ⚠️ **PIN 6/6's second half is `postgres:18.3-alpine`, and it lives in `worker/tests/README.md`
  because there is no manifest to put it in.** `@electric-sql/pglite` 0.5.8 is PostgreSQL 18.3, and
  `04` defaults every primary key to `uuidv7()`, a Postgres 18 built-in — so the two test databases
  have to agree on the major or the schema tier and the worker tier are testing different things.
  **No bot watches a tag in a README**, which is `03` §13.5's whole point. The TypeScript half is
  now guarded by an assertion in `test/schema/schema.test.ts`; **#7 owes the container half the same
  guard.**
- ⚠️ **The Better Auth generator's documented flags silently drop the `auth` schema.** Measured
  2026-09-09 while building #4. `npx auth@latest generate --adapter drizzle --dialect pg` — the form
  `04` §8 and `08` §7 both prescribed — makes the CLI **synthesise** an adapter rather than read the
  configured one, and the configured one is where `schemaName` lives. The output is `pgTable(...)` in
  `public`: the four tables appear, the migration succeeds, and the schema separation is simply
  absent. **Drop both flags and pass `--config`**, with
  `drizzleAdapter(db, { provider: "pg", schemaName: "auth" })`. Both documents are amended, and
  `test/schema/schema.test.ts` now asserts the four tables are in `auth` so the correction is held by
  a test rather than a paragraph.
- ⚠️ **`server/db/schema/auth.ts` is generated and must stay unedited.** `08` §7 keeps those four
  tables unremapped — no `modelName`, no `fields`, no `additionalFields` — **precisely so the file
  can be regenerated and diffed against what is deployed**, and a tidy-up costs exactly that. Two
  things in it look wrong and are not: the `onDelete: "cascade"` on every child of `user` is correct
  there (a sign-in regenerates a session and an account), and its `timestamp` columns are the one
  place the generator disagrees with `04` §1's `timestamptz` convention. **The cascade rule is not
  "no cascades"** — it is that a cascade must never reach a table that cannot be rebuilt, which is
  why `personal.ts` uses `RESTRICT` eighteen times.
- **The app's driver is `node-postgres`, and that is ADR 0040, not a default.** ⚠️ Two reasons, and
  the second is the one that would be lost: `@neondatabase/serverless` is a dependency ADR 0022's
  move has to undo, **and `drizzle-orm/neon-http` has no session at all**, so it cannot run `04`
  §9.1's `Z` un-mint as one transaction — choosing it would have made a schema decision by accident.
  Do not "modernise" this to a Neon driver on the grounds that the database is Neon.
- ⚠️ **A `RESTRICT` violation does not say "violates foreign key constraint".** Postgres says
  **"violates RESTRICT setting of foreign key constraint"**, which is a *stronger* signal and worth
  asserting on: it distinguishes `RESTRICT` from `NO ACTION`, and `NO ACTION` is what a careless
  migration would leave behind. Measured 2026-09-09 — the first draft of the schema tests asserted
  the weaker string and four of them failed.
- **`TRUNCATE` does not fire the `review_log` append-only trigger, and the schema tier depends on
  that.** The trigger is `FOR EACH ROW BEFORE UPDATE OR DELETE`; `TRUNCATE` is neither. This is a
  property of `TRUNCATE`, not a hole in the guard — it takes an `ACCESS EXCLUSIVE` lock and no
  application path issues one — but it is why a test reset is possible at all. ⚠️ **A future session
  that "closes the gap" by adding a truncate trigger breaks the tier's reset.**
- ~~⚠️ **#4 did not install `better-auth`, and #5 owes that work.**~~ **Paid 2026-09-09**, and the
  collision was narrower than this bullet guessed. ⚠️ **It is not SvelteKit and it is not TanStack
  Start** — those appear in npm's error only as the reason `vite` 8 is in the tree at all. The
  blocking edge is one line: `peerOptional vitest@"^2.0.0 || ^3.0.0 || ^4.0.0" from
  better-auth@1.7.3`, against this repo's `vitest` 5. **npm refuses an install over an *optional*
  peer that is present at another major**, which is the part worth remembering. The answer is one
  `overrides` entry scoped to `better-auth`'s subtree — `"vitest": "$vitest"` — and the install adds
  seven packages with no Svelte or TanStack among them. ⚠️ **`--legacy-peer-deps` is still the wrong
  answer and it is what the error message suggests**: it turns off peer checking for the life of the
  project, for every package, to get past one optional peer. `03` §13.5 carries both, plus the
  seventh pin: `better-auth` **1.7.3 exactly**, because `08` §7 regenerates and diffs the four tables
  and that only means something against a known version.
- ⚠️ **A *mode*'s `external` Done control is proved by a click, not by a browser** — and #5 is what
  forced the correction, by gating both *modes* out of the e2e tier's reach. `11` §6.1 said the
  assertion had to run in a browser, and the reasoning was right up to its last step: the two forms
  render the same `href`, so it has to **click**. A mounted component can be clicked.

  ```
  external : <a href="/stats">Done</a>   click → event.defaultPrevented === false
  bare     : <a href="/stats">Done</a>   click → event.defaultPrevented === true
  ```

  Identical markup, opposite in one bit. It is `test/nuxt/modes.test.ts`, it covers both modes, and
  it fails by name. ⚠️ **What the gate genuinely took away** is the signed-in half of assertion 1 —
  that Ingest, Sources and Stats ship no JavaScript *to a reader who is in*. That needs a session
  row, which needs a database in the TypeScript suite, which ADR 0038 kept out. **#10 cannot be
  tested at all without an authenticated e2e context**; `11` §6.1 names it as the home for one.
- ⚠️ **The middleware skips the framework's own paths by *shape*, not by a list** — `/_…`, or
  anything with a file extension. A list would quietly grow an entry that answers with reader data.
  Both halves of the skip matter: redirecting `/_nuxt/**` would break the two *modes*, whose
  documents are an app shell that then fetches its own bundle, and resolving a session for each asset
  would put a database read behind every one. It is not a hole in `S1` — what is served there is
  static build output, identical for every reader.
- ⚠️ **Better Auth types `auth.options` as the exact object literal passed in.** That makes the
  configuration a real seam — `test/unit/auth-config.test.ts` reads it and needs no request — and it
  has one trap: an option that is **absent on purpose** (`cookieCache`, `useSecureCookies`,
  `advanced.cookies`) is not a property that reads `undefined`, it is a property the type does not
  have, and `expect(…).toBeUndefined()` on it **does not compile**. Those four assertions read
  through a `BetterAuthOptions`-widened view. Do not "fix" them by deleting them.
- ⚠️ **The door reads the session from the middleware too, not from `authClient`.** `/auth` is the
  one route with a client, so `useSession()` is exactly what a future session will reach for — and
  `08` §6.1 is why it must not: client actions other than `useSession` do not forward cookies during
  SSR, and the documented repairs are void on a `noScripts` route. `app/pages/auth/index.vue` reads
  `useRequestEvent()?.context.session` on the server pass and carries **only the email** into the
  payload. `app/utils/auth-client.ts` constructs the client **lazily**, so an SSR call gets nothing
  rather than a subtly signed-out render.
- ~~⚠️ **`10` §9's visual specification for the door and the refusal page is not built, and #5 did not
  own it.**~~ ⚠️ **Half-closed 2026-09-11 by #6**, which landed `05`'s tokens as the first screen
  ticket to need them. **The door and the refusal page were not restyled** — #6 did not touch
  `app/pages/auth/`, so those two still carry the content and structure without the treatment. What
  changed is that the tokens are now there for whoever does. The original bullet follows.

- ⚠️ **`10` §9's visual specification for the door and the refusal page is not built, and #5 did not
  own it.** Both pages carry the content and the structure `10` §9 names — the mark, the name, the
  body line, the rule, the control; the statement, the body, and no rule — with no treatment, because
  `05-design-system.md`'s tokens do not exist in the repo yet and **no ticket owns them.** The first
  screen ticket to need them lands them. This is a gap in the tracker, not a decision.
- **Sign-in itself is not tested, and `11` §8 already said it would not be.** The flow through
  Google's redirect is in the end-to-end-only column and `11` §9 declines to test Better Auth's own
  behaviour. What #5 tests is everything around it. ⚠️ The e2e app boots with a `DATABASE_URL` that
  points at nothing, and that is load-bearing rather than lazy: an **unauthenticated** request
  resolves to no session without touching Postgres, so the suite needs no database. The day a test
  signs in, the failure will be a connection error rather than a silent pass.
- **The schema tier's guards were checked by sabotage, and that is the standard now.** Eight
  deliberate breakages, eight distinct failures — the same method #2 used on the rendering split.
  ⚠️ **A green schema test proves nothing until you have seen it go red for the right reason**, which
  matters more here than anywhere else in the suite: every one of these tests passes trivially
  against a database that enforces nothing.
- ⚠️ **Branches: `develop` is where work happens, from 2026-09-07.** Yuta's decision, and it
  replaces the arrangement that stood until then, where `main` was both the default and the working
  branch. `main` is the integration branch. Neon still gets a branch per environment to match.

## Skipped

Nothing.
