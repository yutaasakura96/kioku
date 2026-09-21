# KANJIDIC2 for the kanji-reading retry: research findings

**Date checked:** 2026-09-21. **Status:** facts and measurements only. The calls are Yuta's, listed
in §7 with a recommendation each, and nothing here decides them.
**For:** [#29](https://github.com/yutaasakura96/kioku/issues/29), the research half of
[ADR 0069](adr/0069-the-check-is-the-grade.md) §5, before any code.
**Scope:** the issue's five questions (source, licence, format, reach of the rule, where it runs),
plus a recommendation for the build ticket's scope (§6).

Sources are primary only: EDRDG's own pages, the DTD embedded in the downloaded file, the file
itself, the Creative Commons legal code, and the repositories of the two alternatives. Where a claim
rests on a measurement, the command and the number are given. **Re-verify if more than ~3 months
old**, and note that the file itself changes daily (§1.2).

This is not legal advice. Where a document does not answer a question, this says so.

---

## Summary for triage

1. **Source.** KANJIDIC2 is the right dataset, and it is the upstream of every alternative checked.
   One gzipped XML file from EDRDG, 13,108 kanji, **1,488,571 bytes compressed and 15,641,823
   raw**, regenerated daily (the copy downloaded on 2026-09-21 says `database_version 2026-264`,
   created that day). 12,356 of the kanji have at least one Japanese reading. `scriptin/jmdict-simplified`
   repackages it as JSON weekly under the same licence. It is a convenience and brings no new data.
2. **Licence.** **CC BY-SA 4.0**, plus EDRDG's own attribution rules and one clause that matters
   more than the licence: **"there must be a procedure for regular updating of the data"**, and
   stale data "is a violation of the licence". Committing the raw file or a derived table to a
   public repo is allowed. The derived table is Adapted Material and has to carry CC BY-SA 4.0
   itself, but the app's code does not: EDRDG says software using the files "does not have to be
   under any form of open-source licence". The app has to acknowledge EDRDG in its documentation
   and site, with links to the licence. The per-screen footer rule applies only to on-screen
   display of words from the files.
3. **Format.** For this rule a reader only needs `<literal>` and `<reading r_type="ja_on|ja_kun">`.
   On readings are all katakana, and wanakana's `toHiragana` folds them exactly (21,012 of 21,012
   measured). Kun readings use `.` for okurigana (8,349 of 16,036) and `-` for a prefix or suffix
   (392). Both are easy to handle but have to be handled on purpose (§3.3). The smallest useful
   table, kanji to one merged list of hiragana readings, is **542,365 bytes as JSON, 132,552
   gzipped and 104,576 brotli**. Limited to the 2,136 jōyō kanji it is 100,652 / 26,341 / 22,770.
4. **Reach.** In the 475 cached *notes* on Neon (39 minted *cards*): **124 single-kanji terms** (12
   minted), 178 one kanji plus kana (16), and 125 compounds (9). The single-kanji rule is clean:
   KANJIDIC2 lists the word's own reading for 120 of the 124. **A compound rule is not clean.**
   Concatenating per-kanji readings, with rendaku and sokuon variants, produces a median of 27
   candidate readings per all-kanji compound (maximum 576). That covers most plausible wrong
   answers, so most real misses would become free retries. It also sends legitimate alternative
   readings (今日 こんにち, 一日 いちにち, 大人 たいじん) to "the word's reading, not the kanji's",
   which is the wrong message.
5. **Where it runs.** Keep the table on the server and let the server attach, at composition, one
   small array to each position. For the single-kanji rule that averages **9 bytes per *card***
   (about 180 bytes for a 20-*card* *session*). Shipping the whole table to the client costs
   about 105 KB brotli on `/review` for data 99% of which a *session* never touches. The new
   position field is read with `?? []`, like `meanings` and `synonyms`.

**Recommendation for the build (§6):** single-kanji terms only in the first build, candidates
computed on the server at composition, and a derived table (not the raw XML) that lives on the
server, refreshed monthly. Which way the table reaches the server is the licence call (§7.1).

---

## 1. Source

### 1.1 What KANJIDIC2 is and where it lives

