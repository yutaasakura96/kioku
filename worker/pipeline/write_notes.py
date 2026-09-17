"""Stage 7 — *Write notes*, and mint them (`03` §5.1, `04` §5.3, §5.4, §5.5, §7.2, §7.3).

⚠️ **Renamed from `write_pending` with #20**, because ADR 0064 changed what it
does rather than what it is called: a chosen word is `accepted` when it is
written and its *card* is minted in the same transaction. ADR 0063 already named
the stage `write_notes`; #19 kept the old name until the behaviour arrived.

⚠️ **This stage is not pure, and `03` §5.1 always said so.** Stages 2 to 5 are
the pure ones (`11` §8); stage 6 is the LLM and **stage 7 writes**. It lives here
rather than in `worker/ingest.py` because `03` §10 asks for one module per stage
named by the declaration, and a stage 7 that did not write would be a module
named after work happening somewhere else.

⚠️ **Written as produced, not at the end** (`03` §5.1, `S2`). One *chunk*'s notes
are written the moment that chunk's generation returns, so the first is
reviewable while later chunks are still generating — which is what keeps
*time-to-first-review* off the mercy of document size. It is also what closes
cross-chunk duplication: tokenisation is per chunk, so a word in chunks 1 and 3
is two groups, and it is chunk 1's *note* existing by the time chunk 3 is
deduplicated that makes the second sighting an `already_known` rather than a
second thing to pay for.

⚠️ **Since ADR 0063 a *lookup* field can be `generated`.** A word the dictionary
could not read reaches stage 6 with no reading, the model writes one, and `04`
§5.4 records that it came from a model rather than from a dictionary — ADR 0004's
whole sentence is that trust is a property of where a value came from, not of
which column it sits in.

**One note is six writes**, in this order and all of them idempotent:

1. `note` — ADR 0006's key, `04` §5.3's `UNIQUE (subject_id, identity_key)`.
2. `note_field_provenance` — ADR 0004, per field, `04` §5.4.
3. `level_claim` and `domain_claim`, the model's — `04` §5.6, §5.7, ADR 0065.
4. `note_vetting` at `accepted` — `04` §7.2, with no stamp and no run, because
   nobody vetted it (ADR 0064).
5. `card`, through the database's `mint_cards` — `04` §7.3, ADR 0067.
6. `occurrence`, one per sighting — `04` §5.5, from `group.sightings`.

⚠️ **One transaction per *note*, and it is this module's.** The worker's
connection is `autocommit=True` (ADR 0027), and `runs.run_ingestion`'s own
transaction wraps only the candidate ledger and the *chunk*'s `complete` mark
(ADR 0061 §3), so without `write_note`'s own block every statement above would
commit alone — and a worker killed between the `note_vetting` row and the mint
would leave an accepted *note* with no *card*, the state `decide.ts` puts its
two writes in one transaction to prevent. **Per *note*, not per *chunk***:
`S2` wants the first *note* studyable while the rest are still being written.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Iterable, Sequence

import psycopg

from subject import (
    Declaration,
    domain_values,
    judgement_field_names,
    level_values,
    template_keys,
)

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
    #: `job.requested_by` (ADR 0064). ⚠️ Nullable — `04` §6.4 makes it `ON DELETE
    #: SET NULL`, and :func:`accept_and_mint` says what that means for a *note*.
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
    #: ADR 0065's claims this write **refused** — `"level"`, `"domain"`, both or
    #: neither — because the model's value was outside the declared set. The
    #: *note* is written either way; the caller says so (`ingest.claim_refused`).
    refused_claims: tuple[str, ...] = ()


def write_notes(
    connection: psycopg.Connection, notes: Sequence[GeneratedNote], *, to: Destination
) -> tuple[Written, ...]:
    """One *chunk*'s notes — the verb stage 7 is named after.

    ⚠️ **The loop is the stage.** `03` §5.1 calls stage 7 *write notes*,
    plural, and this is where the "as produced, not at the end" of that row is
    true: it is reached once per *chunk*, the moment that chunk's generation
    returns.
    """
    return tuple(write_note(connection, note, to=to) for note in notes)


def write_note(
    connection: psycopg.Connection, note: GeneratedNote, *, to: Destination
) -> Written:
    """The six writes, in order, in one transaction."""
    with connection.transaction():
        return _write_note(connection, note, to=to)


def _write_note(
    connection: psycopg.Connection, note: GeneratedNote, *, to: Destination
) -> Written:
    # ⚠️ **`note.identity_key`, not `note.group.identity_key`** (ADR 0063). For
    # every *note* but one they are the same string; the exception is a word the
    # dictionary could not read, whose reading the model wrote — and `04` §5.3
    # renders the key from the fields the *note* carries, not from the ones it
    # was asked about.
    note_id, created = _insert_note(
        connection,
        subject_id=to.subject_id,
        identity_key=note.identity_key,
        fields=note.fields,
        ingestion_id=to.ingestion_id,
    )

    _insert_provenance(
        connection,
        note_id=note_id,
        declaration=to.declaration,
        is_oov=note.group.candidate.is_oov,
        generated_lookups=note.generated_lookups,
        provenance=to.provenance,
    )
    refused = write_claims(
        connection,
        note_id=note_id,
        note=note,
        declaration=to.declaration,
        provenance=to.provenance,
    )
    accept_and_mint(
        connection, note_id=note_id, owner_id=to.owner_id, declaration=to.declaration
    )
    append_occurrences(
        connection,
        note_id=note_id,
        sightings=note.group.sightings,
        source_id=to.source_id,
        source_chunk_id=to.source_chunk_id,
        ingestion_id=to.ingestion_id,
    )
    return Written(
        note_id=note_id,
        identity_key=note.identity_key,
        created=created,
        refused_claims=refused,
    )


def write_claims(
    connection: psycopg.Connection,
    *,
    note_id: str,
    note: GeneratedNote,
    declaration: Declaration,
    provenance: Provenance,
) -> tuple[str, ...]:
    """ADR 0065 §3 — one `level_claim` and one `domain_claim`, both the model's.

    ⚠️ **A value outside the declared set is refused here and the *note* is
    written anyway** (#22). Stored, `technology` would be a claim no filter could
    ever select — silently unfilterable, which is ADR 0065 §2's whole failure —
    and refusing the *note* for it would spend a word on a guess about the word.
    The refusal is returned rather than raised so the caller can say it.

    ⚠️ **Authority-less, with the model and the prompt that produced it** — the
    check `04` §5.6 and §5.7 share, and the row the *provenance marker* draws
    hollow (ADR 0005). `ON CONFLICT DO NOTHING` is the tables' `UNIQUE NULLS NOT
    DISTINCT (note_id, authority_key)`: **the first estimate stands**, so a
    resume, or a second run that generated a *note* the corpus already held,
    re-attributes nothing.
    """
    refused: list[str] = []
    for table, column, value, legal in (
        ("level_claim", "level", note.level, level_values(declaration)),
        ("domain_claim", "domain", note.domain, domain_values(declaration)),
    ):
        if value not in legal:
            refused.append(column)
            continue
        # The table and column names come from the tuple above, never from data.
        connection.execute(
            f"""
            INSERT INTO {table} (note_id, {column}, model_id, prompt_version)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT DO NOTHING;
            """,
            (note_id, value, provenance.model_id, provenance.prompt_version),
        )
    return tuple(refused)


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
    generated_lookups: frozenset[str],
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
    model wrote, nor about a reading the model wrote **because** the tokeniser
    had nothing to say.

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
        # ⚠️ **`generated_lookups` is the second way a field gets here as
        # `generated`, and ADR 0063 is why.** A *lookup* field is one a
        # dictionary supplied; a `reading` for a word SudachiPy has never seen
        # was written by the model, and ADR 0004 makes trust a property of where
        # the value came from rather than of which column it sits in. Recorded as
        # `lookup` it would claim a dictionary behind a guess, which is the one
        # thing `04` §5.4 exists to prevent.
        generated = name in judged or name in generated_lookups
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


def accept_and_mint(
    connection: psycopg.Connection,
    *,
    note_id: str,
    owner_id: str | None,
    declaration: Declaration,
) -> bool:
    """ADR 0064 §1 — the *note* is `accepted` for this reader, and its *cards*
    are minted.

    ⚠️ **This is what puts a word in front of the reader**, and since #20 the
    route is *Review*, not *Vet*. A *note* written without it is a *note* nobody
    will ever study.

    ⚠️ **No owner means no row and no *card*** (ADR 0064 §2), which is the same
    answer stage 5 gives (`ingest.DatabaseCorpus.rejected`). `04` §6.4 makes
    `requested_by` nullable with `ON DELETE SET NULL` so a hard-deleted reader
    does not erase the spend ledger; such a run's *notes* belong to the corpus
    and to no deck. The caller logs it — this returns `False` so it can.

    ⚠️ **`pending` is upgraded and `rejected` is not.** The 474 *pending notes*
    ADR 0063 keeps as a cache are *notes* the reader never chose; choosing one
    now is the acceptance. A rejection is `S5` — *say no once and mean it* — and
    a re-ingestion turning it into a *card* is the one thing that sentence
    forbids. An `accepted` row is left exactly as it is: a resume must not
    restamp `vetted_at`, and a *note* re-accepted after *Vet*'s fix keeps its
    `edited`.

    ⚠️ **`seconds_to_vet` and `vetting_session_id` stay null**: no person and no
    run was involved, and a zero is a measurement of something that did not
    happen (ADR 0064 §1).

    ⚠️ **The mint is `mint_cards`, and nothing here spells an `INSERT INTO
    card`** (ADR 0067). `server/utils/vet/decide.ts` calls the same function, so
    `04` §7.3's *minting its cards* is still one statement in one place. It is
    asked only when the row reads `accepted` after the upsert, which is what
    keeps a rejected *note* card-less.
    """
    if owner_id is None:
        return False
    connection.execute(
        """
        INSERT INTO note_vetting (note_id, owner_id, state, vetted_at)
        VALUES (%s, %s, 'accepted', now())
        ON CONFLICT (note_id, owner_id) DO UPDATE
          SET state = 'accepted', vetted_at = now()
          WHERE note_vetting.state = 'pending';
        """,
        (note_id, owner_id),
    )
    connection.execute(
        """
        SELECT mint_cards(v.note_id, v.owner_id, %s::text[])
        FROM note_vetting v
        WHERE v.note_id = %s AND v.owner_id = %s AND v.state = 'accepted';
        """,
        (template_keys(declaration), note_id, owner_id),
    )
    return True
