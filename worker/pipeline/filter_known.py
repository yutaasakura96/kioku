"""Stage 5 — *Filter known and rejected* (`03` §5.1, `04` §7.2, ADR 0006, `S5`).

Pure. The last stage before anything is spent, and the one `S5` is measured at:
*the fiftieth source must ask about fewer notes than the fifth.* ADR 0006 made
rejection permanent precisely so that this stage shrinks the work as the corpus
grows rather than re-asking about the two hundred words already declined.

⚠️ **There is no `rejected_term` table and there must not be** (`04` §7.2, §13).
A rejection is a `note_vetting` row with `state = 'rejected'`, and the rejected
set handed in here is that query's answer — *every `identity_key` this owner has
rejected*, `04` §12's third query. A second copy of that fact is a second thing
to keep true.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AbstractSet, Iterable

from .deduplicate import Group


@dataclass(frozen=True)
class Filtered:
    #: What reaches stage 6. Everything else has been paid for already or has
    #: been declined, and ADR 0010 is the ordering that makes that matter.
    survivors: tuple[Group, ...]
    #: `04` §6.1's `candidates_already_known`.
    already_known: int
    #: `04` §6.1's `candidates_rejected`.
    rejected: int


def filter_known(
    groups: Iterable[Group], *, rejected_keys: AbstractSet[str]
) -> Filtered:
    """Drop what the corpus already has and what the reader has already declined.

    ⚠️ **Rejection is tested first, and each group is counted exactly once.**
    `04` §7.2 keys a rejection on `note_id`, so every rejected key necessarily
    has a `note` behind it and *both* filters match it. `03` §11 puts the
    breakdown in front of the reader — *how many candidates were filtered, and
    by which filter* — and `04` §6.1 gives it four separate columns, so counting
    one candidate under two of them would make the ledger add up to more than
    was extracted.
    """
    survivors: list[Group] = []
    already_known = 0
    rejected = 0

    for group in groups:
        if group.identity_key in rejected_keys:
            rejected += 1
            continue
        if group.note_id is not None:
            already_known += 1
            continue
        survivors.append(group)

    return Filtered(
        survivors=tuple(survivors),
        already_known=already_known,
        rejected=rejected,
    )
