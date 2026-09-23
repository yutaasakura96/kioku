"""Stages 6 and 7 wired to the database — #9 (`03` §5, §7, `04` §6.1, §6.3).

⚠️ **No test here calls a provider** (`11` §7). :class:`FakeProvider` satisfies
ADR 0018's boundary and answers from the prompt it was handed, which is also how
it proves the prompt carried what stage 7 then needs — a provider that could not
find a word in the prompt could not answer about it.

Needs the container: what is under test is the SQL around stages 6 and 7 — the
cache lookup, the spend ledger, and the writes one minted *note* is.

⚠️ **Nothing here asserts a threshold on *acceptance rate* or on output
quality**, and the absence is deliberate (ADR 0037, ADR 0018): the number has to
be free to fall, because a number that cannot fall is not a measurement. What is
asserted is that the figures are *recorded*, which is `03` §12's whole claim.
"""

from __future__ import annotations

import re

import psycopg
import pytest

import ingest
import prices
from db import MisconfiguredWorker
from ingest import CacheKey, make_chunk_processor, make_generator, read_generation_cache
from jobs import drain
from pipeline.generate import PROMPT_VERSION
from pipeline.tokenise import DICTIONARY_VERSION
from provider import Generation, ProviderRefused
from runs import run_ingestion
from seed import LIBRARY, OWNER, ledger, make_run, seed_note, spend

MODEL = "claude-sonnet-5"

#: Every `term=… reading=…` line the prompt lists, which is the contract
#: `pipeline.generate.build_prompt` and this fake share.
LISTED = re.compile(r"term=(\S+) reading=(\S+)")


class FakeProvider:
    """ADR 0018's boundary, answering from the prompt rather than from a model.

    ⚠️ **It reads the prompt to decide what to answer**, so a prompt that failed
    to list a *candidate* produces a response missing a note, which
    `pipeline.generate.notes_from` refuses by name. The stand-in cannot be more
    generous than the real contract.
    """

    def __init__(self, *, model_id: str = MODEL, tokens: tuple[int, int] = (1840, 620)) -> None:
        self.model_id = model_id
        self.calls: list[str] = []
        self._tokens = tokens
        #: Terms this provider refuses, so one *chunk* can fail while the others
        #: keep what they produced (`03` §5.4).
        self.refuse: set[str] = set()
        #: A term to answer about that no *candidate* asked for — ADR 0071's
        #: stray. ``None`` answers only what the prompt listed.
        self.stray: str | None = None
        #: ADR 0065's two claims, answered for every word. Settable so a test can
        #: make the model say something outside the declared set.
        self.level = "N3"
        self.domain = "tech"
        #: ADR 0069 §3's list, answered for every word. ``None`` omits the key,
        #: as a response from before v5 would.
        self.meanings: list | None = ["see", "look"]

    def generate(self, request, *, keepalive=None) -> Generation:
        self.calls.append(request.prompt)
        notes = []
        for term, reading in LISTED.findall(request.prompt):
            if term in self.refuse:
                raise ProviderRefused("the model declined this chunk")
            answer = {
                "term": term,
                "reading": reading,
                "meaning": f"meaning of {term}",
                "example_sentence": f"{term}です。",
                "example_gloss": f"It is {term}.",
                "level": self.level,
                "domain": self.domain,
            }
            if self.meanings is not None:
                answer["meanings"] = self.meanings
            notes.append(answer)
        if self.stray is not None:
            notes.append(
                {
                    "term": self.stray,
                    "reading": "しんぶん",
                    "meaning": f"meaning of {self.stray}",
                    "example_sentence": f"{self.stray}です。",
                    "example_gloss": f"It is {self.stray}.",
                    "level": self.level,
                    "domain": self.domain,
                }
            )
        return Generation(
            payload={"notes": notes},
            model_id=self.model_id,
            input_tokens=self._tokens[0],
            output_tokens=self._tokens[1],
        )


def run(
    connection: psycopg.Connection, provider, *, environment: str = "laptop", log=None
) -> int:
    generate = make_generator(
        provider,
        worker_environment=environment,
        **({} if log is None else {"log": log}),
    )
    return drain(
        connection,
        owner="w",
        handle=lambda conn, job: run_ingestion(
            conn, job, process_chunk=make_chunk_processor(job, generate=generate)
        ),
    )


def notes(connection: psycopg.Connection) -> dict[str, dict]:
    rows = connection.execute("SELECT identity_key, fields FROM note;").fetchall()
    return {identity_key: fields for identity_key, fields in rows}


def forget_the_corpus(connection: psycopg.Connection) -> None:
    """Empty the corpus and leave `generation_cache` standing.

    ⚠️ **Without this, every "the cache saved us" test passes for the wrong
    reason.** Re-ingesting an identical *source* asks the provider nothing —
    but that is **stage 5**, not `04` §6.3: the *notes* from the first run are in
    the corpus, so nothing survives to be generated and the cache is never
    consulted. To see the cache do its job there has to be a survivor *and* a
    stored answer for it, and that is what these two statements arrange.

    It is a real state rather than a contrivance: `04` §10 calls
    `generation_cache` the only table safe to truncate **because** the corpus is
    the thing that cannot be rebuilt — this is that sentence with the two halves
    the other way round.
    """
    connection.execute("DELETE FROM occurrence;")
    connection.execute("DELETE FROM card;")
    connection.execute("DELETE FROM note_vetting;")
    connection.execute("DELETE FROM note_field_provenance;")
    connection.execute("DELETE FROM note_meaning;")
    connection.execute("DELETE FROM note;")


