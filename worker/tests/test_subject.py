"""Python's view of the *subject* declaration, and its half of `03` §6's seam.

The declaration is language-neutral JSON owned by neither toolchain (ADR 0003).
This tier reads the same file `shared/subject/declaration.ts` imports; that the
two agree is `test_subject_drift.py`, and it is the one test that exists in both
suites by design (`11` §7).

⚠️ Needs no Docker. The three tests that do are ADR 0038's, and they arrive with
#7 — a laptop without Docker still runs everything here.
"""

import json

import pytest

from subject import (
    DECLARATION_PATH,
    REPO_ROOT,
    ValidationError,
    check_declaration,
    field_names,
    judgement_field_names,
    load_declaration,
    memory_bearing_field_names,
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
    "stages": [{"key": "one", "title": "One"}],
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

    def test_names_the_seven_stages_of_03_5_1_in_order(self):
        assert stage_keys(load_declaration()) == [
            "chunk",
            "tokenise",
            "extract_candidates",
            "deduplicate",
            "filter_known",
            "generate",
            "write_pending",
        ]

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
            ("stages", {"stages": [{"key": 7, "title": "One"}]}),
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

    def test_refuses_a_subject_with_no_stages(self):
        assert errors(check_declaration(with_declaration(stages=[]))) == [
            ValidationError(None, "no_stages")
        ]

    def test_refuses_two_stages_wearing_one_key(self):
        patched = with_declaration(
            stages=[{"key": "one", "title": "One"}, {"key": "one", "title": "Again"}]
        )
        assert errors(check_declaration(patched)) == [ValidationError("one", "duplicate_stage")]
