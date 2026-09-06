# Decision log

Append-only. The answer to every future "why is it like this?"

**This file is an index, not the record.** Each decision was argued out at the time and written up
as an ADR in [`adr/`](adr/) — the ADR carries the alternatives, the reasoning and the revisit
condition in full, and it is the authority. This page exists so one file answers "what has been
decided" without opening eleven.

## Entries

### [2026-09-03] The smallest loop is Japanese, end to end, and instrumented
Paste ~two pages of Japanese → ~30 vetted cards → studied on two consecutive days, emitting §5's
acceptance rate and time-to-first-review. → [ADR 0001](adr/0001-smallest-loop-is-japanese-end-to-end-and-instrumented.md)

### [2026-09-03] Note and card are separate entities
Anki's separation, not flat cards: vetting cost scales with notes, study volume scales with cards.
A card owns its own scheduling state. → [ADR 0002](adr/0002-note-and-card-are-separate-entities.md)

### [2026-09-03] A subject is a declared schema and a pipeline, living in the repo
One declaration drives the LLM's output contract, the note type's fields and the card templates, and
names the pipeline stages in order. Adding a subject is a code change, not a UI flow.
→ [ADR 0003](adr/0003-a-subject-is-a-declared-schema-and-a-pipeline.md)

### [2026-09-03] Trust follows provenance, not confidence
Trust is a property of where a field came from, recorded per field. Vetting is mandatory in v1.
→ [ADR 0004](adr/0004-trust-follows-provenance-not-confidence.md)

### [2026-09-03] A level is a set of attributed claims, and it only filters
The JLPT publishes no official vocabulary list, by design (verified 2026-09-03). "N3" is an
attributed claim, never a fact about a word. → [ADR 0005](adr/0005-a-level-is-a-set-of-attributed-claims.md)

### [2026-09-03] Note identity is a declared key; collision appends an occurrence
Keyed per subject alongside the schema — for JLPT vocabulary, *(dictionary-form term, reading)*.
Sense-level identity rejected. → [ADR 0006](adr/0006-note-identity-is-a-declared-key-and-collision-appends-an-occurrence.md)

### [2026-09-03] Prefetched sessions and a client-stamped grade outbox
Both of §4.7's options, because each is worthless alone. Online-only (§2.2) is not reopened.
→ [ADR 0007](adr/0007-prefetched-sessions-and-a-client-stamped-grade-outbox.md)

### [2026-09-03] v1 ships no §3 features, and sources stay durable
The scope cut. Sources remain durable and re-enterable.
→ [ADR 0008](adr/0008-v1-ships-no-section-3-features-and-sources-stay-durable.md)

### [2026-09-04] A deck is a saved query
Not an owner of cards. → [ADR 0009](adr/0009-a-deck-is-a-saved-query.md)

### [2026-09-04] Cheap filters run before expensive generation
Ingestion is a streaming background job with a replayable cache key.
→ [ADR 0010](adr/0010-cheap-filters-run-before-expensive-generation.md)

### [2026-09-04] Re-generation proposes; history is never destroyed
Review history is the one thing in the system that cannot be regenerated (§2.4).
→ [ADR 0011](adr/0011-re-generation-proposes-and-history-is-never-destroyed.md)

### [2026-09-06] Identity is invite-only from v1, and personal data carries an owner
One invited user, no self-registration. Entities are labelled shared or personal, and personal ones
carry an owner from the first row written — because review history (§2.4) cannot be attributed
retroactively. Mechanism (Better Auth + Google OIDC) is a parked, unverified preference for Phase 4.
→ [ADR 0012](adr/0012-identity-is-invite-only-and-personal-data-carries-an-owner.md)

