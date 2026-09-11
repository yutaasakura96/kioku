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
from dataclasses import dataclass
from importlib.metadata import version

from sudachipy import Dictionary, SplitMode

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
    #: Katakana, as Sudachi returns it. `extract_candidates` converts it.
    reading_form: str
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


def tokenise(text: str) -> list[Token]:
    """Morphemes, in order, as plain data.

    ⚠️ **The iteration is the point.** `03` §5.2's second finding is that
    SudachiPy's `MorphemeList` cannot be sliced; building a list here is both
    the conversion to :class:`Token` and the one place that finding has to be
    respected.
    """
    tokenizer = dictionary().create(mode=SPLIT_MODE)
    return [
        Token(
            surface=morpheme.surface(),
            normalized_form=morpheme.normalized_form(),
            dictionary_form=morpheme.dictionary_form(),
            reading_form=morpheme.reading_form(),
            is_oov=morpheme.is_oov(),
            part_of_speech=tuple(morpheme.part_of_speech()),
            begin=morpheme.begin(),
            end=morpheme.end(),
        )
        for morpheme in tokenizer.tokenize(text)
    ]
