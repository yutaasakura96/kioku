"""Stage 4 — *Deduplicate against the corpus* (`03` §5.1, ADR 0006, ADR 0010).

Pure, and deliberately fed hand-built *candidates* rather than a tokenisation:
the behaviour under test is the folding and the corpus lookup, and a test that
had to tokenise first would fail for two reasons at once.
"""

from __future__ import annotations

from pipeline.deduplicate import deduplicate
from pipeline.extract_candidates import Candidate


def candidate(term: str, reading: str, *, at: int) -> Candidate:
    return Candidate(
        term=term,
        reading=reading,
        part_of_speech="名詞",
        surface_form=term,
        char_start=at,
        char_end=at + len(term),
        is_oov=False,
        identity_key=term + chr(31) + reading,
    )


LIBRARY = candidate("図書館", "としょかん", at=10)
LIBRARY_AGAIN = candidate("図書館", "としょかん", at=400)
STATION = candidate("駅", "えき", at=0)


def test_a_repeated_word_is_one_group_carrying_both_sightings() -> None:
    """ADR 0006: a collision *appends an occurrence* and never produces a second
    note. Both sightings survive as positions; only one of them is a thing to
    generate.
    """
    result = deduplicate([LIBRARY, STATION, LIBRARY_AGAIN], known_keys={})

    assert [group.identity_key for group in result.groups] == [
        LIBRARY.identity_key,
        STATION.identity_key,
    ]
    assert result.groups[0].sightings == (LIBRARY, LIBRARY_AGAIN)
    assert result.groups[1].sightings == (STATION,)


def test_groups_keep_the_order_of_first_sighting() -> None:
    """The reader vets in the order the *source* introduced the words, which is
    the only order that makes the queue feel like the document (`09` §5).
    """
    result = deduplicate([LIBRARY_AGAIN, STATION, LIBRARY], known_keys={})

    assert [group.candidate for group in result.groups] == [LIBRARY_AGAIN, STATION]


def test_the_counters_are_sightings_in_and_sightings_folded() -> None:
    """`04` §6.1's `candidates_extracted` and `candidates_deduplicated`, which
    `03` §11 puts in front of the reader as *how many were filtered, and by
    which filter*.
    """
    result = deduplicate([LIBRARY, STATION, LIBRARY_AGAIN], known_keys={})

    assert result.extracted == 3
    assert result.deduplicated == 1


def test_a_candidate_the_corpus_already_has_carries_its_note_id() -> None:
    """`04` §12's second query — *does (subject_id, identity_key) exist? Once per
    candidate, in the worker, **before any spend***.

    ⚠️ The group is not dropped here. Stage 4 answers *which note is this*;
    stage 5 is what removes it from the work. Dropping it here would also throw
    away the *occurrence* ADR 0006 requires.
    """
    result = deduplicate([LIBRARY, STATION], known_keys={LIBRARY.identity_key: "note-1"})

    assert result.groups[0].note_id == "note-1"
    assert result.groups[1].note_id is None


def test_an_empty_chunk_deduplicates_to_nothing_rather_than_raising() -> None:
    """A *chunk* of pure punctuation extracts no candidates, and `03` §11 calls a
    run that produced no new notes **a success, not an error**.
    """
    result = deduplicate([], known_keys={})

    assert result.groups == ()
    assert (result.extracted, result.deduplicated) == (0, 0)
