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
