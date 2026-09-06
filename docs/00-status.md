# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 4 — Technical documents. **In progress.** Rounds 1 and 2 of the grilling are closed;
five design questions are asked and unanswered, and six docs are still owed.
**Updated:** 2026-09-06

Read `CLAUDE.md` first, then this.

## Done

**Phases 1–3 — complete.** Brief, PRD, design exploration, design system. The canvas link in
[`06-decision-log.md`](06-decision-log.md) is still the only copy of the six artboards;
[`05-design-system.md`](05-design-system.md) holds every value that matters.

**Phase 4, Round 1 — closed 2026-09-06.** Nine questions, seven ADRs (0013–0019): navigation and
rendering, session durability, where ingestion runs, the grade set, identity, the model provider,
the tokeniser.

**Phase 4, Round 2 — closed 2026-09-06. §4.12 is finished.** The brief's last open question.

| # | Question | ADR |
| --- | --- | --- |
| 6 | The framework | [0020](adr/0020-nuxt-is-the-framework-because-a-route-can-ship-no-javascript.md) — **Nuxt 4.5.2**, Vue |
| 7 | The database | [0021](adr/0021-postgres-is-forced-by-two-writers-not-chosen.md) — **Postgres**, Drizzle |
| 8 | The host | [0022](adr/0022-the-first-deployment-is-deliberately-temporary.md) — **Vercel + Neon + a local worker** |

**[`phase-4-verification.md`](phase-4-verification.md) — the facts, checked, with sources.** Now
seven sections. §1–4 from Round 1 (FSRS, Better Auth, LLM pricing, tokenisers); **§5–7 added in
Round 2** (frameworks, database, hosting + Neon + the SudachiPy measurement). Six background agents,
everything against primary sources. **Do not re-run this.** Re-verify only if older than ~3 months.

Five findings worth knowing without opening it:

- **SudachiPy's dictionary is memory-mapped and loads in 9 ms**, at 93–136 MB steady-state RSS —
  measured, because no published figure exists. It was never the cold-start cost anyone feared, and
  that killed half of ADR 0015's reasoning. **Construct `Dictionary()` once per process** — each
  construction adds its own mapping.
- **`kuromoji`'s dictionary has been frozen since 2007** and lacks 令和. The obvious JS tokeniser is
  a trap; Sudachi's `normalized_form()` is ADR 0006's dedup key for free.
- **No published benchmark tests Japanese structured extraction.** ADR 0018 makes the model a
  boundary because of it. Do not let a future session "just pick the best model" from docs.
- **Blog claims of an "FSRS-7" could not be corroborated.** FSRS-6 is current.
- **Only three of seven frameworks can make a route ship zero JavaScript.** That, not taste, is why
  ADR 0020 landed where it did.

## Next

**Phase 4, Round 3 — run `/grill-with-docs`.** Not `/project`'s own interview; see Carrying.

**Round 3 is short and already written.** Five design questions were asked at the end of Round 2 and
**never answered** — the session closed on the stack instead. Each has a recommendation on the table,
recorded in full in [`06-decision-log.md`](06-decision-log.md) § Still open. Re-ask them as they
stand; do not re-derive them.

1. **Key assignments, and whether *vetting* has an undo** — one decision, not two, because ADR 0006
   makes rejection permanent.
2. **The four ink values failing WCAG AA** — with the measured finding that seven greys cannot all
   pass.
3. **A focus state** — blocking for two keyboard-driven screens.
4. **Whether the spacing scale is regularised** — cheapest before three undrawn screens multiply it.
5. **The phone layout** — and whether v1 has one at all.

**Three stack follow-ups**, all small, all recorded in the decision log:

- The *note*'s storage shape — ADR 0021 carries a recommendation, not a decision. Closes in `04`.
- Which Python driver — ⚠️ Neon's tested list names `asyncpg` and `pg8000`, not `psycopg`.
- ⚠️ **Whether `noScripts` survives Vercel.** Undocumented by both vendors and it is the main reason
  ADR 0020 chose Nuxt. **One throwaway page, first week.**

