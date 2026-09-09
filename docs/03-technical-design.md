# Kioku — technical design

**Date:** 2026-09-06
**Status:** Phase 4. The stack is closed (ADRs 0020, 0021, 0022). This document is how the pieces
fit, not which pieces they are.

Every stack choice below was argued in an ADR and is cited rather than re-argued. Where this
document decides something new — and it does, in five places — the section says so and gives the
reason, so a future session can tell a consequence from a preference.

Vocabulary is [`../CONTEXT.md`](../CONTEXT.md). Requirements are
[`02-product-requirements.md`](02-product-requirements.md), cited as `S1`–`S12`. Verified facts are
[`phase-4-verification.md`](phase-4-verification.md), cited by section. **Do not re-verify it** —
nine sections, checked 2026-09-06 against primary sources.

---

## 0. What this document does not decide

- **The schema.** No tables, no columns, no types. That is
  `04-database-schema.md`, and **the note's storage shape is deliberately
  still open** — `06-decision-log.md` carries the recommendation and the honest counter-argument.
  Where a mechanism here implies something structural (the job table's claimed/unclaimed
  distinction, the *scheduling epoch*), it is named as an input to `04` and left there.
- **What the screens look like.** [`05-design-system.md`](05-design-system.md) and
  `10-screen-specifications.md`.
- **Which model wins.** ADR 0018 made that a measurement, not a document.
- **The answers to the three first-week experiments** (§18). Nothing below assumes them.

---

## 1. The shape

Three processes and one database. Two of the processes are ours; only one of them is reachable
from the internet.

```
                    ┌──────────────────────────────────────┐
   reader ─https─▶  │  Nuxt 4.5.2 on Vercel                │
                    │  · Ingest / Sources / Stats  (places) │
                    │  · Vet / Review              (modes)  │
                    │  · Better Auth, Google OIDC          │
                    └───────────────┬──────────────────────┘
                                    │ pooled connection string
                                    │ (PgBouncer, transaction mode)
                                    ▼
                    ┌──────────────────────────────────────┐
                    │  Neon Postgres 18                     │
                    │  branch per environment               │
                    │  the job table is the truth (ADR 0028)│
                    └───────────────▲──────────────────────┘
                                    │ direct connection string
                                    │ LISTEN / NOTIFY, no pooler
                    ┌───────────────┴──────────────────────┐
                    │  Python worker — the reader's laptop  │
                    │  · SudachiPy tokenisation             │
                    │  · LLM generation                     │
                    │  no inbound port, no HTTP surface     │
                    └───────────────┬──────────────────────┘
                                    │ https
                                    ▼
                         model provider API (ADR 0018)
```

**The worker is not addressable.** It has no listening socket, no route, no API key of its own to
verify. It reads the job table directly, which is ADR 0015's second and now load-bearing argument:
with no HTTP job endpoint, `S1`'s *refused at every route* is literally true rather than nearly
true. ADR 0017 named the seam this closes — Better Auth's `validateUserInfo` gates *sign-in*, not
API-key verification, so any `x-api-key` endpoint would be protected by "only keys I issued exist".
There is no such endpoint.

**Consequence to keep:** the whole attack surface is the Nuxt app. The whole *spend* surface is the
laptop. §13 works through both.

---

## 2. The app tier

**Nuxt 4.5.2, Vue, Nitro v2 (`nitropack ^2.13.4`), Node `^22.19.0 || ^24.11.0 || >=26.0.0`** —
ADR 0020, verification §5.5. Node 20 is out.

### 2.1 The rendering split is enforced by the build, not by discipline

ADR 0013 made three screens *places* and two of them *modes*. That split is the reason Nuxt was
chosen at all, and it is expressed per route:

| Route | Rule | Why |
| --- | --- | --- |
| Ingest, Sources, Stats | `routeRules: { noScripts: true }` | A form, a list and five numbers. They ship no JavaScript at all |
| *Vet*, *Review* | `routeRules: { ssr: false }` | Client-owned state — a *session* snapshot, an outbox, a keystroke budget |

**Write `routeRules.noScripts` and `features.noScripts`.** `experimental.noScripts` and the route
rule `experimentalNoScripts` both still exist at v4.5.2 and are **both deprecated** (verification
§8). A future session copying an older recommendation will reach for the wrong name.

⚠️ **`features.noScripts` is app-wide and must not be set here.** It is typed
`'production' | 'all' | boolean` and applies to everything. *Vet* and *Review* need JavaScript;
stripping it globally breaks both. The per-route rule is the whole mechanism.

Two properties fall out of `noScripts` and are accepted rather than worked around:

- **Navigation between a *place* and a *mode* is a full document load, in both directions** — ADR
  0020 accepted this for three screens with no client state.
- **A `noScripts` route has no client-side middleware, because it has no client.** Route protection
  is therefore server-side only (§13.2). This is a feature: there is no client guard to bypass.

`ssr: false` is a **build-time optimisation only** (verification §5.5) — the Node server still
returns a real document for *Vet* and *Review*. They get an app shell, not a blank page.

### 2.2 Identity

**Better Auth 1.7.3 with Google OIDC and database sessions** — ADR 0017, verification §2. The
catch-all lives at `server/api/auth/[...all].ts`; the client is `createAuthClient` from
`better-auth/vue`.

Two independent refusals, as ADR 0017 requires: `user.validateUserInfo` (fires on `create-user`,
`link-account` **and `sign-in`**, receiving the fresh provider profile on the sign-in pass) and
`socialProviders.google.disableSignUp: true` (per-provider — there is no global equivalent).
Sessions expire in 7 days with a sliding 1-day refresh.

