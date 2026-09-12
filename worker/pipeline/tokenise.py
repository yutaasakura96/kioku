"""Stage 2 — *Tokenise*. SudachiPy, C split mode (`03` §5.1, ADR 0019).

The stage that turns a *chunk*'s text into morphemes, and the only place in the
worker that touches SudachiPy. Everything downstream reads :class:`Token`, which
is an ordinary frozen dataclass — so stages 3 to 5 are testable with no
dictionary loaded at all (`11` §8).

⚠️ **`Dictionary()` is constructed exactly once per process** (`03` §3.4). There
is no caching between constructions: a second one costs the same load *and its
own memory mapping*, walking RSS from 76 MB to 148 MB to 220 MB (verification
§7.3). The mistake looks like ordinary per-job setup, which is why the
construction is behind :func:`dictionary` and nothing else may call
``Dictionary()``.

⚠️ **`tokenize()`'s result is not sliceable** (`03` §5.2, measured again here
2026-09-11: ``morphemes[:3]`` raises ``TypeError: argument 'idx': 'slice' object
cannot be interpreted as an integer``). This module iterates it once, into a
list, and hands a list onward — so the finding is closed here rather than
rediscovered by every caller that tries to window over morphemes.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, replace
from importlib.metadata import version

from sudachipy import Dictionary, SplitMode, Tokenizer

#: PIN 2/6 (`03` §13.5), **read from the installed package rather than typed**.
#:
#: It is the second element of the generation cache key (`03` §5.3) and a column
#: on `ingestion` and `note_field_provenance` (`04` §5.4, §6.1). A literal here
#: would be a second place for it to be wrong, and the failure mode of that is
#: cached results served against a different tokenisation of the same text —
#: which is the exact thing putting the version in the key was meant to stop.
#:
#: ⚠️ **An upgrade can change the identity of existing *notes*** (ADR 0006,
#: `03` §5.3). It is a reviewed data event with a re-ingestion plan, never an
#: automated bump; `renovate.json`'s PIN 2/6 has the bot's half of that.
DICTIONARY_VERSION = version("SudachiDict-core")

#: ⚠️ **C mode, and the mode is the decision** (`03` §5.1). A mode keeps 図書館 as
#: 図書 / 館 — two fragments that are not the word, feeding `normalized_form`,
#: which is half of ADR 0006's *identity key*. C mode keeps a real word whole, so
#: a *candidate* is a word rather than a piece of one.
SPLIT_MODE = SplitMode.C

_dictionary: Dictionary | None = None
_dictionary_lock = threading.Lock()


@dataclass(frozen=True)
class Token:
    """One morpheme, flattened out of SudachiPy's own object.

    ⚠️ **`begin` and `end` are offsets within the text that was tokenised**, not
    within the *source* — stage 3 adds the *chunk*'s `char_start` to reach the
    positions `occurrence` stores (`04` §5.5). They are code-point offsets on
    both sides of that addition, which is what `shared/ingest/text.ts` exists to
    guarantee from the app's end.
    """

    surface: str
    #: Sudachi's `normalized_form`. ⚠️ **This is the term half of ADR 0006's
    #: *identity key***, and the reason is that it is the only one of the three
    #: forms that collapses orthographic variants: 引越し and 引越 both normalise
    #: to 引っ越し, and ひらいた normalises to 開く where `dictionary_form` stops at
    #: ひらく (measured 2026-09-11). `dictionary_form` alone would make one word
    #: three *notes*, which is the thing ADR 0006 exists to prevent.
    normalized_form: str
    #: Sudachi's `dictionary_form` — the lemma, kept because *provenance* and any
    #: future display of the word as written want it, and because the difference
    #: from `normalized_form` is load-bearing enough to be visible.
    dictionary_form: str
    #: Katakana, as Sudachi returns it, **for the form that appeared**.
    #: `extract_candidates` converts it (ADR 0045).
    reading_form: str
    #: The reading of `dictionary_form`, re-tokenised — and ⚠️ **`None` when the
    #: surface did not inflect**, which is the whole rule rather than a shortcut
    #: (ADR 0045 § Amended 2026-09-13, #15).
    #:
    #: ⚠️ **This is the reading that reaches the key and the card.** あり's own
    #: `reading_form` is アリ, so あります keyed `有る␟あり` beside ある's
    #: `有る␟ある` — one word, two *notes*, ADR 0006's failure arriving through
    #: the half of the key `normalized_form` did not cover.
    #:
    #: ⚠️ **`None` is not "nothing to do": it is the answer.** 六時's 時 is its
    #: own dictionary form and reads ジ where it stands; the same 時 tokenised
    #: alone reads トキ. A field filled in for every token would hand stage 3 a
    #: worse reading than the one it had, so the guard is load-bearing and the
    #: absence is what carries it across the seam.
    #:
    #: ⚠️ **And it is `dictionary_form` that is re-tokenised, not
    #: `normalized_form`** — し's `normalized_form` is 為る, which alone reads
    #: ナル. The term half of the key stays `normalized_form`; only the reading
    #: comes from the lemma.
    dictionary_form_reading: str | None
    #: ⚠️ **Read twice, for two different reasons** (`03` §5.2): by the numeral
    #: rule in stage 3, and by *provenance* to tell a looked-up reading from a
    #: generated one (ADR 0019, `04` §5.4).
    is_oov: bool
    #: Sudachi's six-part tuple, whole. Stage 3 reads the first two.
    part_of_speech: tuple[str, ...]
    begin: int
    end: int


def dictionary() -> Dictionary:
    """The one dictionary this process has, built on first use.

    ⚠️ **Lazily, and behind a lock.** Lazily because importing this module must
    not cost 58 ms and 93 MB in a test that never tokenises anything; behind a
    lock because two threads racing here would build two dictionaries and the
    second mapping is the whole cost `03` §3.4 is protecting against. The worker
    is single-threaded today (`03` §3.1) — the lock is what stops that from
    being a silent precondition of the memory budget.
    """
    global _dictionary
    if _dictionary is None:
        with _dictionary_lock:
            if _dictionary is None:
                _dictionary = Dictionary()
    return _dictionary


def is_inflected(token: Token) -> bool:
    """Whether the word appeared in a form other than its own dictionary form.

    ⚠️ **Written once and read twice, on purpose** (ADR 0045 § Amended
    2026-09-13). Stage 2 asks it to decide whether to spend a second
    tokenisation; stage 3 asks it to decide which of the two readings on
    :class:`Token` is the word's. The two answers have to be the same answer,
    and a predicate copied into `extract_candidates` would be the way they stop
    being — while importing it costs stage 3 nothing it was not already paying,
    since :class:`Token` comes from here too.
    """
    return token.surface != token.dictionary_form


def tokenise(text: str) -> list[Token]:
    """Morphemes, in order, as plain data.

    ⚠️ **The iteration is the point.** `03` §5.2's second finding is that
    SudachiPy's `MorphemeList` cannot be sliced; building a list here is both
    the conversion to :class:`Token` and the one place that finding has to be
    respected.

    ⚠️ **The re-tokenisation is a second pass, not a nested one.** Asking the
    tokeniser for a dictionary form *while* iterating its own `MorphemeList`
    would be a reentrant call into the object the loop is reading; the list is
    flattened into dataclasses first, and the lemmas are looked up from plain
    strings afterwards.
    """
    tokenizer = dictionary().create(mode=SPLIT_MODE)
    tokens = [
        Token(
            surface=morpheme.surface(),
            normalized_form=morpheme.normalized_form(),
            dictionary_form=morpheme.dictionary_form(),
            reading_form=morpheme.reading_form(),
            dictionary_form_reading=None,
            is_oov=morpheme.is_oov(),
            part_of_speech=tuple(morpheme.part_of_speech()),
            begin=morpheme.begin(),
            end=morpheme.end(),
        )
        for morpheme in tokenizer.tokenize(text)
    ]
    return [
        replace(token, dictionary_form_reading=_read_alone(tokenizer, token.dictionary_form))
        if is_inflected(token)
        else token
        for token in tokens
    ]


def _read_alone(tokenizer: Tokenizer, form: str) -> str:
    """Sudachi's answer for one form, read on its own.

    ⚠️ **Named for what it does rather than for what it is used for**, because
    `extract_candidates.reading_of` is one import away and ADR 0045 says in as
    many words that the next reader will look *there* for this rule. Two
    functions called `reading_of` in one package is how they would find the
    wrong one.

    ⚠️ **Joined rather than indexed.** Every lemma measured 2026-09-13 comes
    back as a single morpheme — ある, 開く, する, 高い — but the question being
    asked is *how is this string read*, and a lemma that splits has its reading
    spread across the pieces. ``[0]`` would silently answer with the first
    syllable of one.

    ⚠️ **No memo, and that is a decision rather than an oversight.** A *source*
    that inflects the same verb forty times pays for the lemma forty times, at
    the 2.1 µs/token ADR 0045 measured — call it a millisecond across a whole
    document, against a stage 6 that is an HTTP request per *chunk*. A cache
    here would be a second thing to invalidate on a `SudachiDict` bump, which is
    already `03` §5.3's most delicate event.
    """
    return "".join(morpheme.reading_form() for morpheme in tokenizer.tokenize(form))
