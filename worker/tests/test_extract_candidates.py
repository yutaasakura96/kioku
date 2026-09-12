"""Stage 3 — *Extract candidates* (`03` §5.1, §5.2, ADR 0006, ADR 0044).

Pure: tokens in, *candidates* out. `11` §8 names stages 2 to 5 as the seam, and
this is the stage where the two findings of `03` §5.2 land.
"""

from __future__ import annotations

from pipeline.extract_candidates import (
    CANDIDATE_PART_OF_SPEECH,
    NOT_VOCABULARY,
    extract_candidates,
)
from pipeline.tokenise import dictionary, tokenise
from subject import load_declaration

DECLARATION = load_declaration()
SEPARATOR = chr(31)


def candidates(text: str, *, char_start: int = 0):
    return extract_candidates(DECLARATION, tokenise(text), char_start=char_start)


def keys(text: str, *, char_start: int = 0) -> list[str]:
    return [candidate.identity_key for candidate in candidates(text, char_start=char_start)]


def test_a_compound_is_one_candidate_carrying_its_reading() -> None:
    """`04` §5.3's worked example, produced rather than seeded.

    The key the schema tier inserts by hand — `図書館␟としょかん` — is what this
    stage has to render from a real tokenisation, or the two tiers describe
    different notes.
    """
    extracted = candidates("図書館")

    assert len(extracted) == 1
    assert extracted[0].term == "図書館"
    assert extracted[0].reading == "としょかん"
    assert extracted[0].part_of_speech == "名詞"
    assert extracted[0].identity_key == "図書館" + SEPARATOR + "としょかん"


def test_particles_and_punctuation_are_not_vocabulary() -> None:
    """ADR 0044. A *note* per は and per 。 is not a deck, and `S3`'s five-second
    median is spent on words rather than on saying no to grammar.
    """
    surfaces = [candidate.surface_form for candidate in candidates("駅の近くに図書館があります。")]

    assert "図書館" in surfaces
    assert "の" not in surfaces
    assert "に" not in surfaces
    assert "。" not in surfaces


def test_a_numeral_is_excluded_before_it_reaches_the_identity_key() -> None:
    """⚠️ `03` §5.2's first finding, and `04` §5.3's *numerals never reach this
    column*.

    六 comes back `is_oov=True` with `normalized_form` rewritten to `6`
    (re-measured 2026-09-11). `normalized_form` is the term half of ADR 0006's
    key, so without this rule a numeral-heavy *source* keys strangely and —
    worse — keys *consistently* strangely, which is how it survives review.
    """
    assert keys("六時に開く。") == [
        "時" + SEPARATOR + "じ",
        "開く" + SEPARATOR + "ひらく",
    ]
    assert all("6" not in key for key in keys("六時に開く。"))


def test_a_numeral_already_written_in_ascii_is_excluded_too() -> None:
    """`6` tokenises `is_oov=False` with `normalized_form` already `6`, so the
    out-of-vocabulary flag alone would let it through. A *note* whose term is a
    digit is not vocabulary either way — ADR 0044 excludes the **part of
    speech**, and the flag is the second clause rather than the first.
    """
    assert keys("6時") == ["時" + SEPARATOR + "じ"]


def test_the_out_of_vocabulary_flag_reaches_the_candidate() -> None:
    """⚠️ `03` §5.2: *the flag is read twice for two reasons*. The numeral rule is
    one; the other is *provenance* — `04` §5.4 keeps `is_oov` on the row because
    it is what distinguishes a looked-up reading from a generated one (ADR 0019).
    A stage that consumed the flag and dropped it would leave #9 nothing to
    write.
    """
    assert [candidate.is_oov for candidate in candidates("図書館")] == [False]


def test_orthographic_variants_collapse_to_one_identity_key() -> None:
    """ADR 0006, and the reason the term half is `normalized_form`.

    引っ越し / 引越し / 引越 are one word written three ways (measured
    2026-09-11): `normalized_form` collapses all three, `dictionary_form` returns
    each surface unchanged. Keyed on the lemma alone this is three *notes* about
    one word, which is the failure ADR 0006 exists to prevent.
    """
    assert keys("引っ越し") == keys("引越し") == keys("引越")


def test_offsets_are_positions_within_the_source_not_within_the_chunk() -> None:
    """`04` §5.5: `occurrence.char_start` is *a position within the source*.

    ⚠️ The tokeniser's offsets are relative to the text it was handed, so the
    *chunk*'s own `char_start` has to be added here — the one place it can be.
    A chunk boundary is not zero for any chunk but the first, and an *occurrence*
    pointing at the wrong span is only discoverable by eye, months later.
    """
    first = candidates("図書館", char_start=0)[0]
    later = candidates("図書館", char_start=1200)[0]

    assert (first.char_start, first.char_end) == (0, 3)
    assert (later.char_start, later.char_end) == (1200, 1203)


def test_the_surface_form_is_kept_as_it_appeared() -> None:
    """`04` §5.5's column, and the honest half of a collapsed key: the *note* is
    about 引っ越し, and this *occurrence* says the *source* wrote 引越.
    """
    extracted = candidates("引越")

    assert extracted[0].surface_form == "引越"
    assert extracted[0].term == "引っ越し"


