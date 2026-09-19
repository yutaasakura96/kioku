# Anki `.apkg` import: research findings

**Date checked:** 2026-09-19. **Status:** facts only. Nothing here is a decision.
**For:** [#24](https://github.com/yutaasakura96/kioku/issues/24), the research half, before any code.
**Scope:** the four questions the issue asks: format, what a note contains, licensing, libraries. Plus
two things that bear on the ADR the issue asks for: `generate` or not, and media.

Sources are primary only: Anki's source at tag **`26.09.2`** (commit `bb0dd6d`, released
2026-09-15, the latest tag on the day; `main` at `754ce3a` had no diff from it in
`rslib/src/import_export`, `rslib/src/storage` or `proto/`), the Anki manual, AnkiWeb's own pages,
package registries and library repos. Where a claim rests on a measurement, the measurement is
described. **Re-verify if more than ~3 months old.** Anki ships monthly.

`A@` below means `https://github.com/ankitects/anki/blob/26.09.2/`.

---

## Summary for triage

1. **Format.** A `.apkg` is a zip. Since Anki 23.10 the default export has a protobuf `meta` entry
   (version 3), a zstd-compressed SQLite at `collection.anki21b` in **schema 18**, a zstd'd protobuf
   media index, and a **dummy `collection.anki2`** whose only note says "please update Anki". The
   legacy layouts are still around: `collection.anki2` or `collection.anki21`, schema 11, no zstd,
   JSON media map. Anki still offers a legacy export behind an unchecked "Support older Anki
   versions" box. At least one popular JLPT source, `genanki`, only writes legacy. **A reader has
   to handle all three layouts.** `.colpkg` uses the same container for a whole collection.
2. **Notes.** Every layout has the same `notes` row. Fields are one `\x1f`-joined string of HTML,
   and tags are one space-separated string with a space at each end. Field *names* are whatever the
   deck author chose. The three JLPT decks sampled share **no** field name, so no fixed mapping onto
   Kioku's six fields exists. Readings often come in furigana form (`内陸[ないりく]`), not plain kana.
   Level information lives in author conventions, in subdeck names or in tags like
   `JLPT_N5`, and it comes from the same unofficial lists ADR 0005 already describes. No sampled deck
   carried anything like a *domain*.
3. **Licensing.** AnkiWeb's Shared Deck License is **personal studies only**. There is no
   redistribution, re-upload or publication "without explicit permission from the copyright
   holder", and authors may grant more rights but may not add restrictions. A private import for
   Yuta's own study reads as inside that text. Anything published, **including a real deck
   committed to this public repo as a test fixture**, is outside it. JMdict is CC BY-SA 4.0 with
   EDRDG's own attribution rules. Tatoeba text is CC BY 2.0 FR by default. Whether sending deck text
   to a model provider or holding it in a hosted database changes anything is **not answered by
   any of these documents**.
4. **Libraries.** For Python, the official `anki` wheel (26.9.2, AGPL-3.0-or-later, 9–11 MB native
   wheel, 24 MB installed, a monthly release train, and it only reads by importing into a
   collection) is too heavy for the job. `genanki` only writes. `ankipandas` reads a live
   collection, not a package. On the Node side, `ankipack` 0.3.1 (MIT) is the only reader that is
   both current and clean. **Recommendation: read it in the worker with stdlib `zipfile` +
   `sqlite3` plus `zstandard` as a floor, not a pin.** That covers every layout, measured at about 40
   lines. `zstandard` goes away when the worker reaches Python 3.14 (`compression.zstd`).

**Bearing on the later decisions.** Imported notes should **feed `generate`**. Only the term, and the
reading when one exists, can be pulled out without the model, and the example fields Kioku requires
are often empty (sample below). **Keep media out of scope.** Kioku has no audio or image surface,
media carries separate licences, and a deck with audio is exactly the one that goes past Vercel's
4.5 MB request body limit.