⚠️ **The documented Nuxt gotcha collides with the rendering split, and the usual fix does not
work here.** Better Auth documents that client actions other than `useSession` do not forward
cookies during SSR, and offers `<ClientOnly>` or `useRequestHeaders(['cookie'])` as the fix
(verification §5.5). `<ClientOnly>` renders nothing on a `noScripts` route. **On Ingest, Sources
and Stats the session is read server-side, and `<ClientOnly>` is never the answer.**

### 2.3 Server state

Postgres, through Drizzle (`drizzle-orm` 0.45.2 — ADR 0021). Nothing else. No cache tier, no
session store, no queue service: at one reader, every one of those would be a deploy unit buying
nothing, and each would be a Vercel-shaped dependency the move in ADR 0022 has to unpick.

⚠️ **Drizzle's `jsonb().$type<T>()` is compile-time protection only** and validates nothing at
runtime (verification §6.4). Whatever `04` decides about the note's storage shape, the *subject*
declaration is validated at the application boundary, on the way in. §6 says where that
declaration comes from.

---

## 3. The worker tier

**Python. `sudachipy` 0.6.11 with `SudachiDict-core` 20260723 in C split mode (ADR 0019),
`psycopg[binary]` ≥ 3.2.4 on Neon's direct endpoint with `autocommit=True` (ADR 0027).** One
process, started and stopped with the reader's working session — never a permanent daemon
(ADR 0022).

### 3.1 The loop

ADR 0028 is the whole of it: **the job table is the truth and `NOTIFY` only shortens latency.**

1. Connect on the **direct** connection string, `autocommit=True`.
2. **`LISTEN` first.**
3. **Then poll** the job table for unclaimed work, and drain it.
4. Block on `Connection.notifies(timeout=…)`.
5. On a notification — poll and drain. The payload is not read.
6. On the timeout expiring — check for a shutdown signal, and go back to waiting. **No query.**
7. On any connection error — reconnect, and resume at step 2.

**Steps 2 and 3 are in that order and the order is the decision.** Polling first opens a window
between the query returning and the subscription existing, in which a notification lands with
nobody listening. ADR 0028 names this as the easy thing to get backwards.

**Step 5 does not trust the notification.** The wake-up is a signal that the table is worth
re-reading; the query decides what is there. The payload carries nothing, which also sidesteps
Postgres's 8000-byte payload limit entirely (verification §6.3) — there is no key to send because
nothing depends on receiving it.

**Step 6 does not poll**, and that is deliberate. A periodic query is a keepalive: every connection
resets Neon's scale-to-zero timer (verification §7.2), so a metronome poll would hold the compute
awake and spend the month's budget on asking a question whose answer arrives by notification
anyway. While a session is live, `NOTIFY` is reliable — it is only the *torn-down* session that
loses notifications, and step 7 into step 3 is what catches those up.

**`autocommit=True` is not stylistic.** Without it, psycopg opens an implicit transaction on the
first statement and the listening connection sits idle *in a transaction*, where Neon's
`idle_in_transaction_session_timeout` default of 5 minutes (verification §7.2) would kill it on a
schedule.

**The version floor is a reason, not a pin.** Before psycopg 3.2.4, notifications arriving between
`LISTEN` and the start of the generator were silently lost (ADR 0027) — which is exactly steps 2
through 4. A dependency cleanup that sees only a number will relax it and reintroduce a failure
that is invisible until a job goes missing.

### 3.2 Claiming

A job is claimed with `SELECT … FOR UPDATE SKIP LOCKED` — Postgres's own docs name this as the
queue pattern and warn it is unsuitable for anything else (verification §6.3). At one worker it
buys nothing today. It costs nothing either, and ADR 0015's revisit condition is a second worker,
which is exactly when it starts mattering.

The claimed/unclaimed distinction is **an input to `04`**, not a design decision here beyond this:
a claim must survive the worker's laptop closing mid-job, so it is a row state with an owner and a
timestamp rather than a lock held for the life of a job.

### 3.3 Reconnect policy, and the one thing it must not become

On connection loss the worker reconnects with bounded backoff, capped at 30 seconds, **for as long
as the process is running**. It does not run overnight.

⚠️ **Whether a held `LISTEN` connection defers Neon's scale-to-zero is unknown** — Neon documents
what *wakes* an idle compute and never what prevents suspension (verification §9.2). This design
does not depend on the answer. What is worth knowing is the budget either way: Free grants **100
CU-hours per project per month**, roughly 400 combined wall-clock hours at 0.25 CU across *both*
branch computes. A worker running eight hours a day for a month is ~240 of them. It fits on either
answer, and it stops fitting the moment the worker becomes a daemon.

If the experiment comes back badly, the lever is the backoff, not the architecture: lengthen it and
pay in *time-to-first-review*, or take ADR 0022's move to EC2 or Lightsail earlier.

### 3.4 SudachiPy

**Construct `Dictionary()` exactly once per process.** There is no caching between constructions —
a second one in the same process costs the same 9 ms *and its own memory mapping*, walking RSS from
76 MB to 148 MB to 220 MB (verification §7.3). This is the single easiest thing to get wrong in the
worker, because the mistake looks like ordinary per-job setup.

Measured, on macOS arm64 and indicative rather than authoritative for a Linux container: dictionary
load **9 ms**, steady-state RSS **93–136 MB**, throughput ~2M characters/second. **256 MB is
viable, 512 MB is comfortable.** ⚠️ On Linux, mapped clean pages are charged to the cgroup, so a
hard 256 MB cap under pressure means repeated major faults rather than necessarily an OOM kill, and
container storage is far slower than the NVMe this was measured on.

