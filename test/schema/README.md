# Schema tier

`11-testing-plan.md` §1: every constraint, trigger and delete rule in
`04-database-schema.md`, run against **PGlite** by Drizzle's own migrations — so
the test database is built by the same migrations as production rather than by a
second copy of the schema that drifts (ADR 0038, verification §14.4).

Empty until [#4](https://github.com/yutaasakura96/kioku/issues/4), which brings
the eighteen tables and the one trigger.
