# Kioku — testing plan

**Date:** 2026-09-07
**Status:** Phase 4, and the last document. Five things are decided here; three of them are ADRs
[0037](adr/0037-a-measured-criterion-is-reported-not-asserted.md),
[0038](adr/0038-two-test-databases-split-on-the-line-adr-0019-already-drew.md) and
[0039](adr/0039-the-outbox-pattern-shares-a-property-list-not-a-harness.md).

Vocabulary is [`../CONTEXT.md`](../CONTEXT.md). Requirements are
[`02-product-requirements.md`](02-product-requirements.md), cited `S1`–`S12` — **the twelve stories
are what a suite exists to hold.** Mechanisms are `03`, `04`, `08`; flows are `09`; components are
`10`. Verified facts are [`phase-4-verification.md`](phase-4-verification.md) — **§1–13 are checked
and must not be re-run.** §14 was added while writing this document, and §14.1 is a measurement.

**This is a plan, not a suite. There is still no code, and no test file.**

---

## 0. What this document decides, and what it does not

**Decides — five things:**

1. **What the measured criteria mean as tests** —
   [ADR 0037](adr/0037-a-measured-criterion-is-reported-not-asserted.md). `S3`'s median and `S10`'s
   four numbers are **reported, not asserted.** The suite tests that each number is *recorded
   correctly*; the threshold is a fact about a reader and a corpus that do not exist yet.
2. **Which tests need a real Postgres** —
   [ADR 0038](adr/0038-two-test-databases-split-on-the-line-adr-0019-already-drew.md). ⚠️ The premise
   inverted under measurement: **PGlite is PostgreSQL 18.3** and fails every foreign key, trigger and
   check `04` relies on, in 946 ms with no Docker (verification §14.1). Only the worker's three
   concurrency behaviours need a container.
3. **The `noScripts` smoke test's home** — §6.1. It stops being a first-week experiment and becomes
   three assertions in `test/e2e/`, because `@nuxt/test-utils`' `$fetch` returns the HTML
   (verification §14.3).
4. **Whether the key-handler binding is testable** — §6.2. **Not directly, and it does not need to
   be.** What is testable is the behaviour that distinguishes the two bindings.
5. **The outbox harness** —
   [ADR 0039](adr/0039-the-outbox-pattern-shares-a-property-list-not-a-harness.md). **One property
   list, three harnesses.** The three instances run in different processes and two languages.

**Cites, and does not reopen:** every ADR. This document tests decisions; it makes none about the
product.

**Does not decide:** CI. There is one reader who is also the developer, on one laptop (ADR 0022), and
where the suite runs is a Phase 6 question that the plan does not depend on.

---

## 1. The shape, in one table

| Tier | Directory | Environment | Database | What lives here |
| --- | --- | --- | --- | --- |
| **Unit** | `test/unit/` | plain Node, no Nuxt | none | Pure functions: the pipeline stages, the FSRS wrapper, the `from` allowlist, the grade validator, the metric arithmetic. ⚠️ **And §6.1's configuration assertions**, added 2026-09-09 — they read `nuxt.config` through `loadNuxtConfig()`, which needs neither a build nor a request, so the tier is "no Nuxt runtime" rather than "no file on disk" |
| **Schema** | `test/schema/` | plain Node | **PGlite** | Every constraint, trigger and delete rule in `04`, run by Drizzle's migrations |
| **Nuxt runtime** | `test/nuxt/` | `// @vitest-environment nuxt` | PGlite | Components, `mountSuspended`, the outbox against a real `localStorage` |
| **End to end** | `test/e2e/` | a built, running app | PGlite | Rendering, routing, redirects, headers, and the browser tests |
| **Worker** | `worker/tests/` | pytest | **a real Postgres 18 container** | The pipeline end to end, and the three concurrency behaviours |

⚠️ **`@nuxt/test-utils/runtime` and `@nuxt/test-utils/e2e` cannot be used in the same file**
(verification §14.3) — they need different environments. That is why `test/nuxt/` and `test/e2e/` are
two directories rather than one with a naming convention, and Nuxt's own recommended layout is the
same three (`test/` is not auto-scanned).

