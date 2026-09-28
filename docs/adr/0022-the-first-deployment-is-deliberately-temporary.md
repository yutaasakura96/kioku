# The first deployment is Vercel, Neon and a laptop — and it is deliberately temporary

**The Nuxt app deploys to Vercel, the database is Neon Postgres with a branch per environment, and
the Python *ingestion* worker runs on the developer's own machine.** All three are chosen to be
thrown away: the stated destination is EC2 or Lightsail once the developer's other projects move
there. Findings in [`../phase-4-verification.md`](../phase-4-verification.md) §7.

⚠️ **Amended 2026-09-28: production and development are not two Neon branches.** The existing
database becomes production, and development runs on PGlite rather than on a second branch. See
§ Amended 2026-09-28 below, which also records how the deployment is carried out.

## Vercel cannot host the worker, and that is what shapes this

Not a preference. Vercel's maximum function duration is **300s on Hobby**, 800s on Pro, and it
documents **no always-on primitive** — the closest is `waitUntil`, still bounded by the same
ceiling. Netlify's background functions cap at 15 minutes. ADR 0015 requires a resident process.

So the worker has to live somewhere else, and for the initial phase that is **the developer's
laptop**, connecting to Neon over the internet. *Ingestion* therefore only runs when the machine is
on. **At one user who is also the developer, that is not a limitation — it is the correct amount of
infrastructure**, and it costs nothing.

**Consequence that must be carried:** *time-to-first-review*, one of the four numbers v1 exists to
produce (§5), will initially be measured against a laptop rather than a server. **Early figures are
indicative.** The number is not comparable across the move.

## ADR 0015 survives, but on its second argument

That ADR gave two reasons for an always-on worker: cron lag would contaminate *time-to-first-review*,
and a directly-connected worker needs no HTTP job endpoint, which keeps PRD S1's *"refused at every
route"* literally true.

**The first reason is now dead.** SudachiPy's dictionary is memory-mapped and loads in **9 ms**
(measured — §7.3), so cold-start cost was never the dictionary. **The second reason stands and is
now load-bearing**, because any scale-to-zero worker needs a wake channel, and the only ones
available reintroduce the endpoint ADR 0015 removed.

## Neon's free tier decides how the worker connects

Three documented facts combine into one rule:

1. The **pooled** endpoint runs PgBouncer in transaction mode and **does not support
   `LISTEN`/`NOTIFY`**, `SET`, `PREPARE`, or session-level advisory locks.
2. **Every connection resets the scale-to-zero timer**, and scale-to-zero **cannot be disabled on
   Free**.
3. Free grants **100 compute-hours per project per month**, shared across *both* branch computes —
   roughly 400 wall-clock hours at 0.25 CU against a 730-hour month.

**Therefore:**

- The **app on Vercel uses the pooled connection string** (`-pooler` in the hostname).
- The **worker uses the direct connection string**, because it needs `LISTEN`/`NOTIFY`.
- **The worker is never left running as a permanent daemon against the free tier.** A held listener
  keeps the compute awake and would exhaust the month's budget around day 17. Under a laptop worker
  this resolves itself; it becomes a real constraint the moment the worker moves to a server.

⚠️ Neon documents the failure by name — `terminating connection due to administrator command` when
a connection idles through a suspend — but **does not document persistent `LISTEN` specifically,
nor what happens to a pending `NOTIFY` across a suspend. That needs measurement, not a citation.**

## Blob storage: decided, not built

*Sources* are text. ~100k characters is ~300 KB and belongs in Postgres alongside everything else.
**No object store is added in v1.**

When the original binary is worth keeping — a PDF or subtitle file retained so it can be
re-extracted by a better parser — **the answer is the developer's own S3**, recorded now because it
is the one component that is already at the stated destination rather than temporary.

## What must not happen, so the move stays cheap

**Nothing may depend on a Vercel-only feature** — not Vercel KV, not Vercel Blob, not Vercel Cron.
Everything lives in Postgres. With that held, the migration is a Nitro preset change plus a
`pg_dump`; without it, it is a rewrite.

⚠️ Vercel Hobby is **"restricted to non-commercial personal use only."** Kioku qualifies. It is a
hard term, not a soft one.

## The one thing to test rather than read

