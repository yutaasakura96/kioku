"""The *seed* — ADR 0070, #25 (`worker/seeding.py`).

⚠️ **No test here spends or can.** The provider is a stand-in (`11` §7). The
pure half — what is asked and how the answer becomes a draft — runs without
Docker; the rest needs the container, because the exclusion list, the ledger
row and the job are SQL.
"""

from __future__ import annotations

import psycopg
import pytest

from jobs import drain
from provider import Generation, ProviderRefused, ProviderUnavailable
from seeding import (
    SEED_PROMPT_VERSION,
    NotAWordList,
    SeedRequest,
    draft_from,
    known_terms,
    request_for,
    run_seed,
)
from subject import load_declaration

DECLARATION = load_declaration()
REQUEST = SeedRequest(domain="tech", level="N3", count=5)
OWNER = "usr_seed"


class FakeProvider:
    """Answers with the words it was given, or refuses."""

    model_id = "claude-sonnet-5"

    def __init__(self, words: list[str] | None = None) -> None:
        self.words = ["会議", "予算", "資料", "締め切り", "報告"] if words is None else words
        self.calls: list[str] = []
        self.refuse: ProviderRefused | ProviderUnavailable | None = None
        self.beats = 0

    def generate(self, request, *, keepalive=None) -> Generation:
        self.calls.append(request.prompt)
        if keepalive is not None:
            keepalive()
            self.beats += 1
        if self.refuse is not None:
            raise self.refuse
        return Generation(
            payload={"words": self.words}, model_id=self.model_id, input_tokens=800, output_tokens=120
        )


# ---------------------------------------------------------------------------
# What is asked — no database
# ---------------------------------------------------------------------------


def test_the_prompt_names_the_domain_the_level_and_the_count() -> None:
    prompt = request_for(DECLARATION, REQUEST, known=[]).prompt
    assert "tech" in prompt
    assert "N3" in prompt
    assert "5" in prompt


def test_the_prompt_lists_every_known_term_so_the_model_proposes_new_ones() -> None:
    """ADR 0070 §4 — every one, not a sample, until the revisit condition says
    otherwise."""
    prompt = request_for(DECLARATION, REQUEST, known=["会議", "予算"]).prompt
    assert "会議" in prompt
    assert "予算" in prompt


def test_with_nothing_known_the_prompt_carries_no_exclusion_section() -> None:
    assert "ALREADY KNOWN" not in request_for(DECLARATION, REQUEST, known=[]).prompt
    assert "ALREADY KNOWN" in request_for(DECLARATION, REQUEST, known=["会議"]).prompt


def test_the_schema_asks_for_a_list_of_terms() -> None:
    schema = request_for(DECLARATION, REQUEST, known=[]).schema
    assert schema["required"] == ["words"]
    assert schema["properties"]["words"]["items"] == {"type": "string"}


def test_a_request_outside_the_subjects_sets_is_refused_before_anything_is_asked() -> None:
    with pytest.raises(ValueError):
        request_for(DECLARATION, SeedRequest(domain="cooking", level="N3", count=5), known=[])
    with pytest.raises(ValueError):
        request_for(DECLARATION, SeedRequest(domain="tech", level="N6", count=5), known=[])


# ---------------------------------------------------------------------------
# How the answer becomes a draft — no database
# ---------------------------------------------------------------------------


def test_the_draft_is_the_words_in_the_order_they_came() -> None:
    assert draft_from({"words": ["会議", "予算"]}, count=5, known=[]) == ["会議", "予算"]


def test_the_draft_drops_blanks_duplicates_and_what_is_already_known() -> None:
    """`filter_known` is the backstop for a model that repeats a known word;
    this keeps the repeat off the reader's screen too."""
    words = ["会議", " ", "予算", "会議", "資料"]
    assert draft_from({"words": words}, count=5, known=["資料"]) == ["会議", "予算"]


def test_the_draft_trims_each_word() -> None:
    assert draft_from({"words": [" 会議　"]}, count=5, known=[]) == ["会議"]


def test_a_word_that_is_not_one_line_is_dropped() -> None:
    """A newline would make one word two lines of the *source*, and a tab is the
    word-list column separator (ADR 0068 §3)."""
    assert draft_from({"words": ["会議\n予算", "資料\tしりょう", "報告"]}, count=5, known=[]) == ["報告"]