Runner: **Vitest 5.0.0**, which is what `@nuxt/test-utils` 4.2.0 documents as recommended. Python:
**pytest 9.1.1** with **`testcontainers` 4.15.0**.

⚠️ **Docker is required for exactly three tests** (ADR 0038). A laptop without it runs the whole
TypeScript suite and gets three red worker tests, visibly and for a stated reason.

---

## 2. The twelve stories, mapped

Every story, what holds it, and at which tier. **A story with no test is a belief** — `S12` says so
about the export and it is true of all twelve.

| Story | Held by | Tier |
| --- | --- | --- |
| **S1** Get in | An uninvited account is refused **on sign-in as well as at signup** (`08` §3.1); the process **refuses to start** with `KIOKU_INVITED_EMAIL` unset (`08` §4.3); an unauthenticated request to each of the six non-public routes gets `302` to `/auth`; `/auth/refused` carries **no link of any kind** (`10` §9.2) | e2e |
| **S2** Wall of text → notes | `POST /api/source` writes `source` + `source_chunk` + `ingestion(queued)` + `job(queued)` **in one transaction** and answers before the worker runs; a *note* is vettable while later chunks are still generating | schema + worker |
| **S3** One keystroke | `space` writes `note_vetting.state='accepted'`, stamps `seconds_to_vet` and mints the *card* — **one keystroke, no confirmation, no focus change**; `R` and `E` likewise. ⚠️ The **median is not asserted** (ADR 0037) | nuxt + schema |
| **S4** Only what needs looking at | The *provenance marker* is filled when `level_claim.authority_key IS NOT NULL` and hollow when null (`04` §14); ⚠️ **the *authority*'s name is in the DOM, not behind a hover** (`09` §4.4) | nuxt |
| **S5** Say no once | Stage 5 drops an already-*rejected* `identity_key` **before** stage 6 spends money (`03` §5.1); re-ingesting the same *source* asks about fewer *notes* | worker |
| **S6** Fix before accepting | `Enter` commits and accepts with `edited = true`; ⚠️ an edited accept counts as an **edit, not an acceptance**, in *acceptance rate*; an *accepted* note's fields are frozen | schema + nuxt |
| **S7** A session that ends | `review_session.size` rows in `review_session_card`, composed due-first; `snapshot_taken_at` is **server-side**; a graded *card* leaves and never returns; ⚠️ the end screen **never starts the next session** | schema + e2e |
| **S8** Not lose grades | ADR 0039's five properties, browser side. A *session* completed with the network off loses nothing when it returns | nuxt + e2e |
| **S9** Catch a bad card | `X` does **four things in one transaction** (`04` §7.8): `card_flag` with `prompt_version` and `model_id` denormalised, `suspended_at`, `note_vetting.flagged_at`, advance without a *grade*. ⚠️ **History untouched** | schema |
| **S10** The numbers | §3 in full | unit + schema |
| **S11** Where it came from | Deleting a *source* suspends its *cards* and leaves `review_log` **row-for-row identical**; the confirmation's count matches what the `POST` suspends; deleted *sources* stay readable | schema + e2e |
| **S12** Get everything out | §4 in full | schema + e2e |

---

## 3. `S10`, and the two numbers that cannot be asserted

[ADR 0037](adr/0037-a-measured-criterion-is-reported-not-asserted.md) is the argument. This is the
test list.

**There are no metrics tables** (`04` §13). Every number is a query over rows written by the code
that produced them, so every way it can be wrong is a bug rather than a fact about a corpus.

