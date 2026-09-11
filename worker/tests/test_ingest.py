"""Stages 1 to 5 wired to the database — `worker/ingest.py` (`03` §5, ADR 0010).

⚠️ **This is the seam `00-status.md` § Next describes as one argument.**
`run_ingestion(connection, job, *, process_chunk)` already opens the queue, marks
each chunk `running`, calls the processor, marks it `complete` or `failed`,
heartbeats and settles the run. #8 supplies `process_chunk` and changes nothing
else in the loop, and these tests are that claim.

Needs the container: the behaviour under test is the SQL around the stages. The
stages themselves are asserted with no database at all in `test_pipeline.py` and
its four siblings, which is the split `11` §8 asks for.
"""

from __future__ import annotations

import psycopg
import pytest

from ingest import make_chunk_processor
from jobs import drain
from pipeline.tokenise import DICTIONARY_VERSION
from runs import run_ingestion
from seed import LIBRARY, OWNER, ledger, make_run, seed_note

# ⚠️ **The seed is `tests/seed.py`**, shared with `test_generation.py` rather
# than copied into it: a second copy of the four rows `S2` names on submit is a
# second place for `04`'s column list to go stale.
class Recorder:
    """Stage 6, as a thing that can be asked whether it was called.

    ⚠️ It spends nothing and writes nothing, which is `11` §7's stage-order test
    in its strongest form: the assertion is about the **absence** of a call.

    ⚠️ **One call per *chunk*, with that chunk's whole surviving set** (ADR 0047).
    It was one call per group until #9, which `04` §6.3's cache key could not
    have survived: the four-tuple is the *chunk*'s content hash, so every
    candidate in a chunk would have shared one row.
    """

    def __init__(self) -> None:
        self.terms: list[str] = []
        self.calls: list[tuple[str, ...]] = []

    def __call__(self, connection: psycopg.Connection, context, groups) -> None:
        self.calls.append(tuple(group.candidate.term for group in groups))
        self.terms.extend(group.candidate.term for group in groups)


def run(connection: psycopg.Connection, *, generate=None) -> int:
    return drain(
        connection,
        owner="w",
        handle=lambda conn, job: run_ingestion(
            conn, job, process_chunk=make_chunk_processor(job, generate=generate)
        ),
    )


# ---------------------------------------------------------------------------


def test_a_claimed_job_runs_every_chunk_to_the_edge_of_generation(connection):
    """`03` §5.1's stages 1 to 5 over a real *source*, and `04` §6.1's ledger.

    Both chunks complete, so `settle_run` answers `complete` rather than
    `incomplete` — which is the first time in this project that it can.
    """
    ingestion_id = make_run(connection)
    generate = Recorder()

    assert run(connection, generate=generate) == 1

    status, dictionary_version, extracted, deduplicated, known, rejected = ledger(
        connection, ingestion_id
    )
    assert status == "complete"
    assert dictionary_version == DICTIONARY_VERSION
    assert (extracted, deduplicated, known, rejected) == (7, 0, 0, 0)

    # ⚠️ **図書館 twice, and that is not a defect at this ticket.** A *chunk* is
    # tokenised independently (`03` §5.1), so stage 4 folds repeats **within** a
    # chunk and cannot see across one: 図書館 is in both. `deduplicated` is 0 here
    # for the same reason — neither chunk repeats a word inside itself.
    #
    # ⚠️ **#9 is what closes it, and closes it through the corpus rather than
    # here.** `03` §5.1 stage 7 writes *pending notes* **streamed — as produced,
    # not at the end** — so by the time chunk 1's 図書館 reaches chunk 2 it is a
    # `note`, and `DatabaseCorpus.known_notes` answers with it. The streaming is
    # therefore not only `S2`'s time-to-first-review; it is also what keeps a
    # long *source* from being generated twice.
    assert generate.terms == ["駅", "近く", "図書館", "有る", "図書館", "時", "開く"]


def test_nothing_is_generated_for_a_word_the_corpus_already_has(connection):
    """ADR 0010, through the database this time. The *note* exists, so the run
    pays nothing for it — and `04` §5.3's `UNIQUE (subject_id, identity_key)`
    would have refused the row anyway.
    """
    ingestion_id = make_run(connection)
    seed_note(connection, LIBRARY)
    generate = Recorder()

    run(connection, generate=generate)

    assert "図書館" not in generate.terms
    # Once per *chunk* it appeared in: the counters are sightings, accumulated
    # across the run, and 図書館 is in both chunks.
    assert ledger(connection, ingestion_id)[4] == 2


