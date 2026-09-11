# Worker tier

`11-testing-plan.md` §1: pytest 9.1.1 with `testcontainers` 4.15.0, against **a
real Postgres 18 container** — the pipeline end to end and the three concurrency
behaviours.

⚠️ **Docker is required for twenty-three of the eighty-six tests here**, and
ADR 0038 carries the amendment. It said *three*, naming the three concurrency
behaviours; #7 also writes SQL that is not a concurrency behaviour — the chunk
queue, `04` §6.2's resume query, the settle, the drain — and testing Python's
SQL needs a database, which in Python means a container. **The sentence that was
being protected is untouched:** a laptop without Docker runs the whole TypeScript
suite and gets the worker's database tests red, visibly and for a stated reason —
`conftest.py` prints it. Do not "simplify" the two harnesses into one
Testcontainers tier; the 946 ms inner loop is the thing being bought.

## ⚠️ The image tag, which is half of a pin

**`postgres:18.3-alpine`** — and as of #7 it lives in `conftest.py`, as
`POSTGRES_IMAGE`, because a tag in prose cannot be asserted. Recorded here
2026-09-09 with #4, before anything used it, because it is the half of PIN 6/6
that lives outside every manifest (`03` §13.5).

`@electric-sql/pglite` is pinned at 0.5.8 **because 0.5.8 is PostgreSQL 18.3** —
measured, since PGlite's own documentation does not state which PostgreSQL it
builds (ADR 0038, verification §14.1). `04` defaults every primary key to
`uuidv7()`, a Postgres 18 built-in, so a database on 17 fails on the first
`CREATE TABLE`. **The two test databases have to agree on the major or the
schema tier and this tier are testing different things.**

⚠️ **No bot watches this line**, and none can: Renovate reads manifests and a
Docker tag in a test fixture is not one — which is precisely `03` §13.5's point:
*nothing will tell you when the two halves diverge except a `uuidv7()` that stops
existing.* The TypeScript half is guarded by an assertion in
`test/schema/schema.test.ts`; **#7 paid this half's guard**, as
`conftest._assert_postgres_18`.

⚠️ **It runs before the migrations, not as a test.** Applying `0000_schema.sql`
to a Postgres 17 fails on the first `CREATE TABLE` with `function uuidv7() does
not exist`, which is true and tells nobody what happened; the fixture says it in
one line instead. It is a precondition of all twenty-three rather than a
behaviour of its own, which is also why it did not become a twenty-fourth test.

## What is here now

⚠️ **Four of the seven files need neither a container nor a database**, and the
table below says which. `test_subject_drift.py` is `03` §6's cross-language drift
test — `11` §7: "the one test that exists in both suites by design".

⚠️ **The drift test fails rather than skips when Node is missing**, and Node is
not optional in this repository — the app is a Nuxt app — so a machine without it
is broken rather than merely Docker-less, and a cross-language guard that quietly
excuses itself is not a guard.

⚠️ **Corrected 2026-09-11 with #7 — this paragraph said that was "the opposite of
ADR 0038's three container tests", which asserted the container tests skip. They
do not.** ADR 0038 says the three "go red — visibly and for a stated reason,
rather than the whole suite refusing to start", and `11` §7 and #7's own
acceptance criteria both say *red*. So the two halves of this tier behave the
same way and always were meant to: **nothing here skips.** The line was written
from memory of a decision, against a document that says otherwise, and it sat
here for a day looking like a design note.

```bash
cd worker && uv run pytest
```

Not run by Vitest, and the whole file list is now:

| File | Container | Asserts |
| --- | --- | --- |
| `test_subject.py` | no | Python's view of the *subject* declaration, and its half of `03` §6's `validate` seam |
| `test_subject_drift.py` | no | `03` §6's cross-language drift test, by running `scripts/print-subject-view.ts` under Node |
| `test_loop.py` | no | `03` §3.1's seven steps against a fake connection. ⚠️ **The payload is never read** is a `Notify` whose `payload` property raises |
| `test_db.py` | no | The direct string taken verbatim, the pooled one refused by name |
| `test_jobs.py` | **yes** | `04` §6.4 — the claim under two workers, `SKIP LOCKED` skipping rather than waiting, and the stale sweep |
| `test_runs.py` | **yes** | The chunk queue, `04` §6.2's resume query, the settle, and the drain |
| `test_reconnect.py` | **yes** | ADR 0028's ordering, asked of the **server** through `pg_listening_channels()` |
