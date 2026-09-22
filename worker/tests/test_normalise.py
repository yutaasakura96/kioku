"""The `normalise` stage — ADR 0063, ADR 0045, ADR 0006.

The word-list pipeline's replacement for `tokenise` and `extract_candidates`.
One line is one term, so what is left to do is the dictionary's: the term half of
ADR 0006's *identity key* and the script its reading is written in.

⚠️ **These tests load the dictionary**, which the rest of `11` §8's pure-stage
tests deliberately do not (`test_extract_candidates.py` builds `Token`s by hand).
They have to: the whole subject of this stage is what SudachiPy answers for a
word standing alone, and a hand-built token would be this file asserting its own
expectations. It is the same bargain `test_tokenise.py` already makes.
"""

from __future__ import annotations

import pytest

from pipeline.normalise import normalise
from subject import load_declaration, render_identity_key

DECLARATION = load_declaration()


def terms(text: str, *, char_start: int = 0):
    return normalise(DECLARATION, text, char_start=char_start)


def one(line: str):
    found = terms(line)
    assert len(found) == 1, found
    return found[0]


class TestOneLineIsOneTerm:
    def test_an_inflected_entry_gets_its_dictionary_form_and_that_reading(self):
        """ADR 0063: *a reader who types an inflected form gets the dictionary
        form, and the identity key is what it has always been.*

        ⚠️ **The reading is the lemma's, not the surface's** (ADR 0045 § Amended
        2026-09-13, #15). あり's own `reading_form` is アリ; reading the surface
        would key あります as `有る␟あり` beside ある's `有る␟ある` — one word, two
        *notes* — and put あり on the answer side of the *card*. That defect was
        found in prose and fixed in `tokenise`/`extract_candidates`, and this
        stage gets the fix by importing `reading_of` rather than by repeating it.
        """
        candidate = one("あります")

        assert (candidate.term, candidate.reading) == ("有る", "ある")
        assert candidate.identity_key == render_identity_key(
            DECLARATION, {"term": "有る", "reading": "ある"}
        )
        # And the same word written plainly keys identically — which is the whole
        # of what ADR 0006 asks of this stage.
        assert one("ある").identity_key == candidate.identity_key

    def test_a_katakana_entry_keeps_its_katakana_reading(self):
        """ADR 0045: コーヒー's reading is コーヒー, not こーひー.

        ⚠️ **The reading is a field the reader sees**, not only half of a key
        (`10` §5 puts it on the answer side of the recognition *template*), which
        is why a mechanical katakana→hiragana conversion is wrong here rather
        than merely odd.
        """
        candidate = one("コーヒー")

        assert (candidate.term, candidate.reading) == ("コーヒー", "コーヒー")
        assert candidate.is_oov is False

    def test_a_kana_only_entry_is_read_through_its_normalised_form(self):
        """ひらがな is the case that proves the rule looks at the **term** rather
        than at the surface: its `normalized_form` is 平仮名, which is not
        katakana, so the reading is written in hiragana (ADR 0045).
        """
        candidate = one("ひらがな")

        assert (candidate.term, candidate.reading) == ("平仮名", "ひらがな")

    def test_orthographic_variants_collapse_the_way_they_do_in_prose(self):
        """`normalized_form` is the term half of the key and not
        `dictionary_form` (`03` §16, § Carrying): 引越し and 引越 are one *note*.
        """
        assert one("引越し").identity_key == one("引越").identity_key


class TestALineSudachiCannotResolve:
    """⚠️ ADR 0063: *a line Sudachi cannot resolve is kept, not dropped.*

    It goes to the model with an empty reading and `is_oov` set, and stage 6
    writes the reading with *provenance* `generated` rather than `lookup`. A list
    of tech loanwords is going to contain words the 2026 dictionary has never
    seen, and refusing them would refuse the ones this app exists for.
    """

    def test_an_unknown_word_is_kept_with_an_empty_reading(self):
        candidate = one("コンテナオーケストレーション")

        assert candidate.term == "コンテナオーケストレーション"
        assert candidate.reading == ""
        assert candidate.is_oov is True

    def test_a_latin_term_is_kept_too(self):
        candidate = one("kubectl")

        assert (candidate.term, candidate.reading, candidate.is_oov) == (
            "kubectl",
            "",
            True,
        )

    def test_a_numeral_is_kept_as_written_and_never_as_a_digit(self):
        """⚠️ **`normalized_form` rewrites 六 to `6`** (`03` §5.2), and `04` §5.3
        says numerals never reach `identity_key`. In prose ADR 0044's allowlist
        drops them; a word list cannot drop a line the reader chose, so the line
        is kept **unresolved** instead — which is the only answer that neither
        loses the reader's word nor writes a digit where a word should be.
        """
        candidate = one("六")

        assert candidate.term == "六"
        assert candidate.is_oov is True

    def test_a_line_holding_two_words_is_kept_whole(self):
        """⚠️ Taking the head and discarding the rest would be a silent half
        answer — a *note* about 新しい for a reader who asked about 新しい本. C
        split mode keeps a real word whole (`03` §5.1), so a second word in ADR
        0044's allowlist means the line held two of them.
        """
        candidate = one("新しい本")

        assert candidate.term == "新しい本"
        assert candidate.is_oov is True


