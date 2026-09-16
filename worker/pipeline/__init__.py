"""The *ingestion* pipeline — `03` §5, `03` §10, ADR 0063.

One flat module per *stage*, **named by the declaration**: `subjects/jlpt-vocab.json`'s
pipeline entries are these module names (`03` §10), and `tests/test_pipeline.py`
asserts the two lists are the same list rather than trusting that they are.

⚠️ **Stages 6 and 7 arrived with #9** — `generate.py` and `write_pending.py`, so
the seven modules and the seven stage keys are now the same seven, and
`tests/test_pipeline.py` asserts all of them rather than the first five.

⚠️ **Since ADR 0063 the declaration names one ordered stage list per *source
kind*, and :func:`run_stages` dispatches on it** rather than running a sequence
written out in Python. A word list runs `normalise` where prose runs `tokenise`
and `extract_candidates`; the rest is the same code. The alternative ADR 0063
rejected — one pipeline whose prose-only stages skip themselves — is a stage that
silently does nothing, and the first bug it produces reads as *the tokeniser is
broken* rather than *the tokeniser was not supposed to run*.

⚠️ **A stage key with no runner here is a startup failure** (:func:`check_pipelines`,
called from `worker/__main__.py`), not a skip at dispatch. `03` §10's rule is that
the declaration names the modules; the way that rule fails quietly is a key nobody
implemented, discovered on the chunk that needed it, hours into a run.

⚠️ **Stages 2 to 5 are the pure ones, and only those.** `11` §8 names them as the
seam — pure functions over tokens → candidates — and the corpus arrives as two
plain collections that the caller looked up. `03` §5.1 never claimed more: stage
1 is the app's, **stage 6 is the LLM** (though what lives in `generate.py` is
still pure — it builds a request and reads an answer, and `worker/provider.py` is
what turns one into the other), and **stage 7 writes**.

:func:`run_stages` runs 2 to 5 and returns *survivors* rather than notes, which
is where ADR 0010's edge is: everything that shrinks the work happens before
anything that spends. `worker/ingest.py` is what carries a survivor across it.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import AbstractSet, Callable, Mapping, Protocol

from subject import Declaration, pipeline_kinds, stage_keys

from .chunk import chunk_text
from .deduplicate import Group, deduplicate
from .extract_candidates import Candidate, extract_candidates
from .filter_known import filter_known
from .normalise import normalise
from .tokenise import DICTIONARY_VERSION, Token, tokenise

__all__ = [
    "Corpus",
    "StageResult",
    "UnknownStage",
    "check_pipelines",
    "chunk_text",
    "run_stages",
]


class UnknownStage(LookupError):
    """A *pipeline* names a stage this package has no runner for.

    ⚠️ **Raised at startup, never at dispatch.** `worker/__main__.py` calls
    :func:`check_pipelines` before it claims anything, so a declaration edited to
    name a stage nobody wrote stops the worker with the key in the message
    instead of failing the first *chunk* that reached it — which, on a resumable
    run, is a failure that looks like the material rather than like the
    configuration.
    """


class Corpus(Protocol):
    """What stages 4 and 5 need to know, and the only thing they ask for.

    ⚠️ **This is the seam `11` §8 is describing.** The stages are pure functions
    over candidates; what is not pure is *what does the corpus already contain*,
    and putting that behind two methods is what lets the whole composition be
    tested with a dict and run against Postgres unchanged.

    ⚠️ **Both are asked the question narrowed to this chunk's keys**, not "give
    me everything" — `04` §12's second query is *does `(subject_id,
    identity_key)` exist?* and its third is the rejected set. A corpus of ten
    thousand *notes* re-read on every chunk would be a cost that grows with the
    thing `S5` promises to make cheaper.
    """

    def known_notes(self, identity_keys: AbstractSet[str]) -> Mapping[str, str]:
        """Identity key → `note.id`, for the keys that already have one."""

    def rejected(self, identity_keys: AbstractSet[str]) -> AbstractSet[str]:
        """The subset this reader has rejected — `04` §7.2, `04` §12's third query."""


@dataclass(frozen=True)
class StageResult:
    """What one *chunk* is worth, before anything has been spent on it."""

    #: What reaches stage 6 — #9's input, and the only thing that costs money.
    survivors: tuple[Group, ...]
    #: Groups whose ADR 0006 key the corpus already carries. Every sighting in
    #: them is an *occurrence* to append (`04` §5.5) and none of them is a *note*
    #: to vet. ⚠️ A **rejected** word is in here too: the rejection is a claim
    #: about the reader (ADR 0012) and the position is a fact about the material
    #: (`04` §4), and dropping the second because of the first confuses them.
    collisions: tuple[Group, ...]
    #: `04` §6.1's four counters, which `03` §11 shows the reader as *how many
    #: candidates were filtered, and by which filter*.
    extracted: int
    deduplicated: int
    already_known: int
    rejected: int
    #: `03` §5.3's corrected cache key names it, and `04` §6.1 has the column.
    dictionary_version: str


@dataclass(frozen=True)
class StageState:
    """What one *chunk* looks like part-way through its pipeline.

    ⚠️ **One value threaded through the stages, rather than a sequence written
    out in Python.** ADR 0063 makes the *ordered stage list* the declaration's,
    so the composition here has to be a fold over whatever that list says — and a
    fold needs something to fold. The stages themselves are untouched: each
    runner below is three lines that read this and return a new one, and the pure
    functions `11` §8 names keep the signatures they had.

    ⚠️ **Frozen, and each runner returns a replacement.** A mutable state would
    let a stage half-apply itself and leave the next one reading a mixture; this
    way a stage either produced a new state or it did not run.
    """

    declaration: Declaration
    #: The *chunk*'s text, already sliced — stage 1 is the app's.
    text: str
    #: The chunk's offset within the *source*, because `04` §5.5 stores positions
    #: within the source and both `tokenise` and `normalise` count from zero.
    char_start: int
    corpus: Corpus
    tokens: tuple[Token, ...] = ()
    candidates: tuple[Candidate, ...] = ()
    groups: tuple[Group, ...] = ()
    survivors: tuple[Group, ...] = ()
    collisions: tuple[Group, ...] = ()
    extracted: int = 0
    deduplicated: int = 0
    already_known: int = 0
    rejected: int = 0


StageRunner = Callable[[StageState], StageState]


def _run_tokenise(state: StageState) -> StageState:
    return replace(state, tokens=tuple(tokenise(state.text)))


def _run_extract_candidates(state: StageState) -> StageState:
    return replace(
        state,
        candidates=tuple(
            extract_candidates(
                state.declaration, list(state.tokens), char_start=state.char_start
            )
        ),
    )


def _run_normalise(state: StageState) -> StageState:
    """ADR 0063 — `tokenise` and `extract_candidates` at once, for a list.

    ⚠️ **It produces `candidates` and no `tokens`**, and that is the honest shape
    rather than an omission: there is no chunk-wide tokenisation on this path.
    `normalise` tokenises one line at a time, because a word list's unit is the
    line and a morpheme that crossed one would be a morpheme spanning two words.
    """
    return replace(
        state,
        candidates=tuple(
            normalise(state.declaration, state.text, char_start=state.char_start)
        ),
    )


def _run_deduplicate(state: StageState) -> StageState:
    """Stage 4, and the corpus lookup that feeds it.

    ⚠️ **The lookup is narrowed to this chunk's keys** and it is the caller's,
    not the stage's — `deduplicate` stays the pure function `11` §8 names, and
    what is impure is *what does the corpus already contain*.
    """
    identity_keys = {candidate.identity_key for candidate in state.candidates}
    result = deduplicate(
        state.candidates, known_keys=state.corpus.known_notes(identity_keys)
    )
    return replace(
        state,
        groups=result.groups,
        # ⚠️ Computed here rather than at the end, because it is a fact about
        # stage 4's answer: a *collision* is a group the corpus already had, and
        # stage 5 is about to drop those from the survivors.
        collisions=tuple(group for group in result.groups if group.note_id is not None),
        extracted=result.extracted,
        deduplicated=result.deduplicated,
    )


def _run_filter_known(state: StageState) -> StageState:
    identity_keys = {group.identity_key for group in state.groups}
    result = filter_known(state.groups, rejected_keys=state.corpus.rejected(identity_keys))
    return replace(
        state,
        survivors=result.survivors,
        already_known=result.already_known,
        rejected=result.rejected,
    )


#: The stages this package runs, by the declaration's key for them.
#:
#: ⚠️ **`03` §10's rule made executable.** The key is the module name *and* the
#: entry here; :func:`check_pipelines` is what turns a declaration naming
#: something absent into a startup failure rather than a silent skip.
STAGE_RUNNERS: Mapping[str, StageRunner] = {
    "tokenise": _run_tokenise,
    "extract_candidates": _run_extract_candidates,
    "normalise": _run_normalise,
    "deduplicate": _run_deduplicate,
    "filter_known": _run_filter_known,
}

#: Declared stages that are somebody else's to run, named so that a pipeline
#: carrying them is still legal here.
#:
#: ⚠️ **Three, and each is owned by a different process.** `chunk` is the app's —
#: `shared/ingest/chunk.ts` writes `source_chunk` rows before a worker has
#: claimed anything, and a second implementation would be a second answer to
#: *where does chunk 3 begin* (`pipeline/chunk.py`). `generate` and
#: `write_pending` are `worker/ingest.py`'s generator hook, called once per chunk
#: with that chunk's whole surviving set (ADR 0047) — after this function has
#: returned, because everything that shrinks the work happens before anything
#: that spends (ADR 0010).
STAGES_RUN_ELSEWHERE = frozenset({"chunk", "generate", "write_pending"})


def check_pipelines(declaration: Declaration) -> None:
    """Every stage in every pipeline is one somebody runs — or raise.

    ⚠️ **Called at startup, from `worker/__main__.py`.** #19's criterion in its
    own words: *a stage key that has no module is a startup failure, not a silent
    skip*. The cost of the other answer is a run that claims a job, processes
    four chunks and drops a stage on the fifth — with nothing in the log saying
    which stage, because nothing ran.
    """
    for kind in pipeline_kinds(declaration):
        for key in stage_keys(declaration, kind):
            if key not in STAGE_RUNNERS and key not in STAGES_RUN_ELSEWHERE:
                raise _unknown_stage(kind, key)


def _unknown_stage(kind: str, key: str) -> UnknownStage:
    """The one wording, because the two raisers must not drift.

    :func:`check_pipelines` fires at startup and :func:`run_stages` fires for a
    declaration reloaded under a running worker; they are the same finding at two
    moments, and two messages would read as two faults.
    """
    return UnknownStage(
        f"the {kind!r} pipeline names the stage {key!r} and nothing runs it: "
        f"`worker/pipeline/` has no runner for it and it is not one of "
        f"{sorted(STAGES_RUN_ELSEWHERE)} (`03` §10, ADR 0063)"
    )


def run_stages(
    declaration: Declaration,
    text: str,
    *,
    kind: str,
    char_start: int,
    corpus: Corpus,
) -> StageResult:
    """The *chunk*'s pipeline, as the declaration orders it for this *kind*.

    ``text`` is the chunk, already sliced — stage 1 is the app's (`pipeline.chunk`
    says why). ``char_start`` is that chunk's offset within the *source*, because
    `04` §5.5 stores positions within the source and both candidate-producing
    stages count from zero. ``kind`` is `source.kind` (ADR 0063), and it is read
    from the row rather than guessed from the text.

    ⚠️ **The order is the declaration's, not this function's.** ADR 0003 says the
    file is read by both toolchains and restated by neither, and a sequence
    written out here would be a restatement — the one that matters, because it is
    the one that decides what actually runs.

    ⚠️ **The corpus is consulted before stage 6, and that is ADR 0010.** Both
    lookups happen inside the two stages that need them, on a set of keys the
    candidate stage has already narrowed, and the function returns *survivors*
    rather than *notes* precisely because the next thing that happens costs
    money. Ordered the other way, full price is paid to generate notes that are
    discarded a moment later — and `S5` says the fiftieth *source* must ask about
    fewer notes than the fifth.

    ⚠️ **An unknown stage raises here as well as at startup.** `check_pipelines`
    is the guard that fires before any job is claimed; this is the same check at
    the only other moment it could matter, for a declaration reloaded under a
    running worker.
    """
    state = StageState(
        declaration=declaration, text=text, char_start=char_start, corpus=corpus
    )

    for key in stage_keys(declaration, kind):
        if key in STAGES_RUN_ELSEWHERE:
            continue
        runner = STAGE_RUNNERS.get(key)
        if runner is None:
            raise _unknown_stage(kind, key)
        state = runner(state)

    return StageResult(
        survivors=state.survivors,
        collisions=state.collisions,
        extracted=state.extracted,
        deduplicated=state.deduplicated,
        already_known=state.already_known,
        rejected=state.rejected,
        dictionary_version=DICTIONARY_VERSION,
    )
