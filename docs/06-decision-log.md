# Decision log

Append-only. The answer to every future "why is it like this?"

**This file is an index, not the record.** Each decision was argued out at the time and written up
as an ADR in [`adr/`](adr/) — the ADR carries the alternatives, the reasoning and the revisit
condition in full, and it is the authority. This page exists so one file answers "what has been
decided" without opening eleven.

## Entries

### [2026-09-03] The smallest loop is Japanese, end to end, and instrumented
Paste ~two pages of Japanese → ~30 vetted cards → studied on two consecutive days, emitting §5's
acceptance rate and time-to-first-review. → [ADR 0001](adr/0001-smallest-loop-is-japanese-end-to-end-and-instrumented.md)

### [2026-09-03] Note and card are separate entities
Anki's separation, not flat cards: vetting cost scales with notes, study volume scales with cards.
A card owns its own scheduling state. → [ADR 0002](adr/0002-note-and-card-are-separate-entities.md)

### [2026-09-03] A subject is a declared schema and a pipeline, living in the repo
One declaration drives the LLM's output contract, the note type's fields and the card templates, and
names the pipeline stages in order. Adding a subject is a code change, not a UI flow.
→ [ADR 0003](adr/0003-a-subject-is-a-declared-schema-and-a-pipeline.md)

### [2026-09-03] Trust follows provenance, not confidence
Trust is a property of where a field came from, recorded per field. Vetting is mandatory in v1.
→ [ADR 0004](adr/0004-trust-follows-provenance-not-confidence.md)

### [2026-09-03] A level is a set of attributed claims, and it only filters
The JLPT publishes no official vocabulary list, by design (verified 2026-09-03). "N3" is an
attributed claim, never a fact about a word. → [ADR 0005](adr/0005-a-level-is-a-set-of-attributed-claims.md)

### [2026-09-03] Note identity is a declared key; collision appends an occurrence
Keyed per subject alongside the schema — for JLPT vocabulary, *(dictionary-form term, reading)*.
Sense-level identity rejected. → [ADR 0006](adr/0006-note-identity-is-a-declared-key-and-collision-appends-an-occurrence.md)

### [2026-09-03] Prefetched sessions and a client-stamped grade outbox
Both of §4.7's options, because each is worthless alone. Online-only (§2.2) is not reopened.
→ [ADR 0007](adr/0007-prefetched-sessions-and-a-client-stamped-grade-outbox.md)

### [2026-09-03] v1 ships no §3 features, and sources stay durable
The scope cut. Sources remain durable and re-enterable.
→ [ADR 0008](adr/0008-v1-ships-no-section-3-features-and-sources-stay-durable.md)

### [2026-09-04] A deck is a saved query
Not an owner of cards. → [ADR 0009](adr/0009-a-deck-is-a-saved-query.md)

### [2026-09-04] Cheap filters run before expensive generation
Ingestion is a streaming background job with a replayable cache key.
→ [ADR 0010](adr/0010-cheap-filters-run-before-expensive-generation.md)

### [2026-09-04] Re-generation proposes; history is never destroyed
Review history is the one thing in the system that cannot be regenerated (§2.4).
→ [ADR 0011](adr/0011-re-generation-proposes-and-history-is-never-destroyed.md)

### [2026-09-06] Identity is invite-only from v1, and personal data carries an owner
One invited user, no self-registration. Entities are labelled shared or personal, and personal ones
carry an owner from the first row written — because review history (§2.4) cannot be attributed
retroactively. Mechanism (Better Auth + Google OIDC) is a parked, unverified preference for Phase 4.
→ [ADR 0012](adr/0012-identity-is-invite-only-and-personal-data-carries-an-owner.md)

### [2026-09-06] Vetting speed is a measured criterion, not an aspiration
**Decision:** accepting an unedited *note* is exactly one keystroke, and median *seconds-per-note*
must be under 5 seconds over a run of at least 20. Recorded per note from day one, alongside
acceptance rate.
**Alternatives considered:** §4.3's own three-second figure — rejected as glance speed, not read
speed, for a note carrying a reading, a meaning and an example sentence. Leaving it unmeasured —
rejected because a 95% acceptance rate at 30 seconds per note is a failed thesis that acceptance
rate alone would score as a success.
**Reason:** §5's assumption is about time, and nothing else in the instrument measures time.
**Revisit if:** a second card template ships and vetting starts covering more fields per note.

