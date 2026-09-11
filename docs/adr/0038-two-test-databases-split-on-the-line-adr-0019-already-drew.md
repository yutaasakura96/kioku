# Two test databases, split on the line ADR 0019 already drew

**The TypeScript side tests against PGlite — real PostgreSQL 18.3, in process, no Docker. The Python
worker tests against a real Postgres 18 container, because its three load-bearing behaviours all need
a second session and PGlite is single-connection.** Both databases are built by Drizzle's own
migrations, so neither is a second copy of the schema.

## The question was asked under an assumption that turned out to be false

The framing was: `04` puts the load-bearing rules in the schema — one trigger, `RESTRICT` on
everything irreplaceable, a `CHECK` on `char_count` — and *a mock cannot fail a foreign key*, so the
tests that matter most are exactly the ones a unit test cannot run.

**True, and it does not lead where it looks like it leads.** PGlite is not a mock. Measured
2026-09-07 (verification §14.1), because its documentation does not state the version:

```
PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten
```

**18.3, which matters more than it looks** — `04` defaults every primary key to `uuidv7()`, a
Postgres 18 built-in (verification §10.1). A PGlite on 17 would have failed on the first `CREATE
TABLE` and this ADR would read the other way.

Everything `04` relies on was then run against it, and **every rule refused what it is supposed to
refuse**: the `review_log` trigger raises on `UPDATE` and on `DELETE`; `ON DELETE RESTRICT` refuses
the delete and names the constraint; the partial unique index refuses a second live
`scheduling_epoch`; the `CHECK`s refuse `rating = 7` and an unlisted `suspended_reason`. Boot to
first query: **946 ms**.

So the expensive option is not required for the expensive tests. `ON DELETE RESTRICT` is testable in
under a second, in process, with no daemon running.

## Where PGlite genuinely stops, and it is one place

Two mechanisms only *parsed*. Both need a second session, and PGlite does not have one. Its own
documentation:

> as PGlite is **single connection only** …

> Multiple concurrent connections are supported through a **multiplexer over the single conn**,
> therefore **not all cases might be covered**.

The multiplexer is the wrong instrument here specifically: it is an approximation of concurrency, and
concurrency is the thing under test.

The two mechanisms are `04` §6.4's job claim — `SELECT … FOR UPDATE SKIP LOCKED`, whose whole
behaviour is what the *second* worker sees — and ADR 0028's reconnect loop, where a `LISTEN` is torn
down by a session ending elsewhere and the poll is what recovers. Add the stale-claim sweep, which
needs a claim held by a worker that has stopped heartbeating.

**All three belong to the worker. The worker is Python** (ADR 0019), so it could not have used a
JavaScript library regardless — and reaching for `pglite-socket` to bridge that gap would be running
the concurrency tests through the component whose own docs say not all cases are covered.

## So the split is not a new line

ADR 0019 put the pipeline in Python and left everything else in TypeScript, and recorded the
two-toolchain tax as its own weakest point. `03` §6 already pays that tax once, with a cross-language
test guarding the *subject* declaration. **This is the same boundary a second time, and following it
costs nothing extra**, because the two suites were never going to be one suite.

| Side | Database | Runs |
| --- | --- | --- |
| Nuxt app, TypeScript | **PGlite 0.5.8** (Postgres 18.3), in process | Every constraint, trigger, cascade rule and query in `04`; the export reconciliation; the `Z`-on-`RESTRICT` refusal |
| Worker, Python | **A real Postgres 18 container** (`testcontainers` 4.15.0) | The job claim under two workers; the stale-claim sweep; `LISTEN` torn down and recovered by the poll |

⚠️ **Docker is required for three tests and nothing else.** Naming the number is the point: a
laptop with no Docker can run the entire TypeScript suite, and it is the worker's three concurrency
tests that go red — visibly and for a stated reason, rather than the whole suite refusing to start.

⚠️ **Amended 2026-09-11 with #7 — the number moved and the sentence it was protecting did not.**
The worker tier now needs the container for **twenty-three** tests, not three. The extra ones are not
concurrency behaviours: they are the SQL #7 writes — `04` §6.2's chunk queue and resume query, the
settle, the drain — and testing Python's SQL needs a database, which in Python means a container.
The alternative was testing a *copy* of those queries from the TypeScript tier against PGlite, which
is this ADR's own drift argument aimed at the tier that exists to prevent drift.

