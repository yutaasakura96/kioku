<script setup lang="ts">
// The door. Universal rendering, and the one route that ships JavaScript while
// being neither a *place* nor a *mode* (`08` §2) — because `signIn.social` and
// `signOut` are client calls and a *place* has no client to make them from.
//
// ⚠️ **The session still comes from the server middleware, not from the client.**
// ADR 0030 holds here too: `useRequestEvent()` reads what the middleware already
// resolved on the SSR pass, and `useState` carries it into the payload so the
// signed-in view survives hydration. `authClient.useSession()` would be the
// obvious thing to reach for and it is the one thing this file must not do —
// `08` §6.1, and the comment in `app/utils/auth-client.ts`.
//
// Only the email crosses into the payload. It is the reader's own address on the
// reader's own screen, and it is the only field either state renders.

const signedInEmail = useState<string | null>('kioku-signed-in-email', () => {
  // Server-only. `useRequestEvent()` returns `undefined` in the browser
  // (verification §11.3), which is what makes the split self-enforcing.
  const context = useRequestEvent()?.context as
    | { session?: { user?: { email?: string } } | null }
    | undefined

  return context?.session?.user?.email ?? null
})

// ⚠️ ADR 0035: **nothing in v1 is disabled.** After the press the label changes
// and a second press is ignored, and the control does not grey out — the
// redirect is imminent, and grey-ing a control the reader is looking at teaches
// them the press failed (`10` §9.1).
const signingIn = ref(false)

async function signIn() {
  if (signingIn.value)
    return

  signingIn.value = true

  await useAuthClient().signIn.social({
    provider: 'google',
    callbackURL: '/',

    // ⚠️ The browser half of the refusal (`08` §2.1). The programmatic half is
    // `onAPIError.errorURL` in `server/utils/auth.ts`; both land on
    // `/auth/refused` so that the refusal does not depend on which door was
    // tried. Without this one, a rejection lands back here — on a page with a
    // sign-in button, which is the one thing `S1` says the app must not offer.
    errorCallbackURL: '/auth/refused',
  })
}

async function signOut() {
  await useAuthClient().signOut()
  signedInEmail.value = null
}
</script>

<template>
  <main>
    <!-- ⚠️ `10` §9 specifies both of these screens as the empty-state block in a
    560px column, left-aligned, in tokens from `05-design-system.md`. No token
    layer exists in the repo yet and #5 does not own one, so this is the content
    and the structure without the treatment. What is here is what `10` §9.1
    names, in order: the mark, the name, one body line, the rule, the control. -->
    <template v-if="signedInEmail">
      <p>{{ signedInEmail }}</p>
      <p>You are signed in as the invited account.</p>
      <hr>
      <button type="button" @click="signOut()">
        Sign out
      </button>
    </template>

    <template v-else>
      <p lang="ja">
        記憶
      </p>
      <p>Kioku</p>
      <p>Kioku is invite-only.</p>
      <hr>
      <button type="button" @click="signIn()">
        {{ signingIn ? 'Signing in…' : 'Continue with Google' }}
      </button>
    </template>
  </main>
</template>
