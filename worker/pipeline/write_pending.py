"""Stage 7 — *Write pending notes* (`03` §5.1, `04` §5.3, §5.4, §5.5, §7.2).

⚠️ **This stage is not pure, and `03` §5.1 always said so.** Stages 2 to 5 are
the pure ones (`11` §8); stage 6 is the LLM and **stage 7 writes**. It lives here
rather than in `worker/ingest.py` because `03` §10 asks for one module per stage
named by the declaration, and a stage 7 that did not write would be a module
named after work happening somewhere else.

⚠️ **Written as produced, not at the end** (`03` §5.1, `S2`). One *chunk*'s notes
are written the moment that chunk's generation returns, so the first is vettable
while later chunks are still generating — which is what keeps
*time-to-first-review* off the mercy of document size. It is also what closes
cross-chunk duplication: tokenisation is per chunk, so a word in chunks 1 and 3
is two groups, and it is chunk 1's *note* existing by the time chunk 3 is
deduplicated that makes the second sighting an `already_known` rather than a
second thing to pay for.

**One note is four writes**, in this order and all of them idempotent:

1. `note` — ADR 0006's key, `04` §5.3's `UNIQUE (subject_id, identity_key)`.
2. `note_field_provenance` — ADR 0004, per field, `04` §5.4.
3. `note_vetting` at `pending` — `04` §7.2, and what puts it in the *Vet* queue.
4. `occurrence`, one per sighting — `04` §5.5, from `group.sightings`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Iterable, Sequence

import psycopg

from subject import Declaration, judgement_field_names

from .extract_candidates import Candidate
from .generate import GeneratedNote

#: ⚠️ **The declaration's two kinds map onto two of `04` §5.4's four, and the
#: other two are unreachable from here** —
#: [ADR 0048](../../docs/adr/0048-provenance-kind-is-decided-by-who-produced-the-value.md).
#: `lookup` is a value read out of a **dictionary**; `generated` is the model
#: writing one with no dictionary behind it; `judgement` is the model **choosing**
#: among senses a dictionary supplied; and `human` is the reader, which is *Vet*'s
#: and not this stage's. v1 hands the model no sense inventory to choose from —
#: SudachiPy supplies no glosses — so nothing here is `judgement`, and the day a
#: dictionary with senses is wired in, `meaning` becomes one.
#:
#: ⚠️ *Authority* is deliberately **not** the word used here: `CONTEXT.md` scopes
#: it to what a *level claim* cites (ADR 0005), and a dictionary is not one.
PROVENANCE_LOOKUP = "lookup"
PROVENANCE_GENERATED = "generated"


@dataclass(frozen=True)
class Provenance:
    """ADR 0004's honesty bit, as the values `04` §5.4 stores it with."""

    model_id: str
    prompt_version: str
    dictionary_version: str


@dataclass(frozen=True)
class Destination:
    """Where one *chunk*'s *notes* go — the five ids every one of its four writes
    needs, and the two things that decide what those writes say.

    ⚠️ **One value rather than eight parameters.** They travel together because
    they *are* one thing: the run, the chunk of it being written, and the reader
    it is being written for. Passed separately they were re-listed verbatim at
    every call site, which is a type asking to be born.
    """

    declaration: Declaration
    subject_id: str
    #: ⚠️ Nullable — `04` §6.1 makes `ingestion.submitted_by` `ON DELETE SET
    #: NULL`, and :func:`_insert_vetting` says what that means for a *note*.
    owner_id: str | None
    source_id: str
    source_chunk_id: str
    ingestion_id: str
    provenance: Provenance


@dataclass(frozen=True)
class Written:
    """What stage 7 did, so the caller can say it without re-querying."""

    note_id: str
    identity_key: str
    #: False when the key was already there — a resume re-running a chunk whose
    #: notes landed before it failed, or a concurrent run. `04` §5.3's unique
    #: constraint is what makes that a fact rather than a second *note*.
    created: bool