# ---------------------------------------------------------------------------
# Stage 7 — what one minted *note* is (ADR 0064)
# ---------------------------------------------------------------------------


def test_a_generated_note_is_written_accepted_with_its_lookup_fields_intact(connection):
    """`04` §5.3 and §7.2 — the *note*, and the row that says the reader has it.

    ⚠️ **`term`, `reading` and `part_of_speech` are the tokeniser's** (ADR 0004),
    and the model echoed the first two only so this note could be matched to the
    group that asked for it.
    """
    ingestion_id = make_run(connection)

    run(connection, FakeProvider())

    written = notes(connection)
    assert LIBRARY in written
    assert written[LIBRARY]["term"] == "図書館"
    assert written[LIBRARY]["reading"] == "としょかん"
    assert written[LIBRARY]["part_of_speech"] == "名詞"
    assert written[LIBRARY]["meaning"] == "meaning of 図書館"

    state, origin = connection.execute(
        """
        SELECT v.state, n.origin_ingestion_id FROM note n
        JOIN note_vetting v ON v.note_id = n.id
        WHERE n.identity_key = %s AND v.owner_id = %s;
        """,
        (LIBRARY, OWNER),
    ).fetchone()
    assert state == "accepted"
    assert str(origin) == str(ingestion_id)


def test_a_chosen_word_mints_its_card_in_the_write(connection):
    """ADR 0064 §1: *the `note`, its provenance rows, its occurrences, a
    `note_vetting` row and the `card`* — and nobody is asked.

    ⚠️ **`seconds_to_vet` and `vetting_session_id` are null, not zero.** No
    person and no run was involved, and a zero is a measurement of something
    that did not happen.

    ⚠️ **And no *scheduling epoch*.** `scheduling_epoch.card_id` is `RESTRICT`,
    and the first epoch belongs to the *grade* that first schedules the *card*
    (`server/utils/review/grade.ts`), exactly as it did when acceptance was a
    keystroke.
    """
    make_run(connection)

    run(connection, FakeProvider())

    vetting = connection.execute(
        """
        SELECT v.state, v.edited, v.seconds_to_vet, v.vetting_session_id, v.vetted_at IS NOT NULL
        FROM note_vetting v JOIN note n ON n.id = v.note_id
        WHERE n.identity_key = %s AND v.owner_id = %s;
        """,
        (LIBRARY, OWNER),
    ).fetchone()
    assert vetting == ("accepted", False, None, None, True)

    cards = connection.execute(
        """
        SELECT c.owner_id, c.template_key, c.suspended_at FROM card c
        JOIN note n ON n.id = c.note_id WHERE n.identity_key = %s;
        """,
        (LIBRARY,),
    ).fetchall()
    assert cards == [(OWNER, "recognition", None)]
    assert connection.execute("SELECT count(*) FROM scheduling_epoch;").fetchone()[0] == 0


def test_the_card_belongs_to_whoever_asked_for_the_job(connection):
    """ADR 0064 §2 amends `04` §4: `job.requested_by` owns what the run mints.

    ⚠️ **Not `ingestion.submitted_by`**, which stays an audit line. The two are
    the same reader in every row the app writes today, so the only way to tell
    which one the worker read is to make them differ.
    """
    connection.execute(
        """
        INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('usr_requester', 'Requester', 'requester@example.test', true, now(), now());
        """
    )
    make_run(connection, requested_by="usr_requester")

    run(connection, FakeProvider())

    owners = connection.execute("SELECT DISTINCT owner_id FROM card;").fetchall()
    assert owners == [("usr_requester",)]


def test_provenance_is_recorded_per_field_and_says_who_produced_it(connection):
    """ADR 0004 and `04` §5.4 — **trust is a property of where a value came
    from**, and `04` §12's eighth query is what reads it back.

    ⚠️ **Per field rather than per note.** Grouped by `model_id` and
    `prompt_version` on the note it answers *some notes are bad*; on the field it
    answers *prompt v1 writes bad example sentences*, and only the second is
    actionable.
    """
    make_run(connection)

    run(connection, FakeProvider())

    rows = connection.execute(
        """
        SELECT p.field_name, p.kind, p.model_id, p.prompt_version, p.dictionary_version, p.is_oov
        FROM note_field_provenance p JOIN note n ON n.id = p.note_id
        WHERE n.identity_key = %s ORDER BY p.field_name;
        """,
        (LIBRARY,),
    ).fetchall()
    by_field = {row[0]: row[1:] for row in rows}

    # The tokeniser's three: a named authority, with the dictionary it answered
    # from and the raw `is_oov` signal `kind` was derived from (ADR 0019).
    assert by_field["term"] == ("lookup", None, None, DICTIONARY_VERSION, False)
    assert by_field["reading"][0] == "lookup"
    assert by_field["part_of_speech"][0] == "lookup"

    # The model's three: no authority behind them, so the model and the prompt
    # are what there is to record (ADR 0047, ADR 0048).
    assert by_field["meaning"] == ("generated", MODEL, PROMPT_VERSION, None, None)
    assert by_field["example_sentence"][0] == "generated"
    assert by_field["example_gloss"][0] == "generated"

    # Every field the declaration names has a row; none is unaccounted for.
    assert len(by_field) == 6


def claims(connection: psycopg.Connection, table: str) -> list[tuple]:
    """Every claim of one kind, as `(identity_key, value, authority, model, prompt)`."""
    column = {"level_claim": "level", "domain_claim": "domain"}[table]
    return connection.execute(
        f"""
        SELECT n.identity_key, c.{column}, c.authority_key, c.model_id, c.prompt_version
        FROM {table} c JOIN note n ON n.id = c.note_id
        ORDER BY n.identity_key;
        """
    ).fetchall()


