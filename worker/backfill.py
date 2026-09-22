"""The accepted-meanings backfill — [ADR 0069](../docs/adr/0069-the-check-is-the-grade.md) §3, #28.

`cd worker && uv run --env-file .env python backfill.py --estimate`, then, once
the estimate is approved, `... python backfill.py --run`.

Every *note* written before `PROMPT_VERSION` v5 has no `note_meaning` row: the
*cards* already minted and the cached *pending notes* ADR 0063 turned into the
source of future *cards*. The check still works on them — it falls back to
splitting `meaning` — but that fallback is the 見る/look failure ADR 0069 was
written for. This asks a model for each such *note*'s list, a batch at a time.

⚠️ **It spends money, so it does nothing by default.** With no flag it prints
how to use it. `--estimate` counts the prompts with the provider's free
token-counting endpoint and prices them; it writes nothing and spends nothing.
`--run` is the spend, and it is Yuta's call after reading the estimate (#28).

⚠️ **Resumable by construction.** A *note* is selected only while it has no
`note_meaning` row, and each batch's rows are written in one transaction when its
answer arrives — so a run stopped half-way leaves finished batches finished, and
running it again finds only what is left. `ON CONFLICT DO NOTHING` means a
*note* `generate` reached in the meantime keeps `generate`'s list.

⚠️ **The list only, and never `note.fields`** (ADR 0052). The model is shown the
*note*'s term, reading and gloss and asked for nothing else.

⚠️ **Nothing here is logged but counts and money** — `03` §11: never a note
field, never a connection string, never a key.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Mapping, Sequence

import psycopg

import db
import prices
import provider as provider_module
from events import log
from ingest import resolve_worker_environment
from pipeline.generate import MAX_OUTPUT_TOKENS, GenerationRequest, clean_meanings
from prices import cost_micro_usd
from provider import Generation

#: ⚠️ **Not `PROMPT_VERSION`.** This is a different question from `generate`'s —
#: a list for a *note* that already exists, asked from its gloss rather than a
#: passage — so `note_meaning.prompt_version` says which of the two wrote a row.
BACKFILL_PROMPT_VERSION = "backfill-v1"

#: Notes per request. Each is one short line in and one short list out, so forty
#: is a small prompt and an answer well inside :data:`MAX_OUTPUT_TOKENS`.
BATCH_SIZE = 40

#: ⚠️ **The output side of the estimate is an assumption, not a measurement** —
#: the endpoint counts input only. A list of up to six short strings plus the
#: JSON around it and the echoed id; the high figure doubles it.
OUTPUT_TOKENS_PER_NOTE = 30


@dataclass(frozen=True)
class Pending:
    """A *note* with no list yet — the three fields the question needs."""

    note_id: str
    term: str
    reading: str
    meaning: str


def select_pending(
    connection: psycopg.Connection, *, limit: int, skip: Sequence[str] = ()
) -> list[Pending]:
    """The next *notes* without a `note_meaning` row, oldest first.

    ``skip`` is the *notes* this run already asked about and got no usable list
    for: without it a *note* the model keeps leaving out would be selected
    forever.
    """
    rows = connection.execute(
        """
        SELECT n.id::text, n.fields->>'term', n.fields->>'reading', n.fields->>'meaning'
        FROM note n
        LEFT JOIN note_meaning m ON m.note_id = n.id
        WHERE m.note_id IS NULL
          AND n.fields->>'meaning' IS NOT NULL
          AND NOT (n.id::text = ANY(%s))
        ORDER BY n.created_at, n.id
        LIMIT %s;
        """,
        (list(skip), limit),
    ).fetchall()
    return [Pending(note_id, term or "", reading or "", meaning) for note_id, term, reading, meaning in rows]


def count_pending(connection: psycopg.Connection) -> int:
    (n,) = connection.execute(
        """
        SELECT count(*) FROM note n
        LEFT JOIN note_meaning m ON m.note_id = n.id
        WHERE m.note_id IS NULL AND n.fields->>'meaning' IS NOT NULL;
        """
    ).fetchone()
    return int(n)


def output_schema() -> dict[str, Any]:
    """One entry per numbered line: its number back, and the list."""
    return {
        "type": "object",
        "properties": {
            "notes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "meanings": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["id", "meanings"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["notes"],
        "additionalProperties": False,
    }


def request_for(batch: Sequence[Pending]) -> GenerationRequest:
    """⚠️ **Numbered lines, not *note* ids.** A uuid per line would triple the
    prompt, and the number maps back through ``batch`` exactly."""
    listed = "\n".join(
        f"{index + 1}. term={pending.term} reading={pending.reading} meaning={pending.meaning}"
        for index, pending in enumerate(batch)
    )
    prompt = (
        "You are helping a Japanese learner's flashcard app check typed answers.\n\n"
        "Each line below is a vocabulary word with the English meaning the card "
        "shows. For each, write `meanings`: a list of two to six short English "
        "answers, any of which a learner who knows the word might type when asked "
        "what it means. Single words or short phrases, no articles, no "
        "explanations. Include the plain words inside the given meaning and its "
        "common near-synonyms — for 見る with meaning `to see`: see, look, watch, "
        "view. Stay within the sense the given meaning names.\n\n"
        "WORDS\n"
        f"{listed}\n\n"
        "One entry per line, with `id` set to the line's number as a string. "
        "Write nothing else."
    )
    return GenerationRequest(prompt=prompt, schema=output_schema(), max_tokens=MAX_OUTPUT_TOKENS)


def lists_from(batch: Sequence[Pending], payload: Any) -> dict[str, tuple[str, ...]]:
    """The answer mapped back to *note* ids — ⚠️ **never raises**: an entry with
    an id nobody asked about, or a list that cleans to nothing, is dropped, and
    its *note* is simply still pending."""
    if not isinstance(payload, dict) or not isinstance(payload.get("notes"), list):
        return {}
    by_number = {str(index + 1): pending for index, pending in enumerate(batch)}
    found: dict[str, tuple[str, ...]] = {}
    for entry in payload["notes"]:
        if not isinstance(entry, dict):
            continue
        pending = by_number.get(str(entry.get("id")))
        meanings = clean_meanings(entry.get("meanings"))
        if pending is not None and meanings and pending.note_id not in found:
            found[pending.note_id] = meanings
    return found


def write_lists(
    connection: psycopg.Connection, lists: Mapping[str, Sequence[str]], *, model_id: str
) -> int:
    """One batch's rows in one transaction. ⚠️ `ON CONFLICT DO NOTHING`: a list
    already there — `generate`'s, or an earlier run's — stands."""
    written = 0
    with connection.transaction():
        for note_id, meanings in lists.items():
            result = connection.execute(
                """
                INSERT INTO note_meaning (note_id, meanings, model_id, prompt_version)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING;
                """,
                (note_id, list(meanings), model_id, BACKFILL_PROMPT_VERSION),
            )
            written += result.rowcount
    return written


def record_spend(
    connection: psycopg.Connection,
    backfill_id: str | None,
    generation: Generation,
    *,
    written: int,
    environment: str,
) -> str:
    """`04` §6.6's ledger row — **from the API response, never estimated** —
    created by the first answered batch and added to by each one after it.

    ⚠️ **Called inside the transaction that writes the batch's lists**, so the
    ledger never shows a batch whose lists are missing, or the reverse.
    """
    table = prices.current_prices()
    cost = cost_micro_usd(
        generation.model_id,
        input_tokens=generation.input_tokens,
        output_tokens=generation.output_tokens,
        table=table,
    )
    values = {
        "id": backfill_id,
        "prompt_version": BACKFILL_PROMPT_VERSION,
        "model_id": generation.model_id,
        "written": written,
        "input_tokens": generation.input_tokens,
        "output_tokens": generation.output_tokens,
        "cost": cost,
        "effective_date": table.effective_date,
        "environment": environment,
    }
    if backfill_id is None:
        (created,) = connection.execute(
            """
            INSERT INTO backfill
              (prompt_version, model_id, request_count, written, input_tokens, output_tokens,
               cost_micro_usd, price_table_effective_date, worker_environment)
            VALUES (%(prompt_version)s, %(model_id)s, 1, %(written)s, %(input_tokens)s,
                    %(output_tokens)s, %(cost)s, %(effective_date)s, %(environment)s)
            RETURNING id::text;
            """,
            values,
        ).fetchone()
        return created
    connection.execute(
        """
        UPDATE backfill SET
          model_id = %(model_id)s,
          request_count = request_count + 1,
          written = written + %(written)s,
          input_tokens = input_tokens + %(input_tokens)s,
          output_tokens = output_tokens + %(output_tokens)s,
          cost_micro_usd = cost_micro_usd + %(cost)s,
          price_table_effective_date = %(effective_date)s
        WHERE id = %(id)s;
        """,
        values,
    )
    return backfill_id


def batches(connection: psycopg.Connection) -> Iterable[list[Pending]]:
    """Every pending *note*, :data:`BATCH_SIZE` at a time, read once — for the
    estimate, which writes nothing and so cannot page by what it wrote."""
    offset_skip: list[str] = []
    while True:
        batch = select_pending(connection, limit=BATCH_SIZE, skip=offset_skip)
        if not batch:
            return
        offset_skip.extend(pending.note_id for pending in batch)
        yield batch


@dataclass(frozen=True)
class Estimate:
    notes: int
    requests: int
    input_tokens: int
    output_tokens_low: int
    output_tokens_high: int
    model_id: str

    def cost_micro_usd(self, *, high: bool) -> int:
        return cost_micro_usd(
            self.model_id,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens_high if high else self.output_tokens_low,
        )


def estimate(
    connection: psycopg.Connection,
    *,
    count_tokens: Callable[[GenerationRequest], int],
    model_id: str,
) -> Estimate:
    """⚠️ **Spends nothing.** ``count_tokens`` is the provider's free endpoint
    (:meth:`provider.AnthropicProvider.count_input_tokens`), called once per batch
    on the exact prompt ``--run`` would send."""
    notes = requests = input_tokens = 0
    for batch in batches(connection):
        notes += len(batch)
        requests += 1
        input_tokens += count_tokens(request_for(batch))
    low = notes * OUTPUT_TOKENS_PER_NOTE
    return Estimate(notes, requests, input_tokens, low, low * 2, model_id)


@dataclass(frozen=True)
class RunResult:
    written: int
    requests: int
    unanswered: int
    input_tokens: int
    output_tokens: int


def run(
    connection: psycopg.Connection,
    generator: provider_module.Provider,
    *,
    limit: int | None = None,
    environment: str = "laptop",
) -> RunResult:
    """The spend. Stops when nothing is left, or after ``limit`` *notes*.

    Each answered batch writes its lists and its ledger line together; the row
    is marked complete only when a run finds nothing left to ask.
    """
    written = requests = input_tokens = output_tokens = 0
    backfill_id: str | None = None
    exhausted = False
    unanswered: list[str] = []
    asked = 0
    while limit is None or asked < limit:
        size = BATCH_SIZE if limit is None else min(BATCH_SIZE, limit - asked)
        batch = select_pending(connection, limit=size, skip=unanswered)
        if not batch:
            exhausted = True
            break
        generation = generator.generate(request_for(batch))
        requests += 1
        asked += len(batch)
        input_tokens += generation.input_tokens
        output_tokens += generation.output_tokens
        lists = lists_from(batch, generation.payload)
        with connection.transaction():
            batch_written = write_lists(connection, lists, model_id=generation.model_id)
            backfill_id = record_spend(
                connection, backfill_id, generation, written=batch_written, environment=environment
            )
        written += batch_written
        unanswered.extend(pending.note_id for pending in batch if pending.note_id not in lists)
        log(
            "backfill.batch",
            notes=len(batch),
            written=len(lists),
            input_tokens=generation.input_tokens,
            output_tokens=generation.output_tokens,
            cost_micro_usd=cost_micro_usd(
                generation.model_id,
                input_tokens=generation.input_tokens,
                output_tokens=generation.output_tokens,
            ),
        )
    if exhausted and backfill_id is not None:
        connection.execute("UPDATE backfill SET completed_at = now() WHERE id = %s;", (backfill_id,))
    return RunResult(written, requests, len(unanswered), input_tokens, output_tokens)


def _usd(micro: int) -> str:
    return f"${micro / 1_000_000:.4f}"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--estimate", action="store_true", help="count and price; spend nothing")
    mode.add_argument("--run", action="store_true", help="ask the model and write the lists")
    parser.add_argument("--limit", type=int, default=None, help="stop after this many notes")
    arguments = parser.parse_args(argv)

    if not (arguments.estimate or arguments.run):
        parser.print_help()
        return 0

    try:
        url = db.require_direct_url()
        generator = provider_module.require_provider()
        environment = resolve_worker_environment()
    except db.MisconfiguredWorker as error:
        log("backfill.misconfigured", reason=str(error))
        return 1

    with db.connect(url) as connection:
        if arguments.estimate:
            found = estimate(
                connection,
                count_tokens=generator.count_input_tokens,
                model_id=generator.model_id,
            )
            print(
                f"{found.notes} notes without a list, in {found.requests} requests to "
                f"{found.model_id}.\n"
                f"Input: {found.input_tokens} tokens (counted, free; the schema is not "
                "included).\n"
                f"Output: {found.output_tokens_low}–{found.output_tokens_high} tokens "
                f"(assumed {OUTPUT_TOKENS_PER_NOTE}–{OUTPUT_TOKENS_PER_NOTE * 2} per note).\n"
                f"Cost: {_usd(found.cost_micro_usd(high=False))}–"
                f"{_usd(found.cost_micro_usd(high=True))}."
            )
            return 0

        result = run(connection, generator, limit=arguments.limit, environment=environment)
        spent = cost_micro_usd(
            generator.model_id,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
        )
        log(
            "backfill.done",
            written=result.written,
            requests=result.requests,
            unanswered=result.unanswered,
            cost_micro_usd=spent,
        )
        print(
            f"Wrote {result.written} lists in {result.requests} requests for "
            f"{_usd(spent)}; {result.unanswered} notes came back without one and are "
            "still pending."
        )
        return 0


if __name__ == "__main__":
    sys.exit(main())
