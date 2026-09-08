# Start here — the prompt for the first build session

**Rewritten 2026-09-08. §1–§3 amended 2026-09-09.** The previous version of this file opened the
grilling session. That grilling ran three rounds, closed on 2026-09-07, and produced eleven documents
and 39 ADRs. It is finished, and this file now opens the phase after it. ⚠️ **The amendment matters:**
the spec and the tickets are published, so this file no longer opens a *specifying* session — it
opens an *implementing* one.

This exists so the next session can begin **cold** — no memory of the seven conversations that
produced `docs/`. Read §1, paste §2.

⚠️ **Nothing in this repo needs deciding.** If a session opens here and starts asking you questions
about product scope, the stack, the schema or the screens, it has not read `docs/00-status.md` and it
is about to re-litigate work that is done. Stop it and point it at §1.

---

## 1. Before the prompt — what is already true

**There is nothing to run.** The last version of this file had a setup checklist; every item on it is
done.

| | State |
| --- | --- |
| `mattpocock-skills` | **Enabled** at project scope in the committed `.claude/settings.json` |
| `superpowers` | **Off**, and must stay off — `CLAUDE.md` § Tooling state says why |
| `frontend-design` | **Off**, for a different reason — same section, and the distinction matters |
| Git | Clean. Remote is [`yutaasakura96/kioku`](https://github.com/yutaasakura96/kioku), **public** |
| Branches | **`develop` is where work happens**; `main` is the integration branch |
| `.gitignore` | Present, and `.claude/settings.json` is committed on purpose |
| Planning docs | `docs/00` through `docs/11`, plus `phase-4-verification.md` and 39 ADRs |
| Code | **None.** No `package.json`, no `requirements.txt`, no stack on disk |
| Tracker | **Configured 2026-09-08, filled 2026-09-08** — GitHub Issues. **#1 is the spec, #2–#14 are the tickets** |
| Labels | All five canonical roles exist: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` |

⚠️ **The tracker is done too, as of 2026-09-08.** `/setup-matt-pocock-skills` ran:
`docs/agents/issue-tracker.md`, `triage-labels.md` and `domain.md` are written, tickets live in
**GitHub Issues**, and `CLAUDE.md` § Agent skills points at all three. **Do not run it again.**

**The tickets exist too, as of 2026-09-08.** `/to-spec` published **#1**, scoped to ADR 0001's first
milestone; `/to-tickets` published **#2–#14**, thirteen tracer-bullet tickets, each labelled
`ready-for-agent`, each citing the document section it came from, each listing its blockers by real
issue number. ⚠️ **Do not run either command again** — a second `/to-spec` publishes a duplicate spec.

**The one thing that is not done is the code.** There is still no `package.json` and no stack on
disk. **The frontier is one ticket: [#2](https://github.com/yutaasakura96/kioku/issues/2), the only
one with no blockers** — scaffold the repo and prove the rendering split. §2's prompt says how.

⚠️ **Two things about the remote, because it is public.** `KIOKU_INVITED_EMAIL`, both Neon connection
strings and the model provider key stay out of the repository — `03` §13.1 lists where each lives.
And `03` §13.6 names the laptop as the security weak point rather than mitigating it: it holds the
direct connection string and the provider key at once. That is a known cost of ADR 0022's temporary
shape, not an oversight to fix in a ticket.

---

## 2. The prompt — paste this as the first message

> I'm picking up **Kioku** at the start of the build phase. Planning **and ticketing** are both
> finished: eleven documents, 39 ADRs, an empty frontier, and fourteen issues on the tracker.
> **Nothing is open and nothing needs deciding.**
>
> **Read `docs/00-status.md` first — all of it, including § Carrying — then `CLAUDE.md`, then
> `CONTEXT.md`.** Do not read the rest of `docs/` yet; there are eleven documents and you want the
> one for the thing you are building, which is what `CLAUDE.md` § Reading order is for.
>
> Then **read the frontier ticket with `gh issue view 2`, and issue #1 for the spec it hangs off**,
> and **stop and tell me to type `/implement 2`.** The tracker is configured *and filled*: **#1 is
> the spec**, scoped to ADR 0001's vertical slice — paste two pages → ~30 vetted cards → studied on
> two consecutive days, emitting `S10`'s numbers — and **#2–#14 are the tickets**. **#2 is the only
> one with no blockers.**
>
> ⚠️ **Do not run `/to-spec` or `/to-tickets`** — both ran on 2026-09-08, and a second `/to-spec`
> publishes a duplicate spec over a tracker that is already correct. **Do not run
> `/setup-matt-pocock-skills`** either — it ran on the same day and re-running it re-decides a
> settled question.
>
> After #2 lands: `/clear`, then `/implement <n>` for the next unblocked ticket, one per window.
>
> Rules, and most of them are about **not** doing things:
>
> - **Do not run `/grill-with-docs`.** The frontier is empty. If you think a question is open,
>   check `docs/06-decision-log.md` § Still open before you ask it — every entry there is struck
>   through.
> - **Do not re-verify `phase-4-verification.md`.** Fourteen sections, all against primary sources,
>   §1–14 checked 2026-09-06 and -07. If you need a *new* fact, check it and add §15 with sources;
>   do not touch what is there.
> - **Do not re-open a stack decision on preference.** Nuxt 4.5.2 / Vue, Postgres via Drizzle,
>   Vercel + Neon + a local worker — ADRs 0020, 0021, 0022, each with a revisit condition. New
>   information is the key; taste is not.
> - **Never verify from memory.** context7 for libraries, web search for everything else. ⚠️ And
>   when the docs are silent, **measure it and record the measurement** — that is how we got
>   SudachiPy's 9 ms load and PGlite's Postgres version, and both changed a decision.
> - **Recommend an option**, don't lay out a neutral menu. I'll push back if I disagree.
> - **Find facts yourself; never ask me for them.**
> - **Write the ADR before the decision-log line**, and if a decision changes something already
>   written, **amend that document in the same commit** rather than leaving a note for later.
>
> Work on `develop`. Merge to `main` at a boundary.

---

## 3. What that session should produce

**Code.** The specifying is over.

- ~~`docs/agents/*.md` written, and the ticket location chosen.~~ **Done 2026-09-08.**
- ~~One spec on GitHub Issues, scoped to ADR 0001's first milestone.~~ **Done 2026-09-08 — issue #1.**
- ~~Tickets derived from the documents rather than invented, each naming its section.~~ **Done
  2026-09-08 — #2–#14.** The rule that produced them still stands for anything added later: a ticket
  with no citation is a ticket somebody made up.
- **Ticket #2 implemented**: the two toolchains, the five test tiers, six stub routes with their real
  route rules, and `11` §6.1's four `noScripts` assertions passing. ⚠️ **The dependency bot ships in
  the same commit as the first manifest** — `03` §13.5, six pins, each with a stated reason.
- `docs/00-status.md` updated — it is the memory, and it is the file the session after this one
  reads first.

---

## 4. What the documents already constrain about the order

**Ticket order is the tracker's job, not this file's.** But four constraints on it are already
decided and a session that discovers them late will re-order its own work:

- **ADR 0001 sets the first milestone, and it is not a feature.** The smallest loop is *Japanese, end
  to end, and instrumented*: paste two pages → ~30 vetted cards → studied on two consecutive days,
  emitting `S10`'s numbers. A vertical slice, not a horizontal layer.
- ⚠️ **The `noScripts` smoke test is worth running before much is built on it.** Verification §8
  established from `nitropack@2.13.4`'s source that the rule survives the Vercel preset — but
  **neither vendor documents this and nothing upstream tests it**, and ADR 0020's revisit condition
  is literally "`noScripts` proves not to survive the deployment target." It is now three assertions
  in `11` §6.1 rather than a `curl`, and it falsifies the assumption the whole rendering split rests
  on. Cheap, and cheapest first.
- **The first commit that adds a dependency manifest owes a bot in the same commit** (`03` §13.5) —
  a bot has nothing to read until a `package.json` or `requirements.txt` exists. **Six** pins a
  routine bump must not touch are listed there and in `CLAUDE.md` § Tooling state. ⚠️ **Corrected
  2026-09-09** — this said *five*; `03` §13.5 is the list and it has six.
- **Two experiments stay experiments** and neither blocks anything: one `psycopg.connect()` against
  the direct Neon endpoint, and whether an idle `LISTEN` defers Neon's scale-to-zero. ⚠️ A third
  joins them — **`S3`'s first real run of twenty notes**, which is an experiment rather than a test
  on purpose (ADR 0037).

---

## 5. Context the documents don't carry

- **The suite cannot tell you the thesis is failing, and that is the design** (ADR 0037). Green tests
  mean the instrument is built correctly and say nothing about what it will read. `S3`'s median and
  `S10`'s acceptance rate are answered by `/stats`, by a person, after twenty notes. **Do not add a
  threshold assertion later "to be safe"** — ADR 0018 walks the model down until acceptance rate
  degrades, so the number has to be free to fall.
- **A recommendation getting reversed is the process working.** Round 2 recommended TanStack Start
  and got Vue; recommended Render and got Vercel-plus-a-laptop. Both reversals were right and both
  are argued out in ADRs rather than quietly swapped. Expect this to keep happening.
- **This is a second project, not a replacement for one.** `lfca-lab` (the LFCA exam simulator) is
  mid-build and stays that way. It shares no code with Kioku. The three patterns worth stealing from
  it were taken and are decisions now, not borrowings — `CLAUDE.md` § Related, but separate.
- **The owner's working style:** a recommendation rather than a menu, tests before implementation
  where there is a natural seam, a spec and tickets before any work that spans sessions, and concise
  updates. ⚠️ The old version of this file said *one question at a time*; that rule was replaced on
  2026-09-06 and `CLAUDE.md` § Working agreements records the replacement.
- **The canvas is still the only copy of the six artboards**, linked from `05-design-system.md`
  line 3. It drew *Vet* and *Review* only. ⚠️ **Where `05` disagrees with it, `05` wins** (§9) — and
  it does disagree: ADR 0024 collapsed seven greys to four, so *Vet* reads heavier than the artboard.
  That is the decision, not drift. Do not restore the canvas values.