def test_a_written_note_carries_one_model_estimated_level_and_domain(connection):
    """ADR 0065 §3: *nothing writes a level claim today, and that is the work.*

    One of each per *note*, authority-less, naming the model and the prompt —
    the row the *provenance marker* draws hollow (ADR 0005).
    """
    make_run(connection)

    run(connection, FakeProvider())

    levels = claims(connection, "level_claim")
    domains = claims(connection, "domain_claim")
    assert len(levels) == len(notes(connection)) > 0
    assert len(domains) == len(levels)
    assert {row[1:] for row in levels} == {("N3", None, MODEL, PROMPT_VERSION)}
    assert {row[1:] for row in domains} == {("tech", None, MODEL, PROMPT_VERSION)}


def meanings(connection: psycopg.Connection) -> list[tuple]:
    return connection.execute(
        "SELECT note_id, meanings, model_id, prompt_version FROM note_meaning ORDER BY note_id;"
    ).fetchall()


def test_a_written_note_carries_its_accepted_meanings_beside_its_fields(connection):
    """ADR 0069 §3 — `note_meaning`, one row per *note*, attributed like a claim,
    and **never a key in `note.fields`** (ADR 0052's freeze)."""
    make_run(connection)

    run(connection, FakeProvider())

    rows = meanings(connection)
    assert len(rows) == len(notes(connection)) > 0
    assert {(tuple(row[1]), row[2], row[3]) for row in rows} == {(("see", "look"), MODEL, PROMPT_VERSION)}
    assert all("meanings" not in fields for fields in notes(connection).values())


def test_an_answer_without_meanings_still_writes_the_note_and_no_list(connection):
    """⚠️ A list the model left out costs the list and never the word: the check
    falls back to `meaning` and the backfill finds the *note* later."""
    make_run(connection)
    provider = FakeProvider()
    provider.meanings = None

    run(connection, provider)

    assert len(notes(connection)) > 0
    assert meanings(connection) == []


def test_a_claim_outside_the_declared_set_is_refused_and_the_note_is_still_written(connection):
    """⚠️ #22: *rejected by the writer, with the note still written and the claim
    absent, rather than stored and silently unfilterable* (ADR 0065 §2). A
    `technology` row would match no filter anybody could ever tick.

    The refusal is said, per *chunk*, so a prompt that drifts shows up in the log
    rather than as a deck that quietly stopped filtering.
    """
    make_run(connection)
    provider = FakeProvider()
    provider.domain = "technology"
    said: list[tuple[str, dict]] = []

    run(connection, provider, log=lambda event, **fields: said.append((event, fields)))

    assert len(notes(connection)) > 0
    assert claims(connection, "domain_claim") == []
    assert len(claims(connection, "level_claim")) == len(notes(connection))
    # A card was minted all the same: the claim is about the word, not the word.
    assert connection.execute("SELECT count(*) FROM card;").fetchone()[0] == len(notes(connection))
    refused = [fields for event, fields in said if event == "ingest.claim_refused"]
    assert refused and all(fields["claim"] == "domain" for fields in refused)
    assert sum(fields["notes"] for fields in refused) == len(notes(connection))


def test_a_stray_note_is_dropped_and_the_chunk_keeps_what_matched(connection):
    """⚠️ **ADR 0071 and #36**: *the response carries a note for a word that was
    not asked for* used to fail the whole *chunk*. The N3 import lost 100 words
    that way in four chunks that were each ~24/25 right.

    The drop is said per *chunk*, as a count and **never as the term** — a stray
    is model output about the reader's material (`03` §13.4), and a rising count
    is what a prompt starting to invent words looks like in the log.
    """
    make_run(connection)
    provider = FakeProvider()
    provider.stray = "新聞"
    said: list[tuple[str, dict]] = []

    run(connection, provider, log=lambda event, **fields: said.append((event, fields)))

    written = notes(connection)
    assert len(written) > 0
    # The stray reached neither the corpus nor a *card*.
    assert all(fields["term"] != "新聞" for fields in written.values())
    assert connection.execute("SELECT count(*) FROM card;").fetchone()[0] == len(written)

    dropped = [fields for event, fields in said if event == "ingest.note_dropped"]
    assert dropped and all(fields["notes"] == 1 for fields in dropped)
    assert all("新聞" not in str(fields.values()) for fields in dropped)


def test_every_sighting_of_a_new_note_becomes_an_occurrence(connection):
    """`04` §5.5 — one *occurrence* per position, from `group.sightings`.

    ⚠️ **The first sighting included.** `S11` reads this back as *open a source,
    see what came from it*; a note whose first position was never recorded is a
    note with a hole in its provenance of place.
    """
    make_run(connection)

    run(connection, FakeProvider())

    rows = connection.execute(
        """
        SELECT o.char_start, o.char_end, o.surface_form FROM occurrence o
        JOIN note n ON n.id = o.note_id
        WHERE n.identity_key = %s ORDER BY o.char_start;
        """,
        (LIBRARY,),
    ).fetchall()

    # 図書館 at character 5 of the *source* and again at 14 — the second inside
    # the second *chunk*, where within its own chunk it begins at 0.
    assert rows == [(5, 8, "図書館"), (14, 17, "図書館")]


