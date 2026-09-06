# The note's fields are a blob and its provenance is not

**`note.fields` is a single `jsonb` document. `note_field_provenance` is a relational table keyed
`(note_id, field_name)`.** The split runs exactly along the line PostgreSQL §8.14.2 draws, and it is
taken for the query that ADR 0018 already committed the project to running, not for the row-lock
argument that ADR 0021 correctly called weak.

This was deferred twice on purpose — once in Round 2, once in Round 3 — so that it could be answered
against real queries rather than in the abstract. The queries now exist. Findings in
[`../phase-4-verification.md`](../phase-4-verification.md) §6.2 and §10.

## The test, and both halves of it

PostgreSQL §8.14.2:

> JSON documents should each represent an atomic datum … that cannot reasonably be further
> subdivided into smaller datums that could be modified independently.

The same section adds that documents should have "a somewhat fixed structure." That is two tests,
and *fields* and *provenance* fall on opposite sides of both.

**Fields pass.** The unit of vetting is the note (ADR 0004), so a note is read as a unit and written
as a unit — an edit under `S6` changes one value and commits on the same accept keystroke as the
whole note. After acceptance the fields are frozen (ADR 0006) and are never modified again by
anything. A datum that is written once as a whole and then never subdivided is the atomic datum the
paragraph describes. Their structure is fixed *per subject* and declared in the repo (ADR 0003),
which is the closest thing to "somewhat fixed" that a subject-declared schema can be.

**Provenance fails, in both directions.** Its structure is *entirely* fixed and identical across
every subject — kind, model id, prompt version, and where a value came from — while the fields it
describes vary per subject. And it is by definition modified independently: one field's value is a
dictionary lookup and the next is a judgement, and they are written by different stages of the
pipeline for different reasons.

## The deciding argument is a query the project has already promised to run

ADR 0021 recorded the honest counter and it is still true: **the row-lock half of §8.14.2 is a
concurrency argument, and ADR 0012 guarantees one reader, so there is no contention.** Nothing below
rests on it.

What decides it is that **provenance is queried across notes, and every one of those queries is an
aggregation.**

- ADR 0018 made the model choice *a measurement rather than a document*, and `03-technical-design.md`
  §7 states the mechanism: "the comparison between models is a query over data already stored, not a
  separate experiment." That query is *acceptance rate grouped by model id, per field*.
- ADR 0004's flag mechanism is the same shape: "prompt v3 writes bad example sentences" is a
  `GROUP BY prompt_version`, and ADR 0004 says the third part is the one that matters, because
  without it you learn "some cards are bad" instead of something actionable.

A GIN index accelerates containment and key-existence (`@>`, `?`) — it does not serve a `GROUP BY`.
Under both-as-blobs, both queries become a sequential scan that expands a JSON document per row to
reach a value that could have been a column. Neither query is hot, and at eight hundred notes neither
is slow. **That is not the point.** ADR 0018 deliberately declined to pick a model and left an
instrument in its place; the instrument is this query. Storing its inputs in a shape that only
answers by scanning is choosing to make the project's own measurement awkward to run, in the document
whose job is to make it easy.

## What the blob costs, stated plainly

**One derived column.** ADR 0006's *identity key* is `(dictionary-form term, reading)` for JLPT
vocabulary — both of which live inside `fields`. A unique constraint cannot be expressed as an
expression index over the blob, because the key is subject-declared and different subjects key on
different paths.

So `note.identity_key` is a real `text` column, written by the pipeline from the subject declaration,
unique with `subject_id`. **The rendering rule is part of the identity**: NFC-normalised values,
joined by `U+001F`, in the order the declaration lists them. Changing that rule changes the identity
of existing notes and is therefore the same class of event as a `SudachiDict` bump — a reviewed data
event with a re-ingestion plan, never a refactor (§5.3 of `03`, ADR 0006).

That column is the whole tax, and it buys ADR 0003's promise back: **an additive field never requires
a migration**, which is the property that makes "fields are additive and optional, note types are not
versioned" cheap rather than aspirational.

## Alternatives considered

**Both as blobs** — `notes.fields` and `notes.provenance`, two `jsonb` columns. Genuinely defensible
and it is less schema. Rejected on the aggregation above, not on locking. It is the shape to revisit
if the model comparison is ever abandoned, and it is worth recording that it would *work* — the data
would all be there, and the queries would be uglier rather than impossible.

**Fully relational fields** — a `note_field` table keyed `(note_id, field_name)` holding values too.
Rejected: it is entity–attribute–value, it discards the declared shape that ADR 0003 exists to keep
in one place, it makes reading one note a pivot, and it re-introduces the migration on every added
field. The fields fail none of §8.14.2's tests, so normalising them buys nothing and costs the
declaration's one-file property.

**A `jsonb` provenance column with a GIN index** — the halfway house. Rejected because the index does
not serve the query that decided this. A GIN index over provenance would make "which notes have a
field generated by prompt v3" fast and leave "what is the acceptance rate per model" exactly as slow,
and the second is the one ADR 0018 depends on.

## Consequences

- `note` is *shared* and carries `fields`; vetting state is a separate *personal* table, so the
  ADR 0012 label stays a property of an entity rather than of a column.
- Drizzle's `jsonb().$type<T>()` is compile-time only (verification §6.4). **`fields` is validated at
  the application boundary against the subject declaration on the way in** — `03` §2.3 and §6. The
  blob is trusted by nothing; it is merely stored as one.
- The Python worker writes `fields` as one document and `note_field_provenance` as one row per field,
  in one transaction. Two writes rather than one, and they must not be split.
- No index is created on `fields`. No v1 query reads inside it — the card browser is cut (`PRD §6`)
  and there is no field search. An index added "because it is jsonb" would be an index no query uses.

## Revisit if

The model comparison in ADR 0018 is settled and abandoned rather than kept running — at which point
the surviving argument for a relational provenance table goes with it, and both-as-blobs becomes the
simpler shape for a system that no longer asks the question.
