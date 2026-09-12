/**
 * ADR 0014's browser store — **the *session* snapshot and the outbox, in
 * `localStorage`**, so a tunnel and a tab crash fail the same way, which is to
 * say they do not.
 *
 * ⚠️ **This is `03` §8.1's explicit import and it is deliberately not called
 * `useStorage`.** Nuxt has a built-in `useStorage` — Nitro's key-value store,
 * which is a server thing and a completely different thing — and `@vueuse/nuxt`
 * disables its own `useStorage` from auto-import for exactly that clash
 * (verification §5.5). A composable of that name here would be reachable
 * ambiently and would read, at a glance, like the wrong one. Three functions
 * with their own names, imported where they are used, cannot be confused with
 * anything.
 *
 * ⚠️ **`localStorage` and not IndexedDB** (ADR 0014). At a default *session* of
 * twenty the snapshot is on the order of 10 KB and the outbox a few hundred
 * bytes; IndexedDB's async-and-durable advantage buys nothing at that size and
 * costs more code. The standard objection — synchronous writes on the main
 * thread — is real in general and negligible here, which matters because
 * *Review*'s keystroke latency is a criterion (`03` §8).
 *
 * ⚠️ **Every call is wrapped, because the store can throw rather than answer.**
 * Safari's private mode has historically thrown on `setItem`, a quota can fill,
 * and a reader can disable site data. ⚠️ **A store that cannot be written is a
 * *Review* that still works** — it degrades to #12's behaviour, where a lost
 * request is a lost *grade* the end screen reports — and a *Review* that threw
 * on a keystroke would be worse than the failure it is guarding against.
 */

/** The two keys, named so they are legible in a devtools pane. */
export const SNAPSHOT_KEY = 'kioku:review:session'
export const OUTBOX_KEY = 'kioku:review:outbox'
/** `03` §8.2's refusals, kept so the end screen can still say so after a reload. */
export const REFUSED_KEY = 'kioku:review:refused'

function store(): Storage | null {
  try {
    // `/review` is `ssr: false`, so this runs in a browser — but the *nuxt* test
    // tier mounts the page in happy-dom and a future session may render it
    // somewhere with no `window` at all.
    return typeof localStorage === 'undefined' ? null : localStorage
  }
  catch {
    return null
  }
}

/**
 * @returns the parsed JSON, or `undefined` when there is nothing readable there.
 *
 * ⚠️ **Unreadable and absent are the same answer on purpose.** The caller's job
 * is to fall back to the server, and it is the same fallback either way; a
 * distinction here would only invite a branch that treats a corrupt store as an
 * error worth telling the reader about, which it is not.
 */
export function readStored(key: string): unknown {
  const storage = store()

  if (!storage)
    return undefined

  try {
    const raw = storage.getItem(key)

    return raw === null ? undefined : JSON.parse(raw)
  }
  catch {
    return undefined
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    store()?.setItem(key, JSON.stringify(value))
  }
  catch {
    // See above: a store that refuses is a *Review* that still works.
  }
}

export function clearStored(key: string): void {
  try {
    store()?.removeItem(key)
  }
  catch {
    // Same.
  }
}
