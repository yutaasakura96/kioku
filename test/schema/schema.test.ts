import { describe, it } from 'vitest'

// The schema tier of `11-testing-plan.md` §1: every constraint, trigger and
// delete rule in `04-database-schema.md`, run against PGlite by Drizzle's own
// migrations, so the test database is built by the same migrations as
// production rather than by a second copy of the schema that drifts
// (ADR 0038, verification §14.4).
//
// Declared as todo rather than left as an empty directory, so the tier is
// visible in every run instead of silently absent.
describe('schema', () => {
  it.todo('every constraint, trigger and delete rule in 04 — #4')
})