### [2026-09-06] Vetting speed is a measured criterion, not an aspiration
**Decision:** accepting an unedited *note* is exactly one keystroke, and median *seconds-per-note*
must be under 5 seconds over a run of at least 20. Recorded per note from day one, alongside
acceptance rate.
**Alternatives considered:** §4.3's own three-second figure — rejected as glance speed, not read
speed, for a note carrying a reading, a meaning and an example sentence. Leaving it unmeasured —
rejected because a 95% acceptance rate at 30 seconds per note is a failed thesis that acceptance
rate alone would score as a success.
**Reason:** §5's assumption is about time, and nothing else in the instrument measures time.
**Revisit if:** a second card template ships and vetting starts covering more fields per note.

### [2026-09-06] A session is one knob: a fixed card count, default 20
**Decision:** *sessions* are a fixed number of *cards*, reader-settable, composed due-first with new
*cards* filling the remainder, snapshotted at the start, ending in a screen. Starting another is a
deliberate action. No ahead-of-schedule study in v1.
**Alternatives considered:** a time budget — rejected as a worse fit for a prefetch bound. A separate
per-day new-card cap — deferred (PRD L4): at thirty cards it protects nothing and costs a setting.
**Reason:** ADR 0007 bounded the prefetch by session shape and left the size open; this is that size.
**Revisit if:** the pool passes a few hundred cards, at which point the new-card cap is the first
thing to add.

### [2026-09-06] The v1 surface is five screens
**Decision:** Ingest, Vet, Review, Sources, Stats. No home screen, no settings screen, no card browser.
**Alternatives considered:** a card browser, which Anki makes central — rejected because a browser
without a query language is a list, and the query language is deck work (ADR 0009), which is v2.
**Reason:** Sources answers "where did this come from"; Vet answers "what needs me". Nothing in v1
needs a third way to look at cards.
**Revisit if:** saved queries ship — the browser is the query language's screen, and arrives with it.
**Consequence:** triggers docs 09 and 10 in Phase 4, and confirms Phases 2 and 3 apply to Vet and
Review.

### [2026-09-06] Vet and Review take the paper direction, and provenance is never hidden behind a hover
**Decision:** of three explored directions, the built one is warm paper with Mincho for Japanese and
a serif for English. *Vetting*'s hierarchy comes from spatial zoning — *term*, part of speech and
*level* compress into one horizontal strip above a rule, and only the *judgement fields* sit below
it at reading size. The *level*'s honesty bit is a filled marker for a named *authority* and a
hollow one for a model estimate, with the *level claims* set inline rather than behind a hover.
*Review* carries no screen label in any of its four states.
**Alternatives considered:** a dark, dense terminal-style screen — fastest to scan and the best at
absorbing a seventh field, rejected because the *meaning* is the field that costs the decision and
it read worst there, and because it is the closest of the three to the thing being replaced. A
left-gutter direction naming every field's *provenance* — the tightest single mechanism, rejected
for costing 168px of width and reading as a tool rather than a reading surface.
**Reason:** the two constraints that decide the screen are S4's hierarchy and ADR 0005's one visible
bit. Zoning answers the first without spending colour on it; inline claims answer the second without
spending an interaction, which is what *vetting* has least of.
**Revisit if:** measured median *seconds-per-note* misses 5s and eye travel rather than reading time
is the cause — the dense direction is the fallback and is kept on the canvas.
**Consequence:** four things the design needed and the PRD does not decide are now open, below.

### [2026-09-06] Phase 4 owns the screen specifications, not Phase 3
**Decision:** `10-screen-specifications.md` is written in Phase 4, alongside `09-user-flows.md`.
Phase 3 ships `05-design-system.md` alone.
**Alternatives considered:** Phase 3 owning it, which is what the `/project` skill's own phase table
says — rejected on three counts. It is blocked on navigation, and closing a PRD gap is an interview,
which is Phase 4's mode rather than Phase 3's extraction. Only two of the five screens were ever
drawn, so Phase 3 could specify Vet and Review and would have to invent Ingest, Sources and Stats.
And it is coupled to 09, which is already Phase 4's — splitting them means writing 10 twice.
**Reason:** this file recorded the conflict in its own history and required it settled before either
phase started. Extraction cannot produce a navigation model.
**Consequence:** Phase 4 carries five docs (03, 04, 08, 09, 10, 11) rather than four. Phase 3 still
pays into 10 by giving it the vocabulary to be written in.

