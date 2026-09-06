# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 4 — Technical documents. **In progress.** The grilling is finished — Rounds 1, 2 and 3
are closed and the frontier is empty. **28 ADRs.** Six docs are still owed.
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

**Phase 4, Round 3 — closed 2026-09-06. The frontier is empty.** Nine questions, six ADRs
(0023–0028) plus one full log entry, and two verification sections. The five design questions left
hanging at the end of Round 2 are answered; so are the three stack follow-ups.

| # | Question | Outcome |
| --- | --- | --- |
| 1 | Keys, and whether vetting has an undo | [0023](adr/0023-space-is-the-forward-action-and-z-is-the-confirm.md) — `space` forward, `Z` instead of a dialog |
| 2 | Four ink values failing WCAG AA | [0024](adr/0024-four-greys-that-pass-not-seven-that-do-not.md) — **seven greys become four** |
| 3 | A focus state | [0025](adr/0025-one-focus-ring-and-the-modes-do-not-draw-it.md) — one token, modes draw no ring |
| 4 | The spacing scale | Regularised to ten 4pt steps — log entry, no ADR |
| 5 | The phone layout | [0026](adr/0026-review-is-the-only-screen-that-gets-a-phone-layout.md) — *Review* only, **and every mode gains a Done control** |
| 6 | The note's storage shape | Deferred again, deliberately, to `04` |
| 7 | The Python driver | [0027](adr/0027-psycopg-3-is-the-driver-and-neons-table-is-not-a-support-list.md) — psycopg 3, the objection was a misread page |
| 8 | `noScripts` on Vercel | Verification §8 — **it survives**; ADR 0020 amended |
| 9 | The worker's dropped listener | [0028](adr/0028-the-job-table-is-the-truth-and-notify-is-only-an-optimisation.md) — the job table is the truth |

**[`phase-4-verification.md`](phase-4-verification.md) — the facts, checked, with sources.** Now
nine sections. §1–4 from Round 1 (FSRS, Better Auth, LLM pricing, tokenisers); **§5–7 added in
Round 2** (frameworks, database, hosting + Neon + the SudachiPy measurement); **§8–9 added in
Round 3** (`noScripts` under the Vercel preset; the Python driver and what scale-to-zero does to
`LISTEN`). Eight background agents, everything against primary sources. **Do not re-run this.**
Re-verify only if older than ~3 months.

Seven findings worth knowing without opening it:

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
- **`noScripts` occurs in zero files in `nitropack@2.13.4`** — the exact version Nuxt 4.5.2 pins. The
  Vercel preset cannot drop a rule it never reads, and the rule runs inside the handler the preset
  packages verbatim. **Neither vendor documents this and nothing upstream tests it**, so the
  fifteen-minute smoke test survives as regression cover, not as investigation.
- **Neon's driver table is a SNI-compatibility list for non-libpq drivers, not a support list.** An
  earlier session read a page that contains no driver list at all. psycopg 3 is Neon's own documented
  Python driver.

## Next

**The grilling is over. Write the six documents**, in this order. `/grill-with-docs` has nothing
left to ask — the frontier is empty and every question that was open has an ADR or a dated entry.

| Doc | Blocked on |
| --- | --- |
| `03-technical-design.md` | **Unblocked. Start here.** Security baseline is mandatory. Carries ADR 0028's worker loop and the current `noScripts` API names |
| `04-database-schema.md` | `03`. **Closes the note storage shape** — the one decision deliberately still open. Also needs the job table's claimed/unclaimed distinction from ADR 0028. Every entity needs columns and delete behaviour |
| `08-authentication.md` | Mostly written already — ADR 0017 + verification §2 |
| `09-user-flows.md` | Unblocked — ADR 0013 closed navigation |
| `10-screen-specifications.md` | **Unblocked.** Round 3 closed all five design questions. Owes: five interaction states, the grade labels, the Done control's geometry, the *Review* phone layout. **Belongs to Phase 4, not Phase 3** — see Carrying |
| `11-testing-plan.md` | PRD S12 (exercised export) and S3 (measured median) |

**Three first-week experiments**, none blocking a document:

- **The `noScripts` smoke test**, ~15 min. One route `{ prerender: true, noScripts: true }`, one
  `{ noScripts: true }` alone; `curl` both, grep for `<script`. The second is the runtime path.
- **One `psycopg.connect()`** against the direct Neon endpoint. Verification §9.1 is documentary; a
  live connection falsifies it cheaply.
- **Whether an idle `LISTEN` connection defers scale-to-zero.** Neon is silent. ADR 0028 holds either
  way; this settles the *cost* question only.

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
- **Every *mode* now carries a visible Done control**, on every viewport — ADR 0026. This came out of
  the phone layout (a phone has no `Esc`) but it is not a phone concession: it changes what a mode
  *is*, and `CONTEXT.md`'s definition moved with it. ADR 0013 emptied those headers on purpose, so
  the one control they carry was argued for, not defaulted into.
- **The ink ramp is four greys, not seven** — ADR 0024, and `05-design-system.md` §2 carries the
  outcome. *Vet* now reads heavier than the artboard does. **That is the decision, not drift**; do
  not "restore" the canvas values.
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
  endpoint does not support `LISTEN`/`NOTIFY` — confirmed against Neon's own list and PgBouncer's.
- ⚠️ **This file used to claim a held listener keeps the Neon compute awake and exhausts the month.
  That was never verified and Neon does not document it** — it says what *wakes* an idle compute,
  never what prevents suspension (verification §9.2). What *is* documented: Free cannot disable
  scale-to-zero, and a suspended session destroys the listener along with every notification fired
  while the worker was away. **ADR 0028 is the answer and it holds whichever way the cost question
  resolves** — the job table is the truth, `NOTIFY` only shortens latency, and the worker
  re-`LISTEN`s *then* polls on every reconnect, in that order.
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