⚠️ **`SudachiDict-core` is 68 MB and publishes no musl/Alpine wheels** (verification §4.4, §7.1).
The base image is glibc. `manylinux2014_aarch64` wheels exist for every supported Python, so the
ARM line stays open for ADR 0022's destination.

---

## 4. The database tier

**Neon Postgres 18, a branch per environment** (ADR 0022). Branching is copy-on-write and each
branch gets its own compute, which also scales to zero.

### 4.1 Two connection strings, on purpose

| Consumer | String | Why |
| --- | --- | --- |
| The Nuxt app | **pooled** (`-pooler` in the hostname) | Connection-per-request. PgBouncer transaction mode, `max_client_conn=10000` |
| The Python worker | **direct** | **The pooled endpoint cannot `LISTEN` at all** |

This is not a tuning preference. PgBouncer in transaction mode does not support `LISTEN`/`NOTIFY`,
`SET`, `PREPARE`, `WITH HOLD CURSOR`, `LOAD`, or session-level advisory locks — confirmed against
both Neon's and PgBouncer's own lists (verification §7.2, §9.2). A worker on the pooled string does
not run slowly; it silently never wakes.

The direct endpoint is bounded by `max_connections` — 104 at 0.25 CU, 7 reserved, **97 usable**.
One worker uses one.

**Use Neon's issued connection strings verbatim.** ADR 0027 is explicit: no `options=endpoint%3D…`
rewriting, no hand-edited TLS parameters. `psycopg[binary]` bundles libpq 17.2, which sets
`sslsni=1` by default, and the string Neon issues already carries what it needs.

### 4.2 One migration owner

**Drizzle owns every migration; the worker never issues DDL.** Two toolchains against one database
is already the tax ADR 0019 accepted knowingly, and two of them able to alter the schema would make
"what shape is this table" a question with two answers. The worker reads and writes rows. `04`
owns what those rows are.

⚠️ Better Auth's `getMigrations` **does not work with the Drizzle adapter** (verification §2.3) —
its schema is generated (`npx auth@latest generate --adapter … --dialect …`) and then lands in the
Drizzle migration flow like everything else. Whether *personal* entities take their owner foreign
key against Better Auth's `user.id` directly or against an app-level table is `04`'s call, per
ADR 0017.

---

## 5. The ingestion pipeline

One *ingestion* turns one *source* into *pending notes* (`S2`). It is a background job from the
first instruction, because `S2` requires submitting a *source* to return control immediately, and
because a synchronous wait would lose the work on the dropped connection §2.2 makes likely.

### 5.1 Stages, in order

The *subject* names them (ADR 0003); a subject that does not need a stage omits it. For JLPT
vocabulary:

| # | Stage | Scales with | Notes |
| --- | --- | --- | --- |
| 1 | **Accept and chunk the source** | document size | ≤ 100,000 characters, refused above it before any spend |
| 2 | **Tokenise** — SudachiPy, C split mode | document size | `dictionary_form`, `reading_form`, `normalized_form`, `is_oov`, `part_of_speech` |
| 3 | **Extract candidates** | document size | Compounds survive: C mode keeps 図書館 whole |
| 4 | **Deduplicate against the corpus** | candidates | ADR 0006's *identity key*. Collision appends an *occurrence* |
| 5 | **Filter known and rejected** | candidates | ADR 0006 made rejection permanent, so this shrinks as the corpus grows |
| 6 | **Generate** — the LLM, per surviving note | **new notes only** | ADR 0010's whole point. Cache key in §5.3 |
| 7 | **Write pending notes** | new notes | Streamed: written as produced, not at the end |

**Stages 4 and 5 run before stage 6, and that ordering is ADR 0010.** Whole-document stages scale
with the document; per-note generation scales with *new* material. Ordered the other way, full
price is paid to generate notes that are discarded a moment later — and `S5` says the fiftieth
*source* must ask about fewer *notes* than the fifth.

**Notes stream into the *vetting* queue as they are produced** (`S2`). "Background" must not
degrade into "wait for the whole document", which would put *time-to-first-review* at the mercy of
document size.

### 5.2 Two findings that shape stage 2, and neither is optional

Both were measured, both are in verification §7.3, and both will otherwise be rediscovered as bugs.

- ⚠️ **Numerals come back `is_oov=True` with `normalized_form` rewritten to ASCII** — 六 becomes
  `6`. ADR 0006 puts `normalized_form` in the *identity key*, so a numeral-heavy *source* keys
  strangely and, worse, keys *consistently* strangely, which is how it survives review. **The
  pipeline needs an explicit rule**: numerals are excluded at candidate extraction rather than
  reaching the identity key. Excluding them is right on product grounds anyway — a *note* whose
  term is `6` is not vocabulary. `is_oov` is also what *provenance* uses to distinguish a
  looked-up reading from a generated one (ADR 0019), so the flag is read twice for two reasons.
- ⚠️ **`tokenize()`'s result is not sliceable.** `morphemes[:10]` raises `TypeError`. Any chunking,
  windowing or preview over morphemes iterates.

### 5.3 The cache key, and a correction it needs

ADR 0010 set the key at **(content-chunk hash, prompt version, model id)**. Beyond saving money on
re-ingestion, it is what makes the pipeline replayable, which is the only way a bad card is
debugged after the fact.

**New here, and small: the dictionary version belongs in the key too.** SudachiDict ships
regularly — the pinned release is `20260723`. A dictionary upgrade changes tokenisation, which
changes candidate extraction, which changes `normalized_form`, **which is half of ADR 0006's
identity key**. Under the current key, a dictionary bump silently serves cached results computed
against a different tokenisation of the same text. The key becomes **(content-chunk hash,
dictionary version, prompt version, model id)**. It costs one field in `04` and it makes the
dictionary version a visible input rather than an ambient one.