def test_the_draft_is_cut_at_the_count() -> None:
    assert draft_from({"words": ["一", "二", "三", "四"]}, count=2, known=[]) == ["一", "二"]


@pytest.mark.parametrize(
    "payload",
    [{}, {"words": "会議"}, {"words": [1, 2]}, [], None],
)
def test_an_answer_that_is_not_a_word_list_is_refused_by_name(payload) -> None:
    with pytest.raises(NotAWordList):
        draft_from(payload, count=5, known=[])


# ---------------------------------------------------------------------------
# The database half — needs the container
# ---------------------------------------------------------------------------


def make_seed(connection: psycopg.Connection, *, count: int = 5, requested_by: str | None = OWNER) -> str:
    connection.execute(
        """
        INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (%s, 'Reader', 'seed@example.test', true, now(), now())
        ON CONFLICT (id) DO NOTHING;
        """,
        (OWNER,),
    )
    seed_id = connection.execute(
        """
        INSERT INTO seed (subject_id, domain, level, count, requested_by)
        VALUES ('jlpt-vocab', 'tech', 'N3', %s, %s) RETURNING id;
        """,
        (count, requested_by),
    ).fetchone()[0]
    connection.execute(
        "INSERT INTO job (kind, seed_id, requested_by) VALUES ('seed', %s, %s);",
        (seed_id, requested_by),
    )
    return str(seed_id)


def known_note(
    connection: psycopg.Connection,
    term: str,
    *,
    domain: str = "tech",
    level: str = "N3",
    card_for: str | None = OWNER,
) -> str:
    """A *note* with a model's *domain* and *level* claims, and a *card* when
    ``card_for`` names an owner."""
    note_id = connection.execute(
        """
        INSERT INTO note (subject_id, identity_key, fields)
        VALUES ('jlpt-vocab', %s, jsonb_build_object('term', %s::text)) RETURNING id;
        """,
        (f"{term}\x1f{term}", term),
    ).fetchone()[0]
    connection.execute(
        "INSERT INTO domain_claim (note_id, domain, model_id, prompt_version) VALUES (%s, %s, 'm', 'v5');",
        (note_id, domain),
    )
    connection.execute(
        "INSERT INTO level_claim (note_id, level, model_id, prompt_version) VALUES (%s, %s, 'm', 'v5');",
        (note_id, level),
    )
    if card_for is not None:
        connection.execute(
            "INSERT INTO card (note_id, owner_id, template_key) VALUES (%s, %s, 'recognition');",
            (note_id, card_for),
        )
    return str(note_id)


def seed_row(connection: psycopg.Connection, seed_id: str):
    return connection.execute(
        """
        SELECT terms, completed_at IS NOT NULL, model_id, prompt_version, input_tokens,
               output_tokens, cost_micro_usd, price_table_effective_date, excluded_term_count,
               worker_environment
        FROM seed WHERE id = %s;
        """,
        (seed_id,),
    ).fetchone()


def job_row(connection: psycopg.Connection, seed_id: str):
    return connection.execute(
        "SELECT state, last_error FROM job WHERE seed_id = %s;", (seed_id,)
    ).fetchone()


def drain_seeds(connection: psycopg.Connection, provider: FakeProvider) -> int:
    return drain(
        connection,
        owner="test-worker",
        handle=lambda conn, job: run_seed(
            conn, job, provider=provider, declaration=DECLARATION, environment="laptop"
        ),
    )


def test_a_claimed_seed_writes_its_draft_and_its_ledger_row(connection) -> None:
    seed_id = make_seed(connection)
    provider = FakeProvider()

    assert drain_seeds(connection, provider) == 1

    row = seed_row(connection, seed_id)
    assert row[0] == ["会議", "予算", "資料", "締め切り", "報告"]
    assert row[1] is True
    assert row[2:6] == ("claude-sonnet-5", SEED_PROMPT_VERSION, 800, 120)
    # $2/MTok in, $10/MTok out (`prices.py`): 1,600 + 1,200 micro-USD.
    assert row[6] == 2800
    assert row[7] is not None
    assert row[8] == 0
    assert row[9] == "laptop"
    assert job_row(connection, seed_id) == ("done", None)


def test_it_heartbeats_while_the_model_answers(connection) -> None:
    """ADR 0061: the stream carries the keepalive, as a *chunk*'s does."""
    make_seed(connection)
    provider = FakeProvider()
    drain_seeds(connection, provider)
    assert provider.beats == 1


