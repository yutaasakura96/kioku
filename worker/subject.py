"""Python's view of the *subject* declaration — ADR 0003 and `03` §6.

The declaration is **language-neutral JSON in `subjects/`, owned by neither
toolchain**: ADR 0003 makes a *subject* one declaration with three consumers,
ADR 0019 then put the *pipeline* in Python and left the other three in
TypeScript, and the drift ADR 0003 exists to design out came back as a
cross-language version of itself.

This module is the Python half. `shared/subject/declaration.ts` is the other,
and it derives the same lists by its own route; that they agree is
`tests/test_subject_drift.py`.

⚠️ **Nothing here restates the declaration.** `field_names`, `stage_keys` and
their siblings read the file; the field list and the seven stages live in
`subjects/jlpt-vocab.json` and nowhere else.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field as dataclass_field
from pathlib import Path
from typing import Any

#: The repository root — `worker/` sits one level below it, and `subjects/` is
#: at the root because it belongs to neither toolchain (`03` §10).
REPO_ROOT = Path(__file__).resolve().parent.parent

#: Relative to :data:`REPO_ROOT`, and asserted equal to TypeScript's constant.
DECLARATION_PATH = "subjects/jlpt-vocab.json"

#: ADR 0004's honesty bit, at declaration time: looked up, or judged.
FIELD_KINDS = ("lookup", "judgement")

#: ⚠️ **Emptiness is spelled out because ``str.strip()`` and JavaScript's
#: ``trim()`` do not agree** — measured 2026-09-10 across the whole BMP. Six
#: characters differ: Python strips ``U+001C``–``U+001F`` and ``U+0085``,
#: JavaScript strips ``U+FEFF``, and **``U+001F`` is the character `04` §5.3
#: joins the *identity key* with**. Left to each language's own idea of
#: whitespace, one validator accepts a required field the other calls empty.
#:
#: This class is the **union** of the two, written the same way on both sides.
#:
#: ⚠️ ``\A``/``\Z`` and not ``^``/``$``: Python's ``$`` also matches before a
#: trailing newline and JavaScript's does not, which would have been the seventh
#: divergence.
_BLANK = re.compile(
    "\\A[\\t\\n\\v\\f\\r\\u001C-\\u001F \\u0085\\u00A0\\u1680"
    "\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]*\\Z"
)

Declaration = dict[str, Any]


@dataclass(frozen=True)
class ValidationError:
    """``field`` is the field, template or stage; ``None`` means the whole value.

    ⚠️ **The codes are shared with TypeScript and the order is part of the
    contract.** Two implementations over one file are only worth having if they
    answer the same way, and a message string would not survive translation.
    """

    field: str | None
    code: str


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    errors: tuple[ValidationError, ...] = dataclass_field(default_factory=tuple)


_OK = ValidationResult(ok=True)


def _result(errors: list[ValidationError]) -> ValidationResult:
    return _OK if not errors else ValidationResult(ok=False, errors=tuple(errors))


def _malformed(section: str) -> ValidationResult:
    return ValidationResult(ok=False, errors=(ValidationError(section, "malformed"),))


def load_declaration() -> Declaration:
    """Read the JLPT vocabulary declaration.

    ⚠️ **It takes no ``subject_id``, on purpose.** v1 has one *subject* and
    adding a second is a code change plus tests rather than a row (ADR 0003) —
    and a parameter here would eventually be fed ``note.subject_id``, which is a
    text column (`04` §5.3) and therefore data. ``subjects/{subject_id}.json``
    with that as input is a path that can leave ``subjects/``. The second subject
    decides how it is addressed; until then there is nothing to address.
    """
    return json.loads((REPO_ROOT / DECLARATION_PATH).read_text(encoding="utf-8"))


def field_names(declaration: Declaration) -> list[str]:
    return [field["name"] for field in declaration["fields"]]


def required_field_names(declaration: Declaration) -> list[str]:
    return [field["name"] for field in declaration["fields"] if field["required"]]


def judgement_field_names(declaration: Declaration) -> list[str]:
    """The fields *Vet* foregrounds (`S4`), and the only ones edit reaches."""
    return [field["name"] for field in declaration["fields"] if field["kind"] == "judgement"]


def memory_bearing_field_names(declaration: Declaration) -> list[str]:
    """The fields whose change begins a new *scheduling epoch* (ADR 0011)."""
    return [field["name"] for field in declaration["fields"] if field["memory_bearing"]]


def stage_keys(declaration: Declaration) -> list[str]:
    """The *pipeline stages* this *subject*'s *ingestion* runs, in order (`03` §5.1).

    ⚠️ These are also the module names under ``worker/pipeline/`` (`03` §10).
    """
    return [stage["key"] for stage in declaration["stages"]]


def _is_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _is_record_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, dict) for item in value)


def check_declaration(value: Any) -> ValidationResult:
    """Whether a declaration is one.

    ⚠️ **The template check is ADR 0003's whole reason for existing**: a template
    naming a field the field list does not carry is the "cards rendering fields
    the model was never asked to produce" failure, and it is silent everywhere
    else.
    """
    if not isinstance(value, dict):
        return ValidationResult(ok=False, errors=(ValidationError(None, "not_an_object"),))

    fields = value.get("fields")
    identity_key = value.get("identity_key")
    templates = value.get("templates")
    stages = value.get("stages")

    if not _is_record_list(fields):
        return _malformed("fields")
    if not _is_string_list(identity_key):
        return _malformed("identity_key")
    if not _is_record_list(templates):
        return _malformed("templates")
    if not _is_record_list(stages):
        return _malformed("stages")

    errors: list[ValidationError] = []
    required: dict[str, bool] = {}

    for field in fields:
        name = field.get("name")
        kind = field.get("kind")
        if (
            not isinstance(name, str)
            or not isinstance(field.get("required"), bool)
            or not isinstance(field.get("memory_bearing"), bool)
        ):
            return _malformed("fields")

        if name in required:
            errors.append(ValidationError(name, "duplicate_field"))
        else:
            required[name] = field["required"]

        if kind not in FIELD_KINDS:
            errors.append(ValidationError(name, "unknown_kind"))

    if not identity_key:
        errors.append(ValidationError(None, "identity_key_empty"))
    else:
        for name in identity_key:
            if name not in required:
                errors.append(ValidationError(name, "identity_key_unknown_field"))
            # The key is rendered from the fields it names (`04` §5.3), so a
            # note that may legally omit one of them has no identity at all.
            elif not required[name]:
                errors.append(ValidationError(name, "identity_key_optional_field"))

    template_keys: set[str] = set()

    for template in templates:
        key = template.get("key")
        prompt = template.get("prompt")
        answer = template.get("answer")
        if not isinstance(key, str) or not _is_string_list(prompt) or not _is_string_list(answer):
            return _malformed("templates")

        if key in template_keys:
            errors.append(ValidationError(key, "duplicate_template"))
        template_keys.add(key)

        if not prompt or not answer:
            errors.append(ValidationError(key, "template_empty_side"))

        for name in [*prompt, *answer]:
            if name not in required:
                errors.append(ValidationError(name, "template_unknown_field"))

    if not stages:
        errors.append(ValidationError(None, "no_stages"))
    else:
        stage_key_set: set[str] = set()
        for stage in stages:
            key = stage.get("key")
            if not isinstance(key, str):
                return _malformed("stages")
            if key in stage_key_set:
                errors.append(ValidationError(key, "duplicate_stage"))
            stage_key_set.add(key)

    return _result(errors)


def validate(declaration: Declaration, output: Any) -> ValidationResult:
    """The seam of `03` §6: ``validate(declaration, output) -> ok | error``.

    The function every generated *note* passes through on its way into the
    database, and the Python twin of ``validate`` in
    ``shared/subject/validate.ts``. The two answer with the same codes in the
    same order by contract, not by coincidence.

    ⚠️ **It is derived from the declaration, not written against JLPT
    vocabulary.** Nothing here names a field; adding a field to ``subjects/`` is
    the whole of adding it to this validator.
    """
    if not isinstance(output, dict):
        return ValidationResult(ok=False, errors=(ValidationError(None, "not_an_object"),))

    errors: list[ValidationError] = []
    declared: set[str] = set()

    # Declared fields first, in declaration order.
    for field in declaration["fields"]:
        name = field["name"]
        declared.add(name)

        # ⚠️ **``None`` is absent, not a bad value**, and TypeScript's twin says
        # the same about ``null`` and ``undefined``. A model that answers
        # ``"meaning": null`` is answering nothing.
        if name not in output or output[name] is None:
            if field["required"]:
                errors.append(ValidationError(name, "missing"))
            continue

        value = output[name]
        # ⚠️ `isinstance(value, str)` and not a truthiness check: `bool` is a
        # subclass of `int`, and a permissive test lets `True` through as a
        # value for a field whose column is text.
        if not isinstance(value, str):
            errors.append(ValidationError(name, "not_a_string"))
            continue

        # ⚠️ An *optional* field present and empty is legal, and that is
        # ADR 0003's schema-evolution rule rather than laxity: fields are
        # additive and optional, and existing notes carry them empty.
        if field["required"] and _BLANK.match(value):
            errors.append(ValidationError(name, "empty"))

    # Then whatever the output carried that the declaration does not name — the
    # other half of ADR 0003's drift, and the half a permissive validator misses.
    for name in output:
        if name not in declared:
            errors.append(ValidationError(name, "unknown"))

    return _result(errors)