---

## 1. What a `.apkg` is in 2026

### 1.1 The container and the three layouts

The layout is an enum in the protobuf definitions
([A@`proto/anki/import_export.proto`](https://github.com/ankitects/anki/blob/26.09.2/proto/anki/import_export.proto),
`message PackageMetadata`):

| `meta.version` | How it is detected | Collection file | Schema | Collection compression | Media index |
| --- | --- | --- | --- | --- | --- |
| `LEGACY_1` (1) | no `meta`, `collection.anki2` present | `collection.anki2` | 11 | zip deflate | JSON `{"0": "name"}` |
| `LEGACY_2` (2) | no `meta`, `collection.anki21` present, **or** `meta` = `08 02` | `collection.anki21` | 11 | zip deflate | JSON |
| `LATEST` (3) | `meta` = `08 03` | `collection.anki21b` | 18 | **zstd**, zip entry stored | protobuf `MediaEntries`, zstd |

- The mapping from version to filename and schema, and "zstd iff not legacy", is
  `VersionExt`/`MetaExt` in
  [A@`rslib/src/import_export/package/meta.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/import_export/package/meta.rs).
  When `meta` is absent, Anki infers `LEGACY_2` if `collection.anki21` exists and `LEGACY_1`
  otherwise. When `meta` decodes to an unknown version, Anki refuses with `ImportError::TooNew`. A
  Kioku reader should do the same.
- `SchemaVersion` has exactly two members, `V11` and `V18`
  ([A@`rslib/src/storage/mod.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/storage/mod.rs)).
  The upgrade path runs 11 → 18 (`SCHEMA_MIN_VERSION = 11`, `SCHEMA_MAX_VERSION = 18`,
  [A@`rslib/src/storage/upgrades/mod.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/storage/upgrades/mod.rs)).
- **Every export writes a `meta` entry and a dummy `collection.anki2`, legacy exports included.**
  The dummy is a schema-11 collection holding one note whose text says to update Anki (`export_collection`,
  `write_dummy_collection`,
  [A@`rslib/src/import_export/package/colpkg/export.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/import_export/package/colpkg/export.rs)).
  ⚠️ **A reader that looks for `collection.anki2` first reads the dummy and reports one note.** The
  right order is: `meta` first, then `collection.anki21`, then `collection.anki2`.
