# Worker tier

`11-testing-plan.md` §1: pytest 9.1.1 with `testcontainers` 4.15.0, against **a
real Postgres 18 container** — the pipeline end to end and the three concurrency
behaviours.

⚠️ **Docker is required for exactly three tests and nothing else** (ADR 0038). A
laptop without it runs the whole TypeScript suite and gets three red tests here,
visibly and for a stated reason. Do not "simplify" the two harnesses into one
Testcontainers tier; the 946 ms inner loop is the thing being bought.

Not run by Vitest. Empty until
[#7](https://github.com/yutaasakura96/kioku/issues/7).
