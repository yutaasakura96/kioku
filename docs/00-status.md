# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 1 — Brief + PRD. **Complete.** Phase 2 is next.
**Updated:** 2026-09-06

Read `CLAUDE.md` first, then this. No code, no stack.

## Done

**Phase 1, brief half** — `01-project-brief.md`. A grilling target, not a specification; its §0 says
how to treat it.

**Grilling of §4.1–§4.11 — closed.** Eleven questions, eleven ADRs, indexed in
[`06-decision-log.md`](06-decision-log.md).

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

**Phase 1, PRD half** — [`02-product-requirements.md`](02-product-requirements.md). One user type,
twelve stories with pass-or-fail acceptance criteria, five screens, empty states and edge cases. Zero
TBDs. Five questions closed; one produced [ADR 0012](adr/0012-identity-is-invite-only-and-personal-data-carries-an-owner.md),
three were recorded in full in the decision log, one is specified in the PRD's §5.

## Next

**Phase 2 — Design exploration**, in Claude Design. It leaves this tool.

**Explore only Vet and Review.** They are the two screens where the interaction *is* the product —
a one-keystroke accept and a sub-5-second median are design problems as much as engineering ones.
Ingest, Sources and Stats are generic and are not explored.

**The prompt shape:** *"[screen] for [product from the PRD], in the style of [reference], with [key
constraints]."* Take `02-product-requirements.md` §2 (S3, S4, S7, S9) and §4 in with you, plus
Mobbin references. Explore 2–3 directions, pick **one**, iterate on that one only, then export or
save the prototype beside `docs/`.

**What to bring back:** the prototype's HTML or screenshots. Phase 3 extracts real hex codes, spacing
and component states from it into `05-design-system.md` and `10-screen-specifications.md`. The
prototype is a visual reference, never the design system doc.

Then run `/project`.

## Blocked

Nothing.

**§4.12 (stack) is still shut** and belongs to Phase 4. Its inputs are fixed by the ADRs. Per
`CLAUDE.md`, do not open it without saying so first.

## Carrying

- **The ADRs are the decision log's long form.** `06-decision-log.md` indexes them; `adr/` holds the
  argument, the alternatives and the revisit condition. Add the ADR first, then the index line. Small
  decisions are recorded in the log in full instead — three PRD-level ones are, dated 2026-09-06.
- **Better Auth + Google OIDC is a stated preference for identity, and it is UNVERIFIED.** Recorded
  in ADR 0012 so it isn't lost. Per `CLAUDE.md` it gets checked against real documentation in Phase 4
  before it becomes a decision. Do not treat it as decided.
- **Phase 4 owes four Tier 2 docs**, all now triggered: 08 (auth — by ADR 0012), 09 (user flows) and
  10 (screen specs) — by five screens — and 11 (testing plan), since the PRD's S12 requires an
  exercised export test and S3 requires a measured median.
- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Checked
  against jlpt.jp's own FAQ, both language editions, 2026-09-03. Recorded in ADR 0005. Do not
  re-verify; do not re-litigate.
- **How a session runs here:** one question at a time, `❓ Q<n>` with a `➡️` recommendation rather
  than a neutral menu. Nothing verified from memory. Each closed question becomes an ADR or a
  decision-log entry, and new vocabulary lands in `CONTEXT.md` immediately.
- **No git remote yet.** `/setup-matt-pocock-skills` still belongs after planning; choosing GitHub
  Issues as the tracker needs that remote.
- **`frontend-design` is still active here**, contrary to `START-HERE.md` §1. It is `true` at *user*
  scope and this repo never turns it off; the fix is
  `"frontend-design@claude-plugins-official": false` in `.claude/settings.json`. (`superpowers`, the
  other half of that instruction, is correctly off.) **It is now arguably wanted** — Phase 2 is
  design work — so decide rather than disable by default.
- **Branches:** `main` is the default and where work normally happens; `develop` exists for
  development work.

## Skipped

Nothing. **Phases 2 and 3 are confirmed in scope** — decided 2026-09-06 alongside the five-screen
surface, and narrowed to Vet and Review.