def write_pending_notes(
    connection: psycopg.Connection, notes: Sequence[GeneratedNote], *, to: Destination
) -> tuple[Written, ...]:
    """One *chunk*'s notes — the verb stage 7 is named after.

    ⚠️ **The loop is the stage.** `03` §5.1 calls stage 7 *write pending notes*,
    plural, and this is where the "as produced, not at the end" of that row is
    true: it is reached once per *chunk*, the moment that chunk's generation
    returns.
    """
    return tuple(write_pending_note(connection, note, to=to) for note in notes)


def write_pending_note(
    connection: psycopg.Connection, note: GeneratedNote, *, to: Destination
) -> Written:
    """The four writes, in order."""
    note_id, created = _insert_note(
        connection,
        subject_id=to.subject_id,
        identity_key=note.group.identity_key,
        fields=note.fields,
        ingestion_id=to.ingestion_id,
    )

    _insert_provenance(
        connection,
        note_id=note_id,
        declaration=to.declaration,
        is_oov=note.group.candidate.is_oov,
        provenance=to.provenance,
    )
    _insert_vetting(connection, note_id=note_id, owner_id=to.owner_id)
    append_occurrences(
        connection,
        note_id=note_id,
        sightings=note.group.sightings,
        source_id=to.source_id,
        source_chunk_id=to.source_chunk_id,
        ingestion_id=to.ingestion_id,
    )
    return Written(note_id=note_id, identity_key=note.group.identity_key, created=created)


def append_occurrences(
    connection: psycopg.Connection,
    *,
    note_id: str,
    sightings: Iterable[Candidate],
    source_id: str,
    source_chunk_id: str,
    ingestion_id: str,
) -> None:
    """ADR 0006: *on a key match the second sighting appends an occurrence.*

    ⚠️ **Every sighting, the first included.** `04` §5.5 is append-only with no
    `UPDATE` path, and `S11` reads it back as *open a source, see what came from
    it* — a note whose first position was never recorded is a note with a hole
    in its provenance of place.

    ⚠️ `ON CONFLICT DO NOTHING` is `04` §5.5's
    `UNIQUE (note_id, source_id, char_start)` — *re-running a source appends
    nothing it already has*, which is what makes a resume idempotent in the one
    place idempotence is cheap.

    ⚠️ **This is the function `worker/ingest.py` reuses for the corpus-hit
    case.** The write is the same write whether the *note* was found or made;
    what differs is only where the `note_id` came from, and two copies of it
    would be two places for `04` §5.5's constraint to be spelled wrong.
    """
    for sighting in sightings:
        connection.execute(
            """
            INSERT INTO occurrence
              (note_id, source_id, source_chunk_id, char_start, char_end,
               surface_form, ingestion_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING;
            """,
            (
                note_id,
                source_id,
                source_chunk_id,
                sighting.char_start,
                sighting.char_end,
                sighting.surface_form,
                ingestion_id,
            ),
        )


def _insert_note(
    connection: psycopg.Connection,
    *,
    subject_id: str,
    identity_key: str,
    fields: dict[str, str],
    ingestion_id: str,
) -> tuple[str, bool]:
    """`04` §5.3, and **a collision never alters the note's fields** (ADR 0006).

    ⚠️ `ON CONFLICT DO NOTHING` rather than an upsert, and the difference is the
    whole of ADR 0006: a second sighting of a word appends an *occurrence* and
    leaves the note alone. An upsert here would let a re-ingestion overwrite a
    note the reader has already accepted and studied.

    Stage 5 has already dropped everything the corpus carries, so reaching this
    conflict means the row arrived between that lookup and this write — a resume
    re-running a chunk whose notes landed before it failed, or a second run of
    the same *source*. Both are states the constraint is for.
    """
    inserted = connection.execute(
        """
        INSERT INTO note (subject_id, identity_key, fields, origin_ingestion_id)
        VALUES (%s, %s, %s::jsonb, %s)
        ON CONFLICT (subject_id, identity_key) DO NOTHING
        RETURNING id;
        """,
        (subject_id, identity_key, json.dumps(fields, ensure_ascii=False), ingestion_id),
    ).fetchone()
    if inserted is not None:
        return inserted[0], True

    existing = connection.execute(
        "SELECT id FROM note WHERE subject_id = %s AND identity_key = %s;",
        (subject_id, identity_key),
    ).fetchone()
    if existing is None:  # pragma: no cover - the conflict says it is there
        raise LookupError(f"note {identity_key!r} conflicted and then was not found")
    return existing[0], False


