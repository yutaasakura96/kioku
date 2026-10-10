"""JMdict, read once and asked by form — ADR 0075, #68.

The words, readings, meanings and parts of speech of the starter set come from
here (`worker/starter.py`), and so does a reader's own word before any model is
asked (`pipeline/lookup.py`). **One reader for both**, so a starter word and an
imported one are glossed by the same rules.

⚠️ **JMdict is EDRDG's, under CC BY-SA 4.0, and the raw file is never
committed.** `subjects/starter/NOTICE.md` carries the licence and the
attribution. The file is downloaded into :data:`CACHE_DIR`, which is gitignored,
and indexed into SQLite beside it: 218,880 entries are 58 MB of XML, and a
worker that held them as objects would spend more memory on the dictionary than
on everything else it does.

⚠️ **The download is refreshed after thirty days, and that is the licence
rather than tidiness.** EDRDG's licence §4: *"there must be a procedure for
regular updating of the data"*, and stale data *"is a violation of the licence"*
(`docs/kanjidic-research.md` §2). A worker that starts and finds its copy older
than :data:`MAX_AGE_DAYS` fetches a new one; one that cannot reach EDRDG keeps
the copy it has and says so.

⚠️ **No XML parser, and none is needed**: every element this module reads sits
on its own line, and JMdict's entities (`&n;`, `&v5u;`) are the tags themselves
rather than text to expand. `scripts/kanjidic.ts` reads KANJIDIC2 the same way.
"""

from __future__ import annotations

import gzip
import html
import os
import re
import sqlite3
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Iterator

import events
from pipeline.extract_candidates import is_kana, to_hiragana

#: EDRDG's English-only JMdict, rebuilt daily.
#:
#: ⚠️ **Over TLS, from `www`.** `ftp.edrdg.org` serves the same file but only in
#: the clear (its certificate does not name it), and what this fetches ends up
#: on a *card*.
SOURCE_URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz"

#: Where the download and its index live. Gitignored.
CACHE_DIR = Path(__file__).resolve().parent / ".cache"
#: Overrides the download: a path to a `JMdict_e.gz` already on disk.
PATH_ENV = "KIOKU_JMDICT_PATH"

#: EDRDG names no figure but "monthly" (`docs/kanjidic-research.md` §2).
MAX_AGE_DAYS = 30

#: Tags that mark an entry as common. JMdict's own definition of its `news1`,
#: `ichi1`, `spec1`, `spec2` and `gai1` priority markers.
COMMON_PRIORITIES = frozenset({"news1", "ichi1", "spec1", "spec2", "gai1"})

#: A sense carrying one of these is not what a learner's card should lead with.
#: It still counts as an accepted meaning.
_DATED = frozenset({"arch", "obs", "rare", "dated"})

#: How many glosses the displayed meaning carries, from the first sense.
DISPLAYED_GLOSSES = 4
#: The most accepted meanings one word carries. 上げる has over a hundred.
ACCEPTED_MEANINGS = 40

_ENTRY = re.compile(r"<entry>(.*?)</entry>", re.S)
_CREATED = re.compile(r"JMdict created: (\d{4}-\d{2}-\d{2})")
_PARENTHESISED = re.compile(r"\s*\([^()]*\)\s*")


class DictionaryUnavailable(RuntimeError):
    """There is no JMdict to read and none could be fetched.

    ⚠️ **Raised rather than answered with "not found".** A lookup that quietly
    missed every word would send a whole *source* to the model, which is the one
    thing #68 says must not happen for a word the dictionary has.
    """


@dataclass(frozen=True)
class Reading:
    text: str
    #: `re_restr` — the kanji forms this reading belongs to. Empty means all.
    restricted_to: tuple[str, ...] = ()
    priorities: tuple[str, ...] = ()


@dataclass(frozen=True)
class Sense:
    #: JMdict's own tags: `n`, `v5u`, `vt`, `adj-na`.
    parts_of_speech: tuple[str, ...]
    glosses: tuple[str, ...]
    #: `stagk` and `stagr` — the forms this sense is limited to. Empty means all.
    kanji_only: tuple[str, ...] = ()
    reading_only: tuple[str, ...] = ()
    misc: tuple[str, ...] = ()


