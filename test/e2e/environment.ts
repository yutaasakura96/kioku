/**
 * The environment the e2e app boots with.
 *
 * ⚠️ Every value here is a fixture and none of them is real (`03` §13.1 — the
 * repo is public, so the file names variables and carries no values). It exists
 * because the app now **refuses to start** without its environment (`08` §4.3),
 * which is the behaviour `test/unit/auth-config.test.ts` asserts on purpose and
 * which every e2e file has to satisfy to get a server at all.
 *
 * ⚠️ `DATABASE_URL` points at nothing. That is deliberate and it is load-bearing
 * for what these tests can claim: an **unauthenticated** request resolves to no
 * session without touching Postgres, so a suite that never signs in needs no
 * database. The day one of these tests signs in, this stops being enough and the
 * failure will be a connection error rather than a silent pass.
 *
 * Sign-in itself is not tested here. `11` §8 puts the flow through Google's
 * redirect in the end-to-end-only column, and `11` §9 declines to test Better
 * Auth's own behaviour; what is testable without Google is the gate around it,
 * which is what this file's callers assert.
 */
export const TEST_ENVIRONMENT: Record<string, string> = {
  DATABASE_URL: 'postgres://kioku@127.0.0.1:5432/kioku-not-a-real-database',
  BETTER_AUTH_SECRET: 'fixture-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'fixture-client-id',
  GOOGLE_CLIENT_SECRET: 'fixture-client-secret',
  KIOKU_INVITED_EMAIL: 'reader@example.com',
}