### [2026-09-06] The design system collapses two hand-set duplicates from the canvas
**Decision:** `05-design-system.md` departs from the drawing in exactly two places. Rules on the app
ground become one token, `#e2d9cd`, retiring `#e6ddd2` from that job — it differed by 4/255, or 1.21
against 1.26 in contrast, and kept its separate role as the empty progress tick. The inline `·`
separator becomes one value, `#ddd3c6`, retiring `#c9bfae` and `#d3c9bb`.
**Alternatives considered:** copying all five values through, which the status file explicitly warned
against — rejected because a token set that encodes hand-setting accidents stops being a system the
first time someone has to choose between two of them. Collapsing the *two* rule greys into one
across every surface — rejected: `#ece3d7` on the raised card measures 1.25 against its ground where
`#e2d9cd` measures 1.26 against its own, so the pair is one perceived weight tuned twice, and that is
a real distinction rather than an accident.
**Reason:** Phase 3 extracts rather than transcribes. The test applied was whether a value carries a
role no other value carries.
**Revisit if:** a third surface appears, at which point the rule tokens are per-surface by rule and
want naming that says so.

### [2026-09-06] Three screens are places; Vet and Review are modes
Ingest, Sources and Stats carry a persistent shell and are server-rendered; *Vet* and *Review*
replace it entirely and are client-owned, left with `Esc`. Closes the navigation gap.
→ [ADR 0013](adr/0013-three-screens-are-places-and-two-are-modes.md)

### [2026-09-06] A session survives a reload
Snapshot and *grade* outbox both persist to `localStorage`; reloading mid-*session* resumes. A
bounded cache, not a replica — §2.2 is not reopened.
→ [ADR 0014](adr/0014-the-session-survives-a-reload.md)

### [2026-09-06] Ingestion runs in an always-on worker, driven by a job table
Separate process, same repo, reading the database directly. Always-on because
*time-to-first-review* is a measured number and cron lag would contaminate it.
→ [ADR 0015](adr/0015-ingestion-runs-in-an-always-on-worker-driven-by-a-job-table.md)

### [2026-09-06] Four grades, and no same-day relearning
FSRS's canonical `1 Again / 2 Hard / 3 Good / 4 Easy`; `enable_short_term` off so a *session* stays
a fixed twenty. Recorded as a known deviation from Anki with a real learning cost.
→ [ADR 0016](adr/0016-four-grades-and-no-same-day-relearning.md)

### [2026-09-06] Better Auth with Google OIDC, and two independent refusals
ADR 0012's parked preference, verified and promoted. `validateUserInfo` fires on sign-in with the
fresh provider profile; `disableSignUp` is the second refusal.
→ [ADR 0017](adr/0017-better-auth-with-two-independent-refusals.md)

### [2026-09-06] The model provider is a boundary; acceptance rate picks the winner
No published benchmark tests Japanese structured extraction, so the choice is made cheap to change.
Default `claude-sonnet-5`, ceiling probe `claude-opus-5`, walked **down** toward `gpt-5.6-luna` —
starting cheap would confound *acceptance rate*, which is §5's whole instrument.
→ [ADR 0018](adr/0018-the-model-provider-is-a-boundary-and-acceptance-rate-picks-the-winner.md)

### [2026-09-06] Sudachi is the tokeniser, and it chooses the worker's language
Only option giving dictionary form, reading *and* a normalized form — which is ADR 0006's dedup key.
Worker is Python. `kuromoji`'s dictionary has been frozen since 2007.
→ [ADR 0019](adr/0019-sudachi-is-the-tokeniser-and-it-chooses-the-worker-s-language.md)

