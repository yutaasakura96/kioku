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
their siblings read the file; the field list and the *pipelines* — one ordered
stage list per *source kind* since ADR 0063 — live in `subjects/jlpt-vocab.json`
and nowhere else.
"""

from __future__ import annotations

import json
import re
import unicodedata
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

#: `04` §5.1's `CHECK` — what a *source* may be made of (ADR 0063).
#:
#: ⚠️ **TypeScript has the same list in `shared/ingest/kind.ts` and the two are
#: compared by `tests/test_subject_drift.py`.** It is the same shape as the
#: `kioku_job` channel: a cross-language constant that drifts is silent, and here
#: the silence would be a *source* whose kind names a pipeline on one side and
#: nothing on the other.
SOURCE_KINDS = ("prose", "word_list", "anki")

#: The kinds *Ingest* can actually submit, and therefore the kinds a declaration
#: owes a pipeline for. ⚠️ **`anki` is in :data:`SOURCE_KINDS` and not here**:
#: ADR 0063 leaves the `.apkg` format and the licensing of shared decks to #24
#: and says it does not pre-decide that ticket, so requiring a pipeline for it
#: would decide it here instead.
SUBMITTABLE_SOURCE_KINDS = ("word_list", "prose")

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
#: ⚠️ **The class is a constant and both patterns are built from it.**
#: ADR 0063 gave it a second reader — a *word list* is one term per line, and
#: both languages have to agree on which lines are terms and where each term
#: begins (:func:`strip_blank`). A class copied for that second job is exactly
#: the drift the first job exists to close.
BLANK_CLASS = (
    "\\t\\n\\v\\f\\r\\u001C-\\u001F \\u0085\\u00A0\\u1680"
    "\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"
)

_BLANK = re.compile("\\A[" + BLANK_CLASS + "]*\\Z")

#: The same class at the two ends of a string — what a ``str.strip()`` that
#: agreed with JavaScript's ``trim()`` would remove.
_BLANK_EDGES = re.compile(
    "\\A[" + BLANK_CLASS + "]+|[" + BLANK_CLASS + "]+\\Z"
)


Declaration = dict[str, Any]


def is_blank(value: str) -> bool:
    """Whether a value is empty by the class both languages agree about.

    ⚠️ **Public since ADR 0063**, because the class now decides something outside
    this module: which lines of a *word list* are terms. ``shared/subject/
    validate.ts``'s ``BLANK`` is the other half, and a line one language calls
    blank while the other calls it a word is a *chunk* that holds 24 terms on one
    side of the repository and 25 on the other.
    """
    return _BLANK.match(value) is not None


def strip_blank(value: str) -> str:
    """``value.strip()``, over the class both languages agree about.

    ⚠️ **Not ``str.strip()``.** It strips ``U+001C``–``U+001F`` — including the
    character `04` §5.3 joins the *identity key* with — and does not strip
    ``U+FEFF``, which a `.txt` file pasted out of Windows begins with. The
    JavaScript half is ``trimBlank``.
    """
    return _BLANK_EDGES.sub("", value)


class UnknownSourceKind(LookupError):
    """A *source* whose `kind` the *subject* declaration has no pipeline for.

    ⚠️ **A named failure rather than a `KeyError` at stage dispatch**, which is
    the acceptance criterion #19 states in those words. It is raised at the top
    of a chunk's processing, so `worker/runs.py` marks the *chunk* `failed` and
    the run stays resumable (`03` §5.4) with a message that names the kind.
    """


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


def template_keys(declaration: Declaration) -> list[str]:
    """One *card* per declared template (`04` §7.3, ADR 0002) — what
    `mint_cards` is handed, from the declaration both toolchains read."""
    return [template["key"] for template in declaration["templates"]]


def level_values(declaration: Declaration) -> list[str]:
    """The *levels* a claim may carry, easiest first — ADR 0005, ADR 0065 §2.

    ⚠️ **A closed set.** The prompt names these and ``write_notes`` refuses any
    other, because a *level* outside it is a claim no filter can select.
    """
    return list(declaration["levels"])


def domain_values(declaration: Declaration) -> list[str]:
    """The *domains* a claim may carry — ADR 0065 §2, `general` among them."""
    return list(declaration["domains"])


def pipeline_kinds(declaration: Declaration) -> list[str]:
    """The *source kinds* this declaration can ingest, in declaration order."""
    return list(declaration["pipelines"])


def stage_keys(declaration: Declaration, kind: str) -> list[str]:
    """The *pipeline stages* an *ingestion* of this *kind* runs, in order.

    `03` §5.1 and ADR 0063. ⚠️ These are also the module names under
    ``worker/pipeline/`` (`03` §10).

    ⚠️ **It raises for a kind the declaration does not carry, and the raise is
    the point.** ADR 0063 rejected the alternative — one pipeline whose
    prose-only stages skip themselves on a word list — because *a stage that
    silently does nothing* is the failure `03` §5.1 is built to avoid. A *source*
    of an undeclared kind is the same silence one layer up, and `anki` is exactly
    that today: in `04` §5.1's `CHECK`, in no pipeline, produced by nothing.
    """
    pipelines = declaration["pipelines"]
    if kind not in pipelines:
        raise UnknownSourceKind(
            f"the subject declaration has no pipeline for a source of kind "
            f"{kind!r} (ADR 0063; {DECLARATION_PATH} declares "
            f"{', '.join(pipeline_kinds(declaration))})"
        )
    return list(pipelines[kind])


#: ADR 0006's key is rendered by joining its fields with U+001F — `04` §5.3.
#:
#: ⚠️ **`chr(31)` rather than a literal**, for the same reason the tests spell it
#: that way: the character is invisible, and #3 found it to be the single
#: character `str.strip()` strips and JavaScript's `trim()` does not. A value
#: carrying one would be trimmed on one side of the repository and not the other;
#: `_BLANK` above is the union that closes that, and this is the constant it is
#: protecting.
IDENTITY_KEY_SEPARATOR = chr(31)


def identity_key_field_names(declaration: Declaration) -> list[str]:
    """The fields ADR 0006 keys a *note* on, in declaration order."""
    return list(declaration["identity_key"])


def render_identity_key(declaration: Declaration, fields: dict[str, Any]) -> str:
    """`04` §5.3's rendering rule: NFC, joined by U+001F, in declared order.

    ⚠️ **The rendering rule is part of the identity.** `04` §5.3 says so in as
    many words, and the consequence is the sharp one: changing this function
    changes the identity of every *note* that already exists. It is the same
    class of event as a `SudachiDict` bump — a reviewed data event with a
    re-ingestion plan, never a refactor (`03` §5.3).

    ⚠️ **Declaration order, not output order.** A dict preserves insertion order
    in Python, so iterating ``fields`` would agree with this for as long as every
    producer happened to emit the fields in the declared order, and disagree
    silently the first time one did not.

    ⚠️ **A missing field raises.** Half a key is not a key, and `check_declaration`
    already refuses a declaration whose key names an *optional* field — this is
    the same rule one layer down, where it is the value rather than the
    declaration that is absent. Returning something for an absent field is how
    two different notes end up sharing an identity.
    """
    return IDENTITY_KEY_SEPARATOR.join(
        unicodedata.normalize("NFC", _identity_value(fields, name))
        for name in identity_key_field_names(declaration)
    )


def _identity_value(fields: dict[str, Any], name: str) -> str:
    if name not in fields or fields[name] is None:
        raise KeyError(f"{name!r} is part of the identity key and is not present")
    value = fields[name]
    if not isinstance(value, str):
        raise TypeError(f"{name!r} is part of the identity key and is not a string")
    return value


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
    pipelines = value.get("pipelines")
    levels = value.get("levels")
    domains = value.get("domains")

    if not _is_record_list(fields):
        return _malformed("fields")
    if not _is_string_list(identity_key):
        return _malformed("identity_key")
    if not _is_record_list(templates):
        return _malformed("templates")
    if not isinstance(pipelines, dict) or not all(
        _is_string_list(pipeline) for pipeline in pipelines.values()
    ):
        return _malformed("pipelines")
    if not _is_string_list(levels):
        return _malformed("levels")
    if not _is_string_list(domains):
        return _malformed("domains")

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

    # ⚠️ **`pipelines`, and the kind is what a stage list belongs to** —
    # ADR 0063. Four failures, and the third is the one the ADR is about: a
    # *source* whose kind names no pipeline reaches the worker and finds nothing
    # to run, and the ADR's rejected alternative — one pipeline whose prose-only
    # stages skip themselves — is the same silence one layer down.
    declared_kinds = list(pipelines)

    if not declared_kinds:
        errors.append(ValidationError(None, "no_pipelines"))
    else:
        for kind in declared_kinds:
            if kind not in SOURCE_KINDS:
                errors.append(ValidationError(kind, "unknown_pipeline_kind"))

            pipeline = pipelines[kind]
            if not pipeline:
                errors.append(ValidationError(kind, "no_stages"))
                continue

            seen: set[str] = set()
            for stage in pipeline:
                if stage in seen:
                    errors.append(ValidationError(stage, "duplicate_stage"))
                seen.add(stage)

    # ⚠️ **Only the kinds *Ingest* can submit are required, and `anki` is
    # deliberately not one** — :data:`SUBMITTABLE_SOURCE_KINDS` says why.
    for kind in SUBMITTABLE_SOURCE_KINDS:
        if kind not in declared_kinds:
            errors.append(ValidationError(kind, "missing_pipeline"))

    # ⚠️ **ADR 0065 §2's closed sets.** An empty one leaves the model no legal
    # answer; a value listed twice is two filter controls for one thing.
    for section, values in (("levels", levels), ("domains", domains)):
        if not values:
            errors.append(ValidationError(section, "no_values"))
            continue
        seen_values: set[str] = set()
        for entry in values:
            if entry in seen_values:
                errors.append(ValidationError(entry, "duplicate_value"))
            seen_values.add(entry)

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
