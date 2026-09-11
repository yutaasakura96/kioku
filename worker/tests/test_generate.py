"""Stage 6 — `worker/pipeline/generate.py` (`03` §5.1, §7, ADR 0004, ADR 0047).

⚠️ **Nothing here calls a provider, and nothing here can** (`11` §7). The module
under test builds a request and reads an answer; the answer comes from
`tests/fixtures/generation-response.json`, and the only thing that would turn one
into the other is `worker/provider.py`, which this file never imports.

Needs neither Docker nor a database: stage 6's own work is a pure function over a
declaration, a *chunk*'s text and its surviving groups.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from pipeline.deduplicate import Group
from pipeline.extract_candidates import Candidate
from pipeline.generate import (
    FIELD_INSTRUCTIONS,
    GenerationRefused,
    build_prompt,
    lookup_field_names,
    notes_for_cached,
    notes_from,
    output_schema,
    request_for,
)
from subject import load_declaration, render_identity_key

DECLARATION = load_declaration()
TEXT = "駅の近くに図書館があります。"
RECORDED = json.loads((Path(__file__).parent / "fixtures" / "generation-response.json").read_text())


def recorded() -> dict:
    """The fixture, with its own note-to-the-reader key removed.

    ⚠️ It is stripped rather than absent so that the file can explain itself:
    `output_schema` sets `additionalProperties: false`, so a real response cannot
    carry it, and leaving it in would make every test here assert against
    something the contract forbids.
    """
    payload = copy.deepcopy(RECORDED)
    payload.pop("_recorded", None)
    return payload


def group(term: str, reading: str, *, part_of_speech: str = "名詞", is_oov: bool = False) -> Group:
    candidate = Candidate(
        term=term,
        reading=reading,
        part_of_speech=part_of_speech,
        surface_form=term,
        char_start=0,
        char_end=len(term),
        is_oov=is_oov,
        identity_key=render_identity_key(DECLARATION, {"term": term, "reading": reading}),
    )
    return Group(
        identity_key=candidate.identity_key,
        candidate=candidate,
        sightings=(candidate,),
        note_id=None,
    )


LIBRARY = group("図書館", "としょかん")
NEARBY = group("近く", "ちかく")
GROUPS = (LIBRARY, NEARBY)


# ---------------------------------------------------------------------------
# What is asked
# ---------------------------------------------------------------------------


def test_the_model_is_asked_only_for_the_judgement_fields() -> None:
    """ADR 0004: `term`, `reading` and `part_of_speech` are the tokeniser's.

    ⚠️ **`part_of_speech` is absent from the schema and that is the assertion.**
    A model free to write a looked-up field is a model free to disagree with the
    dictionary on a value the *facts strip* presents as a fact.
    """
    properties = output_schema(DECLARATION)["properties"]["notes"]["items"]["properties"]

    assert "meaning" in properties
    assert "part_of_speech" not in properties


def test_the_identity_key_fields_are_asked_for_as_an_echo() -> None:
    """They are how a returned note is matched back to the group that asked.

    ⚠️ Position would do it too, and would attach 図書館's meaning to 開く the
    first time a model reordered its answers.
    """
    properties = output_schema(DECLARATION)["properties"]["notes"]["items"]["properties"]

    for name in DECLARATION["identity_key"]:
        assert name in properties


def test_the_schema_closes_the_object() -> None:
    """`additionalProperties: false` with every property required — what makes
    constrained decoding worth asking for (`03` §7). It is still not trusted;
    :func:`notes_from` validates regardless.
    """
    schema = output_schema(DECLARATION)
    item = schema["properties"]["notes"]["items"]

    assert item["additionalProperties"] is False
    assert sorted(item["required"]) == sorted(item["properties"])
    assert schema["additionalProperties"] is False


def test_the_passage_is_in_the_prompt() -> None:
    """⚠️ **`04` §6.3 keys the cache on the *chunk*'s `content_hash`**, which is
    only sound because the passage is what was sent. A prompt carrying only the
    word list would be cached under a hash of text the request never saw.
    """
    assert TEXT in request_for(DECLARATION, TEXT, GROUPS).prompt


def test_every_candidate_is_in_the_prompt() -> None:
    prompt = build_prompt(DECLARATION, TEXT, GROUPS)

    for one in GROUPS:
        assert one.candidate.term in prompt
        assert one.candidate.reading in prompt


def test_a_judgement_field_with_no_instruction_refuses() -> None:
    """⚠️ The drift guard between the declaration and the prompt.

    ADR 0003 makes fields additive, so a field can be added to
    `subjects/jlpt-vocab.json` at any time; without this the model would be asked
    for it with no guidance at all, and the notes would be quietly worse.
    """
    declaration = copy.deepcopy(DECLARATION)
    declaration["fields"].append(
        {
            "name": "mnemonic",
            "kind": "judgement",
            "required": True,
            "memory_bearing": False,
            "label": "MNEMONIC",
        }
    )

    with pytest.raises(GenerationRefused, match="FIELD_INSTRUCTIONS"):
        build_prompt(declaration, TEXT, GROUPS)


def test_every_judgement_field_the_declaration_names_has_an_instruction() -> None:
    """The same guard, pointed at the declaration as it actually is."""
    judged = {field["name"] for field in DECLARATION["fields"] if field["kind"] == "judgement"}

    assert judged <= set(FIELD_INSTRUCTIONS)


def test_stage_6_is_not_called_for_nothing() -> None:
    """ADR 0010: a *chunk* whose every word the corpus has costs no request."""
    with pytest.raises(GenerationRefused):
        request_for(DECLARATION, TEXT, ())


# ---------------------------------------------------------------------------
# What arrives
# ---------------------------------------------------------------------------


def test_a_recorded_response_becomes_notes() -> None:
    notes = notes_from(DECLARATION, GROUPS, recorded())

    assert [note.group.identity_key for note in notes] == [g.identity_key for g in GROUPS]
    assert notes[0].fields["meaning"] == "library"
    # The looked-up half is the candidate's, and it is complete.
    assert notes[0].fields["term"] == "図書館"
    assert notes[0].fields["part_of_speech"] == "名詞"
    assert sorted(notes[0].fields) == sorted(lookup_field_names(DECLARATION) + ["meaning", "example_sentence", "example_gloss"])


def test_notes_are_matched_by_identity_key_and_not_by_position() -> None:
    """⚠️ **The deciding case is 開く**, which is both ひらく and あく — the pair
    `04` §5.3 gives as the reason ADR 0006's key has two halves. Two groups in
    one chunk can share a term, so matching on the term alone is not enough
    either.
    """
    opens = group("開く", "ひらく")
    empties = group("開く", "あく")
    payload = {
        "notes": [
            {
                "term": "開く",
                "reading": "あく",
                "meaning": "to become open",
                "example_sentence": "ドアが開く。",
                "example_gloss": "The door opens.",
            },
            {
                "term": "開く",
                "reading": "ひらく",
                "meaning": "to open something",
                "example_sentence": "本を開く。",
                "example_gloss": "To open a book.",
            },
        ]
    }

    notes = notes_from(DECLARATION, (opens, empties), payload)

    # Returned in the order the *source* introduced them, with the answers the
    # readings say they belong to — not the order they came back in.
    assert [note.group.identity_key for note in notes] == [opens.identity_key, empties.identity_key]
    assert notes[0].fields["meaning"] == "to open something"
    assert notes[1].fields["meaning"] == "to become open"


def test_a_note_for_a_word_nobody_asked_about_is_refused() -> None:
    payload = recorded()
    payload["notes"].append(
        {
            "term": "新聞",
            "reading": "しんぶん",
            "meaning": "newspaper",
            "example_sentence": "新聞を読む。",
            "example_gloss": "I read the newspaper.",
        }
    )

    with pytest.raises(GenerationRefused):
        notes_from(DECLARATION, GROUPS, payload)


def test_a_missing_note_is_refused_rather_than_half_a_chunk() -> None:
    """⚠️ The model quietly dropping a word the reader paid for.

    `03` §5.4 keeps partial results at *chunk* granularity; half a chunk is not
    a unit anything resumes from, so the chunk fails and is re-run.
    """
    payload = recorded()
    payload["notes"].pop()

    with pytest.raises(GenerationRefused, match="missing"):
        notes_from(DECLARATION, GROUPS, payload)


def test_a_model_that_corrects_the_term_is_refused() -> None:
    """⚠️ **Changing `term` changes `note.identity_key`** (ADR 0006, `04` §5.3).

    The echo is matched, not merged, so a "correction" fails to find its group
    rather than arriving as a second *note* for a word that already has one.
    """
    payload = recorded()
    payload["notes"][0]["term"] = "図書舘"

    with pytest.raises(GenerationRefused):
        notes_from(DECLARATION, GROUPS, payload)


def test_an_unknown_field_is_refused_by_the_declaration_boundary() -> None:
    """`03` §7, §2.3: **not trusted because the provider documents constrained
    decoding, and not trusted because Drizzle typed the column.** The other half
    of ADR 0003's drift, and the half a permissive validator misses.
    """
    payload = recorded()
    payload["notes"][0]["jlpt_level"] = "N5"

    with pytest.raises(GenerationRefused, match="unknown"):
        notes_from(DECLARATION, GROUPS, payload)


def test_an_empty_required_field_is_refused() -> None:
    payload = recorded()
    payload["notes"][0]["meaning"] = "   "

    with pytest.raises(GenerationRefused, match="empty"):
        notes_from(DECLARATION, GROUPS, payload)


def test_a_non_string_field_is_refused() -> None:
    payload = recorded()
    payload["notes"][0]["meaning"] = True

    with pytest.raises(GenerationRefused, match="not_a_string"):
        notes_from(DECLARATION, GROUPS, payload)


def test_a_response_that_is_not_an_object_is_refused() -> None:
    for payload in ("[]", [], {}, {"notes": "library"}):
        with pytest.raises(GenerationRefused):
            notes_from(DECLARATION, GROUPS, payload)


# ---------------------------------------------------------------------------
# What the cache may serve — `04` §6.3
# ---------------------------------------------------------------------------


def test_a_cached_response_may_answer_more_than_this_run_needs() -> None:
    """⚠️ **A hit is a superset and never a subset.**

    The key is the *chunk*'s content, which cannot change; the survivors can,
    and only downward, because stages 4 and 5 shrink as the corpus grows (`S5`).
    So the second time a *source* is ingested, the words already vetted are gone
    from the survivor set and their cached notes are simply not needed.
    """
    notes = notes_for_cached(DECLARATION, (LIBRARY,), recorded())

    assert notes is not None
    assert [note.group.identity_key for note in notes] == [LIBRARY.identity_key]


def test_a_cached_response_that_misses_a_survivor_is_a_miss() -> None:
    """⚠️ **The one case that would otherwise lose a *note* in silence.**

    Served as a hit, the unanswered survivor would never be generated and never
    be seen — and the chunk would be marked `complete`, so no resume would come
    back for it.
    """
    payload = recorded()
    payload["notes"].pop()

    assert notes_for_cached(DECLARATION, GROUPS, payload) is None


def test_a_cached_response_that_no_longer_validates_is_a_miss() -> None:
    """`04` §10 calls `generation_cache` the one table safe to truncate, and
    this is why: the cost of being wrong here is money, and the cost of trusting
    it is a *note*.
    """
    payload = recorded()
    del payload["notes"][0]["meaning"]

    assert notes_for_cached(DECLARATION, GROUPS, payload) is None
