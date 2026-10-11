"""`starter.py` — the starter set, built from the lists and JMdict (ADR 0075, #68).

No container and no network: the lists are rows written here and the dictionary
is `sample_dictionary`.
"""

from __future__ import annotations

import json

import starter
from starter import Row, build, read_rows, render
from subject import authority_keys, level_values, load_declaration


def test_a_list_is_read_by_its_header():
    rows = read_rows(
        "N5",
        "jmdict_seq,kana,kanji,waller_definition\n"
        "1198180,あう,会う,to meet\n"
        "1073650,スーパー,,supermarket\n"
        ",ばつ,罰,punishment\n",
    )

    assert rows == [
        Row(level="N5", sequence=1198180, kana="あう", kanji="会う"),
        Row(level="N5", sequence=1073650, kana="スーパー", kanji=""),
        Row(level="N5", sequence=None, kana="ばつ", kanji="罰"),
    ]


def test_a_word_takes_its_level_from_the_list_and_the_rest_from_jmdict(sample_dictionary):
    built = build([Row("N5", 1198180, "あう", "会う")], sample_dictionary)

    (word,) = built.words
    assert (word.term, word.reading, word.level) == ("会う", "あう", "N5")
    assert (word.meaning, word.part_of_speech) == ("to meet (someone); to encounter", "intransitive verb")
    assert word.meanings == ("to meet (someone)", "to meet", "to encounter")
    assert word.jmdict == 1198180


def test_a_word_the_list_writes_in_kana_is_a_kana_term(sample_dictionary):
    """The kana-only rule (`shared/review/answer.ts`) reads the term, so a word
    with no kanji in the list must not gain one from the dictionary."""
    built = build(
        [Row("N5", 1559280, "りんご", ""), Row("N5", 1073650, "スーパー", "")], sample_dictionary
    )

    assert [(word.term, word.reading) for word in built.words] == [
        ("りんご", "りんご"),
        # ADR 0045: a katakana term keeps a katakana reading.
        ("スーパー", "スーパー"),
    ]


def test_a_word_on_two_lists_keeps_the_easier_level(sample_dictionary):
    built = build(
        [Row("N3", 1370290, "としょかん", "図書館"), Row("N5", 1370290, "としょかん", "図書館")],
        sample_dictionary,
    )

    assert [(word.term, word.level) for word in built.words] == [("図書館", "N5")]
    assert built.dropped == {"listed again at a harder level": 1}


def test_one_spelling_read_two_ways_is_two_words(sample_dictionary):
    built = build(
        [Row("N5", 1586270, "あく", "開く"), Row("N4", 1202440, "ひらく", "開く")],
        sample_dictionary,
    )

    assert [(word.reading, word.level, word.jmdict) for word in built.words] == [
        ("あく", "N5", 1586270),
        ("ひらく", "N4", 1202440),
    ]


def test_a_row_naming_the_wrong_entry_is_looked_up_by_its_form(sample_dictionary):
    """The list says 間 read ま is entry 1215240, which reads it あいだ."""
    built = build([Row("N3", 1215240, "ま", "間")], sample_dictionary)

    assert [(word.reading, word.jmdict) for word in built.words] == [("ま", 1215250)]


def test_a_row_jmdict_cannot_answer_is_dropped_and_counted(sample_dictionary):
    built = build(
        [
            Row("N1", None, "ばつ", "罰"),
            Row("N1", 9999999, "ちみもうりょう", "魑魅魍魎"),
            Row("N5", 1179470, "えき", "駅"),
        ],
        sample_dictionary,
    )

    assert [word.term for word in built.words] == ["駅"]
    assert built.dropped == {
        "no JMdict entry named": 1,
        "JMdict has no entry for this spelling and reading": 1,
    }


def test_the_bundle_names_its_sources_and_counts_itself(sample_dictionary):
    built = build(
        [Row("N5", 1179470, "えき", "駅"), Row("N1", None, "ばつ", "罰")], sample_dictionary
    )

    bundle = json.loads(render(built, sample_dictionary))

    assert bundle["authority"] == starter.AUTHORITY
    assert bundle["sources"] == {
        "jmdict": {"created": "2026-10-09", "version": "JMdict 2026-10-09"},
        "jlpt_lists": {"repository": starter.LISTS_REPOSITORY, "commit": starter.LISTS_COMMIT},
    }
    assert bundle["counts"] == {"N5": 1, "N4": 0, "N3": 0, "N2": 0, "N1": 0}
    assert bundle["dropped"] == {"no JMdict entry named": 1}
    assert bundle["words"] == [
        {
            "term": "駅",
            "reading": "えき",
            "level": "N5",
            "part_of_speech": "noun",
            "meaning": "railway station; train station",
            "meanings": ["railway station", "train station"],
            "jmdict": 1179470,
        }
    ]


def test_the_bundle_in_the_repository_is_what_the_declaration_expects():
    """⚠️ The committed file, not the sample: every word carries a declared
    *level* under a declared *authority*, and the counts are the words'."""
    declaration = load_declaration()
    bundle = json.loads(starter.TARGET.read_text(encoding="utf-8"))

    assert bundle["authority"] in authority_keys(declaration)
    assert bundle["sources"]["jlpt_lists"]["commit"] == starter.LISTS_COMMIT
    levels = [word["level"] for word in bundle["words"]]
    assert set(levels) <= set(level_values(declaration))
    assert bundle["counts"] == {level: levels.count(level) for level in starter.LEVELS}
    assert all(word["meaning"] and word["part_of_speech"] and word["meanings"] for word in bundle["words"])
    keys = [(word["term"], word["reading"]) for word in bundle["words"]]
    assert len(keys) == len(set(keys))
