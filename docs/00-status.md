# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 4 — Technical documents. **In progress.** The grilling is finished — Rounds 1, 2 and 3
are closed and the frontier is empty. **33 ADRs.** `03`, `04`, `08` and `09` are written; **two docs
are still owed.**
**Updated:** 2026-09-07

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
| 6 | The note's storage shape | Deferred again, deliberately, to `04` — **closed there 2026-09-06**, [ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md) |
| 7 | The Python driver | [0027](adr/0027-psycopg-3-is-the-driver-and-neons-table-is-not-a-support-list.md) — psycopg 3, the objection was a misread page |
| 8 | `noScripts` on Vercel | Verification §8 — **it survives**; ADR 0020 amended |
| 9 | The worker's dropped listener | [0028](adr/0028-the-job-table-is-the-truth-and-notify-is-only-an-optimisation.md) — the job table is the truth |

**[`03-technical-design.md`](03-technical-design.md) — written 2026-09-06.** Eighteen sections. It
carries ADR 0028's worker loop (`LISTEN` **then** poll, on every connect and reconnect), the two
connection strings, the psycopg floor as a reason, the current `noScripts` API names, the
construct-`Dictionary()`-once rule, both pipeline findings, ADR 0007's outbox shape and ADR 0013's
split. **The security baseline is §13 and is answered in full.** No schema, no code.

It made **four new decisions**, all logged in [`06-decision-log.md`](06-decision-log.md) and none of
them a stack question: the dictionary version joins ADR 0010's cache key; the *subject* declaration
is language-neutral JSON owned by neither toolchain; a client-stamped *grade* is validated on
replay; Drizzle owns every migration and the worker never issues DDL.

**[`04-database-schema.md`](04-database-schema.md) — written 2026-09-06.** Eighteen tables plus the
four Better Auth owns. **It closes the last two open questions in the project.**

- **The note's storage shape** — [ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md).
  `note.fields` is one `jsonb` document; `note_field_provenance` is relational. ADR 0021's
  recommendation survives **on a different argument than the one it was made on**: the row-lock half
  of Postgres §8.14.2 is weak at one reader, and what decides it is that ADR 0018 made the model
  choice a *measurement*, and that measurement is an aggregation across notes that a GIN index
  cannot serve. The cost is one derived column, `note.identity_key`.
- **The owner foreign key** — directly at `auth."user".id`, typed `text`, **`ON DELETE RESTRICT`**.
  Full entry in the decision log.

Also in it, and worth knowing without opening it: **scheduling state lives on `scheduling_epoch`,
not on `card`**, so a reset is an `INSERT` and the irreplaceable data is never in the path of an
`UPDATE`; **one trigger exists in the whole schema**, making `review_log` append-only; and the
stale-job sweep runs **in the worker**, because ADR 0022 forbids a Vercel Cron dependency.

**[`08-authentication.md`](08-authentication.md) — written 2026-09-06.** Mostly citation, as
expected. **Three things it actually decided**, plus [ADR 0030](adr/0030-the-session-is-read-in-server-middleware-and-a-place-never-reads-it-from-the-client.md):

- **The session is read in one Nitro server middleware**, into `event.context.session` — ADR 0030.
  `03` §2.2 left this open and it was the one real collision in the document: Better Auth's
  documented Nuxt fix is `<ClientOnly>`, which renders **nothing** on a `noScripts` route, and all
  three *places* are those routes. ⚠️ It also **forbids `prerender`, `swr` and `isr` on the three
  *places*** — each is the ordinary advice for a form, a list and five numbers, and each silently
  disables the gate.
- **The allowlist is one environment variable**, `KIOKU_INVITED_EMAIL`. ⚠️ The load-bearing half is
  the *shape*: a list-shaped allowlist admits everyone when the list is empty, and Better Auth's own
  documented example narrows on the provider first, which fails open. Neither is used.
- **`sameSite: "lax"`, `path: "/"`, written out rather than inherited.** ⚠️ `strict` **breaks
  sign-in** — `defaultCookieAttributes` applies to the OAuth state cookie too, and a `Strict` cookie
  is not sent on the top-level redirect back from Google.

Also in it, and worth knowing without opening it: **there are six routes, not five** — `/auth` is the
door, ships JavaScript, and is neither a *place* nor a *mode*; `/auth/refused` is a `noScripts` page
with a message and deliberately nothing else. **`session.cookieCache` is off** because it would keep
a revoked session alive for its window.

**[`09-user-flows.md`](09-user-flows.md) — written 2026-09-07.** Nine sections. The twelve stories
walked end to end, with the concrete path of every route, which nothing had named. **Four things it
decided**, three of them ADRs:

- **`/` is Ingest**, permanently, and it inspects nothing — [ADR 0031](adr/0031-the-landing-route-is-ingest-and-never-a-decision-about-data.md).
  `08` set `callbackURL: "/"` without saying which screen that was. A chooser was rejected because
  the version worth building would land the reader in a *mode*, on their first sight of the app,
  with no navigation on the screen.
