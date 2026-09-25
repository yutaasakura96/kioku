/**
 * The refusal `npm run dev:session` makes before it writes anything.
 *
 * ⚠️ **The script forges a session**, with the same code the e2e tier uses
 * (`test/e2e/session.ts`). That is safe for exactly one reason: the database it
 * writes to and the secret it signs with are both local, so the cookie it hands
 * out opens nothing but a laptop. This function is where that reason is checked
 * rather than assumed, and it is a pure function so that each refusal is a unit
 * test (`test/unit/dev-session-guard.test.ts`) rather than an attempt.
 *
 * Every rule fails closed: a URL that does not parse is not local, and an
 * unknown environment is not a development one.
 */

export interface DevSessionTarget {
  /** `NODE_ENV` of the process running the script. */
  nodeEnv: string | undefined
  /** Where the session row is about to be written. */
  databaseUrl: string
  /** The app the cookie is for — becomes its `BETTER_AUTH_URL`. */
  appUrl: string
  /** The secret the cookie is about to be signed with. */
  secret: string
  /**
   * Secrets known to be real, which a local cookie must never be signed with —
   * the root `.env`'s `BETTER_AUTH_SECRET`, which is the one Google sign-in
   * uses against Neon.
   */
  realSecrets: readonly string[]
  /**
   * `VERCEL` or `VERCEL_ENV`, which Vercel sets in every deployed runtime and
   * build (ADR 0022's deployment). Anything here means this is not a laptop.
   */
  vercel: string | undefined
}

/**
 * Hosts that are this machine. There is no Docker Compose service for Postgres
 * in this repository — the e2e tier's database is PGlite (ADR 0038) — so a
 * container reached through a published port is `localhost` like anything else.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function loopbackHost(url: string): string | undefined {
  try {
    const host = new URL(url).hostname
    return LOOPBACK_HOSTS.has(host) ? host : undefined
  }
  catch {
    return undefined
  }
}

/** Returns why the script must stop, or `undefined` when every rule holds. */
export function refusal(target: DevSessionTarget): string | undefined {
  if (target.nodeEnv === 'production')
    return 'NODE_ENV is production. A dev session is for a laptop, never a deployed process.'

  if (target.vercel)
    return 'VERCEL is set, so this is a Vercel runtime or build, not a laptop.'

  if (!loopbackHost(target.databaseUrl))
    return 'The database URL does not point at localhost or 127.0.0.1. The session row is only ever written to a local database.'

  let app: URL
  try {
    app = new URL(target.appUrl)
  }
  catch {
    return 'The app URL does not parse.'
  }

  if (app.protocol !== 'http:' || !loopbackHost(target.appUrl))
    return 'The app URL is not http on localhost. A local cookie is only ever handed to a local app.'

  if (target.secret.trim() === '')
    return 'The auth secret is empty.'

  if (target.realSecrets.some(real => real.trim() !== '' && real === target.secret))
    return 'The auth secret is the real one from .env. A dev session signs with a local secret only, so its cookie opens nothing but this laptop.'

  return undefined
}
