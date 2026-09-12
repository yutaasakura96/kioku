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

### [2026-09-06] The note's fields are a blob and its provenance is not
`notes.fields` is one `jsonb` document; `note_field_provenance` is relational, keyed
`(note_id, field_name)`. Split along PostgreSQL §8.14.2's line — but decided by the cross-note
aggregation ADR 0018 committed the project to running, not by the row-lock argument ADR 0021
correctly called weak at one reader. **This closes the last deferred question.**
→ [ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md)

### [2026-09-06] The owner foreign key points at Better Auth's user.id, and it restricts

**Decision.** Every *personal* entity's `owner_id` is `text` referencing `auth."user".id` directly,
with **`ON DELETE RESTRICT`**. No app-level `reader` table. Better Auth's four tables live in a
`auth` Postgres schema and keep their own cascades.

**Alternatives considered.** An app-level `reader` table with a foreign key onto `user.id` — the
usual defence against an auth library owning an identity column. Rejected: at one row it is an
indirection whose only job is to be indirect, it adds a join to every personal query, and the
rename it protects against is a Drizzle migration either way, because **nothing but our own
migration ever touches that table** (`getMigrations` does not work with the Drizzle adapter).

**Reason.** ⚠️ The load-bearing half is `RESTRICT`, and it is a correction rather than a default:
Better Auth's generated Drizzle schema wires **every** child of `user` with `onDelete: "cascade"`
(verification §10.2). Copying that convention onto *personal* entities would make deleting one row
destroy every *scheduling epoch* and *review log* under it — `03` §13.6's worst case, arriving as a
copied ORM default. `RESTRICT` means the `user` row cannot be deleted while history references it,
which is the second of ADR 0011's two independent guards. The rule is not "no cascades": Better
Auth's own children *should* cascade, because a sign-in regenerates them.

