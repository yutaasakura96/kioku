"""Python's view of the *subject* declaration, and its half of `03` §6's seam.

The declaration is language-neutral JSON owned by neither toolchain (ADR 0003).
This tier reads the same file `shared/subject/declaration.ts` imports; that the
two agree is `test_subject_drift.py`, and it is the one test that exists in both
suites by design (`11` §7).

⚠️ Needs no Docker. The three tests that do are ADR 0038's, and they arrive with
#7 — a laptop without Docker still runs everything here.
"""

import json
import unicodedata

import pytest

from subject import (
    DECLARATION_PATH,
    REPO_ROOT,
    UnknownSourceKind,
    ValidationError,
    check_declaration,
    domain_values,
    field_names,
    judgement_field_names,
    level_values,
    load_declaration,
    memory_bearing_field_names,
    pipeline_kinds,
    render_identity_key,
    required_field_names,
    stage_keys,
    validate,
)

# The two-field synthetic of `test/unit/subject-validate.test.ts`, restated here
# rather than shared: a validator written against `jlpt-vocab.json`'s six fields
# would pass for the wrong reason the day it hard-codes one of them.
TWO_FIELDS = {
    "subject_id": "test-subject",
    "name": "Test subject",
    "identity_key": ["head"],
    "fields": [
        {"name": "head", "kind": "lookup", "required": True, "memory_bearing": False, "label": "HEAD"},
        {"name": "tail", "kind": "judgement", "required": False, "memory_bearing": True, "label": "TAIL"},
    ],
    "templates": [{"key": "only", "name": "Only", "prompt": ["head"], "answer": ["tail"]}],
    # ⚠️ **Both submittable kinds, because the validator requires both**
    # (ADR 0063). The stage names are synthetic for the same reason the fields
    # are: a test written against `jlpt-vocab.json`'s real pipelines would pass
    # for the wrong reason the day the validator hard-codes one of them.
    # ⚠️ All three submittable kinds, because the validator requires each
    # (ADR 0063, and `anki` since ADR 0068).
    "pipelines": {"word_list": ["one"], "prose": ["one", "two"], "anki": ["zero", "one"]},
    "levels": ["low", "high"],
    "domains": ["work", "other"],
}


def with_declaration(**patch):
    return {**TWO_FIELDS, **patch}


def errors(result):
    return list(result.errors)


class TestLoadDeclaration:
    def test_reads_the_file_at_subjects_jlpt_vocab_json(self):
        assert DECLARATION_PATH == "subjects/jlpt-vocab.json"
        # ⚠️ Read independently. Asking the module for the file's contents and
        # comparing them with themselves would make `03` §6's guard a tautology.
        on_disk = json.loads((REPO_ROOT / DECLARATION_PATH).read_text(encoding="utf-8"))
        assert load_declaration() == on_disk

    def test_names_one_pipeline_per_source_kind(self):
        """ADR 0063: the declaration stops naming one ordered stage list and
        names one per *kind*. Prose is `03` §5.1's seven, unchanged; a word list
        runs `normalise` where prose runs `tokenise` and `extract_candidates`.
        """
        declaration = load_declaration()
        assert pipeline_kinds(declaration) == ["prose", "word_list", "anki"]
        assert stage_keys(declaration, "prose") == [
            "chunk",
            "tokenise",
            "extract_candidates",
            "deduplicate",
            "filter_known",
            "generate",
            "write_notes",
        ]
        assert stage_keys(declaration, "word_list") == [
            "chunk",
            "normalise",
            "deduplicate",
            "filter_known",
            "generate",
            "write_notes",
        ]
        # ⚠️ **`anki` is `word_list` with `unpack` in front** — ADR 0068 §4.
        # Two of its stages run in the app, and they are declared anyway: ADR
        # 0003 makes this file the one place that says, in order, what happens
        # to a *source*.
        assert stage_keys(declaration, "anki") == [
            "unpack",
            *stage_keys(declaration, "word_list"),
        ]

    def test_refuses_a_kind_it_has_no_pipeline_for_by_name(self):
        """A row carrying a kind the declaration does not know has to say so
        rather than run whichever pipeline happens to be first.

        ⚠️ **`anki` was that kind until #26** (ADR 0068): ADR 0063 left the
        `.apkg` format and the licensing of shared decks to #24 and said it did
        not pre-decide the ticket, so the value existed and the path did not.
        Both are closed, so the case now needs a kind nothing declares.
        """
        with pytest.raises(UnknownSourceKind) as raised:
            stage_keys(load_declaration(), "ebook")
        assert "ebook" in str(raised.value)

    def test_names_the_field_list_and_the_judgement_fields(self):
        declaration = load_declaration()
        assert field_names(declaration) == [
            "term",
            "reading",
            "part_of_speech",
            "meaning",
            "example_sentence",
            "example_gloss",
        ]
        assert judgement_field_names(declaration) == [
            "meaning",
            "example_sentence",
            "example_gloss",
        ]

    def test_declares_the_levels_in_order_and_the_domains(self):
        """ADR 0065 §2 — closed sets, read here and restated nowhere."""
        declaration = load_declaration()
        assert level_values(declaration) == ["N5", "N4", "N3", "N2", "N1"]
        assert domain_values(declaration) == ["tech", "business", "daily", "academic", "general"]

    def test_names_adr_0006s_identity_key(self):
        assert load_declaration()["identity_key"] == ["term", "reading"]

    def test_names_the_memory_bearing_fields(self):
        # ADR 0011: a change to one of these begins a new *scheduling epoch*.
        assert memory_bearing_field_names(load_declaration()) == ["reading", "meaning"]

    def test_the_declaration_in_the_repository_is_internally_consistent(self):
        assert check_declaration(load_declaration()).ok

    def test_every_field_of_this_subject_is_required(self):
        # Not a property of every subject — ADR 0003 makes later fields optional
        # — but true of v1's six, and it is what makes the validator strict at
        # `03` §7's boundary.
        assert required_field_names(load_declaration()) == field_names(load_declaration())


