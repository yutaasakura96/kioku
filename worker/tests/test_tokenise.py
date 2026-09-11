"""Stage 2 — SudachiPy in C split mode (`03` §5.1, §3.4, ADR 0019).

⚠️ **No database and no Docker.** `11` §7 puts the pipeline in the group that
needs "neither a second session nor a container, but does need Python", and the
dictionary is the only thing these tests load.
"""

from __future__ import annotations

import resource
import sys

import pytest
from sudachipy import Dictionary

from pipeline.tokenise import DICTIONARY_VERSION, SPLIT_MODE, dictionary, tokenise


def test_c_mode_keeps_a_compound_whole() -> None:
    """`03` §5.1 stage 3: *Compounds survive: C mode keeps 図書館 whole.*

    ⚠️ This is the assertion that pins the **split mode**. In A mode 図書館 comes
    back as 図書/館, and two fragments reaching `normalized_form` is `03` §5.2's
    "a note about a word that does not exist" arriving from the other direction.
    """
    surfaces = [token.surface for token in tokenise("駅の近くに図書館があります。")]

    assert "図書館" in surfaces
    assert "図書" not in surfaces


def test_the_dictionary_accessor_hands_back_the_object_the_first_caller_built() -> None:
    """`03` §3.4. Identity, which is the cheap half of the guard.

    ⚠️ **It is not the whole guard, and on its own it is close to worthless** —
    it asserts that a memoised accessor memoises, which it cannot fail to do. The
    failure `03` §3.4 actually describes is a caller that constructs its own
    `Dictionary()` and never comes here at all, and that is what the next test is
    about.
    """
    assert dictionary() is dictionary()


def test_a_second_dictionary_costs_a_second_memory_mapping() -> None:
    """⚠️ **#8's criterion 9, and the reason the identity test above is not it:**
    *the dictionary is constructed once per process, guarded by a test that
    constructs it twice and measures memory.*

    This is the measurement that gives `03` §3.4 its teeth. Verification §7.3
    recorded 76 MB → 148 MB → 220 MB; measured again 2026-09-12 on macOS arm64
    with SudachiPy 0.6.11, from a **16 MB** baseline: 73.5 → 128.7 → 183.5 MB, so
    roughly **55 MB per additional mapping**. The absolute numbers are the
    machine's; what is asserted is the shape, which is the part that is true
    everywhere — *there is no caching between constructions*.

    ⚠️ **The accessor is warmed first, deliberately.** `ru_maxrss` is a
    high-water mark, so measuring it against a `dictionary()` that had not yet
    been built would charge the accessor for a mapping every caller shares.

    ⚠️ **This test leaves ~110 MB of mappings behind for the rest of the
    session.** That is the cost of asking the question at all, and it is why it
    is one test rather than a fixture.
    """
    dictionary()
    before = _max_rss_mb()

    first = Dictionary()
    first.create(mode=SPLIT_MODE).tokenize("図書館")
    second = Dictionary()
    second.create(mode=SPLIT_MODE).tokenize("図書館")

    assert first is not second
    # Two mappings at ~55 MB each; 20 MB is a floor loose enough to survive a
    # different machine and tight enough that "no extra memory" fails it.
    assert _max_rss_mb() - before > 20


def test_the_accessor_costs_nothing_the_second_time() -> None:
    """The other side of it: the singleton is what makes the cost above optional."""
    dictionary()
    before = _max_rss_mb()

    for _ in range(3):
        dictionary().create(mode=SPLIT_MODE).tokenize("図書館")

    assert _max_rss_mb() - before < 20


def test_a_morpheme_list_cannot_be_sliced() -> None:
    """⚠️ `03` §5.2's second finding, which `11` §7 names as a test: *any
    chunking, windowing or preview over morphemes iterates.*

    `pipeline.tokenise` already iterates once into plain dataclasses so nothing
    downstream can rediscover this — but the finding is about **SudachiPy**, and
    a recorded measurement that nothing asserts is a comment. Re-measured
    2026-09-12 against 0.6.11.
    """
    morphemes = dictionary().create(mode=SPLIT_MODE).tokenize("図書館があります")

    with pytest.raises(TypeError):
        morphemes[:2]

    # And the conversion this module performs is the answer to it.
    assert len(tokenise("図書館があります")[:2]) == 2


def _max_rss_mb() -> float:
    """⚠️ `ru_maxrss` is **bytes on macOS and kilobytes on Linux**, and nothing
    in the standard library normalises it. Both are developer machines for this
    project (ADR 0022's laptop, and the container it moves to), so both are
    handled rather than one assumed."""
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024


def test_the_dictionary_version_is_the_pinned_release() -> None:
    """PIN 2/6 (`03` §13.5), read from the installed package rather than typed.

    It is the second element of the generation cache key (`03` §5.3) and a
    column on both `ingestion` and `note_field_provenance` (`04` §5.4, §6.1), so
    a hard-coded copy here would be a second place for it to be wrong.
    """
    assert DICTIONARY_VERSION == "20260723"
