// `08` §6.2 — `event.context.session` is typed here, in `server/types/`, which
// Nuxt scans for server-only types.
//
// The middleware resolves the session once per request and hands over the
// resolved value; **the session cookie is never handed to application code.**
// No route re-derives it (ADR 0030).

import type { auth } from '../utils/auth'

/** Whatever `auth.api.getSession` resolves to, including its `null`. */
type ResolvedSession = Awaited<ReturnType<typeof auth.api.getSession>>

declare module 'h3' {
  interface H3EventContext {
    /**
     * The resolved session, or `null` for an unauthenticated request.
     *
     * ⚠️ `undefined` is a third state and it means the middleware did not run —
     * today that is only the framework's own asset paths, which it skips
     * deliberately (see `server/middleware/session.ts`).
     */
    session: ResolvedSession
  }
}

export {}
