# The app connects with node-postgres, because the move is the point

**The Nuxt app reaches Postgres through `drizzle-orm/node-postgres` and `pg`, over Neon's pooled
endpoint, with the connection string used verbatim as issued. Not `@neondatabase/serverless`, and not
`drizzle-orm/neon-http`.**

`03` §4.1 settled *which string* each process gets and why — pooled for the app, direct for the
worker, because the pooled endpoint cannot `LISTEN` at all. It did not settle which client library
the app opens that string with, and #4 could not be written without answering it.

## The deciding reason is ADR 0022, not performance

ADR 0022 made the first deployment deliberately temporary, and its whole premise is that the move to
EC2 or Lightsail stays **a Nitro preset change plus a `pg_dump`**. The forbidden list it carries is
about Vercel — no KV, no Blob, no Cron — but the principle underneath it is not Vercel-specific: the
move is cheap only for as long as nothing in the app is bound to where it currently runs.

`@neondatabase/serverless` is bound to Neon. It exists to reach Postgres over HTTP or a WebSocket
proxy from a runtime with no TCP — which is a real problem on edge runtimes and **not a problem we
have**. Vercel's Node runtime opens TCP sockets, and the destination is a plain EC2 or Lightsail
Postgres with no serverless driver at the other end. Adopting it would buy nothing today and add a
second thing the move has to undo, in the one part of the system that touches every request.

So this is ADR 0022's forbidden list applied one step out: not "do not depend on a Vercel feature"
but **do not depend on the current host's shape**.

## What is actually being given up

**Cold-start latency on the first query.** `@neondatabase/serverless`'s HTTP mode skips the TCP and
TLS handshake, which is worth real milliseconds on a cold lambda. That cost is accepted, and it is
bounded by the same thing that bounds everything else here: this is a single-reader application whose
hot read is one indexed query (`04` §11's due query), and `03` §12's measured criterion is
*time-to-first-review*, which is measured in minutes and hours.

**Nothing else.** Drizzle's query API is identical across the two, the pooled endpoint speaks
ordinary Postgres through PgBouncer, and `04`'s schema uses no Neon-specific feature.

## Alternatives considered

- **`@neondatabase/serverless` over WebSockets** — the full-featured Neon driver, transactions
  included. Rejected above: it is the dependency the move has to undo, for a latency win this
  application cannot spend.
- **`drizzle-orm/neon-http`** — the same objection, plus a sharper one: the HTTP driver has no
  session, so it cannot run an interactive transaction. `04` §9.1's `Z` un-mint is two statements
  that must be one transaction or the database's `RESTRICT` guard has nothing to protect. Choosing it
  would have made a schema decision by accident.
- **`postgres.js`** — a fine driver, and Drizzle supports it. It buys nothing over `pg` here and `pg`
  is what Neon's own Node guidance and Drizzle's Postgres docs both reach for first, which matters
  when the next person debugging a connection string searches for an error message.

## Revisit if

- **The app ever needs to run on an edge runtime with no TCP.** That is the problem
  `@neondatabase/serverless` solves, and if it becomes our problem this decision inverts. Nothing in
  `03` or `10` points that way — the three *places* render server-side on the Node runtime.
- **ADR 0022's move happens.** At that point the reason for this choice has been spent and the
  question does not come back: the destination is a plain Postgres, which is what `pg` speaks.
- **Connection count on the pooled endpoint becomes a real limit.** `03` §4.1 records 10000
  `max_client_conn` against one reader, so this is a long way off; if it arrives, the answer is pool
  sizing, not a different driver.
