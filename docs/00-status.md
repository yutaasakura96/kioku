# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 3 — Design system. **Complete.** Phase 4 is next.
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

**Phase 2, design exploration** — *Vet* and *Review* only, as scoped. Three directions explored, one
picked, six artboards built in it. Recorded in
[`06-decision-log.md`](06-decision-log.md) as a decision in full; no ADR, because a visual direction
is not an architectural one.

| Artboard | State |
| --- | --- |
| 1 | *Vet* — populated, one *pending note*, mid-queue |
| 2 | *Vet* — empty |
| 3 | *Review* — card front |
| 4 | *Review* — card back, grading available |
| 5 | *Review* — session end |
| 6 | *Review* — nothing due |

**The canvas:** https://claude.ai/code/artifact/7a631237-82be-48a3-b65e-9b4ef46b8157 — page one is
the six artboards, page two keeps the two rejected directions and the reasons. **This URL is the
only copy.** The `.dc.html` source lived in a session scratchpad and is gone. Phase 3 read the
artboards back out of that page and they are extracted now — see below.

The PRD won every collision it had with the prototype, as `CLAUDE.md` requires. Four things the
design needed and the PRD does not decide were left open rather than invented — they are in the
decision log's **Still open**, and navigation is the one that blocks screen specs.

**Phase 3, design system** — [`05-design-system.md`](05-design-system.md). Extracted from the canvas
by reading the six artboards' source back from the published page, not from memory or a screenshot.
Surfaces, a seven-step ink ramp with measured contrast, two rule tokens, three type families and a
twenty-step ramp, layout measures, geometry, and eleven components with the states that are actually
drawn.

Two hand-set duplicates were collapsed rather than copied through, and both are recorded as a
decision: rules on the app ground became one token, and the inline separator became one value. The
canvas's two rule greys turned out to be **one perceived weight tuned twice for two surfaces** —
1.26 on the app ground against 1.25 on the card — so they stayed two tokens, split by surface rather
than by chrome-versus-content.

Three things the extraction surfaced that nobody had asked about are now open in the decision log:
**four ink values fail WCAG AA**, **no artboard draws a focus state**, and the spacing scale is
nineteen hand-set values.

## Next

**Phase 4 — Technical documents.** Run `/project`.

This is the big one, and it is where §4.12 finally opens. It owes six documents:

| Doc | Why it is triggered |
| --- | --- |
| `03-technical-design.md` | Tier 1. Opens §4.12. Security baseline must be answered. |
| `04-database-schema.md` | Tier 1. Every entity needs columns and delete behaviour. |
| `08-authentication.md` | ADR 0012 |
| `09-user-flows.md` | Five screens |
| `10-screen-specifications.md` | Five screens — **moved here from Phase 3**, decided 2026-09-06 |
| `11-testing-plan.md` | PRD S12 (exercised export) and S3 (measured median) |

**Close navigation first.** It blocks `09` and `10` both, it is a PRD gap rather than a preference,
and `05-design-system.md` §8 records that the canvas has nothing to offer here — *Vet*'s empty state
points at Ingest in plain text because there was nothing else to point with.

**Then the three §4.12-adjacent ones, in this order:** the grade set (it needs the scheduler, so it
follows the stack), key assignments, and the phone layout.

**Verify before deciding, per `CLAUDE.md`:**

- **Better Auth + Google OIDC is an unverified preference**, parked in ADR 0012. It gets checked
  against real documentation in this phase before it becomes a decision.
- Whatever scheduler is chosen — FSRS or otherwise — is checked the same way. The grade set falls
  out of it.
- **The three type families are Google Fonts.** Whether the app ships them from Google, self-hosts
  them, or subsets them is a Phase 4 question. Shippori Mincho's CJK coverage is the part worth
  checking rather than assuming.

**Do not reopen** the visual direction, the palette, or the five-screen surface. The contrast
question in the decision log is a bounded change to named ink values, not an invitation to redraw.

## Blocked

Nothing.

**§4.12 (stack) is still shut** and belongs to Phase 4. Its inputs are fixed by the ADRs. Per
`CLAUDE.md`, do not open it without saying so first.

## Carrying

- **The canvas link is still the only copy of the design.** `05-design-system.md` now holds every
  value that matters, so the link is no longer load-bearing for implementation — but the six
  artboards are, if a layout question comes up that the doc does not answer.
- **`10-screen-specifications.md` belongs to Phase 4**, not Phase 3. The `/project` skill's own phase
  table says Phase 3; this project overrode it deliberately, and the reason is in the decision log.
  Do not let a future session move it back on the skill's authority.
- **The ADRs are the decision log's long form.** `06-decision-log.md` indexes them; `adr/` holds the
  argument, the alternatives and the revisit condition. Add the ADR first, then the index line. Small
  decisions are recorded in the log in full instead — three PRD-level ones are, dated 2026-09-06.
- **Better Auth + Google OIDC is a stated preference for identity, and it is UNVERIFIED.** Recorded
  in ADR 0012 so it isn't lost. Per `CLAUDE.md` it gets checked against real documentation in Phase 4
  before it becomes a decision. Do not treat it as decided.
- **Phase 4 owes four Tier 2 docs** — six documents in all, counting 03 and 04. All triggered:
  08 (auth — by ADR 0012), 09 (user flows) and 10 (screen specs) — by five screens — and 11
  (testing plan), since the PRD's S12 requires an exercised export test and S3 requires a measured
  median.
- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Checked
  against jlpt.jp's own FAQ, both language editions, 2026-09-03. Recorded in ADR 0005. Do not
  re-verify; do not re-litigate.
- **How a session runs here:** one question at a time, `❓ Q<n>` with a `➡️` recommendation rather
  than a neutral menu. Nothing verified from memory. Each closed question becomes an ADR or a
  decision-log entry, and new vocabulary lands in `CONTEXT.md` immediately.
- **No git remote yet.** `/setup-matt-pocock-skills` still belongs after planning; choosing GitHub
  Issues as the tracker needs that remote.
- **`frontend-design` is off** at *project* scope — `.claude/settings.json`, committed 2026-09-06.
  It is off for a reason of its own, **not** the `superpowers` one: it runs no interview and collides
  with nothing. It is off because the visual direction is decided and logged, and its instruction is
  to take an aesthetic risk per brief — from Phase 5 on that pushes toward re-deciding it, at the
  point where drift from the canvas costs most. `CLAUDE.md` §Tooling state and `START-HERE.md` §1
  both say so correctly now; earlier versions of both conflated it with `superpowers`.
  **Revisit if** a second *subject* or a screen outside the five needs a fresh direction rather than
  an extension of this one.
- **Branches:** `main` is the default and where work normally happens; `develop` exists for
  development work.

## Skipped

Nothing. **Phase 2 is done and Phase 3 is confirmed in scope** — decided 2026-09-06 alongside the
five-screen surface, and narrowed to Vet and Review. Ingest, Sources and Stats were never explored,
deliberately, and are generic.
