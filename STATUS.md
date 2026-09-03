# Status

**Phase:** grilling `BRIEF.md` §4. No code, no stack. Read `CLAUDE.md` first, then this.

## Where we are

Eight of §4's twelve questions closed, each with an ADR in `docs/adr/`. `CONTEXT.md` holds the
glossary — 24 terms — and is the authority on vocabulary; ADRs are the authority on decisions.

| § | Question | ADR |
| --- | --- | --- |
| 4.8b | Smallest loop that proves the thesis | [0001](docs/adr/0001-smallest-loop-is-japanese-end-to-end-and-instrumented.md) |
| 4.1 | Note vs card | [0002](docs/adr/0002-note-and-card-are-separate-entities.md) |
| 4.2 + 4.5a | Subject = schema + pipeline | [0003](docs/adr/0003-a-subject-is-a-declared-schema-and-a-pipeline.md) |
| 4.3 | LLM trust and vetting cost | [0004](docs/adr/0004-trust-follows-provenance-not-confidence.md) |
| 4.4 | What "N3" means | [0005](docs/adr/0005-a-level-is-a-set-of-attributed-claims.md) |
| 4.6 | Note identity | [0006](docs/adr/0006-note-identity-is-a-declared-key-and-collision-appends-an-occurrence.md) |
| 4.7 | Offline mitigation | [0007](docs/adr/0007-prefetched-sessions-and-a-client-stamped-grade-outbox.md) |
| 4.8a | Which §3 features, in what order | [0008](docs/adr/0008-v1-ships-no-section-3-features-and-sources-stay-durable.md) |

## Open

- **§4.10 — what is a deck?** *Asked, awaiting an answer.* Recommendation on the table: v1 has no
  decks; a deck is a saved query, never an owner; one schedule per card, never per card-per-deck;
  a deck is a view and nothing ever moves; the pool is everything due and "everything due" stays
  available.
- **§4.9 — what an ingestion costs.** Product half only (does the user ever wait synchronously;
  caching by content hash + prompt version). Money/infra half is §4.12.
- **§4.11 — provenance and re-generation.** Partly pre-empted: ADR 0006 froze accepted notes and
  ADR 0008 made sources durable. What remains is whether re-generation is a real workflow.
- **§4.12 — stack.** Deliberately shut. Opens only when §4.1–4.11 are closed.

## Verified facts

- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Checked
  against jlpt.jp's own FAQ, both language editions, 2026-09-03. Recorded in ADR 0005. Do not
  re-verify; do not re-litigate.

## How this session works

One question at a time, `❓ Q<n>` with a `➡️` recommendation rather than a neutral menu. Nothing is
verified from memory. Each closed question is written up as an ADR and new vocabulary lands in
`CONTEXT.md` immediately, before the next question.

## Not done yet

- `/setup-matt-pocock-skills` — deliberately after the grilling; also needs a git remote, which
  does not exist.
- No remote, no `.gitignore` gaps known, `frontend-design` still enabled at project scope contrary
  to `START-HERE.md` §1.
