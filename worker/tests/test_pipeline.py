"""Stages 1 to 5 composed, with no database and no generator (`11` §7, §8).

⚠️ **This is `11` §7's stage-order test** — *stages 4 and 5 run before stage 6;
no generation call is made for a candidate already known or rejected* — and it
needs neither Docker nor a second session, because ADR 0010's ordering is a
property of the stages rather than of the SQL around them.
"""

from __future__ import annotations

from pathlib import Path

from dataclasses import dataclass, field
from typing import AbstractSet, Mapping

import pytest

from pipeline import (
    STAGE_RUNNERS,
    STAGES_RUN_ELSEWHERE,
    UnknownStage,
    check_pipelines,
    run_stages,
)
from pipeline.tokenise import DICTIONARY_VERSION
from subject import UnknownSourceKind, load_declaration, pipeline_kinds, stage_keys

DECLARATION = load_declaration()
SENTENCE = "駅の近くに図書館があります。図書館は六時に開く。"


@dataclass(frozen=True)
class FakeCorpus:
    """`pipeline.Corpus` over two dicts — the seam `11` §8 exists to make possible.

    ⚠️ **It narrows, exactly as the real one does.** Answering with everything it
    holds regardless of the keys asked for would let a stage that ignored the
    narrowing pass here and read the whole corpus in production.
    """

    notes: Mapping[str, str] = field(default_factory=dict)
    declined: AbstractSet[str] = frozenset()

    def known_notes(self, identity_keys):
        return {key: note for key, note in self.notes.items() if key in identity_keys}

    def rejected(self, identity_keys):
        return {key for key in self.declined if key in identity_keys}


def stages(*, known_keys=None, rejected_keys=frozenset(), char_start=0, kind="prose",
           text=SENTENCE):
    return run_stages(
        DECLARATION,
        text,
        kind=kind,
        char_start=char_start,
        corpus=FakeCorpus(notes=known_keys or {}, declined=rejected_keys),
    )


def key(term: str, reading: str) -> str:
    return term + chr(31) + reading


LIBRARY = key("図書館", "としょかん")
STATION = key("駅", "えき")


def test_a_stage_key_is_also_a_module_name() -> None:
    """`03` §10: *one module per stage, named by the declaration*, and
    `00-status.md` § Carrying keeps it as a trap worth naming.

    ⚠️ **All seven as of #9**, which is the assertion this one said it was
    waiting for: it asserted the first five while stages 6 and 7 had no module,
    and `generate.py` and `write_notes.py` are those modules. A stage added to
    the declaration with no module now fails here by name.

    ⚠️ **Since ADR 0063 it is per *source kind***, and both pipelines are
    asserted whole: the prose one is the seven `03` §5.1 has always named, and
    the word list runs `normalise` where prose runs `tokenise` and
    `extract_candidates`.
    """
    modules = {path.stem for path in (Path(__file__).parent.parent / "pipeline").glob("*.py")}

    for kind in pipeline_kinds(DECLARATION):
        # ⚠️ **Minus the stages somebody else runs.** `unpack` and `chunk` are
        # the app's (ADR 0068 §4) and have no module here on purpose;
        # `check_pipelines` is what asserts every key is one *or* the other.
        assert set(stage_keys(DECLARATION, kind)) - STAGES_RUN_ELSEWHERE <= modules, kind

    assert stage_keys(DECLARATION, "prose") == [
        "chunk",
        "tokenise",
        "extract_candidates",
        "deduplicate",
        "filter_known",
        "generate",
        "write_notes",
    ]
    assert stage_keys(DECLARATION, "word_list") == [
        "chunk",
        "normalise",
        "deduplicate",
        "filter_known",
        "generate",
        "write_notes",
    ]


def test_every_declared_stage_is_one_something_runs() -> None:
    """⚠️ #19's criterion in its own words: *a stage key that has no module is a
    startup failure, not a silent skip.* `worker/__main__.py` calls this before
    it claims anything.
    """
    check_pipelines(DECLARATION)

    for kind in pipeline_kinds(DECLARATION):
        for key in stage_keys(DECLARATION, kind):
            assert key in STAGE_RUNNERS or key in STAGES_RUN_ELSEWHERE, key