⚠️ **Nobody documents whether Nuxt's `noScripts` survives the Vercel preset.** Neither Nitro's
Vercel page nor Vercel's Nuxt page mentions it; route rules generally are documented as mapping to
Vercel's native rules and `ssr: false` is covered explicitly, but the zero-JavaScript setting is
documented only platform-agnostically. **`noScripts` is the main reason ADR 0020 chose Nuxt.**

**Build one throwaway page with it and read the network tab, in the first week.** If it does not
survive, ADR 0020's revisit condition fires.

⚠️ **Answered 2026-09-06 from `nitropack@2.13.4`'s source** (`phase-4-verification.md` §8; decision
log § Still open), and made a local test by `11` §6.1. ~~**It has still not been observed on a
deployment**, because there has been none. [#45](https://github.com/yutaasakura96/kioku/issues/45)
does that.~~ ⚠️ **Observed 2026-09-28 by #45 on the first deployment:** `/auth/refused` from
`https://kioku-pink.vercel.app` carries **0** `<script` tags and no `.js` reference, built by the
`vercel` preset. The source reading held. See § Observed on the first deployment.

## Amended 2026-09-28: the deployment is planned, and seven questions it left open are answered

This ADR decided the shape on 2026-09-06, and nobody carried it out. `00-status.md` § Carrying still
reads *"Nothing has ever deployed this app"*. On 2026-09-28 Yuta chose the first deployment as the
next work, over a second *subject*, a production template and decks, and accepted every
recommendation on the planning board. None of the answers goes against this ADR, so none needs an ADR
of its own. They are recorded here.

- **Production is the existing Neon database, and local development moves to PGlite.** No data
  moves, and no second branch is made. UI work runs on `npm run dev:session` (decision log
  2026-09-25, #43). That is what makes `03` §13.1's *production never shares a string with
  development* true, and it supersedes this ADR's *a branch per environment*. The laptop keeps only
  the worker's **direct** string, because the laptop worker is the production worker. Alternatives
  set aside: a Neon `dev` branch (it shares Free's 100 CU-hours), local development on the production
  database (it would have meant amending `03` §13.1), and a fresh branch with a `pg_dump` (it copies
  `review_log` for no benefit, and a mistake costs it).
- **The function region is `sin1`** (Singapore), the same AWS region as Neon
  (`aws-ap-southeast-1`). Hobby allows one function region, and Vercel's default for a new project is
  `iad1`, so this has to be set. (Both verified against Vercel's docs on 2026-09-28.) Every screen
  renders server-side over several sequential queries, and `sin1` keeps each round trip in-region.
  ⚠️ **The latency difference between regions is not measured.** This rests on topology.
- **Deploys go through Vercel's Git integration: production is `main`, and preview deployments are
  off.** A preview cannot sign in (`08` §10), and with previews off no preview ever needs a database
  string. Manual CLI deploys were set aside because they are one more step to forget. **The region
  and previews-off are set in `vercel.json`, in the repository**, not in the dashboard, so they are
  reviewed like code. That is configuration, not a runtime dependency, so § What must not happen
  holds. `regions` is documented (Vercel, "Configuring regions for Vercel Functions"). ~~⚠️ **The
  previews-off key is not verified yet**~~ ⚠️ **Verified 2026-09-28 by #45**, see § The
  `vercel.json` keys below.
- **A migration reaches production as a manual release step, before `develop` is merged into
  `main`.** This is how every migration so far has been applied. It keeps a database string out of
  both Vercel's build and the public repository's Actions secrets. `03` §4.2 carries the rule, and
  [#48](https://github.com/yutaasakura96/kioku/issues/48) writes out the procedure. Revisit if a
  migration is ever forgotten. **The release step's production string is kept in 1Password** and
  injected into the migrate command alone at run time (for example with `op run`). It is never
  written to a file, so no file on the laptop gives a command the production database except the
  worker's `worker/.env`. **The migration uses Neon's direct string, not the pooled one.** DDL does
  not go through PgBouncer's transaction mode. ⚠️ **#48 confirms that against Neon's docs before the
  procedure relies on it.**
- **The address is `<project>.vercel.app`.** A domain comes only with this ADR's move to EC2 or
  Lightsail. At the move, one redirect URI and one bookmark change.
- **Done means every screen and every input works from the deployed app**, including the `.apkg`
  upload and the `noScripts` check, not only sign-in and *Review*. That is what turns ADR 0068 §2's
  `/tmp` answer and this ADR's `noScripts` answer from documented into observed.
- **Yuta does a real-phone pass of typed *Review*:** IME input, `S`, `X`, Done, and airplane mode
  mid-*session* then back online. Each finding becomes a ticket. A phone-viewport e2e test can follow
  as one of those tickets. It cannot replace the pass, because it can test neither an IME nor a real
  network drop.

**What stands unchanged:** Vercel Hobby for the app, Neon Free, the worker on the laptop, and
nothing Vercel-only. The app uses the pooled string and the worker the direct one, and the model key
never reaches the app tier. **Moving the worker is not part of this**: it still waits for § Revisit
if.

**Still unverified, and the slices carry each one:**

- ~~Nitro's zero-config detection of Vercel for this app. `nuxt.config.ts` sets no preset (#45).~~
  Observed 2026-09-28: the build log prints `Nitro preset: vercel`.
- ~~`noScripts` on the deployed origin (#45)~~ (observed 2026-09-28, **0**), and `os.tmpdir()` being
  writable plus `unpackDeck`'s duration against 300 s (#46).
- Neon's docs on running migrations over the direct string, which #48 reads before relying on it.
- ~~The `vercel.json` key that turns previews off (#45).~~ Verified 2026-09-28; see § The
  `vercel.json` keys.
- ~~How many Neon branches exist today. It was not checked, because the planning read no live Neon
  state.~~ Read 2026-09-28 by #45: **one**, the default `main` branch of project `kioku`.

**Tickets, drafted 2026-09-28 and confirmed by Yuta the same day, so they are `ready-for-agent`.**
The human-only steps in each are still his: the Vercel project, the Google Cloud console, the values,
the phone, and any model-key spend.
[#45](https://github.com/yutaasakura96/kioku/issues/45) sign in and grade one card from the deployed
URL; [#46](https://github.com/yutaasakura96/kioku/issues/46) every input and every screen;
[#47](https://github.com/yutaasakura96/kioku/issues/47) typed *Review* on a real phone;
[#48](https://github.com/yutaasakura96/kioku/issues/48) the release path, with local development off
production. #46 and #47 are blocked by #45. The local-development half of #48 lands with #45.

### The `vercel.json` keys (#45, 2026-09-28)

`vercel.json` at the repository root carries two settings and nothing else:

```json
"regions": ["sin1"],
"git": { "deploymentEnabled": { "**": false, "main": true } }
```

- **`regions`** is the project-level default function region, from Vercel's
  [Configuring regions for Vercel Functions](https://vercel.com/docs/functions/configuring-functions/region).
- **Previews off is `git.deploymentEnabled`**, from Vercel's
  [Git Configuration](https://vercel.com/docs/project-configuration/git-configuration) (read
  2026-09-28). Its value is a map from a branch name or minimatch pattern to a boolean, and *"any
  unspecified branch is set to `true`"*. The page also says *"If a branch matches multiple rules and
  at least one rule is `true`, a deployment will occur"*, so `main` deploys and every other branch
  does not.
- ⚠️ **The pattern is `**`, not `*`, and that was measured rather than read.** This repo's branches
  carry slashes (`fm/…`, `renovate/…`). Under minimatch 10.2.6, `*` matches `main` and `develop` but
  **not** `fm/kioku-first-deploy`, and `**` matches all three. With `*`, every agent and Renovate
  branch would still get a preview. The docs say minimatch without naming a version or options, so
  what Vercel's matcher does with a slash is **documented by inference, not observed**; the first
  push to a slashed branch after the project exists is the observation.
- ⚠️ **Vercel reads `vercel.json` from the commit being deployed.** Until a release carries this file
  to `main`, a production deploy of `main` runs in the default `iad1`, and until `develop` carries
  it, a push there builds a preview. So the project is created after the release that carries this
  file reaches `main`, or its first production deploy is redeployed once it does.
- It sets **no** preset, no `functions`, no `crons` and no rewrites. The app still builds and runs
  with this file deleted, which is what § What must not happen asks.

### Observed on the first deployment (#45, 2026-09-28)

The Vercel project is **`kioku`**, on the Hobby team `yuta-asakuras-projects`, linked to
`yutaasakura96/kioku` with production branch `main`. `kioku.vercel.app` belongs to someone else, so
**the address Vercel assigned is `https://kioku-pink.vercel.app`**. That is `<project>.vercel.app`
everywhere this ADR, `03` §13.1 and `08` §10 say it. The first production deployment built `main` at
`dc12d3f`.

- **Preset: `vercel`.** The build log prints `Nitro preset: vercel` and `Building Nuxt Nitro server
  (preset: vercel …)`. Zero-config detection works, so `nuxt.config.ts` still sets none.
- **Node: `24.x`.** That is the project's default and the deployment's `nodeVersion`. `engines` is
  `^22.19.0 || ^24.11.0 || >=26.0.0`, and the install printed no `EBADENGINE`. ⚠️ **The log prints no
  patch number**, so `>=24.11` is inferred from Vercel running the current 24 line, not read. `node:sqlite`
  is unflagged across all of 24.x, which is what #46 needs.
- **Region: `sin1`.** The deployment's `regions` is `["sin1"]`, and a response from the function
  carries `x-vercel-id: hnd1::sin1::…` (edge in Tokyo, function in Singapore). **The build itself ran
  in `iad1`**, which is where Vercel builds, not where it runs; `regions` does not govern it.
- **`noScripts` survives the preset.** `curl -s https://kioku-pink.vercel.app/auth/refused | grep -c
  '<script'` printed **0**, and the body names no `.js` file. `/auth` (`ssr: true`, not `noScripts`)
  carries its entry script, as it should.
- **Signed out, every *place* and *mode* redirects to `/auth`.** `/`, `/sources`, `/sources/:id`,
  `/stats`, `/vet`, `/review` and `/api/export` each answered `302` to `/auth`; `/api/review/session`
  answered `401`.
- **Cookies are `Secure`.** Starting a Google sign-in set `__Secure-better-auth.state` with `HttpOnly;
  Secure; SameSite=Lax`, and the authorisation URL carried `redirect_uri=https://kioku-pink.vercel.app/api/auth/callback/google`.
  Both derive from `BETTER_AUTH_URL` (`08` §5.3).
- **Production had every migration before the deploy.** `drizzle.__drizzle_migrations` held nine
  rows whose hashes are the SHA-256 of `0000` to `0008` in `server/db/migrations/`. Nothing was
  applied.
- **The six values are in Vercel's Production environment only**, and `BETTER_AUTH_SECRET` is newly
  generated. `DATABASE_URL`, the secret, `GOOGLE_CLIENT_SECRET` and `KIOKU_INVITED_EMAIL` are stored
  as Vercel *sensitive* values, which cannot be read back.
- **Deployment Protection is Vercel's default for a new project** (`all_except_custom_domains`). The
  production address above answers the public. The team aliases and per-deployment URLs
  (`kioku-*-yuta-asakuras-projects.vercel.app`) answer `302` to Vercel's login, so only
  `kioku-pink.vercel.app` can sign in, which matches the one registered redirect URI. Nothing was
  changed.

## Alternatives considered

**Render at $20/month flat** — app, worker and Postgres all managed, background workers a
first-class type, nothing to own. This was the recommendation. Rejected as the wrong shape for a
phase that is explicitly temporary: it pays for always-on infrastructure to serve one user who is
also the developer.

**Railway at ~$5 metered** — became viable once the worker's footprint was measured at 93–136 MB.
Not chosen for the same reason.

**Hetzner CX/CAX at ~€6** — cheapest, and SudachiPy does publish `manylinux_aarch64` wheels so the
ARM line is fine. Rejected for the initial phase because it makes the developer responsible for
Postgres backups, and **review history is the one thing in the system that cannot be regenerated**
(§2.4). An untested backup is a belief, not a backup.

## Revisit if

*Ingestion* needs to run while the laptop is off — the first real signal, and a moment that will be
noticed rather than needing to be watched for. At that point the worker moves to a small always-on
box, and Neon's free-tier connection budget becomes a live constraint rather than a note.