class TestPositions:
    """`04` §5.5 stores positions **within the source**, and this stage is one of
    the two places the *chunk*'s own offset is reconciled with them.
    """

    def test_every_line_is_positioned_within_the_source(self):
        found = terms("駅\n図書館\n開く", char_start=1200)

        assert [(c.char_start, c.char_end) for c in found] == [
            (1200, 1201),
            (1202, 1205),
            (1206, 1208),
        ]

    def test_padding_is_not_part_of_the_term_or_of_its_span(self):
        found = terms("  駅  \n　図書館")

        assert [c.surface_form for c in found] == ["駅", "図書館"]
        assert [(c.char_start, c.char_end) for c in found] == [(2, 3), (7, 10)]

    def test_blank_lines_are_not_terms(self):
        """⚠️ **And they are skipped by the class both languages agree about**,
        not by `str.strip()` — `shared/ingest/chunk.ts` counts the terms in this
        same text to decide where the *chunk* ends, and the two definitions
        differ on six characters (`00-status.md` § Carrying).
        """
        found = terms("駅\n\n   \n﻿\n図書館")

        assert [c.term for c in found] == ["駅", "図書館"]

    def test_a_line_of_only_the_identity_key_separator_is_blank(self):
        """⚠️ `U+001F` is the character `04` §5.3 joins the *identity key* with,
        and it is the one Python's own `str.strip()` removes and JavaScript's
        `trim()` does not. A line made of it is blank on both sides here.
        """
        assert terms(chr(31)) == []


class TestTheSameTermTwice:
    def test_two_lines_of_one_word_share_an_identity_key(self):
        """ADR 0006: the second sighting is an *occurrence*, not a second *note*
        — and stage 4 is what folds them, from the key this stage renders.
        """
        found = terms("駅\n駅")

        assert len(found) == 2
        assert found[0].identity_key == found[1].identity_key
        assert [(c.char_start, c.char_end) for c in found] == [(0, 1), (2, 3)]


@pytest.mark.parametrize("text", ["", "\n", "   \n  "])
def test_nothing_in_means_nothing_out(text: str) -> None:
    assert terms(text) == []


class TestSuruVerbs:
    """⚠️ **A noun with する on the end is the noun** — ADR 0006, measured
    2026-09-16.

    C split mode gives 勉強する two morphemes, and ADR 0044's allowlist contains
    `動詞,非自立可能` on purpose (ある / いる / くる are words in their own
    right) — so the plain *two content words* rule called this a phrase and kept
    it whole. A word list holding 勉強する would then have minted a **second
    note** beside the 勉強 a prose *source* had already produced: one word, two
    *notes*, keyed apart, which is the failure ADR 0006 exists to prevent.
    """

    def test_a_suru_noun_keys_the_same_as_the_noun_alone(self):
        assert one("勉強する").identity_key == one("勉強").identity_key
        assert (one("勉強する").term, one("勉強する").reading) == ("勉強", "べんきょう")

    def test_it_holds_through_the_inflected_forms_too(self):
        """勉強しました is 勉強 + し + まし + た, and し normalises to 為る as
        する does — the lemma would not have told them apart, because
        `dictionary_form` is する for both.
        """
        assert one("勉強しました").identity_key == one("勉強").identity_key

    def test_a_katakana_suru_noun_behaves_the_same(self):
        candidate = one("デザインする")

        assert (candidate.term, candidate.reading) == ("デザイン", "デザイン")

    def test_an_orthographic_variant_still_collapses_under_it(self):
        assert one("引っ越しする").identity_key == one("引越").identity_key

    def test_a_phrase_is_still_kept_whole(self):
        """⚠️ **The guard is narrow on both sides.** 気 is `名詞,普通名詞,一般`
        rather than `サ変可能` and つける does not normalise to 為る, so this is
        two words and stays unresolved — a phrase the reader chose, not a noun
        with する on the end.
        """
        candidate = one("気をつける")

        assert candidate.term == "気をつける"
        assert candidate.is_oov is True

    def test_a_compound_verb_is_still_kept_whole(self):
        """持ってくる is 持っ + て + くる: くる is `動詞,非自立可能` like する, but
        the head is `動詞,一般` and not `サ変可能`, so the exception does not
        reach it. Resolving it would silently answer 持つ.
        """
        candidate = one("持ってくる")

        assert candidate.term == "持ってくる"
        assert candidate.is_oov is True


