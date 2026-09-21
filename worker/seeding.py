"""The *seed* — [ADR 0070](../docs/adr/0070-a-seeded-list-is-a-draft-the-reader-submits.md), #25.

*Ingest* asks for a word list with a *domain*, a *level* and a count; this is
what answers it. The provider key exists only in the worker (`03` §13.1), so the
request is worker work whichever screen asked for it.

**What comes back is a draft, not a *source*.** It is written to `seed.terms`
and *Ingest* puts it in the word-list field; it becomes a `word_list` *source*
when the reader submits it, through the same path as any list they typed
(ADR 0070 §1). Nothing here writes a *note*, a *card* or a *source*.

⚠️ **The same queue as every other job** (ADR 0070 § Settled by the build).
`job.seed_id` is set and `job.ingestion_id` is not, and the claim, the heartbeat
and the sweep read neither — `__main__.handle` dispatches on `job.kind`, and
this module is the `seed` branch.

⚠️ **The ledger row is written the moment the answer arrives, and on the
refused path too**, like `ingest.record_spend` and for the same reason: the money
is gone whether or not the answer was usable (ADR 0070 §2, `04` §6.1).

⚠️ **Never a term in a log** — model output about what the reader will study is
kept out of the log like a *source* is (`03` §13.4). Counts only.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Sequence

import psycopg

import events
import prices
from jobs import ClaimedJob, keepalive
from pipeline.generate import GenerationRequest
from provider import Generation, Provider, ProviderRefused
from subject import Declaration, domain_values, is_blank, level_values, strip_blank

#: ⚠️ **Not `generate`'s `PROMPT_VERSION`.** A different question — *which words*,
#: not *what does this word mean* — so `seed.prompt_version` says which prompt
#: wrote the list, and a change to it is a new value here.
SEED_PROMPT_VERSION = "seed-v1"

#: A draft of a hundred words is a few hundred output tokens. The ceiling is
#: generous because a truncated answer is billed and useless (`ProviderRefused`),
#: and output is paid for by what is produced, not by this number.
MAX_OUTPUT_TOKENS = 4_000


@dataclass(frozen=True)
class SeedRequest:
    domain: str
    level: str
    count: int


@dataclass(frozen=True)
class SeedRow:
    id: str
    subject_id: str
    request: SeedRequest
    requested_by: str | None
    completed_at: datetime | None
    discarded_at: datetime | None


class NotAWordList(ValueError):
    """The answer came back and is not a list of words.

    ⚠️ **Its message is read onto *Ingest*** (the job's `last_error`), so it
    never carries what was returned (`03` §13.4) and never names the provider
    (`03` §11).
    """


def output_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"words": {"type": "array", "items": {"type": "string"}}},
        "required": ["words"],
        "additionalProperties": False,
    }


def request_for(
    declaration: Declaration, request: SeedRequest, *, known: Sequence[str]
) -> GenerationRequest:
    """What the model is asked. A request outside the *subject*'s closed sets is
    refused here rather than asked about (ADR 0065 §2) — the app refuses it
    first, and this is the worker not trusting a row.

    ⚠️ **The exclusion section only when there is something in it**, so an empty
    corpus is asked the plain question rather than one with an empty list the
    model might read as an instruction.
    """
    if request.domain not in domain_values(declaration):
        raise ValueError(f"{request.domain!r} is not one of the subject's domains")
    if request.level not in level_values(declaration):
        raise ValueError(f"{request.level!r} is not one of the subject's levels")

    domains = ", ".join(domain_values(declaration))
    prompt = (
        "You are choosing vocabulary for a Japanese learner's flashcards.\n\n"
        f"Propose {request.count} Japanese words that a learner studying for JLPT "
        f"{request.level} would meet in the `{request.domain}` domain. The domains "
        f"this learner sorts words into are: {domains}. Choose words that belong "
        f"to `{request.domain}` more than to the others, and that sit at "
        f"{request.level} rather than well above or below it.\n\n"
        "RULES\n"
        "- One word per entry, written as a dictionary writes it: kanji where the "
        "word is normally written in kanji, and no reading, no meaning, no "
        "punctuation.\n"
        "- Words, not phrases or sentences.\n"
        "- No word twice.\n"
        f"- Exactly {request.count} entries if you can; fewer is better than a "
        "word that does not fit.\n"
    )
    if known:
        listed = "\n".join(known)
        prompt += (
            "\nALREADY KNOWN\nThe learner already studies every word below. "
            "Propose none of them.\n"
            f"{listed}\n"
        )

    return GenerationRequest(prompt=prompt, schema=output_schema(), max_tokens=MAX_OUTPUT_TOKENS)


def draft_from(payload: Any, *, count: int, known: Sequence[str]) -> list[str]:
    """The answer as the draft *Ingest* shows: trimmed, one line each, no
    repeats, nothing already known, and no more than ``count``.

    ⚠️ **Dropping a known word here is the display half of the backstop.**
    `filter_known` drops it again before `generate` spends anything (ADR 0070
    §4); this keeps it off the reader's screen, where it would be a word they
    are asked to choose and already have.

    ⚠️ **`strip_blank`, never `str.strip()`** — the blank class is the one both
    toolchains share (`subject.py`), and the draft becomes a *source* that
    `shared/ingest/chunk.ts` counts in TypeScript.
    """
    words = payload.get("words") if isinstance(payload, dict) else None
    if not isinstance(words, list) or not all(isinstance(word, str) for word in words):
        raise NotAWordList("the answer is not a word list")

    excluded = set(known)
    seen: set[str] = set()
    draft: list[str] = []
    for word in words:
        if is_blank(word):
            continue
        term = strip_blank(word)
        # A newline is two lines of the *source*; a tab is the word-list column
        # separator (ADR 0068 §3). Neither is one word.
        if "\n" in term or "\t" in term or "\r" in term:
            continue
        if term in excluded or term in seen:
            continue
        seen.add(term)
        draft.append(term)
        if len(draft) == count:
            break
    return draft


def read_seed(connection: psycopg.Connection, seed_id: str) -> SeedRow | None:
    row = connection.execute(
        """
        SELECT id::text, subject_id, domain, level, count, requested_by, completed_at, discarded_at
        FROM seed WHERE id = %s;
        """,
        (seed_id,),
    ).fetchone()
    if row is None:
        return None
    return SeedRow(
        id=row[0],
        subject_id=row[1],
        request=SeedRequest(domain=row[2], level=row[3], count=row[4]),
        requested_by=row[5],
        completed_at=row[6],
        discarded_at=row[7],
    )


def known_terms(
    connection: psycopg.Connection, request: SeedRequest, *, subject_id: str, owner_id: str | None
) -> list[str]:
    """ADR 0070 §4 — the owner's terms whose `domain_claim` and `level_claim`
    match the request.

    ⚠️ **"The owner's" means a *card* the owner holds**, not a *note* the corpus
    has. The 474 *pending notes* of the first prose run are in the corpus and
    are nobody's yet; ADR 0063 turned them into a cache, so a seed that proposes
    one mints it at no generation cost. Excluding them would throw that away.

    ⚠️ **Any claim matches**, a model's or an authority's: `level_claim` is a set
    that is never collapsed (ADR 0005), and a word some claim puts at the
    requested *level* is one the model would plausibly propose.
    """
    if owner_id is None:
        return []
    rows = connection.execute(
        """
        SELECT DISTINCT n.fields->>'term' AS term
        FROM note n
        WHERE n.subject_id = %(subject)s
          AND n.fields->>'term' IS NOT NULL
          AND EXISTS (SELECT 1 FROM card c WHERE c.note_id = n.id AND c.owner_id = %(owner)s)
          AND EXISTS (SELECT 1 FROM domain_claim d WHERE d.note_id = n.id AND d.domain = %(domain)s)
          AND EXISTS (SELECT 1 FROM level_claim l WHERE l.note_id = n.id AND l.level = %(level)s)
        ORDER BY term;
        """,
        {"subject": subject_id, "owner": owner_id, "domain": request.domain, "level": request.level},
    ).fetchall()
    return [row[0] for row in rows]


def record_seed_spend(
    connection: psycopg.Connection,
    seed_id: str,
    generation: Generation,
    *,
    excluded: int,
    environment: str,
) -> None:
    """ADR 0070 §2's ledger row — **from the API response, never estimated**.

    ⚠️ **Accumulated**, as `ingest.record_spend` is: a claim swept back after the
    request was billed and before the answer was written is asked again, and
    both charges are real.
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
        UPDATE seed SET
          model_id = %(model_id)s,
          prompt_version = %(prompt_version)s,
          worker_environment = %(environment)s,
          excluded_term_count = %(excluded)s,
          price_table_effective_date = %(effective_date)s,
          input_tokens = coalesce(input_tokens, 0) + %(input_tokens)s,
          output_tokens = coalesce(output_tokens, 0) + %(output_tokens)s,
          cost_micro_usd = coalesce(cost_micro_usd, 0) + %(cost)s
        WHERE id = %(id)s;
        """,
        {
            "id": seed_id,
            "model_id": generation.model_id,
            "prompt_version": SEED_PROMPT_VERSION,
            "environment": environment,
            "excluded": excluded,
            "effective_date": table.effective_date,
            "input_tokens": generation.input_tokens,
            "output_tokens": generation.output_tokens,
            "cost": cost,
        },
    )


def write_draft(connection: psycopg.Connection, seed_id: str, draft: list[str]) -> None:
    connection.execute(
        "UPDATE seed SET terms = %s, completed_at = now() WHERE id = %s;",
        (draft, seed_id),
    )


def run_seed(
    connection: psycopg.Connection,
    job: ClaimedJob,
    *,
    provider: Provider,
    declaration: Declaration,
    environment: str,
    log: Callable[..., None] = events.log,
) -> None:
    """Answer one claimed `seed` job. A raise fails the job (`jobs.drain`), and
    its message is what *Ingest* shows under the request.

    ⚠️ **A discarded seed spends nothing.** The reader may discard a draft that
    is still queued, and reading `discarded_at` here, before the request, is
    what makes that free (`server/utils/ingest/seed.ts`).
    """
    if job.seed_id is None:
        raise LookupError(f"job {job.id} is a seed job with no seed")

    seed = read_seed(connection, job.seed_id)
    if seed is None or seed.discarded_at is not None or seed.completed_at is not None:
        log("seed.skipped", seed=str(job.seed_id), job=str(job.id))
        return

    known = known_terms(
        connection, seed.request, subject_id=seed.subject_id, owner_id=seed.requested_by
    )
    request = request_for(declaration, seed.request, known=known)

    try:
        generation = provider.generate(request, keepalive=keepalive(connection, job))
    except ProviderRefused as refused:
        if refused.spent is not None:
            record_seed_spend(
                connection, seed.id, refused.spent, excluded=len(known), environment=environment
            )
        raise

    record_seed_spend(connection, seed.id, generation, excluded=len(known), environment=environment)
    draft = draft_from(generation.payload, count=seed.request.count, known=known)
    write_draft(connection, seed.id, draft)

    log(
        "seed.drafted",
        seed=seed.id,
        job=str(job.id),
        asked=seed.request.count,
        words=len(draft),
        excluded=len(known),
    )