| Number | Asserted | The failure it catches |
| --- | --- | --- |
| *Acceptance rate* | An edited accept is an **edit**, not an acceptance (`S6`); the denominator is *notes generated*, not notes seen | The most likely arithmetic error in the app, and the one that would flatter the thesis |
| Median *seconds-per-note* | Stamped **per note at the keystroke**; over **unedited accepts only**; an even count takes the mean of the middle two | A median computed over all accepts silently includes the slow edits |
| *False-accept rate* | `count(card_flag) ÷ count(note_vetting WHERE state='accepted')`; a second flag on the same *card* is a **second row** | Deduplicating flags would under-report exactly the signal `S9` exists for |
| *Time-to-first-review* | `source.submitted_at` → the first `review_log` for a *card* **from that source** — not the first grade of any card | The near-miss implementation, which is wrong the moment a second *source* exists |
| Tokens and cost | From the API response, **never estimated** (`04` §6.1); `worker_environment` is on the row | ADR 0018's price table has an effective date; a hard-coded constant lies silently |
| **The suppression boundary** | **Nineteen suppresses, twenty reports**, with raw counts and a line saying why | ⚠️ The only branch in `S10`, and off by default in every naive implementation |

⚠️ **What is not asserted, and this is the decision:** that the median is under 5 seconds, or that
*acceptance rate* clears any floor. ADR 0018 walks the model **down** until *acceptance rate*
degrades — the number has to be free to fall, and a test that fails when it falls turns the
experiment into a regression.

**The first real run of twenty notes is an experiment with a written-down expectation**, on the
first-week list beside the `noScripts` test and the `psycopg.connect()` probe. Not a test case.

---

## 4. `S12`'s export, which `S12` itself demands be tested

> "The export is exercised by a test that reads it back and reconciles counts — an untested export
> path is a belief, not an export."

`04` §14 names the reconciliation. The test, in full:

1. Build a fixture with a *card* that has **two `scheduling_epoch` rows** — one superseded — and at
   least one `review_log` per epoch. The superseded epoch is the whole point: it is the row a system
   that stored state on the `card` would no longer have (`04` §7.4).
2. `GET /api/export`. Assert `Content-Disposition: attachment` and that the body parses as JSON —
   `fetch()` from `@nuxt/test-utils/e2e` returns `{ body, headers }` (verification §14.3).
3. **Reconcile counts** against the database for `note`, `card`, `scheduling_epoch` **including
   superseded**, and `review_log`.
4. ⚠️ Assert the export contains **no `source.content`** and no reader email — `03` §13.4 makes
   *source* text the reader's private material, and an export is a file that leaves the machine.
5. ⚠️ Assert `/api/export` **requires a session**: unauthenticated gets `302`, not a file.

**The nastiest case, and it belongs here:** an export taken while a *note* is `pending` includes the
*note* and **no `card`**, because a *card* is minted at acceptance and never before (`04` §7.3).

---

## 5. The schema tier — what `04` enforces, tested against PGlite

These are the tests that matter most and, per ADR 0038, they are also the cheapest. **The database is
built by Drizzle's own migrations** through `drizzle-orm/pglite/migrator` (verification §14.4) — a
hand-written test schema would be a second copy of `04`, and `04` §13's entire argument is that copies
drift.

| Test | Asserts | From |
| --- | --- | --- |
| `review_log` is append-only | An `UPDATE` raises. **A `DELETE` raises** | `04` §14, and the trigger is the only one in the schema |
| Nothing irreplaceable cascades | Deleting a `card` with a `review_log` **refuses on `RESTRICT`** | `04` §9 |
| ⚠️ `Z` un-mints a card | A `Z` on an acceptance deletes its *card* in the same transaction — **and fails on the `RESTRICT`** if that *card* has reached a `review_session_card` or a `review_log` | ADR 0033, `04` §9.1 (as amended) |
| One live epoch per card | The partial unique index refuses a second `scheduling_epoch` with `superseded_at IS NULL` | `04` §7.4 |
| A reset is an `INSERT` | After a reset, ordinal 1 still exists with its original `stability`, `reps` and `lapses` | `04` §7.4 |
| Soft-deleting a *source* | Suspends its *cards* with `suspended_reason='source_deleted'`; `review_log` is **row-for-row identical** before and after; the *source* stays readable | `09` §4.11 |
| The over-cap `CHECK` | `char_count > 100000` is refused by the schema as well as by the handler | `04` §5.1 |
| `rating` bounds | `0` and `5` are refused — ⚠️ **`Manual = 0` is excluded**, matching `ts-fsrs`' `Grade` type | `04` §7.5 |
| A card appears once per session | `UNIQUE (review_session_id, card_id)` — ADR 0016's *no same-day relearning* as a constraint | `04` §7.7 |
| The owner FK | `auth."user"` cannot be deleted while any history references it | `04` §3 |
| `content_hash` is **not** unique | The same *source* submitted twice creates a second `source` | `04` §5.1, PRD §5 |

