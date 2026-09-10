/**
 * A signed-in reader, for the e2e tier.
 *
 * ⚠️ **Sign-in itself is still not tested and this does not test it.** `11` §8
 * puts the flow through Google's redirect in the end-to-end-only column and
 * `11` §9 declines to test Better Auth's own behaviour. What this produces is a
 * *session*, by writing the row the library would have written and presenting
 * the cookie the library would have set — so that the routes **behind** the gate
 * become reachable. Everything either side of that is still `08`'s and #5's.
 *
 * ⚠️ **The cookie is forged in the test, never in the application.** `S1` says
 * refused at every route, and a test-only endpoint that mints a session would be
 * a hole in exactly the property #5 was built to establish. Nothing here is
 * imported by anything under `app/` or `server/`.
 *
 * The signing is Better Auth's own, read off `better-call` 's
 * `signCookieValue` on 2026-09-11:
 *
 * ```
 * encodeURIComponent(`${token}.${base64(HMAC-SHA256(secret, token))}`)
 * ```
 *
 * ⚠️ **It cannot pass by accident.** A wrong signature, a wrong secret or a
 * missing row all resolve to no session, and every route this cookie is used on
 * answers `302` to `/auth` — so a broken forgery fails the assertion loudly
 * rather than quietly returning something else. That is the property that makes
 * reproducing a library's format in a test acceptable at all.
 */

import { createHmac } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'

import { TEST_ENVIRONMENT } from './environment'

/** Better Auth's default cookie name, with no `cookiePrefix` configured. */
const SESSION_COOKIE = 'better-auth.session_token'

export interface SignedInReader {
  userId: string
  /** Ready for a `Cookie:` request header. */
  cookie: string
}

/**
 * Writes the invited reader and a live *session*, and returns the cookie for it.
 *
 * The email is `KIOKU_INVITED_EMAIL` from `test/e2e/environment.ts` — the same
 * allowlist the process refuses to start without (`08` §4.3). A different
 * address here would be a reader the application is configured to turn away.
 */
export async function signIn(client: PGlite, userId = 'usr_e2e'): Promise<SignedInReader> {
  const token = `e2e-session-token-${userId}`

  await client.exec(`
    INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('${userId}', 'Reader', '${TEST_ENVIRONMENT.KIOKU_INVITED_EMAIL}', true, now(), now())
    ON CONFLICT (id) DO NOTHING;
  `)

  await client.exec(`
    INSERT INTO auth."session" (id, expires_at, token, created_at, updated_at, user_id)
    VALUES (
      'ses_${userId}',
      now() + interval '7 days',
      '${token}',
      now(),
      now(),
      '${userId}'
    )
    ON CONFLICT (id) DO UPDATE SET expires_at = excluded.expires_at;
  `)

  return { userId, cookie: `${SESSION_COOKIE}=${signCookieValue(token)}` }
}

function signCookieValue(value: string): string {
  const signature = createHmac('sha256', TEST_ENVIRONMENT.BETTER_AUTH_SECRET!)
    .update(value)
    .digest('base64')

  return encodeURIComponent(`${value}.${signature}`)
}