def test_the_exclusion_list_is_the_requesters_terms_for_that_domain_and_level(connection) -> None:
    """ADR 0070 §4 — *the owner's existing terms whose `domain_claim` and
    `level_claim` match*."""
    make_seed(connection)
    known_note(connection, "会議")
    known_note(connection, "予算", domain="business")
    known_note(connection, "資料", level="N2")
    # ⚠️ **A *note* with no *card* is not excluded**, and on purpose: it is a
    # *pending* one from the first prose run, and proposing it mints it from the
    # cache at no generation cost (ADR 0063).
    known_note(connection, "報告", card_for=None)

    assert known_terms(connection, REQUEST, subject_id="jlpt-vocab", owner_id=OWNER) == ["会議"]


def test_known_terms_are_sent_counted_and_kept_off_the_draft(connection) -> None:
    seed_id = make_seed(connection)
    known_note(connection, "会議")
    provider = FakeProvider()

    drain_seeds(connection, provider)

    assert "会議" in provider.calls[0]
    row = seed_row(connection, seed_id)
    assert row[8] == 1
    assert "会議" not in row[0]


def test_a_seed_nobody_owns_excludes_nothing(connection) -> None:
    seed_id = make_seed(connection, requested_by=None)
    known_note(connection, "会議")
    drain_seeds(connection, FakeProvider())
    assert seed_row(connection, seed_id)[8] == 0


def test_a_seed_discarded_before_it_was_claimed_spends_nothing(connection) -> None:
    seed_id = make_seed(connection)
    connection.execute("UPDATE seed SET discarded_at = now() WHERE id = %s;", (seed_id,))
    provider = FakeProvider()

    drain_seeds(connection, provider)

    assert provider.calls == []
    assert seed_row(connection, seed_id)[1] is False
    assert job_row(connection, seed_id) == ("done", None)


def test_a_seed_already_answered_is_not_asked_again(connection) -> None:
    """A claim swept back after the answer was written but before `done`."""
    seed_id = make_seed(connection)
    connection.execute(
        "UPDATE seed SET completed_at = now(), terms = ARRAY['会議'] WHERE id = %s;", (seed_id,)
    )
    provider = FakeProvider()

    drain_seeds(connection, provider)

    assert provider.calls == []
    assert seed_row(connection, seed_id)[0] == ["会議"]


def test_a_refused_answer_is_still_counted_and_the_job_fails(connection) -> None:
    """ADR 0070 §2: the money is spent whether or not the answer was usable."""
    seed_id = make_seed(connection)
    provider = FakeProvider()
    provider.refuse = ProviderRefused(
        "the answer was cut off at 16000 output tokens",
        spent=Generation(payload={}, model_id="claude-sonnet-5", input_tokens=800, output_tokens=16000),
    )

    drain_seeds(connection, provider)

    row = seed_row(connection, seed_id)
    assert row[1] is False
    assert (row[4], row[5]) == (800, 16000)
    assert job_row(connection, seed_id) == ("failed", "the answer was cut off at 16000 output tokens")


def test_an_unreachable_provider_fails_the_job_without_naming_the_vendor(connection) -> None:
    seed_id = make_seed(connection)
    provider = FakeProvider()
    provider.refuse = ProviderUnavailable("the model provider answered 529 after 3 attempts")

    drain_seeds(connection, provider)

    state, error = job_row(connection, seed_id)
    assert state == "failed"
    assert "Anthropic" not in error
    assert seed_row(connection, seed_id)[6] is None


def test_an_answer_that_is_not_a_word_list_fails_the_job_and_keeps_its_cost(connection) -> None:
    seed_id = make_seed(connection)

    class Garbled(FakeProvider):
        def generate(self, request, *, keepalive=None) -> Generation:
            return Generation(payload={"notes": []}, model_id=self.model_id, input_tokens=800, output_tokens=5)

    drain_seeds(connection, Garbled())

    assert job_row(connection, seed_id)[0] == "failed"
    assert seed_row(connection, seed_id)[4] == 800


def test_an_empty_draft_is_still_an_answer(connection) -> None:
    """Every proposal already known: the draft is empty, and *Ingest* says so."""
    seed_id = make_seed(connection)
    known_note(connection, "会議")
    drain_seeds(connection, FakeProvider(words=["会議"]))
    row = seed_row(connection, seed_id)
    assert row[0] == []
    assert row[1] is True
