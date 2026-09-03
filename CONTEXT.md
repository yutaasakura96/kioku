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
