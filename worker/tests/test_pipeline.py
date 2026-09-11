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

from pipeline import run_stages
from pipeline.tokenise import DICTIONARY_VERSION
from subject import load_declaration, stage_keys

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


def stages(*, known_keys=None, rejected_keys=frozenset(), char_start=0):
    return run_stages(
        DECLARATION,
        SENTENCE,
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
    and `generate.py` and `write_pending.py` are those modules. A `stages` entry
    added to the declaration with no module now fails here by name.
    """
    declared = stage_keys(DECLARATION)
    modules = {path.stem for path in (Path(__file__).parent.parent / "pipeline").glob("*.py")}

    assert set(declared) <= modules
    assert declared == [
        "chunk",
        "tokenise",
        "extract_candidates",
        "deduplicate",
        "filter_known",
        "generate",
        "write_pending",
    ]


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