### [2026-09-06] Nuxt is the framework, because a route can ship no JavaScript
Of seven TypeScript frameworks, only three document a zero-JS route and only four a per-route SSR
switch. Nuxt is in both sets, so ADR 0013's split becomes a build property rather than a discipline.
⚠️ Nuxt 5 lands Q4 2026 and `routeRules` is experimental — both adopted knowingly.
→ [ADR 0020](adr/0020-nuxt-is-the-framework-because-a-route-can-ship-no-javascript.md)

### [2026-09-06] Postgres is forced by two writing processes, not chosen
SQLite's own WAL docs require all processes on one host; Turso's embedded replicas are read-only.
ADR 0015 + ADR 0019 already made two writers in two languages, which decided storage before taste
entered. Drizzle over Kysely, because `lfca-lab` already pairs it with Better Auth.
→ [ADR 0021](adr/0021-postgres-is-forced-by-two-writers-not-chosen.md)

### [2026-09-06] The first deployment is Vercel, Neon and a laptop — deliberately temporary
Vercel cannot host a resident worker (300s ceiling, no always-on primitive), so *ingestion* runs on
the developer's machine for now. Neon Free's non-disableable scale-to-zero decides the connection
rule: pooled for the app, direct for the worker, never a permanent daemon. S3 is the answer for
blobs and is decided-but-not-built. → [ADR 0022](adr/0022-the-first-deployment-is-deliberately-temporary.md)

### [2026-09-06] Space is the forward action, and Z is the confirm
`space` accept, `E` edit, `R` reject, `Z` undo, `Esc` leave at *vetting*; `space` reveal, `1`-`4`
grade, `X` flag at *review*. One decision, not two: ADR 0006 makes rejection permanent, so rejection
gets an undo instead of a confirmation dialog — PRD S3 measures one keystroke per note and a dialog
taxes every rejection to protect a few. The undo horizon is the session, and that limit is real.
→ [ADR 0023](adr/0023-space-is-the-forward-action-and-z-is-the-confirm.md)

### [2026-09-06] Four greys that pass, not seven that do not
The ink ramp collapses to `#1d1a16` 15.67 / `#4c463d` 8.44 / `#60584d` 6.33 / `#776d5f` 4.59, all
meeting WCAG AA. Measured: only 3.6 lightness points separate `--k-ink-value` from the 4.5:1 floor,
so seven greys cannot all pass and stay distinguishable. Every eyebrow moves 2.25 → 4.59 and *Vet*
reads heavier than the artboard. → [ADR 0024](adr/0024-four-greys-that-pass-not-seven-that-do-not.md)

### [2026-09-06] One focus ring, and the modes do not draw it
`--k-focus` = the accent, 2px outline at 2px offset, `:focus-visible` only, never animated. *Vet* and
*Review* hold focus on the container and draw nothing, because focus cannot move within either
screen; *Vet*'s edit state is the one exception. Hover, active, disabled, loading and error stay
undrawn deliberately. → [ADR 0025](adr/0025-one-focus-ring-and-the-modes-do-not-draw-it.md)

### [2026-09-06] The spacing scale is regularised to ten 4pt steps

**Decision.** `4 8 12 16 20 28 32 40 44 52`. The canvas's nineteen hand-set values snap onto it with
no value moving more than 2px, and §5's meaning table survives intact. New values are added to the
scale, never hand-set beside it.

**Alternatives considered.** Leaving it hand-set, on the grounds that the drawing is the authority —
rejected because three screens are still undrawn and each would multiply the irregularity. A stricter
8pt grid — rejected because it moves values further than 2px and would break the 44/52 pair that
makes *Vet*'s zoning read.

**Reason.** This is the cheapest it will ever be. It stops being reversible once
`10-screen-specifications.md` is written against whatever exists.

**Revisit if.** A screen needs a gap the scale cannot express — in which case the step is added to
the scale, not set beside it.