**Consequence, and it is the sharper half:** a SudachiDict upgrade is a data event, not a routine
dependency bump. It can change the identity of *notes* that already exist. It is pinned, and §13.5
says who is allowed to move it.

### 5.4 Failure part-way through

PRD §5's ugliest ingestion case is the one that chose the mechanism (ADR 0015): **partial results
are kept.** Notes already produced stay *pending*, the *source* is marked incomplete, and resuming
re-runs only unprocessed chunks. Discarding a half-finished ingestion throws away money already
spent.

Per-chunk progress is therefore durable in the database rather than in process memory — and once
that record exists, it *is* the queue. That is why there is no queue service.

---

## 6. One subject declaration, two toolchains

**New in this document, because ADR 0019 created the problem and ADR 0003 did not anticipate it.**

ADR 0003 makes a *subject* one declaration with three consumers: the LLM's structured-output
contract, the *note type*'s field list, and the *card templates*. It also names the pipeline stages
in order. ADR 0019 then put the pipeline in Python and left the other three in TypeScript. **The
declaration now has consumers in two languages, and the failure ADR 0003 exists to prevent — the
contract, the field list and the templates drifting apart — comes back as a cross-language version
of itself.**

The decision: **the declaration is language-neutral data in the repo — JSON, one file per
subject, under `subjects/` — and neither toolchain owns it.** JSON rather than YAML because both
sides parse it with nothing installed. TypeScript derives its types and its runtime validator from
the declaration; Python reads the same file for its stage list and field names.

**The guard is a test, not a convention:** one test per side asserts that its view of the
declaration matches the file, and the field list is compared across the two. A drift that a
compiler cannot catch is caught by the thing that can.

This is the two-toolchain tax ADR 0019 recorded as its own weakest point, arriving on schedule and
in a shape that was predictable. It is not an argument to reopen ADR 0019; it is what that ADR said
it would cost.

---

## 7. The generation boundary

**Generation sits behind a provider boundary with a declared output schema** (ADR 0018). The
working default is `claude-sonnet-5`, with `claude-opus-5` run once as a ceiling probe, walked
*down* toward `gpt-5.6-luna` until measured *acceptance rate* degrades. **Which model wins is a
measurement, not a document** — and starting cheap would confound the instrument §5 exists to
build.

Design consequences the boundary has to carry:

- **Streaming, never batch.** All three providers make batch mutually exclusive with streaming, and
  `S2` requires notes to appear as produced (verification §3.3).
- **Model id and prompt version are recorded per field**, as *provenance* (ADR 0004), and per
  ingestion in the cache key (ADR 0010). The comparison between models is a query over data already
  stored, not a separate experiment.
- **The price table is configuration with an effective date, not a constant.** `S10` reports cost
  per ingestion; published prices change, and a hard-coded table starts lying silently.
- **Token counts come from the API response.** The 0.85 tokens-per-Japanese-character planning
  ratio carries ±30% uncertainty and was measured on OpenAI's `o200k_base`; neither Anthropic nor
  Google publishes a tokeniser (verification §3.4).
- **Structured output is validated on arrival**, against the subject declaration (§6) — not trusted
  because the provider documents constrained decoding, and not trusted because Drizzle typed the
  column (§2.3).

---

## 8. The review tier

**Client-owned, and the only screen in the app with a latency criterion.**

`ts-fsrs` 5.4.2 implements FSRS-6 (verification §1). Four grades — `1 Again / 2 Hard / 3 Good /
4 Easy` — with `enable_short_term` off, so a *session* stays a fixed twenty (ADR 0016).

⚠️ `ts-fsrs` is a **scheduler only, with no optimiser**. Optimisation is a separate route and
**nothing forces it into the client** — it can run server-side, later. The thresholds not to
conflate: `fsrs-rs` returns defaults below **8 items** (a hard floor); the Anki manual says
optimisation performs poorly under **a few hundred** reviews (a practical one). Neither is near.

**Queue ordering, new-card introduction and daily caps are the app's job**, not FSRS's
(verification §1.4) — consistent with `L4` having deferred exactly that.

### 8.1 The outbox, which is the same shape as the worker's

ADR 0007 and ADR 0014: the *session* snapshot and the *grade* outbox both persist to
`localStorage`. At twenty cards the snapshot is on the order of 10 KB and the outbox a few hundred
bytes, which is why IndexedDB buys nothing here.

**A *grade* is stamped at the moment it is given. The server never stamps a grade on receipt.**
FSRS schedules on elapsed time, so a card answered at 09:00 underground and stamped at 18:00 tells
the scheduler that recall took nine hours, and every interval derived from it is wrong in six
months' time.

⚠️ **The outbox carries two kinds of entry, not one** (added 2026-09-07): a *grade*, and an `S9`
flag written by `X`, which suspends a *card* and returns its *note* to the vetting queue (`09` §4.9,
`04` §7.8). `S9` says the suspension is immediate, and immediate has to survive the same tunnel the
*grades* do.

The outbox is **append-only, single-device, replays in order, never merges, resolves no conflicts**
(ADR 0007). This is the same pattern as ADR 0028's worker loop and ADR 0015's job table, a third
time: **write immediately, treat the signal as a hint, let the durable record decide.**

⚠️ **`@vueuse/nuxt` disables `useStorage` from auto-import** — it clashes with a Nuxt built-in
(verification §5.5). ADR 0014's storage path is an explicit import, not an ambient one.

### 8.2 A client-stamped timestamp is client-controlled