class TestValidate:
    def test_accepts_an_output_carrying_every_declared_field(self):
        assert validate(TWO_FIELDS, {"head": "図書館", "tail": "library"}).ok

    def test_accepts_an_output_that_omits_an_optional_field(self):
        assert validate(TWO_FIELDS, {"head": "図書館"}).ok

    def test_accepts_an_optional_field_that_is_present_and_empty(self):
        # ADR 0003: fields are additive and optional, and existing notes carry
        # them empty until a backfill runs.
        assert validate(TWO_FIELDS, {"head": "図書館", "tail": ""}).ok

    def test_refuses_a_missing_required_field(self):
        result = validate(TWO_FIELDS, {"tail": "library"})
        assert not result.ok
        assert errors(result) == [ValidationError("head", "missing")]

    def test_refuses_a_required_field_that_is_empty_or_whitespace(self):
        assert errors(validate(TWO_FIELDS, {"head": "   "})) == [ValidationError("head", "empty")]

    def test_reads_none_as_an_absent_field_not_a_value_of_the_wrong_type(self):
        # ⚠️ Measured 2026-09-10: the two languages disagreed here until they were
        # made to agree. A model answering ``"tail": null`` is answering nothing.
        assert validate(TWO_FIELDS, {"head": "x", "tail": None}).ok
        assert errors(validate(TWO_FIELDS, {"head": None})) == [
            ValidationError("head", "missing")
        ]

    @pytest.mark.parametrize(
        ("value", "blank"),
        [
            ("\u001f", True),  # the identity-key separator of `04` §5.3
            ("\u0085", True),
            ("\ufeff", True),
            ("\u3000", True),
            ("x\n", False),
        ],
    )
    def test_agrees_with_typescript_about_what_is_blank(self, value, blank):
        # ⚠️ ``str.strip()`` and JavaScript's ``trim()`` differ on six characters
        # across the BMP. Both validators use the union of the two sets, so these
        # five cases answer identically on both sides.
        result = validate(TWO_FIELDS, {"head": value})
        assert errors(result) == ([ValidationError("head", "empty")] if blank else [])

    def test_refuses_a_value_that_is_not_a_string(self):
        assert errors(validate(TWO_FIELDS, {"head": 7})) == [
            ValidationError("head", "not_a_string")
        ]

    def test_refuses_a_bool_in_place_of_a_string(self):
        # ⚠️ Python-only, and the reason this test exists: `bool` is a subclass
        # of `int` and `isinstance(True, str)` is False, but a validator written
        # with a truthiness check rather than a type check lets `True` through.
        assert errors(validate(TWO_FIELDS, {"head": True})) == [
            ValidationError("head", "not_a_string")
        ]

    def test_refuses_a_field_the_declaration_does_not_name(self):
        assert errors(validate(TWO_FIELDS, {"head": "図書館", "extra": "x"})) == [
            ValidationError("extra", "unknown")
        ]

    @pytest.mark.parametrize("output", [None, [], "head", 7])
    def test_refuses_a_value_that_is_not_an_object(self, output):
        assert errors(validate(TWO_FIELDS, output)) == [ValidationError(None, "not_an_object")]

    def test_reports_declared_fields_in_declaration_order_then_unknown_keys(self):
        # ⚠️ The order is part of the contract with TypeScript, not an
        # implementation detail — two implementations over one file are only
        # worth having if they answer the same way.
        assert errors(validate(TWO_FIELDS, {"zulu": 1, "tail": 4})) == [
            ValidationError("head", "missing"),
            ValidationError("tail", "not_a_string"),
            ValidationError("zulu", "unknown"),
        ]

    def test_does_not_mutate_the_output_it_was_given(self):
        output = {"head": "図書館"}
        validate(TWO_FIELDS, output)
        assert output == {"head": "図書館"}


