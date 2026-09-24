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
  <!-- `10` §9: the empty-state block in `--k-measure-empty`, left-aligned, with
  no shell — there is nowhere to navigate to before you are in. What is here is
  what §9.1 names, in order: the mark, the name, one body line, the rule, the
  control. Signed in, the email takes the statement's place. -->
  <main class="door">
    <EmptyBlock v-if="signedInEmail" size="datum">
      <template #statement>
        {{ signedInEmail }}
      </template>
      <template #body>
        You are signed in as the invited account.
      </template>

      <button type="button" class="primary" @click="signOut()">
        Sign out
      </button>
    </EmptyBlock>

    <EmptyBlock v-else size="mark">
      <template #statement>
        <span lang="ja">記憶</span>
      </template>
      <template #name>
        Kioku
      </template>
      <template #body>
        Kioku is invite-only.
      </template>

      <!-- ⚠️ `10` §9.1: **the key hint slot is empty** — there is no key. -->
      <button type="button" class="primary" @click="signIn()">
        {{ signingIn ? 'Signing in…' : 'Continue with Google' }}
      </button>
    </EmptyBlock>
  </main>
</template>

<style scoped>
/* ⚠️ **Neither `05` nor `10` gives the block's inset on a screen with no
   chrome**, so these are steps off `05` §5's scale: `--k-gutter` at the sides,
   as on every screen, and `52px` down — the same inset *Vet* gives its reading
   column below the bar. */
.door {
  padding: var(--k-space-10) var(--k-gutter);
}

/* `05` §7's primary control, full width of its column — the same rule as
   Ingest's submit (`app/pages/index.vue`), written here rather than shared
   because moving Ingest's is not this ticket (#40). */
.primary {
  display: block;
  width: 100%;
  padding: 9px 0;
  background: var(--k-ink-ground);
  border: 1px solid var(--k-ink-ground);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 14px;
  color: var(--k-ground);
  cursor: pointer;
}

/* An inverted control has no face left to darken, so its hover moves its ink —
   `10` §3.3. ⚠️ And **nothing greys out** while signing in (ADR 0035): the
   label changes and that is all. */
.primary:hover {
  color: var(--k-on-ink);
}
</style>