- Media files are zip entries named `0`, `1`, `2`… and the index maps each number to the real
  filename. Under `LATEST` each media file is zstd-compressed individually (`write_media_files`,
  same file; the manual's export options say "media files will be compressed").
- `.apkg` and `.colpkg` go through the same `export_collection` function
  ([A@`…/apkg/export.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/import_export/package/apkg/export.rs)).
  The difference is the contents. A `.colpkg` is a whole collection, and importing it **replaces**
  the user's collection. An `.apkg` is a deck, a note selection or a whole collection that gets
  merged in ([manual: Exporting](https://docs.ankiweb.net/exporting.html)). Kioku only needs `.apkg`.

**Measured 2026-09-19.** The `anki` 26.9.2 wheel (PyPI) was installed into a scratch venv on Python
3.11. One Basic note went into deck `JLPT::N5`, and the note was exported twice with
`export_anki_package(legacy=False/True)`:

```
modern: meta(stored,2B = 08 03)  collection.anki21b(stored, starts 28 b5 2f fd = zstd magic)
        collection.anki2(stored, 51200B dummy)  media(stored, zstd'd empty protobuf)
legacy: meta(stored,2B = 08 02)  collection.anki21(deflate, 143360B)
        collection.anki2(stored, 51200B dummy)  media(stored, b'{}')
```

Anki's own test fixtures show the **oldest** layout: no `meta`, `collection.anki2` only, deflate,
media map `{"0": "foo.wav"}`
([A@`pylib/tests/support/media.apkg`](https://github.com/ankitects/anki/blob/26.09.2/pylib/tests/support/media.apkg),
listed with `zipfile`).

### 1.2 Which layouts are in circulation

- **2.1.50** (2022-04-09) added the new format as an opt-in for `.colpkg`
  ([release notes](https://github.com/ankitects/anki/releases/tag/2.1.50)).
- **2.1.55** (2022-12-16) made the new import/export code the default
  ([release notes](https://github.com/ankitects/anki/releases/tag/2.1.55)).
- **23.10** (2023-10-31): ".apkg exports now default to the new format"
  ([release notes](https://github.com/ankitects/anki/releases/tag/23.10)).
- **Legacy export is still offered in 26.09.2.** Both the `.apkg` and `.colpkg` export options carry
  "Support older Anki versions (slower/larger files)"
  ([manual](https://docs.ankiweb.net/exporting.html)). The checkbox is `checked=false` in
  [A@`qt/aqt/forms/exporting.ui`](https://github.com/ankitects/anki/blob/26.09.2/qt/aqt/forms/exporting.ui).
  Nothing in
  [A@`qt/aqt/import_export/exporting.py`](https://github.com/ankitects/anki/blob/26.09.2/qt/aqt/import_export/exporting.py)
  persists it, so every desktop export starts out modern.
- **Third-party generators write legacy.** `genanki`'s `Package.write_to_file` writes
  `collection.anki2` and no `meta`, and its collection is schema 11
  ([genanki `package.py`](https://github.com/kerrickstaley/genanki/blob/main/genanki/package.py),
  checked at `main` and at `v0.10.1`). The MIT-licensed
  [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) builds with
  `genanki==0.8.0` (its `requirements.txt`). Its v0.3.0 release assets are `.apkg` files of 245–787 KB.
- **So:** anything exported by desktop Anki since 23.10 is `LATEST` unless the author ticked the box.
  Anything from a script, or from an Anki older than 23.10, is legacy. Decks on AnkiWeb go back to
  2012 (the listing shows "Modified" dates from 2012-08-25 on). All three layouts are in use.

---

## 2. What a note looks like inside

### 2.1 Tables

- **Schema 11** has five tables: `col`, `notes`, `cards`, `revlog`, `graves`
  ([A@`rslib/src/storage/schema11.sql`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/storage/schema11.sql)).
  Notetypes, decks and deck config are **JSON inside `col`** (`col.models`, `col.decks`,
  `col.dconf`). Each model carries `flds: [{name, ord, …}]` and `sortf`.
- **Schema 18** keeps `notes` and `cards` unchanged and adds relational tables: `notetypes`,
  `fields(ntid, ord, name, config)`, `templates`, `decks(id, name, …, common, kind)`,
  `deck_config`, `config` and `tags`
  ([upgrade 14](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/storage/upgrades/schema14_upgrade.sql),
  [15](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/storage/upgrades/schema15_upgrade.sql),
  [17](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/storage/upgrades/schema17_upgrade.sql),
  [18](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/storage/upgrades/schema18_upgrade.sql)).
  The `config`/`common`/`kind` columns are **protobuf blobs**. Field names and deck names are
  plain text columns, so no protobuf is needed to read them. Measured: `col.models` is an empty
  string in schema 18.
- `notes` columns in both schemas: `id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data`.
  `mid` is the notetype id and `guid` is what Anki uses to match a note on re-import.

**Measured pitfalls for a stdlib reader (2026-09-19, Python 3.11, SQLite 3.51.0):**

- Schema 18 declares `COLLATE unicase` on `notetypes.name`, `fields.name`, `templates.name`,
  `decks.name` and `tags.tag`. Stock `sqlite3` fails with `no such collation sequence: unicase` on
  `tags`, and the connection can then return `no query solution` for later queries on that table.
  **Register a `unicase` collation right after `connect()`, before the first query.** With that in
  place, every query worked.
- The exported `fields` table held **18 rows for 1 notetype**. Anki's exporter deletes the stock
  notetypes (`new_minimal` runs `DELETE FROM notetypes`) but not their `fields` rows. **Join
  `fields` to `notetypes`.** Selecting `fields` alone gives phantom names.
- The exported `tags` table was **empty**. Tags live on `notes.tags`.

### 2.2 Fields, HTML, furigana, sort field, tags, decks

- **Fields**: `notes.flds` is every field value joined with `\x1f`, in `ord` order
  (`split_fields`/`join_fields`,
  [A@`rslib/src/storage/note/mod.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/storage/note/mod.rs)).
  Values are **HTML**: the editor exposes the field HTML directly
  ([manual: Editing](https://docs.ankiweb.net/editing.html)). Measured: `<b>漢字[かんじ]</b>` came
  back verbatim.
- **Sort field**: `sfld` is the field at the notetype's `sort_field_idx` **with HTML stripped**
  (media filenames kept). `csum` is a checksum of field 0 with HTML stripped
  ([A@`rslib/src/notes/mod.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/notes/mod.rs)).
  Measured: `sfld` = `漢字[かんじ]`. It does not strip furigana. `sfld` is declared `integer` so that
  numeric values sort numerically (comment in `schema11.sql`).
- **Furigana**: `Text[ruby]`, where a space marks the start of the text the ruby covers
  (`世[よ]の 中[なか]`) ([manual: Field Replacements § Ruby
  Characters](https://docs.ankiweb.net/templates/fields.html)). Anki's regex is
  `" ?([^ >]+?)\[(.+?)\]"`, and its `kana` filter keeps group 2, `kanji` keeps group 1, and
  `[sound:…]` is exempt
  ([A@`rslib/src/template_filters.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/template_filters.rs)).
  To get Kioku's kana `reading` out of a furigana field, apply the same `kana` transform. To get the
  `term`, apply the `kanji` transform. Both run after stripping HTML and `&nbsp;`.
- **Tags**: space-separated, with a leading and trailing space when non-empty (`join_tags`,
  [A@`rslib/src/tags/mod.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/tags/mod.rs)).
  Measured: `' JLPT_N5 vocab::noun '`. `::` is the hierarchy convention inside a tag.
- **Deck names**: schema 18 stores the hierarchy with `\x1f` and shows it with `::` (`NativeDeckName`,
  [A@`rslib/src/decks/name.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/decks/name.rs)).
  Measured: `decks.name` = `'JLPT\x1fN5'` in schema 18 and `'JLPT::N5'` in schema 11's JSON. A
  note's deck comes from its **cards** (`cards.did`), not from the note, so one note's cards can sit
  in different decks.

### 2.3 Which fields are reliable across decks

**Field names belong to the deck author.** The manual has the user add, remove and rename fields
freely ([manual: Editing](https://docs.ankiweb.net/editing.html)), and the schema has no fixed
vocabulary: `fields.name` is free text, unique only within one notetype. Three popular JLPT
vocabulary decks, read from their AnkiWeb sample panes on 2026-09-19:

| Deck | Notes | Fields |
| --- | --- | --- |
| [JLPT N5 to N1 Japanese Vocabulary](https://ankiweb.net/shared/info/1550984460) (updated 2026-08-03) | 7734 | Expression, English definition, Reading (furigana form), Grammar, Additional definitions, Example JP, Example EN |
| [Open Anki JLPT N5 Vocab](https://ankiweb.net/shared/info/135014526) (2023-07-16) | 718 | expression, reading (kana, `なん; なに` for multiple), meaning |
| [JLPT-N5 words in jisho.org (2022)](https://ankiweb.net/shared/info/254713578) | 654 | word, kana with precedence over kanjis, top 3 meanings…, top 5 meanings…, word with furigana, other forms, kanjis, source |

What this means for mapping onto Kioku's six fields (`subjects/jlpt-vocab.json`):

- **No fixed mapping exists.** Case differs (`Expression` / `expression`), the names differ
  (`word`), and the reading shows up as plain kana, furigana form or not at all.
- The only thing reliably present is **a term**, usually field 0 and also `sfld`. A reading can be
  derived when the deck has one. `meaning` exists in some form in all three but in three shapes.
  `part_of_speech`, `example_sentence` and `example_gloss` are missing or empty in most rows: two of
  the first deck's three sample notes have both example fields populated and one has both empty.
- Mapping by field name means a heuristic, a per-deck choice by the reader (manual work the pivot
  removed), or a model call.

### 2.4 Tags as an *authority* for a *level* or a *domain*

- **Levels come from author conventions, and they disagree.** The first deck encodes level as
  **subdecks** (`JLPT-N1` … `JLPT-N5`) and, per its changelog, "Moved formality to tags". Its
  source is "a curated de-facto list of JLPT vocabulary … The same used by resources like
  Jisho.org". The open-anki CSV carries tags like `JLPT JLPT_3 JLPT_5 JLPT_N5` on a single word
  ([`src/n5.csv`](https://github.com/jamsinclair/open-anki-jlpt-decks/blob/main/src/n5.csv)), so one
  note can carry several level-like tags, and the scheme behind them is not documented in the repo's
  README. Its data came from `chyyran/jlpt-anki-decks`, which was "based on decks from tanos.co.uk"
  (README § Acknowledgements).
- These are the unofficial lists that ADR 0005 is built around. The JLPT has published no
  vocabulary list since 2010. **A deck tag is at best a named third-party claim**, which is what
  `level_claim` with `authority_key` already models: `authority_key` could name the deck (its
  AnkiWeb id or its guid set) and the claim would be attributed to it. It is not an authority any
  stronger than the model.
- **Domain: no evidence.** None of the three sampled decks has tags or subdecks resembling a
  `tech`/`business`/`daily`/`academic` split. Nothing found supports using deck tags as a domain
  authority.
- **How much could be established:** three decks, from their public sample panes and one repo.
  AnkiWeb shows no tags in the sample pane for two of them, so their tag conventions could not be
  read without downloading the deck (see Unverified).

---

## 3. Licensing

Reported as the documents state it. **This is not legal advice**, and where a document does not
answer a question, this says so.

### 3.1 AnkiWeb Terms and Conditions (last updated 2018-10-17)

From [ankiweb.net/account/terms](https://ankiweb.net/account/terms), read 2026-09-19:

- **Uploader's grant**: sharing gives AnkiWeb "a worldwide, royalty-free, non-exclusive license to
  make the deck available to users under the Shared Deck License", plus the right to modify and
  convert it. The uploader must assert the deck "is entirely your own work" or that they hold a
  licence to share it. AnkiWeb states it does not review decks.
- **Shared Deck License (what a downloader gets)**: the author grants "a permanent, non-revocable,
  worldwide, royalty free, non-exclusive license to use the material in your personal studies",
  and the licence is "for personal use only". The deck "may not be redistributed, re-uploaded,
  published, or used for any other purposes without explicit permission from the copyright
  holder".
- Authors **may grant extra rights** in the description, for example to redistribute modified
  versions, but "may not impose any extra restrictions".
- **Access**: "AnkiWeb does not currently allow access from browser extensions or other third-party
  clients." Kioku should take a file the reader uploads and never fetch from AnkiWeb itself.

### 3.2 What shared decks carry

- Most descriptions state **no licence**, so only the Shared Deck License applies. Of the three
  sampled decks, one names its sources ("Vocabulary is collected from the JMdict dictionary file …
  used in conformance with the Group's licence. All sentences and translations are from Tatoeba's
  … dataset, released under a CC-BY License"). One points to an MIT repo, and one states nothing.
- **Upstream data licences:**
  - **JMdict/EDICT**: "made available under a Creative Commons Attribution-ShareAlike Licence
    (V4.0)" ([EDRDG licence statement](https://www.edrdg.org/edrdg/licence.html)). EDRDG adds
    attribution requirements for "a software package, WWW server, smartphone app, etc." that uses
    the data. The acknowledgement goes in documentation or the site, with links to the licence, and
    on every screen if the server "is providing a dictionary function". A general acknowledgement
    is enough when the data is mixed with other sources.
  - **Tatoeba sentences**: default **CC BY 2.0 FR** for text. Audio can carry other licences,
    including non-commercial or no-derivatives terms
    ([Tatoeba Terms of Use §6.2, §6.5](https://tatoeba.org/en/terms_of_use)).
  - **open-anki-jlpt-decks** (the repo): MIT (GitHub licence metadata). The licence of the tanos.co.uk
    data it derives from was **not checked**.

### 3.3 What this implies for Kioku

- **Private, single-reader import for Yuta's own study.** The Shared Deck License's words, "use the
  material in your personal studies", read as covering it. Two things the text **does not
  address**: (a) sending deck text to a model provider for `generate`, and (b) storing it in a
  hosted database (Neon). Whether either counts as "any other purpose" **is unclear from the
  documents**.
- **Publishing anything** (a public deck, a shared Kioku export, `S12`'s export if it ever became
  public) needs explicit permission from the deck's copyright holder, unless the deck states a more
  permissive licence. CC BY-SA/CC BY sources then add their own attribution and share-alike terms.
- ⚠️ **This repository is public.** A real downloaded deck, or rows copied from one, committed as a
  test fixture would be redistribution. **Fixtures should be generated**, for example the way §1
  measured, with a one-off script using the `anki` wheel and made-up notes, or written by hand.
- ⚠️ `anki`, the library, is AGPL-3.0-or-later ([A@`LICENSE`](https://github.com/ankitects/anki/blob/26.09.2/LICENSE)),
  and **this repository carries no licence file**. Importing it in the worker would raise a
  licence-compatibility question the project has not had to answer yet. The recommendation below
  avoids the question.

---

## 4. Libraries

### 4.1 Python (the worker)

| Package | Latest (date) | Reads | Licence | Weight | Notes |
| --- | --- | --- | --- | --- | --- |
| [`anki`](https://pypi.org/project/anki/) | 26.9.2 (2026-09-15) | All layouts | AGPL-3.0-or-later | abi3 native wheels 9.0–10.8 MB. **Measured 24 MB installed**, 31 MB with deps (`protobuf>=6,<8`, `orjson`, `requests[socks]`, `markdown`, `decorator`, `typing-extensions`) | Reading means creating a scratch collection and running its importer. Monthly releases. |
| [`genanki`](https://pypi.org/project/genanki/) | 0.13.1 (2023-11-12). Last commit 2024-12-30 | **Nothing. Writer only** | MIT | small | Writes legacy `collection.anki2` (§1.2) |
| [`ankipandas`](https://pypi.org/project/ankipandas/) | 0.3.15 (2023-10-11). Repo pushed 2026-09-07 | A **live collection** file (detects both schemas, `get_db_version` in `ankipandas/raw.py`), not an `.apkg` | MIT | pandas + numpy | Wrong input shape |
| `ankisync2`, `anki-sqlalchemy`, `AnkiTools`, `anki-export` | last releases 2018–2022 | schema 11 era | MIT | — | Stale |
| [`zstandard`](https://pypi.org/project/zstandard/) | 0.25.0 (2025-09-14) | zstd | BSD-3-Clause | wheels, no runtime deps | The one piece the stdlib lacks before 3.14 |

Python 3.14 has `compression.zstd` in the standard library ("Added in version 3.14",
[docs](https://docs.python.org/3/library/compression.zstd.html)). The worker is on 3.11
(`worker/.python-version`).

### 4.2 TypeScript / Node

npm registry, 2026-09-19 (weekly downloads 2026-09-10 → 16):

| Package | Latest (date) | Reads `anki21b`/zstd | Licence | Dependencies | Weekly |
| --- | --- | --- | --- | --- | --- |
| [`ankipack`](https://www.npmjs.com/package/ankipack) | 0.3.1 (2026-09-08) | **Yes, and legacy**. `dist/collection/read.js` mirrors Anki's detection, including refusing unknown `meta` rather than falling back to the dummy | MIT | `fflate`, `fzstd`, `@bufbuild/protobuf`, peer `sql.js` (WASM). ESM only, Node ≥ 20.19 | 334 |
| [`anki-apkg-parser`](https://www.npmjs.com/package/anki-apkg-parser) | 1.0.1 (2026-02-09) | Yes | ISC | 15 deps incl. native `sqlite3`, `zstd-napi`, `@mongodb-js/zstd`, **and the `fs` placeholder package** | 129 |
| [`anki-reader`](https://www.npmjs.com/package/anki-reader) | 0.3.0 (2023-11-05) | **No** (no zstd in the tarball) | **none declared** | `sql.js`, `@zip.js/zip.js`, `node-fetch@2.6.1` | 219 |
| [`apkg-reader`](https://www.npmjs.com/package/apkg-reader) | 1.1.0 (2024-12-15) | Mentions `anki21b`/`fzstd` | MIT | `jszip`, `sql.js`, `fzstd`, **`typescript` as a runtime dependency** | 23 |

"Reads zstd" was checked by grepping each published tarball (`npm pack`) for `anki21b` and zstd
imports, and for `ankipack` by reading `read.js`. None was run against a real deck.

### 4.3 Recommendation: stdlib in the worker, `zstandard` as a floor

**Read `.apkg` in the worker with `zipfile` + `sqlite3` + `zstandard`, with no Anki library.**

- **It covers every layout, measured.** The reader used for §1–§2 is about 40 lines and read both
  exports correctly. The core:

  ```python
  names = z.namelist()
  ver = z.read("meta")[1] if "meta" in names else (2 if "collection.anki21" in names else 1)
  if ver not in (1, 2, 3): raise TooNew            # Anki's own behaviour
  fn = {1: "collection.anki2", 2: "collection.anki21", 3: "collection.anki21b"}[ver]
  raw = z.read(fn)
  if ver == 3: raw = zstandard.ZstdDecompressor().stream_reader(raw).read()
  db = sqlite3.connect(tmp_path_of(raw))
  db.create_collation("unicase", lambda a, b: (a.casefold() > b.casefold()) - (a.casefold() < b.casefold()))
  # schema 18: fields JOIN notetypes; schema 11: json.loads(col.models)[mid]["flds"]
  # notes.flds.split("\x1f"); notes.tags.split(); decks via cards.did
  ```

  ⚠️ `meta[1]` assumes the two-byte encoding every exporter measured here writes (`08 0N`). A real
  implementation should decode the varint or use a two-line protobuf read. Either is small.
  ⚠️ The `unicase` stand-in above is `casefold`. Anki's real collation (Rust `unicase`) was not
  compared against it. That matters only if the reader relies on ordering or uniqueness by name,
  and it does not need to.
- **Against `03` §13.5.** The contract Kioku depends on is **Anki's file format**, not a library's
  API. The format is versioned by one enum in `meta`, and a reader that refuses unknown versions
  fails loudly, the same way Anki does. `zstandard` decompresses a standard format and cannot change
  a *note*'s identity, so it is **a floor like `anthropic`, not a pin**. It leaves when the worker
  moves to 3.14. The `anki` wheel would be the reverse: a monthly native release train pulling a
  `protobuf` major range into the worker, plus an AGPL question.
- **Why not in the app (TypeScript).** The worker already does the pipeline work, and ADR 0063's
  `anki` kind names a pipeline. Parsing in the app would put a WASM SQLite or native module into the
  Vercel tier to do what three worker imports do. If the app ever needs to peek at a deck (for
  example to show a note count before upload), `ankipack` is the only candidate worth a look.
- **Fixtures.** Generate small `.apkg` files in all three layouts with a one-off script (the `anki`
  wheel for `LATEST`/`LEGACY_2`, `genanki` or hand-built for `LEGACY_1`), with invented notes,
  and commit the files, not the script's dependencies. §3.3 explains why no real deck belongs in the
  repo.

### 4.4 Two facts for the build ticket

- **Upload size.** A Vercel Function's request body is capped at **4.5 MB**
  ([Vercel: Functions Limits § Request body size](https://vercel.com/docs/functions/limitations)).
  CLAUDE.md rules out Vercel Blob, so the upload path cannot lean on it. Text-only decks fit: the
  7,734-note deck above is 1.57 MB. Decks with audio often will not. That is one more reason to
  leave media out (§5).
- **Deduplication.** `notes.guid` is stable across re-exports of the same deck. That is how Anki
  merges updates ([manual: Packaged Decks § Updating](https://docs.ankiweb.net/importing/packaged-decks.html)).
  Kioku's identity is `(term, reading)`, not guid, so the existing `deduplicate` stage applies
  unchanged.

---

## 5. Bearing on the ADR the issue asks for

**Skip `generate`, or feed it?** The evidence points to **feed**:

- No field mapping holds across decks (§2.3), so "trust the fields" needs a mapping that has to be
  guessed, chosen by hand or produced by a model.
- Even the best-structured sample leaves required Kioku fields empty (`example_sentence`,
  `example_gloss`), and `part_of_speech` comes in deck-specific phrasing ("noun, no adjective").
- **What can be taken mechanically is enough for a word list**: the term (field 0 / `sfld`,
  HTML-stripped, `kanji`-filtered) and a reading when a field holds kana or furigana. That is
  exactly the `word_list` pipeline's input. An `anki` pipeline could be `unpack → normalise →
  deduplicate → filter_known → generate → write_notes`. It is `word_list` with a different first
  stage.
- A deck-supplied meaning could go to the model as a hint, but that is a design choice, not a
  finding.

**Levels.** A deck's level tags or subdeck names could become a `level_claim` with an
`authority_key` naming the deck. They are third-party claims from unofficial lists (§2.4), and one
deck puts several level tags on one word. No domain source was found.

**Media: out of scope.** Kioku has no audio or image surface. Media files carry licences of their own
(Tatoeba audio can be NC/ND, §3.2). Media is the part most likely to go past the 4.5 MB upload limit
(§4.4). And the reader skips it at no cost: ignore the `media` index and the numbered entries, and
strip `[sound:…]` and `<img …>` from field text.

---

## Unverified

- **What AnkiWeb serves when a shared deck is downloaded** (layout 1, 2 or 3), and whether
  re-shared decks are converted. The terms reserve the right to "convert to new file formats". No
  deck was downloaded, because downloading needed the reader's go-ahead and this session had none.
  To measure: download one deck and run the §4.3 reader over it.
- **What AnkiDroid and AnkiMobile export by default.** Not checked. Their decks reach AnkiWeb too.
- **The tag conventions inside the two AnkiWeb decks whose sample panes show no tags**, and what
  `JLPT_3`/`JLPT_4`/`JLPT_5` next to `JLPT_N5` mean in open-anki's CSV. The README does not say.
- **The licence of the tanos.co.uk data** behind open-anki-jlpt-decks and its upstream.
- **Whether sending deck text to a model provider, or storing it in a hosted database, is inside
  "your personal studies".** The documents do not say. It is a legal question, not a research one.
- **Anki's `unicase` collation semantics** against the `casefold` stand-in (§4.3).
- **The TypeScript readers against a real deck.** Checked by reading their published source, not by
  running them.
