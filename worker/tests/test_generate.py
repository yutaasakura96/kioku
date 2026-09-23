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
    MAX_MEANINGS,
    GenerationRefused,
    clean_meanings,
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


def group(
    term: str,
    reading: str,
    *,
    part_of_speech: str = "名詞",
    is_oov: bool = False,
    deck_reading: str = "",
    deck_hint: str = "",
) -> Group:
    candidate = Candidate(
        term=term,
        reading=reading,
        part_of_speech=part_of_speech,
        surface_form=term,
        char_start=0,
        char_end=len(term),
        is_oov=is_oov,
        identity_key=render_identity_key(DECLARATION, {"term": term, "reading": reading}),
        deck_reading=deck_reading,
        deck_hint=deck_hint,
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

#: An imported *candidate* — ADR 0068 §6. ⚠️ **Since #35 a kana reading
#: column is the reading itself**, so the only `deck_reading` that still reaches
#: stage 6 is one `normalise` could not use — here an affix entry, which fell
#: back to the dictionary's reading.
IMPORTED = group("来", "き", deck_reading="らい～", deck_hint="JLPT_3 JLPT N3")


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


def test_the_level_and_the_domain_are_asked_for_in_the_same_request() -> None:
    """ADR 0065 §3: the same paragraph of understanding about the same word, so
    one request rather than two. ⚠️ **Asked beside the fields and never inside
    them** — a claim is not a *field* (ADR 0029), and `validate` would refuse it
    as `unknown` if it reached the blob.
    """
    properties = output_schema(DECLARATION)["properties"]["notes"]["items"]["properties"]

    assert properties["level"] == {"type": "string"}
    assert properties["domain"] == {"type": "string"}


def test_the_prompt_names_every_legal_level_and_domain_and_when_general_is_right() -> None:
    """ADR 0065 §2: *the prompt names the legal values and the writer rejects
    anything else* — and `general` exists so the model always has one."""
    prompt = build_prompt(DECLARATION, TEXT, GROUPS)

    for value in [*DECLARATION["levels"], *DECLARATION["domains"]]:
        assert value in prompt
    assert "`general`" in prompt


def test_a_claim_rides_beside_the_note_and_never_in_its_fields() -> None:
    notes = notes_from(DECLARATION, GROUPS, recorded())

    assert (notes[0].level, notes[0].domain) == ("N4", "daily")
    assert "level" not in notes[0].fields
    assert "domain" not in notes[0].fields


def test_the_accepted_meanings_are_asked_for_as_a_list() -> None:
    """ADR 0069 §3 — an array in the schema and a paragraph in the prompt."""
    items = output_schema(DECLARATION)["properties"]["notes"]["items"]
    prompt = build_prompt(DECLARATION, TEXT, GROUPS)

    assert items["properties"]["meanings"] == {"type": "array", "items": {"type": "string"}}
    assert "meanings" in items["required"]
    assert "ACCEPTED MEANINGS" in prompt


def test_the_accepted_meanings_ride_beside_the_note_and_never_in_its_fields() -> None:
    notes = notes_from(DECLARATION, GROUPS, recorded())

    assert notes[1].meanings == ("nearby", "near", "vicinity", "neighbourhood")
    assert "meanings" not in notes[1].fields


def test_an_answer_that_omits_the_meanings_is_still_a_note() -> None:
    """⚠️ A response from before v5, or one that dropped the key, costs the list
    and never the word."""
    payload = recorded()
    for note in payload["notes"]:
        note.pop("meanings")

    notes = notes_from(DECLARATION, GROUPS, payload)

    assert [note.meanings for note in notes] == [(), ()]
    assert notes[0].fields["meaning"] == "library"


@pytest.mark.parametrize(
    ("value", "kept"),
    [
        (None, ()),
        ("see", ()),
        (["see", " Look ", "SEE", "", 3, "watch  it"], ("see", "Look", "watch it")),
        (["x" * 61, "view"], ("view",)),
        ([f"m{index}" for index in range(20)], tuple(f"m{index}" for index in range(MAX_MEANINGS))),
    ],
)
def test_a_list_is_cleaned_rather_than_refused(value, kept) -> None:
    assert clean_meanings(value) == kept


@pytest.mark.parametrize("value", [None, 3, "technology"])
def test_a_bad_claim_does_not_refuse_the_chunk(value) -> None:
    """⚠️ #22: *a value outside the declared set is rejected by the writer, with
    the note still written*. Stage 6 carries what arrived and refuses nothing on
    its account — six good fields are not worth losing over a guess about them.
    A value that is not a string is carried as nothing."""
    payload = recorded()
    payload["notes"][0]["domain"] = value

    notes = notes_from(DECLARATION, GROUPS, payload)

    assert notes[0].domain == (value if isinstance(value, str) else None)
    assert notes[0].fields["meaning"] == "library"


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


def test_a_note_for_a_word_nobody_asked_about_is_dropped_and_the_chunk_stands() -> None:
    """⚠️ **Reversed by [ADR 0071](../../docs/adr/0071-a-stray-note-is-dropped-not-the-chunk.md)
    from #36**, where this refused the whole *chunk*.

    The N3 import lost 100 words in four chunks that were each ~24/25 right, and
    three of the four cleared on a resume with an unchanged prompt — so a stray
    is noise, not a response that has come apart. The `note.fields` half of the
    old fear is answered by the drop: a note nobody asked about reaches nothing.
    """
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

    notes = notes_from(DECLARATION, GROUPS, payload)

    assert [note.group.identity_key for note in notes] == [g.identity_key for g in GROUPS]
    assert all(note.fields["term"] != "新聞" for note in notes)


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

    ⚠️ **Since ADR 0071 it is refused on the way out rather than on the way in**,
    and the message says so: the rewritten note is dropped as a stray, which
    leaves the group it was answering unanswered. **This is the shape of chunk
    58** of the N3 import (#36) — the one failure ADR 0071 expects not to fix,
    and the reason its § What this does not fix is written down.
    """
    payload = recorded()
    payload["notes"][0]["term"] = "図書舘"

    with pytest.raises(GenerationRefused, match="missing"):
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


# ---------------------------------------------------------------------------
# ADR 0063 — a word the dictionary could not read
# ---------------------------------------------------------------------------

#: What `worker/pipeline/normalise.py` hands stage 6 for a line SudachiPy could
#: not resolve: the line as the reader wrote it, no reading, `is_oov`.
UNREAD = group("コンテナオーケストレーション", "", is_oov=True)


def answered(*notes: dict) -> dict:
    return {"notes": list(notes)}


def judged(**overrides: str) -> dict:
    fields = {
        "meaning": "container orchestration",
        "example_sentence": "コンテナオーケストレーションを学ぶ。",
        "example_gloss": "I am learning container orchestration.",
    }
    return {**fields, **overrides}


class TestTheReadingIsAskedFor:
    """⚠️ ADR 0063: *it goes to the model with an empty reading, the reading comes
    back as provenance `generated` rather than `lookup`.*
    """

    def test_the_prompt_marks_the_word_and_says_what_to_write(self) -> None:
        prompt = build_prompt(DECLARATION, TEXT, (LIBRARY, UNREAD))

        assert "reading=?" in prompt
        assert "READINGS" in prompt
        # ⚠️ And the word that *has* a reading is still handed one to echo — the
        # dictionary is better at this than a model, and ADR 0045 already decided
        # the script it is written in.
        assert "reading=としょかん" in prompt

    def test_a_chunk_with_no_unread_word_is_asked_the_older_question(self) -> None:
        """⚠️ **The prompt is a cache key** (`04` §6.3). A paragraph about
        readings added to every chunk would change the request for chunks that
        never needed it, and every one of them would re-pay.
        """
        prompt = build_prompt(DECLARATION, TEXT, GROUPS)

        assert "READINGS" not in prompt
        assert "reading=?" not in prompt

    def test_the_answer_is_matched_on_the_term_because_the_key_has_moved(self) -> None:
        """The model was asked with `reading=?`, so the key its answer renders to
        is not the key it was asked with. Matching on the key alone would refuse
        every chunk containing a loanword.
        """
        notes = notes_from(
            DECLARATION,
            (UNREAD,),
            answered({
                "term": "コンテナオーケストレーション",
                "reading": "コンテナオーケストレーション",
                **judged(),
            }),
        )

        assert len(notes) == 1
        assert notes[0].fields["reading"] == "コンテナオーケストレーション"

    def test_the_note_is_keyed_on_what_it_actually_says(self) -> None:
        """⚠️ `04` §5.3 renders the *identity key* from the fields the *note*
        carries. A row whose key disagreed with its own `fields` is a row no
        re-ingestion could ever match.
        """
        notes = notes_from(
            DECLARATION,
            (UNREAD,),
            answered({
                "term": "コンテナオーケストレーション",
                "reading": "コンテナオーケストレーション",
                **judged(),
            }),
        )

        assert notes[0].identity_key == render_identity_key(DECLARATION, notes[0].fields)
        assert notes[0].identity_key != UNREAD.identity_key

    def test_the_reading_is_recorded_as_generated_rather_than_looked_up(self) -> None:
        """ADR 0004 and `04` §5.4: trust is a property of where a value came
        from. `write_notes` reads this to stamp the *provenance* row.
        """
        notes = notes_from(
            DECLARATION,
            (UNREAD, LIBRARY),
            answered(
                {
                    "term": "コンテナオーケストレーション",
                    "reading": "コンテナオーケストレーション",
                    **judged(),
                },
                {
                    "term": "図書館",
                    "reading": "としょかん",
                    "meaning": "library",
                    "example_sentence": "図書館です。",
                    "example_gloss": "It is a library.",
                },
            ),
        )

        by_term = {note.fields["term"]: note for note in notes}
        assert by_term["コンテナオーケストレーション"].generated_lookups == frozenset({"reading"})
        # ⚠️ And the word that was read by the dictionary keeps `lookup`, which
        # is what keeps the flag meaningful.
        assert by_term["図書館"].generated_lookups == frozenset()

    def test_a_term_the_model_rewrote_is_still_the_candidates(self) -> None:
        """The reading is the one exception to *the candidate's values win*; the
        `term` is not, because a model free to write it is free to change
        `note.identity_key` (ADR 0006).
        """
        notes = notes_from(
            DECLARATION,
            (UNREAD,),
            answered({
                "term": "コンテナオーケストレーション",
                "reading": "コンテナオーケストレーション",
                **judged(),
            }),
        )

        assert notes[0].fields["term"] == UNREAD.candidate.term

    @pytest.mark.parametrize("reading", ["", None, 7])
    def test_an_answer_with_no_reading_for_an_unread_word_is_refused(self, reading) -> None:
        """⚠️ **Refused rather than written empty.** `reading` is `required` in
        the declaration and *memory-bearing* (ADR 0011); a *note* carrying an
        empty one would key on `term␟` and put a blank on the answer side of a
        *card*.
        """
        with pytest.raises(GenerationRefused):
            notes_from(
                DECLARATION,
                (UNREAD,),
                answered({
                    "term": "コンテナオーケストレーション",
                    "reading": reading,
                    **judged(),
                }),
            )

    def test_a_cached_answer_to_the_same_question_still_matches(self) -> None:
        """`04` §6.3's cache is keyed on the *chunk*, and a chunk with an unread
        word is asked the same way every time — so a hit has to match the same
        way too.
        """
        notes = notes_for_cached(
            DECLARATION,
            (UNREAD,),
            answered({
                "term": "コンテナオーケストレーション",
                "reading": "コンテナオーケストレーション",
                **judged(),
            }),
        )

        assert notes is not None and len(notes) == 1


class TestWhatAnImportedDeckSaid:
    """ADR 0068 §6: a deck's reading and level hint reach the model **as hints**.

    ⚠️ **Yuta's second triage call** (`anki-apkg-research.md` §6): a deck's level
    tags and subdeck names are a hint to the model only. The model's
    `level_claim` stays the only *level* claim on an imported *note*, and no
    `authority_key` ever names a deck.
    """

    def test_the_deck_s_reading_and_hint_are_on_the_word_s_line(self) -> None:
        prompt = build_prompt(DECLARATION, TEXT, (IMPORTED,))

        assert "deck_reading=らい～" in prompt
        assert "deck_hint=JLPT_3 JLPT N3" in prompt
        # ⚠️ And the given reading is still the one handed over to echo.
        assert " reading=き " in prompt

    def test_the_prompt_says_the_given_reading_stands(self) -> None:
        """A model told only that two readings exist has no rule for choosing
        between them. ⚠️ **It no longer says the given one is the dictionary's**
        (#35): for an `anki` word it is usually the deck's own.
        """
        prompt = build_prompt(DECLARATION, TEXT, (IMPORTED,))

        assert "WHAT THE DECK SAID" in prompt
        assert "hints and not facts" in prompt
        assert "A `reading` given above still stands and is echoed exactly" in prompt
        assert "dictionary's and stands" not in prompt

    def test_a_chunk_with_no_deck_behind_it_is_asked_the_older_question(self) -> None:
        """⚠️ **The prompt is a cache key** (`04` §6.3), so a paragraph about
        decks added to every chunk would change the request for every `prose`
        and `word_list` chunk that never had one. Same rule as `READINGS`.
        """
        prompt = build_prompt(DECLARATION, TEXT, GROUPS)

        assert "WHAT THE DECK SAID" not in prompt
        assert "deck_reading=" not in prompt
        assert "deck_hint=" not in prompt

    def test_a_deck_that_supplied_only_a_level_says_only_that(self) -> None:
        """Most decks carry no reading column at all (research §2.3), and an
        empty `deck_reading=` would read as *the deck says it has no reading*.
        """
        prompt = build_prompt(DECLARATION, TEXT, (group("会議", "かいぎ", deck_hint="JLPT N3"),))

        assert "deck_hint=JLPT N3" in prompt
        assert "deck_reading=" not in prompt

    def test_the_level_is_still_asked_for_exactly_as_it_was(self) -> None:
        """⚠️ ADR 0068 §6 and ADR 0065: the hint does not replace the question.
        The model still writes a `level` from the declaration's closed set, and
        that claim is the only one an imported *note* carries.
        """
        prompt = build_prompt(DECLARATION, TEXT, (IMPORTED,))

        assert "LEVEL AND DOMAIN" in prompt
        assert "write the `level` you actually believe" in prompt


class TestAnImportedChunkIsAnsweredForTheDecksWord:
    """#35: the first real import was refused chunk by chunk because the key
    named Sudachi's word and the model answered for the deck's. Built here from
    the deck's lines through `normalise`, as the worker builds it.
    """

    LINES = "直に\tじかに\tJLPT_3\n角\tすみ\tJLPT_3\n市\tいち\tJLPT_3"

    def groups(self):
        from pipeline.normalise import normalise

        return tuple(
            Group(
                identity_key=candidate.identity_key,
                candidate=candidate,
                sightings=(candidate,),
                note_id=None,
            )
            for candidate in normalise(DECLARATION, self.LINES, char_start=0, kind="anki")
        )

    def test_the_request_names_the_deck_s_words(self) -> None:
        prompt = request_for(DECLARATION, self.LINES, self.groups()).prompt

        assert "term=直に reading=じかに" in prompt
        assert "term=角 reading=すみ" in prompt
        assert "term=市 reading=いち" in prompt

    def test_an_answer_echoing_the_deck_s_term_and_reading_is_accepted(self) -> None:
        answer = answered(
            {"term": "直に", "reading": "じかに", **judged(meaning="directly")},
            {"term": "角", "reading": "すみ", **judged(meaning="corner")},
            {"term": "市", "reading": "いち", **judged(meaning="market")},
        )

        notes = notes_from(DECLARATION, self.groups(), answer)

        assert [(note.fields["term"], note.fields["reading"]) for note in notes] == [
            ("直に", "じかに"),
            ("角", "すみ"),
            ("市", "いち"),
        ]
