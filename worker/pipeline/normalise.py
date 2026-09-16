"""Stage — *Normalise a word list* (ADR 0063, ADR 0045, ADR 0006).

The word-list pipeline's replacement for `tokenise` **and** `extract_candidates`
at once. One line is one term, so there is nothing to extract; what is left is
the part that still has to happen, which is the dictionary's:
`normalized_form` is the term half of ADR 0006's *identity key* and
:func:`extract_candidates.reading_of` decides the script the reading half is
written in.

⚠️ **The *identity key* is what it has always been**, and that is the whole
reason this stage uses SudachiPy rather than letting the model read the word.
ADR 0063 rejected skipping the dictionary here in as many words: a key whose
value comes from a model is one that changes when the model does, and the
dictionary is what makes the same word the same *note* next year.

⚠️ **Nothing here re-decides a rule `extract_candidates` already owns.**
`reading_of`, `is_candidate` and `is_katakana_word` are imported, not copied —
`00-status.md` § Carrying records that the last time a reading rule existed in
two places it produced あります keyed beside ある, and ADR 0045's amendment names
`reading_of` as the function the next reader will look in.

⚠️ **A line Sudachi cannot resolve is kept, not dropped** (ADR 0063). It keeps
the line as the reader wrote it, carries an **empty reading**, and sets `is_oov`
— stage 6 then writes the reading with *provenance* `generated` rather than
`lookup`. A list of tech loanwords is going to contain words the 2026 dictionary
has never seen, and refusing them would refuse the ones this app exists for.
"""

from __future__ import annotations

import unicodedata

from subject import Declaration, is_blank, render_identity_key, strip_blank

from .extract_candidates import Candidate, is_candidate, reading_of
from .tokenise import Token, tokenise


def normalise(
    declaration: Declaration, text: str, *, char_start: int
) -> list[Candidate]:
    """One *candidate* per non-blank line, positioned within the *source*.

    ``text`` is the *chunk* — 25 lines of it (ADR 0063) — and ``char_start`` is
    that chunk's own offset, because `04` §5.5 stores positions within the
    *source* and this function counts from the start of what it was handed. It is
    the same reconciliation `extract_candidates` performs for prose, at the same
    seam, for the same reason.

    ⚠️ **The span is the *line's*, not the resolved term's, and `surface_form`
    matches it.** A reader who typed 勉強する gets 勉強 as the *term* — the word
    — while `occurrence.char_start`/`char_end` cover the whole line and
    `occurrence.surface_form` is that whole line, because `04` §5.5 is a position
    **in the source** and "as it appeared". The two have to agree with each
    other: a `surface_form` that was not the text at its own offsets is an
    *occurrence* that points somewhere else.

    ⚠️ **What is trimmed off is only padding**, which is not in the file's
    meaning and would otherwise make `surface_form` carry spaces the reader
    cannot see.
    """
    candidates: list[Candidate] = []
    offset = char_start

    for line in text.split("\n"):
        # ⚠️ **`is_blank` and `strip_blank`, never `str.strip()`** — the class is
        # `shared/subject/validate.ts`'s and Python's own differs from it by six
        # characters (`00-status.md` § Carrying). `shared/ingest/chunk.ts` counts
        # the terms in this same text to decide where the *chunk* ends; a line
        # one language calls blank and the other calls a word is a chunk holding
        # 24 terms on one side of the repository and 25 on the other.
        if not is_blank(line):
            term = strip_blank(line)
            # A code-point index into the line, which is the unit `04` §5.5
            # stores — `shared/ingest/text.ts` is the other end of that.
            within = line.index(term)
            candidates.append(
                _candidate(
                    declaration,
                    term,
                    char_start=offset + within,
                    char_end=offset + within + len(term),
                )
            )
        # +1 for the newline `split` consumed. The last line has none, and
        # nothing reads the offset past the end of the chunk.
        offset += len(line) + 1

    return candidates


