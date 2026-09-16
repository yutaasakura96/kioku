# Kioku

Kioku builds spaced-repetition flashcard decks automatically from bulk source material and is also
the app they are studied in.

## Language

**Acceptance rate** — ⚠️ **retired 2026-09-16 (ADR 0062)**:
Notes accepted with no edit ÷ notes generated. It was the primary health metric while the pipeline
chose the words and a human accepted them. Nothing is accepted now (ADR 0064), so the number is 100%
by construction. Kept here so the word is recognised in older documents and not reused for something
else. **Retention** and **flag rate** are what replaced it.

**Time-to-first-review**:
Minutes from submitting a source to answering the first card generated from it. Above roughly ten
minutes, Kioku is a different chore rather than a replacement for hand-authoring.
_Avoid_: ingestion time, latency, turnaround

**Seconds-per-note** — ⚠️ **retired 2026-09-16 (ADR 0062)**:
Median wall-clock time to vet one note accepted without edit. It measured a step the reader no longer
performs. Read 1.76 s over 39 notes on 2026-09-14, once, and that reading is in
`docs/first-run-expectation.md`.

**Retention**:
Grades of Good or Easy ÷ grades given, over the trailing 30 days, counting only cards that were in
the Review state when asked. The headline number: whether what was studied stayed learned.
_Avoid_: accuracy, recall rate, success rate, pass rate

**Consistency**:
Days with at least one grade ÷ days in the trailing 30. The second headline, and deliberately not a
streak — a streak is zero the morning after one missed day, which is the morning it is read.
_Avoid_: streak, adherence, engagement

**Flag rate**:
Distinct cards flagged ÷ cards minted. The check on the model's fills, and the instrument ADR 0018's
model walk has left. Replaced *false-accept rate*, whose denominator was acceptances.
_Avoid_: error rate, defect rate, false-accept rate

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
A body of material studied together, declared once as a schema plus, per *source kind*, the ordered
pipeline stages its ingestion needs (ADR 0063). JLPT vocabulary is the first, and there is one.
_Avoid_: topic, category, course. ⚠️ *Domain* left this list on 2026-09-16 and is its own term below.

**Domain**:
A subject-declared label on a term saying what kind of language it is — `tech`, `business`, `daily`,
`academic`, `general`. Carried as an attributed claim like a *level*, filled by the model, and used
to choose which new cards are introduced. The reason this app exists rather than WaniKani.
_Avoid_: topic, category, tag, field

**Source kind**:
Which of three shapes a source is: a `word_list` of chosen terms, `prose` to be mined, or an `anki`
deck. It selects the pipeline the ingestion runs.
_Avoid_: type, format, mode

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
A note that has been generated but not vetted. Mints no cards and is never studied. ⚠️ After
ADR 0064 nothing new arrives in this state; what holds it is the 474 notes the 2026-09-14 prose run
produced, which `filter_known` now treats as a cache of work already paid for.
_Avoid_: provisional, draft, unconfirmed, staged

**Accepted**:
A note a human has confirmed at vetting. Minting its cards is what acceptance means.
_Avoid_: approved, confirmed, published

**False-accept rate** — ⚠️ **superseded 2026-09-16 by *flag rate* (ADR 0062)**:
Notes accepted at vetting that were later flagged wrong ÷ notes accepted. It detected a vetting step
that had become theatre. There is no vetting step to catch out.

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

**Vetting** — ⚠️ **moved 2026-09-16 (ADR 0064)**:
The human check of a note. It used to happen before a note minted cards; a chosen word now mints on
arrival and the check happens only when the reader flags a card during review. *Vet* is the flag
queue, and its three resolutions are fix, keep and drop. Still distinct from review, which is
answering a due card.
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
