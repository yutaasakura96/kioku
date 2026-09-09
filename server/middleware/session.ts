// The one place a session is resolved, and the one place a request is refused.
// ADR 0030, `08` §6.2 and §6.3.
//
// ⚠️ **Resolving and refusing are two steps on purpose.** Attaching a session
// and rejecting a request are different concerns, and keeping them apart is what
// lets the exception list below be read in one glance. The middleware resolves
// for every route, `/auth` included, so the door can show sign-out; it refuses
// only what is not public.
//
// ⚠️ **There is no client guard anywhere to bypass** (`03` §13.2). Three of the
// five screens ship no JavaScript, so the usual mistake — a route guard in the
// browser — is structurally impossible here rather than merely avoided.
//
// ⚠️ `auth.api.getSession({ headers: event.headers })` is the **Nuxt** spelling.
// The library's Nitro integration page writes `event.req.headers`, which is the
// h3 v2 shape; Nuxt 4.5.2 pins `nitropack ^2.13.4` and h3 v1, where the header
// bag is `event.headers` (verification §11.3, confirmed against h3 1.15.11 on
// disk). The v2 spelling type-checks against nothing and reads `undefined`.

import { auth } from '../utils/auth'

/**
 * `08` §6.3's public set, written out rather than derived.
 *
 * `/api/auth/**` has to be public or nobody can sign in (`08` §3.3); `/auth` is
 * the door; `/auth/refused` is where a refusal lands, and a refused reader has
 * no session by definition — gating it would redirect them to the door they
 * were just turned away from.
 */
const PUBLIC_PATHS = new Set(['/auth', '/auth/refused'])
const PUBLIC_PREFIX = '/api/auth'

/**
 * The framework's own output: `/_nuxt/**`, `/_payload.json`, `/favicon.ico`.
 *
 * ⚠️ These are skipped **before** the session is resolved, and both halves of
 * that matter. Redirecting them would break the two *modes*, whose documents are
 * an app shell that then fetches its own bundle. Resolving a session for each of
 * them would put a database read behind every asset request.
 *
 * It is not a gap in `S1`. What is served here is static build output, identical
 * for every reader and carrying nothing about one — the three *places* ship no
 * JavaScript at all, and the two *modes* fetch their data over `/api/**`, which
 * is gated below. **A path that answers with reader data must not live here**,
 * which is why this predicate is a shape (`/_…`, or a file extension) rather
 * than a list that could quietly grow one.
 */
function isFrameworkAsset(path: string): boolean {
  return path.startsWith('/_') || /\.[^/]+$/.test(path)
}

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.has(path) || path === PUBLIC_PREFIX || path.startsWith(`${PUBLIC_PREFIX}/`)
}

export default defineEventHandler(async (event) => {
  // `event.path` carries the query string; the rules are about the route.
  const path = event.path.split('?')[0] ?? '/'

  if (isFrameworkAsset(path))
    return

  // Resolve. This does not reject.
  event.context.session = await auth.api.getSession({ headers: event.headers })

  if (isPublic(path))
    return

  if (event.context.session)
    return

  // ⚠️ Two answers, because the caller is different. A document request is a
  // reader with a browser and gets sent to the door; `/api/**` is a fetch from
  // one of the two *modes* and gets a status its caller can act on. A 302 to an
  // HTML page is indistinguishable from success to `fetch`, which is how an
  // outbox flush ends up posting grades into a sign-in page (`08` §5.6).
  if (path.startsWith('/api/'))
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // ⚠️ The target is `/auth`, not the requested screen (`08` §11). There is no
  // `?redirect=` to carry, which is one fewer redirect target arriving in a URL
  // — `shared/utils/origin.ts` already carries the argument for the one this app
  // does accept.
  return sendRedirect(event, '/auth', 302)
})
