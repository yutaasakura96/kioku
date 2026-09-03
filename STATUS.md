# Status

**Phase:** grilling `BRIEF.md` §4. No code, no stack. Read `CLAUDE.md` first, then this.

## Where we are

**§4.1–§4.11 are closed.** Eleven questions, eleven ADRs in `docs/adr/`. `CONTEXT.md` holds the
glossary — 29 terms — and is the authority on vocabulary; ADRs are the authority on decisions.

**§4.12 (stack) is the only thing left in §4, and it is now unblocked.**

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
| 4.10 | What a deck is | [0009](docs/adr/0009-a-deck-is-a-saved-query.md) |
| 4.9 | What an ingestion costs | [0010](docs/adr/0010-cheap-filters-run-before-expensive-generation.md) |
| 4.11 | Provenance and re-generation | [0011](docs/adr/0011-re-generation-proposes-and-history-is-never-destroyed.md) |

## Open

- **§4.12 — stack.** The only remaining question, and its inputs are now largely fixed by the ADRs:
  a card owns its scheduling state (0002); one declaration drives the LLM contract, the fields and
  the templates (0003); the review loop prefetches a bounded session and flushes a client-stamped
  grade outbox (0007); sources stay durable and re-enterable (0008); a deck is a query, not an owner
  (0009); ingestion is a streaming background job with a replayable cache key (0010).

  It was deliberately held shut for the whole grilling. **Do not open it without saying so first.**

## Next, per `START-HERE.md` §3

§4 is closed and the ADRs, glossary and this file exist. What follows is PRD, then tech design, then
tickets, then code. `/setup-matt-pocock-skills` belongs here — after the grilling, since the grilling
produced the material the tickets are made from. Choosing GitHub Issues needs a remote, which this
repo still does not have.

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
