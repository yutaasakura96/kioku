"""Builds the starter set — `subjects/starter/jlpt-vocab.json`, ADR 0075, #68.

    cd worker && uv run python starter.py            # downloads both sources
    cd worker && uv run python starter.py --lists DIR --jmdict JMdict_e.gz

**Two sources, and each supplies what it is the authority for** (ADR 0005):

- **The level** is Jonathan Waller's JLPT lists (tanos.co.uk, CC BY), read from
  `stephenmk/yomitan-jlpt-vocab` (CC BY-SA 4.0), which adds the JMdict entry
  number to every row. The JLPT has published no word list since 2010
  (ADR 0005), so this is an opinion with a name on it, and the *level claim* it
  becomes carries that name.
- **The word, its reading, its meanings and its part of speech** are JMdict's
  (EDRDG, CC BY-SA 4.0), through `dictionary.py`.

⚠️ **The output is Adapted Material under CC BY-SA 4.0** and the notice beside
it says so. Neither raw source is committed.

⚠️ **The lists are pinned by commit and JMdict is not.** EDRDG publishes only
today's file, and its licence asks for the data to be kept current, so a rerun
is a refresh: the file's own date is written into the bundle and the rerun's
diff is what changed. `docs/00-status.md` § Carrying has the monthly obligation.

⚠️ **Nothing here touches a database.** `scripts/starter-load.ts` loads the
bundle, and loading production is the owner's step.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.request
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from dictionary import Dictionary, load_dictionary, open_dictionary, word_of
from pipeline.extract_candidates import in_script_of

#: The `authority_key` every starter *level claim* carries, declared in
#: `subjects/jlpt-vocab.json`'s `authorities`.
AUTHORITY = "tanos-jlpt"

LISTS_REPOSITORY = "stephenmk/yomitan-jlpt-vocab"
#: The commit the lists are read at. Moving it is a reviewed change: the lists
#: decide which words exist and at which level.
LISTS_COMMIT = "b062d4e38c4bdd0950ae1d4ec55f04b176182e03"
LISTS_URL = f"https://raw.githubusercontent.com/{LISTS_REPOSITORY}/{LISTS_COMMIT}/original_data"

#: Easiest first. A word on two lists keeps the level a learner meets it at.
LEVELS = ("N5", "N4", "N3", "N2", "N1")

TARGET = Path(__file__).resolve().parent.parent / "subjects" / "starter" / "jlpt-vocab.json"


@dataclass(frozen=True)
class Row:
    """One line of one list."""

    level: str
    #: Empty on fourteen N1 rows, which name a kanji rather than a word.
    sequence: int | None
    kana: str
    #: Empty for a word the list writes in kana.
    kanji: str


@dataclass(frozen=True)
class StarterWord:
    term: str
    reading: str
    level: str
    part_of_speech: str
    meaning: str
    meanings: tuple[str, ...]
    jmdict: int


@dataclass(frozen=True)
class Built:
    words: tuple[StarterWord, ...]
    #: Why each row that is not in ``words`` is not, counted.
    dropped: Counter[str]


def read_rows(level: str, text: str) -> list[Row]:
    return [
        Row(
            level=level,
            sequence=int(line["jmdict_seq"]) if line["jmdict_seq"].strip() else None,
            kana=line["kana"].strip(),
            kanji=line["kanji"].strip(),
        )
        for line in csv.DictReader(io.StringIO(text))
    ]


def build(rows: Iterable[Row], dictionary: Dictionary) -> Built:
    """Every row that names a word JMdict has, once, at its easiest level.

    ⚠️ **A row is dropped rather than repaired**, and counted by reason. The
    meaning has to come from JMdict (#68), so a row with no entry behind it has
    nothing to show; the count goes in the bundle and in the PR.
    """
    words: dict[tuple[str, str], StarterWord] = {}
    dropped: Counter[str] = Counter()

    for row in sorted(rows, key=lambda row: LEVELS.index(row.level)):
        term = row.kanji or row.kana
        # ADR 0045: hiragana, except for a word written in katakana.
        reading = in_script_of(term, row.kana)

        if (term, reading) in words:
            dropped["listed again at a harder level"] += 1
            continue
        if row.sequence is None:
            dropped["no JMdict entry named"] += 1
            continue

        entry = dictionary.entry(row.sequence)
        # ⚠️ Ten rows name an entry that does not read the word this way (管 as
        # くだ against the entry for かん). The dictionary is asked by form
        # before the row is given up.
        if entry is None or not _is_form_of(entry, row):
            entry = dictionary.lookup(term, reading)
        word = None if entry is None else word_of(entry, term, reading)
        if word is None:
            dropped["JMdict has no entry for this spelling and reading"] += 1
            continue

        words[(term, reading)] = StarterWord(
            term=term,
            reading=reading,
            level=row.level,
            part_of_speech=word.part_of_speech,
            meaning=word.meaning,
            meanings=word.meanings,
            jmdict=word.sequence,
        )

    return Built(words=tuple(words.values()), dropped=dropped)


def _is_form_of(entry, row: Row) -> bool:
    return (not row.kanji or row.kanji in entry.kanji) and entry.has_reading(
        row.kanji or row.kana, row.kana
    )


def render(built: Built, dictionary: Dictionary) -> str:
    """The bundle, one word to a line so a refresh reads as a diff."""
    counts = Counter(word.level for word in built.words)
    head = {
        "authority": AUTHORITY,
        "sources": {
            "jmdict": {"created": dictionary.created, "version": dictionary.version},
            "jlpt_lists": {"repository": LISTS_REPOSITORY, "commit": LISTS_COMMIT},
        },
        "counts": {level: counts[level] for level in LEVELS},
        "dropped": dict(sorted(built.dropped.items())),
    }
    lines = [
        json.dumps(
            {
                "term": word.term,
                "reading": word.reading,
                "level": word.level,
                "part_of_speech": word.part_of_speech,
                "meaning": word.meaning,
                "meanings": list(word.meanings),
                "jmdict": word.jmdict,
            },
            ensure_ascii=False,
        )
        for word in built.words
    ]
    opening = json.dumps(head, ensure_ascii=False, indent=2)[:-2]
    return opening + ',\n  "words": [\n    ' + ",\n    ".join(lines) + "\n  ]\n}\n"


def _lists(directory: Path | None) -> list[Row]:
    rows: list[Row] = []
    for level in LEVELS:
        name = f"{level.lower()}.csv"
        if directory is not None:
            text = (directory / name).read_text(encoding="utf-8")
        else:
            with urllib.request.urlopen(f"{LISTS_URL}/{name}", timeout=60) as response:
                text = response.read().decode("utf-8")
        rows.extend(read_rows(level, text))
    return rows


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lists", type=Path, help="a directory holding n1.csv … n5.csv")
    parser.add_argument("--jmdict", type=Path, help="a JMdict_e.gz already downloaded")
    parser.add_argument("--out", type=Path, default=TARGET)
    arguments = parser.parse_args(argv)

    dictionary = (
        open_dictionary(arguments.jmdict) if arguments.jmdict else load_dictionary()
    )
    rows = _lists(arguments.lists)
    built = build(rows, dictionary)

    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    arguments.out.write_text(render(built, dictionary), encoding="utf-8")

    counts = Counter(word.level for word in built.words)
    print(f"{arguments.out}: {len(built.words)} words from {len(rows)} rows, {dictionary.version}")
    for level in LEVELS:
        print(f"  {level}  {counts[level]}")
    for reason, count in sorted(built.dropped.items()):
        print(f"  dropped {count}: {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