def test_every_part_of_speech_the_dictionary_declares_is_classified() -> None:
    """⚠️ ADR 0044's guard, and the thing a `SudachiDict` bump would break silently.

    The allowlist is *closed* — a part of speech that is in neither set is
    excluded by default, which is the safe direction but also the quiet one. This
    asserts the two sets between them cover **every** pair the installed
    dictionary actually declares, so a release that adds a category fails here
    with its name rather than dropping a word class without comment.
    """
    declared = set()
    dictionary().pos_matcher(lambda pos: declared.add((pos[0], pos[1])) or False)

    assert declared - (CANDIDATE_PART_OF_SPEECH | NOT_VOCABULARY) == set()
    assert CANDIDATE_PART_OF_SPEECH & NOT_VOCABULARY == set()


def test_a_word_written_in_katakana_keeps_its_katakana_reading() -> None:
    """⚠️ ADR 0045. A mechanical katakana→hiragana conversion gives コーヒー the
    reading こーひー, and **the reading is a field the reader sees** — the
    declaration makes it a `lookup` field and `10` §5 puts it on the answer side
    of the recognition *template*. So it would be wrong on a card, not merely odd
    in a column.
    """
    coffee = candidates("コーヒーを飲む")[0]

    assert (coffee.term, coffee.reading) == ("コーヒー", "コーヒー")


def test_a_word_written_with_kanji_still_reads_in_hiragana() -> None:
    """The other half, and the one `04` §5.3's worked examples are all of.

    ⚠️ ひらがな is the sharp case: its *normalized form* is 平仮名 — kanji — so the
    rule looks at the term rather than at the surface, and the reading comes back
    ひらがな rather than ヒラガナ.
    """
    assert [c.reading for c in candidates("ひらがな")] == ["ひらがな"]
    assert [c.term for c in candidates("ひらがな")] == ["平仮名"]


def test_a_mixed_term_is_not_a_katakana_word() -> None:
    """パン屋 is katakana and a kanji, so it takes the hiragana reading. The rule
    is *wholly* katakana, because a half-converted reading is the worst of both.
    """
    bakery = candidates("パン屋")[0]

    assert (bakery.term, bakery.reading) == ("パン屋", "ぱんや")


def test_an_inflected_verb_keys_on_the_reading_of_its_dictionary_form() -> None:
    """⚠️ [#15](https://github.com/yutaasakura96/kioku/issues/15) — the reading
    half of ADR 0006's key was the **surface**'s, so あります keyed `有る␟あり`
    beside ある's `有る␟ある`: one word, two *notes*, which is the failure ADR 0006
    exists to prevent arriving through the half the `normalized_form` finding did
    not cover.

    ⚠️ **And it is worse than a key problem.** The declaration makes `reading` a
    `lookup` field and `10` §5 puts it on the answer side of the recognition
    *template*, so the first *card* minted from あります showed あり.
    """
    assert keys("本があります。") == keys("本がある。") == ["本" + SEPARATOR + "ほん", "有る" + SEPARATOR + "ある"]


def test_the_inflected_and_the_plain_form_of_a_verb_are_one_note() -> None:
    """ADR 0045 § Amended 2026-09-13, through the key rather than the field.

    ⚠️ **The criterion this replaces asked for `開く␟あく`, and it is not
    reachable.** The あく entries are in the lexicon and the analyser never
    selects them — 48 of 48 resolved to ヒラク across sixteen forcing sentences
    and all three split modes. `04` §5.3's `開く␟ひらく` / `開く␟あく` pair is a
    worked example of the key's *shape*; the pair this pipeline actually produced
    was `開く␟ひらく` and `開く␟ひらい`, and the second one was the defect.
    """
    opens = "開く" + SEPARATOR + "ひらく"

    assert opens in keys("ドアが開いた。")
    assert opens in keys("図書館は六時に開く。")
    assert "開く" + SEPARATOR + "ひらい" not in keys("ドアが開いた。")


def test_an_inflected_suru_reads_suru_and_never_naru() -> None:
    """⚠️ **The case that chose the rule** (ADR 0045 § Amended 2026-09-13). #15
    preferred re-tokenising `normalized_form`, and し's `normalized_form` is 為る,
    which tokenised alone reads ナル. The *note* is about する; a card that reads
    なる is about a different word.
    """
    studied = [candidate for candidate in candidates("勉強します。") if candidate.term == "為る"]

    assert [candidate.reading for candidate in studied] == ["する"]


def test_an_i_adjective_keys_on_its_dictionary_form_s_reading_too() -> None:
    """形容詞 is the other large inflecting class, and 高かっ / 高い is the same
    defect as あり / ある with a different part of speech."""
    assert keys("高かった") == keys("高い") == ["高い" + SEPARATOR + "たかい"]


def test_the_script_rule_still_runs_on_a_term_the_new_rule_rewrote() -> None:
    """⚠️ **ADR 0045's script rule is unchanged and applies on top of the new
    one** — *wholly katakana keeps, everything else converts, tested on the
    term*. サボっ is inflected, so the reading comes from サボる rather than from
    the surface; サボる is **not** wholly katakana — the okurigana る is not — so
    it converts, and the reading is さぼる rather than さぼっ.

    ⚠️ **The two rules do not otherwise meet, and that is worth saying once.** A
    word wholly in katakana has no okurigana to inflect, so the katakana branch
    and the inflected branch are disjoint in practice; this is as close as they
    come.
    """
    skipped = [candidate for candidate in candidates("授業をサボった。") if candidate.term == "サボる"]

    assert [candidate.reading for candidate in skipped] == ["さぼる"]
