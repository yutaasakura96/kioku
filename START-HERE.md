# Start here — the prompt for the first build session

**Rewritten 2026-09-08.** The previous version of this file opened the grilling session. That
grilling ran three rounds, closed on 2026-09-07, and produced eleven documents and 39 ADRs. It is
finished, and this file now opens the phase after it.

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

**The one thing that is not done:** the tracker. `/setup-matt-pocock-skills` writes `docs/agents/*.md`
and picks where tickets live. It was deferred on purpose — the grilling produces the material the
tickets are made from, and choosing GitHub Issues needs a remote, which now exists. **Running it is
the first action of the next session**, and §2's prompt says so.

⚠️ **Two things about the remote, because it is public.** `KIOKU_INVITED_EMAIL`, both Neon connection
strings and the model provider key stay out of the repository — `03` §13.1 lists where each lives.
And `03` §13.6 names the laptop as the security weak point rather than mitigating it: it holds the
direct connection string and the provider key at once. That is a known cost of ADR 0022's temporary
shape, not an oversight to fix in a ticket.

---

## 2. The prompt — paste this as the first message

> I'm picking up **Kioku** at the start of the build phase. Planning is finished: eleven documents,
> 39 ADRs, and an empty frontier. **Nothing is open and nothing needs deciding.**
>
> **Read `docs/00-status.md` first — all of it, including § Carrying — then `CLAUDE.md`, then
> `CONTEXT.md`.** Do not read the rest of `docs/` yet; there are eleven documents and you want the
> one for the thing you are building, which is what `CLAUDE.md` § Reading order is for.
>
> Then run `/setup-matt-pocock-skills`. It configures the tracker and picks where tickets live —
> I have a public GitHub remote, so GitHub Issues is available.
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

Not code. **A tracker, and tickets that trace to documents.**

- `docs/agents/*.md` written, and the ticket location chosen and recorded in `CLAUDE.md`
  § Tooling state — there is a marked place for the pointer.
- **Tickets derived from the documents rather than invented.** Every one should be able to name the
  section it comes from; a ticket with no citation is a ticket somebody made up, and after seven
  documents that is a signal, not a coincidence.
- `docs/00-status.md` updated — it is the memory, and it is the file the session after this one
  reads first.

Then, and only then: scaffolding.

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
  a bot has nothing to read until a `package.json` or `requirements.txt` exists. Five pins a routine
  bump must not touch are listed there and in `CLAUDE.md` § Tooling state.
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