def test_a_run_nobody_owns_writes_notes_mints_nothing_and_says_so(connection):
    """ADR 0064 §2: *if `requested_by` is null, the run writes its notes and
    mints nothing, and says so in the log.*

    `04` §6.4 makes `requested_by` nullable with `ON DELETE SET NULL`, so the
    case is reachable. ⚠️ **Guessing the reader from the allowlist is the
    shortcut refused**: it is correct until the day ADR 0012's revisit condition
    fires, and then it mints one reader's words into another's deck.
    """
    make_run(connection, owner=None)
    said: list[tuple[str, dict]] = []

    run(connection, FakeProvider(), log=lambda event, **fields: said.append((event, fields)))

    assert LIBRARY in notes(connection)
    assert connection.execute("SELECT count(*) FROM note_vetting;").fetchone()[0] == 0
    assert connection.execute("SELECT count(*) FROM card;").fetchone()[0] == 0
    assert [event for event, _ in said] and all(
        event == "ingest.unowned" for event, _ in said
    )
    assert all(fields["minted"] == 0 and fields["notes"] > 0 for _, fields in said)


# ---------------------------------------------------------------------------
# Streaming — `03` §5.1 stage 7, `S2`
# ---------------------------------------------------------------------------


def test_a_word_in_two_chunks_is_generated_once(connection):
    """⚠️ **The streamed write is what closes the cross-chunk duplicate.**

    Tokenisation is per *chunk* (`03` §5.1), so stage 4 cannot see across one and
    図書館 is two groups. Because chunk 0's *note* is written the moment chunk 0
    returns, chunk 1's sighting is an `already_known` rather than a second thing
    to pay for — which is `00-status.md` § Carrying's *#9 must not batch its
    writes to the end of a run*, as a test.
    """
    ingestion_id = make_run(connection)
    provider = FakeProvider()

    run(connection, provider)

    assert len(provider.calls) == 2
    assert "term=図書館" in provider.calls[0]
    # ⚠️ `term=` and not the bare word: the *passage* is in the prompt too
    # (`04` §6.3's key covers the request), so chunk 1's prompt contains 図書館
    # in its second sentence. What must be gone is the **ask**.
    assert "term=図書館" not in provider.calls[1]

    # One *note*, two *occurrences*, and the second chunk's sighting counted
    # under `candidates_already_known` (`04` §6.1).
    assert sum(1 for key in notes(connection) if key == LIBRARY) == 1
    assert ledger(connection, ingestion_id)[4] == 1


def test_a_chunk_that_cannot_be_generated_keeps_what_the_others_produced(connection):
    """`03` §5.4 and §11 — **partial results are kept**, and the run stays
    resumable. *Money already spent is not discarded.*
    """
    ingestion_id = make_run(connection)
    provider = FakeProvider()
    provider.refuse = {"開く"}

    run(connection, provider)

    assert LIBRARY in notes(connection)
    assert ledger(connection, ingestion_id)[0] == "incomplete"
    statuses = connection.execute(
        """
        SELECT sc.ordinal, ic.status FROM ingestion_chunk ic
        JOIN source_chunk sc ON sc.id = ic.source_chunk_id
        WHERE ic.ingestion_id = %s ORDER BY sc.ordinal;
        """,
        (ingestion_id,),
    ).fetchall()
    assert statuses == [(0, "complete"), (1, "failed")]


def test_a_resume_re_runs_only_the_chunk_that_failed(connection):
    """`04` §6.2's resume query, with generation behind it — PRD §5's ugliest
    ingestion case, and the reason ADR 0015 chose a durable per-chunk record.
    """
    ingestion_id = make_run(connection)
    refusing = FakeProvider()
    refusing.refuse = {"開く"}
    run(connection, refusing)

    connection.execute(
        "INSERT INTO job (kind, ingestion_id, state) VALUES ('resume', %s, 'queued');",
        (ingestion_id,),
    )
    second = FakeProvider()
    run(connection, second)

    # ⚠️ One call, for the one chunk that was not `complete` — chunk 0's notes
    # were not paid for twice.
    assert len(second.calls) == 1
    assert "開く" in second.calls[0]
    assert ledger(connection, ingestion_id)[0] == "complete"


# ---------------------------------------------------------------------------
# The cache — `04` §6.3, `03` §5.3
# ---------------------------------------------------------------------------


def key(model_id: str = MODEL, **overrides) -> CacheKey:
    parts = {
        "content_hash": "chunk-0",
        "dictionary_version": DICTIONARY_VERSION,
        "prompt_version": PROMPT_VERSION,
        "model_id": model_id,
    }
    parts.update(overrides)
    return CacheKey(**parts)


def test_the_response_is_cached_under_all_four_parts_of_the_key(connection):
    """`03` §5.3's corrected key, and `11` §7's *all four parts*.

    ⚠️ **The dictionary version is the part that is easy to leave out**, and the
    failure it causes is silent: a SudachiDict bump changes tokenisation, which
    changes `normalized_form`, which is half of ADR 0006's *identity key* — and
    the old key would keep serving results computed against the other one.
    """
    make_run(connection)

    run(connection, FakeProvider())

    assert read_generation_cache(connection, key()) is not None
    assert read_generation_cache(connection, key(content_hash="chunk-9")) is None
    assert read_generation_cache(connection, key(dictionary_version="20200101")) is None
    assert read_generation_cache(connection, key(prompt_version="v0")) is None
    assert read_generation_cache(connection, key(model_id="claude-opus-5")) is None