### [2026-09-06] Review is the only screen that gets a phone layout
v1 draws a phone layout for *Review* only; Ingest, Sources and Stats reflow; *Vet* says vetting needs
a keyboard rather than degrading. Resolving *Review*'s missing `Esc` changes every *mode*: they now
carry a persistent **Done** control on every viewport, so desktop gains a visible exit it always
needed. `CONTEXT.md`'s definition of *mode* moved with it.
→ [ADR 0026](adr/0026-review-is-the-only-screen-that-gets-a-phone-layout.md)

### [2026-09-06] psycopg 3 is the driver, and Neon's table is not a support list
`psycopg[binary]` >= 3.2.4 on the direct endpoint, autocommit, the blocking `notifies()` generator.
The objection was based on the wrong page: Neon's table is a SNI-compatibility list for drivers that
do **not** use libpq, and psycopg is covered by the sentence above it. The version floor is a reason,
not a pin — earlier versions silently lost notifications arriving during startup.
→ [ADR 0027](adr/0027-psycopg-3-is-the-driver-and-neons-table-is-not-a-support-list.md)

### [2026-09-06] The job table is the truth, and NOTIFY is only an optimisation
Neon Free cannot disable scale-to-zero, and a suspended compute destroys the listener — notifications
fired while the worker is away are gone, not delayed. The worker re-`LISTEN`s then polls for
unclaimed work on every reconnect, in that order, so correctness never depends on a notification.
Same shape as ADR 0007's outbox, a third time.
→ [ADR 0028](adr/0028-the-job-table-is-the-truth-and-notify-is-only-an-optimisation.md)

### [2026-09-06] The dictionary version joins the ingestion cache key

**Decision.** ADR 0010's cache key becomes **(content-chunk hash, dictionary version, prompt
version, model id)**. `SudachiDict-core` is pinned at `20260723`, and moving it is a reviewed data
event rather than a dependency bump.

**Alternatives considered.** Leaving the key as ADR 0010 wrote it — rejected: a dictionary upgrade
changes tokenisation, which changes candidate extraction, which changes `normalized_form`, which is
half of ADR 0006's *identity key*. Under the old key that upgrade silently serves cached results
computed against a different tokenisation of the same text. Pinning the dictionary and leaving the
key alone — rejected as a rule with nothing enforcing it; the key is where an input becomes visible.

**Reason.** ADR 0010's key exists to make the pipeline replayable, and a key that omits an input
that changes the output does not.

**Revisit if.** A subject ships whose pipeline names no tokenisation stage — the field is then inert
for that subject rather than wrong.

### [2026-09-06] The subject declaration is language-neutral data, owned by neither toolchain

**Decision.** A *subject* is declared as JSON under `subjects/`, one file per subject. TypeScript
derives its types and its runtime validator from it; Python reads the same file for its stage list
and field names. A test on each side asserts its view matches the file, and the field lists are
compared across the two.

**Alternatives considered.** TypeScript owning the declaration and generating a Python artifact —
rejected because it makes the worker a downstream consumer of a build step in the other toolchain,
which is a build-order dependency across ADR 0019's deliberate boundary. Two declarations kept in
step by discipline — rejected: that is exactly the drift ADR 0003 exists to design out. YAML —
rejected because JSON parses on both sides with nothing installed.

**Reason.** ADR 0003 made one declaration with three consumers; ADR 0019 then put one consumer in
another language. The failure ADR 0003 prevents returns in a form no compiler catches, so the guard
has to be a test.

**Revisit if.** A second subject makes the declarations large enough that JSON stops being
writable by hand — at which point the source format changes and the neutrality rule does not.

### [2026-09-06] A client-stamped grade is validated on replay

**Decision.** The server rejects a replayed *grade* stamped in the future beyond a small skew
allowance, and one stamped before its own *session* snapshot was taken. Rejections are surfaced to
the reader, not dropped. Everything between those bounds is accepted exactly as stamped.

