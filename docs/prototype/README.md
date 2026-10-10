# The reviewed prototype of the new direction

`kioku-prototype.html` is the clickable prototype Yuta reviewed on 2026-10-10 when he changed the
app's direction ([#67](https://github.com/yutaasakura96/kioku/issues/67),
[ADR 0075](../adr/0075-the-words-are-ready-made-and-a-level-comes-from-a-list.md)). Open the file in
a browser; it needs no server and no network.

⚠️ **It is reference, not product code.** Nothing in the app imports it and nothing here is tested.
It is committed so that #69 to #72, which build the screens, have the thing that was agreed to in
front of them and not a description of it.

## What it shows

Ten screens: Welcome, the placement test, Home on day one and three weeks in, choosing a category,
a lesson, the quiz, the session summary, the word list, and *Add my own words* / *Import an Anki
deck*.

## What was settled on it

Twelve questions were asked on the review and Yuta answered all twelve. They are in
[`02-product-requirements.md`](../02-product-requirements.md) §0 with the ticket that owes each, and
`proto/questions.json` is the list as it was asked.

## Where it is wrong, on purpose or by now

- **The per-level word counts are placeholders** (684, 632, 1,830, 1,810, 3,440). The starter set
  #68 built has 684, 640, 1,730, 1,811 and 3,408 (ADR 0075 §4).
- **The lesson shows an example sentence**, and the starter set has none (ADR 0075 §7). #70 settles
  it.
- **Its sample has no kana-only word.** The rule that such a word asks for no reading
  (ADR 0069 §4) carries over.
- **Welcome says the levels come from "community lists".** They are Jonathan Waller's, and the app
  names him and each source's licence (`subjects/starter/NOTICE.md`).
- ***Vet*, *Sources* and *Stats* have no place in it.** Where they live is not settled.

## Rebuilding it

```
node docs/prototype/proto/build.mjs
```

It inlines `proto/prototype.src.html`, `proto/questions.json`, the three faces and `wanakana` into
the one file, and writes `kioku-prototype.html` beside this README. Checked on 2026-10-10: the
output is byte for byte the file that was reviewed. `proto/.fontcache/` holds the three Shippori
Mincho subsets the build would otherwise fetch from Google Fonts; it is keyed on the glyphs the
page uses, so adding a Japanese character to the source makes the build fetch a new subset.

## What it embeds, and under what

| Embedded | Licence | Notice |
| --- | --- | --- |
| Shippori Mincho | SIL Open Font License 1.1 | [`licences/shippori-mincho-OFL-1.1.txt`](licences/shippori-mincho-OFL-1.1.txt) |
| Newsreader | SIL Open Font License 1.1 | [`licences/newsreader-OFL-1.1.txt`](licences/newsreader-OFL-1.1.txt) |
| IBM Plex Mono | SIL Open Font License 1.1 | [`licences/ibm-plex-mono-OFL-1.1.txt`](licences/ibm-plex-mono-OFL-1.1.txt) |
| `wanakana` 5.3.1 | MIT | [`licences/wanakana-MIT.txt`](licences/wanakana-MIT.txt) |

The same three faces and the same library the app ships (ADR 0074, ADR 0060). The notices are
copied from the installed packages. The words in the prototype are sample data written for the
mock-up; they are not the starter set.