def test_re_ingesting_an_identical_source_asks_nothing_and_the_corpus_is_why(connection):
    """`03` §11's *identical source resubmitted: no LLM spend*, and ⚠️ **the
    reason is stage 5 rather than `04` §6.3.**

    The first run's *notes* are in the corpus, so the second run's *candidates*
    are all `already_known` and **stage 6 is never reached** — the cache is not
    even consulted. That is ADR 0010's ordering and `S5`'s *the fiftieth source
    asks about fewer notes than the fifth*, and it is worth asserting separately
    from the cache so that neither gets credit for the other's work.
    """
    make_run(connection)
    run(connection, FakeProvider())

    second_id = make_run(connection)
    second = FakeProvider()
    run(connection, second)

    assert second.calls == []
    assert ledger(connection, second_id)[4] == 7
    assert spend(connection, second_id)[2:5] == (None, None, None)


def test_a_cached_answer_is_served_without_spending(connection):
    """ADR 0010's replayable cache, on the path where it is the thing that saves
    the money — the corpus no longer has the *notes*, so there **are** survivors.

    ⚠️ **A cache hit adds nothing to the spend ledger.** `04` §6.1's token counts
    come from the API response, and a hit has no response of its own — only a
    record of one somebody already paid for.
    """
    make_run(connection)
    run(connection, FakeProvider())
    forget_the_corpus(connection)

    second_id = make_run(connection)
    second = FakeProvider()
    run(connection, second)

    assert second.calls == []
    assert LIBRARY in notes(connection)
    assert spend(connection, second_id)[2:5] == (None, None, None)


def test_a_cached_answer_that_misses_a_survivor_is_paid_for_again(connection):
    """⚠️ **The one cache case that would otherwise lose a *note* in silence.**

    The key is the *chunk*'s content, so a hit can answer more than this run
    needs and never less — unless something outside the key changed. Here the
    stored answer is doctored to drop a word; served as a hit, that survivor
    would never be generated and the chunk would still be marked `complete`, so
    no resume would come back for it.
    """
    make_run(connection)
    connection.execute(
        """
        INSERT INTO generation_cache
          (content_hash, dictionary_version, prompt_version, model_id,
           response, input_tokens, output_tokens)
        VALUES ('chunk-0', %s, %s, %s, '{"notes": []}'::jsonb, 10, 10);
        """,
        (DICTIONARY_VERSION, PROMPT_VERSION, MODEL),
    )
    provider = FakeProvider()

    run(connection, provider)

    assert len(provider.calls) == 2
    assert LIBRARY in notes(connection)


def test_a_second_run_after_a_narrow_cached_answer_pays_nothing(connection):
    """⚠️ **The re-pay-forever trap, and `ON CONFLICT DO NOTHING` was it.**

    A cached row that does not answer every survivor is a miss (`04` §6.3) — so
    the run pays again, and then has to be able to **store** what it paid for. A
    `DO NOTHING` write leaves the narrow row in place, the next run reads it as a
    miss too, and the chunk re-pays on every ingestion for ever, which is exactly
    the bill `03` §11 promises an identical *source* does not get.
    """
    make_run(connection)
    connection.execute(
        """
        INSERT INTO generation_cache
          (content_hash, dictionary_version, prompt_version, model_id,
           response, input_tokens, output_tokens)
        VALUES ('chunk-0', %s, %s, %s, '{"notes": []}'::jsonb, 10, 10);
        """,
        (DICTIONARY_VERSION, PROMPT_VERSION, MODEL),
    )
    run(connection, FakeProvider())
    forget_the_corpus(connection)

    make_run(connection)
    third = FakeProvider()
    run(connection, third)

    assert third.calls == []


def test_a_refused_answer_is_still_paid_for(connection):
    """⚠️ **A declined or truncated response is a 200 that was billed.**

    `04` §6.1's ledger is what `S10` reports from and it records what was
    **spent**, not what was useful — a run that dropped the tokens of its failed
    chunks would look cheaper than one that succeeded, which is the one direction
    the figure must not be wrong in.
    """
    ingestion_id = make_run(connection)

    class Declining(FakeProvider):
        def generate(self, request, *, keepalive=None):
            self.calls.append(request.prompt)
            raise ProviderRefused(
                "the model declined this chunk",
                spent=Generation(
                    payload={}, model_id=self.model_id, input_tokens=900, output_tokens=40
                ),
            )

    run(connection, Declining())

    _, _, input_tokens, output_tokens, cost, _, _ = spend(connection, ingestion_id)
    # Both *chunks* were asked and both were declined.
    assert (input_tokens, output_tokens) == (1800, 80)
    assert cost == 2 * prices.cost_micro_usd(MODEL, input_tokens=900, output_tokens=40)
    assert notes(connection) == {}
    assert ledger(connection, ingestion_id)[0] == "incomplete"


def test_a_run_served_entirely_from_the_cache_still_names_its_model(connection):
    """⚠️ **What made these *notes*, and what this run paid, are two questions.**

    A re-ingestion served from `04` §6.3 produces *notes* and pays nothing. The
    spend columns are empty and the model is not — collapsed into one write, such
    a run would name no model at all and `09` §7 would render it as though
    nothing had happened.
    """
    make_run(connection)
    run(connection, FakeProvider())
    forget_the_corpus(connection)

    second_id = make_run(connection)
    run(connection, FakeProvider())

    model_id, prompt_version, input_tokens, _, cost, _, _ = spend(connection, second_id)
    assert (model_id, prompt_version) == (MODEL, PROMPT_VERSION)
    assert (input_tokens, cost) == (None, None)


