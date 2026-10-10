"""Stage 6a — *look up*, and what stage 7 writes for it (ADR 0075 §5, #68).

The first half is pure: groups and something that answers `find` in, what was
found and what is still missing out. The second half needs the container,
because what is under test there is the rows a dictionary *note* is.
"""

from __future__ import annotations

import psycopg
import pytest

from dictionary import Word
from ingest import make_chunk_processor, make_generator
from jobs import drain
from pipeline import run_stages
from pipeline.deduplicate import Group
from pipeline.extract_candidates import Candidate
from pipeline.generate import GenerationRefused
from pipeline.lookup import NO_DICTIONARY, Found, lookup, notes_for
from pipeline.tokenise import DICTIONARY_VERSION
from runs import run_ingestion
from seed import LIBRARY, OWNER, make_run, spend
from subject import load_declaration
from test_generation import FakeProvider

DECLARATION = load_declaration()
STATION = "駅" + chr(31) + "えき"
NEARBY = "近く" + chr(31) + "ちかく"
VERSION = "JMdict 2026-10-09"


def group(term: str, reading: str) -> Group:
    candidate = Candidate(
        term=term,
        reading=reading,
        part_of_speech="名詞",
        surface_form=term,
        char_start=0,
        char_end=len(term),
        is_oov=False,
        identity_key=term + chr(31) + reading,
    )
    return Group(
        identity_key=candidate.identity_key, candidate=candidate, sightings=(candidate,), note_id=None
    )


class Answers:
    """A dictionary that is a dict."""

    version = "a dictionary"

    def __init__(self, **words: Word) -> None:
        self._words = words
        self.asked: list[tuple[str, str]] = []

    def find(self, term: str, reading: str) -> Word | None:
        self.asked.append((term, reading))
        return self._words.get(term)


LIBRARY_WORD = Word(sequence=1, meaning="library", meanings=("library",), part_of_speech="noun")


# ---------------------------------------------------------------------------
# The stage
# ---------------------------------------------------------------------------


def test_what_the_dictionary_has_is_found_and_the_rest_goes_on() -> None:
    found, missing = group("図書館", "としょかん"), group("魑魅魍魎", "ちみもうりょう")

    result = lookup([found, missing], dictionary=Answers(図書館=LIBRARY_WORD))

    assert result.found == (Found(group=found, word=LIBRARY_WORD),)
    assert result.missing == (missing,)


def test_a_word_with_no_reading_is_not_looked_up() -> None:
    """ADR 0063 leaves the reading empty when SudachiPy could not read the line,
    and a term alone does not name one entry."""
    unread = group("図書館", "")
    dictionary = Answers(図書館=LIBRARY_WORD)

    result = lookup([unread], dictionary=dictionary)

    assert result.missing == (unread,)
    assert dictionary.asked == []


@pytest.mark.parametrize(
    "word",
    [
        Word(sequence=1, meaning="", meanings=(), part_of_speech="noun"),
        Word(sequence=1, meaning="library", meanings=("library",), part_of_speech=""),
    ],
)
def test_an_entry_with_nothing_to_show_is_still_missing(word) -> None:
    """The *note* needs both fields, and the model can still be asked."""
    asked = group("図書館", "としょかん")

    assert lookup([asked], dictionary=Answers(図書館=word)).missing == (asked,)


def test_with_no_dictionary_every_word_goes_on() -> None:
    asked = group("図書館", "としょかん")

    assert lookup([asked], dictionary=NO_DICTIONARY).missing == (asked,)


def test_a_dictionary_note_carries_the_tokenisers_word_and_the_dictionarys_meaning() -> None:
    asked = group("図書館", "としょかん")

    (note,) = notes_for(DECLARATION, [Found(group=asked, word=LIBRARY_WORD)], version=VERSION)

    assert note.fields == {
        "term": "図書館",
        "reading": "としょかん",
        "part_of_speech": "noun",
        "meaning": "library",
    }
    assert note.identity_key == asked.identity_key
    assert note.meanings == ("library",)
    assert note.looked_up == {"part_of_speech": VERSION, "meaning": VERSION}
    # ⚠️ No claim at all: a *level* is the list's or the word has none.
    assert (note.level, note.domain) == (None, None)


def test_a_dictionary_note_passes_the_same_boundary_a_generated_one_does() -> None:
    blank = Word(sequence=1, meaning=" ", meanings=(), part_of_speech="noun")

    with pytest.raises(GenerationRefused, match="meaning"):
        notes_for(DECLARATION, [Found(group=group("図書館", "としょかん"), word=blank)], version=VERSION)