def deck(line: str):
    found = normalise(DECLARATION, line, char_start=0, kind="anki")
    assert len(found) == 1, found
    return found[0]


class TestAnAnkiLineIsTheDecksWord:
    """ADR 0068 § Amended 2026-09-22, #35: **trust the deck.**

    ⚠️ **Every line below was a different word before #35.** The first real
    import (Open Anki N3) had 145 of its 2,140 terms rewritten by the head-word
    rule and 125 readings replaced by Sudachi's, and `generate` refused the whole
    paid *chunk* the first time the model answered for the deck's word instead.
    """

    @pytest.mark.parametrize(
        ("line", "term", "reading"),
        [
            # The head-word rule cut these to 直, 上 and 成る.
            ("直に\tじかに\tJLPT_3", "直に", "じかに"),
            ("上等\tじょうとう\tJLPT_3", "上等", "じょうとう"),
            ("為る\tする\tJLPT_3", "為る", "する"),
            # Sudachi reads these かく and し — a different word each.
            ("角\tすみ\tJLPT_3", "角", "すみ"),
            ("市\tいち\tJLPT_3", "市", "いち"),
        ],
    )
    def test_the_term_and_reading_are_the_deck_s_columns(self, line, term, reading):
        candidate = deck(line)

        assert (candidate.term, candidate.reading) == (term, reading)
        assert candidate.identity_key == render_identity_key(
            DECLARATION, {"term": term, "reading": reading}
        )

    def test_a_katakana_term_keeps_a_katakana_reading(self):
        """ADR 0045's script rule applies on top of the deck's reading."""
        assert (deck("ジーンズ\tジーンズ").term, deck("ジーンズ\tジーンズ").reading) == (
            "ジーンズ",
            "ジーンズ",
        )

    def test_the_script_rule_rewrites_a_deck_that_wrote_the_other_script(self):
        """A deck writing ジーンズ's reading in hiragana, or 図書館's in katakana,
        still keys the way ADR 0045 says — or the same word keys twice."""
        assert deck("ジーンズ\tじーんず").reading == "ジーンズ"
        assert deck("図書館\tトショカン").reading == "としょかん"

    def test_is_oov_stays_the_tokeniser_s_signal(self):
        """ADR 0019: `write_notes` stamps `is_oov` on every looked-up field, the
        term among them, so a deck's reading does not set it — only a term
        Sudachi has never heard of does."""
        candidate = deck("角\tすみ")

        assert candidate.is_oov is False
        # Consumed as the reading, so it is not also carried as a hint.
        assert candidate.deck_reading == ""

    def test_a_reading_column_that_is_not_kana_asks_the_model(self):
        """すみません is すみ + ませ + ん to Sudachi — three tokens, so there is no
        dictionary reading **of the deck's word** to fall back on, and the model
        is asked with `reading=?`. ⚠️ The head's reading (すむ) would key a
        different word, which is the failure #35 is about."""
        candidate = deck("すみません\tすみません (かん)\tJLPT_3")

        assert (candidate.term, candidate.reading) == ("すみません", "")
        assert candidate.is_oov is True
        assert candidate.deck_reading == "すみません (かん)"

    def test_a_reading_column_that_is_not_kana_falls_back_to_the_dictionary(self):
        """来 is one token Sudachi knows, so its reading is the dictionary's for
        exactly the deck's word, and the deck's column rides along as a hint.

        ⚠️ **The dictionary reads 来 alone as き, not the deck's らい** (measured
        2026-09-22, `SudachiDict-core` 20260723). That is the fallback ADR 0068's
        amendment chose, and this asserts it rather than hiding it: an affix
        entry like `らい～` gets a dictionary reading that is not the affix's."""
        candidate = deck("来\tらい～\tJLPT_3")

        assert (candidate.term, candidate.reading) == ("来", "き")
        assert candidate.is_oov is False
        assert candidate.deck_reading == "らい～"

    def test_an_empty_reading_column_falls_back_the_same_way(self):
        assert (deck("会議\t\tJLPT_3").term, deck("会議\t\tJLPT_3").reading) == ("会議", "かいぎ")
        assert deck("すみません").reading == ""

    def test_the_span_and_hint_behave_as_before(self):
        candidate = normalise(DECLARATION, "x\n  直に \tじかに\tJLPT_3", char_start=10, kind="anki")[1]

        assert candidate.surface_form == "直に"
        assert (candidate.char_start, candidate.char_end) == (14, 16)
        assert candidate.deck_hint == "JLPT_3"

    def test_a_word_list_line_is_untouched(self):
        """The same lines typed as a word list still resolve — §5 stands for
        `word_list`."""
        assert one("直に").term == "直"
        assert one("角").reading == "かく"
