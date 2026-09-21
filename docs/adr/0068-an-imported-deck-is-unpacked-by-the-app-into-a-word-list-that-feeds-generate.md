# An imported deck is unpacked by the app into a word list, and it feeds `generate`

**Decided 2026-09-19, for [#24](https://github.com/yutaasakura96/kioku/issues/24).** It closes the
question [ADR 0063](0063-the-input-is-a-chosen-word-list.md)'s revisit condition names: whether an
imported *note* skips `generate` or feeds it. **It feeds it.** It also moves the `.apkg` reader out
of the worker, where [`anki-apkg-research.md`](../anki-apkg-research.md) §4.3 put it, and into the
app. The research did not account for who owns `chunk`, and that is the reason for the move.

## Why this needed deciding

ADR 0063 gave `source.kind` an `anki` value and left its pipeline open. The research (§2.3, §5)
answered the part about fields. The two findings that decide it:

- **No field mapping holds across decks.** Three popular JLPT decks share no field name. The
  reading turns up as plain kana, as furigana (`内陸[ないりく]`), or not at all.
- **Even a well-built deck leaves Kioku's required fields empty.** `example_sentence` and
  `example_gloss` are blank in most sampled rows, and `part_of_speech` uses each author's own
  wording.

Skipping `generate` would therefore need a per-deck field mapping, chosen by the reader or guessed.
ADR 0064 took manual work of exactly that kind out of the loop.

The second question came up while this ADR was being written. The research proposed an `unpack`
stage **in the worker**, in front of `normalise`. That cannot be built as it stands:

- `chunk` belongs to the app. `shared/ingest/chunk.ts` writes the `source_chunk` rows inside the
  submit transaction, before any worker claims the job, and `worker/pipeline/chunk.py` says the
  worker must not grow a second copy. `source_chunk.content_hash` is the first element of the
  generation cache key (`04` §6.3), so two chunkers would mean a cache that misses without saying so.
- `source.content` is `text NOT NULL`, capped at 100,000 code points by a `CHECK`, and written in
  that same transaction. A worker-side unpack leaves nothing for the app to put there.

## What is decided

**1. The app unpacks the `.apkg` at submit and stores the result as a word list.** The `POST /`
handler reads the uploaded file and turns it into text with one line per *note*. It then calls
`recordSource` with `kind = 'anki'`, and the existing four-row transaction runs unchanged. From then
on an `anki` *source* is a word list with extra columns. The word-list chunk rule applies, 25 lines
per *chunk*, and ADR 0041's single chunker stays single.

**2. The reader uses Node built-ins and adds no dependency.**

- Zip: a central-directory reader over `node:zlib`'s `inflateRawSync` (stable).
- zstd, for `LATEST` only: `zlib.zstdDecompressSync`, **Stability 1, Experimental**, added in
  v23.8.0 and v22.15.0.
- SQLite: `node:sqlite`'s `DatabaseSync`, **Stability 1.2, Release candidate**, unflagged since
  v22.13.0 and v23.4.0.

Both are inside `package.json`'s `engines` range (`^22.19.0 || ^24.11.0 || >=26.0.0`), and Vercel
runs 24.x by default. Measured 2026-09-19 on Node 24.11.0: `node:sqlite` read all four real decks in
`~/Documents/kioku-decks/`. With no `unicase` collation registered, it also ran the schema-18 queries
the reader needs (`fields` joined to `notetypes`, and `notes` joined through `cards` to `decks`) on a
table built with that collation. Only a query on `tags` failed (`no query solution`), and the reader
does not need that table because tags live on `notes.tags` (research §2.1). `node:sqlite` has no
`create_collation`, so this matters.

⚠️ **Two non-stable built-ins are a cost, and it is named here, not hidden.** An experimental API
can change in a minor release. The contract is small: one decompress call and three `SELECT`s. The
tests run against generated fixtures in all three layouts, so a breaking change fails
`npm run test` rather than an import. `database.deserialize()` would avoid a temp file, but it only
arrived in v24.16.0 and 22.x does not have it, so the reader writes the collection to
`os.tmpdir()` and deletes it in a `finally`. ~~⚠️ **That `os.tmpdir()` is writable in a Vercel
Function is not verified here.** The docs pages checked (Functions Limits, Node.js versions) do
not say. The build ticket checks it on a preview deployment before merge.~~ ⚠️ **Answered
2026-09-20 from the docs — the wrong page had been read.** See § Amended 2026-09-20 (the `/tmp`
question) below.

**3. A line is `term⇥reading⇥hint`.** The *term* is field 0, with HTML, `&nbsp;` and `[sound:…]`
stripped and Anki's `kanji` furigana transform applied. The *reading* is the `kana` transform of
field 0 when it carries furigana. Otherwise it is the first field whose name matches
`reading|kana|yomi|読み`, compared without case. Otherwise it is empty. The *hint* is the note's tags
and the name of the deck its first card sits in. Both are filtered to things that look like levels
(`JLPT`, `N1` to `N5`).

⚠️ **The deck's meaning does not travel.** Measured on the four real decks, a line of
term, reading and `JLPT*` tags comes to 38,866 to 56,875 code points per deck. That is inside `S2`'s
cap. Adding the meaning cut to 40 characters pushes N3 and N1 over it (101,581 and 115,815). With
every field, all four are over (136,690 to 195,928). The model writes the meaning either way, and
the meaning is where decks' wording differs most, so it is the column to drop.
The measurement left deck names out of the hint. A deck name that passes the level filter adds its
length to every line, so the build ticket re-measures with it included.

**4. The pipeline is the word-list pipeline with `unpack` in front, and `unpack` is declared.**

```
"anki": ["unpack", "chunk", "normalise", "deduplicate", "filter_known", "generate", "write_notes"]
```

`unpack` joins `chunk` in the set of stages declared but run by the app (`STAGES_RUN_ELSEWHERE` in
`worker/pipeline/__init__.py`), so the declaration still says in order what happens to an `anki`
*source* (ADR 0003).

**5. The *identity key* is Sudachi's, as it is for every other word list.** `normalise` reads
column 1 as the term and gets the dictionary form and the reading exactly as ADR 0063 §3 and
[ADR 0045](0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md) say.
The deck's reading is a hint, not a key. A deck author's reading is not a dictionary's reading, and
ADR 0063 rejected letting anything other than the dictionary decide the key.

**6. `generate` gets the deck's reading and level hint and treats both as hints.** This is Yuta's
second call (research §6): *level tags and subdeck names are a hint to the model only.* The
model's `level_claim` is still the only *level* claim on an imported *note*, and no `authority_key`
names a deck. The deck reading helps with a homograph. When it disagrees with Sudachi's, the model
sees both.

**7. An over-cap deck is refused before any spend, like an over-cap paste.** A 100,000-code-point
list holds roughly 3,700 to 4,900 notes at the measured 20.5 to 26.6 code points a line. The 7,734-note
"JLPT N5 to N1" deck (research §2.3) is over the cap, and the refusal tells the reader to export one
subdeck at a time. `S2`'s cap is a cost ceiling per *source*, and this ADR does not raise it.

**8. Media is out of scope.** The reader ignores the `media` index and the numbered entries, and
strips `[sound:…]` and `<img …>` from field text. Kioku has nowhere to play or show media, media
carries its own licences, and it is what pushes a deck past Vercel's 4.5 MB request body limit
(research §4.4, §5).

## Amended 2026-09-20 — the re-measurement §3 asked for, and what it changed

**#26 is built.** §3's last two sentences asked the build ticket to re-measure with deck names in
the hint, because "a deck name that passes the level filter adds its length to every line". It does,
and the measurement moved a decision.

**Carrying the deck name whole makes it the largest column in the source.** Measured 2026-09-20 with
the built reader against the same four decks in `~/Documents/kioku-decks/`, in code points:

| Deck | Notes | term | reading | tags | **deck name** | Total | Against the cap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| open-anki N3 | 2,140 | 4,684 | 7,192 | 40,697 | **49,220** | 106,117 | ⚠️ **over** |
| open-anki N1 | 2,699 | 6,710 | 10,527 | 32,388 | **62,077** | 117,469 | ⚠️ **over** |
| open-anki N2 | 1,906 | 4,874 | 7,521 | 22,942 | **43,838** | 83,698 | under |
| AnkiWeb N2 | 1,877 | 4,817 | 7,426 | 22,594 | **43,171** | 82,473 | under |

The name is `Open Anki JLPT N2 Deck`. It passes the level filter on the word *JLPT*, and then all
twenty-two of its code points are repeated on every one of the deck's lines — more than the term and
the reading together, and enough to put two of the four decks past `S2`'s cap. **The information it
adds is nil**, because the words it carries are the same words on every line of the deck and
therefore say nothing about any particular word.

**So a deck name contributes only the words in it that name a level**, and not the whole name:
`Open Anki JLPT N2 Deck` gives `JLPT N2`, `JLPT::N5` gives `JLPT N5`, `Japanese::Core 2000` gives
nothing. This is the same finding §3 made about the deck's *meaning*, arriving through the column
§3's own last sentence asked to be re-measured, and it is resolved the same way.

⚠️ **Tags are still carried whole, and the asymmetry is deliberate.** A tag is a token — `JLPT_3`
means what it says — and a deck name is prose with a level somewhere in it. Cutting a tag into words
would destroy it.

⚠️ **The deck name is still read, and it is not redundant with the tags.** Research §2.4 sampled a
deck that encodes its levels as *subdecks* (`JLPT-N1` … `JLPT-N5`) and uses tags for something else
entirely; there the name is the only level signal there is.

**With that change, all four decks fit**, and the figures are close to §3's original measurement
(which left deck names out altogether):

| Deck | Code points | Per line | *Chunks* |
| --- | --- | --- | --- |
| AnkiWeb N2 (`LEGACY_2`) | 54,318 | 28.9 | 76 |
| open-anki N2 (`LEGACY_1`) | 55,108 | 28.9 | 77 |
| open-anki N3 (`LEGACY_1`) | 74,017 | 34.6 | 86 |
| open-anki N1 (`LEGACY_1`) | 76,984 | 28.5 | 108 |

**Also measured, and all of it confirms the research rather than moving anything:** the reader read
all four decks with no dependency; the note counts match research §1.3 exactly (1,877 / 2,140 /
1,906 / 2,699); the layouts match (`LEGACY_2`, then three `LEGACY_1`); and **no note was dropped** in
any of the four.

~~**§2's other open item is not closed.** Whether `os.tmpdir()` is writable in a Vercel Function is
still unverified — it needs a deployment, and #26's close-out criterion for it is outstanding.~~
**Closed the same day, from the docs.** See the section below.

## Amended 2026-09-20 — the `/tmp` question, answered from the docs rather than a deployment

⚠️ **§2 said the docs do not say, and the docs do say — on a page §2 did not check.** Vercel's
**Functions → Runtimes** page, under *File system support*: *"Vercel functions have a read-only
filesystem with writable /tmp scratch space up to 500 MB."* §2 checked Functions Limits and
Node.js versions, and both are still silent; re-read 2026-09-20 and neither mentions `/tmp`,
`read-only` or `ephemeral` once. **The lesson is the cheap one: a fact absent from two pages is not
a fact the docs withhold.**

**The second half is Node's, and it is documented too.** `os.tmpdir()` is only `/tmp` when nothing
overrides it: Node checks `TMPDIR`, then `TMP`, then `TEMP`, and falls back to `/tmp` on POSIX.
Vercel sets none of the three — they appear in neither the **system environment variables** list nor
the **reserved environment variables** list (both re-read 2026-09-20, zero matches for `TMPDIR`,
`TMP` or `TEMP`). So `os.tmpdir()` resolves to the directory the Runtimes page calls writable.

**What that settles, and what it does not.** `engines` keeps `^22.19.0`, `deserialize()` stays out,
and `mkdtempSync(join(tmpdir(), 'kioku-anki-'))` needs no fallback: the criterion's *"if it is not,
amend the ADR"* branch does not fire. ⚠️ **What is not settled is the thing only a deployment can
say** — that this app's functions behave as the page describes. Two documented facts composed is
weaker evidence than one write, and Kioku has **no Vercel project at all** as of 2026-09-20: no
`.vercel/`, no `vercel.json`, no linked deployment. The first deployment carries the observation
rather than blocking on it, and § Revisit below says what would reopen this.

⚠️ **The headroom is not the thing to worry about.** 500 MB against an app that refuses an upload at
4 MB (§2, research §4.4) is three orders of magnitude of room, and `mkdtempSync` gives each
invocation its own directory, so two concurrent imports on one warm instance cannot collide. If this
ever fails it fails as *permission*, not as *space*.

## Alternatives considered

**Skip `generate` and trust the deck's fields.** Rejected for the reasons above. It needs a mapping
nobody can write once, and it leaves required fields empty.

**Unpack in the worker, as the research recommended.** Rejected because of who owns `chunk`. Making
it work needs one of three changes, and each is worse than moving the reader:

- A second chunker in Python.
- A second job kind that writes `source.content` after the fact, which splits `S2`'s one
  transaction in two and leaves a *source* with no chunks between them.
- Storing the raw `.apkg` in `source.content`, where it does not fit, either as text or under the cap.

The research's argument against the app was that it "would put a WASM SQLite or native module into
the Vercel tier". `node:sqlite` answers that: it is neither, and it ships with Node.

**`ankipack` in the app** (research §4.2). It is the only current and clean Node reader, but it
brings four dependencies, including `sql.js`'s WASM, to do what three built-ins do. Keep it as the
fallback if `node:sqlite` or zlib's zstd changes under us.

**Raise `S2`'s cap for `anki` *sources*.** Rejected. The cap limits spend, and a 5,000-note import is
200 model requests before the first review. Subdeck-at-a-time is the price, and it is a small one.

**Send the deck's meaning as a hint too.** Rejected on the measurement in §3. Revisit it below.

## Revisit if

- `node:sqlite` or zlib's zstd changes shape in a Node release. Then the fallback is `ankipack`, and
  §2 gets an amendment.
- The deployment's Node reaches v24.16.0 or later everywhere, including local `.tool-versions`.
  Then `deserialize()` replaces the temp file.
- Imported *notes* get flagged for their meanings noticeably more often than word-list *notes*
  (ADR 0062's flag rate, split by `source.kind`). Then the meaning hint is worth its characters, and
  the fix is a smaller hint, not a bigger cap.
- The reader regularly hits the cap on decks they want whole.
- **The first deployment's first import raises `EACCES`, `EROFS` or `ENOENT` out of
  `mkdtempSync`.** Then the composed reading in § Amended (the `/tmp` question) was wrong for this
  app, and the fix is `deserialize()` with `engines` moved to `>=24.16.0` — not a bigger `/tmp`.
