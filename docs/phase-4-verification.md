# Phase 4 — verification findings

**Date checked:** 2026-09-06. **Status:** facts only. Nothing here is a decision.

`CLAUDE.md` requires that anything about a library, an API, FSRS, pricing or a Japanese
tokeniser is checked against real documentation before it becomes a decision. This is that
check, recorded so it is not re-run. Decisions made *from* these facts go to `adr/` and
`06-decision-log.md`; the shape they justify goes to `03-technical-design.md`.

**Re-verify before implementation if more than ~3 months old.** Versions and prices move.

---

## 1. FSRS — the scheduler (§2.3)

| | |
| --- | --- |
| Current algorithm | **FSRS-6** — 21 parameters, trainable forgetting-curve decay |
| Algorithm licence | MIT (`fsrs4anki`); `fsrs-rs` is BSD-3-Clause |
| TS implementation | **`ts-fsrs` 5.4.2**, released 2026-09-01, MIT, ~150k weekly downloads |
| Implements | FSRS-6. Pure TypeScript (ESM/CJS/UMD). **Scheduler only — no optimiser** |

FSRS-6 vs FSRS-5: new same-day stability formula, the decay constant became trainable, linear
damping on post-review difficulty, 17 → 21 parameters.

⚠️ **Blog posts claiming an "FSRS-7" could not be corroborated** in any open-spaced-repetition
repo, wiki or release. Treated as false. `ts-fsrs`'s own badge points at FSRS-6.

### 1.1 The grade set — exactly four

```ts
export enum Rating { Manual = 0, Again = 1, Hard = 2, Good = 3, Easy = 4 }
export type Grade = Exclude<Rating, Rating.Manual>
```

`Manual = 0` is an operator escape hatch, explicitly excluded from `Grade`. `repeat()` returns
`{ [key in Grade]: RecordLogItem }` — it always computes all four outcomes.

A two-button app is legal (map onto `Again=1` / `Good=3`) but the grade value is load-bearing
arithmetic, not a label — `e^(w₁₇·(G−3+w₁₈))`. Emitting only two grades leaves `w₃`, `w₄` and the
Hard-penalty weight permanently untrained if the history is ever optimised against.

### 1.2 Card state — schema input for `04`

```ts
interface Card {
  due: Date
  stability: number
  difficulty: number
  elapsed_days: number    // DEPRECATED — removed in ts-fsrs 6.0.0
  scheduled_days: number
  learning_steps: number  // required, newer than most FSRS docs
  reps: number
  lapses: number
  state: State            // New=0, Learning=1, Review=2, Relearning=3
  last_review?: Date
}
```

**Two constraints for `04-database-schema.md`:**

- **Build no column on `elapsed_days`.** It is deprecated and disappears in 6.0.0. Derivable
  from `last_review`.
- **`learning_steps` is required**, not optional.

`ReviewLog` rows carry `rating, state, due, stability, difficulty, elapsed_days` (dep.),
`last_elapsed_days` (dep.), `scheduled_days, learning_steps, review: Date`. **This is what the
optimiser consumes later, so it is stored from day one** — consistent with §2.4 and ADR 0011.

`FSRSParameters`: `request_retention, maximum_interval, w: number[], enable_fuzz,
enable_short_term, learning_steps: Steps, relearning_steps: Steps`.

### 1.3 Optimisation

Not in `ts-fsrs`. Routes: `@open-spaced-repetition/binding` 0.5.0 (MIT, 2026-06-06, WASI,
Node ≥20, **marked public beta, API may change**), `fsrs-browser` (WASM), `fsrs-rs` (Rust),
`fsrs-optimizer` (Python). **Nothing forces it into the client** — it can run server-side.

Thresholds, not to be conflated: `fsrs-rs` returns defaults below **8 items** (hard floor);
the Anki manual says optimisation performs poorly under **a few hundred** reviews (practical
floor), and monthly re-optimisation suffices.

### 1.4 What FSRS does *not* do

Only "given memory state and a grade, what is the next interval". **Queue ordering, new-card
introduction rate, daily review caps and weekday balancing are the app's job** — which is
consistent with PRD L4 having deferred exactly that. The one exception is fuzz:
`enable_fuzz: boolean`, default `true`, lives in the library.

