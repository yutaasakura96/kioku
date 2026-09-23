# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is right now

**Kioku** (記憶 — memory) builds spaced-repetition flashcard decks automatically from bulk source
material and is also the app the decks are studied in. First subject is JLPT vocabulary; CS / web
dev / networking / cloud terminology follow.

**Planning is finished and the build is under way.** Phase 4 closed on 2026-09-07 with eleven
documents, **39 ADRs**, fourteen verification sections and an empty frontier; Phase 6 has been adding
code since 2026-09-09 and **thirty-one more ADRs** with it — **70** as of 2026-09-21 (ADR 0070, from #25's triage, answers how a seeded list gets in): five are the
pivot, ADR 0067 was needed to build #20, because "reuse the mint path" had no answer across two
languages, ADR 0068 decides how an Anki deck gets in, and ADR 0069 makes the typed check the *grade*, from the reader's first *session* (⚠️ this said *69* until #25's triage on 2026-09-21, *68* until earlier that day, *67* until 2026-09-19, *66* until 2026-09-17, *61* until 2026-09-16 and *nineteen* until the day
before). ⚠️ **#25 added no ADR and amended ADR 0070 in place** (2026-09-21: § Settled by the build — a `seed`
table, a `seed` job in the same queue, counts 10/25/50/100). ⚠️ **#26 added no ADR and amended ADR 0068 in place** (2026-09-20: a deck name contributes
only the words in it that name a level, on the re-measurement that ADR asked #26 for). ⚠️ **#21 added no ADR and amended ADR 0066 in place** (where the reader's zone is stored, and four
other things the build settled). ⚠️ **#23 added no ADR and corrected one**: ADR 0037's amended table said a day boundary was
midnight where ADR 0066 says 04:00. ⚠️ **This paragraph said "there is still no
code" until 2026-09-11** — it was written before #2 and nothing had corrected it since, which meant
every session opened by being told the opposite of what it would find.