class EmptyCorpus:
    def known_notes(self, identity_keys):
        return {}

    def rejected(self, identity_keys):
        return frozenset()


@pytest.mark.parametrize("kind", ["prose", "word_list", "anki"])
def test_every_pipeline_looks_up_before_it_generates(kind, sample_dictionary) -> None:
    """The declaration orders it, and `run_stages` hands stage 6 what is left."""
    text = "図書館\n近く\n" if kind != "prose" else "近くに図書館があります。"

    result = run_stages(
        DECLARATION,
        text,
        kind=kind,
        char_start=0,
        corpus=EmptyCorpus(),
        dictionary=sample_dictionary,
    )

    assert [found.group.identity_key for found in result.found] == [LIBRARY]
    assert LIBRARY not in {survivor.identity_key for survivor in result.survivors}
    assert NEARBY in {survivor.identity_key for survivor in result.survivors}


def test_a_word_the_corpus_holds_is_never_looked_up(sample_dictionary) -> None:
    """ADR 0010's order: the starter set is in the corpus, so a word on a JLPT
    list is a collision and the reader is handed the *note* that is there."""

    class Holding(EmptyCorpus):
        def known_notes(self, identity_keys):
            return {LIBRARY: "note-1"} if LIBRARY in identity_keys else {}

    result = run_stages(
        DECLARATION,
        "図書館\n",
        kind="word_list",
        char_start=0,
        corpus=Holding(),
        dictionary=sample_dictionary,
    )

    assert result.found == ()
    assert [collision.identity_key for collision in result.collisions] == [LIBRARY]


# ---------------------------------------------------------------------------
# Stage 7, for a *note* the dictionary wrote — needs the container
# ---------------------------------------------------------------------------


def run(connection: psycopg.Connection, provider, dictionary, *, log=None, declaration=None) -> int:
    generate = make_generator(provider, worker_environment="laptop")
    return drain(
        connection,
        owner="w",
        handle=lambda conn, job: run_ingestion(
            conn,
            job,
            process_chunk=make_chunk_processor(
                job,
                generate=generate,
                dictionary=dictionary,
                worker_environment="laptop",
                **({} if declaration is None else {"declaration": declaration}),
                **({} if log is None else {"log": log}),
            ),
        ),
    )


def fields_of(connection: psycopg.Connection, identity_key: str) -> dict:
    return connection.execute(
        "SELECT fields FROM note WHERE identity_key = %s;", (identity_key,)
    ).fetchone()[0]


def test_a_word_the_dictionary_has_is_written_without_asking_the_model(
    connection, sample_dictionary
):
    """#68: *meanings for own words come from the dictionary, AI only for words
    the dictionary lacks.*"""
    make_run(connection)
    provider = FakeProvider()

    run(connection, provider, sample_dictionary)

    assert fields_of(connection, LIBRARY) == {
        "term": "図書館",
        "reading": "としょかん",
        "part_of_speech": "noun",
        "meaning": "library",
    }
    assert fields_of(connection, STATION)["meaning"] == "railway station; train station"
    # 近く is not in the sample, so the model was asked about it and only it.
    assert fields_of(connection, NEARBY)["meaning"] == "meaning of 近く"
    asked = "\n".join(provider.calls)
    assert "term=近く" in asked
    assert "term=図書館" not in asked and "term=駅" not in asked


def test_a_dictionary_note_says_which_dictionary_each_field_came_from(
    connection, sample_dictionary
):
    """ADR 0004 per field: SudachiDict read the word, JMdict gave its meaning,
    and no model is named on any of the four."""
    make_run(connection)

    run(connection, FakeProvider(), sample_dictionary)

    rows = connection.execute(
        """
        SELECT p.field_name, p.kind, p.dictionary_version, p.model_id, p.is_oov
        FROM note_field_provenance p JOIN note n ON n.id = p.note_id
        WHERE n.identity_key = %s ORDER BY p.field_name;
        """,
        (LIBRARY,),
    ).fetchall()
    assert rows == [
        ("meaning", "lookup", VERSION, None, None),
        ("part_of_speech", "lookup", VERSION, None, None),
        ("reading", "lookup", DICTIONARY_VERSION, None, False),
        ("term", "lookup", DICTIONARY_VERSION, None, False),
    ]


def test_a_dictionary_notes_accepted_meanings_are_the_dictionarys(connection, sample_dictionary):
    make_run(connection)

    run(connection, FakeProvider(), sample_dictionary)

    assert connection.execute(
        """
        SELECT m.meanings, m.dictionary_version, m.model_id, m.prompt_version
        FROM note_meaning m JOIN note n ON n.id = m.note_id WHERE n.identity_key = %s;
        """,
        (STATION,),
    ).fetchone() == (["railway station", "train station"], VERSION, None, None)


