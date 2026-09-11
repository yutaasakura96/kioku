"""Stage 3 — *Extract candidates* (`03` §5.1, §5.2, ADR 0006, ADR 0044).

Pure. Tokens in, *candidates* out: no dictionary, no database, no clock. `11` §8
names stages 2 to 5 as the seam, and this is the one where both of `03` §5.2's
findings have to be answered.

⚠️ **The term half of ADR 0006's *identity key* is `normalized_form`**, not
`dictionary_form`. `03` §16 says so in as many words — *keys a note on
(dictionary-form term, reading) via `normalized_form`* — and ADR 0019's table
gives the reason: it is the only one of the three forms that collapses
orthographic variants. Measured 2026-09-11: 引越し and 引越 both normalise to
引っ越し while `dictionary_form` returns each surface unchanged, and ひらいた
normalises to 開く where `dictionary_form` stops at ひらく. Keyed on the lemma
alone, one word becomes three *notes* — the failure ADR 0006 exists to prevent.

⚠️ **And that is exactly why the numeral rule is not optional.** The same
`normalized_form` rewrites 六 to `6` (`03` §5.2), so the field that earns its
place in the key is also the field that puts a digit there.
"""

from __future__ import annotations

from dataclasses import dataclass

from subject import Declaration, render_identity_key

from .tokenise import Token

#: ⚠️ **The allowlist is ADR 0044 and it is a decision, not a default.** No
#: document names the parts of speech a *candidate* may have; `03` §5.1 names the
#: stage and `04` §6.1's worked example implies heavy filtering (214 extracted
#: from a document). The line drawn here is *content words*: the classes a
#: learner would call vocabulary.
#:
#: Pairs rather than top-level names, because three of the exclusions live one
#: level down — 数詞, 固有名詞 and 助動詞語幹 are all 名詞.
CANDIDATE_PART_OF_SPEECH = frozenset(
    {
        ("名詞", "普通名詞"),
        ("動詞", "一般"),
        # ⚠️ 非自立可能 is ある / いる / くる — words in their own right, and among
        # the most common in the language. The name means *can be non-independent*,
        # not *is not a word*.
        ("動詞", "非自立可能"),
        ("形容詞", "一般"),
        ("形容詞", "非自立可能"),
        ("形状詞", "一般"),
        ("形状詞", "タリ"),
        ("副詞", "*"),
        ("連体詞", "*"),
        ("接続詞", "*"),
        ("感動詞", "一般"),
    }
)

#: What is deliberately **not** vocabulary, written out rather than left to the
#: default so that :func:`test_every_part_of_speech_the_dictionary_declares_is_classified`
#: can prove the two sets cover the dictionary between them. A `SudachiDict`
#: release that adds a category then fails by name instead of quietly dropping a
#: whole word class.
NOT_VOCABULARY = frozenset(
    {
        # ⚠️ `03` §5.2's finding, as a part of speech. 六 and 2026 are both 数詞.
        ("名詞", "数詞"),
        # Names. A news *source* is full of them, none of them is on any JLPT
        # list, and each one would cost a vetting decision (`S3`).
        ("名詞", "固有名詞"),
        ("名詞", "助動詞語幹"),
        ("形状詞", "助動詞語幹"),
        # えーと, あのー. Speech, not words.
        ("感動詞", "フィラー"),
        # ⚠️ **The most arguable line in this list.** これ / それ / あなた are
        # closed-class and appear in every *source*; a reader running this tool is
        # past them, and ADR 0006 makes a rejection permanent, so the cost of
        # being wrong here is one decision rather than a recurring tax.
        ("代名詞", "*"),
        ("助動詞", "*"),
        ("助詞", "係助詞"),
        ("助詞", "副助詞"),
        ("助詞", "接続助詞"),
        ("助詞", "格助詞"),
        ("助詞", "準体助詞"),
        ("助詞", "終助詞"),
        # Bound morphemes: お- / ご-, -的 / -性. Not words on their own, and C
        # split mode has already kept the compounds they belong to whole.
        ("接頭辞", "*"),
        ("接尾辞", "動詞的"),
        ("接尾辞", "名詞的"),
        ("接尾辞", "形容詞的"),
        ("接尾辞", "形状詞的"),
        ("空白", "*"),
        ("補助記号", "一般"),
        ("補助記号", "句点"),
        ("補助記号", "括弧閉"),
        ("補助記号", "括弧開"),
        ("補助記号", "読点"),
        ("補助記号", "ＡＡ"),
        ("記号", "一般"),
        ("記号", "文字"),
    }
)

_KATAKANA_START = 0x30A1
_KATAKANA_END = 0x30F6
#: The whole block, so ー (U+30FC) and ・ (U+30FB) count as katakana for
#: :func:`is_katakana_word` even though neither converts.
_KATAKANA_BLOCK_END = 0x30FF
_TO_HIRAGANA = 0x60