def test_a_stage_nobody_runs_stops_the_worker_by_name() -> None:
    """The sabotage, because a guard that a sabotage cannot reach is not a tested
    guard (`00-status.md` § Carrying). The message names the stage and the kind,
    which is the difference between this and a `KeyError` at dispatch.
    """
    sabotaged = {
        **DECLARATION,
        "pipelines": {**DECLARATION["pipelines"], "word_list": ["chunk", "lemmatise"]},
    }

    with pytest.raises(UnknownStage) as raised:
        check_pipelines(sabotaged)

    assert "lemmatise" in str(raised.value)
    assert "word_list" in str(raised.value)


def test_a_source_of_an_undeclared_kind_is_refused_by_name() -> None:
    """A row carrying a kind the declaration does not know must say so rather
    than run whatever pipeline happens to be first.

    ⚠️ **`anki` used to be that kind and is not since #26** (ADR 0068), so the
    case is reached with a declaration edited to drop a pipeline instead. ADR
    0063 had left the format and the licensing of shared decks to #24 and did
    not pre-decide it; #24's research and ADR 0068 closed both.
    """
    with pytest.raises(UnknownSourceKind) as raised:
        stages(kind="ebook")

    assert "ebook" in str(raised.value)


def test_a_deck_runs_the_word_list_stages_and_carries_the_deck_s_hints() -> None:
    """ADR 0068 §4 and §5: `anki` is `word_list` with `unpack` in front, and
    `unpack` has already run in the app by the time a worker sees the row.

    ⚠️ **The *identity key* is Sudachi's on both paths** — the deck's reading
    rides along as a hint and takes no part in it, so a deck that disagrees with
    the dictionary keys on the dictionary's (ADR 0068 §5, ADR 0063).
    """
    result = stages(
        kind="anki",
        text="\n".join(["図書館\tとしょかん\tJLPT_5", "あります\tありまス\tJLPT N5"]),
    )

    assert [group.candidate.term for group in result.survivors] == ["図書館", "有る"]
    assert [group.candidate.reading for group in result.survivors] == ["としょかん", "ある"]
    assert [group.candidate.deck_reading for group in result.survivors] == [
        "としょかん",
        "ありまス",
    ]
    assert [group.candidate.deck_hint for group in result.survivors] == ["JLPT_5", "JLPT N5"]
    # The *occurrence* covers the term's column and not the hints beside it.
    assert result.survivors[0].candidate.surface_form == "図書館"


def test_a_deck_s_word_that_is_already_a_note_is_not_regenerated() -> None:
    """#26's criterion: *a word that already has a note, including one of the 474
    cached pending ones, is not regenerated* (`filter_known`, ADR 0063 §4).

    ⚠️ **`S5` is what this is protecting** — the fiftieth *source* must ask about
    fewer *notes* than the fifth — and an import is the largest *source* the app
    has ever taken, so it is where the saving is worth the most. ⚠️ **The corpus
    is matched on Sudachi's key and not the deck's reading** (ADR 0068 §5): the
    deck below reads 図書館 as `としょかん` and the collision holds whatever the
    dictionary produced.
    """
    result = stages(
        kind="anki",
        text="\n".join(["図書館\tとしょかん\tJLPT_5", "駅\tえき\tJLPT_5"]),
        known_keys={LIBRARY: "note-1"},
    )

    assert [group.candidate.term for group in result.survivors] == ["駅"]
    assert [group.candidate.term for group in result.collisions] == ["図書館"]
    assert result.already_known == 1


def test_a_word_list_ignores_anything_after_a_tab() -> None:
    """ADR 0068 §5: the term is column 1 for every kind, and a `word_list` line
    carries no columns 2 and 3 to carry.

    ⚠️ **This is a change of behaviour for word lists.** Before #26 a tabbed
    line reached the tokeniser whole, was called two content words and was kept
    whole under ADR 0063's *kept, not dropped* clause. One rule on both paths is
    what stops them disagreeing about what a line is.
    """
    result = stages(kind="word_list", text="図書館\tlibrary")

    assert [group.candidate.term for group in result.survivors] == ["図書館"]
    assert result.survivors[0].candidate.deck_reading == ""
    assert result.survivors[0].candidate.surface_form == "図書館"


def test_a_word_list_runs_normalise_where_prose_runs_the_tokeniser() -> None:
    """ADR 0063's pipeline, end to end over the pure stages: one term per line,
    the dictionary form as the *term*, and ADR 0045's reading.

    ⚠️ **The same two sentences run as a word list produce something else
    entirely**, which is the point of dispatching on the kind rather than on the
    text: 図書館 twice is one *note* with two *occurrences* in prose, and two
    lines of a list are two sightings of one word for the same reason.
    """
    result = stages(kind="word_list", text="\n".join(["図書館", "あります", "開いた"]))

    assert [group.candidate.term for group in result.survivors] == [
        "図書館",
        "有る",
        "開く",
    ]
    assert [group.candidate.reading for group in result.survivors] == [
        "としょかん",
        "ある",
        "ひらく",
    ]
    assert result.extracted == 3