**Sources:** [algorithm wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm) ·
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) ·
[fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) ·
[Anki deck options](https://docs.ankiweb.net/deck-options.html)

---

## 2. Better Auth — identity (ADR 0012)

| | |
| --- | --- |
| Version | **1.7.3**, MIT, published 2026-09-06. Near-weekly releases, 29,839 stars, actively maintained |
| Google | First-class social provider |
| Sessions | **Database sessions by default.** JWTs opt-in via a separate plugin |

### 2.1 Blocking self-registration — three layers, all first-class

ADR 0012's requirement is met by a documented, typed, purpose-built gate rather than a
hand-rolled hook.

**`user.validateUserInfo`** is the load-bearing one. It fires on `create-user`, `link-account`
**and `sign-in`** — and on the sign-in pass it receives the *fresh* provider profile, not the
stored row. Rejection returns 403 programmatically, or redirects to the error URL. It covers
every auth method, so the policy lives in one place.

```ts
user: {
  validateUserInfo: ({ user, source }) => {
    if (user.email !== INVITED_EMAIL) {
      return { error: "not_invited", errorDescription: "Access is invite-only" }
    }
  },
}
```

**`socialProviders.google.disableSignUp: true`** — per-provider; unknown accounts get a
documented `signup_disabled` error. **There is no global top-level `disableSignUp`.**

**`databaseHooks.user.create.before`** — throw `APIError` to abort creation. The docs recommend
this specifically for stateless mode.

Using the first two together gives **two independent refusals** — the "guard it in more than one
place" pattern `CLAUDE.md` takes from `lfca-lab`.

### 2.2 Sessions and cookies

`expiresIn` 7 days, `updateAge` 1 day (sliding; `disableSessionRefresh` turns it off),
`freshAge` 1 day for sensitive operations. `httpOnly` + `secure` in production. Optional
`session.cookieCache` (default 5 min) serves the session from a signed cookie to skip the DB read.

⚠️ **Unverified:** the docs do not state default `sameSite` or `path`.

### 2.3 Schema — input for `04`

Owns four tables: **`user`, `session`, `account`, `verification`**. `user` is
`id, name, email (unique), emailVerified, image?, createdAt, updatedAt`; `account` carries
`providerId` + `accountId`. **All remappable** via `modelName` / `fields`, extendable via
`additionalFields`.

Adapters: Kysely (PostgreSQL, MySQL, SQLite/D1, MSSQL), Prisma, Drizzle, MongoDB.
CLI: `npx auth@latest migrate` (**Kysely only**) and `npx auth@latest generate --adapter … --dialect …`.

### 2.4 Background jobs — not cookie-only

**`apiKey()` plugin** — `x-api-key` header by default; with `enableSessionForAPIKeys` it injects
a synthetic session so `getSession` works unchanged downstream. SHA-256 hashing, expiry,
per-key rate limits. Server-side `auth.api.verifyApiKey({ body: { key } })`.
**`bearer()` plugin** — the docs caution it is only for APIs that cannot use cookies.

⚠️ **Boundary that matters to PRD S1:** `validateUserInfo` gates *sign-in*, **not** API-key
verification. A job endpoint's protection is "only keys I issued exist", not the allowlist.
If the worker reads the job table directly rather than over HTTP, no such route exists.

### 2.5 Runtimes

Framework-agnostic, Web-standard `Request`/`Response`. Documented integrations include Next.js,
Nuxt, SvelteKit, TanStack, Solid Start, React Router, Astro, Hono, Express, Fastify, Elysia,
NestJS, Nitro, Convex, Expo, Electron. **Cloudflare Workers needs the `nodejs_compat` flag**
(`AsyncLocalStorage`). ⚠️ **Unverified:** no explicit Deno or Bun support statement.

### 2.6 Alternatives, and why they lose here

- **Auth.js / NextAuth v5** — `signIn` callback is an equally first-class allowlist, but **v5 is
  still `5.0.0-beta.32`** after years, is more Next-coupled, and gives no API-key story.
- **Clerk** — has literal invite-only mode, but **since Aug 2025 allowlist/blocklist apply to
  sign-ups only, not sign-ins**, which directly fails S1's "refused at every route". Restriction
  features also need a paid plan in production.
- **Lucia** — **deprecated**; npm carries a deprecation notice. Now a learning resource.

---

## 3. LLM providers — generation (ADR 0004, ADR 0010)

### 3.1 Pricing, $/MTok

| Provider | Model | Input | Output | Cache read |
| --- | --- | --- | --- | --- |
| Anthropic | `claude-haiku-4-5` | 1 | 5 | 0.10 |
| Anthropic | `claude-sonnet-5` | 2 | 10 | 0.20 |
| Anthropic | `claude-opus-5` | 5 | 25 | 0.50 |
| Anthropic | `claude-fable-5-1` | 10 | 50 | 0.25 |
| OpenAI | `gpt-5.6-luna` | 0.20 | 1.20 | 0.02 |
| OpenAI | `gpt-5.6-terra` | 2.00 | 12.00 | 0.20 |
| OpenAI | `gpt-5.6-sol` | 4.00 | 20.00 | 0.40 |
| OpenAI | `gpt-6-astra` | 10.00 | 50.00 | 1.00 |
| Google | `gemini-3.5-flash-lite` | 0.30 | 2.50 | 0.03 |
| Google | `gemini-3.8-flash` | 0.75 | 3.75 | 0.075 |

⚠️ **Gemini's prices are promotional and double on 2027-01-01.** Since PRD S10 reports
cost-per-*ingestion*, **the price table must be configuration with an effective date, not a
constant**, or Stats begins lying on New Year's Day.

### 3.2 Structured output — all three support it

Anthropic and OpenAI both document **constrained decoding** and use the word *guarantee*
(Anthropic: `output_config.format` with `json_schema`, or `strict: true` on a tool; assistant
prefill now 400s). Google documents schema-conformant output but ⚠️ **does not use the word
"guarantee" and does not say whether it is constrained decoding or schema-conditioned prompting.**

### 3.3 Streaming vs batch — decided by the PRD, not by preference

Batch is **50% off on all three**, ceiling 24 hours, no latency guarantee. **Batch and streaming
are mutually exclusive on all three.** PRD S2 requires *notes* to appear as they are produced and
*time-to-first-review* has a ten-minute budget, so **batch is ruled out**. Resolution is chunking:
stream each chunk so early items land while later chunks still run.

**Gemini is the cleanest fit** — its docs state streamed chunks are **valid partial JSON**.
Anthropic and OpenAI stream fragments accumulated and parsed at block end.

### 3.4 Cost per ingestion — ~100k Japanese chars, ~800 terms

**Assumptions, stated:** 0.85 tokens/char, measured with `js-tiktoken` `o200k_base` over four
Japanese samples (range 0.68–0.89) ⇒ ~85k input + ~15k system prompt across 10 chunks;
~80k output (800 × ~100 tok).

| Model | Standard | Batch |
| --- | --- | --- |
| `gpt-5.6-luna` | $0.12 | $0.06 |
| `gemini-3.5-flash-lite` | $0.23 | $0.12 |
| `gemini-3.8-flash` | $0.38 | $0.19 |
| `claude-haiku-4-5` | $0.50 | $0.25 |
| `claude-sonnet-5` | $1.00 | $0.50 |
| `gpt-5.6-sol` | $2.00 | $1.00 |
| `claude-opus-5` | $2.50 | $1.25 |
| `gpt-6-astra` | $5.00 | $2.50 |

**Cost is not a differentiator** — the whole range is trivial per *ingestion*. **Output tokens are
~80% of cost**, so trimming per-*note* verbosity is worth far more than prompt caching, which
saves ~$0.01–0.02 here.

⚠️ **±30% uncertainty.** The ratio is measured on OpenAI's `o200k_base`; neither Anthropic nor
Google publishes a tokeniser, and Anthropic's docs note the Opus 4.7+ family changed tokeniser.
**Re-baseline with each provider's `count_tokens` endpoint before trusting a cost number.**

### 3.5 Japanese quality — no benchmark answers the question

- **Artificial Analysis Multilingual (Japanese)** exists but **does not cover the cheap models**
  this workload would actually use.
- **Nejumi** (W&B Japan) and **Swallow** (Institute of Science Tokyo) are the credible
  Japanese-specific leaderboards; current frontier-model entries were not verified.
- **JGLUE** targets pretrained-model evaluation, not API comparison.
- Anthropic's own 96.8% Japanese figure is a **vendor self-report**.

**No published benchmark tests reading (furigana) accuracy, JLPT-level estimation, or Japanese
structured extraction.** The documentation cannot pick a model. An in-house eval set — or §5's
own *acceptance rate* — is the only instrument that can.

---

## 4. Japanese tokenisation — the pipeline's first stage (ADR 0003, ADR 0006)

### 4.1 The finding

**Sudachi is the only option that supplies all three fields this project needs.**

| Field | Why it is needed |
| --- | --- |
| `dictionary_form()` | Half of ADR 0006's *identity key* |
| `reading_form()` | The other half |
| **`normalized_form()`** | Collapses 引っ越し / 引越し / 引越 into one key |

The third has no equivalent elsewhere and **ADR 0006 already specified the behaviour it
provides** — collision appends an *occurrence* rather than duplicating.

Sudachi's **C split mode** also preserves compounds. UniDic splits 図書館 into 図書 + 館, which
for a vocabulary product is the difference between a *note* and a fragment.

Per the Sudachi authors' own comparison, SudachiDict is the only resource that is both manually
checked and continuously maintained (shipped **20260723**).

### 4.2 The trap

**`kuromoji` — the obvious JS choice — is dead.** v0.1.2, published **2018-03-19**; dictionary is
**mecab-ipadic-2.7.0, unchanged since 2007** and missing terms as basic as 令和. Its maintained
forks (`@patdx/kuromoji`, `@sglkc/kuromoji`, `kuromoji.js`, `@faanau/kuromoji`, `kuromojin`) are
**packaging and browser-compat only — none updates the dictionary or the analysis code.**

Also disqualified for lacking a reading field: **Suzume** (verified against its shipped
`index.d.ts`), Vaporetto, BudouX, TinySegmenter.

### 4.3 Routes to Sudachi

| Route | Version / date | Maturity | Notes |
| --- | --- | --- | --- |
| **`sudachipy`** (Python) | 0.6.11, 2026-04-13 | Reference impl; spaCy's Japanese pipeline uses it | Prebuilt wheels. **`SudachiPy` ≥0.6 *is* `sudachi.rs`** — the old repo is archived, the engine is active |
| **`@nikkei/napi-sudachi`** (Node) | 0.12.0, 2026-07-16 | ⚠️ **2 GitHub stars, <1 yr history** | Apache-2.0, prebuilt binaries, no compiler. Identical engine |
| `lindera-nodejs` (fallback) | 5.3.0, 2026-08-16 | Larger community, MIT | IPADIC-era lemmas, **no normalized form**. `details[6]` lemma, `details[7]` reading |

**Both Node routes run the identical Rust engine, so extraction quality is the same** — the
difference is wrapper maturity, not accuracy.

### 4.4 Deployment constraints for `03`

- **Dictionary size:** SudachiDict small **39 MB**, core **68 MB** (default), full **120 MB**.
- ⚠️ **No musl/Alpine binaries** are published for `lindera-nodejs` or `@nikkei/napi-sudachi`.
  glibc-gnu targets only. This constrains the base image.
- Cold start: the Rust bindings read a prebuilt `.dic`. `kuromoji` inflates ~17 MB of gzip into
  JS heap on every boot — the worst profile of the lot.
- ⚠️ `lindera-nodejs`'s README says `npm install lindera`, but **npm 404s on `lindera`**; the
  published name is `lindera-nodejs`, and the binding **lags the Rust crate by a major version**.

### 4.5 Honesty flags

- ⚠️ **No quantitative accuracy benchmark exists** comparing IPAdic / UniDic / SudachiDict.
  Every dictionary-quality claim above is **qualitative**, from the Sudachi LREC 2018 paper and
  Paul McCann's dictionary overview. **Do not invent a number.**
- ⚠️ Every IPADIC-based option gives **no reading for out-of-vocabulary words**. That is the bulk
  of the quality gap, and why Sudachi's `is_oov()` matters.
- ⚠️ Lindera's `details` indices are documented **for IPADIC only**. Verify positions by running
  it if a different dictionary is chosen.
- ⚠️ No published throughput figure for Sudachi at 100k characters. Do not quote one unmeasured.

**Sources:** [Sudachi LREC 2018](https://aclanthology.org/L18-1355.pdf) ·
[Japanese Tokenizer Dictionaries](https://www.dampfkraft.com/nlp/japanese-tokenizer-dictionaries.html) ·
[sudachi.rs](https://github.com/WorksApplications/sudachi.rs) ·
[SudachiDict](https://github.com/WorksApplications/SudachiDict) ·
[napi-sudachi](https://github.com/Nikkei/napi-sudachi) ·
[Lindera](https://github.com/lindera/lindera)

---

## 5. The app framework (§4.12, ADR 0020)

**Checked 2026-09-06.** Versions from the npm registry; capability claims from each framework's own
docs.

### 5.1 Versions

| Package | Latest | Published |
| --- | --- | --- |
| `next` | 16.3.4 | 2026-08-31 |
| `@tanstack/react-start` | 1.168.49 | 2026-08-22 |
| `astro` | 7.3.1 | 2026-09-03 |
| `react-router` | **8.3.1** (v7 line: 7.18.3) | 2026-08-28 |
| `@sveltejs/kit` | 2.70.3 | 2026-08-18 |
| `nuxt` | **4.5.2** | 2026-08-05 |
| `@solidjs/start` | 2.0.4 | 2026-08-24 |

All actively maintained, none archived. **React Router stable is 8, not 7** — v8 drops the
`react-router-dom` re-export, and Better Auth's integration page is still written against v7.
Remix 3 reached RC 2026-08-31 as a separate single-dependency framework.

### 5.2 The two capabilities ADR 0013 actually needs

| | Per-route SSR off | Route ships no JS |
| --- | --- | --- |
| Nuxt | `routeRules` ⚠️ *experimental* | **`noScripts`** |
| SvelteKit | `ssr` / `csr` per page | `csr = false` |
| Astro | `prerender = false` | zero-JS by default |
| TanStack Start | `ssr: false \| 'data-only'` | — |
| Next.js App Router | ⚠️ none — only `'use client'` | — |
| React Router 8 | ⚠️ app-wide only | — |
| SolidStart 2 | ⚠️ none found | — |

⚠️ React Router's global `ssr: false` **errors at build time on any `action` export**, which would
break a server-rendered Ingest form.

**Serverless disqualifies none of them** — all seven document a long-running Node target.

### 5.3 Better Auth integration depth

A dedicated page exists for all seven. By size: Next ~13.8KB · React Router ~9.6KB · TanStack
~6.5KB · Nuxt ~6.1KB · SvelteKit ~4.6KB · Astro ~4.3KB · SolidStart ~1.3KB.

### 5.4 TanStack Start's stable status — contradictory, do not record as stable

npm publishes `1.168.49` as `latest`, but the live `main` docs still carry the release-candidate
banner. The v1 RC post is dated **2025-09-23** — the banner has stood ~11.5 months. ⚠️ **No
first-party stable-1.0 announcement found.** Sibling `@tanstack/solid-start` is at `2.0.0-rc.6`.

### 5.5 Nuxt specifics

- **`routeRules` is labelled experimental** in the config reference — "API may change in the future."
- `ssr: false` "excludes its page component from the server bundle… **This is a build-time
  optimization only; it does not change what the server sends to the browser.**" The Node server
  still returns a real document. Hybrid rendering is **unavailable under `nuxt generate`**.
- **`noScripts` is documented per-route** via `routeRules` as well as app-wide. Omits entry scripts,
  import map, inlined payload and JS resource hints; CSS untouched; never hydrates; forces the
  buffered non-streaming renderer. **Navigation to such a route is a full document load, in both
  directions.** Interactive island slots and `nuxt-client` components will not hydrate there.
- **Better Auth + Nuxt:** catch-all Nitro handler (`server/api/auth/[...all].ts`),
  `createAuthClient` from `better-auth/vue`, `authClient.useSession(useFetch)` for SSR.
  ⚠️ **No official Nuxt module** — four community ones listed as resources. The page never mentions
  `ssr: false`, `routeRules`, `noScripts`, or database-vs-JWT sessions. Documented gotcha: client
  actions other than `useSession` **do not forward cookies during SSR**; fix with `<ClientOnly>` or
  `useRequestHeaders(['cookie'])`.
- **Release policy:** yearly majors, each supported **≥6 months after the next major**.
  ⚠️ **Nuxt 5 is scheduled Q4 2026 (estimated).** Nuxt 3 EOL'd 2026-07-31.
- **Nitro:** Nuxt 4.5.2 runs Nitro **v2** (`nitropack ^2.13.4`). The `nitro` v3 package's npm
  `latest` is `3.0.260903-beta` — **beta, not stable**.
- ⚠️ **No official Docker guide** — "docker" appears nowhere in Nuxt or Nitro deployment docs.
  Documented: `NODE_ENV=production node .output/server/index.mjs`, `NITRO_PORT`/`PORT`,
  `NITRO_HOST`/`HOST`.
- **Node engines: `^22.19.0 || ^24.11.0 || >=26.0.0`.** Node 20 is out.
- Nuxt does **not** document a global-keyboard pattern. `@vueuse/nuxt` 14.4.0 is registry-listed;
  ⚠️ it **disables `useStorage` from auto-import** (clashes with a Nuxt built-in) — relevant to
  ADR 0014. `useMagicKeys` handles combos.
- TypeScript is **not** checked during `nuxt dev`/`build` "for performance reasons";
  `typescript.typeCheck` and `nuxt typecheck` exist. `vue-tsc` latest 3.3.11. ⚠️ Compatibility with
  `typescript` 7.0.2 unverified.

---

## 6. The database (§4.12, ADR 0021)

### 6.1 SQLite and libSQL are ruled out by their own docs

- **SQLite WAL §1:** *"All processes using a database must be on the same host computer; WAL does
  not work over a network filesystem"* — WAL needs shared memory. Without it, EXCLUSIVE locking,
  i.e. strict single-process. "When To Use" warns network-filesystem locking "is buggy in many
  implementations… resulting in corruption," and names PostgreSQL for the client/server case.
- **Turso embedded replicas are read replicas** — "writes are sent to the cloud primary." Turso Sync
  gives local-first writes with explicit push/pull, still one primary. **No multi-writer.**
- ⚠️ Turso's Rust-rewrite-vs-libSQL status rests only on a founder's X post; two official limits
  pages 404'd. Pricing page shows Developer at **$4.99**, contradicting a widely-repeated
  third-party claim of $5.99.

### 6.2 Postgres — current version and JSON storage

**PostgreSQL 18** released 2025-09-25; current minor **18.6**, 2026-08-13.

Per §8.14: `json` stores exact input text and is **reparsed on each execution**; `jsonb` is
decomposed binary, "significantly faster to process," and **only `jsonb` supports indexing**. It
does not preserve whitespace, key order, or duplicate keys. Docs: "most applications should prefer
to store JSON data as `jsonb`, unless there are quite specialized needs." **No newer JSON storage
type exists.**

**The clause that decides the note shape** (§8.14.2): *"any update acquires a row-level lock on the
whole row… JSON documents should each represent an atomic datum … that cannot reasonably be further
subdivided into smaller datums that could be modified independently."* Per-field *provenance* is by
definition independently modified. §8.14.2 also says documents should have "a somewhat fixed
structure."

Indexes: GIN `jsonb_ops` (default) covers `?` `?|` `?&` `@>` `@?` `@@`, indexing every key and
value; `jsonb_path_ops` drops key-exists but is "usually much smaller" with better specificity.
Expression indexes target a known path. btree/hash on whole documents is "usually useful only if
it's important to check equality of complete JSON documents."

### 6.3 Job-table mechanics

- **`SELECT … FOR UPDATE SKIP LOCKED`:** *"Skipping locked rows provides an inconsistent view of the
  data, so this is not suitable for general purpose work, but **can be used to avoid lock contention
  with multiple consumers accessing a queue-like table**."*
- **`NOTIFY` payload must be shorter than 8000 bytes**; docs advise storing large data in a table and
  sending the key. `LISTEN` is per-session, same-database, cleared when the session ends.
- ⚠️ **PgBouncer transaction mode does not support `LISTEN`/`NOTIFY`** (nor `SET`/`RESET`,
  `PREPARE`, session-level advisory locks). A listener needs a persistent **direct** connection.
  See §7.2.
- **psycopg 3** documents async notifications: `Connection.notifies()` with `timeout`/`stop_after`,
  plus an `AsyncConnection` form. ⚠️ Before 3.2.4, notifications between `LISTEN` and generator
  start were lost.

### 6.4 Client libraries

| | Latest | Published | Weekly downloads |
| --- | --- | --- | --- |
| `drizzle-orm` | 0.45.2 | 2026-03-27 | 20.3M |
| `kysely` | 0.29.5 | 2026-08-10 | 16.3M |

Drizzle's active line is **1.0.0-rc**; 0.45.2 was a SQL-injection fix in `sql.identifier()`/`sql.as()`.
Kysely requires TS ≥ 5.4.

**Neither validates jsonb at runtime.** Drizzle's `jsonb().$type<T>()` is "compile time protection"
only; Kysely "never touches the runtime types the driver returns." A declared *subject* schema must
be validated at the application boundary.

**Better Auth documents Kysely best** — it is the *built-in* path, not an adapter (pass a `pg` Pool
directly). ⚠️ **`getMigrations` "does not work with Prisma or Drizzle ORM adapters."**

Python: **psycopg 3.3.5** (2026-08-31, Python ≥3.10); **SQLAlchemy 2.0.52** with a first-class
`postgresql+psycopg` dialect. ⚠️ **No documented norm exists** for ORM-vs-raw-driver in a worker.

---

## 7. Hosting (§4.12, ADR 0022)

### 7.1 Provider costs — app + always-on worker + Postgres

| Provider | Total / month | Owned by us |
| --- | --- | --- |
| Railway Hobby | ~$5 ⚠️ metered estimate | nothing |
| Hetzner CX23 + Coolify | €5.99 | OS, PG backups, TLS, reboots |
| DO App Platform | $17 (dev DB) / $25.15 | nothing |
| Render | **$20 flat** | nothing |
| Fly.io | ~$13 self-run PG / $45 managed | PG, in the self-run case |

Notes: **Render background workers have no free tier**; free Postgres there has a hard 30-day limit.
Railway's Serverless keys off *outbound* packets, so an open Postgres pool keeps a worker awake.
Fly's autostop is opt-in. ⚠️ Hetzner raised cloud prices 2026-06-15 — earlier figures are stale.

**Vercel and Netlify cannot host the worker.** Vercel max function duration **300s Hobby / 800s Pro
/ 1800s extended beta**, with **no always-on primitive documented** (⚠️ a negative finding by
absence); the closest is `waitUntil`, still bounded. Vercel **Cron on Hobby is once per day**.
Netlify background functions cap at **15 minutes**. Verbatim from Vercel's terms: *"Hobby teams are
restricted to non-commercial personal use only."*

**Alpine is out; ARM is fine.** SudachiPy publishes **no `musllinux` wheels** — Alpine would build
from sdist and need Rust. It **does** publish `manylinux2014_aarch64` for every Python version, so
Hetzner's ARM CAX line is viable. Python cp39–cp314. ⚠️ The package publishes no `Requires-Python`
metadata; ABI tags are the only evidence.

### 7.2 Neon

- **Two endpoints.** Pooled = `-pooler` in the endpoint hostname; direct = the same string without
  it. **Pooled runs PgBouncer in transaction mode and does not support `LISTEN`/`NOTIFY`**, `SET`,
  `PREPARE`, `WITH HOLD CURSOR`, `LOAD`, or session-level advisory locks. Neon's own guidance:
  direct for migrations, long-running queries, `pg_dump`, logical replication; pooled for
  connection-per-request.
- **Connection limits:** direct is bounded by `max_connections` (0.25 CU → 104, 7 reserved,
  **97 usable**); pooled is `max_client_conn=10000`, `default_pool_size = 0.9 × max_connections`.
- **Branching** is copy-on-write. **Each branch gets its own compute**, and non-default branches
  scale to zero too.
- **Free plan, verified 2026-09-06:** 100 projects (account-level) · **10 branches per project** ·
  **100 CU-hours per project/month** · autoscale ≤2 CU · **0.5 GB storage per project** · 5 GB
  egress/month · 6h instant restore · 1 snapshot. **Scale-to-zero is always on at 5 minutes and
  cannot be disabled on Free.** The 100 CU-hours is shared across *all* branch computes — roughly
  400 combined active hours at 0.25 CU against a 730-hour month.
- **Long-lived connections:** Neon documents that **"each connection resets the scale to zero
  timer,"** and that background jobs can keep a compute permanently active. The named failure when a
  connection idles through a suspend is `terminating connection due to administrator command`.
  `idle_in_transaction_session_timeout` defaults to 5 minutes. Cold start "a few hundred
  milliseconds."
  ⚠️ **Neon does not document persistent `LISTEN`, nor what happens to a pending `NOTIFY` across a
  suspend. Measure it.**
- ⚠️ **Neon's SNI-tested Python drivers are `asyncpg` and `pg8000`. psycopg is not in the table.**
- **CLI is now `neon`** (`neonctl` kept as an alias), both packages at **4.14.1**, Node ≥20.19.0.
  **Official hosted MCP server at `https://mcp.neon.tech/mcp`**; the local stdio
  `@neondatabase/mcp-server-neon` is **deprecated**.

### 7.3 SudachiPy footprint — measured, not cited

No published figure exists, so this was measured. ⚠️ **macOS 26.6.2 arm64, Python 3.11, NVMe** —
indicative for a Linux x86_64 container, not authoritative. `SudachiPy==0.6.11`,
`SudachiDict-core==20260723`.

- **Dictionary load: 9 ms** (range 0.009–0.011 s over 7 fresh processes). Not one second, not thirty.
- **Steady-state RSS 93–136 MB**, flat across repeated tokenisation. Ceiling if every page is forced
  resident: **344 MB**.
- **It is memory-mapped.** `vmmap` shows `system.dic` at **207.4 MB virtual, 27.8 MB resident**,
  read-only and shared. A 207 MB file adds ~56 MB RSS on load.
- **So 256 MB is viable and 512 MB is comfortable.** ⚠️ On Linux, mapped clean pages are charged to
  the cgroup; a hard 256 MB cap under pressure means repeated major faults, not necessarily an OOM
  kill. Container storage is far slower than this NVMe, so the cold fault-in is the number most
  likely to be wrong.
- **No caching between constructions** — a second `Dictionary()` in the same process costs the same
  9 ms **and its own mapping** (76 → 148 → 220 MB RSS). **Construct once per process.**
- Throughput: 246,800 characters in 0.12 s (~2M chars/s).

**Two pipeline findings for `03`, not for hosting:**

- ⚠️ **Numerals return `is_oov=True` with `normalized_form` rewritten to ASCII** — 六 becomes `6`.
  ADR 0006 uses `normalized_form` in the *identity key*, so a numeral-heavy *source* will key
  strangely. Needs a pipeline rule.
- The `tokenize()` result is **not sliceable** — `morphemes[:10]` raises `TypeError`.

`dictionary_form()`, `reading_form()`, `normalized_form()`, `is_oov()` and `part_of_speech()` all
confirmed present on this version. Verbs lemmatise correctly (覚まし → 覚ます).

**Sources:** framework, database, hosting, Nuxt, Vercel/Neon and the Sudachi measurement were each
gathered by a separate background agent against primary docs on 2026-09-06.

---

## 8. `noScripts` under the Vercel preset (ADR 0020)

**Round 3, 2026-09-06.** ADR 0020 chose Nuxt mainly because a route can ship zero JavaScript, and
its revisit condition said this was untested on the deployment target. It is no longer untested.

**Neither vendor documents the interaction — that belief was correct.** Vercel's Nuxt page (updated
2026-08-26) has a `routeRules` section covering `ssr: false`, `prerender`, `isr`, redirects and
headers, and never mentions `noScripts`. Nuxt's deploy page says nothing about route rules.

**The source settles it anyway, more firmly than documentation would.**

| Finding | Evidence |
| --- | --- |
| `noScripts` occurs in **0 files** in `nitropack@2.13.4` | The exact Nitro version Nuxt 4.5.2 pins. It is a Nuxt-side rule, declared by TypeScript augmentation of `NitroRouteRules`; Nitro has no concept of it |
| The Vercel preset reads only `headers`, `redirect`, `isr`, `cache`/`swr`, `static`, `prerender` | `dist/presets/vercel/utils.mjs`, when generating `.vercel/output/config.json` |
| The rule is applied **at render time, per request** | `packages/nitro-server/src/runtime/handlers/renderer.ts` at tag `v4.5.2`: `getRouteRules(event)` gates ~15 `head.push` sites — entry script, import map, payload, preload/prefetch hints, bootstrap |
| The route-rule matcher is bundled into the serverless function | `dist/presets/vercel/runtime/vercel.mjs` imports `getRouteRulesForPath` |

**Conclusion:** the preset cannot drop a rule it never reads, and the rule is evaluated inside the
handler the preset packages verbatim. Prerendered routes upload script-free static HTML; SSR routes
strip scripts inside the function per render. The absence is *proven*; that it therefore works is
inference from the mechanism, and it is strong.

⚠️ **The API name in the earlier recommendation was stale.** Write `routeRules.noScripts` and
`features.noScripts` (typed `'production' | 'all' | boolean`). `experimental.noScripts` and the route
rule `experimentalNoScripts` both still exist at v4.5.2 and are both marked deprecated. `03` must use
the current names.

⚠️ **Nothing upstream tests this combination.** `grep -i vercel` over the whole Nuxt v4.5.2 tree
returns no paths — there is no Vercel fixture in the repo. The `noScripts` e2e test
(`test/e2e/no-scripts.test.ts`) runs against the default preset. **Hence the first-week smoke test
survives, at ~15 minutes:** deploy one route with `{ prerender: true, noScripts: true }` and one with
`{ noScripts: true }` alone, `curl` both, grep for `<script`. The second exercises the runtime path.

One real preset bug exists and is instructive rather than alarming:
[nitrojs/nitro#4447](https://github.com/nitrojs/nitro/issues/4447), open — the Vercel preset
mishandles **ISR** route rules, which are among the rules that *are* translated to platform config.
It is evidence for the runtime/translated distinction, not against it. Zero issues in `nuxt/nuxt` or
`nitrojs/nitro` mention `noScripts` with Vercel.

---

## 9. The Python driver, and what scale-to-zero does to `LISTEN` (ADR 0021, ADR 0022)

**Round 3, 2026-09-06.** Two findings; the second matters more than the question that produced it.

### 9.1 Neon's driver table is a SNI list, not a support list

The earlier session read the wrong page: `neon.com/docs/reference/compatibility` contains **zero**
occurrences of `psycopg`, `asyncpg`, `pg8000`, `SNI` or `driver`. The table is on
[`connect/connection-errors`](https://neon.com/docs/connect/connection-errors) (`neon.com/sni`
redirects there), and the sentence **above** it is load-bearing:

> Clients on the list of drivers on the PostgreSQL community wiki that use your system's `libpq`
> library should work if your `libpq` version is >= 14.

Then: "Neon has tested the following drivers for SNI support" — npgsql, Postgrex, lib/pq, pgx, go-pg,
JDBC, node-postgres, postgres.js, **asyncpg**, **pg8000**, PostgresClientKit (✗), PostgresNIO,
postgresql-client. **Every entry is a native reimplementation of the wire protocol.** psycopg is a
libpq wrapper, so it falls under the sentence above the table. The word "supported" appears nowhere
on the page except per-row, about SNI. Neon is silent on *why* psycopg is absent; the structural
reading above is ours.

Corroborating, from Neon's own guides: the [Python quickstart](https://neon.com/docs/guides/python)
installs `psycopg[binary]` and uses a plain connection string with **no** `options=endpoint%3D...`;
the Django guide says to use "`psycopg[binary]` (psycopg v3), **not** the older `psycopg2`" and aims
its SNI troubleshooting at psycopg2 only. `psycopg[binary]` bundles **libpq 17.2**, and libpq sets
`sslsni=1` by default ([PostgreSQL docs](https://www.postgresql.org/docs/current/libpq-connect.html)).

SNI is still required and none of the four documented workarounds is retired; only the
password-field form carries an intent to deprecate. A libpq client needs none of them.

⚠️ **Require psycopg ≥ 3.2.4** — before that version, notifications arriving between `LISTEN` and
starting the `notifies()` generator were **silently lost**. That is exactly the worker's startup
sequence. Since 3.2.10, mixing the generator with `add_notify_handler()` raises a runtime warning;
pick one.

Notification support, all confirmed: psycopg 3 has a blocking `notifies(timeout=...)` generator and
works on a plain synchronous `Connection` in autocommit; asyncpg has `add_listener()` (async only);
pg8000 exposes a `notifications` deque with no blocking API. **Not verified:** no live connection was
made. The chain (libpq 17.2 → `sslsni=1` → Neon's stated libpq ≥ 14 rule) is documentary. One
`psycopg.connect()` falsifies it cheaply.

### 9.2 Scale-to-zero destroys the listener, and this corrects a Carrying note

Pooled connections cannot `LISTEN` at all — Neon's connection-pooling page lists `LISTEN`/`NOTIFY`
among what PgBouncer transaction mode does not support, matching PgBouncer's own feature matrix. The
direct endpoint is therefore mandatory, as planned. On the direct endpoint Neon documents **no**
restriction on `LISTEN`/`NOTIFY` — but it documents a lifecycle hazard, on the compatibility page:

> notifications and listeners defined using NOTIFY/LISTEN commands only exist for the duration of
> the current session and are lost when the session ends.

**The Free plan cannot disable scale-to-zero**; the compute suspends after 5 minutes of inactivity.
So the listener is torn down routinely, and notifications fired while the worker is disconnected are
gone rather than delayed. This is what
[ADR 0028](adr/0028-the-job-table-is-the-truth-and-notify-is-only-an-optimisation.md) is built on.

⚠️ **A Carrying note in `00-status.md` asserted that a held listener keeps the compute awake and
exhausts the free month. That is unverified.** Neon documents what *wakes* an idle compute
(connecting, querying, API access) but never what *prevents* suspension. **Neon is silent; test it.**
ADR 0028 is correct whichever way it resolves, which is why it did not wait for the answer.

**Sources:** neon.com/docs — connect/connection-errors, reference/compatibility, guides/python,
guides/django, connect/connection-pooling, guides/scale-to-zero-guide; postgresql.org libpq-connect;
psycopg3 advanced/async, install, news; psycopg2 advanced, news; asyncpg API reference; pg8000 on
PyPI; pgbouncer.org/features. Two background agents, 2026-09-06.

---

## 10. Two facts the schema needed (ADR 0029, `04-database-schema.md` §3)

**Checked 2026-09-06**, alongside the rest of this document. Added because
`04-database-schema.md` rested on two claims that §1–9 did not cover, and `CLAUDE.md` does not
permit either to be recalled from memory.

### 10.1 Postgres 18 ships `uuidv7()` as a built-in

PostgreSQL 18 adds **`uuidv7()`**, generating temporally sortable UUIDs, alongside a **`uuidv4()`**
alias for the existing `gen_random_uuid()`. Both are documented in §9.14 UUID Functions and named in
the 18 release notes. No extension is required, and Neon runs Postgres 18 (§7.2).

Time-ordered keys keep inserts at the right-hand edge of the primary-key index instead of scattering
across it, which is why `04` uses `uuidv7()` for every primary key rather than random v4.

### 10.2 Better Auth's generated Drizzle schema uses `text` ids and cascades everywhere

From the Better Auth CLI's own generator snapshots for the PostgreSQL/Drizzle target:

```ts
export const user = pgTable("user", { id: text("id").primaryKey(), … })

export const session = pgTable("session", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  …
})
```

Two things follow, and both are schema decisions in `04`:

- **`user.id` is `text`, not `uuid`.** Better Auth mints string ids itself. Every `owner_id` in `04`
  is therefore `text` while every other key is `uuid`.
- ⚠️ **Every child of `user` in the generated schema carries `onDelete: "cascade"`** — `session`,
  `account`, and each plugin table. Copying that convention onto *personal* entities would make
  deleting one `user` row destroy every *scheduling epoch* and *review log* beneath it, which is the
  outcome `03` §13.6 names as the worst thing an attacker could do. **`04` §3 uses `RESTRICT`
  instead**, and lets Better Auth keep its own cascades, which are correct for data that a sign-in
  regenerates.

The generator also supports emitting into a named Postgres schema (`pgSchema("auth")`), which is what
`04` §8 uses to keep the four tables it does not own visibly separate.

**Sources:** postgresql.org/docs/18 — release-18, functions-uuid, datatype-uuid;
github.com/better-auth/better-auth — `packages/cli/test/__snapshots__/auth-schema-pg-*.txt`,
`docs/content/docs/adapters/drizzle.mdx`, `docs/content/docs/concepts/database.mdx`. Checked
2026-09-06.

---

## 11. Cookies, and the session read on a route with no client (`08-authentication.md`)

**Checked 2026-09-06**, alongside the rest of this document and for the same reason §10 was added:
`08-authentication.md` makes three decisions that §1–9 do not cover, and one of them **resolves a
⚠️ in §2.2**. §1–9 are untouched; read this section after §2.

### 11.1 The cookie defaults are `sameSite: "lax"` and `path: "/"` — §2.2's warning is answered

§2.2 recorded that "the docs do not state default `sameSite` or `path`". Half of that is now wrong
and the other half is settled from source.

- **The docs do state `sameSite`.** The security reference: cookies "default to a sameSite attribute
  of lax to prevent CSRF attacks and enable the httpOnly attribute to block client-side JavaScript
  access."
- **`path` is not in the prose.** It is unambiguous in `createCookieGetter`, which builds *every*
  cookie Better Auth mints from one set of hard defaults:

```ts
attributes: {
  secure: !!secureCookiePrefix,
  sameSite: "lax",
  path: "/",
  httpOnly: true,
  ...(crossSubdomainEnabled ? { domain } : {}),
  ...options.advanced?.defaultCookieAttributes,
  ...overrideAttributes,
  ...attributes,   // advanced.cookies[name].attributes — highest priority
}
```

Two things follow. **The merge order** is hard defaults → `advanced.defaultCookieAttributes` →
per-call override → per-cookie `advanced.cookies[name].attributes`. And ⚠️
**`defaultCookieAttributes` applies to every cookie, not only `session_token`** — the OAuth state
cookie included. §11.2 is why that matters.

`secure` resolves in a documented order: `advanced.useSecureCookies` if set, else the `baseURL`
protocol, else `NODE_ENV === "production"`.

### 11.2 `sameSite: "strict"` would break the Google callback, and the docs name the failure

OAuth state storage is `account.storeStateStrategy`, **defaulting to `"database"`** whenever a
database or secondary storage is configured: the payload goes to verification storage and the state
value is persisted in a **signed cookie that is checked on the callback** (`parseGenericState`).

The callback from Google is a top-level cross-site GET redirect. A `Strict` cookie is not sent on
one, and Better Auth's own error page for `state_security_mismatch` lists the causes — among them
"`SameSite` policy issues preventing the cookie from being sent", alongside third-party cookie
restrictions and the signed cookie's 5-minute `maxAge`.

So `lax` here is not an inherited convenience. It is the value the redirect flow requires.

### 11.3 The server-side session read, and which `headers` spelling is ours

Better Auth's **Nuxt** integration page:

```ts
const session = await auth.api.getSession({ headers: event.headers })
```

⚠️ The **Nitro** integration page shows `event.req.headers`. That is the h3 v2 / Nitro v3 shape;
Nuxt 4.5.2 pins `nitropack ^2.13.4` (§8). **Use the Nuxt form.** The framework-agnostic contract is
that `getSession` takes the incoming `Headers`, which is why no cookie forwarding is involved.

Nuxt's own server documentation supplies the rest:

- Server middleware "will run on **every request before any other server route**", and handlers
  "should not return anything (nor close or respond to the request) and only inspect or extend the
  request context or throw an error." The documented example is literally
  `event.context.auth = { user: 123 }`.
- `useRequestEvent()` "will return `undefined`" in the browser — so a component that reads
  `useRequestEvent()!.context` is server-only by construction, not by convention.
- `server/types/` is scanned for server-only types (files directly inside it; nested directories are
  ignored).

### 11.4 Three route rules that would silently disable the gate

From Nuxt's hybrid-rendering reference:

- **`prerender: true`** — "Prerenders routes at build time and includes them in your build as
  **static assets**." There is no request, so no server middleware and no session.
- **`swr` / `isr`** — cached responses; `isr` puts them in the CDN "on platforms that support this
  (currently Netlify or Vercel)". A cached signed-in document is a document served to whoever asks
  next.

And: "route rules will be automatically applied to the deployment platform's native rules" for
Vercel and Netlify — so an `isr` rule is not a Nuxt-local decision, it is a CDN we do not operate.

### 11.5 What a `validateUserInfo` rejection actually produces

Returning an error object "rejects the provisioning, triggering a **redirect to the error URL** or
returning a **403 API error**". The redirect is the browser path; the 403 is the programmatic one.
That page is `onAPIError.errorURL`, **default `/api/auth/error`** — Better Auth ships a styled
default.

- `source.action` is `"create-user" | "link-account" | "sign-in"`; `source.oauth?.providerId` and
  `source.oauth?.profile` are available on the OAuth paths.
- ⚠️ **The documented example narrows on the provider first** —
  `if (source.oauth?.providerId !== "google") return;` — which *admits* everything from any other
  provider. Correct for a domain check with several providers configured; a fail-open gate for an
  allowlist.
- On the create-user path the internal adapter lowercases before validating
  (`email: user.email?.toLowerCase()`). **Nothing documents the same for the sign-in path**, so a
  comparison that must hold on both is written case-insensitively at the call site.
- ⚠️ It **fails closed** on a missing endpoint context: `assertValidUserInfo` throws
  `APIError("FORBIDDEN", { code: "validation_context_missing" })` rather than skipping the check.

### 11.6 Two configuration facts the sign-in flow needs

- **The default callback URI is `/api/auth/callback/${providerName}`** — so
  `/api/auth/callback/google`, and that is the string Google's console must hold.
  `socialProviders.google.redirectURI` overrides it.
- **`trustedOrigins` is derived, not only declared.** `getTrustedOrigins` merges the origin of
  `baseURL`, anything in `options.trustedOrigins` (array or function), plugin-contributed origins,
  and the `BETTER_AUTH_TRUSTED_ORIGINS` environment variable, and the origin-check middleware
  validates callback URLs against the result.
- `session.cookieCache` is **opt-in** and serves the session from a signed cookie to skip the
  database read (§2.2, default 5 minutes when enabled).

**Sources:** github.com/better-auth/better-auth —
`docs/content/docs/reference/security.mdx`, `docs/content/docs/reference/options.mdx`,
`docs/content/docs/concepts/cookies.mdx`, `docs/content/docs/concepts/oauth.mdx`,
`docs/content/docs/concepts/users-accounts.mdx`, `docs/content/docs/integrations/nuxt.mdx`,
`docs/content/docs/integrations/nitro.mdx`, `docs/content/docs/reference/errors/state_mismatch.mdx`,
`docs/content/docs/reference/errors/state_invalid.mdx`, `packages/better-auth/src/cookies/index.ts`,
`packages/better-auth/src/state.ts`, `packages/better-auth/src/db/internal-adapter.ts`,
`packages/better-auth/src/context/helpers.ts`; nuxt.com/docs/4.x —
`api/composables/use-request-event`, `guide/directory-structure/server`,
`guide/concepts/rendering`. Checked 2026-09-06.
