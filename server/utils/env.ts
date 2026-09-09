/**
 * Reads a required environment variable, or stops the process.
 *
 * ⚠️ **A missing value is a dead process, not a degraded one.** `08` §4.3 makes
 * this choice for `KIOKU_INVITED_EMAIL` and states the reason as a property
 * rather than a preference: a misconfigured deploy should fail loudly at the
 * boundary rather than answer requests in a shape nobody chose. An allowlist
 * that softens to `|| ''` when its variable is absent is an open door with a
 * comment above it.
 *
 * Better Auth itself fails closed in the same situation — a missing endpoint
 * context throws `FORBIDDEN` rather than skipping the check (verification
 * §11.5) — so this matches the library rather than fighting it.
 *
 * `server/db/index.ts` makes the same choice for `DATABASE_URL` inline, and
 * predates this helper.
 *
 * ⚠️ **The repo is public** (`03` §13.1). The thrown message names the variable
 * and never a value, here and everywhere else.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]

  // Whitespace counts as absent. A variable set to `" "` in a deployment
  // dashboard is a typo, not a configuration, and comparing against it would
  // admit nobody while looking configured.
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${name} is not set. The process does not start without it (\`08\` §4.3).`)

  return value
}