**Then the six documents**, in this order:

| Doc | Blocked on |
| --- | --- |
| `03-technical-design.md` | **Unblocked.** Security baseline is mandatory |
| `04-database-schema.md` | `03`. Also closes the note storage shape. Every entity needs columns and delete behaviour |
| `08-authentication.md` | Mostly written already — ADR 0017 + verification §2 |
| `09-user-flows.md` | Unblocked — ADR 0013 closed navigation |
| `10-screen-specifications.md` | Round 3's five answers. **Belongs to Phase 4, not Phase 3** — see Carrying |
| `11-testing-plan.md` | PRD S12 (exercised export) and S3 (measured median) |

## Blocked

Nothing.

## Carrying

- **Use `/grill-with-docs`, always.** Yuta asked for this directly. It cannot be invoked by the
  model — `disable-model-invocation: true` — so **say so in one line at the top of the phase and
  let him type it.** Do not run `/project`'s own interview as a substitute.
- **Grilling asks the whole frontier per round, not one question at a time.** This contradicts
  `CLAUDE.md` § Working agreements, which now records the substitution explicitly. **Rounds win.**
- **Find facts yourself; never ask Yuta for them.** Rounds 1 and 2 dispatched ten background agents
  between them and asked the rest of the frontier while they ran. That is the pattern. Round 2 also
  **measured** a number nobody publishes, rather than citing around it.
- **Recommendations get pushed back on, and that is the process working.** Round 2 recommended
  TanStack Start and got Vue; recommended Render and got Vercel-plus-a-laptop. Both reversals were
  right, and both are argued out in the ADRs rather than quietly swapped.
- **The initial deployment is temporary by design.** ADR 0022. The destination is EC2 or Lightsail.
  **Nothing may depend on a Vercel-only feature** — no Vercel KV, Blob or Cron — or the move stops
  being a preset change.
- **`10-screen-specifications.md` belongs to Phase 4**, not Phase 3. The `/project` skill's own
  phase table says Phase 3; this project overrode it deliberately. Do not let a future session move
  it back on the skill's authority.
- **The ADRs are the decision log's long form.** Add the ADR first, then the index line.
- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Verified
  2026-09-03, recorded in ADR 0005. Do not re-verify; do not re-litigate.
- **ADR 0016 records a real cost, not a simplification.** Dropping same-day relearning is a genuine
  reduction in learning efficiency. If retention later looks poor while *false-accept rate* is
  clean, the answer-bounded session in that ADR is the first thing to try.
- **ADR 0019 was the weakest-held decision of Round 1**, and Round 2 did not disturb it. The Python
  worker's two-toolchain tax is real and the Node route runs an identical engine. It is fine to
  revisit; it is not fine to revisit by forgetting why.
- **ADR 0015 now survives on its second argument only.** The 9 ms measurement killed the latency
  reason for an always-on worker. What stands is that a directly-connected worker needs no HTTP job
  endpoint, which keeps PRD S1's "refused at every route" literally true.
- **Two Neon connection strings, on purpose.** Pooled for the app, direct for the worker. The pooled
  endpoint does not support `LISTEN`/`NOTIFY`. Never leave the worker running as a permanent daemon
  against the free tier — a held listener keeps the compute awake and exhausts the month.
- **⚠️ Two pipeline findings for `03`:** numerals come back `is_oov=True` with `normalized_form`
  rewritten to ASCII (六 → `6`), which ADR 0006's *identity key* depends on; and `tokenize()`'s
  result is not sliceable.
- **No git remote yet.** `/setup-matt-pocock-skills` still belongs after planning.
- **`frontend-design` and `superpowers` are off at project scope**, for different reasons.
  `CLAUDE.md` § Tooling state has both correctly.
- **Branches:** `main` is the default and where work normally happens; `develop` exists. Neon gets a
  branch per environment to match.

## Skipped

Nothing.