### [2026-09-06] A session is one knob: a fixed card count, default 20
**Decision:** *sessions* are a fixed number of *cards*, reader-settable, composed due-first with new
*cards* filling the remainder, snapshotted at the start, ending in a screen. Starting another is a
deliberate action. No ahead-of-schedule study in v1.
**Alternatives considered:** a time budget — rejected as a worse fit for a prefetch bound. A separate
per-day new-card cap — deferred (PRD L4): at thirty cards it protects nothing and costs a setting.
**Reason:** ADR 0007 bounded the prefetch by session shape and left the size open; this is that size.
**Revisit if:** the pool passes a few hundred cards, at which point the new-card cap is the first
thing to add.

### [2026-09-06] The v1 surface is five screens
**Decision:** Ingest, Vet, Review, Sources, Stats. No home screen, no settings screen, no card browser.
**Alternatives considered:** a card browser, which Anki makes central — rejected because a browser
without a query language is a list, and the query language is deck work (ADR 0009), which is v2.
**Reason:** Sources answers "where did this come from"; Vet answers "what needs me". Nothing in v1
needs a third way to look at cards.
**Revisit if:** saved queries ship — the browser is the query language's screen, and arrives with it.
**Consequence:** triggers docs 09 and 10 in Phase 4, and confirms Phases 2 and 3 apply to Vet and
Review.

### [2026-09-06] Vet and Review take the paper direction, and provenance is never hidden behind a hover
**Decision:** of three explored directions, the built one is warm paper with Mincho for Japanese and
a serif for English. *Vetting*'s hierarchy comes from spatial zoning — *term*, part of speech and
*level* compress into one horizontal strip above a rule, and only the *judgement fields* sit below
it at reading size. The *level*'s honesty bit is a filled marker for a named *authority* and a
hollow one for a model estimate, with the *level claims* set inline rather than behind a hover.
*Review* carries no screen label in any of its four states.
**Alternatives considered:** a dark, dense terminal-style screen — fastest to scan and the best at
absorbing a seventh field, rejected because the *meaning* is the field that costs the decision and
it read worst there, and because it is the closest of the three to the thing being replaced. A
left-gutter direction naming every field's *provenance* — the tightest single mechanism, rejected
for costing 168px of width and reading as a tool rather than a reading surface.
**Reason:** the two constraints that decide the screen are S4's hierarchy and ADR 0005's one visible
bit. Zoning answers the first without spending colour on it; inline claims answer the second without
spending an interaction, which is what *vetting* has least of.
**Revisit if:** measured median *seconds-per-note* misses 5s and eye travel rather than reading time
is the cause — the dense direction is the fallback and is kept on the canvas.
**Consequence:** four things the design needed and the PRD does not decide are now open, below.

## Still open

- **§4.12 — the stack.** Deliberately held shut for the whole grilling; belongs to Phase 4. Its
  inputs are now fixed by ADRs 0002, 0003, 0007, 0008, 0009 and 0010.
- **Navigation between the five screens.** The PRD names five screens and no way to move between
  them. Surfaced by Phase 2's empty *Vet* state, which can only point at Ingest as plain text. Not a
  design preference — a gap. Needs closing before screen specs.
- **The grade set.** *Review* needs labels to grade with; the PRD names none and the scheduler is
  §4.12. Phase 2 drew `1 Again / 2 Hard / 3 Good / 4 Easy` as a placeholder and it should not be
  extracted into the design system until the scheduler is chosen.
- **Key assignments.** `A` / `E` / `R` at *vetting*; space to reveal, `1`-`4` to grade, `X` to flag
  during *review*. Drawn, not decided.
- **The phone layout.** Not drawn. The facts strip and the four grade controls are what have to
  change.

## Adding an entry

Write the ADR first — that is where the argument lives — then add a line here. Keep the format:

```
### [YYYY-MM-DD] Short decision title
One or two sentences: what was chosen, and the deciding reason.
→ [ADR NNNN](adr/NNNN-slug.md)
```

If a decision is small enough not to warrant an ADR, record it here in full instead, with
**Decision / Alternatives considered / Reason / Revisit if**.