def write_one_note(
    connection: psycopg.Connection, *, meaning: str = "library", char_start: int = 5
):
    """Stage 7 called directly, for the two cases a run cannot reach.

    ⚠️ **Both of them are about a *note* whose row is already there**, which
    stage 5 normally drops before stage 6 spends anything — so a run is the wrong
    instrument and the stage is called on its own. `char_start` moves the
    sighting, because `04` §5.5 keys an *occurrence* on the position.
    """
    from pipeline.deduplicate import Group
    from pipeline.extract_candidates import Candidate
    from pipeline.generate import GeneratedNote
    from pipeline.write_notes import Destination, Provenance, write_note
    from subject import load_declaration

    source_id, chunk_id = connection.execute(
        "SELECT source_id, id FROM source_chunk ORDER BY ordinal LIMIT 1;"
    ).fetchone()
    ingestion_id = connection.execute("SELECT id FROM ingestion LIMIT 1;").fetchone()[0]

    candidate = Candidate(
        term="図書館",
        reading="としょかん",
        part_of_speech="名詞",
        surface_form="図書館",
        char_start=char_start,
        char_end=char_start + 3,
        is_oov=False,
        identity_key=LIBRARY,
    )
    note = GeneratedNote(
        group=Group(
            identity_key=LIBRARY, candidate=candidate, sightings=(candidate,), note_id=None
        ),
        fields={
            "term": "図書館",
            "reading": "としょかん",
            "part_of_speech": "名詞",
            "meaning": meaning,
            "example_sentence": "図書館です。",
            "example_gloss": "It is a library.",
        },
        # ADR 0063: the key the *note* is written under is rendered from the
        # fields, and for a word the dictionary could read it is the group's.
        identity_key=LIBRARY,
    )

    return write_note(
        connection,
        note,
        to=Destination(
            declaration=load_declaration(),
            subject_id="jlpt-vocab",
            owner_id=OWNER,
            source_id=source_id,
            source_chunk_id=chunk_id,
            ingestion_id=ingestion_id,
            provenance=Provenance(
                model_id=MODEL,
                prompt_version=PROMPT_VERSION,
                dictionary_version=DICTIONARY_VERSION,
            ),
        ),
    )


def test_a_note_whose_row_already_exists_still_gets_its_provenance(connection):
    """⚠️ **Gated on *created*, a crash between two writes lost six rows for
    ever.**

    `04` §12's eighth query is ADR 0018's instrument and it reads
    `note_field_provenance`. A process that died after the `note` insert and
    before the provenance one would leave a *note* the retry skips — the row is
    already there — and the fields would be unattributable permanently. The
    `ON CONFLICT DO NOTHING` on each provenance row is what makes writing it
    unconditionally safe: an existing row always wins.
    """
    make_run(connection)
    connection.execute(
        "INSERT INTO note (subject_id, identity_key, fields) VALUES ('jlpt-vocab', %s, '{}'::jsonb);",
        (LIBRARY,),
    )

    written = write_one_note(connection)

    assert written.created is False
    rows = connection.execute(
        "SELECT count(*) FROM note_field_provenance WHERE note_id = %s;", (written.note_id,)
    ).fetchone()[0]
    assert rows == 6


def test_an_accepted_notes_fields_survive_a_later_write(connection):
    """`S6`'s freeze, from the **worker's** side of it — ADR 0006.

    ⚠️ **This is the half the application cannot guard.** `04` §4 makes `note`
    shared and `note_vetting` personal, so the app refuses the write in the
    `WHERE` of `server/utils/note/fields.ts`; the worker never reads
    `note_vetting` at all and does not need to, because `_insert_note`'s
    `ON CONFLICT DO NOTHING` means *a second sighting appends an occurrence and
    leaves the note alone*. An upsert there — which is what the obvious version
    of this function is — would let a re-ingestion rewrite a *note* the reader
    has already accepted and studied, silently, with the *cards* still pointing
    at it.

    ⚠️ **One write path open and the other shut, which is why the second
    sighting is at a different position.** ADR 0006's rule has two halves and the
    freeze is only one of them: what a later sighting is allowed to add is *where
    the word was seen*, and that half must still work — `S11` reads it back as
    *open a source, see what came from it*. Asserted at the same position, the
    occurrence count would be `1` whether the append ran or had been deleted
    outright.
    """
    make_run(connection)
    accepted = write_one_note(connection, meaning="library", char_start=5)
    connection.execute(
        "UPDATE note_vetting SET state = 'accepted', vetted_at = now() WHERE note_id = %s;",
        (accepted.note_id,),
    )

    again = write_one_note(
        connection, meaning="a completely different meaning", char_start=40
    )

    assert again.note_id == accepted.note_id
    assert again.created is False
    fields = connection.execute(
        "SELECT fields FROM note WHERE id = %s;", (accepted.note_id,)
    ).fetchone()[0]
    assert fields["meaning"] == "library"
    positions = connection.execute(
        "SELECT char_start FROM occurrence WHERE note_id = %s ORDER BY char_start;",
        (accepted.note_id,),
    ).fetchall()
    assert [position for (position,) in positions] == [5, 40]


def test_a_note_left_pending_before_the_pivot_is_minted_when_it_is_chosen(connection):
    """⚠️ **The 474 *pending notes* are a cache, and a cache hit still mints.**

    ADR 0063 leaves them pending and unreachable from the loop; ADR 0064 says a
    chosen word is accepted when it is written. A word the reader chooses that
    is already one of those rows is still a chosen word — leaving it `pending`
    would give him a word list that silently produced nothing for every word the
    corpus had seen, which is the queue #19 was built to stop filling.
    """
    make_run(connection)
    first = write_one_note(connection, char_start=5)
    connection.execute(
        "UPDATE note_vetting SET state = 'pending', vetted_at = NULL WHERE note_id = %s;",
        (first.note_id,),
    )
    connection.execute("DELETE FROM card;")

    write_one_note(connection, char_start=40)

    assert connection.execute(
        "SELECT state FROM note_vetting WHERE note_id = %s;", (first.note_id,)
    ).fetchone() == ("accepted",)
    assert connection.execute(
        "SELECT count(*) FROM card WHERE note_id = %s;", (first.note_id,)
    ).fetchone() == (1,)