**New here.** ADR 0007 decided *that* the client stamps the grade; nothing decided what the server
does with a stamp it cannot trust. A wrong system clock — not malice, just a laptop back from a
different timezone — writes review history that FSRS cannot be told to ignore, and §2.4 says review
history is the one thing that cannot be regenerated.

The rule: on replay the server **rejects a grade stamped in the future beyond a small skew
allowance, and rejects one stamped before its own session snapshot was taken.** A rejected grade is
surfaced to the reader rather than dropped silently — it is one of the few things the reader can
actually fix. Everything in between is accepted as given, which is the whole point of stamping it
client-side.

---

## 9. Where state lives

| State | Lives in | Authority | Notes |
| --- | --- | --- | --- |
| Sources, notes, occurrences, level claims | Postgres | Postgres | *Shared* (ADR 0012) |
| Cards, scheduling state, epochs, grades, vetting state | Postgres | Postgres | *Personal* — owner from the first row written |
| Ingestion jobs and per-chunk progress | Postgres | Postgres | The truth (ADR 0028) |
| Auth session | Postgres + cookie | Postgres | Database sessions, 7 days, sliding |
| The current *session* snapshot | `localStorage` | Postgres | A bounded cache, not a replica |
| The *grade* outbox | `localStorage` | Postgres, after replay | Append-only, in order, never merges |
| Ingest / Sources / Stats client state | — | — | **There is none.** They ship no JavaScript |

The last row is the point of ADR 0013 and §2.1. Three of the five screens have no client state to
manage because they have no client.

---

## 10. Repository layout

One repository, two toolchains (ADR 0015: same repo, same codebase). The root is the Nuxt project,
so Nuxt 4's own conventions apply unmodified — `srcDir` defaults to `app/`, and `server/`,
`shared/`, `public/`, `modules/` and `layers/` resolve against the root.

```
kioku/
  app/            Nuxt srcDir — pages, components, layouts, composables
  server/         Nitro — API routes, server middleware, auth catch-all
    api/auth/     Better Auth [...all] handler
    db/           Drizzle schema and migrations   → owned by 04
  shared/         types and utils shared between Vue and Nitro
  public/
  subjects/       subject declarations, language-neutral JSON  → §6
  worker/         the Python ingestion worker
    pipeline/     one module per stage, named by the declaration
  docs/           this file and its siblings
  nuxt.config.ts
```

`subjects/` sits at the root rather than under either side, because it belongs to neither (§6).
`worker/` carries its own dependency manifest and its own lockfile — the two ecosystems do not
share one, and pretending otherwise is how a two-toolchain repo starts lying about what is
installed.

---

## 11. Error handling — what the reader sees

Empty states are requirements (`PRD §4`) and so is this. Every row below is a case the PRD or an
ADR already named; the column that is new is what appears on screen.

| Case | The reader sees | Behind it |
| --- | --- | --- |
| Source over 100,000 characters | Refused, with a message to split it | Refused **before any spend**. The cap is a judgement about what a human will vet |
| Identical source resubmitted | An offer to open the existing one | A new *source* either way. No LLM spend — the cache key covers it |
| Ingestion produced zero new notes | How many candidates were filtered, and by which filter | **A success, not an error**, and the expected steady state as the corpus grows |
| Ingestion failed part-way | The *source* marked incomplete, with what completed and a resume action | Partial results kept; resume re-runs unprocessed chunks only |
| Model provider erroring or rate-limiting | The same incomplete state — the provider is not named at the reader | Bounded retries with backoff, then the chunk is marked failed and the job stays resumable |
| Worker not running | *Pending* work sits pending, and Ingest says so plainly | The laptop is a documented part of v1 (ADR 0022), so this is a state, not an outage |
| Grade flush failing | **Nothing, mid-session.** The interface never waits on the flush | The outbox retries. The end screen reports any grades still unsent rather than implying they landed |
| Grade rejected on replay | A named, fixable message — the clock was wrong | §8.2 |
| Uninvited account | A 403 and no path onward | Two independent refusals (§2.2). There is no signup to fall back to |

**What gets logged:** structured JSON lines to stdout on both tiers — Vercel's log drain for the
app, the terminal for the worker. Every log line carries the ingestion or session id so the two
sides can be read together.

**What is never logged:** source text, note fields, the reader's email (an id instead), any
connection string, any API key.

**Nothing durable depends on a log.** The four numbers `S10` reports are rows written by the code
that produced them (§12), not metrics scraped from output — which is what makes them survive the
move in ADR 0022, and Vercel's Hobby retention, whatever it turns out to be.

---

## 12. Observability is the product, not the plumbing

`S10` makes four numbers the *output* of v1 rather than reporting added to it: *acceptance rate*,
*time-to-first-review*, *false-accept rate* and median *seconds-per-note*, plus tokens and cost per
ingestion. All six are written as rows at the moment they happen, because none can be reconstructed
afterwards:

- *Seconds-per-note* is stamped at *vetting*, per note, from day one.
- *Time-to-first-review* needs the submit instant and the first grade instant on the same clock.
- *False-accept rate* needs the `S9` flag recorded **against the note's source and prompt version**
  — without the third part you learn "some cards are bad" rather than "prompt v3 writes bad example
  sentences", and only the second is actionable (ADR 0004).
- Tokens and cost come from the API response, per ingestion (§7).

Below 20 vetted notes the ratios are suppressed and only raw counts show (`S10`).

⚠️ **Early *time-to-first-review* figures are measured against a laptop and are not comparable
across the move to a server** (ADR 0022). Recorded on the number, not just in this paragraph.

No APM, no error tracker, no analytics in v1. One reader who is also the developer is standing next
to every failure.

---

## 13. Security baseline

Mandatory, per the phase's own exit criterion. `S1` is the requirement; this is the mechanism.

