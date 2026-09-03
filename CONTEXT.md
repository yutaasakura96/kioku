# Kioku

Kioku builds spaced-repetition flashcard decks automatically from bulk source material and is also
the app they are studied in.

## Language

**Acceptance rate**:
Cards accepted with no edit ÷ cards generated. The project's primary health metric — a low rate
means the generation pipeline is failing regardless of how good the app feels.
_Avoid_: accuracy, quality score, hit rate

**Time-to-first-review**:
Minutes from submitting a source to answering the first card generated from it. Above roughly ten
minutes, Kioku is a different chore rather than a replacement for hand-authoring.
_Avoid_: ingestion time, latency, turnaround

**Source**:
The material a note was extracted from — a pasted document, list or file — retained after ingestion.
_Avoid_: document, input, material, import

**Note**:
A single fact extracted from a source, held as named fields. The unit a human reviews.
_Avoid_: entry, item, fact, record

**Note type**:
The declaration naming a note's fields and the card templates derived from it.
_Avoid_: model, card type, deck type

**Template**:
A rendering of a note into one reviewable card — which fields form the prompt, which the answer.
_Avoid_: layout, format, direction

**Card**:
One note rendered through one template. The unit that is scheduled and reviewed, and it owns its own
scheduling state.
_Avoid_: flashcard, item, question

**Sibling**:
Another card derived from the same note.
_Avoid_: related card, variant, duplicate

**Subject**:
A body of material studied together, declared once as a schema plus the ordered pipeline stages its
ingestion needs. JLPT vocabulary is the first.
_Avoid_: topic, domain, category, course

**Pipeline stage**:
One named step an ingestion runs, selected by the subject. Tokenisation is a stage; a subject that
does not need it omits it.
_Avoid_: step, processor, phase

**Ingestion**:
The run that turns one source into notes.
_Avoid_: import, upload, processing, parse

**Provenance**:
The record, per field, of where a value came from — looked up, judged or generated — together with
the model and prompt version responsible. Trust is a property of provenance.
_Avoid_: confidence, score, reliability, trust level

**Judgement field**:
A field whose value the LLM chose or wrote rather than looked up. The only fields review foregrounds.
_Avoid_: generated field, AI field, uncertain field

**Pending**:
A note that has been generated but not yet reviewed. Mints no cards and is never studied.
_Avoid_: provisional, draft, unconfirmed, staged

**Accepted**:
A note a human has confirmed at review. Minting its cards is what acceptance means.
_Avoid_: approved, confirmed, published

**False-accept rate**:
Notes accepted at review that were later flagged wrong ÷ notes accepted. Detects a review step that
has become theatre.
_Avoid_: error rate, defect rate

**Authority**:
A named external body of opinion a level claim cites — a community word list, a published exam guide.
Distinct from a source, which is ingested material.
_Avoid_: source, reference, list, provider

**Level claim**:
One authority's assertion of a level for a term. A term carries a set of them, never collapsed.
_Avoid_: rating, classification

**Level**:
A subject-defined ordered difficulty band derived from a term's level claims. Filters what is
studied; never orders it.
_Avoid_: difficulty, grade, rank, tier

**Identity key**:
The subject-declared tuple deciding whether two extracted notes are the same note. For JLPT
vocabulary, dictionary-form term plus reading.
_Avoid_: primary key, dedupe key, hash

**Occurrence**:
One appearance of a note's term in a source, at a position within it. A note accumulates occurrences;
they never alter its fields.
_Avoid_: instance, mention, hit, duplicate

**Rejected**:
A note declined at review. Permanent, and survives re-ingestion — a rejected term is never re-asked.
_Avoid_: skipped, ignored, dismissed, deleted

**Grade**:
The answer given to a card when it is reviewed, carrying the timestamp of the moment it was given.
_Avoid_: score, rating, result, mark

**Session**:
A bounded, finishable run of due cards, prefetched as a unit and sized to be finishable rather than
to exhaust what is due.
_Avoid_: queue, batch, round, set