def test_a_rejected_note_stays_rejected_and_mints_nothing(connection):
    """`S5`, which ADR 0064 moves to *Vet*'s drop: *the reader still says no once
    and means it.* A write that reaches a rejected row — a resume, a concurrent
    run — must not turn the no into a *card*.
    """
    make_run(connection)
    written = write_one_note(connection, char_start=5)
    connection.execute("DELETE FROM card;")
    connection.execute(
        "UPDATE note_vetting SET state = 'rejected' WHERE note_id = %s;", (written.note_id,)
    )

    write_one_note(connection, char_start=40)

    assert connection.execute(
        "SELECT state FROM note_vetting WHERE note_id = %s;", (written.note_id,)
    ).fetchone() == ("rejected",)
    assert connection.execute("SELECT count(*) FROM card;").fetchone() == (0,)


def test_writing_a_note_twice_mints_one_card(connection):
    """`04` §7.3's `UNIQUE (owner_id, note_id, template_key)`, reached through
    `mint_cards`' `ON CONFLICT DO NOTHING` — a resumed *chunk* re-writes the
    *notes* that landed before it failed (`03` §5.4)."""
    make_run(connection)

    write_one_note(connection, char_start=5)
    write_one_note(connection, char_start=40)

    assert connection.execute("SELECT count(*) FROM card;").fetchone() == (1,)


def test_a_long_model_request_keeps_its_claim_alive(connection):
    """ADR 0061, #17: a 3–5 minute answer sent no query, the claim went stale
    under it, and the job was reclaimed. The keepalive the provider is handed
    heartbeats **this** job, on **this** connection, while the answer streams.
    """
    make_run(connection)
    fresh: list[bool] = []

    class Slow(FakeProvider):
        def generate(self, request, *, keepalive=None):
            # Four and a half minutes of streaming, compressed: the claim has
            # aged past the sweep's boundary by the time the stream is read.
            connection.execute(
                "UPDATE job SET heartbeat_at = now() - interval '6 minutes' WHERE state = 'claimed';"
            )
            keepalive()
            fresh.append(
                connection.execute(
                    "SELECT heartbeat_at > now() - interval '1 minute' FROM job WHERE state = 'claimed';"
                ).fetchone()[0]
            )
            return super().generate(request)

    generate = make_generator(Slow(), worker_environment="laptop")
    drain(
        connection,
        owner="w",
        handle=lambda conn, job: run_ingestion(
            conn,
            job,
            process_chunk=make_chunk_processor(job, generate=generate, keepalive_every=0.0),
        ),
    )

    assert fresh and all(fresh)


def test_a_refused_answer_is_never_cached(connection):
    """`03` §7: **a failure is an error rather than a stored row**, and the same
    sentence pointed at `generation_cache` — a stored answer that does not
    validate would be served back forever and the chunk could never succeed.
    """
    make_run(connection)

    class Liar(FakeProvider):
        def generate(self, request, *, keepalive=None):
            generation = super().generate(request)
            generation.payload["notes"][0]["meaning"] = ""
            return generation

    run(connection, Liar())

    assert read_generation_cache(connection, key()) is None
    assert notes(connection) == {}


# ---------------------------------------------------------------------------
# The spend ledger — `04` §6.1, `03` §7, §12
# ---------------------------------------------------------------------------


def test_the_ledger_records_what_was_spent_and_under_which_price_table(connection):
    """`04` §6.1's spend half, all seven columns of it.

    ⚠️ **Tokens come from the response and cost from a dated table** (`03` §7).
    Published prices change; a hard-coded table begins lying silently on the day
    they do, and `price_table_effective_date` is what makes the lie detectable.
    """
    ingestion_id = make_run(connection)
    table = prices.current_prices()

    run(connection, FakeProvider(tokens=(1840, 620)))

    model_id, prompt_version, input_tokens, output_tokens, cost, effective, environment = spend(
        connection, ingestion_id
    )
    assert (model_id, prompt_version) == (MODEL, PROMPT_VERSION)
    # ⚠️ Accumulated across both *chunks*, like the four counters beside them: a
    # resume re-runs only what is not `complete`, so an assignment would report
    # the resume's slice as the whole document.
    assert (input_tokens, output_tokens) == (3680, 1240)
    assert cost == 2 * prices.cost_micro_usd(MODEL, input_tokens=1840, output_tokens=620)
    assert effective == table.effective_date
    assert environment == "laptop"


def test_the_worker_environment_is_recorded_on_the_number(connection):
    """`03` §12: early *time-to-first-review* figures are **not comparable across
    ADR 0022's move**, and that is recorded on the row rather than only in a
    paragraph — the run is the thing that knows which side of the move it was.
    """
    ingestion_id = make_run(connection)

    run(connection, FakeProvider(), environment="server")

    assert spend(connection, ingestion_id)[6] == "server"


def test_an_unknown_worker_environment_is_refused() -> None:
    """⚠️ **Refused rather than defaulted.** A typo that silently became
    `laptop` would put server figures in the laptop's column, which is the one
    comparison `03` §12 says must not be made.
    """
    assert ingest.resolve_worker_environment({}) == "laptop"
    assert ingest.resolve_worker_environment({ingest.WORKER_ENVIRONMENT_ENV: "server"}) == "server"
    with pytest.raises(MisconfiguredWorker):
        ingest.resolve_worker_environment({ingest.WORKER_ENVIRONMENT_ENV: "sever"})


