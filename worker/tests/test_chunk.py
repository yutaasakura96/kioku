"""Stage 1's worker half — reading a *chunk* back out of its *source*.

⚠️ **The worker does not chunk.** `03` §5.1 stage 1 is *accept and chunk the
source*, it is whole-document, and the app already did it in #6 —
`shared/ingest/chunk.ts` owns the boundary rule and ADR 0041 carries the
argument. What is left on this side is the slice, and the slice is where the two
languages can disagree.
"""

from __future__ import annotations

import pytest

from pipeline.chunk import chunk_text

#: ⚠️ U+20B9F, outside the BMP. `'\U00020B9F'.length` is **2** in JavaScript and
#: `len()` is **1** in Python — the divergence `shared/ingest/text.ts` was
#: written to close, seen from the end that reads the offsets rather than the end
#: that writes them.
BEYOND_THE_BMP = "𠮟"


def test_a_chunk_is_sliced_by_code_point() -> None:
    """`04` §1: *character offsets are characters, not bytes*, and
    `shared/ingest/text.ts` adds the second half — not code units either.

    The app wrote these offsets by iterating code points; a slice here that used
    anything else puts every later position one out for each non-BMP character
    in the *source*, silently, and the symptom arrives months later as an
    *occurrence* pointing at the wrong span.
    """
    content = BEYOND_THE_BMP + "る文字"

    assert chunk_text(content, 0, 1) == BEYOND_THE_BMP
    assert chunk_text(content, 1, 4) == "る文字"


def test_an_ordinary_chunk_is_the_half_open_range_the_schema_stores() -> None:
    """`04` §5.2's `CHECK (char_end > char_start)`, and `chunkBoundaries`' own
    tiling property: `[start, end)` on both sides of the repository.
    """
    assert chunk_text("駅の近くに図書館があります。", 5, 8) == "図書館"


def test_a_range_outside_the_source_is_refused_rather_than_truncated() -> None:
    """⚠️ Python's slicing clamps silently — `list(content)[0:9999]` is the whole
    string and says nothing. An `ingestion_chunk` row pointing past the end of
    its *source* means the two have diverged (a `source` edited under a running
    job, a correlation joined the wrong way), and a short chunk processed as if
    it were whole is the quiet version of that. `03` §11 has no row for it
    because it should not happen; a raise is what makes the chunk `failed` and
    the run resumable instead.
    """
    with pytest.raises(ValueError):
        chunk_text("図書館", 0, 9999)
