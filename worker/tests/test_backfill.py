"""The accepted-meanings backfill — ADR 0069 §3, #28 (`worker/backfill.py`).

⚠️ **No test here spends or can.** The provider is a stand-in that answers from
the prompt (`11` §7), and the estimate's token counter is a function passed in.
The pure half — what is asked and how the answer maps back — runs without
Docker; the rest needs the container, because *resumable* is a property of SQL.
"""

from __future__ import annotations

import json
import re

import psycopg
import pytest

import backfill
from backfill import (
    BACKFILL_PROMPT_VERSION,
    BATCH_SIZE,
    Pending,
    count_pending,
    estimate,
    lists_from,
    request_for,
    run,
)
from provider import Generation, ProviderRefused

LINE = re.compile(r"^(\d+)\. term=(\S+) ", re.MULTILINE)

見る = Pending("0199a1b2-0000-7000-8000-000000000001", "見る", "みる", "to see/have (a dream)")
夢 = Pending("0199a1b2-0000-7000-8000-000000000002", "夢", "ゆめ", "dream")


class FakeProvider:
    """Answers every numbered line with a list built from its term, unless told
    to leave some out or to refuse."""

    model_id = "claude-sonnet-5"

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.omit: set[str] = set()
        self.refuse_after: int | None = None

    def generate(self, request, *, keepalive=None) -> Generation:
        if self.refuse_after is not None and len(self.calls) >= self.refuse_after:
            raise ProviderRefused("the model declined this batch")
        self.calls.append(request.prompt)
        notes = [
            {"id": number, "meanings": [f"sense of {term}", "another"]}
            for number, term in LINE.findall(request.prompt)
            if term not in self.omit
        ]
        return Generation(payload={"notes": notes}, model_id=self.model_id, input_tokens=900, output_tokens=300)


# ---------------------------------------------------------------------------
# What is asked, and how the answer maps back — no database
# ---------------------------------------------------------------------------


def test_the_prompt_carries_each_note_as_a_numbered_line_and_nothing_else_about_it() -> None:
    prompt = request_for([見る, 夢]).prompt

    assert "1. term=見る reading=みる meaning=to see/have (a dream)" in prompt
    assert "2. term=夢 reading=ゆめ meaning=dream" in prompt
    assert 見る.note_id not in prompt


def test_the_answer_maps_back_by_line_number() -> None:
    payload = {"notes": [{"id": "2", "meanings": ["dream"]}, {"id": "1", "meanings": ["see", "look"]}]}

    assert lists_from([見る, 夢], payload) == {見る.note_id: ("see", "look"), 夢.note_id: ("dream",)}


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {"notes": "no"},
        {"notes": [{"id": "9", "meanings": ["see"]}]},
        {"notes": [{"id": "1", "meanings": []}]},
        {"notes": [{"id": "1", "meanings": "see"}]},
    ],
)
def test_an_answer_it_cannot_use_leaves_the_note_pending_rather_than_raising(payload) -> None:
    assert lists_from([見る], payload) == {}


# ---------------------------------------------------------------------------
# The database half — needs the container
# ---------------------------------------------------------------------------


def seed(connection: psycopg.Connection, count: int) -> list[str]:
    ids = []
    for index in range(count):
        fields = {"term": f"語{index}", "reading": "ご", "meaning": f"word {index}"}
        (note_id,) = connection.execute(
            """
            INSERT INTO note (subject_id, identity_key, fields)
            VALUES ('jlpt-vocab', %s, %s::jsonb)
            RETURNING id::text;
            """,
            (f"語{index}\x1fご", json.dumps(fields, ensure_ascii=False)),
        ).fetchone()
        ids.append(note_id)
    return ids


def lists(connection: psycopg.Connection) -> dict[str, tuple[list[str], str]]:
    rows = connection.execute("SELECT note_id::text, meanings, prompt_version FROM note_meaning;").fetchall()
    return {note_id: (meanings, version) for note_id, meanings, version in rows}


def test_it_writes_a_list_for_every_note_without_one_and_never_touches_the_fields(connection):
    ids = seed(connection, BATCH_SIZE + 3)
    before = connection.execute("SELECT id::text, fields FROM note ORDER BY id;").fetchall()

    result = run(connection, FakeProvider())

    assert result.written == len(ids)
    assert result.requests == 2
    assert set(lists(connection)) == set(ids)
    assert {version for _, version in lists(connection).values()} == {BACKFILL_PROMPT_VERSION}
    assert connection.execute("SELECT id::text, fields FROM note ORDER BY id;").fetchall() == before