def test_a_dictionary_note_makes_no_claim_about_level_or_domain(connection, sample_dictionary):
    """ADR 0075 §2: a *level* comes from the list. A word the list does not
    carry has none, rather than a guess with no name on it."""
    make_run(connection)

    run(connection, FakeProvider(), sample_dictionary)

    claimed = connection.execute(
        """
        SELECT n.identity_key FROM note n
        WHERE EXISTS (SELECT 1 FROM level_claim c WHERE c.note_id = n.id)
           OR EXISTS (SELECT 1 FROM domain_claim c WHERE c.note_id = n.id);
        """
    ).fetchall()
    assert LIBRARY not in {key for (key,) in claimed}
    assert STATION not in {key for (key,) in claimed}
    assert NEARBY in {key for (key,) in claimed}


def test_the_reader_gets_a_dictionary_word_the_way_they_get_any_other(
    connection, sample_dictionary
):
    """ADR 0064: `accepted`, minted, and with every sighting recorded."""
    make_run(connection)

    run(connection, FakeProvider(), sample_dictionary)

    assert connection.execute(
        """
        SELECT v.state, c.owner_id, c.template_key FROM note n
        JOIN note_vetting v ON v.note_id = n.id JOIN card c ON c.note_id = n.id
        WHERE n.identity_key = %s;
        """,
        (LIBRARY,),
    ).fetchall() == [("accepted", OWNER, "recognition")]
    # 図書館 is in both chunks of the seed: found by the dictionary in the
    # first, and a collision with that *note* in the second.
    assert connection.execute(
        """
        SELECT count(*) FROM occurrence o JOIN note n ON n.id = o.note_id
        WHERE n.identity_key = %s;
        """,
        (LIBRARY,),
    ).fetchone()[0] == 2


def test_a_run_the_dictionary_answered_whole_spends_nothing_and_names_no_model(
    connection, sample_dictionary
):
    """The honest row: where it ran, and nothing about a model that never did."""

    class Everything:
        version = VERSION

        def find(self, term, reading):
            return sample_dictionary.find(term, reading) or Word(
                sequence=0, meaning=f"gloss of {term}", meanings=(), part_of_speech="noun"
            )

    ingestion_id = make_run(connection)
    provider = FakeProvider()
    logged: list[tuple[str, dict]] = []

    run(connection, provider, Everything(), log=lambda event, **fields: logged.append((event, fields)))

    assert provider.calls == []
    assert spend(connection, ingestion_id) == (None, None, None, None, None, None, "laptop")
    looked_up = [fields["notes"] for event, fields in logged if event == "ingest.looked_up"]
    assert len(looked_up) == 2 and all(count > 0 for count in looked_up)
    # A word with no list of its own writes no `note_meaning` row: the check
    # falls back to the displayed meaning.
    assert connection.execute(
        """
        SELECT count(*) FROM note_meaning m JOIN note n ON n.id = m.note_id
        WHERE n.identity_key = %s;
        """,
        (NEARBY,),
    ).fetchone()[0] == 0


def test_a_run_nobody_owns_writes_its_dictionary_notes_and_mints_nothing(
    connection, sample_dictionary
):
    make_run(connection, requested_by=None)
    logged: list[tuple[str, dict]] = []

    run(
        connection,
        FakeProvider(),
        sample_dictionary,
        log=lambda event, **fields: logged.append((event, fields)),
    )

    assert fields_of(connection, LIBRARY)["meaning"] == "library"
    assert connection.execute("SELECT count(*) FROM card;").fetchone()[0] == 0
    assert any(event == "ingest.unowned" and fields["minted"] == 0 for event, fields in logged)


def test_a_run_of_another_subject_is_refused_rather_than_written(connection, sample_dictionary):
    """ADR 0075 §1: the *subject* id is how the corpus started fresh. A run
    queued under the old one fails its *chunks* and writes nothing."""
    ingestion_id = make_run(connection)
    connection.execute(
        "UPDATE ingestion SET subject_id = 'jlpt-vocab' WHERE id = %s;", (ingestion_id,)
    )

    run(connection, FakeProvider(), sample_dictionary)

    assert connection.execute("SELECT count(*) FROM note;").fetchone()[0] == 0
    statuses = connection.execute(
        "SELECT status, last_error FROM ingestion_chunk WHERE ingestion_id = %s;", (ingestion_id,)
    ).fetchall()
    assert statuses and all(status == "failed" for status, _ in statuses)
    assert all("ADR 0075" in error for _, error in statuses)