def test_a_collision_appends_an_occurrence_at_every_position_it_appeared(connection):
    """ADR 0006, and `04` §5.5's columns.

    図書館 is in both *chunks* — at character 5 of the *source* and again at 14 —
    so the run appends two *occurrences* to the existing *note* and vets nothing.
    ⚠️ The second position is in the second chunk, which is what proves the
    chunk's own `char_start` reached the row: within its chunk 図書館 begins at 0.
    """
    make_run(connection)
    note_id = seed_note(connection, LIBRARY)

    run(connection)

    rows = connection.execute(
        """
        SELECT char_start, char_end, surface_form, note_id IS NOT NULL, ingestion_id IS NOT NULL
        FROM occurrence WHERE note_id = %s ORDER BY char_start;
        """,
        (note_id,),
    ).fetchall()
    assert rows == [(5, 8, "図書館", True, True), (14, 17, "図書館", True, True)]


def test_re_running_a_source_appends_no_occurrence_it_already_has(connection):
    """`04` §5.5's `UNIQUE (note_id, source_id, char_start)` — *re-running a
    source appends nothing it already has*. This is what makes re-ingestion
    idempotent in the one place idempotence is cheap.
    """
    ingestion_id = make_run(connection)
    note_id = seed_note(connection, LIBRARY)
    run(connection)

    # A resume of the same *ingestion*: every chunk back on the queue.
    connection.execute(
        "UPDATE ingestion_chunk SET status = 'pending' WHERE ingestion_id = %s;",
        (ingestion_id,),
    )
    connection.execute(
        "INSERT INTO job (kind, ingestion_id, state) VALUES ('resume', %s, 'queued');",
        (ingestion_id,),
    )
    run(connection)

    count = connection.execute(
        "SELECT count(*) FROM occurrence WHERE note_id = %s;", (note_id,)
    ).fetchone()[0]
    assert count == 2


def test_nothing_is_generated_for_a_word_this_reader_has_rejected(connection):
    """`S5` and `04` §7.2 — *saying no once means it*, and the rejection is
    permanent (ADR 0006). `11` §7's stage-order test, against the real query.
    """
    ingestion_id = make_run(connection)
    seed_note(connection, LIBRARY, rejected_by=OWNER)
    generate = Recorder()

    run(connection, generate=generate)

    assert "図書館" not in generate.terms
    _, _, _, _, known, rejected = ledger(connection, ingestion_id)
    # ⚠️ Counted under *rejected* and not under *already known*, though both
    # filters match it: `04` §6.1 gives them separate columns and `03` §11 shows
    # the reader which filter removed the work.
    assert (known, rejected) == (0, 2)


def test_another_reader_s_rejection_does_not_filter_this_run(connection):
    """⚠️ `04` §7.2: *`note_vetting` is **personal** because ADR 0012 says a
    rejection is a claim about the reader.* A missing `owner_id` filter here
    would be the same defect § Carrying already records against `recentRuns`,
    `allSources` and `sourceDetail` — and with one reader in v1 it would pass
    every test that did not have a second one.
    """
    ingestion_id = make_run(connection)
    seed_note(connection, LIBRARY, rejected_by="usr_someone_else")

    run(connection)

    _, _, _, _, known, rejected = ledger(connection, ingestion_id)
    assert (known, rejected) == (2, 0)


def test_a_run_with_no_generator_still_completes_and_spends_nothing(connection):
    """The state #8 leaves behind: stages 1 to 5 run, the ledger is written, and
    stage 6 does not exist yet (#9). ⚠️ `04` §6.1 calls a run that produced no
    new *notes* a success — `03` §11 says the same in as many words — so this
    settles `complete` rather than `incomplete`.
    """
    ingestion_id = make_run(connection)

    run(connection)

    assert ledger(connection, ingestion_id)[0] == "complete"
    assert connection.execute("SELECT count(*) FROM note;").fetchone()[0] == 0


def test_a_chunk_that_cannot_be_read_fails_alone_and_leaves_the_run_resumable(connection):
    """`03` §5.4 and `04` §6.1: a chunk that cannot be processed is `failed` and
    the *ingestion* is `incomplete` — **the resumable state, not an error**.

    ⚠️ The trigger here is an `ingestion_chunk` pointing past the end of its
    *source*, which `pipeline.chunk` refuses rather than clamping. The reason it
    refuses is this test: Python slicing would have returned a short string, the
    tail of the *chunk* would have tokenised as a truncated word, and the *note*
    at the end of it would have been a note about a word that does not exist.
    Here the second chunk is spoiled and the first still completes, which is what
    `03` §5.4 means by keeping partial results.
    """
    ingestion_id = make_run(connection)
    connection.execute(
        """
        UPDATE source_chunk SET char_end = 9999
        WHERE ordinal = 1 AND source_id = (SELECT source_id FROM ingestion WHERE id = %s);
        """,
        (ingestion_id,),
    )

    run(connection)

    assert ledger(connection, ingestion_id)[0] == "incomplete"
    rows = connection.execute(
        """
        SELECT sc.ordinal, ic.status FROM ingestion_chunk ic
        JOIN source_chunk sc ON sc.id = ic.source_chunk_id
        WHERE ic.ingestion_id = %s ORDER BY sc.ordinal;
        """,
        (ingestion_id,),
    ).fetchall()
    assert rows == [(0, "complete"), (1, "failed")]
