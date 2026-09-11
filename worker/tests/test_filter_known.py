"""Stage 5 — *Filter known and rejected* (`03` §5.1, `04` §7.2, `S5`, ADR 0006).

Pure. Groups and the reader's rejected set in, the work that is left out.

⚠️ **This is the stage `S5` is measured at**: the fiftieth *source* must ask
about fewer *notes* than the fifth, and ADR 0006 made rejection permanent so
that this shrinks as the corpus grows.
"""

from __future__ import annotations

from pipeline.deduplicate import Group
from pipeline.extract_candidates import Candidate
from pipeline.filter_known import filter_known


def group(term: str, *, note_id: str | None = None) -> Group:
    candidate = Candidate(
        term=term,
        reading=term,
        part_of_speech="名詞",
        surface_form=term,
        char_start=0,
        char_end=len(term),
        is_oov=False,
        identity_key=term + chr(31) + term,
    )
    return Group(
        identity_key=candidate.identity_key,
        candidate=candidate,
        sightings=(candidate,),
        note_id=note_id,
    )


NEW = group("図書館")
KNOWN = group("駅", note_id="note-1")
REJECTED = group("これ", note_id="note-2")


def test_a_word_the_corpus_has_never_seen_survives_to_generation() -> None:
    result = filter_known([NEW], rejected_keys=set())

    assert result.survivors == (NEW,)
    assert (result.already_known, result.rejected) == (0, 0)


def test_a_word_the_corpus_already_has_does_not_reach_generation() -> None:
    """ADR 0010's ordering, as a count. The *note* exists; generating it again
    would pay full price for a row that cannot be written (`04` §5.3's
    `UNIQUE (subject_id, identity_key)`).
    """
    result = filter_known([NEW, KNOWN], rejected_keys=set())

    assert result.survivors == (NEW,)
    assert (result.already_known, result.rejected) == (1, 0)


def test_a_rejected_word_is_dropped_before_stage_six() -> None:
    """`S5`, `04` §7.2 and `11` §7's stage-order test. *Saying no once means it* —
    a rejection is permanent (ADR 0006), and resurrecting the word on the next
    *source* would make vetting cost grow with corpus size rather than with new
    material, which is the shape that kills `S5`.
    """
    result = filter_known([NEW, REJECTED], rejected_keys={REJECTED.identity_key})

    assert result.survivors == (NEW,)
    assert (result.already_known, result.rejected) == (0, 1)


def test_a_rejected_word_is_counted_as_rejected_and_not_as_already_known() -> None:
    """⚠️ Every rejected key necessarily has a `note` behind it — `04` §7.2 keys
    the rejection on `note_id`. So both filters match, and `04` §6.1's four
    counters are only readable if each candidate is counted **once**. `03` §11
    shows the reader *which* filter removed the work; the two answers are not
    interchangeable.
    """
    result = filter_known([REJECTED], rejected_keys={REJECTED.identity_key})

    assert result.survivors == ()
    assert (result.already_known, result.rejected) == (0, 1)


def test_nothing_left_is_a_result_rather_than_an_error() -> None:
    """`03` §11: *Ingestion produced zero new notes* is **a success, not an
    error**, and the expected steady state as the corpus grows.
    """
    result = filter_known([KNOWN], rejected_keys=set())

    assert result.survivors == ()
    assert result.already_known == 1