@dataclass(frozen=True)
class Entry:
    sequence: int
    kanji: tuple[str, ...]
    readings: tuple[Reading, ...]
    senses: tuple[Sense, ...]
    common: bool

    def has_reading(self, term: str, reading: str) -> bool:
        """Whether ``reading`` is one this entry gives ``term``.

        Compared in hiragana, because a deck may write ジーンズ's reading either
        way (ADR 0045) and JMdict writes loanwords in katakana.
        """
        wanted = to_hiragana(reading)
        return any(
            to_hiragana(candidate.text) == wanted
            and (
                not candidate.restricted_to
                or term in candidate.restricted_to
                or term not in self.kanji
            )
            for candidate in self.readings
        )

    def senses_for(self, term: str, reading: str) -> tuple[Sense, ...]:
        """The senses that apply to this spelling and this reading."""
        folded = to_hiragana(reading)
        return tuple(
            sense
            for sense in self.senses
            if (not sense.kanji_only or term in sense.kanji_only)
            and (
                not sense.reading_only
                or folded in {to_hiragana(only) for only in sense.reading_only}
            )
        )


@dataclass(frozen=True)
class Word:
    """What a *note* takes from one entry — ADR 0075 §2."""

    sequence: int
    #: The gloss the card shows: the first sense, `; `-joined, which is the
    #: separator `shared/review/answer.ts` splits on.
    meaning: str
    #: Every gloss the check accepts (`note_meaning`, ADR 0069 §3).
    meanings: tuple[str, ...]
    part_of_speech: str


def parse_entry(block: str) -> Entry:
    """One `<entry>` block, without its tags."""
    kanji: list[str] = []
    readings: list[Reading] = []
    senses: list[Sense] = []
    priorities: set[str] = set()
    carried: tuple[str, ...] = ()

    for element in re.findall(r"<k_ele>(.*?)</k_ele>", block, re.S):
        kanji.extend(_all("keb", element))
        priorities.update(_all("ke_pri", element))

    for element in re.findall(r"<r_ele>(.*?)</r_ele>", block, re.S):
        found = tuple(_all("re_pri", element))
        priorities.update(found)
        readings.append(
            Reading(
                text=_all("reb", element)[0],
                restricted_to=tuple(_all("re_restr", element)),
                priorities=found,
            )
        )

    for element in re.findall(r"<sense>(.*?)</sense>", block, re.S):
        # ⚠️ JMdict's DTD: a part of speech given on one sense applies to the
        # senses after it until another is given.
        named = tuple(_tags("pos", element))
        carried = named or carried
        glosses = tuple(
            html.unescape(gloss) for gloss in re.findall(r"<gloss[^>]*>([^<]*)</gloss>", element)
        )
        if not glosses:
            continue
        senses.append(
            Sense(
                parts_of_speech=carried,
                glosses=glosses,
                kanji_only=tuple(_all("stagk", element)),
                reading_only=tuple(_all("stagr", element)),
                misc=tuple(_tags("misc", element)),
            )
        )

    return Entry(
        sequence=int(_all("ent_seq", block)[0]),
        kanji=tuple(kanji),
        readings=tuple(readings),
        senses=tuple(senses),
        common=bool(priorities & COMMON_PRIORITIES),
    )


def _all(name: str, block: str) -> list[str]:
    return [html.unescape(value) for value in re.findall(rf"<{name}>([^<]*)</{name}>", block)]


def _tags(name: str, block: str) -> list[str]:
    """`<pos>&v5u;</pos>` → `v5u`. The entity is the tag."""
    return re.findall(rf"<{name}>&([^;]+);</{name}>", block)


def word_of(entry: Entry, term: str, reading: str) -> Word | None:
    """The fields one spelling of one entry gives a *note*, or `None` when no
    sense of the entry applies to it."""
    senses = entry.senses_for(term, reading)
    if not senses:
        return None

    # A current sense leads; an entry with only dated ones leads with its first.
    lead = next((sense for sense in senses if not set(sense.misc) & _DATED), senses[0])

    accepted: list[str] = []
    for gloss in (gloss for sense in (lead, *senses) for gloss in sense.glosses):
        # ⚠️ "(at) any time" is also "any time", and "to meet (someone)" is "to
        # meet". The check strips punctuation and nothing else
        # (`shared/review/answer.ts`), so the bare form has to be listed.
        for variant in (gloss, _PARENTHESISED.sub(" ", gloss).strip()):
            if variant and variant not in accepted:
                accepted.append(variant)

    return Word(
        sequence=entry.sequence,
        meaning="; ".join(lead.glosses[:DISPLAYED_GLOSSES]),
        meanings=tuple(accepted[:ACCEPTED_MEANINGS]),
        part_of_speech=part_of_speech_label(lead.parts_of_speech),
    )