- **A *mode* is entered from a start control carrying its own count**, present on all three *places*
  and never disabled — [ADR 0032](adr/0032-a-mode-is-entered-from-a-start-control-and-done-is-the-only-way-out.md).
  ⚠️ **The exit has to be `external`** or Nuxt client-renders a *place* into the already-hydrated
  page, which is what `noScripts` exists to prevent, with no error (verification §12.1).
- **⚠️ ADR 0013 did not close the empty-*Vet* gap and could not** — the gap is on *Vet*, ADR 0013
  made *Vet* a mode, and a mode has no navigation. Done plus the affordance the canvas already drew
  is what closes it. `09` §8.
- **Done in *Vet* ends the run and spends the undo; Done in *Review* spends nothing** —
  [ADR 0033](adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md). It asks once, only when the
  run holds a rejection, and `Z` works up to the answer.
- **`S12`'s export is triggered from Stats**, as a plain `<a href="/api/export">` — full entry in the
  decision log. A link that downloads is the one write-shaped action a `noScripts` *place* can
  perform with no mechanism at all.

Also in it, and worth knowing without opening it: ***Vet* has three empty states, not one** — PRD §4
wrote one, and "nothing to vet yet, an ingestion is running" is a normal event under `S2`, not an
ending. **The streaming queue is visible on *Vet*, not on Ingest**, because Ingest has no client and
no *place* auto-refreshes. **Ingest reports what the job table knows and does not diagnose a dead
worker** — `heartbeat_at` only ticks while working, so an idle worker and an absent one look
identical, and "queued for four minutes, not picked up" is the honest sentence. **Hard-deleting a
*source* has no route in v1.**

⚠️ **It also generates two amendments to written documents**, both in the decision log's carried
list: `04` §9.1's "there is no path" to delete a `card` needs the `Z` exception, and `03` §8.1's
outbox carries `S9` flags as well as *grades*.

**[`phase-4-verification.md`](phase-4-verification.md) — the facts, checked, with sources.** Now
**twelve** sections. §1–4 from Round 1 (FSRS, Better Auth, LLM pricing, tokenisers); **§5–7 added in
Round 2** (frameworks, database, hosting + Neon + the SudachiPy measurement); **§8–9 added in
Round 3** (`noScripts` under the Vercel preset; the Python driver and what scale-to-zero does to
`LISTEN`); **§10 added while writing `04`** (Postgres 18's `uuidv7()`; Better Auth's generated
Drizzle types and its cascades); **§11 added while writing `08`** (the cookie defaults, the OAuth
state cookie, the server-side session read, and three route rules that would disable the gate);
**§12 added while writing `09`** (`<NuxtLink external>` as the only real mode exit; `SameSite=Lax`
excluding cross-site `POST`).
Everything against primary sources. **Do not re-run this.**
Re-verify only if older than ~3 months.

⚠️ **§11.1 supersedes the ⚠️ in §2.2.** `sameSite` and `path` are no longer unverified: `lax` is in
the security reference and `path: "/"` is a hard default in `createCookieGetter`. §2.2 is left as
written because §1–9 are not edited.

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

**The grilling is over. Write the remaining four documents**, in this order. `/grill-with-docs` has
nothing left to ask — the frontier is empty and every question that was open has an ADR or a dated
entry.

| Doc | Blocked on |
| --- | --- |
| ~~`08-authentication.md`~~ | **Written 2026-09-06.** ADR 0030 and two decision-log entries |
| ~~`09-user-flows.md`~~ | **Written 2026-09-07.** ADRs 0031, 0032, 0033, one full log entry and verification §12 |
| `10-screen-specifications.md` | **Unblocked. Start here.** Round 3 closed all five design questions. Owes: five interaction states, the grade labels, the Done control's geometry, the *Review* phone layout, the door and the refusal page (`08` §11), **and now six more from `09` §9** — the start block, the Done confirmation on *Vet*, the *progress rail*'s fourth mark, *Vet*'s three empty states, the *session*-size knob's two homes, and the *source* delete confirmation page. **Belongs to Phase 4, not Phase 3** — see Carrying |
| `11-testing-plan.md` | PRD S12 (exercised export) and S3 (measured median). `04` §14 names what the export test reconciles, and that the `review_log` trigger is itself testable. `08` §11 adds three: refusal on *sign-in* not just signup, a boot failure with the allowlist unset, and a 401 flush surfacing on the end screen. `09` §9 adds five more, including the `from` fallback and a `Z` that must fail on the `RESTRICT` rather than delete |

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
- **⚠️ Two pipeline findings, now carried by `03` §5.2:** numerals come back `is_oov=True` with
  `normalized_form` rewritten to ASCII (六 → `6`), which ADR 0006's *identity key* depends on — the
  rule is that numerals are excluded at candidate extraction rather than reaching the key; and
  `tokenize()`'s result is not sliceable, so anything windowing over morphemes iterates.
- **The dictionary version is now part of the ingestion cache key**, and `SudachiDict-core` is
  pinned at `20260723`. **Moving it can change the identity of existing *notes*** — it is a reviewed
  data event with a re-ingestion plan, never an automated bump. `03` §5.3 and the decision log.