class TestCheckDeclaration:
    def test_accepts_a_well_formed_declaration(self):
        assert check_declaration(TWO_FIELDS).ok

    def test_refuses_a_value_that_is_not_an_object(self):
        assert errors(check_declaration(None)) == [ValidationError(None, "not_an_object")]

    @pytest.mark.parametrize(
        ("section", "patch"),
        [
            ("fields", {"fields": "six of them"}),
            ("identity_key", {"identity_key": "term"}),
            ("templates", {"templates": {}}),
            ("pipelines", {"pipelines": {"prose": [7]}}),
            ("pipelines", {"pipelines": ["prose"]}),
            ("levels", {"levels": "N5"}),
            ("domains", {"domains": ["tech", 3]}),
        ],
    )
    def test_refuses_a_malformed_section_without_raising(self, section, patch):
        assert errors(check_declaration(with_declaration(**patch))) == [
            ValidationError(section, "malformed")
        ]

    def test_refuses_two_fields_wearing_one_name(self):
        patched = with_declaration(fields=[*TWO_FIELDS["fields"], dict(TWO_FIELDS["fields"][0])])
        assert errors(check_declaration(patched)) == [ValidationError("head", "duplicate_field")]

    def test_refuses_a_kind_that_is_neither_lookup_nor_judgement(self):
        patched = with_declaration(
            fields=[{**TWO_FIELDS["fields"][0], "kind": "judgment"}, TWO_FIELDS["fields"][1]]
        )
        assert errors(check_declaration(patched)) == [ValidationError("head", "unknown_kind")]

    def test_refuses_an_empty_identity_key(self):
        assert errors(check_declaration(with_declaration(identity_key=[]))) == [
            ValidationError(None, "identity_key_empty")
        ]

    def test_refuses_an_identity_key_naming_a_field_that_does_not_exist(self):
        assert errors(check_declaration(with_declaration(identity_key=["ghost"]))) == [
            ValidationError("ghost", "identity_key_unknown_field")
        ]

    def test_refuses_an_identity_key_naming_an_optional_field(self):
        assert errors(check_declaration(with_declaration(identity_key=["tail"]))) == [
            ValidationError("tail", "identity_key_optional_field")
        ]

    def test_refuses_a_template_rendering_a_field_the_declaration_does_not_name(self):
        # ⚠️ ADR 0003's bug class in the ADR's own words: "cards rendering fields
        # the model was never asked to produce, silently and only for some
        # notes".
        patched = with_declaration(
            templates=[{"key": "only", "name": "Only", "prompt": ["head"], "answer": ["ghost"]}]
        )
        assert errors(check_declaration(patched)) == [
            ValidationError("ghost", "template_unknown_field")
        ]

    def test_refuses_a_template_with_nothing_on_one_of_its_two_sides(self):
        patched = with_declaration(
            templates=[{"key": "only", "name": "Only", "prompt": [], "answer": ["tail"]}]
        )
        assert errors(check_declaration(patched)) == [
            ValidationError("only", "template_empty_side")
        ]

    def test_refuses_two_templates_wearing_one_key(self):
        # `card.template_key` is a text key and not a foreign key (`04` §13), so
        # nothing in the database keeps these apart.
        patched = with_declaration(
            templates=[TWO_FIELDS["templates"][0], {**TWO_FIELDS["templates"][0], "name": "Other"}]
        )
        assert errors(check_declaration(patched)) == [ValidationError("only", "duplicate_template")]

    def test_refuses_a_subject_with_no_pipelines_at_all(self):
        assert errors(check_declaration(with_declaration(pipelines={}))) == [
            ValidationError(None, "no_pipelines"),
            ValidationError("word_list", "missing_pipeline"),
            ValidationError("prose", "missing_pipeline"),
            ValidationError("anki", "missing_pipeline"),
        ]

    def test_refuses_a_pipeline_with_no_stages_in_it(self):
        patched = with_declaration(pipelines={"word_list": [], "prose": ["one"], "anki": ["one"]})
        assert errors(check_declaration(patched)) == [ValidationError("word_list", "no_stages")]

    def test_refuses_two_stages_wearing_one_key(self):
        patched = with_declaration(
            pipelines={"word_list": ["one", "one"], "prose": ["one"], "anki": ["one"]}
        )
        assert errors(check_declaration(patched)) == [ValidationError("one", "duplicate_stage")]

    def test_refuses_an_empty_level_or_domain_set(self):
        """ADR 0065 §2: a closed set with nothing in it gives the model no legal
        answer."""
        assert errors(check_declaration(with_declaration(levels=[], domains=[]))) == [
            ValidationError("levels", "no_values"),
            ValidationError("domains", "no_values"),
        ]

    def test_refuses_a_value_listed_twice(self):
        patched = with_declaration(domains=["work", "work"])
        assert errors(check_declaration(patched)) == [ValidationError("work", "duplicate_value")]

    def test_refuses_a_pipeline_for_a_kind_04_5_1_does_not_allow(self):
        """⚠️ The other direction, and the one a new *subject* would trip: a
        pipeline keyed on something `source.kind`'s `CHECK` would refuse is a
        pipeline nothing can ever select.
        """
        patched = with_declaration(
            pipelines={**TWO_FIELDS["pipelines"], "epub": ["one"]}
        )
        assert errors(check_declaration(patched)) == [
            ValidationError("epub", "unknown_pipeline_kind")
        ]

    def test_refuses_a_declaration_missing_a_pipeline_ingest_can_submit(self):
        """⚠️ #19's criterion: *a declaration with no pipeline for a kind fails
        validation with a named error, not a crash at stage dispatch.*
        """
        patched = with_declaration(pipelines={"prose": ["one"]})
        assert errors(check_declaration(patched)) == [
            ValidationError("word_list", "missing_pipeline"),
            ValidationError("anki", "missing_pipeline"),
        ]


