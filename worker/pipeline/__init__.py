"""The *ingestion* pipeline — `03` §5, `03` §10.

One flat module per *stage*, **named by the declaration**: `subjects/jlpt-vocab.json`'s
`stages` keys are these module names (`03` §10), and `tests/test_pipeline.py`
asserts the two lists are the same list rather than trusting that they are.

⚠️ **Stages 6 and 7 are #9's** — *generate* and *write pending notes*. #8 runs 1
to 5 and stops at the edge of generation, which is ADR 0010's ordering made
literal: everything that shrinks the work happens before anything that spends.
:func:`run_stages` is where that edge is, and it is why the function returns
*survivors* rather than notes.

⚠️ **Nothing here touches the database.** `11` §8 names stages 2 to 5 as the
seam — pure functions over tokens → candidates — and the corpus arrives as two
plain collections that the caller looked up. `worker/ingest.py` is the caller,
and it is where the SQL lives.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AbstractSet, Mapping, Protocol

from subject import Declaration

from .chunk import chunk_text
from .deduplicate import Group, deduplicate
from .extract_candidates import extract_candidates
from .filter_known import filter_known
from .tokenise import DICTIONARY_VERSION, tokenise

__all__ = ["Corpus", "StageResult", "run_stages", "chunk_text"]


class Corpus(Protocol):
    """What stages 4 and 5 need to know, and the only thing they ask for.

    ⚠️ **This is the seam `11` §8 is describing.** The stages are pure functions
    over candidates; what is not pure is *what does the corpus already contain*,
    and putting that behind two methods is what lets the whole composition be
    tested with a dict and run against Postgres unchanged.

    ⚠️ **Both are asked the question narrowed to this chunk's keys**, not "give
    me everything" — `04` §12's second query is *does `(subject_id,
    identity_key)` exist?* and its third is the rejected set. A corpus of ten
    thousand *notes* re-read on every chunk would be a cost that grows with the
    thing `S5` promises to make cheaper.
    """

    def known_notes(self, identity_keys: AbstractSet[str]) -> Mapping[str, str]:
        """Identity key → `note.id`, for the keys that already have one."""

    def rejected(self, identity_keys: AbstractSet[str]) -> AbstractSet[str]:
        """The subset this reader has rejected — `04` §7.2, `04` §12's third query."""


@dataclass(frozen=True)
class StageResult:
    """What one *chunk* is worth, before anything has been spent on it."""

    #: What reaches stage 6 — #9's input, and the only thing that costs money.
    survivors: tuple[Group, ...]
    #: Groups whose ADR 0006 key the corpus already carries. Every sighting in
    #: them is an *occurrence* to append (`04` §5.5) and none of them is a *note*
    #: to vet. ⚠️ A **rejected** word is in here too: the rejection is a claim
    #: about the reader (ADR 0012) and the position is a fact about the material
    #: (`04` §4), and dropping the second because of the first confuses them.
    collisions: tuple[Group, ...]
    #: `04` §6.1's four counters, which `03` §11 shows the reader as *how many
    #: candidates were filtered, and by which filter*.
    extracted: int
    deduplicated: int
    already_known: int
    rejected: int
    #: `03` §5.3's corrected cache key names it, and `04` §6.1 has the column.
    dictionary_version: str


def run_stages(
    declaration: Declaration, text: str, *, char_start: int, corpus: Corpus
) -> StageResult:
    """Stages 2 to 5 over one *chunk*'s text, in order.

    ``text`` is the chunk, already sliced — stage 1 is the app's (`pipeline.chunk`
    says why). ``char_start`` is that chunk's offset within the *source*, because
    `04` §5.5 stores positions within the source and the tokeniser counts from
    zero.

    ⚠️ **The corpus is consulted before stage 6, and that is ADR 0010.** Both
    lookups happen here, on a set of keys that extraction has already narrowed,
    and the function returns *survivors* rather than *notes* precisely because
    the next thing that happens costs money. Ordered the other way, full price is
    paid to generate notes that are discarded a moment later — and `S5` says the
    fiftieth *source* must ask about fewer notes than the fifth.
    """
    tokens = tokenise(text)
    candidates = extract_candidates(declaration, tokens, char_start=char_start)

    identity_keys = {candidate.identity_key for candidate in candidates}
    deduplicated = deduplicate(candidates, known_keys=corpus.known_notes(identity_keys))
    filtered = filter_known(
        deduplicated.groups, rejected_keys=corpus.rejected(identity_keys)
    )

    return StageResult(
        survivors=filtered.survivors,
        collisions=tuple(
            group for group in deduplicated.groups if group.note_id is not None
        ),
        extracted=deduplicated.extracted,
        deduplicated=deduplicated.deduplicated,
        already_known=filtered.already_known,
        rejected=filtered.rejected,
        dictionary_version=DICTIONARY_VERSION,
    )