def _insert_provenance(
    connection: psycopg.Connection,
    *,
    note_id: str,
    declaration: Declaration,
    is_oov: bool,
    provenance: Provenance,
) -> None:
    """ADR 0004, per field — *trust is a property of where a value came from.*

    ⚠️ **Per field, and that is the point rather than a detail.** `04` §12's
    eighth query is ADR 0018's instrument: *acceptance rate and false-accept rate
    grouped by `model_id` and `prompt_version`*. Recorded per note it would
    answer "some notes are bad"; recorded per field it answers "prompt v1 writes
    bad example sentences", and only the second is actionable.

    ⚠️ **`is_oov` rides on the looked-up rows only** (`04` §5.4, ADR 0019). It is
    the raw signal `kind` was derived from, and it says something about the
    tokeniser's answer — there is nothing for it to say about a sentence the
    model wrote.

    ⚠️ **Attempted for every *note*, not only for one this call created**, with
    `ON CONFLICT DO NOTHING` deciding. Gated on *created* instead, a process that
    died between :func:`_insert_note` and this one would leave a *note* with no
    provenance **forever**: the retry finds the row already there, skips, and
    `04` §12's eighth query silently loses six fields. The conflict clause is
    what makes the ungated version safe — an existing row always wins, so a
    *note* another run made keeps that run's attribution.
    """
    judged = set(judgement_field_names(declaration))
    for field in declaration["fields"]:
        name = field["name"]
        generated = name in judged
        connection.execute(
            """
            INSERT INTO note_field_provenance
              (note_id, field_name, kind, model_id, prompt_version, dictionary_version, is_oov)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (note_id, field_name) DO NOTHING;
            """,
            (
                note_id,
                name,
                PROVENANCE_GENERATED if generated else PROVENANCE_LOOKUP,
                provenance.model_id if generated else None,
                provenance.prompt_version if generated else None,
                None if generated else provenance.dictionary_version,
                None if generated else is_oov,
            ),
        )


def _insert_vetting(
    connection: psycopg.Connection, *, note_id: str, owner_id: str | None
) -> None:
    """`04` §7.2 — the row that makes a *note* *pending* for a reader.

    ⚠️ **This, not the absence of a decision, is what puts a note in the *Vet*
    queue** (`04` §12's first query), so a note written without it is a note
    nobody can ever see.

    ⚠️ **No owner means no row**, which is the same answer stage 5 gives
    (`ingest.DatabaseCorpus.rejected`). `04` §6.1 makes `submitted_by` nullable
    with `ON DELETE SET NULL` so a hard-deleted reader does not erase the spend
    ledger; the consequence is that such a run's *notes* belong to the corpus
    and to no queue. `owner_id` on `note_vetting` is `NOT NULL` and `RESTRICT`,
    so there is nothing else to write.

    ⚠️ `ON CONFLICT DO NOTHING` because the state is the **reader's**: a resume
    must not return a note they already accepted to `pending`.
    """
    if owner_id is None:
        return
    connection.execute(
        """
        INSERT INTO note_vetting (note_id, owner_id, state)
        VALUES (%s, %s, 'pending')
        ON CONFLICT (note_id, owner_id) DO NOTHING;
        """,
        (note_id, owner_id),
    )
