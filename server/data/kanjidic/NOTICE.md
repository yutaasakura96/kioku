# KANJIDIC2 readings — notice

`readings.json` in this directory is derived from **KANJIDIC2**, the property of the
[Electronic Dictionary Research and Development Group](https://www.edrdg.org/) (EDRDG), and is
used in conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html).

- Project page: <https://www.edrdg.org/wiki/index.php/KANJIDIC_Project>
- Copyright: James William Breen and The Electronic Dictionary Research and Development Group.
- Source file: <http://www.edrdg.org/kanjidic/kanjidic2.xml.gz>; the version it was built from is
  `database_version` in `readings.json`.

**Licence.** `readings.json` is licensed under the
[Creative Commons Attribution-ShareAlike 4.0 International Licence](https://creativecommons.org/licenses/by-sa/4.0/)
(CC BY-SA 4.0). This notice and that licence cover `readings.json` only, and nothing else in this
repository.

**Modified.** The table is not the original file. `scripts/kanjidic.ts` keeps each kanji's `ja_on`
and `ja_kun` readings and drops everything else, including nanori and every field under a
third-party licence. It converts on readings from katakana to hiragana and strips the `-` affix
marker from all readings. Kun readings keep KANJIDIC2's `.` okurigana marker.

**No warranty.** The data is provided as is, without warranty of any kind, as the EDRDG licence and
CC BY-SA 4.0 §5 set out.

**Kept current.** EDRDG's licence §4 requires regular updates. `node scripts/kanjidic.ts` regenerates
the table from the current file, and each refresh is logged in `docs/00-status.md`.
