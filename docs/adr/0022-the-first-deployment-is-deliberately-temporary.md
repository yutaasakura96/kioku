# The first deployment is Vercel, Neon and a laptop — and it is deliberately temporary

**The Nuxt app deploys to Vercel, the database is Neon Postgres with a branch per environment, and
the Python *ingestion* worker runs on the developer's own machine.** All three are chosen to be
thrown away: the stated destination is EC2 or Lightsail once the developer's other projects move
there. Findings in [`../phase-4-verification.md`](../phase-4-verification.md) §7.

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
