"""Stage 6a — *Look up*: the dictionary answers before any model is asked
(ADR 0075 §5, #68).

A word the reader brought — pasted, listed or imported — that the corpus does
not hold is looked for in JMdict. Found, its *note* is written from the
dictionary and costs nothing; **only what the dictionary lacks reaches
`generate`**.

⚠️ **It runs after `filter_known`, for ADR 0010's reason.** Everything that
shrinks the work happens before anything that spends, and this is the last thing
that shrinks it. The starter set is in the corpus, so a word on a JLPT list never
gets this far: it is a collision, and the reader is handed the *note* that is
already there.

⚠️ **Pure, like stages 2 to 5.** What it asks is behind :class:`Lookup`, so the
tests hand it a dict and the worker hands it `dictionary.Dictionary`.

An empty reading asks JMdict by term; its priority decides among entries and
readings before the model is considered.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable, Protocol

from subject import Declaration, render_identity_key, validate

from .deduplicate import Group
from .generate import GeneratedNote, GenerationRefused

if TYPE_CHECKING:  # `dictionary` imports this package; the type is all we need.
    from dictionary import Word

#: The fields a dictionary entry supplies. `term` and `reading` are the
#: tokeniser's, as on every other *note*.
DICTIONARY_FIELDS = ("part_of_speech", "meaning")


class Lookup(Protocol):
    """What this stage asks of a dictionary."""

    #: What *provenance* records for a value it supplied — `JMdict 2026-10-09`.
    version: str

    def find(self, term: str, reading: str) -> "Word | None":
        """The highest-priority usable entry for this term and optional reading."""


@dataclass(frozen=True)
class Found:
    group: Group
    word: "Word"


@dataclass(frozen=True)
class LookedUp:
    #: Written from the dictionary. No model is asked about these.
    found: tuple[Found, ...]
    #: What the dictionary lacks — stage 6's whole input.
    missing: tuple[Group, ...]


def lookup(groups: Iterable[Group], *, dictionary: Lookup) -> LookedUp:
    found: list[Found] = []
    missing: list[Group] = []

    for group in groups:
        candidate = group.candidate
        word = dictionary.find(candidate.term, candidate.reading)
        # ⚠️ An entry with nothing to show is the same as no entry: the *note*
        # needs both fields (`03` §6), and the model can still be asked.
        if word is None or not word.meaning.strip() or not word.part_of_speech.strip():
            missing.append(group)
        else:
            found.append(Found(group=group, word=word))

    return LookedUp(found=tuple(found), missing=tuple(missing))


def notes_for(
    declaration: Declaration, found: Iterable[Found], *, version: str
) -> list[GeneratedNote]:
    """The *notes* stage 7 writes for what the dictionary had.

    ⚠️ **They pass the same boundary a generated *note* does** (`03` §6): a
    dictionary entry that left a required field blank is refused here rather
    than stored.
    """
    notes: list[GeneratedNote] = []
    for item in found:
        candidate = item.group.candidate
        fields = {
            "term": candidate.term,
            "reading": candidate.reading or item.word.reading,
            "part_of_speech": item.word.part_of_speech,
            "meaning": item.word.meaning,
        }
        result = validate(declaration, fields)
        if not result.ok:
            raise GenerationRefused(
                "a dictionary note does not satisfy the declaration: "
                + ", ".join(f"{error.field}:{error.code}" for error in result.errors)
            )
        notes.append(
            GeneratedNote(
                group=item.group,
                fields=fields,
                identity_key=render_identity_key(declaration, fields),
                meanings=item.word.meanings,
                looked_up={name: version for name in (*DICTIONARY_FIELDS, *(() if candidate.reading else ("reading",)))},
            )
        )
    return notes
