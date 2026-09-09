# Worker tier

`11-testing-plan.md` §1: pytest 9.1.1 with `testcontainers` 4.15.0, against **a
real Postgres 18 container** — the pipeline end to end and the three concurrency
behaviours.

⚠️ **Docker is required for exactly three tests and nothing else** (ADR 0038). A
laptop without it runs the whole TypeScript suite and gets three red tests here,
visibly and for a stated reason. Do not "simplify" the two harnesses into one
Testcontainers tier; the 946 ms inner loop is the thing being bought.

## ⚠️ The image tag, which is half of a pin

**`postgres:18.3-alpine`.** Recorded 2026-09-09 with #4, before anything uses it,
because it is the half of PIN 6/6 that lives outside every manifest (`03` §13.5).

`@electric-sql/pglite` is pinned at 0.5.8 **because 0.5.8 is PostgreSQL 18.3** —
measured, since PGlite's own documentation does not state which PostgreSQL it
builds (ADR 0038, verification §14.1). `04` defaults every primary key to
`uuidv7()`, a Postgres 18 built-in, so a database on 17 fails on the first
`CREATE TABLE`. **The two test databases have to agree on the major or the
schema tier and this tier are testing different things.**

⚠️ **No bot watches this line.** Renovate reads manifests, and a tag in a README
is not one — which is precisely `03` §13.5's point: *nothing will tell you when
the two halves diverge except a `uuidv7()` that stops existing.* The TypeScript
half is guarded by an assertion in `test/schema/schema.test.ts`; **#7 owes this
half the same guard** in its container fixture.

Not run by Vitest. Empty until
[#7](https://github.com/yutaasakura96/kioku/issues/7).
