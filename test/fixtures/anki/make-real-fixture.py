"""Builds `test/fixtures/anki/real-latest.apkg` with real Anki 26.09.2.

⚠️ Every note is invented. Nothing here comes from a downloaded deck — the
repository is public and AnkiWeb's Shared Deck License is personal-studies-only
(`docs/anki-apkg-research.md` §3.3, §6).

Run in a throwaway venv; the `anki` wheel is deliberately NOT in
`worker/pyproject.toml` (#26, and it is AGPL — research §3.3).

    uv venv /tmp/anki-venv --python 3.11
    uv pip install --python /tmp/anki-venv/bin/python anki
    /tmp/anki-venv/bin/python make-real-fixture.py <out.apkg>
"""
import shutil, sys, tempfile
from pathlib import Path
from anki.collection import Collection, DeckIdLimit
from anki.decks import DeckId
import anki.import_export_pb2 as pb

out = Path(sys.argv[1]).resolve()
work = Path(tempfile.mkdtemp())
col = Collection(str(work / "collection.anki2"))

deck_id = col.decks.id("JLPT::N5")
basic = col.models.by_name("Basic")

# Invented notes. The first carries furigana in Anki's own bracket form, the
# second is plain, the third is one of the two entry shapes research §1.3
# measured (with made-up words), the fourth is media-only and must be dropped.
for front, back in [
    ("内陸[ないりく]", "inland"),
    ("図書館", "library"),
    ("(かさを～) さす", "to put up (an umbrella)"),
    ("[sound:nothing.mp3]", "media only"),
]:
    note = col.new_note(basic)
    note["Front"] = front
    note["Back"] = back
    note.tags = ["JLPT_5", "Genki"]
    col.add_note(note, DeckId(deck_id))

col.export_anki_package(
    out_path=str(out),
    options=pb.ExportAnkiPackageOptions(
        with_scheduling=False, with_media=False, legacy=False,
    ),
    limit=DeckIdLimit(DeckId(deck_id)),
)
col.close()
shutil.rmtree(work, ignore_errors=True)
print("wrote", out, out.stat().st_size, "bytes")
