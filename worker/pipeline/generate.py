"""Stage 6 — *Generate* (`03` §5.1, §7, ADR 0004, ADR 0010, ADR 0018).

Pure. A *chunk*'s text and its surviving groups in, a request out; a provider's
answer in, validated *notes* out. **Nothing here opens a connection or a socket**
— the provider is `worker/provider.py`, behind ADR 0018's boundary, and the SQL
around this stage is `worker/ingest.py`.

⚠️ **The unit of generation is the *chunk*, not the *candidate*, and that is
[ADR 0047](../../docs/adr/0047-generation-is-one-request-per-chunk-and-notes-are-written-as-each-chunk-returns.md).**
`03` §5.1 calls stage 6 *the LLM, per surviving note*, which reads as one request
per word; `04` §6.3 keys the cache on the *chunk*'s `content_hash` and stores a
`{"notes": [...]}` array under it, which cannot be one request per word — the
four-tuple would collide between every candidate in a chunk. The cache is the
half that could not be wrong, so the chunk is the unit, and the chunk's text is
in the prompt because otherwise the key would be keyed on something the request
never saw.

⚠️ **The model is asked only for the *judgement* fields** (ADR 0004). `term`,
`reading` and `part_of_speech` are the tokeniser's — they are `lookup` in the
declaration and `lookup` in `04` §5.4's provenance — and a model free to write
`term` would be free to change `note.identity_key` (ADR 0006). It echoes the two
*identity key* fields back and nothing else, purely so a returned note can be
matched to the group that asked for it; the values that reach `note.fields` are
still the candidate's.

⚠️ **Every arriving note goes through the declaration boundary** (`03` §7, §2.3)
— :func:`subject.validate`, on the **assembled** note, which is the object that
reaches `note.fields`. Not trusted because the provider documents constrained
decoding, and not trusted because Drizzle typed the column.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from subject import (
    Declaration,
    identity_key_field_names,
    judgement_field_names,
    render_identity_key,
    validate,
)

from .deduplicate import Group

#: ⚠️ **Part three of `04` §6.3's four-tuple, and it is a cache key, not a
#: label.** Any change to :data:`FIELD_INSTRUCTIONS` or :func:`build_prompt`
#: changes what the model was asked, so it changes what may be served from the
#: cache — bump this in the same commit, or a reworded prompt silently reads
#: back answers to the old one.
PROMPT_VERSION = "v1"

#: ⚠️ **Keyed by the declaration's own field names, and a judgement field with no
#: entry here raises.** The declaration says *which* fields exist (ADR 0003); a
#: prompt says *how to write them*, which is not a property of the declaration
#: and is why this dict exists at all. Making the absence an error is what keeps
#: the two in step: adding a field to `subjects/jlpt-vocab.json` fails here by
#: name instead of shipping a field the model was given no guidance for.
FIELD_INSTRUCTIONS: Mapping[str, str] = {
    "meaning": (
        "The English meaning, as a learner's dictionary would give it — the sense "
        "the passage actually uses, not every sense the word has. A few words, no "
        "final full stop."
    ),
    "example_sentence": (
        "One short Japanese sentence using the word, at roughly the level of the "
        "passage. Prefer the sentence the passage itself uses when it is short "
        "enough to stand alone."
    ),
    "example_gloss": "A plain English translation of that example sentence.",
}

#: Enough room for a chunk's worth of notes and no more. `04` §5.2 caps a chunk
#: at ADR 0041's 1200 characters, so a chunk that somehow produced this many
#: output tokens has gone wrong in a way a bigger ceiling would only make
#: costlier.
MAX_OUTPUT_TOKENS = 16_000


class GenerationRefused(ValueError):
    """What arrived is not what was asked for.

    ⚠️ **An error rather than a stored row** (`03` §7). `runs.py` marks the chunk
    `failed` and leaves the run `incomplete`, which is `03` §11's *the same
    incomplete state* and `03` §5.4's resumable one — the reader's other chunks
    keep what they produced.
    """


@dataclass(frozen=True)
class GenerationRequest:
    """One provider call, fully described and carrying no client.

    Built here so that what was asked is a value a test can look at, rather than
    something only observable by calling a provider (`11` §7: *generation tests
    use recorded fixtures and never call a provider*).
    """

    prompt: str
    schema: dict[str, Any]
    max_tokens: int = MAX_OUTPUT_TOKENS


@dataclass(frozen=True)
class GeneratedNote:
    """One *pending note*, assembled and validated, not yet written.

    ``group`` is what asked for it — stage 7 writes one *occurrence* per sighting
    in it (`04` §5.5), which is why a group carries every sighting and not only
    the first.
    """

    group: Group
    fields: dict[str, str]


def lookup_field_names(declaration: Declaration) -> list[str]:
    """The fields the tokeniser owns — everything the declaration does not call
    a *judgement* (ADR 0004).

    Derived rather than listed, for the same reason as everything else that
    reads the declaration: the file is the only copy.
    """
    judged = set(judgement_field_names(declaration))
    return [field["name"] for field in declaration["fields"] if field["name"] not in judged]


def output_schema(declaration: Declaration) -> dict[str, Any]:
    """The structured-output contract, derived from the declaration (`03` §6).

    ⚠️ **`additionalProperties: false` and every property required**, which is
    what makes constrained decoding worth asking for. It is still not trusted:
    :func:`notes_from` validates what arrives regardless (`03` §7).
    """
    names = [*identity_key_field_names(declaration), *judgement_field_names(declaration)]
    return {
        "type": "object",
        "properties": {
            "notes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {name: {"type": "string"} for name in names},
                    "required": names,
                    "additionalProperties": False,
                },
            }
        },
        "required": ["notes"],
        "additionalProperties": False,
    }


def build_prompt(declaration: Declaration, text: str, groups: Sequence[Group]) -> str:
    """The passage, then the words found in it, then what to write about each.

    ⚠️ **The passage is in the prompt**, and `04` §6.3 keying the cache on the
    *chunk*'s `content_hash` is only sound because it is: the hash has to cover
    the request, or a cache hit answers a question that was never asked. It is
    also what lets the model pick the sense the passage uses rather than the
    first sense of the word (ADR 0004).
    """
    judged = judgement_field_names(declaration)
    missing = [name for name in judged if name not in FIELD_INSTRUCTIONS]
    if missing:
        raise GenerationRefused(
            f"the declaration's judgement fields {missing} have no entry in "
            "`FIELD_INSTRUCTIONS`, so the model would be asked for a field with "
            "no guidance. Add one and bump `PROMPT_VERSION`."
        )

    wanted = "\n".join(f"- {name}: {FIELD_INSTRUCTIONS[name]}" for name in judged)
    listed = "\n".join(
        f"{index + 1}. term={group.candidate.term}"
        f" reading={group.candidate.reading}"
        f" part_of_speech={group.candidate.part_of_speech}"
        f" as_written={group.candidate.surface_form}"
        for index, group in enumerate(groups)
    )
    echoed = ", ".join(identity_key_field_names(declaration))

    return (
        # ⚠️ *Note* and not *card*, and certainly not *flashcard*: `CONTEXT.md`
        # gives *Card* an `_Avoid_` list with `flashcard` on it, and this stage
        # does not make cards at all — a *note* is the unit, a *card* is one
        # rendering of it through a *template*, and minting them is #10's
        # (ADR 0002). The prompt is text a model reads, but it is also the
        # clearest statement anywhere of what the model is being asked for.
        "You are writing the fields of a vocabulary note for a Japanese learner, "
        "from a passage they are reading.\n\n"
        "PASSAGE\n"
        f"{text}\n\n"
        "WORDS\n"
        "A morphological analyser found these words in the passage. `term` is the "
        "normalised dictionary form and `as_written` is how it appeared.\n"
        f"{listed}\n\n"
        "WHAT TO WRITE\n"
        f"One entry per listed word, in the listed order. Echo {echoed} back "
        "exactly as given — they identify the entry and must not be corrected, "
        "re-read or re-spelled. Then write:\n"
        f"{wanted}\n\n"
        "Write nothing else. Do not add words the list does not carry, and do not "
        "skip a word because it seems too easy or too hard."
    )


def request_for(declaration: Declaration, text: str, groups: Sequence[Group]) -> GenerationRequest:
    """The whole of what stage 6 asks, as one value."""
    if not groups:
        raise GenerationRefused("stage 6 was asked for nothing; ADR 0010 means it is not called")
    return GenerationRequest(
        prompt=build_prompt(declaration, text, groups),
        schema=output_schema(declaration),
    )


def notes_from(
    declaration: Declaration, groups: Sequence[Group], payload: Any
) -> tuple[GeneratedNote, ...]:
    """Match each returned note to the group that asked for it, and validate it.

    ⚠️ **Matched on the rendered *identity key*, not on position and not on the
    term alone.** Position would make a model that reorders its answers silently
    attach 図書館's meaning to 開く. The term alone is not unique within one
    chunk either: 開く appears as both ひらく and あく, and keeping that pair
    apart is the whole of ADR 0006.

    ⚠️ **A group with no note, and a note matching no group, are both errors.**
    The first is the model quietly dropping a word the reader paid for; the
    second is a word nobody asked about reaching `note.fields`. Neither is worth
    half a chunk.
    """
    return _matched(declaration, groups, payload, allow_extra=False)


def notes_for_cached(
    declaration: Declaration, groups: Sequence[Group], payload: Any
) -> tuple[GeneratedNote, ...] | None:
    """The same, from `04` §6.3's cache, answering `None` for *not usable*.

    ⚠️ **A cached response may be a *superset* of what this run needs, and never
    a subset.** The key is the *chunk*'s content, which cannot change; the
    survivors can, and only ever downward, because stages 4 and 5 shrink as the
    corpus grows (`S5`). So extra notes in a hit are expected and ignored — and a
    hit that does **not** answer every survivor is treated as a miss, which is
    the one case that would otherwise lose a *note* in silence rather than
    spending a second time.

    ⚠️ **A cached response that no longer validates is also a miss**, not an
    error. The declaration can gain a field (ADR 0003 makes them additive), and a
    stored answer from before it is simply an answer to an older question. `04`
    §10 calls this the one table safe to truncate for exactly this reason: the
    cost of being wrong here is money, and the cost of trusting it is a *note*.
    """
    try:
        return _matched(declaration, groups, payload, allow_extra=True)
    except GenerationRefused:
        return None


def _matched(
    declaration: Declaration, groups: Sequence[Group], payload: Any, *, allow_extra: bool
) -> tuple[GeneratedNote, ...]:
    if not isinstance(payload, dict) or not isinstance(payload.get("notes"), list):
        raise GenerationRefused("the response carries no `notes` array")

    by_key = {group.identity_key: group for group in groups}
    seen: dict[str, GeneratedNote] = {}

    for arrived in payload["notes"]:
        if not isinstance(arrived, dict):
            raise GenerationRefused("a note in the response is not an object")
        key = _identity_key_of(declaration, arrived)
        group = by_key.get(key)
        if group is None:
            if allow_extra:
                continue
            raise GenerationRefused("the response carries a note for a word that was not asked for")
        if key in seen:
            raise GenerationRefused("the response carries two notes for one word")
        seen[key] = GeneratedNote(group=group, fields=_assemble(declaration, group, arrived))

    unanswered = [key for key in by_key if key not in seen]
    if unanswered:
        raise GenerationRefused(f"the response is missing {len(unanswered)} of {len(by_key)} notes")

    # In the order the *source* introduced the words, which is the order stage 4
    # preserved and the order the *vetting* queue reads in.
    return tuple(seen[group.identity_key] for group in groups)


def _identity_key_of(declaration: Declaration, arrived: Mapping[str, Any]) -> str:
    try:
        return render_identity_key(declaration, dict(arrived))
    except (KeyError, TypeError) as error:
        raise GenerationRefused(f"a note in the response has no identity: {error}") from error


def _assemble(
    declaration: Declaration, group: Group, arrived: Mapping[str, Any]
) -> dict[str, str]:
    """The tokeniser's fields, then the model's, then the declaration boundary.

    ⚠️ **The candidate's values win and the echo is discarded.** The echo exists
    to identify the entry; a model that "corrected" 引越し to 引っ越し would
    otherwise rewrite `note.identity_key` and re-create the collision ADR 0006
    exists to prevent. The echo has already been used — it is what matched this
    note to this group — so a disagreement has been caught by the match failing,
    not by comparing strings here.
    """
    fields: dict[str, Any] = {}
    for name in lookup_field_names(declaration):
        if not hasattr(group.candidate, name):
            raise GenerationRefused(
                f"the declaration names {name!r} as a looked-up field and a "
                "*candidate* does not carry one; stage 3 is where it would come from"
            )
        fields[name] = getattr(group.candidate, name)

    for name in judgement_field_names(declaration):
        if name in arrived:
            fields[name] = arrived[name]

    # ⚠️ Whatever the model sent that the declaration does not name lands here
    # too, so `validate` reports it as `unknown` rather than it being dropped
    # quietly — the other half of ADR 0003's drift (`subject.validate`).
    for name, value in arrived.items():
        if name not in fields:
            fields[name] = value

    result = validate(declaration, fields)
    if not result.ok:
        raise GenerationRefused(
            "a generated note does not satisfy the declaration: "
            + ", ".join(f"{error.field}:{error.code}" for error in result.errors)
        )
    return {name: fields[name] for name in (field["name"] for field in declaration["fields"])}