# --- ADR 0006's identity key, rendered ---------------------------------------

#: `04` §5.3 joins the key with U+001F. ⚠️ **Spelled `chr(31)` rather than
#: written**: the character is invisible in an editor, so a literal would make
#: every expected value in this section unreviewable — and #3 already found this
#: exact character to be the one `str.strip()` and `trim()` disagree about.
UNIT_SEPARATOR = chr(31)


def test_the_identity_key_is_the_declared_fields_joined_by_the_unit_separator() -> None:
    """`04` §5.3's worked example, which the schema tier already seeds by hand.

    `test/schema/harness.ts` inserts `'図書館␟としょかん'` as a literal; this is the
    function that has to produce the same string, or the two tiers are describing
    different notes.
    """
    key = render_identity_key(
        load_declaration(),
        {"term": "図書館", "reading": "としょかん", "meaning": "library"},
    )

    assert key == "図書館" + UNIT_SEPARATOR + "としょかん"


def test_the_key_is_rendered_in_declaration_order_not_output_order() -> None:
    """`04` §5.3: *in the order the subject declaration lists them*.

    A dict preserves insertion order in Python, so a renderer that iterated the
    output would pass every test written with the fields in declared order and
    key differently the first time a generator emitted them in another.
    """
    key = render_identity_key(load_declaration(), {"reading": "としょかん", "term": "図書館"})

    assert key == "図書館" + UNIT_SEPARATOR + "としょかん"


def test_values_are_nfc_normalised_before_they_are_joined() -> None:
    """`04` §5.3, and the same rule `shared/ingest/text.ts` applies to `content`.

    ⚠️ Decomposed kana is what some PDF extractions and some macOS filenames
    carry: だ as た + U+3099. Without this one word keys two ways and ADR 0006's
    `UNIQUE (subject_id, identity_key)` never fires.
    """
    composed = render_identity_key(load_declaration(), {"term": "大学", "reading": "だいがく"})
    decomposed = render_identity_key(
        load_declaration(),
        {
            "term": unicodedata.normalize("NFD", "大学"),
            "reading": unicodedata.normalize("NFD", "だいがく"),
        },
    )

    assert decomposed == composed
    assert composed == "大学" + UNIT_SEPARATOR + "だいがく"


def test_a_missing_identity_field_is_refused_rather_than_keyed_around() -> None:
    """A note with half a key has no identity and `04` §5.3 has no spelling for
    one. `check_declaration` already refuses an *optional* field in the key; this
    is that rule at render time, where the value rather than the declaration is
    what is missing.
    """
    with pytest.raises(KeyError):
        render_identity_key(load_declaration(), {"term": "図書館"})
