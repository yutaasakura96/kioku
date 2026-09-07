# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is right now

**Kioku** (記憶 — memory) builds spaced-repetition flashcard decks automatically from bulk source
material and is also the app the decks are studied in. First subject is JLPT vocabulary; CS / web
dev / networking / cloud terminology follow.

**Planning is finished and there is still no code.** Phase 4 closed on 2026-09-07: eleven documents,
**39 ADRs**, fourteen verification sections, and an empty frontier. There is no build, no test suite
and no dependency manifest yet — so there are still no commands to run — but the next thing that
happens in this repo is **code**, not another document.

⚠️ **The immediate next step is `/setup-matt-pocock-skills`**, which was deliberately deferred until
the grilling had produced the material the tickets are made from. See §Tooling state.

## Hard constraints

**§4.12 is closed as of 2026-09-06.** The stack was held shut until §4.1–§4.11 were settled, which
was the point, and it is now decided: **Nuxt 4.5.2 / Vue, Postgres via Drizzle, and a deliberately
temporary Vercel + Neon + local-worker deployment** — ADRs 0020, 0021, 0022. The constraint that
replaces the old one is narrower and still binding:

- **Do not re-open a stack decision on preference.** Each of the three ADRs carries a revisit
  condition; that is the door, and new information is the key.
- **Nothing may depend on a Vercel-only feature** — no Vercel KV, Blob or Cron. ADR 0022's whole
  premise is that the move to EC2 or Lightsail stays a Nitro preset change plus a `pg_dump`.

The old no-code rule was **satisfied, not lifted**. During the grilling there was no code, no
scaffolding and no schema design, and the output was decisions, ADRs and a glossary.
`04-database-schema.md` was named as where schema work becomes legal; **it is written**, so that gate
is open and the rule has done its job.

⚠️ **What replaces it is a reading obligation, not a prohibition.** `docs/00-status.md` § Carrying is
a list of decisions that are invisible in the code that violates them — a bare `<NuxtLink>` on a mode
exit, a key handler bound to `document`, a `prerender` on a *place*, a cascade reaching a table that
cannot be rebuilt. Each has a document behind it and a test in `11-testing-plan.md`. **Read Carrying
before writing code that touches any of them.**

## Reading order

1. `docs/00-status.md` — where the project actually is, what was decided, and what is next. The
   memory; nothing else is. `/project` and `/where-am-i` read it first and treat it as authoritative.
   **Its § Carrying is the part that costs you if you skip it.**
2. `CONTEXT.md` — the vocabulary. *Place*, *mode*, *note*, *card*, *session*, *scheduling epoch* and
   *facts strip* are load-bearing words with `_Avoid_` lists, not casual ones.
3. The document for the thing you are building. They are written to be read one at a time:

| Doc | Owns |
| --- | --- |
| `02-product-requirements.md` | The twelve stories, `S1`–`S12`, each with an acceptance criterion |
| `03-technical-design.md` | The rendering split, the worker, the pipeline, the outbox, security |
| `04-database-schema.md` | Eighteen tables, every delete rule, and the one trigger |
| `05-design-system.md` | Every token. **Where it disagrees with the canvas, it wins** (§9) |
| `08-authentication.md` | The six routes, the allowlist's shape, the cookie attributes |
| `09-user-flows.md` | What happens and in what order |
| `10-screen-specifications.md` | What each screen is made of |
| `11-testing-plan.md` | What is tested, at which tier, and **what deliberately is not** |
| `phase-4-verification.md` | ⚠️ **Fourteen sections of checked facts. Do not re-run them** |

`docs/01-project-brief.md` is the **historical grilling target, not a specification.** Its §4 was
twelve open questions and **all twelve are closed** — each has an ADR or a dated decision-log entry.
Read it for the thesis (§5) and the out-of-scope list (§6); do not read §4 as an agenda.

⚠️ `START-HERE.md` is **superseded.** It is the cold-start prompt for a grilling that finished on
2026-09-07, and it still carries the "one question at a time" rule that § Working agreements replaced.
Do not follow it. `docs/00-status.md` is the handoff now.

## Working agreements

- **Never verify from memory.** Anything about a library, an API, FSRS, pricing, or a Japanese
  tokenizer is checked against real docs — context7 for libraries, web search for everything else —
  before it becomes a decision. If it can't be verified, say so. ⚠️ **This does not retire with the
  grilling.** It is what produced fourteen verification sections, and twice it produced a number
  nobody publishes: SudachiPy's 9 ms dictionary load (`phase-4-verification.md` §7.3) and PGlite's
  PostgreSQL version (§14.1).
  **When the docs are silent, measure it and record the measurement.**
