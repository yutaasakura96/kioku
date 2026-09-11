"""The *pipeline* wired to the database — `03` §5, ADR 0006, ADR 0010.

`worker/runs.py` is the durable bookkeeping around a *chunk* — its status, its
attempt, the heartbeat, the settle — and it takes the per-chunk work as an
argument precisely so that the work can live somewhere else. **This is somewhere
else**, and `worker/pipeline/` is somewhere else again: the stages there are pure
functions over candidates (`11` §8), and everything that knows a query is here.

⚠️ **#8 changed nothing in `runs.py`.** The seam was one argument and it still
is; what arrived is a `process_chunk` to pass to it. #9 added `sc.content_hash`
to that module's resume query and nothing else.

⚠️ **Stage 6 and stage 7 arrived with #9**, and the shape of the hook changed
with them: ``generate`` is called **once per chunk with all of its survivors**,
not once per group. `04` §6.3 keys the cache on the *chunk*'s `content_hash`, so
one call per candidate would put every candidate in a chunk under one four-tuple
— see :func:`make_generator` and ADR 0047.

⚠️ **The writes stage 7 does are not here.** `pipeline/write_pending.py` owns
them, because `03` §10 asks for one module per stage named by the declaration.
What is still here is the SQL that is *around* the stages — the corpus lookup,
the rejected filter, `04` §6.1's two ledgers, and `04` §6.3's cache.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import AbstractSet, Any, Callable, Mapping, Optional, Sequence

import psycopg

import prices
from db import MisconfiguredWorker
from jobs import ClaimedJob
from pipeline import Corpus, StageResult, chunk_text, run_stages
from pipeline.deduplicate import Group
from pipeline.generate import (
    PROMPT_VERSION,
    GenerationRefused,
    notes_for_cached,
    notes_from,
    request_for,
)
from pipeline.tokenise import DICTIONARY_VERSION
from pipeline.write_pending import (
    Destination,
    Provenance,
    append_occurrences,
    write_pending_notes,
)
from provider import Generation, Provider, ProviderRefused
from runs import Chunk
from subject import Declaration, load_declaration

#: `03` §12, `04` §6.1: early *time-to-first-review* figures are not comparable
#: across ADR 0022's move, **recorded on the number rather than only in a
#: paragraph**. The column's `CHECK` is the same two words.
WORKER_ENVIRONMENT_ENV = "KIOKU_WORKER_ENVIRONMENT"
WORKER_ENVIRONMENTS = ("laptop", "server")


@dataclass(frozen=True)
class ChunkContext:
    """Everything stage 6 needs about the *chunk* it is being asked to pay for.

    ⚠️ **`text` is on it because the prompt carries the passage**, and `04` §6.3
    keying the cache on `chunk.content_hash` is only sound because it does: the
    hash has to cover the request, or a hit answers a question that was never
    asked (`pipeline/generate.build_prompt`).
    """

    declaration: Declaration
    ingestion_id: str
    run: "RunContext"
    chunk: Chunk
    text: str


#: Stage 6 and stage 7, as one hook — **once per chunk, with that chunk's whole
#: surviving set** (ADR 0047). :func:`make_generator` is the one this repository
#: ships; the tests pass their own, which is how `11` §7's *generation tests use
#: recorded fixtures and never call a provider* is enforced rather than asked for.
Generate = Callable[[psycopg.Connection, ChunkContext, tuple[Group, ...]], None]


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
    #: ⚠️ **A mutable default on the closure, not a `nonlocal`.** The first chunk
    #: reads the run context and the rest reuse it; a one-element cache is the
    #: smallest thing that expresses *read once, lazily*, and it is `dict` rather
    #: than a bare `Optional` because rebinding one from an inner function needs
    #: `nonlocal`, which is the thing that makes this pattern hard to read.
    cached: dict[str, RunContext] = {}

    def process_chunk(connection: psycopg.Connection, chunk: Chunk) -> None:
        if "run" not in cached:
            cached["run"] = read_run_context(connection, job.ingestion_id)
        run = cached["run"]

        text = chunk_text(run.content, chunk.char_start, chunk.char_end)

        result = run_stages(
            resolved,
            text,
            char_start=chunk.char_start,
            corpus=DatabaseCorpus(
                connection, subject_id=run.subject_id, owner_id=run.owner_id
            ),
        )

        append_corpus_occurrences(connection, job.ingestion_id, run, chunk, result)

        # ⚠️ **Not called for an empty survivor set**, and that is ADR 0010 at
        # its most literal: a *chunk* whose every word the corpus already carries
        # costs one lookup and nothing else. It is also `S5` — the fiftieth
        # *source* asks about fewer *notes* than the fifth — arriving as a branch
        # that is taken more and more often.
        if generate is not None and result.survivors:
            generate(
                connection,
                ChunkContext(
                    declaration=resolved,
                    ingestion_id=job.ingestion_id,
                    run=run,
                    chunk=chunk,
                    text=text,
                ),
                result.survivors,
            )

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


def append_corpus_occurrences(
    connection: psycopg.Connection,
    ingestion_id: str,
    run: RunContext,
    chunk: Chunk,
    result: StageResult,
) -> None:
    """ADR 0006: *on a key match the second sighting appends an occurrence.*

    ⚠️ **Only for words the corpus already had.** A *note* this run is about to
    create does not exist until stage 7 writes it, and its occurrences are
    written there, from the same `sightings` tuple and through the same function
    — `pipeline.write_pending.append_occurrences`. Two copies of `04` §5.5's
    insert would be two places for its unique constraint to be spelled wrong.

    ⚠️ **Every sighting, including the sightings of a *note* this reader has
    rejected.** An *occurrence* is **shared** data — a fact about the material
    (`04` §4) — while a rejection is a claim about the reader (ADR 0012);
    dropping the position because of the decision would confuse the two.
    """
    for group in result.collisions:
        append_occurrences(
            connection,
            note_id=group.note_id,
            sightings=group.sightings,
            source_id=run.source_id,
            source_chunk_id=chunk.source_chunk_id,
            ingestion_id=ingestion_id,
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


# ---------------------------------------------------------------------------
# Stage 6, wired — `04` §6.3's cache, the provider, and `04` §6.1's spend half
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CacheKey:
    """`04` §6.3's four-tuple, written out rather than hashed into one column.

    ⚠️ **All four, and the dictionary version is the one that is easy to leave
    out** (`03` §5.3). A SudachiDict upgrade changes tokenisation, which changes
    candidate extraction, which changes `normalized_form` — which is half of
    ADR 0006's *identity key*. Without it a bump silently serves results computed
    against a different tokenisation of the same text.
    """

    content_hash: str
    dictionary_version: str
    prompt_version: str
    model_id: str


def make_generator(provider: Provider, *, worker_environment: str | None = None) -> Generate:
    """Stage 6 and stage 7, bound to one provider — `03` §5.1, §7, ADR 0018.

    ⚠️ **The order is cache, provider, ledger, validate, cache-store, write**,
    and each step is where it is for a reason:

    - **The cache first**, because ADR 0010 says the point of the key is that a
      re-ingestion of the same *chunk* costs nothing, and `03` §11 promises the
      reader exactly that for an identical *source* resubmitted.
    - **The spend ledger before the validation, and on the failing path too**,
      because the money is gone whether or not the answer was usable and `S10`
      reports from a row that has to be true rather than flattering. A refusal or
      a truncation is a 200 that was billed; `ProviderRefused` carries what it
      cost precisely so this function can record it before re-raising.
    - **The cache store after the validation**, because a stored answer that does
      not validate would be served back forever and the chunk could never
      succeed. `03` §7's *a failure is an error rather than a stored row* is
      about `note`; this is the same sentence pointed at `generation_cache`.
    - **The write last**, and per chunk, which is `03` §5.1 stage 7's *streamed:
      written as produced, not at the end*.
    """
    environment = (
        resolve_worker_environment() if worker_environment is None else worker_environment
    )

    def generate(
        connection: psycopg.Connection, context: ChunkContext, groups: Sequence[Group]
    ) -> None:
        key = CacheKey(
            content_hash=context.chunk.content_hash,
            dictionary_version=DICTIONARY_VERSION,
            prompt_version=PROMPT_VERSION,
            model_id=provider.model_id,
        )

        cached = read_generation_cache(connection, key)
        notes = None if cached is None else notes_for_cached(context.declaration, groups, cached)

        # ⚠️ **Stamped on a hit as well as on a miss.** These three say *what
        # made these notes*, not *what this run paid*, and a fully-cached
        # re-ingestion that produced *notes* with no model named on the row would
        # read as though nothing had happened (`04` §6.1, `09` §7).
        stamp_run_generation(
            connection, context.ingestion_id, model_id=provider.model_id, environment=environment
        )

        if notes is None:
            try:
                generation = provider.generate(
                    request_for(context.declaration, context.text, groups)
                )
            except ProviderRefused as refused:
                if refused.spent is not None:
                    record_spend(connection, context.ingestion_id, refused.spent)
                raise
            record_spend(connection, context.ingestion_id, generation)
            notes = notes_from(context.declaration, groups, generation.payload)
            write_generation_cache(connection, key, generation)

        write_pending_notes(
            connection,
            notes,
            to=Destination(
                declaration=context.declaration,
                subject_id=context.run.subject_id,
                owner_id=context.run.owner_id,
                source_id=context.run.source_id,
                source_chunk_id=context.chunk.source_chunk_id,
                ingestion_id=context.ingestion_id,
                provenance=Provenance(
                    model_id=provider.model_id,
                    prompt_version=PROMPT_VERSION,
                    dictionary_version=DICTIONARY_VERSION,
                ),
            ),
        )

    return generate


def read_generation_cache(
    connection: psycopg.Connection, key: CacheKey
) -> Optional[dict[str, Any]]:
    """`04` §12's seventh query — the four-tuple, and nothing else.

    ⚠️ **A composite primary key is also the lookup index**, so there is no
    second index to keep in step (`04` §6.3, §11).
    """
    row = connection.execute(
        """
        SELECT response FROM generation_cache
        WHERE content_hash = %s AND dictionary_version = %s
          AND prompt_version = %s AND model_id = %s;
        """,
        (key.content_hash, key.dictionary_version, key.prompt_version, key.model_id),
    ).fetchone()
    return None if row is None else row[0]


def write_generation_cache(
    connection: psycopg.Connection, key: CacheKey, generation: Generation
) -> None:
    """The response as returned, under the four-tuple it was computed for.

    ⚠️ **An upsert, and `DO NOTHING` was wrong here.** Reaching this at all means
    the read a moment ago was a miss — and a miss is not only *no row*: a row
    that did not answer every survivor is treated as one (`04` §6.3), because
    serving it would lose a *note*. With `DO NOTHING` that narrower row would
    survive the write, be read as a miss again on the next run, and **the chunk
    would re-pay forever**, which is exactly the bill `03` §11 promises an
    identical *source* does not get. The newer answer is the one known to cover
    more, so it replaces.

    ⚠️ `created_at` moves with it, and should: the row now says what the *stored*
    response cost, which is the question `04` §6.3's two token columns are asked.
    """
    connection.execute(
        """
        INSERT INTO generation_cache
          (content_hash, dictionary_version, prompt_version, model_id,
           response, input_tokens, output_tokens)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
        ON CONFLICT (content_hash, dictionary_version, prompt_version, model_id)
        DO UPDATE SET
          response = EXCLUDED.response,
          input_tokens = EXCLUDED.input_tokens,
          output_tokens = EXCLUDED.output_tokens,
          created_at = now();
        """,
        (
            key.content_hash,
            key.dictionary_version,
            key.prompt_version,
            key.model_id,
            json.dumps(generation.payload, ensure_ascii=False),
            generation.input_tokens,
            generation.output_tokens,
        ),
    )


def stamp_run_generation(
    connection: psycopg.Connection,
    ingestion_id: str,
    *,
    model_id: str,
    environment: str,
) -> None:
    """Which model and which prompt made this run's *notes* — `04` §6.1.

    ⚠️ **Separate from :func:`record_spend`, because they answer different
    questions.** These three say *what produced these notes*; the token counts
    and the cost say *what this run paid*. A re-ingestion served entirely from
    `04` §6.3's cache produces *notes* and pays nothing, and a row with the
    second half empty and the first half filled is the honest description of
    that. Collapsed into one write, such a run would name no model at all and
    `09` §7 would render it as though nothing had happened.

    ⚠️ **`worker_environment` is on the row rather than only in a paragraph**
    (`03` §12): early *time-to-first-review* figures are not comparable across
    ADR 0022's move, and the run is the thing that knows which side of it this
    was. The app writes the row at submit, when no worker has claimed it and
    nothing true can be said about where it will run.
    """
    connection.execute(
        """
        UPDATE ingestion SET
          model_id = %(model_id)s,
          prompt_version = %(prompt_version)s,
          worker_environment = %(environment)s
        WHERE id = %(id)s;
        """,
        {
            "id": ingestion_id,
            "model_id": model_id,
            "prompt_version": PROMPT_VERSION,
            "environment": environment,
        },
    )


def record_spend(
    connection: psycopg.Connection, ingestion_id: str, generation: Generation
) -> None:
    """`04` §6.1's spend half — **from the API response, never estimated**.

    ⚠️ **Accumulated, like the four candidate counters beside it.** A resume
    re-runs only the chunks that are not `complete` (`04` §6.2), so an assignment
    would report the resume's slice as the whole document — and here that means
    under-reporting money actually spent.

    ⚠️ **A cache hit never reaches this function.** It spent nothing, and
    `04` §6.1 says these numbers come from the API response; a hit has no
    response of its own, only a record of one somebody already paid for.

    ⚠️ **A *refused* answer does reach it.** A declined or truncated response is
    a 200 that was billed, and `ProviderRefused` carries what it cost so that
    this is called before the exception continues. A ledger that dropped those
    tokens would make a *source* that failed half its chunks look cheaper than
    one that succeeded, which is the one direction `S10` must not be wrong in.

    ⚠️ **`price_table_effective_date` is stamped beside the cost**, because
    `03` §7 makes the price table configuration rather than a constant and a
    figure whose table cannot be identified is a figure that starts lying
    silently when prices change.
    """
    table = prices.current_prices()
    cost = prices.cost_micro_usd(
        generation.model_id,
        input_tokens=generation.input_tokens,
        output_tokens=generation.output_tokens,
        table=table,
    )
    connection.execute(
        """
        UPDATE ingestion SET
          price_table_effective_date = %(effective_date)s,
          input_tokens = coalesce(input_tokens, 0) + %(input_tokens)s,
          output_tokens = coalesce(output_tokens, 0) + %(output_tokens)s,
          cost_micro_usd = coalesce(cost_micro_usd, 0) + %(cost)s
        WHERE id = %(id)s;
        """,
        {
            "id": ingestion_id,
            "effective_date": table.effective_date,
            "input_tokens": generation.input_tokens,
            "output_tokens": generation.output_tokens,
            "cost": cost,
        },
    )


def resolve_worker_environment(environ: dict[str, str] | None = None) -> str:
    """`04` §6.1's `worker_environment`, from the environment or `laptop`.

    ⚠️ **Refused rather than defaulted when it is set to something else.** The
    column carries a two-value `CHECK` and the whole point of the field is that
    a number can be told which side of ADR 0022's move it came from; a typo that
    silently became `laptop` would put server figures in the laptop's column,
    which is the one comparison `03` §12 says must not be made.
    """
    resolved = os.environ if environ is None else environ
    value = resolved.get(WORKER_ENVIRONMENT_ENV, "").strip() or WORKER_ENVIRONMENTS[0]
    if value not in WORKER_ENVIRONMENTS:
        raise MisconfiguredWorker(
            f"{WORKER_ENVIRONMENT_ENV} is {value!r}; `04` §6.1 allows "
            f"{' or '.join(WORKER_ENVIRONMENTS)}. `03` §12: early "
            "time-to-first-review figures are not comparable across ADR 0022's "
            "move, and this is what records which side a number came from."
        )
    return value