**What is unchanged is the claim worth keeping:** a laptop with no Docker still runs the entire
TypeScript suite, and what goes red is the worker's, visibly and for a stated reason —
`worker/tests/conftest.py` prints which three behaviours ADR 0038 named and what to do about it.
Three of the twenty-three are still exactly those three. ⚠️ **The one thing not to do is fold the two
harnesses together**; the 946 ms inner loop is what this decision bought.

⚠️ **Amended again 2026-09-12 with [#8](https://github.com/yutaasakura96/kioku/issues/8) — twenty-three
is now forty**, of a worker suite of 140. What joined them is the same kind of thing again: #8's SQL,
which is the *pipeline* wired to the database — the corpus lookup, the rejected filter, the
*occurrence* append and `04` §6.1's ledger — plus ADR 0046's two new sweep branches and one test that
is not about the worker at all, `test_scratch_cleanup.py`, which asserts that this tier's own fixture
cannot reach `review_log`. ⚠️ **That one is worth naming here**, because it is a failure this ADR's
container tier created and nothing else could have caught: `TRUNCATE … CASCADE` walks
`ingestion` → `note` → `card` → `review_log`, and PGlite's tier never runs it.

**The claim worth keeping is untouched for the second time**, and the count moving twice in two
tickets is the argument for stating it as a claim rather than as a number: a laptop with no Docker
runs the entire TypeScript suite *and the whole pure pipeline*, and what goes red is the worker's
database files. Three of them are still exactly the three this ADR named.

⚠️ **Amended a third time 2026-09-12 with [#9](https://github.com/yutaasakura96/kioku/issues/9), and
the number is gone from this ADR rather than moved again.** #9 added stages 6 and 7 against real SQL
— `04` §6.3's cache, `04` §6.1's spend half, and the four writes one *pending note* is — which is the
same kind of thing for the third time. **The count now lives in `worker/tests/README.md` and in no
other file**, which is what #8's own finding asked for after shipping it stale in two of the four
places that repeated it. What this ADR decides was never the number; it is *which* two databases
exist and where the line between them is, and that has not moved once.

## The migrations build both, and that is what stops the schema forking

`drizzle-orm` 0.45.2 — the version `03` §13.5 pins — exports **`./pglite/migrator`** alongside
`./node-postgres/migrator` (verification §14.4). So both test databases are created by running the
production migrations, in order.

**A hand-written `schema.sql` for tests would be a second copy of `04`**, and `04` §13's whole
argument against `note_type`, `authority` and `rejected_term` tables is that copies drift. A test
schema is the same failure with a different filename, and it drifts in the most damaging direction:
the tests keep passing against the schema the tests describe.

## Alternatives considered

**Testcontainers for everything, both sides** — the obvious answer, and rejected on cost with no
compensating gain. It puts a Docker daemon between the developer and every `RESTRICT` test that
PGlite refuses correctly in under a second, and it makes the fast inner loop depend on a runtime that
ADR 0022's temporary laptop deployment does not otherwise need.

**PGlite for everything, with the three concurrency tests written against the socket multiplexer** —
rejected on the docs' own warning. A test of `SKIP LOCKED` that passes through a multiplexer proves
the multiplexer works.

**A real Postgres for everything, installed locally rather than containerised** — rejected because
the version is then whatever the laptop has, and `uuidv7()` makes the version load-bearing. A pinned
image is the version being an input rather than an accident.

**A Neon branch per test run** — genuinely attractive: it is Postgres 18 by definition, it is the
production engine exactly, and branching is cheap. Rejected because it makes the test suite depend on
a **Neon-only feature**, and ADR 0022's whole premise is that the move to EC2 or Lightsail stays a
preset change plus a `pg_dump`. A suite that only runs against Neon is a second thing to port, and it
is the thing you need working *while* you port the first. It also puts the network in the inner loop.

## What it costs

**Two harnesses to keep working, and a version pin in two places** — the PGlite package version and
the Postgres image tag both have to stay on 18, and nothing will tell you when they diverge except a
`uuidv7()` that stops existing.

And ⚠️ **PGlite is a WASM build, not the binary Neon runs.** Every rule tested above behaved
identically, which is the evidence this ADR rests on — but it is evidence about the rules that were
tested, not a guarantee about the ones that were not. The mitigation is that the worker's suite runs
the real server binary, so the two are never both approximations at once.

## Revisit if

PGlite diverges from the Postgres version Neon runs, or a fourth behaviour turns out to need a second
session — at which point the question is whether the TypeScript suite grows a small containerised
tier of its own, not whether PGlite goes. The 946 ms is worth keeping for the ninety-odd tests that
do not need Docker.
