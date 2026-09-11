"""Stage 4 — *Deduplicate against the corpus* (`03` §5.1, ADR 0006, ADR 0010).

Pure. Candidates and a view of the corpus in, groups out — the database query
that produces that view belongs to the caller (`11` §8), which is what lets this
stage be tested with no database at all.

⚠️ **This stage does not drop anything.** It folds repeated sightings into one
group and attaches the `note` id where the corpus already has the word; stage 5
is what removes work. The split matters because ADR 0006 requires a collision to
**append an *occurrence***, and a stage that dropped the group here would throw
away the positions that occurrence is made of.

⚠️ **It runs before stage 6, and that ordering is the whole of ADR 0010.**
Ordered the other way, full price is paid to generate *notes* that are discarded
a moment later — and `S5` says the fiftieth *source* must ask about fewer *notes*
than the fifth.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping

from .extract_candidates import Candidate


@dataclass(frozen=True)
class Group:
    """Every sighting of one word in one *chunk*, and what the corpus knows of it."""

    identity_key: str
    #: The first sighting. If this word is generated, it is generated from this.
    candidate: Candidate
    #: All of them, first included — `04` §5.5 stores one *occurrence* per
    #: position, and `UNIQUE (note_id, source_id, char_start)` is what makes
    #: re-ingesting the same *source* append nothing it already has.
    sightings: tuple[Candidate, ...]
    #: The existing `note`, when ADR 0006's key already matches one.
    note_id: str | None


@dataclass(frozen=True)
class Deduplicated:
    groups: tuple[Group, ...]
    #: `04` §6.1's `candidates_extracted` — sightings in, not distinct words.
    extracted: int
    #: `04` §6.1's `candidates_deduplicated` — sightings folded into a group that
    #: already existed. `03` §11 shows the reader this number by name.
    deduplicated: int


def deduplicate(
    candidates: Iterable[Candidate], *, known_keys: Mapping[str, str]
) -> Deduplicated:
    """Fold repeats, then ask the corpus which of what is left it already has.

    ``known_keys`` maps ADR 0006's *identity key* to the `note` id that carries
    it — `04` §12's second query, resolved once for the whole *chunk* rather than
    once per candidate, because the same round trip answers every one of them.

    ⚠️ **First-sighting order is preserved**, which is the order the *source*
    introduced the words in. It is the only order that makes the *vetting* queue
    feel like the document it came from, and `dict` is what preserves it.
    """
    sightings: dict[str, list[Candidate]] = {}

    extracted = 0
    for candidate in candidates:
        extracted += 1
        sightings.setdefault(candidate.identity_key, []).append(candidate)

    groups = tuple(
        Group(
            identity_key=identity_key,
            candidate=found[0],
            sightings=tuple(found),
            note_id=known_keys.get(identity_key),
        )
        for identity_key, found in sightings.items()
    )

    return Deduplicated(
        groups=groups,
        extracted=extracted,
        deduplicated=extracted - len(groups),
    )
