# Starter set — notice

`jlpt-vocab.json` in this directory is the starter JLPT vocabulary set (ADR 0075, #68). It is built
by `worker/starter.py` from three sources. None of the three is committed here; only the built file
is.

## 1. JMdict — the word, its reading, its meanings and its part of speech

Derived from **JMdict**, the property of the
[Electronic Dictionary Research and Development Group](https://www.edrdg.org/) (EDRDG), and used
in conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html).

- Project page: <https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project>
- Copyright: James William Breen and The Electronic Dictionary Research and Development Group.
- Licence: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
  (CC BY-SA 4.0).
- Source file: <http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz>; the version the bundle was built
  from is `sources.jmdict.created` in `jlpt-vocab.json`, and each word carries its JMdict entry
  number as `jmdict`.

## 2. Jonathan Waller's JLPT Resources — which words, and at which level

The five lists are **Jonathan Waller's**, from <https://www.tanos.co.uk/jlpt/>, licensed under
Creative Commons BY. His terms, from <https://www.tanos.co.uk/jlpt/sharing/> (page dated
12 October 2011):

> Everything on this site (that I'm not selling), is licenced under Creative Commons "BY".
> Basically this means... use anything here however you like (commercial or non-commercial), but
> credit my site. (A link would be nice.)

The page names no version of the licence, so none is named here.

⚠️ **`www.tanos.co.uk` did not resolve on 2026-10-10**, the day these terms were checked: the name
had no address record, though its name servers were still registered. The terms above were read
from the Internet Archive's capture of that page dated 2025-11-14, and a capture of the site's
JLPT page dated 2026-09-04 still links to it. If the site returns with different terms, this notice
and ADR 0075 are what to revisit.

⚠️ **These are not official lists.** The JLPT has published no vocabulary list since the 2010
revision (ADR 0005), so a level here is this list's opinion, and the app records it as a *level
claim* under the authority key `tanos-jlpt` rather than as a fact about the word.

## 3. yomitan-jlpt-vocab — the form the lists were read in

The lists were read from [`stephenmk/yomitan-jlpt-vocab`](https://github.com/stephenmk/yomitan-jlpt-vocab),
`original_data/n1.csv` … `n5.csv`, at commit `b062d4e38c4bdd0950ae1d4ec55f04b176182e03`
(`sources.jlpt_lists` in `jlpt-vocab.json`). That repository is Waller's lists with a JMdict entry
number added to each row and some spellings normalised to JMdict's; it is licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

## Licence of the bundle

`jlpt-vocab.json` is adapted from the sources above and is licensed under the
[Creative Commons Attribution-ShareAlike 4.0 International Licence](https://creativecommons.org/licenses/by-sa/4.0/)
(CC BY-SA 4.0). This notice and that licence cover `jlpt-vocab.json` only, and nothing else in this
repository.

## Modified

The bundle is not any of the original files. `worker/starter.py`:

- keeps one word per spelling and reading, at the easiest level that lists it;
- takes the spelling and the kana from the list, and writes the reading in hiragana unless the word
  itself is written in katakana (ADR 0045);
- takes the meaning from the first current sense of the JMdict entry the row names, up to four
  glosses, and takes every gloss of the senses that apply to that spelling as the accepted
  meanings, adding each gloss again with its bracketed part removed;
- rewrites JMdict's part-of-speech tags as words a learner reads (`v5u` and `vi` as *intransitive
  verb*);
- drops a row that names no JMdict entry, or whose spelling and reading JMdict does not have. The
  counts and reasons are `dropped` in `jlpt-vocab.json`.

It carries no example sentences. JMdict has none, and no other source was added for them.

## No warranty

The data is provided as is, without warranty of any kind, as the EDRDG licence and CC BY-SA 4.0 §5
set out.

## Kept current

EDRDG's licence asks that an application's copy of the data be updated regularly. `npm run
starter:build` rebuilds the bundle from the current JMdict and the pinned lists, the diff is what
changed, and `npm run starter:load` applies it; each refresh is logged in `docs/00-status.md`
§ Carrying. The worker's own copy of JMdict (`worker/.cache/`, never committed) is fetched again
once it is thirty days old.

A refresh adds new words and brings a word nobody has started up to the current entry. A word a
reader has already started keeps the meaning they started it with (`scripts/starter/load.ts` says
why); its list of accepted meanings is still updated.

## Where the app says this

The acknowledgement is under every *place*, in `app/components/PlaceShell.vue`.
