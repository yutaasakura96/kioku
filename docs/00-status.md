# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 1 — Brief + PRD (the brief is done; the PRD is what's next)
**Updated:** 2026-09-04

Read `CLAUDE.md` first, then this. No code, no stack.

## Done

**Phase 1, brief half** — `01-project-brief.md`. It is a grilling target, not a specification; its
§0 says how to treat it.

**Grilling of §4.1–§4.11 — closed.** Eleven questions, eleven ADRs, indexed in
[`06-decision-log.md`](06-decision-log.md). `CONTEXT.md` holds the glossary — 29 terms — and is the
authority on vocabulary; the ADRs are the authority on decisions.

| § | Question | ADR |
| --- | --- | --- |
| 4.8b | Smallest loop that proves the thesis | [0001](adr/0001-smallest-loop-is-japanese-end-to-end-and-instrumented.md) |
| 4.1 | Note vs card | [0002](adr/0002-note-and-card-are-separate-entities.md) |
| 4.2 + 4.5a | Subject = schema + pipeline | [0003](adr/0003-a-subject-is-a-declared-schema-and-a-pipeline.md) |
| 4.3 | LLM trust and vetting cost | [0004](adr/0004-trust-follows-provenance-not-confidence.md) |
| 4.4 | What "N3" means | [0005](adr/0005-a-level-is-a-set-of-attributed-claims.md) |
| 4.6 | Note identity | [0006](adr/0006-note-identity-is-a-declared-key-and-collision-appends-an-occurrence.md) |
| 4.7 | Offline mitigation | [0007](adr/0007-prefetched-sessions-and-a-client-stamped-grade-outbox.md) |
| 4.8a | Which §3 features, in what order | [0008](adr/0008-v1-ships-no-section-3-features-and-sources-stay-durable.md) |
| 4.10 | What a deck is | [0009](adr/0009-a-deck-is-a-saved-query.md) |
| 4.9 | What an ingestion costs | [0010](adr/0010-cheap-filters-run-before-expensive-generation.md) |
| 4.11 | Provenance and re-generation | [0011](adr/0011-re-generation-proposes-and-history-is-never-destroyed.md) |

## Next

**Phase 1, PRD half** — write `02-product-requirements.md`, interviewed from question bank 02 in the
catalog's `project-planning-template.md`.

Run `/project`.

## Blocked

Nothing. **§4.12 (stack) is unblocked** — its inputs are fixed by the ADRs: a card owns its
scheduling state (0002); one declaration drives the LLM contract, the fields and the templates
(0003); the review loop prefetches a bounded session and flushes a client-stamped grade outbox
(0007); sources stay durable and re-enterable (0008); a deck is a query, not an owner (0009);
ingestion is a streaming background job with a replayable cache key (0010).

It was deliberately held shut for the whole grilling and belongs to **Phase 4 — tech docs**, not to
the PRD. Per `CLAUDE.md`, do not open it without saying so first.

## Carrying

- **The ADRs are the decision log's long form.** `06-decision-log.md` indexes them; `adr/` holds the
  argument, the alternatives and the revisit condition. Add the ADR first, then the index line.
- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Checked
  against jlpt.jp's own FAQ, both language editions, 2026-09-03. Recorded in ADR 0005. Do not
  re-verify; do not re-litigate.
- **How a session runs here:** one question at a time, `❓ Q<n>` with a `➡️` recommendation rather
  than a neutral menu. Nothing verified from memory. Each closed question becomes an ADR and new
  vocabulary lands in `CONTEXT.md` immediately, before the next question.
- **No git remote yet.** `/setup-matt-pocock-skills` belongs after the grilling — it produced the
  material the tickets are made from — and choosing GitHub Issues as the tracker needs that remote.
- **`frontend-design` is still enabled at project scope**, contrary to `START-HERE.md` §1.
- **Branches:** `main` is the default and where work normally happens; `develop` exists for
  development work. Renamed from `master` on 2026-09-04, before any remote existed.

## Skipped

Nothing yet. Phases 2 (design exploration) and 3 (extract) are undecided — Kioku is an app with a
review UI, so they probably apply, but that call hasn't been made.
