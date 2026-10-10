"""`dictionary.py` — JMdict behind two questions (ADR 0075 §5, #68).

No container and no network: `sample_dictionary` is a dozen hand-written entries
in JMdict's shape, indexed the way the worker indexes the real file.
"""

from __future__ import annotations

import gzip
import os
from pathlib import Path

import pytest

import dictionary
from dictionary import (
    DictionaryUnavailable,
    WorkerDictionary,
    build_index,
    load_dictionary,
    part_of_speech_label,
    word_of,
)

SAMPLE = Path(__file__).parent / "fixtures" / "jmdict-sample.xml"


def gzipped(directory: Path, text: str | None = None) -> Path:
    path = directory / "JMdict_e.gz"
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        handle.write(SAMPLE.read_text(encoding="utf-8") if text is None else text)
    return path


@pytest.fixture(autouse=True)
def nothing_loaded(monkeypatch):
    """`load_dictionary` holds what it loaded for the life of the process."""
    monkeypatch.setattr(dictionary, "_loaded", None)


def test_the_version_is_the_date_jmdict_gives_itself(sample_dictionary):
    assert sample_dictionary.created == "2026-10-09"
    assert sample_dictionary.version == "JMdict 2026-10-09"


def test_a_word_is_found_by_its_spelling_and_its_reading(sample_dictionary):
    word = sample_dictionary.find("図書館", "としょかん")

    assert word is not None
    assert (word.sequence, word.meaning, word.part_of_speech) == (1370290, "library", "noun")
    assert word.meanings == ("library",)


def test_one_spelling_read_two_ways_is_two_entries(sample_dictionary):
    """開く is ひらく and あく — the pair ADR 0006 exists to keep apart."""
    assert sample_dictionary.find("開く", "ひらく").sequence == 1202440
    assert sample_dictionary.find("開く", "あく").sequence == 1586270


def test_a_sense_limited_to_another_spelling_is_left_out(sample_dictionary):
    """`stagk`: *to be empty* is 空く's, not 開く's."""
    word = sample_dictionary.find("開く", "あく")

    assert word.meaning == "to open (e.g. doors)"
    assert "to be empty" not in word.meanings


def test_a_reading_limited_to_another_spelling_does_not_match(sample_dictionary):
    """`re_restr`: ずしょかん is 圖書館's reading only."""
    assert sample_dictionary.find("図書館", "ずしょかん") is None
    assert sample_dictionary.find("圖書館", "ずしょかん") is not None


def test_a_part_of_speech_carries_to_the_senses_after_it(sample_dictionary):
    """JMdict's DTD: a `pos` stands until another is given."""
    entry = sample_dictionary.entry(1202440)

    assert entry.senses[1].parts_of_speech == ("v5k", "vi", "vt")


def test_a_bracketed_gloss_is_also_accepted_bare(sample_dictionary):
    """The check strips punctuation and nothing else, so *to meet* has to be
    listed beside *to meet (someone)*."""
    word = sample_dictionary.find("会う", "あう")

    assert word.meaning == "to meet (someone); to encounter"
    assert word.meanings == ("to meet (someone)", "to meet", "to encounter")


def test_a_current_sense_leads_over_a_dated_one(sample_dictionary):
    word = sample_dictionary.find("間", "あいだ")

    assert word.meaning == "space (between); gap"
    assert "interval of old" in word.meanings


def test_a_katakana_word_is_found_whichever_script_its_reading_is_in(sample_dictionary):
    """ADR 0045 keeps a katakana term's reading in katakana; a deck may not."""
    assert sample_dictionary.find("スーパー", "スーパー").meaning == "supermarket"
    assert sample_dictionary.find("スーパー", "すーぱー").meaning == "supermarket"


def test_a_word_usually_written_in_kana_is_found_in_kana(sample_dictionary):
    """りんご has a kanji form and `uk`: the kana spelling is the word."""
    assert sample_dictionary.find("りんご", "りんご").meaning == "apple"
    assert sample_dictionary.find("林檎", "りんご").meaning == "apple"


def test_a_kana_word_that_could_be_two_entries_is_a_miss(sample_dictionary):
    """かける is 掛ける and 駆ける, both common. The dictionary does not pick."""
    assert sample_dictionary.find("かける", "かける") is None


def test_a_common_entry_wins_over_an_uncommon_one(sample_dictionary):
    """駅 read えき is two entries in the sample, and one carries a priority."""
    assert [entry.sequence for entry in sample_dictionary.entries_for("駅")] == [1179470, 2000001]
    assert sample_dictionary.find("駅", "えき").sequence == 1179470


def test_a_word_the_dictionary_does_not_have_is_a_miss(sample_dictionary):
    assert sample_dictionary.find("魑魅魍魎", "ちみもうりょう") is None
    assert sample_dictionary.find("魑魅魍魎", "") is None
    assert sample_dictionary.entry(1) is None


def test_no_reading_uses_the_dictionary_entry(sample_dictionary):
    word = sample_dictionary.find("図書館", "")
    assert (word.sequence, word.reading, word.meaning) == (1370290, "としょかん", "library")


def test_no_reading_chooses_a_common_entry_deterministically(sample_dictionary):
    word = sample_dictionary.find("駅", "")
    assert (word.sequence, word.reading) == (1179470, "えき")
    assert sample_dictionary.find("間", "").sequence == 1215240