def test_an_ingestion_that_produces_no_new_notes_is_a_success(connection):
    """PRD §5 and `03` §11 — **a success, not an error**, and the expected steady
    state as the corpus grows (`S5`).

    The reader is told *how many candidates were filtered, and by which filter*,
    which is what `04` §6.1's four columns are for. ⚠️ **And nothing was spent**:
    ADR 0010's ordering means the provider is never asked.
    """
    ingestion_id = make_run(connection)
    for identity_key in (
        LIBRARY,
        "駅" + chr(31) + "えき",
        "近く" + chr(31) + "ちかく",
        # ⚠️ `ある`, and it was `あり` until #15 — the defect this test stood on
        # rather than endorsed. `reading_of` read the *surface*'s reading, so
        # あります keyed `有る␟あり` while ある keyed `有る␟ある`: one word, two
        # *notes*. ADR 0045 § Amended 2026-09-13 takes the reading from the
        # **dictionary form** whenever the surface inflected, so the corpus now
        # holds one key for both, and it is this one.
        #
        # ⚠️ **Written out rather than derived, deliberately.** A key computed
        # here by calling the pipeline would agree with the pipeline by
        # construction, including on the day the pipeline is wrong — which is
        # exactly the day this test exists for.
        "有る" + chr(31) + "ある",
        "時" + chr(31) + "じ",
        "開く" + chr(31) + "ひらく",
    ):
        seed_note(connection, identity_key)
    provider = FakeProvider()

    run(connection, provider)

    status, _, extracted, deduplicated, known, rejected = ledger(connection, ingestion_id)
    assert status == "complete"
    assert provider.calls == []
    assert (extracted, deduplicated, known, rejected) == (7, 0, 7, 0)
    assert spend(connection, ingestion_id)[4] is None


def test_a_reading_the_dictionary_could_not_supply_is_recorded_as_generated(connection):
    """⚠️ ADR 0063, #19: *the reading later written with provenance `generated`
    rather than `lookup`.*

    A word list holds words SudachiPy has never seen — a list of tech loanwords
    is going to — and `worker/pipeline/normalise.py` keeps such a line with an
    empty reading rather than dropping it. The model writes the reading, and
    ADR 0004's sentence is that trust is a property of where a value came from:
    recorded as `lookup` this row would claim a dictionary behind a guess.
    """
    from pipeline.deduplicate import Group
    from pipeline.extract_candidates import Candidate
    from pipeline.generate import GeneratedNote
    from pipeline.write_notes import Destination, Provenance, write_note
    from subject import load_declaration, render_identity_key

    make_run(connection)
    source_id, chunk_id = connection.execute(
        "SELECT source_id, id FROM source_chunk ORDER BY ordinal LIMIT 1;"
    ).fetchone()
    ingestion_id = connection.execute("SELECT id FROM ingestion LIMIT 1;").fetchone()[0]

    term = "コンテナオーケストレーション"
    reading = "コンテナオーケストレーション"
    declaration = load_declaration()

    # What `normalise` produces for an unresolvable line: no reading, `is_oov`,
    # and a key rendered from the empty reading.
    candidate = Candidate(
        term=term,
        reading="",
        part_of_speech="名詞",
        surface_form=term,
        char_start=0,
        char_end=len(term),
        is_oov=True,
        identity_key=render_identity_key(declaration, {"term": term, "reading": ""}),
    )
    fields = {
        "term": term,
        "reading": reading,
        "part_of_speech": "名詞",
        "meaning": "container orchestration",
        "example_sentence": "コンテナオーケストレーションを学ぶ。",
        "example_gloss": "I am learning container orchestration.",
    }

    written = write_note(
        connection,
        GeneratedNote(
            group=Group(
                identity_key=candidate.identity_key,
                candidate=candidate,
                sightings=(candidate,),
                note_id=None,
            ),
            fields=fields,
            identity_key=render_identity_key(declaration, fields),
            generated_lookups=frozenset({"reading"}),
        ),
        to=Destination(
            declaration=declaration,
            subject_id="jlpt-vocab",
            owner_id=OWNER,
            source_id=source_id,
            source_chunk_id=chunk_id,
            ingestion_id=ingestion_id,
            provenance=Provenance(
                model_id=MODEL,
                prompt_version=PROMPT_VERSION,
                dictionary_version=DICTIONARY_VERSION,
            ),
        ),
    )

    rows = connection.execute(
        """
        SELECT field_name, kind, model_id, dictionary_version, is_oov
        FROM note_field_provenance WHERE note_id = %s ORDER BY field_name;
        """,
        (written.note_id,),
    ).fetchall()
    by_field = {row[0]: row[1:] for row in rows}

    # The model wrote it, so the model and the prompt are what there is to
    # record — and `is_oov` stays off the row, because it says something about
    # the tokeniser's answer and there was none.
    assert by_field["reading"] == ("generated", MODEL, None, None)
    # ⚠️ And `term` is still the dictionary's, which is what keeps the flag
    # meaningful: the model was never free to write the word itself.
    assert by_field["term"] == ("lookup", None, DICTIONARY_VERSION, True)

    # ⚠️ **The row is keyed on what it says, not on what was asked** (`04` §5.3).
    key = connection.execute(
        "SELECT identity_key FROM note WHERE id = %s;", (written.note_id,)
    ).fetchone()[0]
    assert key == render_identity_key(declaration, fields)
    assert key != candidate.identity_key
