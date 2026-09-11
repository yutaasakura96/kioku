"""Stage 2 — SudachiPy in C split mode (`03` §5.1, §3.4, ADR 0019).

⚠️ **No database and no Docker.** `11` §7 puts the pipeline in the group that
needs "neither a second session nor a container, but does need Python", and the
dictionary is the only thing these tests load.
"""

from __future__ import annotations

from pipeline.tokenise import DICTIONARY_VERSION, dictionary, tokenise


def test_c_mode_keeps_a_compound_whole() -> None:
    """`03` §5.1 stage 3: *Compounds survive: C mode keeps 図書館 whole.*

    ⚠️ This is the assertion that pins the **split mode**. In A mode 図書館 comes
    back as 図書/館, and two fragments reaching `normalized_form` is `03` §5.2's
    "a note about a word that does not exist" arriving from the other direction.
    """
    surfaces = [token.surface for token in tokenise("駅の近くに図書館があります。")]

    assert "図書館" in surfaces
    assert "図書" not in surfaces


def test_the_dictionary_is_one_object_for_the_life_of_the_process() -> None:
    """`03` §3.4, and the single easiest thing in the worker to get wrong.

    A second `Dictionary()` costs the same load **and its own memory mapping** —
    76 MB to 148 MB to 220 MB (verification §7.3). The guard is identity: every
    caller gets the object the first one built.
    """
    assert dictionary() is dictionary()


def test_the_dictionary_version_is_the_pinned_release() -> None:
    """PIN 2/6 (`03` §13.5), read from the installed package rather than typed.

    It is the second element of the generation cache key (`03` §5.3) and a
    column on both `ingestion` and `note_field_provenance` (`04` §5.4, §6.1), so
    a hard-coded copy here would be a second place for it to be wrong.
    """
    assert DICTIONARY_VERSION == "20260723"