def test_no_sense_for_this_spelling_is_no_word(sample_dictionary):
    entry = sample_dictionary.entry(1586270)

    assert word_of(entry, "開く", "あく") is not None
    assert [sense.glosses for sense in entry.senses_for("空く", "あく")] == [("to be empty",)]


@pytest.mark.parametrize(
    ("tags", "label"),
    [
        (("n",), "noun"),
        (("v5u", "vi"), "intransitive verb"),
        (("v1", "vt"), "transitive verb"),
        (("v5k", "vi", "vt"), "verb"),
        (("n", "vs"), "noun, する verb"),
        (("vs", "n"), "noun, する verb"),
        (("adj-i",), "い adjective"),
        (("adj-na", "n"), "noun, な adjective"),
        (("on-mim",), "on-mim"),
        ((), ""),
    ],
)
def test_jmdict_tags_read_as_a_learner_would_say_them(tags, label):
    assert part_of_speech_label(tags) == label


def test_a_file_that_is_not_jmdict_is_refused(tmp_path):
    source = gzipped(tmp_path, "<JMdict></JMdict>")

    with pytest.raises(DictionaryUnavailable):
        build_index(source, tmp_path / "index.sqlite")


def test_a_named_file_is_read_and_nothing_is_fetched(tmp_path):
    source = gzipped(tmp_path)

    def fetch(url, target):  # pragma: no cover - the assertion is that it is not called
        raise AssertionError("fetched")

    loaded = load_dictionary(environ={dictionary.PATH_ENV: str(source)}, fetch=fetch)

    assert loaded.find("駅", "えき").meaning == "railway station; train station"
    # Held for the process: the second call does not open it again.
    assert load_dictionary(environ={}, fetch=fetch) is loaded


def test_a_named_file_that_is_missing_is_an_error(tmp_path):
    with pytest.raises(DictionaryUnavailable):
        load_dictionary(environ={dictionary.PATH_ENV: str(tmp_path / "absent.gz")})


def test_the_dictionary_is_fetched_over_tls():
    """What it fetches ends up on a *card*, so nobody on the path may rewrite it."""
    assert dictionary.SOURCE_URL.startswith("https://")


def test_a_missing_dictionary_is_fetched_once(tmp_path, monkeypatch):
    monkeypatch.setattr(dictionary, "CACHE_DIR", tmp_path / "cache")
    fetched: list[str] = []
    logged: list[str] = []

    def fetch(url, target):
        fetched.append(url)
        gzipped(target.parent)

    loaded = load_dictionary(environ={}, fetch=fetch, log=lambda event, **_: logged.append(event))

    assert loaded.version == "JMdict 2026-10-09"
    assert fetched == [dictionary.SOURCE_URL]
    assert logged == ["dictionary.fetched"]


def test_a_dictionary_thirty_days_old_is_fetched_again(tmp_path, monkeypatch):
    """EDRDG's licence asks for the data to be kept current."""
    monkeypatch.setattr(dictionary, "CACHE_DIR", tmp_path)
    source = gzipped(tmp_path)
    fetched: list[str] = []

    def fetch(url, target):
        fetched.append(url)

    aged = source.stat().st_mtime + (dictionary.MAX_AGE_DAYS + 1) * 86400
    load_dictionary(environ={}, fetch=fetch, now=lambda: aged, log=lambda *_, **__: None)

    assert fetched == [dictionary.SOURCE_URL]


def test_a_fresh_dictionary_is_not_fetched_again(tmp_path, monkeypatch):
    monkeypatch.setattr(dictionary, "CACHE_DIR", tmp_path)
    source = gzipped(tmp_path)

    def fetch(url, target):  # pragma: no cover - the assertion is that it is not called
        raise AssertionError("fetched")

    load_dictionary(environ={}, fetch=fetch, now=lambda: source.stat().st_mtime + 86400)


def test_a_stale_dictionary_that_cannot_be_refetched_is_still_used(tmp_path, monkeypatch):
    """A run in progress does not fail on the refresh; the log says it is owed."""
    monkeypatch.setattr(dictionary, "CACHE_DIR", tmp_path)
    source = gzipped(tmp_path)
    logged: list[str] = []

    def fetch(url, target):
        raise OSError("offline")

    aged = source.stat().st_mtime + (dictionary.MAX_AGE_DAYS + 1) * 86400
    loaded = load_dictionary(
        environ={}, fetch=fetch, now=lambda: aged, log=lambda event, **_: logged.append(event)
    )

    assert loaded.version == "JMdict 2026-10-09"
    assert logged == ["dictionary.stale"]


def test_no_dictionary_and_no_network_is_an_error_that_says_so(tmp_path, monkeypatch):
    monkeypatch.setattr(dictionary, "CACHE_DIR", tmp_path / "cache")

    def fetch(url, target):
        raise OSError("offline")

    with pytest.raises(DictionaryUnavailable, match="could not be fetched"):
        load_dictionary(environ={}, fetch=fetch)


def test_the_workers_dictionary_loads_when_the_first_word_asks(tmp_path, monkeypatch):
    """Constructing it reads nothing, so a worker with no JMdict still starts."""
    monkeypatch.setitem(os.environ, dictionary.PATH_ENV, str(tmp_path / "absent.gz"))
    lazy = WorkerDictionary()

    with pytest.raises(DictionaryUnavailable):
        lazy.find("駅", "えき")

    monkeypatch.setitem(os.environ, dictionary.PATH_ENV, str(gzipped(tmp_path)))
    assert lazy.find("駅", "えき").part_of_speech == "noun"
    assert lazy.version == "JMdict 2026-10-09"
