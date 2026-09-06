# Kioku

Kioku builds spaced-repetition flashcard decks automatically from bulk source material and is also
the app they are studied in.

## Language

**Acceptance rate**:
Notes accepted with no edit ÷ notes generated. The project's primary health metric — a low rate
means the generation pipeline is failing regardless of how good the app feels.
_Avoid_: accuracy, quality score, hit rate

**Time-to-first-review**:
Minutes from submitting a source to answering the first card generated from it. Above roughly ten
minutes, Kioku is a different chore rather than a replacement for hand-authoring.
_Avoid_: ingestion time, latency, turnaround

**Seconds-per-note**:
Median wall-clock time to vet one note that is accepted without edit. The other half of acceptance
rate — a high acceptance rate reached slowly is a failed thesis, not a passing one.
_Avoid_: vetting speed, throughput, time per card

**Source**:
The material a note was extracted from — a pasted document, list or file — retained after ingestion.
_Avoid_: document, input, material, import

**Note**:
A single fact extracted from a source, held as named fields. The unit a human vets.
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
A field whose value the LLM chose or wrote rather than looked up. The only fields vetting foregrounds.
_Avoid_: generated field, AI field, uncertain field

**Pending**:
A note that has been generated but not yet vetted. Mints no cards and is never studied.
_Avoid_: provisional, draft, unconfirmed, staged

**Accepted**:
A note a human has confirmed at vetting. Minting its cards is what acceptance means.
_Avoid_: approved, confirmed, published

**False-accept rate**:
Notes accepted at vetting that were later flagged wrong ÷ notes accepted. Detects a vetting step that
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
A note declined at vetting. Reversible only within the vetting session that declined it; once that
session ends it is permanent and survives re-ingestion — a rejected term is never re-asked.
_Avoid_: skipped, ignored, dismissed, deleted

**Grade**:
The answer given to a card when it is reviewed, carrying the timestamp of the moment it was given.
_Avoid_: score, rating, result, mark

**Session**:
A bounded, finishable run of due cards, prefetched as a unit and sized to be finishable rather than
to exhaust what is due.
_Avoid_: queue, batch, round, set

**Vetting**:
The human check of a generated note before it mints cards — accept, edit or reject. Distinct from
review, which is answering a due card.
_Avoid_: review, approval, triage, curation, moderation

**Review**:
Answering a due card and grading it. Never used for the human check of a generated note.
_Avoid_: study, test, quiz, practice

**Deck**:
A saved query over the card pool. Owns nothing; nothing is ever moved into or out of one.
_Avoid_: collection, folder, category, group

**Candidate**:
A note proposed by re-generation, diffed against the existing note rather than replacing it.
_Avoid_: draft, proposal, suggestion, revision

**Memory-bearing field**:
A field declared by its subject as one whose change invalidates what was memorised. Changing one
resets the card; changing any other field leaves its history standing.
_Avoid_: key field, core field, important field

**Scheduling epoch**:
One continuous scheduling life of a card. A reset begins a new epoch and retains the prior one.
_Avoid_: reset, restart, generation

**Personal**:
Data that is a statement about one reader rather than about the material — cards, grades, vetting
state. Carries an owner from the first row written. Its opposite is *shared*: sources, note fields,
occurrences and level claims, which are true regardless of who is asking.
_Avoid_: private, user data, per-user, scoped

**Suspended**:
A card withdrawn from scheduling without being deleted. Its history survives untouched.
_Avoid_: paused, archived, disabled, removed

**Facts strip**:
The single horizontal row on *Vet* holding the term, its part of speech and its level, bounded by a
rule above and below. Everything above the lower rule is context; everything under it is a judgement
field. The zoning is what gives vetting its hierarchy without spending colour on it.
_Avoid_: header, metadata bar, info row, chip row

**Provenance marker**:
The 7×7px square beside a level, filled for a named authority and hollow for a model estimate. The
one visible honesty bit, and it is never placed behind a hover.
_Avoid_: badge, indicator, icon, dot, confidence marker

**Shell**:
The persistent frame carrying navigation, present on Ingest, Sources and Stats and absent from
*Vet* and *Review*. What makes those three *places* rather than *modes*.
_Avoid_: chrome, layout, frame, nav

**Mode**:
A screen that replaces the *shell* entirely — no header, no navigation — and carries exactly one way
out: `Esc`, and a Done control present on every viewport. *Vet* and *Review* are the only two,
because both are keyboard-driven surfaces where a pointer target would cost more than it gives. The
visible exit is the one thing they carry that a pointer can reach, and it exists because a phone has
no `Esc`.
_Avoid_: fullscreen, focus mode, overlay, modal

**Progress rail**:
The row of per-card ticks that stands in for *Review*'s header — one tick per card in the session,
marking graded, current and not-yet-reached. The only progress indicator in the app.
_Avoid_: progress bar, stepper, pagination, breadcrumb