def test_a_word_list_deduplicates_and_filters_like_prose_does() -> None:
    """`deduplicate` and `filter_known` are *unchanged code* (ADR 0063), and this
    is what says so: the same word on two lines is one *note* and two
    *occurrences* (ADR 0006), and a term whose *note* already exists — including
    one of the 474 the first run paid for — costs nothing.
    """
    result = stages(
        kind="word_list",
        text="\n".join(["駅", "駅", "図書館"]),
        known_keys={LIBRARY: "note-1"},
    )

    assert [group.candidate.term for group in result.survivors] == ["駅"]
    assert result.extracted == 3
    assert result.deduplicated == 1
    assert result.already_known == 1
    collision = next(group for group in result.collisions if group.identity_key == LIBRARY)
    assert collision.note_id == "note-1"


def test_a_chunk_of_japanese_becomes_the_words_in_it() -> None:
    """The whole of stages 1 to 5 on two sentences, with an empty corpus.

    図書館 appears twice and is one *candidate* with two sightings; 六 is a
    numeral and is gone; の / に / は / 。 are not vocabulary (ADR 0044).
    """
    result = stages()

    assert [group.candidate.term for group in result.survivors] == [
        "駅",
        "近く",
        "図書館",
        "有る",
        "時",
        "開く",
    ]
    assert result.extracted == 7
    assert result.deduplicated == 1


def test_no_generation_is_asked_for_a_word_the_corpus_already_has() -> None:
    """⚠️ `11` §7's stage-order test, and ADR 0010's whole point: stages 4 and 5
    run **before** stage 6, so the money is never spent.
    """
    result = stages(known_keys={LIBRARY: "note-1", STATION: "note-2"})

    terms = [group.candidate.term for group in result.survivors]
    assert "図書館" not in terms
    assert "駅" not in terms
    assert result.already_known == 2


def test_no_generation_is_asked_for_a_word_the_reader_has_rejected() -> None:
    """`S5` — *saying no once means it* — and ADR 0006's permanence. The
    fiftieth *source* asks about fewer *notes* than the fifth because of this
    line.
    """
    result = stages(known_keys={LIBRARY: "note-1"}, rejected_keys={LIBRARY})

    assert "図書館" not in [group.candidate.term for group in result.survivors]
    assert (result.already_known, result.rejected) == (0, 1)


def test_a_collision_yields_the_occurrence_rather_than_the_note() -> None:
    """ADR 0006: the second sighting **appends an occurrence** and never produces
    a competing set of fields to reconcile. Both sightings of 図書館 are
    positions; none of them is a *note* to vet.
    """
    result = stages(known_keys={LIBRARY: "note-1"})

    collision = next(group for group in result.collisions if group.identity_key == LIBRARY)
    assert collision.note_id == "note-1"
    assert len(collision.sightings) == 2
    assert [sighting.char_start for sighting in collision.sightings] == [5, 14]


def test_a_rejected_word_still_records_where_it_appeared() -> None:
    """⚠️ ADR 0006 says *on a key match the second sighting appends an
    occurrence*, without an exception for a note the reader declined. An
    *occurrence* is **shared** data — a fact about the material (`04` §4) —
    while the rejection is a claim about the reader (ADR 0012). Dropping the
    position because of the rejection would confuse the two.
    """
    result = stages(known_keys={LIBRARY: "note-1"}, rejected_keys={LIBRARY})

    assert [group.identity_key for group in result.collisions] == [LIBRARY]


def test_the_chunk_offset_reaches_every_position() -> None:
    """`04` §5.5 stores positions within the *source*; a chunk that is not the
    first begins somewhere else, and the offset has to survive all five stages.
    """
    result = stages(char_start=1200)

    assert result.survivors[0].candidate.char_start == 1200


def test_the_result_names_the_dictionary_that_produced_it() -> None:
    """`03` §5.3's corrected cache key — *(content-chunk hash, **dictionary
    version**, prompt version, model id)*. A run has to be able to say which
    tokenisation its *candidates* came from, and `04` §6.1 has the column.
    """
    assert stages().dictionary_version == DICTIONARY_VERSION