- The KANJIDIC project "covers the 13,108 kanji in three main Japanese standards" (JIS X 0208,
  0212 and 0213), and **KANJIDIC2** is the XML, UTF-8 file that "contains information about all
  13,108 kanji"
  ([KANJIDIC Project, EDRDG wiki local copy](https://www.edrdg.org/wiki/KANJIDIC_Project.html),
  § Introduction, last edited 2023-01-22. The live wiki is closed to bots and the page links an
  [archive](https://web.archive.org/web/20250401012724/https://www.edrdg.org/wiki/index.php/Main_Page)).
- The download is `http://www.edrdg.org/kanjidic/kanjidic2.xml.gz`, linked from that page and
  from the [KANJIDIC2 home page](https://www.edrdg.org/kanjidic/kanjd2index_legacy.html). The
  home page says the DTD's comments are "the main documentation", and that the file "is now
  relatively stable, although the data in it is updated from time to time… Don't assume anything
  is set in concrete".
- The [DTD (HTML)](https://www.edrdg.org/kanjidic/kanjidic2_dtdh.html) is also embedded at the
  top of the file. It is "Version 1.6 - April 2008". The header of the 2026-09-21 copy says
  `file_version 4`.

### 1.2 How often, how big (measured 2026-09-21)

```
curl -sIL http://www.edrdg.org/kanjidic/kanjidic2.xml.gz
  → Last-Modified: Mon, 21 Sep 2026 02:35:04 GMT, Content-Length: 1488571
gunzip → 15,641,823 bytes;  grep -c '<character>' → 13108
header → <database_version>2026-264</database_version> <date_of_creation>2026-09-21</date_of_creation>
sha256 of the .gz (prefix) 773ba7e29a88618b
```

- **Cadence.** The DTD defines `database_version` as "YYYY-NN, where NN will be a number starting
  with 01 for the first version released in a calendar year, then increasing for each version in
  that year". 2026-09-21 is day 264 of 2026, the version is `2026-264`, and the file was created
  that morning. **That is consistent with a daily build.** EDRDG does not state the schedule on a
  page I found, so "daily" is an inference from one download. The
  [kanjiapi.dev README](https://github.com/onlyskin/kanjiapi.dev) says "EDRDG rebuilds theirs daily",
  but that is a third party.
- The last entry on EDRDG's [What's New](https://www.edrdg.org/kanjidic/whatsnew.html) page is
  from 2004, so format changes are not announced there. The DTD is the record.

**Counted from the file (Python 3.14 `xml.etree`, 1.0 s wall to parse and derive everything
below):**

| | Count |
| --- | --- |
| `<character>` entries | 13,108 |
| with at least one `ja_on` or `ja_kun` reading | 12,356 |
| with neither | 752 |
| `ja_on` readings | 21,012 |
| `ja_kun` readings | 16,036 |
| `nanori` (name-only readings) | 3,454 |
| jōyō (`grade` 1–8) | 2,136 |
| jōyō + jinmeiyō (`grade` 1–10) | 2,999 |

### 1.3 Alternatives, briefly

| Candidate | What it is | Verdict |
| --- | --- | --- |
| [`scriptin/jmdict-simplified`](https://github.com/scriptin/jmdict-simplified) | KANJIDIC2 converted to JSON. Release `3.6.2+20260914172325` has `kanjidic2-en-….json.tgz` at 1,253,440 bytes. Built by a GitHub Action at `cron: '0 12 ? * MON'`, and the last six releases are weekly. Its README: derived files are "distributed under the same license" (CC BY-SA 4.0). | Same data, a week behind, through an intermediary. It saves writing an XML reader, but the reader for two element types is a handful of lines (§3.1). **Not better for this.** |
| [kanjiapi.dev](https://github.com/onlyskin/kanjiapi.dev) (MIT code) | A hosted API that serves KANJIDIC2 and JMdict. Its README lists `data/kanjidic2.xml` from EDRDG's FTP as the source. | A runtime network dependency per kanji, for data that fits in one file. **No.** |
| KanjiVG | Stroke data, not readings. | Out of scope, as the brief said. |

Every alternative is KANJIDIC2 underneath, so the licence in §2 follows the data whichever
packaging is used.

---

## 2. Licence

### 2.1 What EDRDG says

From the [EDRDG General Dictionary Licence Statement](https://www.edrdg.org/edrdg/licence.html),
read 2026-09-21:

- **§2 Application.** The statement applies to KANJIDIC2 by name, "and any data files which are
  derived from them". Copyright is held by James William Breen and EDRDG.
- **§3 Licence.** "The dictionary files are made available under a Creative Commons
  Attribution-ShareAlike Licence (V4.0)." The
  [KANJIDIC Project page](https://www.edrdg.org/wiki/KANJIDIC_Project.html) § Copyright and
  Permissions says the same.
- **§3 Attribution for software.** For "a software package, WWW server, smartphone app, etc. which
  uses the files or incorporates data from the files, you must":
  - "acknowledge the usage and source of the files in the documentation, publicity material, WWW
    site of the package/server, etc.";
  - "provide copies of the documentation and licence files (in the case of software packages)", or
    links where packaging does not allow it;
  - "provide links to either local copies of the documentation and licence files or to the
    locations of the files … at the EDRDG site."
  - **Per screen:** "If a WWW server is providing a dictionary function or an on-screen display of
    words from the files, the acknowledgement must be made on each screen display". But "if…
    material from the files is mixed with information from other sources, it is sufficient to
    provide a general acknowledgement".
  - The URL to cite for KANJIDIC is `https://www.edrdg.org/wiki/index.php/KANJIDIC_Project`.
    [Sample acknowledgement text](https://www.edrdg.org/edrdg/sample.html) is given for a site and
    for a software package.
- **§3, on the app's own code.** "Software using these files does not have to be under any form of
  open-source licence." Commercial use is not restricted. Users "must NOT claim copyright over
  that material".
- **§4 Updating.** "If a software package, WWW server, smartphone app, etc. uses the files or
  incorporates data from the files, there must be a procedure for regular updating of the data
  from the most recent versions available. For example, WWW-based dictionary servers should update
  their dictionary versions at least once a month. **Failure to keep the versions up-to-date is a
  violation of the licence to use the data.**" ⚠️ **This is the clause that shapes the options.**
  Any committed copy needs a refresh procedure, and monthly is the only figure EDRDG gives.
- **§8 Special conditions for KANJIDIC2.** Some fields carry third-party copyright. The SKIP codes
  are "now under a Creative Commons Attribution-Noncommercial-Share Alike 4.0" licence
  ([KANJIDIC Project](https://www.edrdg.org/wiki/KANJIDIC_Project.html) § Copyright and
  Permissions). The others are Pinyin, Four Corner, Morohashi, Spahn/Hadamitzky descriptors,
  Korean readings and De Roo codes. **None of them is a Japanese reading, so a derived table of
  `ja_on`/`ja_kun` excludes all of them.** The raw file includes them, so committing the raw file
  also commits NC-licensed SKIP codes. That is permitted for a non-commercial public repo, but it
  is a second licence in the tree for no benefit.

### 2.2 What CC BY-SA 4.0 itself adds

From the [legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en):

- **"Share"** means "to provide material **to the public** by any means". §3's conditions apply
  when you Share.
- **§3(a) Attribution**, if you Share, including in modified form: keep the creator
  identification, the copyright notice, a notice referring to the licence, a notice referring to
  the disclaimer of warranties, and a link to the material. **Indicate if you modified it.**
  Indicate that it is under CC BY-SA 4.0 and link the licence. "Any reasonable manner based on the
  medium" is allowed, including a link to a page that holds the information.
- **§3(b) ShareAlike**, if you Share **Adapted Material**: the adapter's licence must be BY-SA 4.0
  or a compatible licence, and you may not add terms or technical measures that restrict it.
- **§4 Sui generis database rights.** Extracting "all or a substantial portion" of the database
  contents into a database of yours makes that database Adapted Material. A kanji→readings table
  of all 12,356 kanji is a substantial portion.

### 2.3 What that means for each thing the issue asks about

| Act | Is it Sharing? | What it requires |
| --- | --- | --- |
| **(a) Commit the raw `kanjidic2.xml.gz` to this public repo** | Yes. The repo is public. | Attribution (§3(a)) with EDRDG's notice and licence links beside the file. It is unmodified, so ShareAlike does not engage. Brings the SKIP codes' NC licence along (§2.1). EDRDG §4 refresh. 1.49 MB of binary per refresh. |
| **(b) Commit a derived table** | Yes, and it is Adapted Material (hiragana-folded, markers stripped, fields dropped). | §3(a) attribution, **"indicate if You modified"**, and the **file itself licensed CC BY-SA 4.0** (§3(b)), e.g. a notice or `LICENSE` beside it. The rest of the repo stays unlicensed (EDRDG §3). EDRDG §4 refresh. |
| **(c) Ship data to the browser** | Only the invited reader receives it. Whether that is "to the public" **is not answered by the documents**. EDRDG's §3 attribution applies anyway, because it binds any software "which uses the files". | The acknowledgement in the app's documentation or site (below). Nothing else extra, because the client gets a subset of what (a) or (b) already Shares. |
| **(d) Attribution in the app** | n/a | An acknowledgement of KANJIDIC2 and EDRDG with links to the licence statement and the project page, somewhere in the app and in the repo's documentation. **Per screen only if a screen shows words from the files.** The retry message proposed in ADR 0069 §5 shows none. If the build shows the matched kanji reading ("む is a reading of 夢"), that is an on-screen display of data from the file. The mixed-sources exception probably covers it, since the screen is mostly model-generated *note* content, but that is a judgement and not a finding. |

⚠️ **The repo has no `LICENSE` file and no README** (checked 2026-09-21). A CC BY-SA file can still
sit in it with its own notice. The acknowledgement EDRDG asks for "in the documentation" has no
obvious home yet, and neither does an app page like "About". Kioku's pages are `index`, `review`,
`sources`, `stats`, `vet` and `auth`.

### 2.4 The options

| Option | Nothing in the repo? | Deterministic tests/builds? | Refresh (EDRDG §4) | Cost |
| --- | --- | --- | --- | --- |
| **1. Commit raw** `.xml.gz` | No, 1.49 MB binary, plus the NC SKIP codes | Yes | A commit per refresh | Parser at build or boot. Two licences in the tree. |
| **2. Commit derived** JSON + regenerate script | No, 0.54 MB text (0.10 MB jōyō-only), diffable | Yes | Rerun the script, commit | A `LICENSE`/notice beside the file. Smallest runtime work. |
| **3. Fetch at build** (a script in `npm run build`) | Yes | **No.** The data moves daily, and CI and Vercel builds depend on edrdg.org being up | Every deploy. Stale if no deploy for a month | Tests need a hand-written fixture. Nothing Vercel-specific (ADR 0022 holds). |
| **4. Fetch at install** (`postinstall`) | Yes | No, and worse: every `npm ci` hits edrdg.org | Every install | Install-time network scripts. No advantage over 3. |
| **5. Load into Neon** with a worker command (like `worker/backfill.py`) | Yes | Tests use a PGlite fixture | Rerun the command | A table and a migration. A query at composition. The data sits in a hosted DB, which the licence allows. |

**Recommendation: option 2, commit the derived table**, server-side only, with a regenerate script
in `scripts/` and a CC BY-SA 4.0 notice beside it, refreshed monthly. Reasons:

- It is the only option where tests and builds are deterministic *and* the table is reviewable in
  a diff. A refresh that removes a reading shows up as a line.
- It drops every field with a third-party licence (§2.1). The raw file keeps them all.
- Every option needs the EDRDG §4 refresh. Options 3 and 4 only automate it as long as deploys
  happen, and they add a build-time dependency on a server the project does not control.
- Option 5 is the right shape if more EDRDG data (JMdict, ADR 0069's fallback) ever arrives and
  the tables grow. For one 0.5 MB lookup it costs a migration and a query.

The refresh procedure is part of the licence call: a monthly manual rerun recorded in
`docs/00-status.md`, or a scheduled GitHub Action that opens a PR (a new piece of standing
configuration).

---

## 3. Format

### 3.1 What a reader has to parse

One entry, abridged, from the 2026-09-21 file. Only the elements the rule needs are shown:

```xml
<character>
<literal>夢</literal>
…
<reading_meaning><rmgroup>
<reading r_type="pinyin">meng4</reading>  … korean_r, korean_h, vietnam …
<reading r_type="ja_on">ム</reading>
<reading r_type="ja_on">ボウ</reading>
<reading r_type="ja_kun">ゆめ</reading>
<reading r_type="ja_kun">ゆめ.みる</reading>
<reading r_type="ja_kun">くら.い</reading>
<meaning>dream</meaning> …
</rmgroup></reading_meaning>
</character>
```

- The DTD: `ja_on` is "the "on" Japanese reading of the kanji, in katakana". `ja_kun` is "usually in
  hiragana. Where relevant the okurigana is also included separated by a ".". Readings associated
  with prefixes and suffixes are marked with a "-"". `nanori` is "Japanese readings that are now
  only associated with names". `on_type` and `r_status` are "not currently used".
- In this file each `<reading>` sits on its own line, so a regex over lines is enough in Node,
  which has no XML parser built in (measured: the §3.4 fold check ran as one `matchAll` over the
  file). Python's stdlib `xml.etree` parses the whole file in about a second (§1.2).
- `jlpt` exists but is the **old four-level** test ("Values range from 1 … to 4", DTD). It is not a
  Kioku *level* source, and ADR 0005 already covers why.

### 3.2 The derived table

The rule needs kanji → readings, folded to what the check compares. What was measured
(`derived_all.json`, compact JSON, `ensure_ascii=False`):

- On readings: `-` dropped, katakana → hiragana.
- Kun readings: `-` dropped, and for `stem.okurigana` **both** the stem and stem+okurigana are
  kept (くら.い → くら, くらい).
- Nanori excluded.
- Deduplicated and sorted.

| Table | Entries | Raw | gzip -9 | brotli q11 |
| --- | --- | --- | --- | --- |
| The raw XML | 13,108 | 15,641,823 | 1,477,370 | 918,058 |
| Derived, all kanji with a reading | 12,356 | 542,365 | 132,552 | 104,576 |
| Derived, on/kun kept apart (`[[on],[kun]]`) | 12,356 | 541,460 | 128,627 | — |
| Derived, jōyō only | 2,136 | 100,652 | 26,341 | 22,770 |

Examples from the derived table: 夢 → くら, くらい, ぼう, む, ゆめ, ゆめみる. 水 → すい, みず.
見 → けん, み, みえる, みせる, みる. 生 has 23 entries.

**Jōyō-only is not enough.** Of the 385 distinct kanji in the Neon sample, 31 are outside jōyō (19
jinmeiyō, 12 with no grade), and they appear in 34 of the 427 terms that contain a kanji. The full
table is the one to derive.

### 3.3 Okurigana `.` and affix `-`

- **`.` (8,349 of 16,036 kun readings).** The problem is not parsing. The problem is **which form
  counts as "a reading of the kanji"**:
  - For a **single-kanji term** (夢), the whole form and the stem are both plausible things to
    type. Keeping both is safe: the word's own reading is checked first.
  - For a **term with okurigana** (見る), candidates have to be built from **stems only**, plus the
    term's own kana. Otherwise 見's full kun forms produce false retries: 見 carries み.える, and
    typing みえる for 見る would be told "not the kanji's reading" when it is a different word
    (見える). This is a build detail, but a test should pin it.
- **`-` (392 kun, 4 on).** It marks a prefix or suffix use (悪 わる-, 宛 -あて). Strip it. Nothing in
  the check wants the marker.
- **Kun readings in katakana: 60**, all measurement kokuji (吋 インチ, 粁 キロメートル). The KANJIDIC
  project page notes this exception. The fold below handles them.

### 3.4 Katakana → hiragana

Not a problem, and **it needs no new code**. `foldReading` in `shared/review/answer.ts` already
runs `toHiragana(text, { convertLongVowelMark: false })` on both sides of the reading comparison.
Measured 2026-09-21 against wanakana 5.3.1 over the raw file: all 21,012 `ja_on` readings are
`isKatakana`. `toHiragana` agrees with a plain code-point shift on all of them. One contains `ー`
(ダース), which the existing option leaves as `ー`, the same as the typed side. The table can keep
KANJIDIC2's katakana, if on and kun should stay distinguishable, or fold it ahead of time. The
check's result is the same either way.

---

## 4. Reach of the rule

### 4.1 What was sampled

A read-only query on Neon, 2026-09-21 (a `BEGIN READ ONLY` transaction, then `ROLLBACK`):
`note.fields->>'term'`, `->>'reading'`, and whether a `card` exists for the *note*, for
`subject_id = 'jlpt-vocab'`. **475 *notes*, 39 minted.** The rows went to the session scratchpad
and nowhere else. Only aggregates are recorded here, and every example word in this document is a
dictionary word chosen for illustration, not a row.

### 4.2 Classes of term

| Class | All 475 | Minted 39 | What the rule does |
| --- | --- | --- | --- |
| Kana only | 48 | 2 | Nothing. No reading step since #27. |
| **Single kanji** (夢, 水) | **124** | **12** | The single-kanji rule. |
| One kanji plus kana (見る) | 178 | 16 | A small extension: stems plus the term's kana. |
| All-kanji compound (学校) | 89 | 6 | Compound rule only. |
| Compound plus kana | 36 | 3 | Compound rule only. |
| Characters outside KANJIDIC2 | 0 | 0 | n/a |

### 4.3 Does the table know the word's own reading?

If the correct reading is itself one of the candidates, the data and the rule agree about the term.
If it is not, the term is not compositional (jukujikun, ateji, a colloquial reading) and a
compound rule is guessing.

| Class | Plain concatenation | + rendaku/sokuon only | Not derivable |
| --- | --- | --- | --- |
| Single kanji | 120 / 124 | — | 4 |
| One kanji + kana | 167 / 178 | 0 | 11 |
| All-kanji compound | 67 / 89 | 14 | 8 |
| Compound + kana | 30 / 36 | 2 | 4 |

The variants measured: the first mora of each non-initial kanji voiced (か→が … ほ→ぼ, and ほ→ぽ
etc.), and a final つ/ち/く/き of each non-final kanji geminated to っ. That over-generates on
purpose, as an upper bound. 学校 needs it (がく→がっ + こう). 日本 does not come out as にほん at all.

Incidental finding: about five of the 11 underivable "one kanji + kana" *notes* have a stored
reading that is a different inflection of the term (a potential form, for example). That is a
`generate` data-quality issue and outside this ticket. Only the count is recorded here.

### 4.4 How many candidates each rule produces

Candidates per term, with variants:

| Class | Median | p90 | Max |
| --- | --- | --- | --- |
| Single kanji | 3 | 6 | 17 |
| One kanji + kana | 6 | 13 | 23 |
| All-kanji compound | 27 | 70 | 576 |
| Compound + kana | 44 | 144 | 275 |

### 4.5 What a compound rule gets wrong

The rule's promise is narrow: *you typed a reading of the kanji, the word wants its own*. For one
kanji that is exactly what happened. For a compound, the candidate set is every combination of
readings, and that is also **the space most real mistakes live in**. Checked against the derived
table:

- **Legitimate readings get the wrong message.** 今日 stored as きょう: こんにち is a combination
  (こん + にち) and a real reading of 今日. 一日 stored as ついたち: いちにち is a combination and a
  real word. 上手 stored as じょうず: うわて and かみて are both combinations and both real readings.
  大人 stored as おとな: たいじん is a combination and a real word. In each case the reader would be
  told "the word's reading, not the kanji's" when they typed *a* word's reading. Kioku stores one
  reading, so it cannot tell these apart.
- **Real misses become free retries.** 大人 → だいにん, 時計 → じけい. These are the classic
  mistakes a reader makes, they are all combinations, and the compound rule turns each one into a
  second attempt that records nothing. With 27 to 44 candidates per compound, the rule softens
  the check far more than ADR 0069 §5 asked. §5 was about 夢/む.
- **Rendaku and sokuon make it worse, not better.** They are needed to reach 学校 and 人々, and
  they grow the candidate set by about 2–4.5× (一日: 20 → 42, 時計: 12 → 55).
- **Jukujikun cannot be reached at all** (大人, 今日, 時計 as とけい). 8 of the 89 all-kanji
  compounds in the sample are like this. For them the rule can only produce false retries.

A single-kanji rule has one failure of the same kind, and it is milder. A kanji whose word reading
and another reading are both words (生: なま, せい, いきる…) gives a retry for a different
real reading. That is the WaniKani 水/すい case the ADR asked for.

---

## 5. Where it runs

### 5.1 What exists

`shared/review/answer.ts` is pure. `readingMatches(typed, stored)` compares after `foldReading`.
Positions come from `server/utils/review/queries.ts` into `ReviewPosition`
(`shared/review/snapshot.ts`), which already carries per-*note* check data: `meanings` and
`synonyms`. The snapshot is held in `localStorage` (`app/pages/review.vue`, ADR 0014), and a
server snapshot is installed unparsed, so ⚠️ **a new position field must be read with `?? []`**
(`docs/00-status.md` § Carrying). `parseSnapshot` has to accept it too, or a held run from before
the deploy fails to load.

### 5.2 Payload, measured over the 475 *notes* (compact JSON, raw unless stated)

| Where | Per *card* | 20-*card session* (default) | 200-*card session* (max) | Client bundle |
| --- | --- | --- | --- | --- |
| **(a) Whole table to the client** | 0 | 0 | 0 | +542 KB raw / **+105 KB brotli** (jōyō-only +23 KB, but see §3.2) |
| **(b) Readings of the term's kanji, per position** (`{"夢":[…]}`) | mean 71 B, median 62, max 284 | ≈1.4 KB | ≈14 KB | 0 |
| **(c) Server-computed candidates, single-kanji rule** (the list minus the word's reading, `[]` otherwise) | mean 9 B, median 2 (`[]`), max 190 | ≈180 B | ≈1.8 KB | 0 |
| (c′) Server-computed candidates, compound rule with variants | mean 299 B, median 67, max 12,652 | ≈6 KB | ≈60 KB | 0 |

Everything in (b) and (c) is also written into `localStorage` with the snapshot, and (c′) is what
makes that noticeable.

### 5.3 Reading the numbers

- **(a)** makes `/review` pay about 105 KB brotli for the ~20 kanji a *session* touches. It also
  puts EDRDG data in the client bundle, where the rest of the app never needed it.
- **(b)** keeps the rule entirely in `answer.ts`: the client builds candidates from per-kanji
  readings. It ships raw KANJIDIC2 readings and lets the rule change without a server deploy. That
  is a weak benefit, because they deploy together.
- **(c)** keeps the table on the server and ships the rule's output. The check stays pure: a new
  function in `answer.ts` takes `(typed, stored, kanjiReadings)` and returns *right / retry /
  wrong*, and a pure function on the server (tested at the unit tier, `11` §8's seam pattern)
  computes the list. It is the smallest payload by an order of magnitude, and it is snapshotted
  with the *fields*, for the same reason `meanings` is.

**Recommendation: (c).** Its one cost is that the candidate function lives on the server's side of
the seam. It is pure and shared either way, since `shared/` is importable from both.

---

## 6. Recommendation for the build ticket's scope

1. **Single-kanji terms only** (124 of 475 cached, 12 of 39 minted). Candidates are every on
   reading and every kun reading, whole and stem. The word's own reading is checked first.
   Nanori are excluded.
2. **Optionally, one kanji plus kana** (178 more), with candidates from **stems only** plus the
   term's literal kana (§3.3), so 見る typed as けんる retries and みえる does not. My
   recommendation is to leave it for a second ticket unless Yuta wants it in the first (§7.3).
   It is the same function with one more branch and a test for the みえる trap.
3. **No compound rule.** §4.5: it softens the check, and it mislabels real alternative readings.
   If it is ever wanted, the data to reconsider is how often compounds are missed with a
   combination reading, and that is not recorded today (ADR 0060 keeps no typed text).
4. **Server computes at composition** a `kanjiReadings: string[]` on `ReviewPosition` (§5, (c)),
   read with `?? []`, accepted by `parseSnapshot`, and snapshotted like `meanings`.
5. **`answer.ts` gains a three-way result for the reading step**, and the retry records nothing
   (ADR 0069 §5).
6. **Data:** the derived table per the licence call (§7.1), a regenerate script, the EDRDG
   acknowledgement (§7.2), and a refresh procedure (§7.1). No raw dataset in the repo either way.
7. **Tests:** unit tests for the pure pieces with a **hand-written fixture of a few kanji** (夢,
   水, 見, 生), so the tests do not depend on the table's contents changing daily.

---

## 7. Calls for Yuta

⚠️ **Yuta made the calls on 2026-09-21:**

1. **Commit the derived table**, CC BY-SA 4.0 notice beside it, monthly manual refresh recorded
   in `docs/00-status.md`. As recommended.
2. **A notice file beside the data plus one footer line** with the two links. As recommended.
3. **Reach: all three classes** — single kanji, one kanji plus kana, and compounds with rendaku
   and sokuon variants. ⚠️ **This goes past the recommendation.** The costs in §4.5 come with it
   and belong in the build ticket: real alternative readings (今日 こんにち, 上手 うわて) are told
   "not the kanji's", combination misses (大人 だいにん) become a retry, and jukujikun get only
   false retries. The one-retry cap (call 5) is what bounds the softening. The okurigana stem rule
   (§3.3) is part of the scope, including the みえる trap.
4. **Server-computed candidates per position.** Not asked separately; the recommendation stands.
   With compounds in scope the payload is §5.2's (c′): about 6 KB for a 20-*card session*, and
   the largest single *card* measured 12,652 B.
5. **One retry per step**, then the check's result stands. As recommended.
6. **The message does not name the reading.** As recommended.

The original calls, with their reasoning:

1. **How the data reaches the server, and how it is refreshed** (§2.4).
   Options: commit raw / **commit derived** / fetch at build / fetch at install / load into Neon.
   **Recommendation: commit the derived table** with a CC BY-SA 4.0 notice beside it, and a
   **monthly manual refresh** (a script run and a commit) recorded in `docs/00-status.md`. A
   scheduled Action is the alternative if you would rather not carry a monthly chore. It is new
   standing configuration, so it is your call.
2. **Where the acknowledgement lives** (§2.3 (d)). EDRDG requires it "in the documentation … WWW
   site", with licence links. Kioku has no README and no About page. **Recommendation:** a notice
   file beside the data in the repo, plus one line with the two links in the app's shared footer,
   or on `/stats` if there is no footer. The retry message itself shows no KANJIDIC2 text. Keep it
   that way, so the per-screen clause never engages.
3. **Reach.** Single-kanji only / plus one kanji with okurigana / compounds too (§4).
   **Recommendation: single-kanji only in the first build.** Okurigana terms in a follow-up if
   the reader hits the case. Compounds not at all, for the reasons in §4.5.
4. **Where it runs** (§5). Whole table to the client / per-kanji readings per position /
   server-computed candidates per position. **Recommendation: server-computed candidates**
   (≈9 B per *card*).
5. **How many retries.** ADR 0069 §5 says the reader "types again" and does not say how many
   times. If the second answer is also a kanji reading, the options are retry again or mark it
   wrong. **Recommendation: one retry per step**, then the result stands. Otherwise a reader can
   walk the kanji's readings until one is right, which is the "accept any reading" alternative the
   ADR rejected.
6. **Whether the retry names the reading** (for example "む is a reading of 夢"). **Recommendation:
   no.** The ADR's wording is enough, and it keeps KANJIDIC2 data off the screen (call 2).

---

## Unverified

- **That KANJIDIC2 is rebuilt daily.** Inferred from `database_version 2026-264` on 2026-09-21 and
  the `Last-Modified` header. EDRDG states no schedule on the pages read.
- **Whether serving data to the one allowlisted reader is "Sharing"** ("to the public") under CC
  BY-SA 4.0. The documents do not say. EDRDG's own attribution clause applies either way, so the
  answer changes nothing in §7.
- **Whether a monthly manual refresh satisfies EDRDG §4** for an app that is not a dictionary
  server. "At least once a month" is EDRDG's example for dictionary servers, and the only
  number it gives.
- **What WaniKani does for compounds and how many retries it allows.** Not checked. ADR 0069
  cites it only for the single-kanji 水/すい case.
- **Whether the mixed-sources exception** covers a screen that did show a kanji reading. It is a
  judgement about EDRDG's wording. Call 6 avoids the question.