⚠️ **Every one of these was confirmed runnable against PGlite before this list was written**
(verification §14.1) — the trigger raises, `RESTRICT` refuses, the partial index refuses, the
`CHECK`s refuse. This list is not aspirational.

⚠️ **Amended 2026-09-09, when the tier was built (#4).** All eleven are written and passing, in
1.8 s against one PGlite instance reset between tests, and **each was checked by sabotage rather than
assumed**: dropping the trigger, flipping one `RESTRICT` to `CASCADE`, making the partial index
non-unique, removing `NULLS NOT DISTINCT`, removing the over-cap `CHECK`, widening the `rating`
bounds, making `content_hash` unique, and flipping every `owner_id` to `CASCADE` each turn the
matching assertion red and nothing else.

**Four assertions joined the eleven**, all of them structural rather than behavioural, and each
guarding something no other test would notice:

| Test | Asserts | From |
| --- | --- | --- |
| The database is Postgres 18 or later | `uuidv7()` exists and returns a value | ⚠️ Half of a pin. `04` defaults every PK to it and PGlite does not document its version (ADR 0038) — **nothing else will tell you when the two halves diverge** |
| The table inventory | Eighteen tables in `public`, and the auth library's four **in `auth`** | `04` §8. The `auth` half is what caught the generator flag correction (`04` §8 as amended) |
| Exactly one trigger | One row in `pg_trigger`, on `review_log` | `04` §14. A second trigger is a decision someone owes an argument for |
| The note's identity | A second `(subject_id, identity_key)` is refused, and the other reading is a different note | ADR 0006 — the `開く␟ひらく` / `開く␟あく` pair the ADR exists to keep apart |

---

## 6. The three things that were open, closed

### 6.1 The `noScripts` smoke test is a test, not an experiment ⚠️

It has been carried in `00-status.md` as a first-week experiment since Round 3 — one route, `curl`,
grep for `<script`. **It stops being an experiment**, because the tool makes it a test:
`@nuxt/test-utils`' `$fetch(url)` is documented as returning "the **HTML** of a server-rendered page"
(verification §14.3).

Three assertions, in `test/e2e/`, and it was always three rather than one:

1. **A *place* ships no JavaScript.** `expect(await $fetch('/')).not.toContain('<script')`, for `/`,
   `/sources`, `/sources/:id`, `/sources/:id/delete`, `/stats` and `/auth/refused`.
2. ⚠️ **A *mode*'s Done control is a real anchor.** The rendered `/vet` contains an `<a href>` to the
   origin, and following it lands on a *place* that itself contains no `<script>`. This is the
   `external` prop (ADR 0032, verification §12.1) — **a bare `<NuxtLink>` fails this test and
   nothing else in the system would notice.**
3. **`features.noScripts` was not set app-wide.** `/vet` and `/review` **do** ship JavaScript;
   asserting the negative alone would pass on a globally broken configuration (`03` §2.1).

⚠️ **And the three route rules that would silently disable the session gate** — `prerender`, `swr`,
`isr` on a *place* (ADR 0030, verification §11.4). That is a config assertion, not an HTTP one: read
`nuxt.config`'s `routeRules` and assert none of the three appears on a non-public route. It is the
cheapest test in the suite and it guards the most dangerous single-line change in the project.

⚠️ **Amended 2026-09-09, while building #2 — assertion 2 cannot be an HTTP assertion, and the
`<a href>` alone was never enough.** Two things were measured against the built app and both change
what the test is:

- **`ssr: false` returns an app shell with an empty `<div id="__nuxt">`.** `03` §2.1 is right that
  the server returns a real document rather than a blank page, but the *page component* is not
  rendered server-side, so the Done control does not exist in the response. `$fetch('/vet')` cannot
  see it and neither could the `curl` the experiment was going to use. **Assertion 2 runs in a
  browser** — `createPage()`, which §14.3 already documents, under `setup({ browser: true })`.
- ⚠️ **Reading the `href` does not discriminate.** A bare `<NuxtLink to="/stats">` renders
  `href="/stats"` too; `external` changes what *clicking* it does, not what it says. So the
  assertion clicks Done and asserts the document that arrives carries no `<script>` — under a bare
  `<NuxtLink>` the reader never leaves the *mode*'s running application and its scripts are still
  there. **Verified both ways on 2026-09-09**: the test passes with `external` and fails without it,
  which is the whole point of writing it.

**And assertion 4 lives in `test/unit/`**, not `test/e2e/`. It reads `nuxt.config` through
`loadNuxtConfig()` and needs neither a build nor a request, so paying for the e2e tier to run it
would be the cheapest test in the suite made expensive. ⚠️ `loadNuxtConfig()` resolves Nuxt's own
defaults, so `features.noScripts` reads `false` rather than absent — the assertion is that it is
never *enabled*, and its three enabling values are `'all'`, `'production'` and `true`.

**What survives as a first-week experiment:** nothing here. The `psycopg.connect()` probe and the
Neon scale-to-zero question stay experiments, because neither is an assertion about our code.

### 6.2 The key-handler binding — not testable directly, and it does not need to be ⚠️

`10` §11 calls this a Level A conformance test: the handlers must bind to the mode container, not to
`document`, because SC 2.1.4 Character Key Shortcuts is satisfied only through its "Active only on
focus" exception (verification §13.4).

**"Where a listener lives" is not assertable.** `getEventListeners` is a DevTools API, not a web one;
inspecting Vue internals would test the framework's shape and break on upgrade; and a test that
mounts the component and checks a property would pass while the app fails.

**The behaviour that distinguishes the two bindings is assertable, and it is the thing the criterion
actually cares about.** In a browser test (`createPage`, verification §14.3):

1. Load `/vet` with a *note* in the queue.
2. Move focus **out of the mode container** — `page.keyboard.press('Tab')` to the browser's own
   chrome is not reachable, so instead focus the Done control's anchor, which is outside the
   container.
3. Press `R`. **Assert `note_vetting` is unchanged.**
4. Return focus to the container. Press `R`. Assert the *note* is now `rejected`.

A `document`-bound handler passes step 3's keypress through and fails the assertion. A
container-bound one does not. ⚠️ **This is a behavioural proxy and it is written down as one** — it
holds the property SC 2.1.4 requires without claiming to inspect the binding, and if the Done control
is ever moved inside the container the test needs re-thinking rather than re-running.

**This is ADR 0037's principle applied to a different subject:** where the thing you care about
cannot be asserted, assert its observable consequence, and say which one you did.

### 6.3 The outbox — one property list, three harnesses

[ADR 0039](adr/0039-the-outbox-pattern-shares-a-property-list-not-a-harness.md). The five properties,
asserted three times in three idioms:

1. **The write happens before the acknowledgement.** The durable record exists at the moment the
   caller was told it did.
2. **Losing the signal costs latency, never data.** ⚠️ The test **removes the signal entirely** —
   no `NOTIFY`, no network — and asserts the outcome is unchanged. This is ADR 0028's central claim
   and it is the one worth attacking directly.
3. **Replay is in order, append-only, never merges.** Two entries for the same *card* both land; the
   later timestamp wins; no conflict is resolved anywhere.
4. **The durable record decides, not client memory.** `Z`'s target is the highest `vetted_at` in the
   open run **after a reload** (ADR 0033); a stale claim is reclaimed on `heartbeat_at`.
5. **A rejected entry is surfaced, never dropped.** A *grade* stamped in the future, or before
   `snapshot_taken_at`, is refused **and shown** (`03` §8.2); ⚠️ a **401 flush reports on the end
   screen** rather than retrying on the same backoff forever (`08` §5.6, `09` §4.8).

⚠️ **Property 3 has to hold across two entry types in one stream.** `03` §8.1 was amended on
2026-09-07: the outbox carries *grades* **and** `S9` flags. The ordering that matters is a flag
landing after a grade for a different *card*, and a harness that made the two one type would have
erased the distinction the test exists to protect.

---

## 7. The worker, and the three tests that need Docker

`worker/tests/`, pytest, a real Postgres 18 container (ADR 0038).

**The three that need a second session:**

| Test | Asserts | From |
| --- | --- | --- |
| The job claim | Two workers claim **different** rows. `FOR UPDATE SKIP LOCKED` with the row lock held for the length of the `UPDATE`, **not the length of the job** | `04` §6.4, `03` §3.2 |
| The stale-claim sweep | A job in `claimed` with `heartbeat_at` older than five minutes returns to `queued` at the next worker's poll. ⚠️ **The sweep runs in the worker**, not on a schedule elsewhere — ADR 0022 forbids Vercel Cron | `04` §6.4 |
| The reconnect | The connection drops, notifications fire while nobody is listening, the worker reconnects — and **`LISTEN` happens before the poll**. Polling first leaves a window where a notification lands unheard | ADR 0028 |

**And the pipeline, which needs no second session but does need Python:**

| Test | Asserts |
| --- | --- |
| Stage order | Stages 4 and 5 run **before** stage 6 — no generation call is made for a *candidate* already known or *rejected* (ADR 0010, `S5`) |
| ⚠️ Numerals | 六 comes back `is_oov=True` with `normalized_form` rewritten to `6`, and **the candidate is excluded before it reaches the identity key** (`03` §5.2). This is a recorded finding that will otherwise return as a bug |
| ⚠️ Morphemes are not sliceable | Any windowing code iterates. `morphemes[:10]` raises `TypeError` (`03` §5.2) |
| The cache key | All **four** parts — content-chunk hash, **dictionary version**, prompt version, model id (`03` §5.3). A key missing the dictionary version serves stale results after a SudachiDict bump |
| `Dictionary()` once | Constructed once per process; a test that constructs it twice and measures RSS is the guard (verification §7.3) |
| Resume | A run that fails part-way keeps partial results and re-runs **only unprocessed chunks** (PRD §5) |
| ⚠️ The cross-language declaration | The Python view of the *subject* declaration matches the JSON file, and its field list matches TypeScript's. `03` §6 already specified this test — it is the two-toolchain tax, and it is the one test that exists in both suites by design |

---

## 8. What is tested at a seam, and what is only tested end to end

**Seams — pure, fast, no database, `test/unit/`:**

- **The pipeline stages** as functions over tokens → candidates → notes. `03` §5.1's seven stages are
  already a list of pure transformations.
- **The FSRS wrapper.** ⚠️ Not FSRS itself — `ts-fsrs` is a dependency with its own suite. What is
  ours is the mapping to and from `scheduling_epoch`, and ⚠️ that **`enable_short_term` is off** and
  `enable_fuzz` is on (ADR 0016). A test that asserts grade 1 schedules **at least one day out**
  catches a configuration regression that would otherwise surface as a worse retention curve in six
  months (verification §13.1).
- **The `from` allowlist.** Three strings; anything else falls back to `/` (ADR 0032). ⚠️ Test the
  attacks: `//evil.com`, `https://evil.com`, `/vet`, `/stats/../../x`, empty, absent.
- **The grade validator** — `03` §8.2's future-skew and before-snapshot rules, as a pure function.
- **The metric arithmetic** — §3, over fixture rows.

**End to end only, because there is no seam to hold them:**

- The `noScripts` rendering and the `external` Done control (§6.1) — the failure is *what the
  framework emitted*, and nothing smaller can observe it.
- The sign-in flow through Google's redirect (`08` §2).
- ⚠️ The `POST`-redirect-`GET` pair. The over-cap paste is answered `200` **with the text still in
  it** (`09` §4.2), which is a property of the response body and cannot be checked at a seam.
- The outbox surviving the network being gone (§6.3, properties 1–2).

---

## 9. What is deliberately not tested in v1

Named so each is a decision rather than a gap.

- **The thesis.** ADR 0037. The suite says the instrument is built correctly and nothing about what
  it will read.
- ⚠️ **Model output quality.** ADR 0018 made the model a **measurement** because verification §3
  found no benchmark for Japanese structured extraction — so a golden-output assertion would encode
  one session's opinion as a regression, *and* spend money on every run, *and* be flaky by
  construction. **What is tested is the boundary, not the output:** that generation is validated
  against the *subject* declaration before anything is written (`03` §7, and neither Drizzle nor
  Kysely validates `jsonb` at runtime); that `model_id` and `prompt_version` are recorded per field
  (ADR 0004); that the cache key has all four parts. Generation tests use **recorded fixtures and
  never call a provider.** The quality question is answered by ADR 0018's acceptance-rate walk, which
  is an experiment.
- **Visual regression.** One reader, one canvas, and `05` plus `10` are the specification. A
  screenshot suite would encode the canvas as the authority, which `05` §9 explicitly says it is not.
- **Load and performance.** One reader. `04` §11's indexes each name the query that needs them; that
  is the whole performance story until there is a second reader.
- **A cross-browser matrix.** The reader's own browser, plus one phone for *Review* (ADR 0026).
  Kioku is "a desktop application that can be studied on a phone", and testing more surface than that
  claims more support than the product does.
- **Accessibility beyond the three conformance points already named** — SC 2.1.4 (§6.2), SC 2.5.8 and
  the AA contrast floor ADR 0024 established. No automated audit tool: at seven screens it would
  report on components the system does not have.
- **Better Auth's own behaviour.** `08` is citation; the tests assert **our** configuration — the
  allowlist's shape, `sameSite: "lax"`, `cookieCache` off — not the library's correctness.
- **Hard deletion.** It has no route (`09` §4.11) and no screen. A test would be testing a migration
  written by a person, and the guard is `04` §9.1 being read.

---

## 10. What this hands forward

- ~~**Phase 6** — the four pins a routine cleanup must not touch (`03` §13.5) now have a fifth
  neighbour.~~ ⚠️ **Discharged 2026-09-08 — `03` §13.5 was amended and the list is now six.**
  **PGlite's version is load-bearing:** `04` defaults every primary key to `uuidv7()`, a Postgres 18
  built-in, so a PGlite that regressed to 17 would fail on the first migration (verification §14.1)
  — pinned as `@electric-sql/pglite` 0.5.8 **with the Postgres image tag beside it**, which is a pin
  in two places. `drizzle-orm` 0.45.2 was added in the same amendment as the sixth; it had been
  cited as a pin by `CLAUDE.md` and by ADR 0038 while `03` §13.5 did not carry it.
- **Phase 6** — `@nuxt/test-utils`' `setup({ host })` runs the e2e tier against an already-running
  server and the docs claim "a significant reduction in test execution timings" (verification §14.3).
  Worth taking once the suite is slow enough to notice, and not before.
- **The first-week list, now shorter.** The `noScripts` smoke test has become §6.1 and leaves it. The
  `psycopg.connect()` probe and the Neon scale-to-zero question stay, because neither is an assertion
  about our code. **`S3`'s first real run of twenty notes joins the list** (ADR 0037).
- **Nothing for a later document.** This is the last one.

**Nothing here depends on a Vercel-only feature**, and one alternative was refused specifically to
keep that true: a Neon branch per test run would have made the suite the second thing to port, and
the thing you need working *while* you port the first (ADR 0038). ADR 0022's move stays a Nitro preset
change plus a `pg_dump`.
