"""Stage 2 — SudachiPy in C split mode (`03` §5.1, §3.4, ADR 0019).

⚠️ **No database and no Docker.** `11` §7 puts the pipeline in the group that
needs "neither a second session nor a container, but does need Python", and the
dictionary is the only thing these tests load.
"""

from __future__ import annotations

import resource
import sys
import warnings

import pytest
from sudachipy import Dictionary

from pipeline.tokenise import DICTIONARY_VERSION, SPLIT_MODE, Token, dictionary, tokenise


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


def test_an_inflected_surface_carries_its_dictionary_form_s_reading() -> None:
    """⚠️ [#15](https://github.com/yutaasakura96/kioku/issues/15), and
    [ADR 0045](../../docs/adr/0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md)
    § Amended 2026-09-13 is the rule: *when the surface is inflected, the reading
    is the dictionary form's*.

    ⚠️ **It is stage 2's to compute because it needs the dictionary**, which
    stage 3 does not have and must not acquire (`11` §8). あり's own
    `reading_form` is アリ; ある — its `dictionary_form`, re-tokenised — is アル,
    and that is what the *identity key* and the *card* get.
    """
    inflected = _token("本があります。", "あり")
    uninflected = _token("本がある。", "ある")

    assert (inflected.reading_form, inflected.dictionary_form_reading) == ("アリ", "アル")
    assert (uninflected.reading_form, uninflected.dictionary_form_reading) == ("アル", None)


def test_an_uninflected_token_is_left_with_the_reading_it_had_in_context() -> None:
    """⚠️ **The guard is load-bearing, not an optimisation** (ADR 0045 § Amended
    2026-09-13). 六時's 時 is its own dictionary form and reads ジ where it
    stands; the same 時 tokenised alone reads トキ. A rule that re-read every
    token would break the words it was not aimed at, so the second assertion
    here is the measurement rather than the behaviour — it is why the first one
    has to be `None`.
    """
    hour = _token("図書館は六時に開く。", "時")

    assert (hour.reading_form, hour.dictionary_form_reading) == ("ジ", None)
    assert tokenise("時")[0].reading_form == "トキ"


def test_the_dictionary_form_is_re_tokenised_and_the_normalized_form_is_not() -> None:
    """⚠️ **The case that ranked the three candidate rules, and reversed #15's
    own preference.** し normalises to 為る, and 為る tokenised alone reads ナル —
    so re-tokenising `normalized_form` gives one of the commonest verbs in the
    language the reading of a different one. `dictionary_form` is する and reads
    スル (ADR 0045 § Amended 2026-09-13, rule C over rule A).
    """
    suru = _token("勉強します。", "し")

    assert (suru.normalized_form, suru.dictionary_form) == ("為る", "する")
    assert suru.dictionary_form_reading == "スル"
    assert tokenise("為る")[0].reading_form == "ナル"


def test_an_i_adjective_inflects_too_and_is_covered_by_the_same_test() -> None:
    """`04` §5.3's key is *one per word*, and 形容詞 is the other large inflecting
    class — 高かっ is as much a *note* about 高い as 開い is about 開く.
    """
    tall = _token("高かった", "高かっ")

    assert (tall.reading_form, tall.dictionary_form_reading) == ("タカカッ", "タカイ")


def test_re_tokenising_costs_no_deprecated_accessor() -> None:
    """⚠️ **#15's criterion, and the whole reason rule C won over rule B.** B
    reaches the lemma through `WordInfo.dictionary_form_word_id`, and SudachiPy
    0.6.11 answers that accessor with `DeprecationWarning: Users should not touch
    the raw WordInfo`. The rule adopted reads `dictionary_form`, which is public
    and warns about nothing.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("error", DeprecationWarning)

        assert tokenise("ドアが開いた。")


def test_the_re_tokenised_reading_is_present_exactly_when_the_surface_inflected() -> None:
    """The invariant stage 3 selects on: `dictionary_form_reading` is not `None`
    if and only if `surface != dictionary_form`.

    ⚠️ Asserted over a whole sentence rather than a chosen token, because the
    field is the one thing stage 3 cannot recompute — it has no dictionary — and
    a stage 2 that filled it in for uninflected tokens would silently hand 時 the
    reading トキ.
    """
    for token in tokenise("図書館は六時に開く。ドアが開いた。本があります。"):
        assert (token.dictionary_form_reading is not None) == (
            token.surface != token.dictionary_form
        )


def _token(text: str, surface: str) -> Token:
    """The one morpheme of `text` whose surface is `surface` — so a test can name
    the word it is about rather than an index into a sentence."""
    return next(token for token in tokenise(text) if token.surface == surface)