#: JMdict's tags in the words the app shows a learner. A tag missing here is
#: shown as JMdict writes it rather than dropped.
_LABELS = {
    "n": "noun",
    "n-adv": "noun",
    "n-t": "noun",
    "n-pr": "proper noun",
    "pn": "pronoun",
    "vs": "する verb",
    "vs-s": "する verb",
    "vs-i": "する verb",
    "adj-i": "い adjective",
    "adj-ix": "い adjective",
    "adj-na": "な adjective",
    "adj-no": "の adjective",
    "adj-t": "たる adjective",
    "adj-pn": "pre-noun adjective",
    "adj-f": "pre-noun adjective",
    "adv": "adverb",
    "adv-to": "adverb",
    "conj": "conjunction",
    "int": "interjection",
    "exp": "expression",
    "prt": "particle",
    "aux": "auxiliary",
    "aux-v": "auxiliary verb",
    "aux-adj": "auxiliary adjective",
    "cop": "copula",
    "ctr": "counter",
    "num": "numeric",
    "pref": "prefix",
    "n-pref": "prefix",
    "suf": "suffix",
    "n-suf": "suffix",
    "unc": "unclassified",
}


def part_of_speech_label(tags: Iterable[str]) -> str:
    """`("v5u", "vi")` → `intransitive verb`; `("n", "vs")` → `noun, する verb`."""
    tags = tuple(tags)
    labels: list[str] = []

    # Every conjugation class (`v1`, `v5u`, `vk`, `vz`) is one word to a learner.
    if any(tag.startswith("v") and tag not in {"vt", "vi"} and tag not in _LABELS for tag in tags):
        transitive, intransitive = "vt" in tags, "vi" in tags
        if transitive and not intransitive:
            labels.append("transitive verb")
        elif intransitive and not transitive:
            labels.append("intransitive verb")
        else:
            labels.append("verb")

    for tag in tags:
        if tag in {"vt", "vi"} or (tag.startswith("v") and tag not in _LABELS):
            continue
        label = _LABELS.get(tag, tag)
        if label not in labels:
            labels.append(label)

    # 経験 is `n, vs`: the noun leads, as the prototype writes it.
    labels.sort(key=lambda label: label != "noun")
    return ", ".join(labels)


class Dictionary:
    """JMdict behind two questions: *which entry is this number*, and *which
    entry is this word*."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection
        row = connection.execute("SELECT value FROM meta WHERE key = 'created'").fetchone()
        #: JMdict's own build date, `2026-10-09`. What provenance records.
        self.created: str = row[0]

    @property
    def version(self) -> str:
        """What `note_field_provenance.dictionary_version` says of a JMdict value."""
        return f"JMdict {self.created}"

    def entry(self, sequence: int) -> Entry | None:
        row = self._connection.execute(
            "SELECT block FROM entry WHERE sequence = ?", (sequence,)
        ).fetchone()
        return None if row is None else parse_entry(row[0])

    def entries_for(self, form: str) -> tuple[Entry, ...]:
        rows = self._connection.execute(
            """
            SELECT DISTINCT e.sequence, e.block FROM form f
            JOIN entry e ON e.sequence = f.sequence
            WHERE f.form = ? ORDER BY e.sequence
            """,
            (to_hiragana(form) if is_kana(form) else form,),
        ).fetchall()
        return tuple(parse_entry(block) for _, block in rows)

    def find(self, term: str, reading: str) -> Word | None:
        """`pipeline.lookup.Lookup`: the fields of the one entry for this word."""
        entry = self.lookup(term, reading)
        return None if entry is None else word_of(entry, term, reading)

    def lookup(self, term: str, reading: str) -> Entry | None:
        """The one entry for this term read this way, or `None`.

        ⚠️ **`None` when the dictionary cannot say which**, not only when it has
        nothing. かける is a dozen entries; a list that says かける and nothing
        else has not said which, and the dictionary guessing would put a gloss on
        the card that nobody chose. A common entry wins over uncommon ones, and a
        tie is a miss.
        """
        if not term or not reading:
            return None

        if is_kana(term):
            # A word written in kana: an entry with no kanji form, or one whose
            # reading this is. The reading must be the term itself.
            if to_hiragana(term) != to_hiragana(reading):
                return None
            candidates = [
                entry
                for entry in self.entries_for(term)
                if any(to_hiragana(r.text) == to_hiragana(term) for r in entry.readings)
                and (not entry.kanji or _usually_kana(entry))
            ]
        else:
            candidates = [
                entry
                for entry in self.entries_for(term)
                if term in entry.kanji and entry.has_reading(term, reading)
            ]

        candidates = [entry for entry in candidates if entry.senses_for(term, reading)]
        if len(candidates) > 1:
            candidates = [entry for entry in candidates if entry.common]
        return candidates[0] if len(candidates) == 1 else None


def _usually_kana(entry: Entry) -> bool:
    """JMdict's `uk` on the leading sense: *word usually written using kana alone*."""
    return bool(entry.senses) and "uk" in entry.senses[0].misc