- **Recommend an option**, don't lay out a neutral menu. Yuta pushes back if he disagrees, and
  Round 2 shows that working — it recommended TanStack Start and got Vue, recommended Render and got
  Vercel-plus-a-laptop. Both reversals were right and both are argued out in ADRs.
- **Find facts yourself; never ask Yuta for them.**
- **Tests before implementation where there is a natural seam**, and `11-testing-plan.md` §8 already
  names the seams: the pipeline stages, the FSRS wrapper, the `from` allowlist, the grade validator,
  the metric arithmetic. A spec and tickets before any work that spans sessions.
- **The decision log is written as things are decided**, not reconstructed afterwards. ⚠️ **The ADR
  comes first, then the index line in `06-decision-log.md`** — the ADR is the authority and carries
  the alternatives and the revisit condition; the log is an index.
- **Amend the document, don't leave a note for later.** When a decision changes something already
  written, edit that document in the same commit — `04` §9.1 and `03` §8.1 were both amended this
  way, and ADR 0020 and ADR 0025 carry dated amendment blocks in place.

### Superseded, kept so the reasoning isn't lost

- ~~**Grilling asks the whole frontier per round.**~~ `/grill-with-docs` was the sanctioned mode and
  the frontier is now empty — **do not run it, and do not offer it.** The rounds rule replaced an
  earlier "one question at a time" rule on 2026-09-06; if a future phase ever reopens a question,
  rounds win. All three rounds are recorded in `docs/00-status.md` § Done.
- ~~**§4.4 carries a load-bearing factual claim.**~~ **Verified 2026-09-03** — the JLPT has published
  no official vocabulary list since the 2010 revision, deliberately. Recorded in ADR 0005. **Do not
  re-verify; do not re-litigate.**

## Tooling state

- `mattpocock-skills` is enabled at **project** scope via the committed `.claude/settings.json`.
  ⚠️ **The tracker is still unconfigured, and configuring it is the next action in this repo.** The
  planned flow was `/grill-with-docs` first, then `/setup-matt-pocock-skills`, because the grilling
  produces the material the tickets are made from. **It has produced it** — eleven documents and
  39 ADRs — so `/setup-matt-pocock-skills` is now due. There is no `.scratch/` and no tracker pointer
  below this line yet; when there is, it goes here.
- `superpowers` must stay disabled here. Its `brainstorming` skill sets no
  `disable-model-invocation` and its description reads `You MUST use this before any creative work`,
  so it will seize interviews that belong to mattpocock's question banks.
- `frontend-design` is disabled here too, in the same committed `.claude/settings.json`, **for a
  different reason** — the two are often conflated and the distinction matters. It runs no interview
  and collides with nothing; it is off because the visual direction for Vet and Review is decided and
  recorded, and a skill whose instruction is to take an aesthetic risk per brief would push toward
  re-deciding it during implementation. Re-enable it only for a screen or *subject* that genuinely
  needs a fresh direction rather than an extension of the existing one.
- ⚠️ **The first commit that adds a dependency manifest owes a bot in the same commit.** `03` §13.5:
  a bot has nothing to read until a `package.json` or `requirements.txt` exists, so Renovate or
  Dependabot is configured *with* the first one rather than afterwards. **Four pins that a routine
  bump must not touch** are listed there — `psycopg[binary]` ≥ 3.2.4, `SudachiDict-core` 20260723
  (moving it can change the identity of existing *notes*), Nuxt 4.5.2 with `nitropack ^2.13.4`, and
  `drizzle-orm` 0.45.2. ⚠️ **PGlite's version joins them** (ADR 0038): `04` defaults every primary key
  to `uuidv7()`, a Postgres 18 built-in.
- **Branches: `develop` is where work happens; `main` is the integration branch.** The remote is
  [`yutaasakura96/kioku`](https://github.com/yutaasakura96/kioku) and it is **public** — so
  `KIOKU_INVITED_EMAIL` and every other value in `03` §13.1 stays out of the repository.

## Related, but separate

`lfca-lab` (the LFCA exam simulator) is a different mid-build project that shares no code with
Kioku. Patterns worth stealing from it, because they worked: pinning irreplaceable data by identity
and guarding it in more than one place; keeping everything that decides a number in a pure, tested
module; and the write-immediately-with-an-outbox pattern.

**All three were taken, and they are decisions now rather than borrowings** — the irreplaceable data
is `review_log` and it is guarded by `RESTRICT` in `04` §9 *and* by a trigger *and* by a test
(`11` §5); the numbers live in pure modules (`11` §8); and the outbox pattern turned out to appear
three times, which is ADR 0039.
