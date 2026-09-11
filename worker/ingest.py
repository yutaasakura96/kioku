"""The *pipeline* wired to the database — `03` §5, ADR 0006, ADR 0010.

`worker/runs.py` is the durable bookkeeping around a *chunk* — its status, its
attempt, the heartbeat, the settle — and it takes the per-chunk work as an
argument precisely so that the work can live somewhere else. **This is somewhere
else**, and `worker/pipeline/` is somewhere else again: the stages there are pure
functions over candidates (`11` §8), and everything that knows a query is here.

⚠️ **#8 changes nothing in `runs.py`.** The seam was one argument and it still
is; what arrived is a `process_chunk` to pass to it.

⚠️ **Stage 6 does not exist yet.** ``generate`` is #9's hook, defaulted to
``None`` — a run with no generator does every stage that shrinks the work,
writes the ledger, and spends nothing, which is exactly the state ADR 0010
describes as the point of the ordering.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AbstractSet, Callable, Mapping, Optional

import psycopg

from jobs import ClaimedJob
from pipeline import Corpus, StageResult, chunk_text, run_stages
from pipeline.deduplicate import Group
from runs import Chunk
from subject import Declaration, load_declaration

#: Stage 6, when there is one. #9 replaces the default.
Generate = Callable[[psycopg.Connection, Group], None]


@dataclass(frozen=True)
class RunContext:
    """What every *chunk* of one run needs, read once.

    ⚠️ **`content` is the whole *source*, held for the run.** `04` §5.1 caps a
    source at 100,000 characters, so this is bounded by a number the schema
    enforces rather than by hope, and reading it once beats one round trip per
    chunk for a string that cannot change under a claimed job.
    """

    source_id: str
    subject_id: str
    #: `ingestion.submitted_by`. ⚠️ Nullable — `04` §6.1 makes it `ON DELETE SET
    #: NULL` so that hard-deleting the reader does not erase the spend ledger.
    owner_id: str | None
    content: str


class DatabaseCorpus(Corpus):
    """`04` §12's second and third queries, narrowed to one chunk's keys."""

    def __init__(
        self, connection: psycopg.Connection, *, subject_id: str, owner_id: str | None
    ) -> None:
        self._connection = connection
        self._subject_id = subject_id
        self._owner_id = owner_id

    def known_notes(self, identity_keys: AbstractSet[str]) -> Mapping[str, str]:
        """*Does `(subject_id, identity_key)` exist?* — once per chunk, not once
        per candidate, because one round trip answers all of them.

        ⚠️ **`subject_id` is in the predicate**, because it is in the unique
        constraint (`04` §5.3). Without it a second *subject* sharing a term
        string would silently deduplicate against the first.
        """
        if not identity_keys:
            return {}
        rows = self._connection.execute(
            """
            SELECT identity_key, id FROM note
            WHERE subject_id = %s AND identity_key = ANY(%s);
            """,
            (self._subject_id, list(identity_keys)),
        ).fetchall()
        return {identity_key: note_id for identity_key, note_id in rows}

    def rejected(self, identity_keys: AbstractSet[str]) -> AbstractSet[str]:
        """`04` §7.2: *stage 5 joins `note.identity_key` for this owner and drops
        anything already rejected.*

        ⚠️ **`owner_id` is the filter and it is not optional.** `note_vetting` is
        *personal* — ADR 0012 makes a rejection a claim about the reader — and
        with one reader in v1 a missing filter passes every test that does not
        have a second one. § Carrying already records that exact defect against
        three of the app's queries.

        ⚠️ **No owner means no rejections**, rather than everyone's. A run whose
        `submitted_by` has been deleted still has a ledger to write and a corpus
        to deduplicate against; what it does not have is a reader whose past
        decisions could be applied.
        """
        if not identity_keys or self._owner_id is None:
            return frozenset()
        rows = self._connection.execute(
            """
            SELECT n.identity_key FROM note_vetting v
            JOIN note n ON n.id = v.note_id
            WHERE v.owner_id = %s AND v.state = 'rejected' AND n.identity_key = ANY(%s);
            """,
            (self._owner_id, list(identity_keys)),
        ).fetchall()
        return {identity_key for (identity_key,) in rows}


def make_chunk_processor(
    job: ClaimedJob,
    *,
    generate: Optional[Generate] = None,
    declaration: Optional[Declaration] = None,
) -> Callable[[psycopg.Connection, Chunk], None]:
    """`runs.ChunkProcessor` for one claimed job.

    ⚠️ **A closure over the job, because the seam's signature has no room for
    it.** `run_ingestion` hands the processor a connection and a `Chunk`; the
    *ingestion* it belongs to is known before the first chunk is, and binding it
    here is what keeps `runs.py` unchanged.

    ⚠️ **The declaration and the run context are read once each**, not once per
    chunk. The declaration is a file read (ADR 0003) and the context is a query;
    neither changes under a claimed job, and a resume gets a new processor with
    them read again.
    """
    resolved = declaration if declaration is not None else load_declaration()
    context: list[RunContext] = []

    def process_chunk(connection: psycopg.Connection, chunk: Chunk) -> None:
        if not context:
            context.append(read_run_context(connection, job.ingestion_id))
        run = context[0]

        result = run_stages(
            resolved,
            chunk_text(run.content, chunk.char_start, chunk.char_end),
            char_start=chunk.char_start,
            corpus=DatabaseCorpus(
                connection, subject_id=run.subject_id, owner_id=run.owner_id
            ),
        )

        append_occurrences(connection, job.ingestion_id, run, chunk, result)

        if generate is not None:
            for group in result.survivors:
                generate(connection, group)

        # ⚠️ **Last**, and after the work rather than before it. A chunk that
        # raises part-way is marked `failed` by `runs.py` and retried, and the
        # counters are the one thing here that is not idempotent — `occurrence`
        # has `04` §5.5's unique constraint and generation will have `04` §6.3's
        # cache. The window where a retry could double-count is between this
        # statement and `_mark_chunk(… 'complete')`; `04` §6.1 makes all four
        # columns nullable and `03` §11 uses them to tell the reader *how many
        # were filtered, and by which filter*, so an over-count in that window is
        # a wrong number on a screen rather than wrong data.
        record_candidate_ledger(connection, job.ingestion_id, result)

    return process_chunk


def read_run_context(connection: psycopg.Connection, ingestion_id: str) -> RunContext:
    """The *source* this run is of, and who asked for it."""
    row = connection.execute(
        """
        SELECT s.id, i.subject_id, i.submitted_by, s.content
        FROM ingestion i JOIN source s ON s.id = i.source_id
        WHERE i.id = %s;
        """,
        (ingestion_id,),
    ).fetchone()
    if row is None:
        # ⚠️ `04` §6.1 makes `ingestion.source_id` nullable so a hard delete does
        # not erase the cost record, so the join really can come back empty. It
        # is a failed *chunk* and a resumable run (`03` §5.4), not a crash — and
        # `runs.py` turns this raise into exactly that.
        raise LookupError(f"ingestion {ingestion_id} has no source to read")
    source_id, subject_id, owner_id, content = row
    return RunContext(
        source_id=source_id, subject_id=subject_id, owner_id=owner_id, content=content
    )


def append_occurrences(
    connection: psycopg.Connection,
    ingestion_id: str,
    run: RunContext,
    chunk: Chunk,
    result: StageResult,
) -> None:
    """ADR 0006: *on a key match the second sighting appends an occurrence.*

    ⚠️ **Every sighting, including the first**, and including the sightings of a
    *note* this reader has rejected. An *occurrence* is **shared** data — a fact
    about the material (`04` §4) — while a rejection is a claim about the reader
    (ADR 0012); dropping the position because of the decision would confuse the
    two, and `04` §5.5 calls the table append-only with no `UPDATE` path.

    ⚠️ **Only for words the corpus already has.** An occurrence needs a
    `note_id`, and the *notes* a run is about to create do not exist until stage
    7 writes them (#9). Their occurrences are written there, from the same
    `sightings` tuple.

    ⚠️ `ON CONFLICT DO NOTHING` is `04` §5.5's
    `UNIQUE (note_id, source_id, char_start)` — *re-running a source appends
    nothing it already has*, which is what makes a resume idempotent in the one
    place idempotence is cheap.
    """
    for group in result.collisions:
        for sighting in group.sightings:
            connection.execute(
                """
                INSERT INTO occurrence
                  (note_id, source_id, source_chunk_id, char_start, char_end,
                   surface_form, ingestion_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING;
                """,
                (
                    group.note_id,
                    run.source_id,
                    chunk.source_chunk_id,
                    sighting.char_start,
                    sighting.char_end,
                    sighting.surface_form,
                    ingestion_id,
                ),
            )


def record_candidate_ledger(
    connection: psycopg.Connection, ingestion_id: str, result: StageResult
) -> None:
    """`04` §6.1's four counters, accumulated across the run's chunks.

    ⚠️ **Accumulated, not assigned.** A resume re-runs only the chunks that are
    not `complete` (`04` §6.2), so the numbers already on the row were paid for
    by chunks this run is not repeating — `coalesce(…, 0) + …` keeps them, and an
    assignment would report the resume's slice as if it were the whole document.

    `dictionary_version` is stamped here rather than at submit because it is a
    property of the tokenisation, and until a worker with a dictionary claims the
    job there is nothing true to write (`03` §5.3, `04` §6.1).
    """
    connection.execute(
        """
        UPDATE ingestion SET
          dictionary_version = %(dictionary_version)s,
          candidates_extracted = coalesce(candidates_extracted, 0) + %(extracted)s,
          candidates_deduplicated = coalesce(candidates_deduplicated, 0) + %(deduplicated)s,
          candidates_already_known = coalesce(candidates_already_known, 0) + %(already_known)s,
          candidates_rejected = coalesce(candidates_rejected, 0) + %(rejected)s
        WHERE id = %(id)s;
        """,
        {
            "id": ingestion_id,
            "dictionary_version": result.dictionary_version,
            "extracted": result.extracted,
            "deduplicated": result.deduplicated,
            "already_known": result.already_known,
            "rejected": result.rejected,
        },
    )
