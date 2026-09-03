# A subject is a declared schema and a pipeline, living in the repo

A **subject** is declared once, in the repo, as data. One declaration drives three consumers: the
LLM's structured-output contract, the note type's field list, and the card templates. It also names,
in order, the **pipeline stages** an ingestion runs — tokenisation is a stage a Japanese subject
names and an English subject omits. Adding a subject is a code change plus tests, not a UI flow.

The justification is **not** future subjects — v1 has one. It is that when the output contract, the
field list and the templates drift apart you get cards rendering fields the model was never asked to
produce, silently and only for some notes. One declaration with three consumers designs that class
of bug out.

Pipeline stages are folded in here rather than left to `BRIEF.md` §4.5 because deciding "a subject is
only a schema" and then discovering it must also select a tokenizer would reopen this. *Where* stages
run is §4.12 and stays closed.

## Considered options

- **Hard-code each subject as a concrete type.** Rejected: loses the one-declaration-three-consumers
  property, which is the whole reason to do this.
- **Subjects as data, editable in the app.** Rejected: a schema editor built for a user who can write
  a schema faster than he can operate the editor, and it moves the LLM's output contract behind a UI
  where a typo becomes a runtime failure instead of a failed check.

## Schema evolution

Fields are **additive and optional**. Note types are **not versioned**. Renaming or removing a field
is never done — add a new field and stop reading the old one.

Adding a field is then safe by construction: existing notes carry it empty and a backfill can populate
it later. Adding a *template* mints new cards for existing notes with fresh scheduling, which is
correct — a card never seen should not inherit a schedule. Versioning note types buys almost nothing
for one user, and §4.11 already records the model and prompt version per note, which answers the
question actually asked of history ("what generated this?"). The never-rename rule is what protects
six months of review history, and it costs nothing to adopt now.