- **⚠️ The laptop is the security weak point, and it is named rather than mitigated.** It holds the
  direct connection string and the model provider key at once. `03` §13.6 states what is true today
  (disk encryption, rotatable credentials, no key in the repo) and what is not (any second factor).
  This is a cost of ADR 0022's temporary shape, and part of what the move buys.
- **Backups are `S12`'s tested export, not Neon.** Free gives six hours of instant restore and one
  snapshot; six hours is not a backup for the one thing that cannot be regenerated. `03` §13.6.
- **⚠️ Better Auth's generated schema cascades from `user`, and ours must not.** Every child it
  generates carries `onDelete: "cascade"` (verification §10.2). Personal entities use **`RESTRICT`**
  instead — `04` §3 — because a copied default would let one deleted row destroy every *scheduling
  epoch* and *review log* beneath it. Better Auth keeps its own cascades; they are correct for data a
  sign-in regenerates. **The rule is not "no cascades" — it is that a cascade must never reach a
  table that cannot be rebuilt.**
- **Scheduling state lives on `scheduling_epoch`, never on `card`.** A reset is then an `INSERT`
  rather than an `UPDATE` over the history it is meant to preserve. Do not "simplify" it back onto
  the card at implementation time; `04` §7.4 is the argument.
- **`note.fields` gets no index.** No v1 query reads inside it — the card browser is cut and there is
  no field search. It is the index a future session adds on the general principle that jsonb wants a
  GIN index. It does not; queries do (`04` §11.1).
- **The stale-job sweep runs in the worker**, not on a schedule elsewhere. Vercel Cron is on
  ADR 0022's forbidden list, and the worker already polls on every connect and reconnect, so it costs
  nothing (`04` §6.4).
- ⚠️ **`prerender`, `swr` and `isr` are forbidden on Ingest, Sources and Stats.** Each is the
  ordinary advice for a route that renders a form, a list and five numbers, and each turns a
  session-gated document into a shared artifact — a prerendered route is a static asset with no
  request to gate, and Nuxt maps `isr` onto Vercel's own CDN rules. ADR 0030, verification §11.4.
  The `noScripts` smoke test's `{ prerender: true, noScripts: true }` is correct **for the test**.
- ⚠️ **The allowlist's shape is the decision, not its location.** A list-shaped allowlist admits
  everyone when the list is empty, and Better Auth's documented `validateUserInfo` example narrows on
  the provider before comparing, which fails open the day a second provider exists. `08` §4.3 uses
  neither. A missing `KIOKU_INVITED_EMAIL` stops the process.
- **There are six routes, not five.** `/auth` is the door — it ships JavaScript and is neither a
  *place* nor a *mode* — and `/auth/refused` carries a message and nothing else. This does not amend
  ADR 0013, whose taxonomy is about the five screens of the app; `08` §2 adds the boundary before
  them.
- **The remote is [`yutaasakura96/kioku`](https://github.com/yutaasakura96/kioku), public, added
  2026-09-07.** ⚠️ **Public is the constraint that matters:** `KIOKU_INVITED_EMAIL` and every other
  value in `03` §13.1 stay out of the repository, and `08` §4.1's argument for keeping the allowlist
  in the environment is now stronger than it was when it was written. `/setup-matt-pocock-skills`
  still belongs after planning.
- **`frontend-design` and `superpowers` are off at project scope**, for different reasons.
  `CLAUDE.md` § Tooling state has both correctly.
- ⚠️ **Two amendments are owed to documents that are already written**, and they are not notes for
  later. `04` §9.1's "there is no path" to delete a `card` must except the card un-minted by `Z`
  inside the vetting run that minted it (ADR 0033). `03` §8.1 describes the outbox as carrying
  *grades*; it carries *grades* and `S9` flags (`09` §4.9).
- ⚠️ **A *mode*'s Done control must be `external`.** `<NuxtLink :to="origin" external>` or
  `navigateTo(origin, { external: true })`. A bare `<NuxtLink>` client-renders the *place* into the
  page that is already running and hands the reader a `noScripts` screen with a live Vue app on it,
  with no error anywhere (`09` §5.2, verification §12.1). It is not version-specific and no upgrade
  will flag it; the `noScripts` smoke test is the cover.
- **ADR 0013 claimed to close the empty-*Vet* navigation gap and could not** — the gap is on *Vet*,
  and ADR 0013 is what made *Vet* a mode. ADR 0032 closes it with two controls that mean different
  things: Done returns to the *place* the reader came from, the quiet affordance says to go to
  Ingest. Do not "simplify" them into one.
- **The streaming queue is visible on *Vet*, not on Ingest.** Ingest ships no JavaScript, so it
  cannot poll, and no *place* auto-refreshes — a meta refresh on `/` would destroy a paste in
  progress. `S2`'s "vettable while the rest are still generating" works because the screen that has
  to show it is the one with a client (`09` §3, §7).
- ⚠️ **Branches: `develop` is where work happens, from 2026-09-07.** Yuta's decision, and it
  replaces the arrangement that stood until then, where `main` was both the default and the working
  branch. `main` is the integration branch. Neon still gets a branch per environment to match.

## Skipped

Nothing.
