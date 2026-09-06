# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is right now

**Kioku** (記憶 — memory) builds spaced-repetition flashcard decks automatically from bulk source
material and is also the app the decks are studied in. First subject is JLPT vocabulary; CS / web
dev / networking / cloud terminology follow.

**There is no code.** This repo is in the planning phase and contains only documents. There is no
build, no test suite, no dependency manifest, and no stack — so there are no commands to run.

## Hard constraint while planning

**Do not propose, assume, or discuss a tech stack, framework, database, hosting, or infrastructure.**
Those follow from the product decisions, not the other way round. `docs/01-project-brief.md` §4.12
exists and is deliberately last. It gets opened only after §4.1–§4.11 are closed.

Also, during grilling: no code, no scaffolding, no schema design. The output is decisions, ADRs and
a glossary.

## Reading order

1. `docs/00-status.md` — where the project actually is, what was decided, and what is next. The
   memory; nothing else is. `/project` and `/where-am-i` read it first and treat it as authoritative.
2. `START-HERE.md` — the cold-start handoff: setup checklist, the prompt that opens the grilling
   session, and context that didn't fit the brief.
3. `docs/01-project-brief.md` — the project brief. Read all of it before saying anything.

`docs/01-project-brief.md` is a **grilling target, not a specification**, and its own §0 says how to
treat it:

- **§2 is settled.** Challenge only with new information, never with a preference.
- **§4 is the agenda.** Twelve open, load-bearing questions, ordered by how much damage getting them
  wrong does. They get closed one at a time.
- **§5 is the thesis.** If grilling breaks §5, the project changes shape rather than gets built anyway.
- **§6 is out of scope for v1** — named so it can be pointed at rather than re-argued.

## Working agreements

- **One question at a time.** Wait for the answer before the next one.
- **Recommend an option**, don't lay out a neutral menu. Yuta pushes back if he disagrees.
- **Never verify from memory.** Anything about a library, an API, FSRS, pricing, or a Japanese
  tokenizer is checked against real docs — context7 for libraries, web search for everything else —
  before it becomes a decision. If it can't be verified, say so.
- **§4.4 carries a load-bearing factual claim** (that JLPT stopped publishing official vocabulary
  lists after the 2010 revision). Verify it early; the classification feature depends on it.
- Tests before implementation where there is a natural seam; a spec and tickets before any work that
  spans sessions.
- The decision log is written **as things are decided**, not reconstructed afterwards.

## Tooling state

- `mattpocock-skills` is enabled at **project** scope via the committed `.claude/settings.json`.
  The planned flow is `/grill-with-docs` first, then `/setup-matt-pocock-skills` — the tracker is
  configured *after* the grilling, because the grilling produces the material the tickets are made
  from.
- `superpowers` must stay disabled here. Its `brainstorming` skill sets no
  `disable-model-invocation` and its description reads `You MUST use this before any creative work`,
  so it will seize interviews that belong to mattpocock's question banks.
- `frontend-design` is disabled here too, in the same committed `.claude/settings.json`, **for a
  different reason** — the two are often conflated and the distinction matters. It runs no interview
  and collides with nothing; it is off because the visual direction for Vet and Review is decided and
  recorded, and a skill whose instruction is to take an aesthetic risk per brief would push toward
  re-deciding it during implementation. Re-enable it only for a screen or *subject* that genuinely
  needs a fresh direction rather than an extension of the existing one.

## Related, but separate

`lfca-lab` (the LFCA exam simulator) is a different mid-build project that shares no code with
Kioku. Patterns worth stealing from it, because they worked: pinning irreplaceable data by identity
and guarding it in more than one place; keeping everything that decides a number in a pure, tested
module; and the write-immediately-with-an-outbox pattern (relevant to `docs/01-project-brief.md`
§4.7).
