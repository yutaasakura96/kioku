# Start here — the prompt for the next session

This file exists so the next session can begin cold, with no memory of the conversation that
produced [`BRIEF.md`](BRIEF.md). Work through §1, then paste §2.

---

## 1. Before the prompt — one-time setup

Run these from inside this repo (`~/Documents/GitHub/kioku`).

**Enable the skills pack at project scope.** It is enabled in `lfca-lab` at *project* scope, which
means it is **not** enabled here. Nothing will work without this.

```bash
claude plugin enable mattpocock-skills --scope project
```

**Keep `superpowers` and `frontend-design` off.** Superpowers' `brainstorming` skill sets no
`disable-model-invocation` and will seize interviews that belong to mattpocock's question banks. The
two packs must not share a repo.

**The tracker is not configured yet.** `/setup-matt-pocock-skills` writes `docs/agents/*.md` and
picks where tickets live. It is worth running **after** the grilling, not before — the grilling
produces the material the tickets are made from, and choosing GitHub Issues needs a GitHub remote
that does not exist yet.

**Git state:** this repo is `git init`-ed, has no remote, no commits, and no `.gitignore`. Both
markdown files are untracked. Committing them is the first sensible act of the next session.

---

## 2. The prompt — paste this as the first message

> I'm starting a new project called **kioku** — a web app that builds spaced-repetition flashcard
> decks automatically from bulk source material (pasted text, documents, lists), classifies and tags
> the cards with an LLM, and is also the app I study them in. First subject is JLPT vocabulary;
> after that, CS / web dev / networking / cloud / certification terminology.
>
> **Read `BRIEF.md` in this repo first — all of it — before you say anything.**
>
> It is written to be grilled, not followed. Section 2 is settled and I don't want it re-opened.
> Section 4 is the agenda: twelve open questions, deliberately unresolved. Section 5 is the thesis
> and the assumption most likely to kill the project.
>
> Then run `/grill-with-docs` and take me through section 4. Rules for the grilling:
>
> - **One question at a time.** Wait for my answer before the next one.
> - **Recommend an option** rather than laying out a neutral menu — I'll push back if I disagree.
> - **Work in the order of section 4**, which is ordered by how much damage getting it wrong does —
>   unless you think that order is wrong, in which case say so first and tell me why.
> - **Don't verify from memory.** Anything about a library, an API, FSRS, pricing, or a Japanese
>   tokenizer gets checked against real docs (context7 for libraries, web search for the rest)
>   before it becomes a decision. If you can't verify it, say so.
> - **§4.4 has a factual claim to check early** — that JLPT stopped publishing official vocabulary
>   lists after the 2010 revision. It's load-bearing and I want it verified, not assumed.
>
> Don't write code, don't scaffold anything, and don't design a schema during the grilling. The
> output I want is decisions, ADRs and a glossary.

---

## 3. What the next session should produce

By the end of grilling, before any code exists:

- Section 4's questions **closed**, each with the option chosen and the ones rejected.
- **ADRs** for the ones that were genuinely contested — particularly §4.1 (note vs card), §4.2
  (how pluggable a subject is), §4.3 (how much the LLM is trusted) and §4.10 (what a deck is).
- A **glossary** — the vocabulary this project will use in code, commits and conversation. Kioku
  needs one badly: *note*, *card*, *deck*, *subject*, *source*, *ingestion*, *review*, *grade*,
  *provisional* and *known* all have loose everyday meanings and precise ones here.
- A **status file** the session after this one reads first, so a cleared context doesn't lose its
  bearings.

Then, and only then: PRD, tech design, tickets, code.

---

## 4. Context the brief doesn't carry

Things the previous conversation established that aren't in `BRIEF.md`:

- **This is a second project, not a replacement for one.** `lfca-lab` (the LFCA exam simulator) is
  mid-build and stays that way. Kioku is unrelated and shares nothing with it.
- **Patterns worth stealing from `lfca-lab`**, because they worked: pinning irreplaceable data by
  identity and guarding it in more than one place; keeping everything that decides a number in a
  pure, tested module; writing the decision log as things are decided rather than afterwards; and
  the write-immediately-with-an-outbox pattern (relevant to §4.7).
- **The owner's working style**, which the grilling should match: one question at a time, a
  recommendation rather than a menu, tests before implementation where there's a natural seam, and
  a spec and tickets before any work that spans sessions.
