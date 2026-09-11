"""Stage 1 — *Accept and chunk the source*, as much of it as the worker owns.

⚠️ **The worker does not chunk, and must not start.** The boundary rule is 1200
characters broken at the last sentence terminator, it is ADR 0041, and it lives
in `shared/ingest/chunk.ts` because #6's submit is what writes `source_chunk`
rows — before a worker has claimed anything. A second implementation here would
be a second answer to *where does chunk 3 begin*, and `04` §5.2 needs there to be
one: `source_chunk.content_hash` is the first element of the generation cache key
(`04` §6.3), so two answers means a cache that silently misses.

What remains on this side is reading the text back out, and that is not trivial
for one reason: **the offsets are code points.** `shared/ingest/text.ts` counts
and slices with `Array.from` precisely so that Python's `len()` agrees with
JavaScript's idea of a character, and this module is the other end of that
agreement.
"""

from __future__ import annotations


def chunk_text(content: str, char_start: int, char_end: int) -> str:
    """`content[char_start:char_end]`, in code points, or a refusal.

    ⚠️ **`list(content)[start:end]` and not `content[start:end]`** — except that
    in Python those are the same thing, because `str` *is* a sequence of code
    points. The list form is what `worker/runs.py` names, and it is written here
    once with the reason so that nothing downstream has to remember which of the
    two languages needed the care. It is the JavaScript side that does.

    ⚠️ **Out of range raises rather than clamping.** Python slicing is silent
    about a `char_end` past the end of the string, and an `ingestion_chunk`
    pointing past its *source* means the two have diverged — a short chunk
    tokenised as if it were whole would produce a truncated word at the tail,
    which reaches `normalized_form` and becomes a *note* about a word that does
    not exist (ADR 0041's argument, arriving by a different road). A raise marks
    the chunk `failed` and leaves the run resumable (`03` §5.4), which is the
    honest outcome.
    """
    if char_start < 0 or char_end <= char_start:
        raise ValueError(f"chunk range [{char_start}, {char_end}) is not a range")
    if char_end > len(content):
        raise ValueError(
            f"chunk range [{char_start}, {char_end}) runs past a source of "
            f"{len(content)} characters"
        )
    return content[char_start:char_end]