⚠️ **A product pivot was agreed with Yuta on 2026-09-16 and written down the same day: ADRs 0062
to 0066 and issues #19 to #25.** Input becomes **word lists, AI-seeded lists and imported Anki
decks** rather than mined prose (ADR 0063); every word carries a **domain** and a **JLPT level**,
filled automatically (ADR 0065); **manual vetting leaves the loop** and *Vet* becomes the flag queue
(ADR 0064); the daily review load gets a **brake** (ADR 0066); and *acceptance rate* retires in
favour of **retention, consistency and flag rate** (ADR 0062).
⚠️ **Seven tickets of the pivot are built: #19 (2026-09-16), #20 and #22 (both 2026-09-17),
#23 and #21 (both 2026-09-18), #26 (2026-09-20) and #25 (2026-09-21)** — ⚠️ this said *six* until
#25, *five* until #26, *four* until #21 and *three* until #23. **A seeded list is a draft** (ADR 0070):
*Ingest* asks the worker for a word list by *domain*, *level* and count, the draft lands in the
word-list form, and the reader submits it as a plain `word_list` *source*; each request is a `seed`
row on the spend ledger.
**The review load has a brake** (ADR 0066): ten new *cards* a local day, counted at composition on
`review_session.new_count`, none while fifty are due, and a backlog ordered by retrievability.
**Every generated word carries a model-estimated *level* and *domain*** (`level_claim`,
`domain_claim`, from the *subject*'s closed `levels` and `domains` sets), and *Review*'s end screen and
empty states carry a filter that narrows the **new** half of the next *session* only (ADR 0065). A *source* declares
its `kind`, the declaration names one pipeline per kind, and *Ingest* offers a word list first. **A
chosen word is `accepted` and minted when the worker writes it**, owned by `job.requested_by`,
through the `mint_cards` database function (ADR 0067). **_Vet_ is the flag queue** with keep, fix and
drop. ⚠️ **And the metrics are retired as of 2026-09-18**: `/stats` reads **retention**,
**consistency**, **flag rate**, *time-to-first-review* and *cards minted*, and
`shared/metrics/acceptance.ts` is deleted. **Everything below about *acceptance rate* and
*seconds-per-note* is history.** `docs/00-status.md` § Next holds the ticket order, and ⚠️ **the frontier is empty**: [#35](https://github.com/yutaasakura96/kioku/issues/35) was built 2026-09-22 (the first real Anki import failed; ADR 0068 §5 is reversed for `anki`, and an imported word keys on the deck's term and reading) — ⚠️ it named #35 as the frontier earlier that day. ⚠️ **N3 is imported as of 2026-09-23 — 2,030 *cards* for $4.30, and #35 holds on real data** (§ Done); the run left three `needs-triage` issues, [#36](https://github.com/yutaasakura96/kioku/issues/36), [#37](https://github.com/yutaasakura96/kioku/issues/37) and [#38](https://github.com/yutaasakura96/kioku/issues/38), and **a long run's worker belongs detached rather than in a terminal tab.** ~~The frontier is empty~~: [#25](https://github.com/yutaasakura96/kioku/issues/25), AI-seeded lists, was
built 2026-09-21 from ADR 0070 (⚠️ it was the frontier from its triage earlier that day; empty before that, and #26 was closed the same day).
⚠️ **`0007` is applied to Neon (2026-09-21); ~~the first live seed request spends on Yuta's key and is his call~~ — it ran 2026-09-22 (tech, N3, 10 words, $0.0013, all ten minted).** Before that, [#30](https://github.com/yutaasakura96/kioku/issues/30), the kanji-reading retry, was built
2026-09-21 from ADR 0069 and the KANJIDIC2 research (`docs/kanjidic-research.md`, #29) (⚠️ it named
#30 from the research's close, and #29 before that). ⚠️ **#30 left a monthly obligation**: the
KANJIDIC2 table's licence requires a refresh, logged in `docs/00-status.md` § Carrying.
[#27](https://github.com/yutaasakura96/kioku/issues/27), the kana-only reading skip, and
[#28](https://github.com/yutaasakura96/kioku/issues/28), the check as the *grade*, were built the
same day (⚠️ the frontier named both until then). ⚠️ **#28's backfill ran on Neon the same day**
(475 lists, $0.1654), and its lists are narrower than `generate`'s (`docs/00-status.md` § Next).
[#26](https://github.com/yutaasakura96/kioku/issues/26), Anki import, was
built 2026-09-20 and #25 is `needs-triage` (⚠️ the frontier was empty from #26's build until 2026-09-21, #26 from 2026-09-19, empty from #21's
build on 2026-09-18, #21 until it was built that day, #23 until earlier that day and #22 until
2026-09-17). **An `.apkg` is unpacked by the app** into a `term⇥reading⇥hint` word list on
`node:zlib` and `node:sqlite`, with no new dependency (ADR 0068).
⚠️ **This paragraph said "no code has moved yet" until 2026-09-16, and named #20 as the frontier
until 2026-09-17.**

**What exists now:** #2 through #18 are built (and the pivot's, above) — a Nuxt app with the rendering split enforced by the
build, twenty-three tables (twenty-two until `backfill` on 2026-09-22, twenty-one until #25 added `seed`, nineteen until #28 added `note_meaning` and `meaning_synonym`, eighteen until #22 added `domain_claim`) plus four the auth library owns, a *subject* declaration both toolchains read,
a session gate, Ingest and Sources end to end, a Python worker that subscribes, polls, claims and
sweeps, a pipeline that turns a pasted *source* into *pending notes* one model request per *chunk*,
a reader who can see one of those *notes*, judge it in a single keystroke, and mint a *card* by doing
so, a bounded *session* of those *cards* that ends — composed due-first and snapshotted server-side,
four *grades* under a *progress rail* that knows its own length — and, since 2026-09-12, **a
*session* that survives the network**: an outbox in `localStorage` carrying two kinds of entry, so
every answer is durable before the screen moves and the stream replays in order when the connection
returns, and `X`, which suspends a bad *card* and leaves its *review* history standing. And, since
2026-09-12, **the numbers get read**: `/stats` computes them, suppresses each ratio under its own
evidence and says why (ADR 0057, ADR 0058, and ADR 0062 since 2026-09-18 — ⚠️ **this said "all six"
and "the four ratios under twenty vetted *notes*" until then**). ⚠️ **And since 2026-09-18 the
project has a notion of *today***: `shared/time/local-day.ts`, a day running 04:00 to 04:00 in the
reader's zone (ADR 0066 §4), which the brake imports too — and which `/stats` feeds the zone the
newest *session* stored (`review_session.zone`, since #21), because a `noScripts` *place* has no
client to ask. ⚠️ It fed **UTC** until #21.
⚠️ **The frontier was empty from 2026-09-12 to 2026-09-16, became
[#19](https://github.com/yutaasakura96/kioku/issues/19), was
[#21](https://github.com/yutaasakura96/kioku/issues/21) alone after #23, and has no
`ready-for-agent` ticket since #21 was built later on 2026-09-18** (⚠️ it named #20 and #22 until
2026-09-17 and #23 until 2026-09-18); ⚠️ **Neon is migrated through `0005` as of 2026-09-19** (this said `0003` to `0005` were unapplied
until then, and `0003` never was), ⚠️ **and through `0006` (#28) as of 2026-09-21** ⚠️ **and through `0007` (#25) the same day** ⚠️ **and through `0008` (`backfill`) on 2026-09-22**; ⚠️ **#26 added no migration** — an `anki` *source* is a `source`
row like any other; ~~`S12`'s export is the one thing
still unticketed~~ ⚠️ **`S12`'s export is built (#31, 2026-09-22)**, and `docs/00-status.md` § Next names the rest.
~~⚠️ **One thing #13 wrote and nothing reads: `note_vetting.flagged_at`.**~~ Read since #20, when a
flagged *note* started returning to `/vet`. ⚠️ **And one thing three paths write and nothing reads
since #23: `note_vetting.seconds_to_vet`** — the same bullet pointing the other way, kept because
ADR 0062 retires the figure rather than the measurement (§ Carrying). ~~⚠️ **And one thing #14 does not build: `S12`'s export.**~~ ⚠️ **Built by #31 on 2026-09-22**: `GET /api/export`
and the `Export everything` link on `/stats`, with `11` §4's reconciliation test. Signed out, it answers
`302` to the door rather than `401` (`08` §6.3 as amended).
⚠️ **And, since 2026-09-15, `/review` is answered by typing** (ADR 0060, #18): the reading, then the
meaning, with the app proposing the *grade*. **And the worker heartbeats while the model streams**
(ADR 0061, #17), so a long *chunk* no longer has its job silently reclaimed.
⚠️ **And, since 2026-09-12, there is an environment to run it in.** Neon project `kioku`
(`small-hat-90514806`, Postgres 18.6, `aws-ap-southeast-1`) with all twenty-three tables migrated and
`uuidv7()` live; `.env` and `worker/.env` written and gitignored. ⚠️ **Every value is filled as of
2026-09-13** — `scripts/first-run.sh` wrote the Google client and the Anthropic key and each was
checked live — and **the first sign-in happened that day.** The first run (2026-09-14/15) is
recorded in `docs/first-run-expectation.md`: 474 *pending notes*, 39 vetted, **no *card* reviewed
yet**. ⚠️ **This paragraph said both values were empty and nobody had signed in until 2026-09-16.**

**The commands:**

```
npm run test        # 1150 across four tiers — unit, schema, nuxt, e2e (counted 2026-09-22, after the backfill ledger row)
npm run typecheck   # nuxt typecheck, then tsc over the tests
npm run build
cd worker && uv run pytest   # worker/tests/README.md carries how many need Docker (ADR 0038)
cd worker && uv run --env-file .env python .   # the worker
# ⚠️ --env-file is not optional: the worker has NO dotenv loader (it reads
# os.environ directly), so a plain `uv run python .` does not see worker/.env
# and dies on KIOKU_WORKER_DATABASE_URL. Verified against uv 0.11.10.
```

⚠️ **`docs/00-status.md` is the memory and this paragraph is not.** It carries what is built, what is
next and — in § Carrying — the decisions that are invisible in the code that violates them. Read it
before writing code; this file tells you how to work, that one tells you where the work is.

⚠️ **The tracker is configured as of 2026-09-08** — `/setup-matt-pocock-skills` ran, and issues live
on GitHub. See §Agent skills. `START-HERE.md` carries the four things the documents already constrain
about ticket order.

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

`START-HERE.md` is the **cold-start handoff, rewritten 2026-09-08 for the build phase.** Read it
when a session opens with no memory of how any of this was decided: it carries the repo's actual
state, the prompt to open the first build session, and the four things the documents already
constrain about ticket order. ⚠️ It replaced a version that opened the *grilling* session and carried
the superseded "one question at a time" rule — if you are reading that one, you are reading git
history.

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
  **The tracker was configured on 2026-09-08** and the pointer is §Agent skills below. The planned
  flow held: `/grill-with-docs` first, then `/setup-matt-pocock-skills`, because the grilling
  produces the material the tickets are made from — eleven documents and 39 ADRs of it. There is
  still no `.scratch/`, and there will not be one: issues are on GitHub, not on disk.
- `superpowers` must stay disabled here. Its `brainstorming` skill sets no
  `disable-model-invocation` and its description reads `You MUST use this before any creative work`,
  so it will seize interviews that belong to mattpocock's question banks.
- `frontend-design` is disabled here too, in the same committed `.claude/settings.json`, **for a
  different reason** — the two are often conflated and the distinction matters. It runs no interview
  and collides with nothing; it is off because the visual direction for Vet and Review is decided and
  recorded, and a skill whose instruction is to take an aesthetic risk per brief would push toward
  re-deciding it during implementation. Re-enable it only for a screen or *subject* that genuinely
  needs a fresh direction rather than an extension of the existing one.
- ⚠️ **Both dependency manifests now exist, and both are covered.** `package.json` arrived with #2;
  ⚠️ **`worker/pyproject.toml` with `worker/uv.lock` arrived with #3** rather than #7, because #3's
  Python half needed a test runner. The worker is **uv on Python 3.11**, pinned by
  `worker/.python-version` — not by `.tool-versions`, which uv does not read. Renovate covers the
  Python side with **no change to `renovate.json`**: its `pep621` manager matches `pyproject.toml`
  wherever it sits and maintains `uv.lock` (verified 2026-09-10).
- ⚠️ **The first commit that adds a dependency manifest owes a bot in the same commit.** `03` §13.5:
  a bot has nothing to read until a `package.json` or `requirements.txt` exists, so Renovate or
  Dependabot is configured *with* the first one rather than afterwards. **Eight pins that a routine
  bump must not touch** are listed there (the eighth, `wanakana` 5.3.1, arrived with #18 on
  2026-09-15) — `psycopg[binary]` ≥ 3.2.4, `SudachiDict-core` 20260723
  (moving it can change the identity of existing *notes*), Nuxt 4.5.2 with `nitropack ^2.13.4`,
  `ts-fsrs` 5.4.2, `drizzle-orm` 0.45.2 (a security floor — `03` §13.2), and
  `@electric-sql/pglite` 0.5.8 **with the Postgres image tag beside it**, because `04` defaults every
  primary key to `uuidv7()`, a Postgres 18 built-in (ADR 0038), and — added 2026-09-09 with #5 —
  **`better-auth` 1.7.3 exactly**, because `08` §7's regenerate-and-diff practice only means
  something against a known version. `03` §13.5 also now carries the one `overrides` entry in
  `package.json`, and why `--legacy-peer-deps` is not it. ⚠️ **Amended 2026-09-08:** this said
  *four* and listed `drizzle-orm` in place of `ts-fsrs`, while `03` §13.5 carried neither
  `drizzle-orm` nor PGlite. `03` §13.5 is the list; it now has all seven and this line matches it.
- **Branches: `develop` is where work happens; `main` is the integration branch.** The remote is
  [`yutaasakura96/kioku`](https://github.com/yutaasakura96/kioku) and it is **public** — so
  `KIOKU_INVITED_EMAIL` and every other value in `03` §13.1 stays out of the repository.

## Agent skills

### Issue tracker

GitHub Issues on [`yutaasakura96/kioku`](https://github.com/yutaasakura96/kioku), via the `gh` CLI.
⚠️ **The repo is public and so are the issues** — the `03` §13.1 values stay out of issue bodies for
the same reason they stay out of the code. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The five canonical roles, unrenamed: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root, both already written.
See [`docs/agents/domain.md`](docs/agents/domain.md).

### The subject declaration

⚠️ **`subjects/jlpt-vocab.json` is read by both toolchains and restated by neither** (ADR 0003,
`03` §6). Its roles are flags on each field, its ordered sets are lists, its stage keys are also
Python module names, and TypeScript's derived types are `string` because a JSON import arrives
widened. `subjects/README.md` is the short version; `docs/00-status.md` § Carrying has the traps.

## Related, but separate

`lfca-lab` (the LFCA exam simulator) is a different mid-build project that shares no code with
Kioku. Patterns worth stealing from it, because they worked: pinning irreplaceable data by identity
and guarding it in more than one place; keeping everything that decides a number in a pure, tested
module; and the write-immediately-with-an-outbox pattern.

**All three were taken, and they are decisions now rather than borrowings** — the irreplaceable data
is `review_log` and it is guarded by `RESTRICT` in `04` §9 *and* by a trigger *and* by a test
(`11` §5); the numbers live in pure modules (`11` §8); and the outbox pattern turned out to appear
three times, which is ADR 0039.