def test_a_list_generate_already_wrote_stands(connection):
    (first, second) = seed(connection, 2)
    connection.execute(
        "INSERT INTO note_meaning (note_id, meanings, model_id, prompt_version) VALUES (%s, %s, 'm', 'v5');",
        (first, ["kept"]),
    )

    run(connection, FakeProvider())

    assert lists(connection)[first] == (["kept"], "v5")
    assert second in lists(connection)


def test_a_run_stopped_half_way_resumes_with_only_what_is_left(connection):
    """⚠️ **Resumable by construction**: the first batch is written when its
    answer arrives, so a refusal on the second loses nothing, and the next run
    asks only about the rest."""
    ids = seed(connection, BATCH_SIZE + 5)
    stopping = FakeProvider()
    stopping.refuse_after = 1

    with pytest.raises(ProviderRefused):
        run(connection, stopping)

    assert len(lists(connection)) == BATCH_SIZE
    assert count_pending(connection) == 5

    again = FakeProvider()
    result = run(connection, again)

    assert result.written == 5
    assert len(again.calls) == 1
    assert set(lists(connection)) == set(ids)
    assert run(connection, FakeProvider()).requests == 0


def test_a_note_the_model_leaves_out_is_asked_once_per_run_and_stays_pending(connection):
    seed(connection, 3)
    provider = FakeProvider()
    provider.omit = {"語1"}

    result = run(connection, provider)

    assert (result.written, result.unanswered, len(provider.calls)) == (2, 1, 1)
    assert count_pending(connection) == 1


def test_the_limit_stops_the_spend(connection):
    seed(connection, 10)

    result = run(connection, FakeProvider(), limit=4)

    assert result.written == 4
    assert count_pending(connection) == 6


def test_the_estimate_counts_every_batch_and_writes_nothing(connection):
    seed(connection, BATCH_SIZE * 2 + 1)
    counted: list[str] = []

    found = estimate(
        connection,
        count_tokens=lambda request: counted.append(request.prompt) or 1000,
        model_id="claude-sonnet-5",
    )

    assert (found.notes, found.requests, found.input_tokens) == (BATCH_SIZE * 2 + 1, 3, 3000)
    assert found.output_tokens_high == 2 * found.output_tokens_low
    assert found.cost_micro_usd(high=False) < found.cost_micro_usd(high=True)
    assert lists(connection) == {}
    assert len(counted) == 3


def test_with_no_flag_it_does_nothing(capsys, monkeypatch):
    """⚠️ The spend is `--run`, and a bare invocation must not reach it — nor
    even read the environment."""
    monkeypatch.setattr(backfill.db, "require_direct_url", lambda: pytest.fail("read the database"))

    assert backfill.main([]) == 0
    assert "--estimate" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# Its line in the spend ledger — `10` §8.3, `04` §6.6
# ---------------------------------------------------------------------------


def ledger(connection: psycopg.Connection) -> list[tuple]:
    return connection.execute(
        """
        SELECT prompt_version, model_id, request_count, written, input_tokens, output_tokens,
               cost_micro_usd, price_table_effective_date IS NOT NULL, worker_environment,
               completed_at IS NOT NULL
        FROM backfill ORDER BY requested_at;
        """
    ).fetchall()


def test_a_run_is_one_ledger_row_carrying_every_request_it_paid_for(connection):
    seed(connection, BATCH_SIZE + 3)

    run(connection, FakeProvider(), environment="server")

    cost = backfill.cost_micro_usd("claude-sonnet-5", input_tokens=1800, output_tokens=600)
    assert ledger(connection) == [
        (BACKFILL_PROMPT_VERSION, "claude-sonnet-5", 2, BATCH_SIZE + 3, 1800, 600, cost, True, "server", True)
    ]


def test_a_run_with_nothing_to_ask_writes_no_ledger_row(connection):
    run(connection, FakeProvider())

    assert ledger(connection) == []


def test_a_run_stopped_half_way_keeps_what_it_already_spent(connection):
    """⚠️ **The spend is written with the lists, in the same transaction**, so a
    run that dies after a billed batch still shows that batch — and the run that
    finishes the job is a second row, because it is a second spend."""
    seed(connection, BATCH_SIZE + 5)
    stopping = FakeProvider()
    stopping.refuse_after = 1

    with pytest.raises(ProviderRefused):
        run(connection, stopping)

    [stopped] = ledger(connection)
    assert (stopped[2], stopped[3], stopped[4], stopped[9]) == (1, BATCH_SIZE, 900, False)

    run(connection, FakeProvider())

    assert [(row[2], row[3], row[9]) for row in ledger(connection)] == [(1, BATCH_SIZE, False), (1, 5, True)]
