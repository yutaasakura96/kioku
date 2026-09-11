# Phase 4 — verification findings

**Date checked:** 2026-09-06; §12, §13 and §14 added 2026-09-07. **Status:** facts only.
Nothing here is a decision.

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
  it. **Pooled runs PgBouncer in transaction mode and does not support `LISTEN`**, `SET`,
  `PREPARE`, `WITH HOLD CURSOR`, `LOAD`, or session-level advisory locks. ⚠️ **Amended 2026-09-11
  with #7: this said `LISTEN`/`NOTIFY` and PgBouncer's own matrix separates them** — `LISTEN` is
  `Never` in transaction pooling, `NOTIFY` is `Yes`. See §9.2. Neon's own guidance:
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
among what PgBouncer transaction mode does not support. The
direct endpoint is therefore mandatory, as planned. On the direct endpoint Neon documents **no**
restriction on `LISTEN`/`NOTIFY` — but it documents a lifecycle hazard, on the compatibility page:

> notifications and listeners defined using NOTIFY/LISTEN commands only exist for the duration of
> the current session and are lost when the session ends.

⚠️ **Amended 2026-09-11 with #7 — Neon's page summarises PgBouncer's matrix and the matrix is
finer-grained than the summary.** Read directly
([pgbouncer.org/features.html](https://www.pgbouncer.org/features.html), checked 2026-09-11), the
*SQL feature map for pooling modes* gives **`LISTEN` — Never** under transaction pooling and
**`NOTIFY` — Yes**. The mechanism is the difference between session state and a statement: `LISTEN`
subscribes *this session*, and transaction pooling returns the server connection to the pool at
commit, so the subscription would belong to whoever gets it next; `NOTIFY`'s effect is delivered by
the server at commit and is indifferent to which client connection carried the statement. **The
direct endpoint is still mandatory for the worker** — that is the `LISTEN` half and it is unchanged —
but the *app* can send its own wake-up on the pooled string, which is [ADR 0043](adr/0043-the-app-sends-the-wake-up-after-the-transaction-that-earned-it.md).
⚠️ **Still not verified against Neon**, whose own wording names the pair; ADR 0028 holds either way.

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

---

## 12. Two facts the flows needed (`09-user-flows.md`)

**Checked 2026-09-07**, while writing `09-user-flows.md`, and added for the same reason §10 and §11
were: two decisions in that document rest on library and platform behaviour that §1–11 do not cover.
**§1–11 are untouched.**

### 12.1 `<NuxtLink external>` is what makes a mode exit a real document load

ADR 0032 makes the Done control the only way out of a *mode*, and `03` §2.1 already accepted that
navigation between a *place* and a *mode* is a full document load in both directions. The place →
mode direction is free: a `noScripts` route ships no JavaScript, so its anchor is a plain anchor.

**The mode → place direction is not free, and it fails silently.** From the `<NuxtLink>` reference:

> `<NuxtLink>` is a drop-in replacement for both Vue Router's `<RouterLink>` component and HTML's
> `<a>` tag. It intelligently determines whether the link is *internal* or *external* and renders it
> accordingly.

and, under **Handling Static File and Cross-App Links**:

> By default, `<NuxtLink>` uses Vue Router's client side navigation for relative route. When linking
> to static files in the `/public` directory or to another application hosted on the same domain, it
> might result in unexpected 404 errors because they are not part of the client routes. In such
> cases, you can use the `external` prop with `<NuxtLink>` to bypass Vue Router's internal routing
> mechanism.
>
> The `external` prop explicitly indicates that the link is external. `<NuxtLink>` will render the
> link as a standard HTML `<a>` tag.

The accessibility guide states the rule in the direction we need it: links "to public directory files
or external apps on the same origin should be marked as external to trigger native browser
navigation."

So a bare `<NuxtLink to="/stats">` inside *Vet* or *Review* hands the reader a client-rendered Stats
with a live Vue application attached — the outcome `noScripts` exists to prevent, with no error
anywhere. `external` is the documented mechanism, and `navigateTo` takes the same option
(`navigateTo(path, { external: true })`; Nuxt error E2001 documents it for the URL case).

⚠️ **Nothing here is version-specific, which is what makes it easy to lose.** It is not a Nuxt 4.5.2
quirk and no upgrade will flag it. The `noScripts` smoke test is the regression cover: `curl` a
*place* reached by pressing Done and grep for `<script`.

**Sources:** nuxt.com/docs/4.x — `api/components/nuxt-link` (Internal Routing; Handling Static File
and Cross-App Links), `getting-started/routing` (Navigation),
`guide/best-practices/accessibility` (Links), `errors/e2001`. Checked 2026-09-07.

### 12.2 `SameSite=Lax` excludes cross-site `POST`, which is why the two form routes need nothing

`09` §1 gives the three *places* two form handlers, `POST /api/source` and
`POST /api/source/:id/delete`. They are the only writes in the application performed by a screen with
no JavaScript, so they cannot carry a token generated by a client.

They do not need one. MDN, on the `SameSite` attribute of `Set-Cookie`:

> **Lax** — Send the cookie only for requests originating from the same site that set the cookie, and
> for cross-site requests that meet both of the following criteria: The request is a top-level
> navigation … The request uses a safe method: in particular, this excludes `POST`, `PUT`, and
> `DELETE`.

`08` §5 sets `sameSite: "lax"` explicitly and chose it for the Google callback (§11.2). The
consequence here is the second thing it buys: **a cross-site form `POST` arrives without the session
cookie**, so the server middleware refuses it as unauthenticated (`08` §6.3), while a same-site
`POST` from the application's own page carries it normally.

Two limits, both stated rather than assumed:

- ⚠️ **The protection is a property of `lax`, not of the routes.** Anything that moved the cookie to
  `SameSite=None` would remove it silently, and `08` §10's revisit condition — a second origin, a
  preview deployment that signs in — is exactly that change.
- ⚠️ **It does not cover `GET`.** A cross-site top-level `GET` *is* sent with the cookie, which is
  why `09` §4.12 records that a malicious link can start `/api/export`'s download. It cannot read the
  response; same-origin policy holds. The fix, if it ever matters, is making the export a `POST`.

MDN also notes that where browsers apply `Lax` **as a default** they use a more permissive version
that allows `POST` within two minutes of the cookie being set. That does not apply here: `08` §5
sets the attribute explicitly, so the strict reading of `Lax` is the one in force.

**Sources:** developer.mozilla.org — `Web/HTTP/Reference/Headers/Set-Cookie` (SameSite attribute
values). Checked 2026-09-07.

---

## 13. Four facts the screens needed (`10-screen-specifications.md`)

**Checked 2026-09-07**, while writing `10-screen-specifications.md`, and added for the same reason
§10, §11 and §12 were: decisions in that document rest on library and standards behaviour that §1–12
do not cover. **§1–12 are untouched.**

### 13.1 With `enable_short_term: false`, grade 1 is a minimum of one day — not ten minutes

ADR 0016 turned same-day relearning off. Nothing had checked what that leaves grade 1 actually
*doing*, and the grade labels depend on the answer, because "Again" in Anki names a return in
minutes.

Read from `ts-fsrs` source at the version `03` §8 pins. ⚠️ **`main` and `v5.4.2` are the same
code** — `packages/fsrs/package.json` on `main` reads `"version": "5.4.2"`, and there is no `v5.4.2`
tag to fetch, so `main` is the pinned release and not a later one.

`enable_short_term: false` selects `LongTermScheduler` — "Determines whether to use the
BasicScheduler with learning steps or the LongTermScheduler … when disabled, it skips the learning
phase and moves cards directly into the review state." Inside it, every one of the four outcomes is
scheduled in **days**:

```ts
next_again.scheduled_days = again_interval
next_again.due = date_scheduler(this.review_time, again_interval, true)
```

`date_scheduler(now, t, isDay)` documents its own third argument — 「时间偏移量，当 isDay 为 true 时
表示天数，为 false 时表示分钟」: *the offset is days when `isDay` is true, minutes when it is false*.
`LongTermScheduler` passes `true` for all four grades.

And the interval cannot be zero. `FSRSAlgorithm.next_interval` clamps at 1 before fuzz:

```ts
next_interval(s: number, elapsed_days: number): int {
  const newInterval = Math.min(
    Math.max(1, Math.round(s * this.intervalModifier)),
    this.param.maximum_interval
  ) as int
  return this.apply_fuzz(newInterval, elapsed_days)
}
```

Two further facts from the same file, both load-bearing for the labels:

- **The four intervals are forced strictly increasing**, and grade 1 is forced to the shortest:
  `again = Math.min(again, hard)`, then `hard = Math.max(hard, again + 1)`, `good = Math.max(good,
  hard + 1)`, `easy = Math.max(easy, good + 1)`.
- **Grade 1 is the only one that counts a lapse** — `next_again.lapses += 1` in `reviewState`, and
  all four then take `state = State.Review` with `learning_steps = 0`. So the library's own split is
  one failure and three successes, which is the split ADR 0034's words mirror.

⚠️ **This is the fact that retires the word "Again".** It is a promise of a same-day return, and this
configuration cannot make one: **the soonest a graded *card* comes back is tomorrow.**

**Sources:** github.com/open-spaced-repetition/ts-fsrs @ `main` (= 5.4.2) —
`packages/fsrs/src/algorithm.ts` (`next_interval`), `packages/fsrs/src/impl/long_term_scheduler.ts`
(`next_interval`, `reviewState`, `next_state`), `packages/fsrs/src/help.ts` (`date_scheduler`),
`_autodocs/04-configuration.md` (Short-Term Mode), `packages/fsrs/package.json`. Checked 2026-09-07.

### 13.2 A path-based gesture is Level A, so swipe could never have replaced the four grade controls

ADR 0026 deferred grade-by-swipe to this document. The deferral assumed swipe would be an
*alternative* to the four controls. WCAG 2.2 says it cannot be:

> **Success Criterion 2.5.1 Pointer Gestures (Level A)** — All functionality that uses multipoint or
> path-based gestures for operation can be operated with a single pointer without a path-based
> gesture, unless a multipoint or path-based gesture is essential.

and, new at AA in 2.2:

> **Success Criterion 2.5.7 Dragging Movements (Level AA)** — All functionality that uses a dragging
> movement for operation can be achieved by a single pointer without dragging, unless dragging is
> essential or the functionality is determined by the user agent and not modified by the author.

Grading is not an essential path-based gesture — it is a choice among four values — so a swipe
implementation would owe a non-path, non-drag equivalent, which is the four controls it was meant to
replace. **Swipe is only ever additive**, and ADR 0036 is decided on that.

### 13.3 The target-size floors, which the phone layout is measured against

> **Success Criterion 2.5.8 Target Size (Minimum) (Level AA)** — The size of the target for pointer
> inputs is at least **24 by 24 CSS pixels**, except when: **Spacing** … **Equivalent** … **Inline**
> … **User Agent Control** … **Essential** …

> **Success Criterion 2.5.5 Target Size (Enhanced) (Level AAA)** — The size of the target for
> pointer inputs is at least **44 by 44 CSS pixels** except when: Equivalent, Inline, User Agent
> Control, Essential.

ADR 0024 committed the system to AA, so **24 × 24 is the floor and 44 × 44 is the target worth
hitting where it is free.** `10` §10.4 checks the phone's grade controls against both.

### 13.4 ⚠️ Single-character shortcuts are a Level A criterion, and ADR 0025 already satisfies it

Nothing in this project had noticed that the key map is regulated.

> **Success Criterion 2.1.4 Character Key Shortcuts (Level A)** — If a keyboard shortcut is
> implemented in content using only letter (including upper- and lower-case letters), punctuation,
> number, or symbol characters, then at least one of the following is true: **Turn off** A mechanism
> is available to turn the shortcut off; **Remap** A mechanism is available to remap the shortcut to
> include one or more non-printable keyboard keys (e.g., Ctrl, Alt); **Active only on focus** The
> keyboard shortcut for a user interface component is only active when that component has focus.

ADR 0023's map is `E`, `R`, `Z`, `X` and `1`–`4` — all printable characters, with no turn-off and no
remap. The application would fail SC 2.1.4 on the first two options.

**It passes on the third, and it passes because of a decision already made for a different reason.**
ADR 0025 holds focus on the *mode container* rather than letting it wander: "The container still
takes focus, because keystrokes have to land somewhere and a reload has to restore it." That makes
the container the user interface component, and the shortcuts are active only while it has focus —
which is the "Active only on focus" exception, met exactly.

⚠️ **This makes ADR 0025's container focus load-bearing for conformance, not just for
implementation.** Binding the keys to `document` or `window` instead — the obvious shortcut, and the
thing a future session will reach for — moves the application from passing SC 2.1.4 to failing a
Level A criterion, with nothing on screen to show it. `10` §4.1 states the rule where it will be
read.

**Sources for §13.2–13.4:** w3.org/TR/WCAG22/ — §2.1.4 Character Key Shortcuts, §2.5.1 Pointer
Gestures, §2.5.5 Target Size (Enhanced), §2.5.7 Dragging Movements, §2.5.8 Target Size (Minimum);
w3.org/WAI/WCAG22/Understanding/target-size-minimum.html. Checked 2026-09-07.

---

## 14. What a test can actually run against (`11-testing-plan.md`)

**Checked 2026-09-07**, while writing `11-testing-plan.md`. **§1–13 are untouched.** §14.1 is a
**measurement**, taken for the same reason §7.3's SudachiPy figures were: the number that decides the
question is not published anywhere.

### 14.1 ⚠️ PGlite is PostgreSQL 18.3, and it enforces every rule `04` relies on — measured

The question that decided the test-database shape was whether an embedded Postgres could fail a
foreign key, raise from a trigger and honour a partial unique index — because `04` puts the
load-bearing rules in the schema, and a harness that cannot fail them cannot test them.

**PGlite's own documentation does not state which PostgreSQL it builds.** Neither `pglite.dev/docs/about`
nor the repository README carries a version sentence. So it was measured — `@electric-sql/pglite`
**0.5.8**, installed and queried directly:

```
PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten,
compiled by emcc … 3.1.74, 32-bit
```

**18.3, not 17** — which matters, because `04` uses `uuidv7()` on every primary key and that is a
Postgres 18 built-in (§10.1). `uuidv7()`, `uuidv4()` and `gen_random_uuid()` all return values.

Then every schema mechanism `04` depends on, run against it. **Boot to first query: 946 ms.**

| Mechanism | `04` | Result |
| --- | --- | --- |
| `plpgsql` available | §12's trigger is written in it | present |
| `uuidv7()` as a column default | every PK | works |
| Partial unique index | §7.4, one live epoch per card | created, **and refuses the second live epoch** |
| `plpgsql` `BEFORE UPDATE OR DELETE` trigger | `review_log` append-only | **`UPDATE` raises. `DELETE` raises** |
| `ON DELETE RESTRICT` | §9, everything irreplaceable | **refuses the delete**, naming the constraint |
| `CHECK` constraint | `rating BETWEEN 1 AND 4` | **refuses `rating = 7`** |
| `CHECK` on an enum-ish text column | `suspended_reason` | **refuses an unlisted value** |
| `jsonb` column | `note.fields` (ADR 0029) | works |
| `FOR UPDATE SKIP LOCKED` | §6.4's job claim | **parses** — see §14.2 |
| `LISTEN` | ADR 0028 | **parses** — see §14.2 |

⚠️ **This inverts the assumption the question was asked under.** "A mock cannot fail a foreign key"
is true and irrelevant: PGlite is not a mock, it is Postgres, and every refusal above is the real
error message from the real constraint.

### 14.2 ⚠️ PGlite is single-connection, and that is where the line falls

The two rows that only *parse* above are the two that need a second session to mean anything.
From PGlite's own documentation:

> as PGlite is **single connection only**, you may want to proxy multiple browser tabs to a single
> PGlite instance.

> Although PGlite is a **single-connection database**, it is possible to open and use multiple
> simultaneous connections with `pglite-server`.

and, in the same page's limitations:

> Multiple concurrent connections are supported through a **multiplexer over the single conn**,
> therefore **not all cases might be covered**.

So `SKIP LOCKED` has nothing to skip past and a torn-down `LISTEN` has no second session to be torn
down from. **The multiplexer is specifically the wrong instrument** for testing a concurrency
mechanism, because it is itself an approximation of the thing under test.

`04` §6.4's job claim and ADR 0028's reconnect loop therefore need a real Postgres. Both belong to
the **Python worker**, which cannot use a JavaScript library in any case — so the line the harness
splits on is the one ADR 0019 already drew.

### 14.3 `@nuxt/test-utils`, and the two APIs that make three named tests possible

From nuxt.com/docs/4.x/getting-started/testing.

**End-to-end helpers**, imported from `@nuxt/test-utils/e2e`:

| API | Documented as |
| --- | --- |
| `$fetch(url)` | "Get the **HTML** of a server-rendered page" |
| `fetch(url)` | "Get the **response** of a server-rendered page" — `const { body, headers } = res` |
| `url(path)` | The full URL including the test server's port |
| `createPage(path)` | A Playwright page — `await page.getByTestId(…).isVisible()` |

⚠️ **`$fetch` returning HTML is what turns the `noScripts` smoke test into a test.** It has been
carried as a first-week `curl`-and-grep experiment since Round 3; the assertion is
`expect(html).not.toContain('<script')`, and `fetch`'s `headers` covers the `303` and
`Content-Disposition` cases.

**`setup()` options:** `rootDir` (default `'.'`), `configFile`, `setupTimeout` (**default 120000 ms**,
240000 on Windows), `teardownTimeout` (30000), `build` (default true), `server` (default true),
`port`, **`host`** — "a URL to use as the test target instead of building and running a new server …
which may provide a significant reduction in test execution timings" — `browser` (**default false**,
Playwright underneath), `browserOptions.type` (`chromium` | `firefox` | `webkit`), and `runner`
(`'vitest' | 'jest' | 'cucumber'`, **Vitest recommended**).

⚠️ **`@nuxt/test-utils/runtime` and `@nuxt/test-utils/e2e` cannot be used in the same file.** They
"need to run in different testing environments". The documented split is a per-file
`// @vitest-environment nuxt` comment or a `.nuxt.spec.ts` filename. **This shapes the directory
layout, not just an import** — and Nuxt's own recommended layout is `test/unit/` (no Nuxt),
`test/nuxt/` (Nuxt runtime) and `test/e2e/` (a running app), with `test/` **not** auto-scanned.

`mountSuspended(component, { route })` mounts a component inside the Nuxt environment, wrapping
`@vue/test-utils`' `mount`.

### 14.4 Versions, on the day

| Package | Version | Note |
| --- | --- | --- |
| `vitest` | **5.0.0** | The recommended runner |
| `@nuxt/test-utils` | **4.2.0** | |
| `@electric-sql/pglite` | **0.5.8** | = PostgreSQL 18.3 (§14.1) |
| `@electric-sql/pglite-socket` | 0.2.11 | The multiplexer §14.2 warns about |
| `testcontainers` (Node) | 12.1.0 | Not used — see `11` §4 |
| `testcontainers` (Python) | **4.15.0** | The worker's harness |
| `pytest` | **9.1.1** | |
| `drizzle-orm` | **0.45.2** | The pin `03` §13.5 names |

⚠️ **`drizzle-orm` 0.45.2 exports `./pglite`, `./pglite/driver`, `./pglite/session` and
`./pglite/migrator`.** The last one is what closes the loop: **the test database is built by the same
migrations as production**, rather than by a second copy of the schema that drifts. Its other
relevant exports are `./neon`, `./neon-http`, `./neon-serverless` and `./node-postgres`.

**Sources:** measured locally with `@electric-sql/pglite` 0.5.8 (§14.1); pglite.dev/docs/about,
/docs/pglite-socket, /docs/multi-tab-worker (§14.2); nuxt.com/docs/4.x/getting-started/testing and
/docs/4.x/directory-structure/test (§14.3); npm registry and PyPI (§14.4). Checked 2026-09-07.