### 13.1 Where secrets live

**Never in the repo.** Two locations, because there are two processes:

| Secret | Held by | Mechanism |
| --- | --- | --- |
| Pooled `DATABASE_URL` | Nuxt app | Vercel environment variables, per environment |
| `BETTER_AUTH_SECRET`, Google client id and secret | Nuxt app | Same |
| Invited email address | Nuxt app | Same — one value, per ADR 0017 |
| **Direct `DATABASE_URL`** | Worker | A gitignored `.env` on the laptop |
| **Model provider API key** | Worker | Same |

**The app tier never holds the model provider key.** Generation happens only in the worker, so the
process with an internet-facing surface has no ability to spend money, and the process that can
spend money has no internet-facing surface. That is worth stating because it is easy to undo later
by adding one convenience endpoint.

Environment variables per environment, matching Neon's branch-per-environment: production never
shares a string with development.

### 13.2 How input is validated, and where

**Server-side, always. Three of the five screens have no client to validate on** (§2.1), which
makes the usual mistake structurally impossible.

- **Route protection is Nitro server middleware.** Every route, including every API route, resolves
  a session server-side before doing anything. `S1` says *refused at every route*, and there is no
  client guard anywhere in the app to be bypassed.
- **Source text** is capped at 100,000 characters and checked server-side before the job is
  written — before any spend, per PRD §5.
- **Model output** is validated against the subject declaration on arrival (§7), because neither
  Drizzle nor Kysely validates `jsonb` at runtime (verification §6.4).
- **Replayed grades** are validated for rating, ownership, and the timestamp rules in §8.2. The
  outbox is the one place where client-authored data becomes permanent history.
- **Every query goes through Drizzle's parameterisation.** ⚠️ `drizzle-orm` 0.45.2 exists because
  of a SQL-injection fix in `sql.identifier()` / `sql.as()` (verification §6.4) — raw identifier
  interpolation is the one place the ORM does not protect, and it is not used.

### 13.3 Transport

HTTPS end to end. Vercel terminates TLS for the app. The worker reaches Neon over TLS using the
issued connection string unmodified — `psycopg[binary]` bundles libpq 17.2, which sets `sslsni=1`
by default (§4.1). **Nothing in this design exposes a local port to the internet**, because the
worker has no inbound surface at all (§1).

### 13.4 Sensitive data

| Data | Treatment |
| --- | --- |
| Reader's email and Google profile | Better Auth's tables. Never logged; an id in logs instead |
| Session tokens | `httpOnly` + `secure` cookies in production. ⚠️ Better Auth's docs do not state default `sameSite` or `path` (verification §2.2) — set both explicitly rather than inheriting an unverified default |
| **Source text** | The reader's own material, and it can be anything. Never logged, never in an error message, never in a metric |
| API keys and connection strings | §13.1. Never logged, never in an error surfaced to the screen |

**One egress, named so it is not discovered later: source text is sent to the model provider.**
That is what *ingestion* is. It is worth writing down because the corpus is private material and
the reader should be choosing that consciously rather than finding out from a bill.

⚠️ **Neon's at-rest encryption is not covered by `phase-4-verification.md`. Do not claim it until
it is checked.** The claim this design does rest on is §13.6's, and that one is under our control.

### 13.5 Dependencies