def _candidate(
    declaration: Declaration, line: str, *, char_start: int, char_end: int
) -> Candidate:
    """One *candidate* from one line, already stripped of its padding.

    ``line`` is the line **without its padding** and ``char_start``/``char_end``
    are that same span, so `occurrence.surface_form` and the position it carries
    describe the same characters.
    """
    tokens = tokenise(line)
    resolved = _resolved(tokens)

    if resolved is None:
        # ADR 0063's kept line. NFC because `04` §5.3 renders the *identity key*
        # NFC-normalised and this term goes into it unmediated by the dictionary
        # — every other term arrives already normalised, having come out of
        # SudachiPy.
        term = unicodedata.normalize("NFC", line)
        reading = ""
        part_of_speech = tokens[0].part_of_speech[0] if tokens else ""
        # ⚠️ **`is_oov` here means *the reading did not come from the
        # dictionary*, which is wider than *Sudachi had never heard of it*.**
        # That is the question `04` §5.4 asks the column — ADR 0019 keeps it as
        # the raw signal *provenance* was derived from, and ADR 0063 makes stage
        # 6 write this note's `reading` with kind `generated` rather than
        # `lookup` on exactly this bit. A line that tokenised perfectly well and
        # held two words has no looked-up reading either.
        is_oov = True
    else:
        term = resolved.normalized_form
        reading = reading_of(resolved)
        part_of_speech = resolved.part_of_speech[0]
        is_oov = resolved.is_oov

    return Candidate(
        term=term,
        reading=reading,
        part_of_speech=part_of_speech,
        surface_form=line,
        char_start=char_start,
        char_end=char_end,
        is_oov=is_oov,
        # ⚠️ The declaration's own function, for `04` §5.3's *in the order the
        # subject declaration lists them* — the same call `extract_candidates`
        # makes, and for the same reason: a second implementation of the
        # rendering rule is a second thing to get wrong, and the rendering rule
        # is part of the identity.
        identity_key=render_identity_key(declaration, {"term": term, "reading": reading}),
    )


#: Sudachi's `normalized_form` for する in every form it takes — measured
#: 2026-09-16 against `SudachiDict-core` 20260723: する and し both normalise to
#: 為る. ⚠️ **The lemma is the wrong field to test**: `dictionary_form` is する
#: for both, and 為る is what `normalized_form` collapses them to.
_SURU = "為る"

#: `part_of_speech[2]` on a noun that takes する — 勉強, 引っ越し, デザイン.
#: Measured the same day; `03` §5.2's tuples are six long and stage 3 reads only
#: the first two, so this is the first reader of the third.
_SURU_CAPABLE = "サ変可能"


def _resolved(tokens: list[Token]) -> Token | None:
    """The one word this line is, or ``None`` when it is not one word.

    ⚠️ **Three ways a line fails to resolve, and each is a different mistake the
    reader could have made:**

    - **Nothing at all.** An empty tokenisation has no word in it.
    - **The head is not vocabulary** — ADR 0044's allowlist, and its numeral
      clause. 六 tokenises fine and `normalized_form` rewrites it to ``6``
      (`03` §5.2), so a numeral that resolved would put a digit where a word
      should be, which `04` §5.3 says never happens. A line Sudachi cannot call
      a word is a line this stage has not understood.
    - **A second content word follows it.** C split mode keeps 図書館 whole, so a
      second word in the allowlist means the line held two of them — a phrase, a
      gloss the reader pasted along with the term, or a stray tab. Taking the
      head and discarding the rest would be the silent half-answer ADR 0063's
      *kept, not dropped* clause exists to refuse; keeping the line whole sends
      the model what the reader actually wrote.

    ⚠️ **The tail after the head is otherwise inflection, and that is why the
    head alone is the word.** あります is あり + ます in C mode: ます is 助動詞
    and not in ADR 0044's allowlist, so the head stands and
    :func:`extract_candidates.reading_of` reads it through its dictionary form —
    有る, ある — exactly as it would in prose.

    ⚠️ **する is the exception, and it has to be — ADR 0006 is why.** Measured
    2026-09-16: C mode splits 勉強する into 勉強 (`名詞,普通名詞,サ変可能`) and
    する (`動詞,非自立可能`, `normalized_form` 為る), and **ADR 0044's allowlist
    contains 動詞,非自立可能 on purpose** — ある / いる / くる are words in their
    own right. So the blunt rule above called 勉強する two words and kept it whole,
    which meant a word list holding 勉強する minted a *second note* beside the
    勉強 a prose run had already mined. One word, two *notes*, keyed apart — the
    exact failure ADR 0006 exists to prevent, arriving through the one part of
    speech that is deliberately both auxiliary and a word.

    ⚠️ **The guard is narrow on both sides, deliberately.** The head must be
    `サ変可能` and the follower must normalise to 為る, so 気をつける (head 気 is
    `一般`, follower つける) and 持ってくる (head 持っ is `動詞,一般`) are both
    still kept whole, which is right: they are phrases the reader chose, not
    nouns with する on the end.

    ⚠️ **The reader typed 勉強する and gets a *note* for 勉強**, which is the
    answer ADR 0006 forces rather than a compromise: it is the word a *source* of
    prose would have produced for the same sentence, and two routes into one
    corpus disagreeing about identity is worse than a term one character shorter
    than the line.
    """
    if not tokens:
        return None

    head = tokens[0]
    if head.is_oov or not is_candidate(head):
        return None
    if any(
        is_candidate(token) and not _is_suru_tail(head, token) for token in tokens[1:]
    ):
        return None
    return head


def _is_suru_tail(head: Token, token: Token) -> bool:
    """Whether ``token`` is the する that turns ``head`` into a verb."""
    return (
        len(head.part_of_speech) > 2
        and head.part_of_speech[2] == _SURU_CAPABLE
        and token.normalized_form == _SURU
    )