@dataclass(frozen=True)
class Candidate:
    """One sighting of one word, before anything has been spent on it.

    ⚠️ **One per sighting, not one per word.** A *source* that says 図書館 four
    times yields four candidates here and stage 4 folds three of them into
    *occurrences* — which is what `04` §6.1's `candidates_extracted` counts and
    `candidates_deduplicated` subtracts.
    """

    #: `normalized_form`. The term half of ADR 0006's key.
    term: str
    #: The reading half — hiragana, except for a word written in katakana,
    #: which keeps it (ADR 0045).
    reading: str
    #: Sudachi's top-level part of speech — `04` §5.3's example stores 名詞.
    part_of_speech: str
    #: As it appeared, for `occurrence.surface_form` (`04` §5.5).
    surface_form: str
    #: ⚠️ Positions **within the source**, not within the chunk (`04` §5.5).
    char_start: int
    char_end: int
    #: ⚠️ Carried for *provenance*, which is the flag's second reader (`03` §5.2,
    #: ADR 0019, `04` §5.4).
    is_oov: bool
    #: ADR 0006's key, already rendered (`04` §5.3).
    identity_key: str


def extract_candidates(
    declaration: Declaration, tokens: list[Token], *, char_start: int
) -> list[Candidate]:
    """The tokens that are vocabulary, as *candidates* positioned in the *source*.

    ``char_start`` is the *chunk*'s own offset. The tokeniser counts from the
    start of the text it was handed, and `04` §5.5 stores positions within the
    *source*; this is the one place the two are reconciled.
    """
    return [
        _candidate(declaration, token, char_start)
        for token in tokens
        if is_candidate(token)
    ]


def is_candidate(token: Token) -> bool:
    """ADR 0044, and `03` §5.2's numeral rule as its second clause.

    ⚠️ **Two clauses, on purpose, and the order is not the interesting part —
    the redundancy is.** The part of speech is the correct signal and catches
    both 六 and a plain `6`. The second clause reads `is_oov`, which is the
    finding `03` §5.2 actually recorded, and holds even if a future dictionary
    files a numeral under some other part of speech. Neither is load-bearing
    alone; `04` §5.3's *numerals never reach this column* is a sentence worth
    guarding twice.
    """
    part_of_speech = (token.part_of_speech[0], token.part_of_speech[1])
    if part_of_speech not in CANDIDATE_PART_OF_SPEECH:
        return False
    return not (token.is_oov and token.normalized_form.isascii() and token.normalized_form.isdigit())


def reading_of(token: Token) -> str:
    """ADR 0045 — the reading half of the key, in the script it is written in.

    Hiragana for a word written with kanji or kana; **katakana left alone for a
    word that is itself katakana**. コーヒー's reading is コーヒー, not こーひー.

    ⚠️ **The reading is not only a key, it is a field the reader sees.** The
    declaration makes `reading` a `lookup` field on every *note* and `10` §5 puts
    it on the answer side of the recognition *template*, so a mechanical
    conversion that produced こーひー would be wrong on a card, not merely odd in
    a column.
    """
    return token.reading_form if is_katakana_word(token.normalized_form) else to_hiragana(token.reading_form)


def is_katakana_word(term: str) -> bool:
    """Whether a term is written wholly in katakana — U+30A1–U+30FF, so ー and ・
    count and a mixed form like パン屋 does not."""
    return bool(term) and all(
        _KATAKANA_START <= ord(character) <= _KATAKANA_BLOCK_END for character in term
    )


def to_hiragana(reading: str) -> str:
    """Sudachi answers in katakana; `04` §5.3's keys are written in hiragana.

    ⚠️ **This is a decision, and it is ADR 0045.** `04` §5.3 gives three worked
    identity keys — `図書館␟としょかん`, `開く␟ひらく`, `開く␟あく` — and every one of
    them is hiragana, as are the rows `test/schema/harness.ts` already seeds.
    `reading_form()` returns `トショカン`. One of the two had to move, and the
    documents and the committed fixtures both say hiragana.

    The conversion is the U+30A1–U+30F6 block shifted down by 0x60 and nothing
    else: ー (U+30FC) has no hiragana and stays, and so do ヷ–ヺ, which have no
    single-code-point hiragana either.
    """
    return "".join(
        chr(ord(character) - _TO_HIRAGANA)
        if _KATAKANA_START <= ord(character) <= _KATAKANA_END
        else character
        for character in reading
    )


def _candidate(declaration: Declaration, token: Token, char_start: int) -> Candidate:
    term = token.normalized_form
    reading = reading_of(token)
    return Candidate(
        term=term,
        reading=reading,
        part_of_speech=token.part_of_speech[0],
        surface_form=token.surface,
        char_start=char_start + token.begin,
        char_end=char_start + token.end,
        is_oov=token.is_oov,
        # ⚠️ Rendered by the declaration's own function rather than joined here:
        # `04` §5.3's rule is *in the order the subject declaration lists them*,
        # and a second implementation of it is a second thing to get wrong.
        identity_key=render_identity_key(declaration, {"term": term, "reading": reading}),
    )
