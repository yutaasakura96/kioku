import { createAuthClient } from 'better-auth/vue'

// The browser half of the door, and the only client-side auth surface in the
// application (`08` §2).
//
// ⚠️ **Constructed lazily, and never during SSR.** `08` §6.1: Better Auth's
// client actions other than `useSession` do not forward cookies during SSR, and
// the library's documented repairs — `<ClientOnly>` or
// `useRequestHeaders(['cookie'])` — are void here, because `<ClientOnly>`
// renders nothing on a route that ships no JavaScript. ADR 0030 closes that by
// resolving the session in one Nitro server middleware instead, so **no page
// ever reads a session through this client.** It exists to call `signIn.social`
// and `signOut`, both of which are presses.
//
// Deferring construction to first press is what keeps that true structurally: a
// future session that reaches for `authClient.useSession()` on a *place* gets
// `undefined` rather than a subtly signed-out render.
//
// `baseURL` is left to resolve from the browser's own origin. There is no server
// caller to resolve it for.

let client: ReturnType<typeof createAuthClient> | undefined

export function useAuthClient() {
  client ??= createAuthClient()
  return client
}