**Revisit if.** A second reader is invited, which is ADR 0012's own revisit condition — at that
point the shared/*personal* label stops being a label and starts being enforced.

### [2026-09-06] The session is read in server middleware, not by the client
One Nitro middleware resolves the session on every request into `event.context.session`; the three
*places* read it from the request event and the two *modes* read it in the browser. Better Auth's
documented Nuxt fix, `<ClientOnly>`, renders **nothing** on a `noScripts` route — which is all three
*places*. → [ADR 0030](adr/0030-the-session-is-read-in-server-middleware-and-a-place-never-reads-it-from-the-client.md)

### [2026-09-06] The invited-account allowlist is one environment variable, and it has no empty case

**Decision.** `KIOKU_INVITED_EMAIL`, a single address, read where the `betterAuth()` instance is
constructed and compared unconditionally and case-insensitively inside `validateUserInfo`. Not a repo
constant, not a table. The process refuses to start if it is unset.

**Alternatives considered.** A repo constant — rejected because `03` §13.4 already classifies the
reader's email as sensitive data, and **there is no git remote yet**, so the decision to commit a
personal address is made once, permanently, before the repository has an audience. A one-row table —
rejected as premature and as unbootstrappable: **there is no admin surface to insert the first row,
and there must not be**, because an in-app path that adds an allowed account is self-registration
with an extra step (ADR 0012).

**Reason.** ⚠️ The load-bearing half is the *shape*, not the location. A list-shaped allowlist —
`if (allowed.length && !allowed.includes(email))` — is the natural way to write this and it **admits
everyone when the list is empty**. A single constant has no empty case. For the same reason the
comparison does not narrow on the provider first, which is what Better Auth's own documented example
does (verification §11.5) and which fails open the day a second provider is added.

**Revisit if.** A second reader is invited — ADR 0017's own condition, and the point at which the
table becomes the right shape. The trigger is the second reader, not discomfort with an environment
variable.

### [2026-09-06] The session cookie is `sameSite: "lax"` and `path: "/"`, written out rather than inherited

**Decision.** `advanced.defaultCookieAttributes: { sameSite: "lax", path: "/", httpOnly: true }`.
`useSecureCookies` is deliberately left unset, and `session.cookieCache` is deliberately off.

**Alternatives considered.** `sameSite: "strict"` globally — **it breaks sign-in.**
`defaultCookieAttributes` applies to every cookie Better Auth mints, the OAuth state cookie included,
and a `Strict` cookie is not sent on the top-level cross-site GET redirect back from Google; Better
Auth's own `state_security_mismatch` page names SameSite as a cause (verification §11.2). `Strict`
scoped to `session_token` alone — rejected on a second, independent reason: the three *places* are
server-rendered documents whose session is read on the server, so arriving from any external link
would render the signed-out page.

**Reason.** Verification §2.2 recorded both attributes as unverified defaults; §11.1 settles them
from the security reference and from `createCookieGetter`, and these values **match** the library.
They are still written out, because a hard default inside a source file is a weaker contract than a
value in our own configuration — an upstream change then shows as a diff rather than as behaviour.
`useSecureCookies` is left to resolve because production is HTTPS and the laptop is not (ADR 0022);
`cookieCache` is off because it would keep a revoked session alive for its window, which is the
property database sessions were chosen for.

**Revisit if.** A second origin ever needs the cookie — a subdomain, or a preview deployment that
signs in — at which point `crossSubDomainCookies` and the preview-deploy exclusion in
`08-authentication.md` §10 are reopened together.

### [2026-09-07] The landing route is Ingest, and never a decision about data
`/` is Ingest, permanently, and it inspects nothing. `08` set `callbackURL: "/"` without saying which
screen that names; PRD §4's one sentence about a landing screen names Ingest, and a chooser would
have to land in a *mode* to be worth building.
→ [ADR 0031](adr/0031-the-landing-route-is-ingest-and-never-a-decision-about-data.md)

### [2026-09-07] A mode is entered from a start control, and Done is the only way out
The shell navigates to the three *places* and never to a *mode*; *Vet* and *Review* are entered from
a start control carrying its own count, never disabled. ⚠️ The exit must be `external`, or Nuxt
client-renders a *place* into a hydrated page. This is also what actually closes ADR 0013's
empty-*Vet* gap, which ADR 0013 could not.
→ [ADR 0032](adr/0032-a-mode-is-entered-from-a-start-control-and-done-is-the-only-way-out.md)

### [2026-09-07] Done in Vet ends the run and spends the undo; Done in Review spends nothing
One control, two consequences: Done on *Vet* sets `vetting_session.ended_at` and makes every
*rejection* permanent, so it asks once when the run holds a rejection. `Z` works up to the answer.
⚠️ `Z` on an acceptance un-mints a *card*, which `04` §9.1 must except.
→ [ADR 0033](adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md)

### [2026-09-07] `S12`'s export is triggered from Stats, as a plain link

**Decision.** `/stats` carries `<a href="/api/export">`. The route answers *notes*, *cards*, *grades*
and every *scheduling epoch* including superseded ones as JSON, with `Content-Disposition:
attachment`. No screen elsewhere offers it.

**Alternatives considered.** *Sources* — rejected: it is scoped to one *source*, and the export is
about everything. *Ingest* — rejected: it is the way in. A control inside *Review*'s end screen —
rejected twice over: a *mode* has no room for an action unrelated to the *session*, and a download
started from a client-owned screen needs machinery that a link does not.

**Reason.** A link that downloads is the one write-shaped action a `noScripts` *place* can perform
with no mechanism at all, so the export lives on a *place* for free and would cost something in a
*mode*. And `03` §13.6 makes this the backup — Neon Free's six hours of instant restore is not a
backup for review history — which puts it next to the numbers the reader already checks.

**Revisit if.** ⚠️ The `GET` becomes a problem. `SameSite=Lax` sends the cookie on a cross-site
top-level `GET` (verification §12.2), so a malicious link can start the download, though it cannot
read the response. The fix is a `POST` with a form token, at which point the export stops being a
plain link.

### [2026-09-07] The grade labels name recall, because they cannot name a time
`1 Forgot · 2 Hard · 3 Good · 4 Easy`. `Again` does not survive: ADR 0016 turned same-day relearning
off, and with `enable_short_term: false` the soonest a graded *card* returns is tomorrow (verification
§13.1). The count, the digits and the FSRS `Rating` mapping are untouched.
→ [ADR 0034](adr/0034-the-grade-labels-name-recall-because-they-cannot-name-a-time.md)

### [2026-09-07] Five interaction states is not a set, and a screen with no client has three
Ingest, Sources and Stats have hover, active and focus; their loading state is the browser's and
their error state is a re-rendered document. *Vet* and *Review* have all five for real. **Nothing in
v1 is disabled**, so `--k-disabled` is not a token.
→ [ADR 0035](adr/0035-five-interaction-states-is-not-a-set-and-three-screens-have-three.md)

### [2026-09-07] Grade by swipe is refused, because it could only ever have been additive
SC 2.5.1 Pointer Gestures is **Level A** and SC 2.5.7 Dragging Movements is **Level AA**
(verification §13.2), so a gesture owes a single-pointer equivalent — the four controls it was meant
to replace. ADR 0026 deferred this here by name; it is answered, not deferred again.
→ [ADR 0036](adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md)

### [2026-09-07] The Done cluster is a key cap and its label, on both modes
**Decision.** Done is the footer legend's own cap-plus-label component (`05` §7) at the right end of
the mode's header: an `Esc` cap in the secondary state, `8px`, then `Done` at 15px
`--k-ink-secondary`, `min-height: 32px`. On *Review* the header becomes a three-column grid — a left
spacer the width of the cluster, the rail, the cluster — so the *progress rail* **stays optically
centred** above the 760px card, and its width becomes `min(620px, 100% − 2 × (cluster + 28px))`.
On the phone the cap is dropped and the label alone is the control.

**Alternatives considered.** *The primary control* — rejected: `--k-ink-ground` is the loudest
treatment in the system and would make the exit the loudest thing on a screen whose hierarchy is
entirely grey. *Done at the left, rail right-aligned* — rejected: the rail is the header of a centred
card and cannot sit off-axis. *"Done · 3 permanent" as a variable-width label* — ADR 0033 already
rejected it, and it is worse here, because a variable width breaks the symmetric spacer.

**Reason.** The control's job is to name the key as much as to be a target. Desktop keeps `Esc` and
*gains* a visible way out (ADR 0026), so a control that does not say `Esc` teaches the keyboard
reader nothing — and on the phone, where the key does not exist, the cap would be naming a key that
does nothing. `10-screen-specifications.md` §4.3 and §5.2.

**Revisit if.** A mode ever carries a second header control, at which point the spacer stops being a
single width and the grid has to become a real three-column layout rather than a trick.

### [2026-09-07] The start block is the quiet affordance, minus its arrow
**Decision.** ADR 0032 required the start block to read as different from the nav beside it. The
distinction is that **the nav is text and the start block is bounded**: the two start controls are
`05` §7's quiet affordance — `--k-raised`, `1px --k-border-control`, `--k-radius-control`,
`13px 20px`, a 17px `--k-ink` label — carrying their count in the *Vet* chrome bar's own treatment
(figure `--k-ink`, word `--k-ink-secondary`, both 12px mono). ⚠️ **The accent `→` is dropped.** It
sits in the page body as the first block, not in the bar, with `as of this page load` beneath it in
13px italic.

**Alternatives considered.** *A second nav row* — rejected by ADR 0032 itself: a row that means two
different things depending on which item is clicked is a row that lies. *Elevation* — rejected: `05`
§6 elevates one element and says so. *Accent* — rejected: `05` §2 spends the accent on where you are
and what costs you the decision, and a start control is neither.

**Reason.** The affordance already exists, was drawn, and already means "the way on from here" — it
is the same component ADR 0032 puts on empty *Vet*. The arrow is dropped because the affordance is
the whole sentence when it is alone on a screen; two of them side by side above a form is decoration,
and `05` §2 says the accent is never that. The block sits in the page body because `09` §2 makes its
figures as-of-page-load, and a page-load-stamped figure belongs on the page rather than in the chrome
that frames it. `10-screen-specifications.md` §3.2.

**Revisit if.** ADR 0032's own revisit condition fires — the counts turn out to be what the reader
reads on every load — at which point the question is Stats moving into the shell, and the block's
treatment follows that rather than leading it.

### [2026-09-07] ⚠️ ADR 0025's exception list grows: a mode rings where it has stopped
**Decision.** *Review*'s end screen carries the *session*-size knob, "Start another session" and Done
— three focusable elements — and both of *Review*'s non-terminal empty states carry the knob and
Done. **Those three screens draw the focus ring.** The running mode still does not. The rule that
covers every case: *a mode draws no ring while it is running, and draws it on the screens where it
has stopped.* The token and its geometry are unchanged.

**Alternatives considered.** *Keep the knob off the end screen* — rejected: `09` §4.7 put it there
because a knob that appeared mid-session would be lying about a snapshotted *session*. *Ring
everything in the modes* — rejected for ADR 0025's own reason: focus never moves during the running
mode, so a ring would mark a position that cannot change.

**Reason.** ADR 0025 named this trigger and named the answer — "Revisit if a screen appears with more
than one focusable element inside a mode — at which point the ring stops being decoration there and
the exception list grows past *Vet*'s edit state." This is that ADR working as designed, not a
reversal, and the generalised rule is what ADR 0025 was reaching for: *Vet*'s edit state and
*Review*'s terminal screens are the same case. ADR 0025 is amended in place;
`10-screen-specifications.md` §4.2 has the table.

**Revisit if.** A *running* mode gains a focusable element — which would be a genuine reversal of
ADR 0025 rather than an extension of it, and belongs in a new ADR.

### [2026-09-07] `05` §5's three ambiguous spacing values — two resolved, one dissolved
**Decision.** `14 → 12` (the *judgement field*'s eyebrow-to-value gap). `30 → 28` where it is the
*Review* card's *meaning*-to-example gap; **`30` stays** as the *facts strip*'s divider padding.
**`10` was never a gap** — it is key-cap padding.

**Reason.** `05` §5 snapped nineteen hand-set values onto ten steps and left these three "exactly 2px
from two steps", each to be decided against a screen. Two are settled by `05` §5's own meanings —
"8–12px, inside one thing, a label and its value" is an eyebrow and its value; "28–32px, between two
facts that are peers" is the *meaning* and the example. The third is settled by `05` §5's own scope
line, which puts control padding outside the scale. **Nothing on the scale moved.**
`10-screen-specifications.md` §2.3.

### [2026-09-07] A measured criterion is reported, not asserted
`S3`'s median *seconds-per-note* and `S10`'s four numbers get no threshold assertion. The suite tests
that each number is **recorded correctly**; the threshold is a fact about a reader and a corpus that
do not exist yet, and ADR 0018 needs *acceptance rate* free to fall.
→ [ADR 0037](adr/0037-a-measured-criterion-is-reported-not-asserted.md)

### [2026-09-07] Two test databases, split on the line ADR 0019 already drew
⚠️ **The premise inverted under measurement.** PGlite is **PostgreSQL 18.3** and refuses every
foreign key, trigger, partial index and check `04` relies on, in 946 ms with no Docker (verification
§14.1). Only the worker's three concurrency behaviours need a container, and the worker is Python
anyway.
→ [ADR 0038](adr/0038-two-test-databases-split-on-the-line-adr-0019-already-drew.md)

### [2026-09-07] The outbox pattern shares a property list, not a harness
ADR 0007's *grade* outbox, ADR 0015's job table and ADR 0028's worker loop are one pattern in three
processes and two languages. **Five written properties, three harnesses** — a shared adapter layer
would be a fourth implementation of the pattern, tested by nothing.
→ [ADR 0039](adr/0039-the-outbox-pattern-shares-a-property-list-not-a-harness.md)

### [2026-09-07] The `noScripts` smoke test becomes a test, and it was always three assertions
**Decision.** It stops being a first-week experiment and moves into `test/e2e/`. `@nuxt/test-utils`'
`$fetch(url)` is documented as returning the **HTML** of a server-rendered page (verification §14.3),
so the `curl`-and-grep is an assertion. Three of them: a *place* contains no `<script>`; ⚠️ a
*mode*'s Done control is a real `<a href>` whose target also contains none, which is what a bare
`<NuxtLink>` fails and nothing else would notice; and *Vet* and *Review* **do** ship JavaScript,
because asserting only the negative passes on a globally broken `features.noScripts`. Plus a config
assertion that no non-public route carries `prerender`, `swr` or `isr`.

**Alternatives considered.** *Keep it an experiment* — rejected: a thing run once on the first deploy
is not regression cover, and verification §8 established that nothing upstream tests this
combination, so regression cover is the whole reason it exists. *One assertion, as carried* —
rejected: it passes on the two configurations that break the app.

**Reason.** It has been carried in `00-status.md` since Round 3 as an experiment because no cheaper
mechanism was known. One now is. `11-testing-plan.md` §6.1.

**Revisit if.** Nothing. The experiment is retired; the `psycopg.connect()` probe and the Neon
scale-to-zero question stay experiments because neither is an assertion about our code.

### [2026-09-07] ⚠️ The key-handler binding is tested by its behaviour, not by its location
**Decision.** `10` §11 called this a Level A conformance test (SC 2.1.4, verification §13.4).
**"Where a listener lives" is not assertable** — `getEventListeners` is a DevTools API, and
inspecting Vue internals tests the framework's shape. So the suite asserts the **behaviour that
distinguishes the two bindings**: with focus on the Done control's anchor, outside the mode
container, pressing `R` leaves `note_vetting` unchanged; with focus returned, `R` rejects. A
`document`-bound handler fails the first assertion.

**Alternatives considered.** *Assert the binding by introspection* — rejected: it would pass while
the app fails, and break on a Vue upgrade for no reason. *Leave it to code review* — rejected: it is
a Level A criterion and the failure is invisible on screen, which is the worst combination for a
convention.

**Reason.** ADR 0037's principle applied to a different subject — where the thing you care about
cannot be asserted, assert its observable consequence and **say which one you did**. ⚠️ It is written
down as a behavioural proxy: if the Done control ever moves inside the container, the test needs
re-thinking rather than re-running. `11-testing-plan.md` §6.2.

**Revisit if.** A *running* mode gains a second focusable element outside the container, which would
change what the proxy is measuring.

### [2026-09-09] The app connects with node-postgres, because the move is the point
**Decision.** The Nuxt app reaches Postgres through `drizzle-orm/node-postgres` and `pg`, over Neon's
pooled endpoint, string verbatim. `03` §4.1 settled *which string* each process gets; it did not
settle which client opens it, and #4 could not be written without an answer.
→ [ADR 0040](adr/0040-the-app-connects-with-node-postgres-because-the-move-is-the-point.md)

### [2026-09-09] ⚠️ The Better Auth generator's documented flags suppress the `auth` schema
**Decision.** The four tables are generated with `npx auth@1.7.3 generate --config <config>`, and
**without** `--adapter drizzle --dialect pg`. Measured while building #4: those two flags make the
CLI synthesise an adapter instead of reading the configured one, and the configured one is where
`schemaName` lives — so they emit `pgTable(...)` in `public` and silently drop the `auth` Postgres
schema that `04` §8 exists to create. `04` §8 and `08` §7 both prescribed the flagged form; both are
amended.

**Alternatives considered.** *Hand-write the four tables* — rejected: `08` §7 keeps them
unremapped precisely so they can be regenerated and diffed, and a transcription is the copy that
drifts. *Move them to `public`* — rejected: the separate schema is what makes "this project does not
own these four tables" structural rather than a comment, and it keeps `user` out of `public`.

**Reason.** A documented command that produces the wrong output silently is worse than no command,
and this one fails in the direction nobody checks: the tables appear, the migration succeeds, and the
`auth` schema is simply absent. `test/schema/schema.test.ts` asserts the four tables are in `auth`,
so the correction is now held by a test rather than by a paragraph.

**Revisit if.** The CLI gains a `--schema` flag, which would make the flagged form correct again.

### [2026-09-09] One `overrides` entry buys the install, and `--legacy-peer-deps` does not
**Decision.** `package.json` carries `"overrides": { "better-auth": { "vitest": "$vitest" } }`, and
`better-auth` is pinned at **1.7.3 exactly** — a seventh pin in `03` §13.5.

**Alternatives considered.** *`--legacy-peer-deps`* — rejected, and it is the one the error message
suggests: it turns off peer checking for the life of the project, for every package, to get past one
optional peer. *Downgrade `vitest` to 4* — rejected: the suite is on 5 and the peer is for test
helpers this project never imports. *Leave `better-auth` uninstalled and keep generating from a
scratch install* — that is what #4 did, and #5 needs the runtime dependency.

**Reason.** `better-auth` declares `vitest` as an **optional** peer at `^2 || ^3 || ^4`. npm still
refuses the install when the package is present in the tree at another major — measured 2026-09-09,
`ERESOLVE` on npm 12.0.2. The override is scoped to `better-auth`'s own subtree and touches nothing
else; the install added seven packages, with no SvelteKit and no TanStack Start among them, which is
what `00-status.md` § Carrying predicted would arrive. The exact pin is a separate point and a
stronger one: `08` §7 generates the four tables and remaps nothing **so the file can be regenerated
and diffed**, and that only means something against a known version.

**Revisit if.** `better-auth` widens the `vitest` peer range — then remove the override, and not
before.

### [2026-09-09] The `external` guard is a click, not a browser
**Decision.** The assertion that a *mode*'s Done control carries `external` (ADR 0032) lives in
`test/nuxt/modes.test.ts` as a mounted-component click, not in `test/e2e/` as a browser navigation.
`11` §6.1 is amended.

**Alternatives considered.** *Keep it in e2e and give that tier an authenticated browser* —
rejected **for now**: it needs a session row, which needs a database in the TypeScript suite, which
is scope ADR 0038 deliberately kept out. #10 cannot be tested at all without an authenticated e2e
context, so the context lands there and pays for itself. *Assert the rendered markup* — rejected,
and this is the trap: both forms render `<a href="/stats">`.

**Reason.** #5 put both *modes* behind the session gate, so the browser test could no longer reach
the control — an unauthenticated `/vet` is a `302`. Measured while fixing it: `external` and a bare
`<NuxtLink>` produce identical markup and opposite `event.defaultPrevented` on click — `false` and
`true`. The click was the necessary part; the browser never was. The replacement covers both modes,
runs in milliseconds, and names the cause when it fails. **Verified by sabotage in both directions.**

**Revisit if.** #10 lands an authenticated e2e context — at which point the browser assertion is
cheap again, and `11` §6.1 lists what should rejoin it.

### [2026-09-09] The auth instance imports `better-auth/minimal`
**Decision.** `server/utils/auth.ts` imports `betterAuth` from `better-auth/minimal`. `08` §10 is
amended, along with the `schemaName` the same block omitted.

**Alternatives considered.** *The default entry point*, which is what `08` §10 wrote — it works, and
it carries Kysely into a function that already has Drizzle.

**Reason.** The package documents the default export as "full mode (with Kysely)" and points a
`drizzleAdapter` configuration at `minimal` in its own JSDoc. `08` §10 was written before there was a
package on disk to read. No behaviour changes.

**Revisit if.** A plugin this project adopts turns out to need the full builder.


### [2026-09-10] A declared field names its own roles; only ordered sets are lists
**Decision.** In `subjects/*.json`, `kind` (ADR 0004's `lookup` / `judgement`) and `memory_bearing`
(ADR 0011) are **flags on the field**. `identity_key` and each *template*'s `prompt` / `answer` stay
**lists of names**. Keys are `snake_case` throughout, the note field names included.

**Alternatives considered.** *Four parallel lists* — `judgement_fields`, `memory_bearing_fields` and
the rest beside `fields` — which is how ADR 0003 and ADR 0011 describe them in prose.
*`camelCase` keys*, which is what the TypeScript side would have chosen for itself.

**Reason.** A parallel list can name a field that does not exist; a flag cannot, and two of the four
sets are unordered and non-overlapping, so a list buys nothing back. The two that stay lists are
ordered and may repeat a name — `04` §5.3 renders the *identity key* "in the order the subject
declaration lists them", and a *template* has two sides — so their drift is real and
`checkDeclaration` checks it in both languages. On casing: `04`'s columns are `snake_case`, the field
names are keys inside `note.fields` verbatim, and a stage key has to be a legal Python module name
(`03` §10), so `camelCase` would have been one toolchain's convention winning a file that belongs to
neither.

**Revisit if.** A subject needs a field to carry a role that is genuinely ordered.

### [2026-09-10] The memory-bearing fields are the *template*'s answer, not the editable ones
**Decision.** `reading` and `meaning` are memory-bearing in `jlpt-vocab.json`. `part_of_speech`, the
example sentence and the example gloss are not, and neither is `term`.

**Alternatives considered.** ***`meaning` alone***, which is what the editable set argues for: ADR
0006 freezes an accepted note's fields, `10` §4.4 lets edit reach exactly the three *judgement
fields*, and of those only `meaning` invalidates memory — so `reading` can never change and the flag
can never fire.

**Reason.** ADR 0011 defines memory-bearing by *what was memorised*, and `PRD` §6 says the one
*template* is "term to reading and meaning" — the reader is being tested on both. Encoding "the
fields that are both editable and memory-bearing" would bake ADR 0006's freeze rule into a flag that
is not about editing, and the two come apart the moment a second *template* exists or a re-ingestion
proposes a corrected reading. A flag that is currently unreachable is cheaper than a flag that is
quietly wrong.

**Revisit if.** A second *template* lands (`PRD` §6 defers production and kanji-to-reading), which is
when every field's answer-side membership is re-read anyway.

### [2026-09-10] ⚠️ TypeScript's types are derived from the declaration and are still only `string`
**Decision.** `shared/subject/declaration.ts` derives every type from the imported JSON —
`SubjectDeclaration = typeof jlptVocabJson`, and the rest off that. It restates nothing. It also gains
`checkDeclaration`, a runtime check of the file's own shape, which is the compiler substitute rather
than a belt-and-braces extra.

**Alternatives considered.** *A hand-written `interface`*, which is a restatement of the file and what
#3's acceptance criteria refuse. *Codegen into a literal-typed module*, on the regenerate-and-diff
pattern `08` §7 already uses for Better Auth's four tables.

**Reason.** ⚠️ **Measured 2026-09-10: TypeScript widens every string in an imported JSON module.**
`typeof declaration.fields[number]['name']` reads exactly like it should produce a union of the six
names and it produces `string` — `const x: FieldName = 'zzz'` compiles. So a JSON import gives
derivation without narrowing, and the only routes to a literal union are the two rejected above.
Codegen was the real candidate and it lost on what it would have bought: TypeScript's consumers
*iterate* the declaration — *Vet* renders the judgement fields, *Review* renders a template — rather
than naming fields, so a union would guard almost nothing while adding a generator, a generated file
and a diff test. `03` §6 said the guard is a test; this is that, taken literally.

**Revisit if.** TypeScript code starts naming fields as literals, or a second subject makes
`SubjectDeclaration` a union of two files' types.

### [2026-09-10] The worker's toolchain is uv, on Python 3.11, and Renovate needed no change
**Decision.** `worker/pyproject.toml` (PEP 621) with `[dependency-groups]` and `worker/uv.lock`,
Python pinned by `worker/.python-version` at `3.11`, `[tool.uv] package = false`. First dependency:
`pytest==9.1.1`, which `11` §1 had already named.

**Alternatives considered.** *`requirements.txt`*, which is the form `03` §13.5 names in passing — it
is a manifest and a lockfile at once only if every transitive pin is written into it by hand.
*Poetry* and *pip-tools*, neither of which is on the machine. *Adding `python` to `.tool-versions`*
beside `nodejs`, which is the repo's existing convention for a runtime pin.

**Reason.** `worker/README.md` asks for a manifest **and** a lockfile, and `uv.lock` is one without a
compile step. The Python pin lives in `.python-version` and not in `.tool-versions` because uv reads
the first and not the second, and two files pinning one interpreter is exactly the drift this project
spends its time refusing; `.tool-versions` gained a comment pointing at it instead. `3.11` is the line
verification §7.3 measured SudachiPy's 9 ms load on. Not a package, because `03` §10 wants one flat
module per stage under `pipeline/`, named by the declaration, and a `src/` layout puts a directory
between that list and the thing it mirrors.

⚠️ **`03` §13.5's rule — a bot arrives with the first manifest, not afterwards — is satisfied without
touching `renovate.json`.** Verified 2026-09-10 against Renovate's own documentation: the `pep621`
manager matches `/(^|/)pyproject\.toml$/` by default, so `worker/` is picked up where it sits, it
extracts PEP 735 `[dependency-groups]`, and it maintains `uv.lock`. The two pins already written
against this manifest — `psycopg[binary]` ≥ 3.2.4 and the disabled `SudachiDict-core` — are waiting
for #7 and #8 and now have a file to attach to.

**Revisit if.** `sudachipy` 0.6.11 turns out not to publish a wheel for 3.11, which is the one thing
#8 could discover that moves the interpreter.

### [2026-09-10] The drift test runs Node from pytest, over a script in `scripts/`
**Decision.** `worker/tests/test_subject_drift.py` runs `node scripts/print-subject-view.ts` and
compares the JSON it prints with its own derivation. The script is type-checked by
`tsconfig.test.json`, which gained `scripts/**/*`. ⚠️ It **fails** rather than skips when Node is
absent.

**Alternatives considered.** *A plain `.mjs` reader*, which would have compared Python against a third
view of the file rather than against TypeScript's. *Comparing both sides against the file only*, which
is what each suite's own half already does and which cannot catch a divergence in the deriving code —
the thing `03` §6 is actually worried about. *Skipping when Node is missing*, on the model of
ADR 0038's three container tests.

**Reason.** `03` §6 asks for "the field list compared across the two", which needs one side able to
ask the other. Node 24.11.0 strips the types and runs the script directly — measured 2026-09-10 — so
the question costs one subprocess and no build. It does not skip because Node is not optional here the
way Docker is: the app is a Nuxt app, so a machine without Node is broken rather than merely lighter,
and a cross-language guard that excuses itself on the machine where the two disagree is not a guard.

⚠️ **The script's import carries `.ts` and the JSON import carries `with { type: 'json' }`, and
neither is decoration.** Node's ESM resolver will not extension-guess (`ERR_MODULE_NOT_FOUND`) and
refuses a JSON module without the attribute (`ERR_IMPORT_ATTRIBUTE_MISSING`); Vite would have accepted
both forms, so the repo's own bundler cannot tell you this is wrong.

**Revisit if.** Node drops or gates type stripping, in which case the script becomes `.mjs` and reads
the built output instead.

### [2026-09-10] ⚠️ Two measured cross-language divergences, and what "the same answer" costs
**Decision.** `null` is an **absent field** in both validators, and emptiness is a **shared,
explicitly written character class** rather than each language's own idea of whitespace. Both were
found by review after the two implementations were written and both suites were green.

**What was measured, 2026-09-10.**

- **`null`.** TypeScript read it as a value of the wrong type (`not_a_string`); Python read `None` as
  a missing field (`missing`). ⚠️ **On an *optional* field that is accept versus refuse, not two
  spellings of one refusal** — `validate(d, { tail: null })` was `ok` in Python and an error in
  TypeScript. JSON `null` is what a model returns when it has no answer, so this is an input `03` §7's
  boundary actually sees.
- **Whitespace.** `trim()` and `str.strip()` disagree on exactly six characters across the BMP, swept
  rather than recalled: Python strips `U+001C`–`U+001F` and `U+0085`; JavaScript strips `U+FEFF`.
  ⚠️ **`U+001F` is the character `04` §5.3 joins the *identity key* with.** A required field holding
  only it was `empty` in Python and `ok` in TypeScript.
- **A third, avoided by the fix rather than found in it:** Python's `$` matches before a trailing
  newline and JavaScript's does not, so the shared class is anchored `\A…\Z` on one side and `^…$` on
  the other **on purpose**, and `"x\n"` is in both suites' table because of it.

**Alternatives considered.** *Leaving the codes to diverge*, on the grounds that both refuse — false
for the `null` case, and the codes are what both suites assert. *Recalling ECMAScript's `WhiteSpace`
production and writing that class* — tried, and wrong: the sweep contradicted it.

**Reason.** Two implementations over one file are only worth having if they answer the same way, and
the review found that "they agree" had been asserted in three documents and tested in neither. Both
suites now carry the same five-character table.

**Revisit if.** A third consumer of the declaration appears, which is when a shared fixture beats two
tables that have to be kept in step by hand.

### [2026-09-11] A chunk is 1200 characters, broken at the last sentence end
`source_chunk` boundaries are a target and hard maximum of 1200 characters — `04` §5.2's own worked
example, and the only number about chunking anywhere — broken at the last of `。！？` or a newline at
or before it. The deciding reason is stage 2: SudachiPy tokenises each chunk independently, and a cut
inside a word feeds a fragment to `normalized_form`, which is half of ADR 0006's *identity key*.
→ [ADR 0041](adr/0041-a-chunk-is-1200-characters-broken-at-the-last-sentence-end.md)

### [2026-09-11] ⚠️ Character offsets are code points, because Python's `len()` is

**Decision.** Every count, slice and offset in the ingest path goes through `shared/ingest/text.ts`,
which iterates **code points**. Nothing in `shared/ingest/` or `server/utils/ingest/` uses `.length`
or `.slice` on source text.

**Reason.** `04` §1 says "character offsets are **characters, not bytes**. Japanese makes the
distinction load-bearing" — and there is a second distinction underneath it that no document names.
**JavaScript strings are UTF-16 and Python strings are sequences of code points**: `'𠮟'.length` is 2,
`len('𠮟')` is 1. The app writes `char_start` / `char_end` and the worker slices `source.content` by
them in Python, so a single character outside the BMP puts every later offset one out — silently, and
the symptom arrives months later as an *occurrence* highlighting the wrong span. This is the same
class of divergence #3 found between `trim()` and `str.strip()`, and it is closed the same way: one
module, and a test that asserts the difference rather than a comment that describes it.

**Revisit if** never. `Intl.Segmenter` would count *graphemes*, which is a different and wronger
answer: the contract is with Python's `len()`, not with a reader's intuition.

### [2026-09-11] The *source* submission posts to the *place* that renders its refusal
The Ingest form's `action` is `/`, not `/api/source`: `09` §4.2 requires a refused paste to be
answered with the Ingest document re-rendered and the text still in it, and a Nitro route handler
cannot render a page. Measured — Nuxt's renderer answers `POST` with a full document, and a
middleware URL rewrite does not re-route. `09` §1 and §4.2 are amended.
→ [ADR 0042](adr/0042-the-source-submission-posts-to-the-place-that-renders-its-refusal.md)

### [2026-09-11] ⚠️ A Drizzle column in a `sql` template emits a **bare** identifier

**Decision.** Every correlated subquery in `server/utils/ingest/queries.ts` is built with Drizzle's
own query builder and embedded as ``sql`${subquery}` ``. Interpolating a column into a `sql` template
is not used anywhere a correlation depends on it.

**Reason.** Measured 2026-09-10, drizzle-orm 0.45.2:
``sql`… WHERE ${note.originIngestionId} = ${ingestion.id}` `` emits
`WHERE "origin_ingestion_id" = "id"` — **unqualified**. Inside a subquery over `note`, `"id"` is
`note.id`; the correlation to the outer row is gone, the SQL is still valid, and it returns a number.
Embedding a built subquery emits `where "n"."origin_ingestion_id" = "ingestion"."id"`, which is what
was meant.

⚠️ **The worst case was not the failure — it was the pass.** The chunk count written the broken way
came out as `WHERE "source_id" = "source_id"`, trivially true, counting every chunk in the table —
and it **agreed with the right answer for as long as there was one *source***. That is why
`test/schema/place-queries.test.ts` seeds a second *source* and a second *ingestion* for every count
that has one, rather than asserting against a single fixture.

**Revisit if** never; this is a property of the library, not a preference. It generalises past this
file: **any** `sql` template that means to correlate is wrong in the same way.

### [2026-09-11] The e2e tier signs in, and it is still PGlite

**Decision.** `test/e2e/` boots PGlite behind `@electric-sql/pglite-socket` (**0.2.11**, exact) so the
built app reaches it over the wire protocol with `node-postgres`, and `test/e2e/session.ts` writes a
session row and signs its cookie. `11` §1 and §6.1 are amended.

**Alternatives considered.** Waiting for #10, as `11` §6.1 planned — but #6's own criteria put the
over-cap re-render in the end-to-end column and every route it touches is gated, so there was nothing
to wait with. A real Postgres container — it would put Docker in the TypeScript suite, which ADR 0038
spent its argument keeping out. A test-only endpoint that mints a session — ⚠️ **refused outright**:
`S1` says refused at every route, and that would be a hole in the property #5 exists to establish.

**Reason.** `00-status.md` § Next named this ticket as the place to argue it, and `11` §1's table
already said the e2e tier's database was PGlite — what was missing was a way to reach an in-process
one from another process. The forged cookie cannot pass by accident: a wrong signature, a wrong
secret or a missing row all resolve to no session and a `302` to `/auth`, so a broken forgery turns
sixteen assertions red rather than one green. **Sign-in itself is still not tested** (`11` §8, §9);
what is new is that the routes behind the gate are reachable, which puts assertion 1's signed-in half
back on the three routes it is about.

**Revisit if** #10's browser context wants a different shape. The two files are test-only and nothing
under `app/` or `server/` imports them.

### [2026-09-11] A blank title is derived from the first line of the content

**Decision.** `09` §4.2 makes the title optional and `04` §5.1 makes the column `not null`.
`shared/ingest/submission.ts` bridges that with the **first non-blank line of the content**, trimmed
and truncated to 60 code points with an ellipsis.

**Alternatives considered.** A literal `Untitled` — every untitled *source* then looks like every
other one in the runs list and in Sources. Making the field required — `09` §4.2 says optional, and a
second required field in front of a paste is friction on the one screen `S2` says must return control
immediately.

**Reason.** The title is the link text in the runs list and in the Sources list (`10` §6.2, §7.1), so
an empty string renders a row with nothing to click. The first line is what a person would have typed
anyway.

**Revisit if** pasted material routinely starts with a header line nobody wants as a name.

### [2026-09-11] ⚠️ Still open: whether the app ships its own font files

**Not a decision — a gap, recorded so it stops being invisible.** `05` §4 says "whether the app ships
them from Google is a **Phase 4 question**, not a design-system one". Phase 4 never answered it, and
nothing in eleven documents or forty-two ADRs chooses between a Google Fonts stylesheet, self-hosted
`@fontsource` packages and `@nuxt/fonts`.

#6 landed `05`'s tokens because it was the first screen ticket to need them
(`00-status.md` § Carrying), and `app/assets/css/tokens.css` names the three families with `05` §4's
own fallback stacks — `'Newsreader', Georgia, serif` and so on. **So a reader today sees the
fallbacks**, which is within `05` §4's own spelling of the stacks and is not the drawn screen.

It was left open rather than decided in passing because it is a **dependency decision with a pin
obligation** (`03` §13.5) and #6's acceptance criteria do not ask for it. The leaning, for whoever
takes it: self-hosting, because ADR 0022's move to EC2 or Lightsail must stay a preset change plus a
`pg_dump`, and a third-party stylesheet is one more thing that move has to still work through.

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
- ~~**The note's storage shape.**~~ **Closed 2026-09-06** — ADR 0029, in
  `04-database-schema.md`. ADR 0021's recommendation survives, but on a different argument than the
  one it was recommended on: the row-lock half is weak at one reader, and what decides it is that
  ADR 0018 made the model choice a measurement, and that measurement is an aggregation across notes.
- ~~**Whether the owner foreign key targets Better Auth's `user.id` or an app-level table.**~~
  **Closed 2026-09-06** — directly, with `ON DELETE RESTRICT`. Entry above.

- ~~**How the session is read on a `noScripts` route.**~~ **Closed 2026-09-06** — ADR 0030, in
  `08-authentication.md`. Raised by `03` §2.2 and left open there: Better Auth's documented Nuxt fix
  is `<ClientOnly>`, which renders nothing on a route that ships no JavaScript.

- ~~**What `/` is** · **how a *mode* is entered** · **what empty *Vet* does** · **what Done means
  in *Vet***.~~ **All closed 2026-09-07** — ADRs 0031, 0032 and 0033, in `09-user-flows.md`. The
  first was a gap `08` left when it set `callbackURL: "/"`; the middle two were the half of ADR 0013
  it did not decide, including the empty-*Vet* gap it claimed to have closed and could not.

- ~~**The grade labels** · **the five interaction states** · **the Done control's geometry** · **the
  *Review* phone layout** · **the start block, and the three screens the canvas never drew**.~~
  **All closed 2026-09-07** — ADRs 0034, 0035 and 0036 and four full entries, in
  `10-screen-specifications.md`. That closes every item `05-design-system.md` §8 and §10 held open
  and every item `09` §9 handed forward.

- ~~**What the measured criteria mean as tests** · **which tests need a real Postgres** · **the
  `noScripts` smoke test's home** · **whether the key binding is testable** · **the outbox
  harness**.~~ **All closed 2026-09-07** — ADRs 0037, 0038 and 0039 and two full entries, in
  `11-testing-plan.md`. ⚠️ **The Postgres question inverted under measurement**: PGlite is
  PostgreSQL 18.3 and fails every constraint `04` relies on, so the expensive harness is needed for
  three tests rather than for most of them.

**Nothing is open.** Every question the brief, the PRD or an ADR left for a later document has an
answer or a dated entry.

### Carried into implementation, not decisions

- ~~**The `noScripts` smoke test**, ~15 minutes on the first deploy.~~ **Promoted to a test
  2026-09-07** — `11-testing-plan.md` §6.1, and it was always three assertions plus a config check.
- **Whether an idle `LISTEN` connection defers Neon's scale-to-zero.** Neon is silent, and
  `00-status.md` asserted an answer it cannot support. ADR 0028 is correct either way; the experiment
  settles the cost question only.
- **Whether Better Auth's sign-in and sign-out endpoints accept a plain `<form method="post">`.**
  Nothing was found either way, so `08-authentication.md` §2 gives the door route JavaScript. If they
  do, the app ships none outside the two *modes*.
- ~~**Five interaction states** — hover, active, disabled, loading, error — and the **Done** control's
  geometry.~~ **Closed 2026-09-07** in `10-screen-specifications.md` — ADR 0035 and the Done-cluster
  entry above.
- ~~⚠️ **`04-database-schema.md` §9.1 needs one sentence.**~~ **Applied 2026-09-07.** §9.1 now
  excepts the card un-minted by `Z` inside the run that minted it (ADR 0033).
- ~~⚠️ **`03-technical-design.md` §8.1 describes the outbox as carrying *grades*.**~~
  **Applied 2026-09-07.** §8.1 now says it carries *grades* and `S9` flags (`09` §4.9).
- ~~**The `external` prop on every *mode* exit** (`09` §5.2, verification §12.1).~~ **Closed
  2026-09-09.** It was a test from #2 and it is a better one since #5: `test/nuxt/modes.test.ts`
  clicks Done on both *modes* and asserts the click was not intercepted. The `curl`-and-grep this
  line imagined could never have proved it — both forms render the same `href`.

### [2026-09-11] The app sends the wake-up, after the transaction that earned it

ADR 0028 settled that `NOTIFY` is an optimisation and never the transport; it did not say who sends
it, and nothing did until #7 needed something to wake up. `recordSource` issues
`SELECT pg_notify('kioku_job', '')` **after** its transaction commits and swallows any error —
the row is on disk before the notification exists, so the optimisation cannot cost the write
anything. A trigger on `job` was the robust alternative and was rejected: it would be a second
trigger in a schema whose §14 has one, and `test/schema/schema.test.ts` asserts that count on
purpose.
→ [ADR 0043](adr/0043-the-app-sends-the-wake-up-after-the-transaction-that-earned-it.md)

### [2026-09-11] ⚠️ PgBouncer's matrix separates `LISTEN` from `NOTIFY`, and three documents did not

**Decision** — a correction, applied in place. `03` §4.1, `phase-4-verification.md` §7.2 and §9.2 all
say the pooled endpoint "does not support `LISTEN`/`NOTIFY`". PgBouncer's own feature matrix, checked
2026-09-11, says `LISTEN` is **Never** in transaction pooling and `NOTIFY` is **Yes**. Neon's page is
a summary of that matrix, not the mechanism.

**Reason** it matters: it is the difference between the app being able to send a wake-up on its
pooled connection and needing a trigger to send one for it — which is ADR 0043's whole question. The
asymmetry has a mechanism behind it rather than being an exception to memorise: `LISTEN` is session
state, and transaction pooling gives the server connection to someone else at commit; `NOTIFY` is a
statement whose effect the server delivers at commit and which does not care who carried it.

**⚠️ What is still not verified:** nothing has been run against Neon, whose summary names the pair.
The worker's correctness does not depend on the answer (ADR 0028), and `notifyJobQueued` catches.

**Revisit if** a live Neon connection is ever made — the one-line experiment `00-status.md` § Next
already carries, `SELECT pg_notify('kioku_job','')` on the pooled string, settles it.

### [2026-09-11] ⚠️ The worker's database tests are more than ADR 0038's three

**Decision** — ADR 0038 and `11` §7 say Docker is required for "three tests and nothing else",
naming the three concurrency behaviours. #7 also writes SQL that is not a concurrency behaviour — the
chunk queue, `04` §6.2's resume query, the settle — and testing Python's SQL needs a database, which
in Python means the container. The count is now twenty-three and the three are still the ones the
ADR names.

**Alternatives considered:** testing that SQL from the TypeScript schema tier against PGlite. It
would be testing a *copy* of the worker's queries, which is `04` §13's drift argument pointed at the
tier that exists to prevent it.

**Reason:** the invariant ADR 0038 was defending is untouched and is the one worth keeping —
**a laptop without Docker runs the entire TypeScript suite**, and what goes red is the worker's,
visibly and for a stated reason (`worker/tests/conftest.py` prints it).

**Revisit if** the worker tier grows slow enough that the container stops being worth its 946 ms —
at which point the split to re-argue is per-file, not per-tier.

### [2026-09-12] A candidate is a content word, and a numeral is not one
Stage 3 keeps eleven `(pos₀, pos₁)` pairs and drops the other twenty-seven, enumerated from the
installed dictionary so the two sets cover it exactly. No document named the rule; `04` §6.1's
`(…, 214, 106, 71, 9, …)` implied it. → [ADR 0044](adr/0044-a-candidate-is-a-content-word-and-a-numeral-is-not-one.md)

### [2026-09-12] The reading half of the identity key is written in the word's own script
Hiragana, except for a word written wholly in katakana, which keeps it. `04` §5.3's three worked keys
are all hiragana and SudachiPy answers in katakana; コーヒー's reading is a field on the card, not only
half of a key. → [ADR 0045](adr/0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md)

### [2026-09-12] A job gives up after five abandonments, and every retry after the first is deferred
The stale sweep gained a second branch. `04` §6.4 called `available_at` backoff and nothing ever set
it forward; `attempts` was counted and never read. #8's handler is the first that can take the
process down with it. → [ADR 0046](adr/0046-a-job-gives-up-after-five-abandonments-and-the-retry-after-the-first-is-deferred.md)

### [2026-09-12] `04` §6.1's four candidate counters are four disjoint buckets, per chunk
No ADR — it is a reading of an existing table rather than a new decision, recorded in full because the
table did not say it.

**Decision** — `candidates_extracted` counts **sightings**, not distinct words. `candidates_deduplicated`
is the sightings folded into a group already seen *in the same chunk*. `candidates_already_known` is
the groups whose ADR 0006 key the corpus already carries. `candidates_rejected` is the groups this
reader has rejected. The four are disjoint and the first is the total, so
`extracted − deduplicated − already_known − rejected` is what reached stage 6. Each chunk adds its
own numbers to the row (`coalesce(…, 0) + …`), because a resume re-runs only the chunks that are not
`complete`.

**Alternatives considered:** counting distinct words rather than sightings — rejected because
`04` §6.1's own example, `(214, 106, 71, 9)`, only adds up as sightings; and counting a rejected
candidate under *both* `already_known` and `rejected`, which every rejected key qualifies for since
`04` §7.2 keys a rejection on `note_id` — rejected because `03` §11 shows the reader *which* filter
removed the work, and a ledger that adds up to more than was extracted answers nothing.

**Reason:** `04` §6.1 gives the four columns and one worked example and never says what separates
them. Three filters, three numbers, and a total is the only reading under which the example's
arithmetic works.

**Revisit if** the tally on a real run reads wrong to the person looking at it — `10` §6.2 renders all
four as the *session tally*, so the screen is the test.

### [2026-09-12] A resume is one job row, and only from `incomplete`
No ADR — the decision was made three times already and each time it was *not yet*; this is the
recording of it finally being *yes*.

**Decision** — `recordResume` writes a single `job` at `kind = 'resume'` and nothing else: no
`source`, no `source_chunk`, no `ingestion`. It refuses any status but `incomplete`, and refuses a
second one while a `queued` or `claimed` job for that *ingestion* already exists. The control is a
form `POST /` carrying a hidden `resume` field, answered `303`.

**Alternatives considered:** a second write path at `POST /api/resume` — rejected because it adds a
row to `09` §1's route table, a second write surface and a second CSRF story to save one `if`; and
reporting the refusal to the reader — rejected because `09` §7 makes the run list the thing that says
where a run is, read fresh on every request, and a flash message would be a second, staler account of
the same fact with no client to hold it.

**Reason:** ADR 0015 — once the per-chunk record exists it **is** the queue — so resuming is
enqueueing a second visit rather than reconstructing anything. `10` §6.2 moved this control from #6
to #7 to #8 because a control that wrote a job no worker could act *usefully* on is worse than the
line that says what completed. #8 is the first ticket where a resume does something.

**Revisit if** a reader wants to resume a `failed` *ingestion*. `settle_run` cannot produce `failed`,
so one today means a run that could never be started — but ADR 0046's new `failed` **job** sits beside
an `incomplete` *ingestion*, and that pairing has not been seen on a screen yet.

### [2026-09-12] Generation is one request per chunk, and notes are written as each chunk returns
`03` §5.1 called stage 6 *the LLM, per surviving note* and `04` §6.3 keys the cache on the *chunk*'s
hash with a `{"notes": […]}` array under it. Both cannot be true, and the cache is the half that
could not be wrong. The chunk is the unit of the request, of the key and of the streamed write.
→ [ADR 0047](adr/0047-generation-is-one-request-per-chunk-and-notes-are-written-as-each-chunk-returns.md)

### [2026-09-12] Provenance kind is decided by who produced the value
`note_field_provenance.kind` records the mechanism, not the declaration's label for the field: the
tokeniser's three fields are `lookup`, the model's three are `generated`, and `judgement` is
**unreachable in v1** because nothing hands the model a sense inventory to choose among.
→ [ADR 0048](adr/0048-provenance-kind-is-decided-by-who-produced-the-value.md)

### [2026-09-12] The price table is a list of dated tables, and the newest effective one wins
No ADR — `03` §7 and `04` §6.1 had already decided it; what was open was the shape.

**Decision** — `worker/prices.py` holds `PRICE_TABLES`, a tuple of `(effective_date, prices)`, and
`current_prices()` returns the newest entry effective on or before the run. **A price change is a new
entry, never an edit to an existing one**, and `ingestion.price_table_effective_date` stamps which
one a figure was computed with. The seven models are ADR 0018's own table, so the ledger and the
argument that walks the model quote the same numbers. A model id the table does not carry raises
`UnpricedModel`.

**Alternatives considered:** one mutable table edited in place — rejected because editing it rewrites
history: every `ingestion` already stamped with that date would now cite a table saying something
else. And defaulting an unknown model to zero — rejected because ADR 0018 walks the model, so an
unrecognised id is the *expected* shape of a mistake, and a free *ingestion* in the ledger `S10`
reports from is worse than no number.

**Reason:** `03` §7 — *the price table is configuration with an effective date, not a constant.*
`S10` reports cost per *ingestion*; published prices change, and a hard-coded table begins lying
silently on the day they do.

**Revisit if** a provider publishes an actual effective date for a price change, at which point the
entry's date should be theirs rather than the date the figures were read.

### [2026-09-12] The worker refuses to start without a provider key
No ADR — it is `db.require_direct_url`'s shape applied to the second secret `03` §13.1 names.

**Decision** — `provider.require_provider` raises `MisconfiguredWorker` when `ANTHROPIC_API_KEY` is
unset, and `__main__` reports it and exits `1` before anything is claimed. `KIOKU_WORKER_ENVIRONMENT`
is validated at the same moment and refuses anything but `laptop` or `server`.

**Alternatives considered:** keeping #8's behaviour, where a missing generator meant the run did
every stage that shrinks the work and spent nothing. That was the true state of the project until #9;
after it, such a run reads its whole *source*, settles `complete`, and reports a *source* that made
no *notes* — which `03` §11 renders to the reader as a **success**. PRD §5's zero-new-notes case
arriving as a lie is worse than a worker that will not start.

**Reason:** the failure is silent in the one direction that costs the reader their trust in the
ledger. `03` §13.1 already puts both secrets on the laptop; this makes both of them startup
conditions.

**Revisit if** a second *subject* has no generation stage at all, in which case the key becomes
conditional on the declaration rather than on the process.

### [2026-09-12] The Vet queue is oldest-first, and the client holds no position in it
`04` §12's first query orders by `note_vetting.created_at` ascending and every *Vet* endpoint answers
with the same batch, so the head of the answer **is** the *note* on screen — which is what makes
ADR 0033's "back at the head of the queue" free rather than a position the client has to remember.
→ [ADR 0049](adr/0049-the-vet-queue-is-oldest-first-and-the-client-holds-no-position-in-it.md)

### [2026-09-12] The idle sweep runs on the next read, because there is no scheduler
`04` §7.1's third writer of `ended_at` had no home: Vercel Cron is forbidden by ADR 0022 and the
worker never touches personal tables. It runs at the top of every *Vet* read and inside every
decision, and the only thing that differs from a real sweep is *when the row is written*.
→ [ADR 0050](adr/0050-the-idle-sweep-runs-on-the-next-read-because-there-is-no-scheduler.md)

### [2026-09-12] Acceptance mints the card and deliberately does not mint a scheduling epoch
No ADR — ADR 0033 decided it and did not know it had.

**Decision** — `decide()` writes the `note_vetting` row and one `card` per declared template in one
transaction, and **no `scheduling_epoch`**. The first epoch belongs to the *session* that first
schedules the *card*, which is #12's.

**Alternatives considered:** minting the epoch alongside the *card*, which is the obvious reading of
"a *card* owns its own scheduling state" (`04` §7.3, §7.4) and is what `test/schema/harness.ts`'s seed
chain does by hand. It is **impossible**, not merely undesirable: `scheduling_epoch.card_id` is
`RESTRICT` (`04` §9), so an epoch written at acceptance makes ADR 0033's `Z` fail on **every**
acceptance the application ever makes — the database refuses the delete and the undo is dead on
arrival, with a failure that reads like a database problem rather than like a decision.

**Reason:** ADR 0033 already said it in its own words — the *card* `Z` deletes is "a card with no
`review_log` and no `scheduling_epoch`", "rebuilt by accepting the note again". The constraint and
the sentence agree; nothing had put them side by side. `test/schema/vet.test.ts` asserts the
**absence**, so the day somebody adds the epoch here the undo tests redden rather than the *Review*
ones.

**Revisit if** the due query ever needs to count *cards* that have never been scheduled, at which
point the answer is a `LEFT JOIN` in that query and not an epoch here.

### [2026-09-12] `human` provenance follows the diff; `note_vetting.edited` follows the commit
No ADR — it is [ADR 0048](adr/0048-provenance-kind-is-decided-by-who-produced-the-value.md) applied
to the first code that writes its fourth value.

**Decision** — committing out of *Vet*'s edit sets `note_vetting.edited = true` whether or not
anything changed, and writes `note_field_provenance.kind = 'human'` **only for the fields whose value
actually differs**. `edited` is also monotone: `Z` leaves it standing, because the edit stays in
`note.fields`.

**Alternatives considered:** stamping every field the edit touched as `human`. Rejected because
ADR 0048 makes `kind` the record of *who produced the value*, and a field the reader read and left
alone was produced by the model — stamping it `human` takes ADR 0018's instrument away one *note* at
a time, and `04` §12's eighth query is that instrument. And clearing `edited` on an undo, rejected
because `S6` counts *notes* that needed fixing and the fix is still in the row.

**Reason:** `09` §4.3 sets `edited` on the **commit** ("`Enter` — commit and accept.
`note_vetting.edited = true`"), which is a fact about the reader's act; provenance is a fact about
each value. They are different questions and only one of them is answered by the diff.

**Revisit if** a re-edit path ever exists (`S6` says there is none in v1 — the way back to a bad
*note* is `S9`'s flag), at which point `edited` stops being a property of one commit.

### [2026-09-12] Done does not wait for the run to end when the run holds no rejections
No ADR — it is what ADR 0032's `external` anchor costs, and the cost is zero.

**Decision** — the Done control is `<NuxtLink :to="origin" external>` and its click is **not**
prevented, so the document load starts immediately; `POST /api/vet/end` travels beside it as a
`sendBeacon`, falling back to a `keepalive` fetch. When the run holds at least one rejection the
click *is* prevented, `10` §4.6's confirmation appears, and `space` there **awaits** the same request
before navigating.

**Alternatives considered:** always preventing the default and using
`navigateTo(origin, { external: true })`, which ADR 0032 blesses equally. Rejected because
`test/nuxt/modes.test.ts` holds the one bit that distinguishes `external` from a bare `<NuxtLink>` —
`event.defaultPrevented === false` — and weakening that test to buy an `await` is trading a guard
that catches a silent, unflaggable bug for a request that does not matter.

**Reason:** the only thing `ended_at` decides is whether a *rejection* can still be reversed. On this
branch the run holds none, so a lost request costs **nothing at all**, and
[ADR 0050](adr/0050-the-idle-sweep-runs-on-the-next-read-because-there-is-no-scheduler.md)'s sweep
closes the row on the next read regardless. The branch where it matters is the one that waits.

**Revisit if** anything else is ever attached to `ended_at` — a metric, a notification, a per-run
tally on Stats — at which point losing the request stops being free.

### [2026-09-12] The edit reaches the judgement fields, and `S6` is amended to say so
`S6`'s *any field is editable* is narrowed to *any judgement field*, which is what `10` §4.4 already
said and what #10 already built: editing the *term* or the *reading* changes `note.identity_key`
(ADR 0006) and editing a *level* manufactures a claim with no *authority* (ADR 0005). The PRD is
amended rather than the code.
→ [ADR 0051](adr/0051-the-edit-reaches-the-judgement-fields-and-s6-is-amended-to-say-so.md)

### [2026-09-12] An accepted note is frozen against every writer, and any reader's acceptance freezes it
The freeze is a `NOT EXISTS` in the `WHERE` of the app's fields write and an `ON CONFLICT DO NOTHING`
in the worker's insert, rather than a property held by who happens to be calling. `note` is shared
and `note_vetting` is personal, so **any** acceptance freezes the fields — the narrower owner-scoped
rule would let a second reader rewrite the first reader's *cards* under them.
→ [ADR 0052](adr/0052-an-accepted-note-is-frozen-against-every-writer-and-any-readers-acceptance-freezes-it.md)

### [2026-09-12] The end screen's four figures are the four grades
`10` §5.6 asks for the *session tally*'s four equal columns and never says which four. They are the
*grade* distribution — `FORGOT` · `HARD` · `GOOD` · `EASY` — because it is the only set of four the
run actually produces, and because the *progress rail* above already says how long the run was.
→ [ADR 0053](adr/0053-the-end-screens-four-figures-are-the-four-grades.md)

### [2026-09-12] `review_session.size` is what was composed, not what the knob asked for

**Decision:** the knob is a **cap**. A reader with seven *cards* available and a *session* size of
twenty gets `review_session.size = 7` and seven rows of `review_session_card`, not twenty of one and
seven of the other.

**Alternatives considered:** storing the requested size and letting the membership be shorter. It
reads more faithfully — the column would then mean *what the reader asked for* — and it is what a
naive reading of `04` §7.6's "the one knob" suggests.

**Reason:** `04` §14 makes the *progress rail*'s length `review_session.size` and the rail is the
only progress indicator in the application. Thirteen ticks that can never fill would be it promising
work that does not exist, on the one screen whose whole thesis is that the reader can see the end
(`S7`). `04` §7.7's `size` rows of membership is the same statement from the other side. The
requested size is not lost either — it is the number in the knob, which is client state on the screen
that offers it (`10` §5.8).

**Revisit if** a daily new-*card* cap arrives (`L4`), which would make *asked for* and *composed*
differ routinely rather than only at the bottom of a queue — at which point the difference is worth a
column rather than a paragraph.

### [2026-09-12] A card's first scheduling epoch is minted by the grade, not by the composition

**Decision:** `resumeOrCompose` writes `review_session` and `review_session_card` and **no**
`scheduling_epoch`. The first epoch is written by the first *grade*, inside the same transaction as
its `review_log` row.

**Alternatives considered:** minting the epoch when the *card* is composed into a *session* — which
is the literal reading of § Carrying's "the first epoch belongs to the *session* that first schedules
the *card*", and would make the due query uniform by giving every *card* an epoch.

**Reason:** a composed *session* can be abandoned, so composition is not scheduling — an epoch minted
there would be a *card* carrying a memory state for a review that never happened, and
`scheduling_epoch.card_id` is `RESTRICT` (`04` §9), so it would also put a *card* the reader never
answered out of ADR 0033's reach. The rule generalises: **the epoch is written by the thing that
produces a `review_log` row, and by nothing else.**

**Revisit if** a *card* ever needs a scheduling state before it is answered — a per-*card* deferral,
or a burial — at which point an epoch with `reps = 0` is a real state rather than a placeholder.

### [2026-09-12] The skew allowance is two minutes, and it covers both of §8.2's rules

`03` §8.2's "small skew allowance" is 120 seconds, and it applies to the before-snapshot rule as well
as to the future one — both comparisons put a client stamp against a server one, so an exact
before-snapshot rule refuses the opening *grade* of every *session* on a slightly slow laptop.
→ [ADR 0054](adr/0054-the-skew-allowance-is-two-minutes-and-it-covers-both-of-8-2-s-rules.md)

### [2026-09-12] Later wins is a second row, because review_log cannot be rewritten

PRD §5's *the same card graded twice — both replay; the later timestamp wins* is a second `review_log`
row plus a read ordered by `reviewed_at`; a stamp at or before the recorded one is `already_graded`,
which is what a replayed entry carries. `04` §7.5's trigger makes replacement impossible, so this is
the only available meaning.
→ [ADR 0055](adr/0055-later-wins-is-a-second-row-because-review-log-cannot-be-rewritten.md)

### [2026-09-12] A flag returns a note to the queue through card_flag, not by un-accepting it

`S9` leaves `note_vetting.state` at `accepted` — un-accepting would raise the numerator and lower the
denominator of *false-accept rate* at once — and `04` §11's `card_flag (note_id) WHERE resolved_at IS
NULL` index is how the queue finds it. ⚠️ The queue query and the re-vetting it leads to are
deliberately not #13's.
→ [ADR 0056](adr/0056-a-flag-returns-a-note-to-the-queue-through-card-flag-not-by-un-accepting-it.md)

### [2026-09-12] The browser store is three named functions, not a `useStorage`

**Decision:** ADR 0014's `localStorage` path is `app/utils/review-store.ts` — `readStored`,
`writeStored`, `clearStored` — imported explicitly at the call site. No `@vueuse` dependency is added.

**Alternatives considered:** adding `@vueuse/nuxt` for its `useStorage`, which is what `03` §8.1's
"the storage helper is an explicit import" was written against; and writing a composable of our own
called `useStorage`.

**Reason:** the hazard verification §5.5 recorded is a **name collision** — Nuxt has a built-in
`useStorage` (Nitro's key-value store), which is why `@vueuse/nuxt` disables its own from
auto-import. A composable of that name here would inherit the collision without the dependency that
explains it. The dependency itself buys one reactive wrapper over three lines, and `03` §13.5's pin
obligation applies to every one we add. Three functions with their own names, imported by path,
cannot be mistaken for anything.

**Revisit if** a second screen needs browser storage and the reactive wrapper starts paying for
itself — at which point the decision is the dependency, not the naming.

### [2026-09-12] Time-to-first-review is a median over the sources that have one

The criterion is defined per *source* and `10` §8.1 gives it one slot; it is the **median** across
*sources*, and a *source* whose *cards* have never been reviewed is **excluded** rather than counted
as a long one. A mean would let one *source* studied a week later push the figure past the
criterion's own ten-minute boundary while every *source* the reader used came back in eight minutes.
→ [ADR 0057](adr/0057-time-to-first-review-is-a-median-over-the-sources-that-have-one.md)

### [2026-09-12] A suppressed ratio shows the evidence behind it, as a pair

Below twenty vetted *notes* each of `S10`'s four ratios shows `have / possible` — the two raw counts
the withheld figure would have been computed from — including the two that are medians, where a
sample count alone would drop the half that matters. ⚠️ Every ratio is computed whether or not it
will be shown; suppression is a fact about the screen, not about the arithmetic.
→ [ADR 0058](adr/0058-a-suppressed-ratio-shows-the-evidence-behind-it-as-a-pair.md)

## Adding an entry

Write the ADR first — that is where the argument lives — then add a line here. Keep the format:

```
### [YYYY-MM-DD] Short decision title
One or two sentences: what was chosen, and the deciding reason.
→ [ADR NNNN](adr/NNNN-slug.md)
```

If a decision is small enough not to warrant an ADR, record it here in full instead, with
**Decision / Alternatives considered / Reason / Revisit if**.