Two ecosystems, two flows. ⚠️ **Corrected 2026-09-07:** the remote now exists
([`yutaasakura96/kioku`](https://github.com/yutaasakura96/kioku), public) and this paragraph named it
as the trigger. That was the wrong trigger — **a bot has nothing to read until a manifest exists**,
and there is no `package.json` and no `requirements.txt` yet. The honest statement is a cadence and a
corrected trigger: **a manual check on both manifests once they exist, and Renovate or Dependabot
configured in the same commit that adds the first one.**

**Seven pins that a routine cleanup must not touch.** ⚠️ **Amended 2026-09-09, adding `better-auth`**
— the last bullet. ⚠️ **Amended 2026-09-08, adding two.** The
fifth is PGlite's version, which
[ADR 0038](adr/0038-two-test-databases-split-on-the-line-adr-0019-already-drew.md) made load-bearing
and `11-testing-plan.md` §10 handed forward rather than amending in. The sixth is `drizzle-orm`,
which **was already being cited as a pin by two documents that read this section** — `CLAUDE.md`
§ Tooling state listed it in place of `ts-fsrs`, and ADR 0038 calls it "the version `03` §13.5
pins" — while this list did not carry it. §13.2 had the reason all along. Both are now here.

- `psycopg[binary]` **≥ 3.2.4** — the floor is the lost-notification fix (§3.1), not a number.
- **`SudachiDict-core` 20260723** — an upgrade can change the identity of existing notes (§5.3). It
  is a deliberate, reviewed data event with a re-ingestion plan, never an automated bump.
- **Nuxt 4.5.2 with `nitropack ^2.13.4`** — verification §8 established `noScripts`' behaviour
  against those exact versions. ⚠️ **Nuxt 5 is scheduled for Q4 2026**, inside the project's first
  year, and it re-opens that question rather than inheriting the answer.
- **`ts-fsrs` 5.4.2** — 6.0.0 removes `elapsed_days` (verification §1.2). `04` builds no column on
  it, so the major is survivable, but it is a data review rather than a version bump.
- **`drizzle-orm` 0.45.2** — a **security floor**, not a preference: the version exists because of a
  SQL-injection fix in `sql.identifier()` / `sql.as()` (§13.2, verification §6.4). It is also what
  builds both test databases — 0.45.2 exports `./pglite/migrator` alongside
  `./node-postgres/migrator` (ADR 0038, verification §14.4), which is what stops the test schema
  forking from `04`. **Below this version the ORM's own protection is the thing that regresses**, so
  a downgrade is never a routine cleanup.
- ⚠️ **`@electric-sql/pglite` 0.5.8, and the Postgres image tag beside it** — ADR 0038, verification
  §14.1. **This one is a pin in two places and neither half is optional.** `04` defaults every
  primary key to `uuidv7()`, a Postgres 18 built-in, so a PGlite that regressed to 17 fails on the
  first `CREATE TABLE` — and PGlite's own documentation does not state which PostgreSQL it builds,
  which is why 0.5.8 = **PostgreSQL 18.3** had to be measured rather than read. **Nothing will tell
  you when the two halves diverge except a `uuidv7()` that stops existing.**
- ⚠️ **`better-auth` 1.7.3, exactly** — added 2026-09-09 with #5. `08` §1 names the version and
  `08` §7 builds a practice on it: the four tables are **generated** into
  `server/db/schema/auth.ts` and nothing in them is remapped, **precisely so the file can be
  regenerated and diffed against what is deployed.** That only means anything against a known
  version. A minor bump that changes a generated column changes the shape of a table this project
  does not own, and drizzle-kit would emit the migration without anyone deciding to. **It is a
  regenerate-and-review event, not a version bump** — the same shape as `SudachiDict-core` above,
  for the same reason.

⚠️ **One `overrides` entry, and it is not a pin.** `package.json` carries
`"overrides": { "better-auth": { "vitest": "$vitest" } }`.

`better-auth` declares `vitest` as an **optional peer** at `^2 || ^3 || ^4`, for test helpers this
project never imports; the repo is on `vitest` 5, and npm refuses the install over a peer nothing
uses — measured 2026-09-09, `ERESOLVE` on npm 12.0.2. The override says that peer is satisfied by
the version already in the tree, and it is scoped to `better-auth`'s own subtree: the install added
seven packages, with no SvelteKit and no TanStack Start among them.

⚠️ **`--legacy-peer-deps` is the wrong answer, and it is the one the error message suggests.** It
turns off peer checking **for the life of the project** — every future mismatch, in every package,
silently — to get past one optional peer. Remove the override when `better-auth` widens the range,
not before.

### 13.6 The worst thing an attacker could do

**Destroy review history.** Everything else in the system can be regenerated — cards from sources,
notes from a re-ingestion, even the corpus from the original documents. Scheduling state cannot
(§2.4, ADR 0011). The runner-up is spending the ingestion budget, which is money; this one is time
that cannot be bought back.

What stops it:

1. **Invite-only, refused twice** — `validateUserInfo` on every sign-in with the fresh provider
   profile, plus per-provider `disableSignUp`. Two mechanisms without a shared failure mode
   (ADR 0017).
2. **No self-registration, ever** (ADR 0012) — not deferred, rejected. There is no account-creation
   path to attack.
3. **No HTTP job endpoint** (ADR 0015), so there is no API-key surface where the allowlist does not
   apply — the seam ADR 0017 named and closed.
4. **Deletion preserves history by design.** Deleting a *source* *suspends* its cards; hard
   deletion is a separate deliberate act that still preserves history (`S11`, ADR 0011).
5. ⚠️ **Backups are the export, not the platform.** Neon Free gives **6 hours of instant restore
   and one snapshot** (verification §7.2). Six hours is not a backup for the one irreplaceable
   thing in the system. `S12`'s export — *notes*, *cards*, *grades* and every *scheduling epoch*
   including superseded ones, **exercised by a test that reads it back and reconciles counts** — is
   what makes §2.4's claim true, and it is run on a named cadence rather than when something feels
   wrong. This is the same reasoning that rejected Hetzner in ADR 0022: an untested backup is a
   belief.

**And the honest weak point: the laptop.** It holds the direct connection string and the model
provider key at once, which is the whole system in one place — the direct string is the one that
can drop a table. What is true today: full-disk encryption, no key in the repo, and both credentials
rotatable in one dashboard action each. What is not true today: any second factor between a
compromised laptop and the database. **That is the cost of ADR 0022's temporary shape**, and it is
one of the things the move to EC2 or Lightsail is buying.

---

## 14. External services, and what happens when each is down

| Service | Depended on for | When it is down |
| --- | --- | --- |
| **Neon** | Everything | The app is down and the worker cannot claim. This is the single point of failure and it is accepted at one reader — the mitigation is `S12`'s export, not redundancy |
| **Vercel** | The five screens | The app is down; the worker keeps draining claimed work into a database that is still up. Nothing is lost |
| **Model provider** | Stage 6 only | Ingestion stalls; bounded retries, then the chunk is marked failed and the *source* stays resumable (§11). Nothing already generated is discarded. ADR 0018's boundary means switching providers is configuration |
| **Google OIDC** | Sign-in only | Existing 7-day sessions keep working; new sign-ins fail. There is no password fallback, and adding one would be a second way in to a system whose thesis is that there is one |
| **The laptop** | Ingestion | *Pending* work stays pending, *vetting* and *review* are unaffected. This is a documented state of v1, not an outage — and ADR 0022's revisit condition is the first time it stops being acceptable |

---

## 15. What it costs

| Scale | Infrastructure | Generation |
| --- | --- | --- |
| **0 readers** | **$0** — Vercel Hobby, Neon Free, a laptop | $0 |
| **1 reader (v1)** | **$0**, within Free's 100 CU-hours, 0.5 GB storage and 5 GB egress | ~**$1.00** per ingestion at `claude-sonnet-5`; **$6–$250** across fifty ingestions depending where ADR 0018's walk lands |
| **1,000 readers** | Not a target, and the honest answer is that it does not happen | — |

The third row is not a dodge. `PRD §6` rejects multiple readers, and ADR 0022 says what breaks
first regardless: Neon Free's 0.5 GB storage and 100 CU-hour ceiling, and ⚠️ **Vercel Hobby's
"restricted to non-commercial personal use only"**, which is a hard term. The move to EC2 or
Lightsail happens long before scale does, and it is triggered by ingestion needing to run while the
laptop is off — not by load.

**The generation figures are the ones that matter**, and ADR 0018 already made the argument: across
fifty ingestions the whole model range is $6 to $250, and the validity of the thesis measurement is
worth more than the difference.

---

## 16. The three hardest problems

**1. Resumable streaming ingestion, where the expensive step is irreversible.**
Notes must appear as they are produced (`S2`) while a part-way failure keeps everything already
paid for (PRD §5), and the LLM call in the middle costs money each time it runs. The plan is
per-chunk durability: chunk, key (§5.3), generate, write, record the chunk complete — so a resume
is a query for incomplete chunks and never a judgement call. The thing to get right first is that
the cache key covers **every input that changes the output**, which is why the dictionary version
joined it.

**2. The identity key surviving real Japanese.**
ADR 0006 keys a note on *(dictionary-form term, reading)* via `normalized_form`, and two things
already push on it: numerals rewrite to ASCII with `is_oov=True` (§5.2), and a dictionary upgrade
can silently redefine identity (§5.3). The plan is an explicit numeral rule at extraction, a pinned
dictionary in the cache key, and `is_oov` read as *provenance* rather than ignored. What has not
been tested is a real 100,000-character source; the first ingestion is that test.

**3. One declaration across two toolchains without drift.**
§6. The failure mode ADR 0003 was written to design out returns in a form no compiler catches. The
plan is language-neutral declaration data plus a cross-language test, and the honest note is that
this is ADR 0019's recorded cost arriving on schedule.

---

## 17. Portability — what must not happen

ADR 0022's premise is that the move to EC2 or Lightsail is **a Nitro preset change plus a
`pg_dump`**. Every design choice above was made to keep that true:

- **Nothing depends on a Vercel-only feature.** No Vercel KV, no Vercel Blob, no Vercel Cron.
  Everything lives in Postgres. This is the single rule that decides whether the move is a
  configuration change or a rewrite.
- **No object store in v1.** *Sources* are text; 100,000 characters is ~300 KB and belongs in
  Postgres with everything else. When an original binary is worth keeping, the answer is the
  developer's own S3 — decided, not built, and already at the destination (ADR 0022).
- **The worker is already portable**, because it was never on Vercel. It moves by changing which
  machine runs it.
- **The metrics are rows, not platform telemetry** (§11), so they survive the move — except
  *time-to-first-review*, whose *values* do not compare across it (§12).
- ⚠️ **There is no official Nuxt Docker guide** (verification §5.5). The container is ours to write,
  and the documented entrypoint is `NODE_ENV=production node .output/server/index.mjs` with
  `NITRO_PORT` / `NITRO_HOST`. Alpine is out on the worker side (§3.4); keep the two images
  consistent rather than discovering the constraint twice.

---

## 18. Open, deliberately

**One decision, and it is not this document's:**

- **The note's storage shape** — `notes.fields` as `jsonb` with a relational provenance table, or
  both as blobs. ADR 0021 carries the recommendation and the honest counter (the row-lock argument
  is weak at one reader). It closes in **`04-database-schema.md`**, where the surrounding columns
  and delete behaviour make it answerable against real queries rather than in the abstract.
  Everything in this document is written to work either way.

**Three first-week experiments. Nothing above assumes an answer to any of them:**

| Experiment | What it settles | If it goes badly |
| --- | --- | --- |
| **The `noScripts` smoke test**, ~15 min — one route `{ prerender: true, noScripts: true }`, one `{ noScripts: true }` alone, `curl` both and grep for `<script` | That §2.1's mechanism works on the deployed target. The second route is the runtime path. Verification §8 proved the *absence* the conclusion rests on; nothing upstream tests the combination | ADR 0020's revisit condition fires and Nuxt's advantage narrows to the per-route switch alone |
| **One `psycopg.connect()`** against the direct Neon endpoint | Verification §9.1 is documentary; a live connection falsifies it in a minute | ADR 0027 names asyncpg as the cheap fallback, and ADR 0028 keeps correctness out of the notification path either way |
| **Whether an idle `LISTEN` connection defers Neon's scale-to-zero** | The **cost** question only (§3.3). Neon is silent in both directions | Lengthen the reconnect backoff and pay in *time-to-first-review*, or take ADR 0022's move earlier |

**Named, so they are not mistaken for oversights:** no cache tier, no queue service, no error
tracker, no APM, no second worker, no object store, no client-side route guards. Each is absent for
a reason given above, and each is a thing a future session will be tempted to add on general
principle.

**Inputs handed to `04-database-schema.md`:**

- The job table's **claimed/unclaimed distinction**, with a claim that survives the laptop closing
  (§3.2).
- **Per-chunk ingestion progress**, durable (§5.4).
- **The dictionary version in the cache key** (§5.3).
- **No column built on `elapsed_days`** — deprecated, removed in `ts-fsrs` 6.0.0, derivable from
  `last_review`. **`learning_steps` is required**, not optional (verification §1.2).
- **`ReviewLog` rows stored from day one** — they are what an optimiser consumes later, and they
  cannot be reconstructed (verification §1.2, ADR 0011).
- **Whether *personal* entities' owner foreign key targets Better Auth's `user.id` or an app-level
  table** (ADR 0017).
- **The note's storage shape**, above.
