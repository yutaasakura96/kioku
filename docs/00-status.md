# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 1 — Brief + PRD. **Complete.** Phase 2 is next.
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

## Next

**Phase 2 — Design exploration.** Run `/design` and paste the prompt below verbatim.

**Explore only Vet and Review.** They are the two screens where the interaction *is* the product —
a one-keystroke accept and a sub-5-second median are design problems as much as engineering ones.
Ingest, Sources and Stats are generic and are not explored.

**Before pasting:** replace the bracketed references in the prompt's §Style with your own Mobbin
picks. The suggestions there are suggestions, not decisions.

**The rule that matters during Phase 2:** a pretty prototype will try to bend the requirements to
match it. `02-product-requirements.md` wins every time — if the design wants a different rule,
that is a new question for `/project`, not a quiet edit.

**What to bring back:** the canvas artifact's HTML, or screenshots. Phase 3 extracts real hex codes,
spacing, radii and component states from it into `05-design-system.md` and
`10-screen-specifications.md`. The prototype is a visual reference, never the design system doc.

Then run `/project`.

### The prompt — paste this into `/design`

> Design two screens for **Kioku**, a spaced-repetition app that generates Japanese vocabulary
> flashcards from pasted source material and is also where they are studied. One user, keyboard-first,
> desktop-first but usable on a phone. Read `docs/02-product-requirements.md` and `CONTEXT.md` in this
> repo before you start — the vocabulary there is exact and the acceptance criteria are pass-or-fail.
>
> **Six artboards, in this order:**
>
> 1. **Vet — populated.** One pending note, mid-queue.
> 2. **Vet — empty.** Nothing to vet.
> 3. **Review — card front.** The prompt side, mid-session.
> 4. **Review — card back.** Answer revealed, grading available.
> 5. **Review — session end.** The finish screen.
> 6. **Review — nothing due.** Everything accepted, nothing due yet.
>
> **Vet is the screen the product lives or dies on.** Its job is to let me accept a correct note in
> one keystroke and move on, at a median under five seconds. Design constraints, all load-bearing:
>
> - **Keyboard only.** Accept, reject and edit are each one key. No confirmation dialog, no focus
>   change, no pointer target. Show the keys — this is a screen used hundreds of times, so it should
>   teach itself once and then get out of the way.
> - **Fields are not equal.** A JLPT vocabulary note has `term`, `reading`, `meaning`,
>   `part_of_speech`, `level` and `example_sentence`. Most are dictionary lookups and need to be
>   *checkable at a glance without being read*. One or two are **judgement fields** — the model chose
>   or wrote them — and those are the only ones asking for a decision. That difference is the screen's
>   main hierarchy problem.
> - **Level is honest or it is wrong.** A level backed by a named authority and a level the model
>   estimated must differ by **one visible bit**, with the authority available on hover or inspection.
>   Not a caveat paragraph, not a tooltip on everything.
> - **Editing happens in place**, without leaving the queue or losing the keystroke rhythm.
> - Show queue position and how many are pending. Vetting is a queue, not a session — there is no
>   finish line here and the design should not imply one.
>
> **Review is the opposite mood.** Calm, one card, no chrome competing with it.
>
> - A card is term → reading + meaning. Japanese and English sit together, so the type has to handle
>   kanji, kana and Latin text at very different optical sizes without looking like two designs.
> - A session is a **fixed 20 cards and it ends**. Progress must be visible and finishable — the
>   thing being designed against is a queue with no visible end.
> - Grading is keyboard-first too.
> - There is a one-key **"this is wrong"** action that suspends the card and sends the note back to
>   vetting. It must be reachable and never fired by accident.
> - The end screen shows the session's numbers and offers one more session. It does not start one.
>
> **Style:** explore **2–3 distinct directions**, then stop and let me pick one before you refine
> anything. Suggested reference points, replace them with mine if I give you others: **[Linear or
> Raycast]** for keyboard-first density and quiet chrome, **[Duolingo]** for how a session announces
> its own end, **[Anki]** as an anti-reference — it is the thing being replaced and its screen is
> where the work goes to feel like work.
>
> **Do not design** Ingest, Sources or Stats. Do not invent features that are not in the PRD — if a
> layout seems to need one, say so instead of adding it.

## Blocked

Nothing.

**§4.12 (stack) is still shut** and belongs to Phase 4. Its inputs are fixed by the ADRs. Per
`CLAUDE.md`, do not open it without saying so first.

## Carrying

- **The ADRs are the decision log's long form.** `06-decision-log.md` indexes them; `adr/` holds the
  argument, the alternatives and the revisit condition. Add the ADR first, then the index line. Small
  decisions are recorded in the log in full instead — three PRD-level ones are, dated 2026-09-06.
- **Better Auth + Google OIDC is a stated preference for identity, and it is UNVERIFIED.** Recorded
  in ADR 0012 so it isn't lost. Per `CLAUDE.md` it gets checked against real documentation in Phase 4
  before it becomes a decision. Do not treat it as decided.
- **Phase 4 owes four Tier 2 docs**, all now triggered: 08 (auth — by ADR 0012), 09 (user flows) and
  10 (screen specs) — by five screens — and 11 (testing plan), since the PRD's S12 requires an
  exercised export test and S3 requires a measured median.
- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Checked
  against jlpt.jp's own FAQ, both language editions, 2026-09-03. Recorded in ADR 0005. Do not
  re-verify; do not re-litigate.
- **How a session runs here:** one question at a time, `❓ Q<n>` with a `➡️` recommendation rather
  than a neutral menu. Nothing verified from memory. Each closed question becomes an ADR or a
  decision-log entry, and new vocabulary lands in `CONTEXT.md` immediately.
- **No git remote yet.** `/setup-matt-pocock-skills` still belongs after planning; choosing GitHub
  Issues as the tracker needs that remote.
- **`frontend-design` is still active here**, contrary to `START-HERE.md` §1. It is `true` at *user*
  scope and this repo never turns it off; the fix is
  `"frontend-design@claude-plugins-official": false` in `.claude/settings.json`. (`superpowers`, the
  other half of that instruction, is correctly off.) **It is now arguably wanted** — Phase 2 is
  design work — so decide rather than disable by default.
- **Branches:** `main` is the default and where work normally happens; `develop` exists for
  development work.

## Skipped

Nothing. **Phases 2 and 3 are confirmed in scope** — decided 2026-09-06 alongside the five-screen
surface, and narrowed to Vet and Review.
