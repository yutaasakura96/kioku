# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 4 — Technical documents. **In progress.** Round 1 of the grilling is closed; six docs
still owed.
**Updated:** 2026-09-06

Read `CLAUDE.md` first, then this.

## Done

**Phases 1–3 — complete.** Brief, PRD, design exploration, design system. Twelve ADRs, indexed in
[`06-decision-log.md`](06-decision-log.md). The canvas link in that log is still the only copy of the
six artboards; `05-design-system.md` holds every value that matters.

**Phase 4, Round 1 — closed 2026-09-06.** Nine questions, seven ADRs.

| # | Question | ADR |
| --- | --- | --- |
| 1 + 2 | Navigation and rendering | [0013](adr/0013-three-screens-are-places-and-two-are-modes.md) |
| 3 | Outbox durability, mid-session reload | [0014](adr/0014-the-session-survives-a-reload.md) |
| 4 | Where ingestion runs | [0015](adr/0015-ingestion-runs-in-an-always-on-worker-driven-by-a-job-table.md) |
| 5 + 6 | Grade set, same-day relearning | [0016](adr/0016-four-grades-and-no-same-day-relearning.md) |
| 7 | Identity mechanism | [0017](adr/0017-better-auth-with-two-independent-refusals.md) |
| 8 | Model provider | [0018](adr/0018-the-model-provider-is-a-boundary-and-acceptance-rate-picks-the-winner.md) |
| 9 | Tokeniser, worker language | [0019](adr/0019-sudachi-is-the-tokeniser-and-it-chooses-the-worker-s-language.md) |

**[`phase-4-verification.md`](phase-4-verification.md) — the facts, checked, with sources.** FSRS,
Better Auth, LLM pricing and structured output, Japanese tokenisers. Four background agents,
everything against primary sources. **Do not re-run this.** Re-verify only if older than ~3 months.

Three findings worth knowing without opening it:

- **`kuromoji`'s dictionary has been frozen since 2007** and lacks 令和. The obvious JS tokeniser is
  a trap; Sudachi's `normalized_form()` is ADR 0006's dedup key for free.
- **No published benchmark tests Japanese structured extraction.** ADR 0018 makes the model a
  boundary because of it. Do not let a future session "just pick the best model" from docs.
- **Blog claims of an "FSRS-7" could not be corroborated** in any official source. FSRS-6 is current.

## Next

**Phase 4, Round 2 — run `/grill-with-docs`.** Not `/project`'s own interview; see Carrying.

**Three stack questions remain**, all deliberately held because they depend on Round 1's answers:

1. **The framework.** Hard constraint from ADR 0013: it must do server-rendered pages *and*
   client-owned islands well. TypeScript app tier.
2. **The database.** Inputs now fixed: two writers (app + worker, ADR 0015), *subject*-declared note
   fields and per-field *provenance* pushing toward semi-structured storage (ADR 0003, 0004),
   `ts-fsrs` card state (`phase-4-verification.md` §1.2), Better Auth's four tables (§2.3).
3. **The host.** Must run an always-on Python worker with a 68 MB dictionary (ADR 0015, 0019) plus
   the app tier. Cost at 0 users and at 1,000 is a `03` question.

**Then the six documents**, in this order:

| Doc | Blocked on |
| --- | --- |
| `03-technical-design.md` | The three above. Security baseline is mandatory |
| `04-database-schema.md` | `03`. Every entity needs columns and delete behaviour |
| `08-authentication.md` | Mostly written already — ADR 0017 + verification §2 |
| `09-user-flows.md` | Unblocked — ADR 0013 closed navigation |
| `10-screen-specifications.md` | Unblocked. **Belongs to Phase 4, not Phase 3** — see Carrying |
| `11-testing-plan.md` | PRD S12 (exercised export) and S3 (measured median) |

**Four smaller things still open** in the decision log: key assignments (now unblocked by ADR 0013),
the phone layout, four ink values failing WCAG AA, no focus state drawn, and the nineteen-value
spacing scale.

## Blocked

Nothing.

## Carrying

- **Use `/grill-with-docs`, always.** Yuta asked for this directly. It cannot be invoked by the
  model — `disable-model-invocation: true` — so **say so in one line at the top of the phase and
  let him type it.** Do not run `/project`'s own interview as a substitute.
- **Grilling asks the whole frontier per round, not one question at a time.** This contradicts the
  "one question at a time" line in `CLAUDE.md` §Working agreements and in earlier versions of this
  file. The grill command is the sanctioned substitution, so **rounds win.** `CLAUDE.md` still needs
  that line amended — it was left alone rather than edited mid-session.
- **Find facts yourself; never ask Yuta for them.** Round 1 dispatched four background agents and
  asked the rest of the frontier while they ran. That is the pattern.
- **§4.12 is open** and partly closed. The framework, database and host are what remain.
- **`10-screen-specifications.md` belongs to Phase 4**, not Phase 3. The `/project` skill's own
  phase table says Phase 3; this project overrode it deliberately. Do not let a future session move
  it back on the skill's authority.
- **The ADRs are the decision log's long form.** Add the ADR first, then the index line.
- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Verified
  2026-09-03, recorded in ADR 0005. Do not re-verify; do not re-litigate.
- **ADR 0016 records a real cost, not a simplification.** Dropping same-day relearning is a genuine
  reduction in learning efficiency. If retention later looks poor while *false-accept rate* is
  clean, the answer-bounded session in that ADR is the first thing to try.
- **ADR 0019 was the weakest-held decision of Round 1.** The Python worker's two-toolchain tax is
  real and the Node route runs an identical engine. It is fine to revisit; it is not fine to revisit
  by forgetting why.
- **No git remote yet.** `/setup-matt-pocock-skills` still belongs after planning.
- **`frontend-design` and `superpowers` are off at project scope**, for different reasons.
  `CLAUDE.md` §Tooling state has both correctly.
- **Branches:** `main` is the default and where work normally happens; `develop` exists.

## Skipped

Nothing.