**Alternatives considered.** Accepting every stamp, which is the literal reading of ADR 0007 —
rejected: a wrong system clock writes review history that FSRS cannot be told to ignore, and §2.4
makes that the one thing that cannot be regenerated. Server-stamping on receipt — rejected outright;
ADR 0007 already argued that one and it is the failure §2.3 chose FSRS to avoid.

**Reason.** ADR 0007 decided *that* the client stamps the *grade* and never said what the server
does with a stamp it cannot trust. The outbox is the one place client-authored data becomes
permanent history.

**Revisit if.** A second device is ever supported — the snapshot bound assumes one session at a
time, which is ADR 0007's stated boundary.

### [2026-09-06] Drizzle owns every migration; the worker never issues DDL

**Decision.** All schema changes go through Drizzle from the TypeScript side. The Python worker
reads and writes rows and never alters structure. Better Auth's tables are generated
(`npx auth@latest generate`) and land in the same migration flow.

**Alternatives considered.** The worker owning the tables it alone uses — the job table, chunk
progress — rejected because "what shape is this table" would have two answers in two toolchains,
and the job table is read by both. Better Auth's own migrator — ruled out rather than rejected:
`getMigrations` does not work with the Drizzle adapter.

**Reason.** ADR 0019 accepted a two-toolchain tax knowingly. Two migration owners is the version of
that tax that corrupts data rather than costing time.

**Revisit if.** The worker is ever split into its own deploy unit with tables no TypeScript code
reads — which is ADR 0015's second-worker condition, not a schema question.

## Still open

- ~~**§4.12 — the stack.**~~ **Closed 2026-09-06** — ADRs 0020, 0021, 0022 settle the framework, the
  database and the host. The brief's last open question is done.
- ~~**Key assignments** · **colour contrast in the ink ramp** · **a focus state** · **the spacing
  scale** · **the phone layout**.~~ **All closed 2026-09-06** in Round 3 — ADRs 0023, 0024, 0025,
  0026 and the spacing entry above.
- ~~**Which Python driver.**~~ **Closed 2026-09-06** — ADR 0027. The objection rested on a
  misread page.
- ~~**Whether `noScripts` survives Vercel.**~~ **Answered 2026-09-06** —
  `phase-4-verification.md` §8. It survives, established from `nitropack@2.13.4`'s source rather than
  from documentation, which neither vendor provides. ADR 0020's revisit condition is amended.
- **The note's storage shape.** ADR 0021 carries a recommendation, not a decision: `notes.fields` as
  `jsonb` with a relational `note_field_provenance` table. The honest counter (both-as-blobs; the
  row-lock argument is weak at one user) is recorded there. **Deliberately deferred again in Round 3
  — closes in `04-database-schema.md`**, where the surrounding columns and delete behaviour make the
  choice answerable against real queries rather than in the abstract.

### Carried into implementation, not decisions

- **The `noScripts` smoke test**, ~15 minutes on the first deploy. Nothing upstream tests the Nuxt
  4.5.2 + Vercel combination, so this guards a regression rather than an unknown.
- **Whether an idle `LISTEN` connection defers Neon's scale-to-zero.** Neon is silent, and
  `00-status.md` asserted an answer it cannot support. ADR 0028 is correct either way; the experiment
  settles the cost question only.
- **Five interaction states** — hover, active, disabled, loading, error — and the **Done** control's
  geometry, both for `10-screen-specifications.md`.

## Adding an entry

Write the ADR first — that is where the argument lives — then add a line here. Keep the format:

```
### [YYYY-MM-DD] Short decision title
One or two sentences: what was chosen, and the deciding reason.
→ [ADR NNNN](adr/NNNN-slug.md)
```

If a decision is small enough not to warrant an ADR, record it here in full instead, with
**Decision / Alternatives considered / Reason / Revisit if**.