def build_index(source: Path, target: Path) -> None:
    """`JMdict_e.gz` → the SQLite file :class:`Dictionary` reads.

    Written beside the target and renamed over it, so a build that dies half way
    leaves the old index readable.
    """
    with gzip.open(source, "rt", encoding="utf-8") as handle:
        xml = handle.read()

    created = _CREATED.search(xml)
    if created is None:
        raise DictionaryUnavailable(f"{source} has no 'JMdict created' date; is it JMdict?")

    building = target.with_suffix(".building")
    building.unlink(missing_ok=True)
    connection = sqlite3.connect(building)
    try:
        connection.executescript(
            """
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE entry (sequence INTEGER PRIMARY KEY, block TEXT NOT NULL);
            CREATE TABLE form (form TEXT NOT NULL, sequence INTEGER NOT NULL);
            """
        )
        connection.execute("INSERT INTO meta VALUES ('created', ?)", (created.group(1),))
        connection.executemany("INSERT INTO entry VALUES (?, ?)", _blocks(xml))
        connection.executemany("INSERT INTO form VALUES (?, ?)", _forms(xml))
        connection.execute("CREATE INDEX form_idx ON form (form)")
        connection.commit()
    finally:
        connection.close()
    building.replace(target)


def _blocks(xml: str) -> Iterator[tuple[int, str]]:
    for match in _ENTRY.finditer(xml):
        block = match.group(1)
        yield int(_all("ent_seq", block)[0]), block


def _forms(xml: str) -> Iterator[tuple[str, int]]:
    """Every kanji form as written, and every reading in hiragana."""
    for sequence, block in _blocks(xml):
        for form in _all("keb", block):
            yield form, sequence
        for form in _all("reb", block):
            yield to_hiragana(form), sequence


def open_dictionary(source: Path, *, index: Path | None = None) -> Dictionary:
    """A :class:`Dictionary` over ``source``, indexing it first when the index
    is missing or older than the file."""
    target = index if index is not None else source.with_suffix(".sqlite")
    if not target.exists() or target.stat().st_mtime < source.stat().st_mtime:
        build_index(source, target)
    # `check_same_thread=False`: the worker reads it from the thread that runs
    # the job, which is not always the one that opened it. It is never written.
    return Dictionary(sqlite3.connect(f"file:{target}?mode=ro", uri=True, check_same_thread=False))


_loaded: Dictionary | None = None


class WorkerDictionary:
    """`pipeline.lookup.Lookup` over :func:`load_dictionary`, loaded when the
    first word asks.

    ⚠️ **Lazy, so a worker with no JMdict still starts.** Seeding and the
    backfill never look a word up, and a fetch that fails is one *chunk*'s
    error — resumable, with the reason in it — rather than a worker that will
    not run.
    """

    @property
    def version(self) -> str:
        return load_dictionary().version

    def find(self, term: str, reading: str) -> Word | None:
        return load_dictionary().find(term, reading)


def load_dictionary(
    *,
    environ: dict[str, str] | None = None,
    fetch: Callable[[str, Path], None] | None = None,
    now: Callable[[], float] = time.time,
    log: Callable[..., None] = events.log,
) -> Dictionary:
    """The worker's dictionary, fetched when missing or thirty days old.

    Held for the life of the process: the index is a file, and the second call
    costs nothing.
    """
    global _loaded
    if _loaded is not None:
        return _loaded

    env = os.environ if environ is None else environ
    given = env.get(PATH_ENV)
    if given:
        path = Path(given)
        if not path.exists():
            raise DictionaryUnavailable(f"{PATH_ENV} names {path}, which does not exist")
        _loaded = open_dictionary(path)
        return _loaded

    path = CACHE_DIR / "JMdict_e.gz"
    stale = path.exists() and now() - path.stat().st_mtime > MAX_AGE_DAYS * 86400
    if not path.exists() or stale:
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            (fetch or download)(SOURCE_URL, path)
            log("dictionary.fetched", source=SOURCE_URL)
        except OSError as error:
            if not path.exists():
                raise DictionaryUnavailable(
                    f"no JMdict at {path} and {SOURCE_URL} could not be fetched: {error}"
                ) from error
            # ⚠️ The licence wants this fixed; a run in progress does not want
            # to fail on it. Said on every start until the fetch works.
            log("dictionary.stale", days=MAX_AGE_DAYS, error=type(error).__name__)

    _loaded = open_dictionary(path)
    return _loaded


def download(url: str, target: Path) -> None:
    """Fetch to a sibling and rename, so a dropped connection leaves no half file."""
    partial = target.with_suffix(".partial")
    with urllib.request.urlopen(url, timeout=120) as response, open(partial, "wb") as handle:
        while chunk := response.read(1 << 20):
            handle.write(chunk)
    partial.replace(target)
