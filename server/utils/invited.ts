/**
 * The invited-account comparison, as a pure function so the attacks on it are a
 * unit test rather than a sign-in.
 *
 * `08-authentication.md` §4.3 is the authority. Four things here are deliberate
 * and each of them is a way the obvious version fails open:
 *
 * - **No list.** `if (allowed.length && !allowed.includes(email))` is the
 *   natural way to write an allowlist and it **admits everyone when the list is
 *   empty.** A single address has no empty case.
 * - **No provider narrowing.** Better Auth's documented example opens with
 *   `if (source.oauth?.providerId !== "google") return`, which is correct for a
 *   domain check across several providers and is a fail-open gate for an
 *   allowlist. This function never sees the source, so a second provider cannot
 *   silently bypass it.
 * - **Case-insensitive on our side.** The internal adapter lowercases on the
 *   create-user path; nothing documents the same for the sign-in path
 *   (verification §11.5), and `08` §3.1 makes the sign-in pass the load-bearing
 *   one.
 * - **No `|| ''` anywhere.** A missing address is refused, never compared away.
 *   Reading the environment is `invitedEmail()` below, and it throws.
 */

/** What a refusal hands back to Better Auth. `08` §4.3. */
export interface Refusal {
  error: string
  errorDescription: string
}

/**
 * ⚠️ The refusal names no address. `errorDescription` is returned to the client
 * and `03` §13.4 classifies the reader's email as sensitive data — never
 * logged, an id instead. A helpful message here would be the leak that the rest
 * of the document is written to prevent.
 */
const NOT_INVITED: Refusal = {
  error: 'not_invited',
  errorDescription: 'Access is invite-only',
}

function normalise(email: unknown): string | undefined {
  if (typeof email !== 'string')
    return undefined

  const trimmed = email.trim().toLowerCase()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Returns a {@link Refusal} unless the profile carries the one invited address.
 *
 * Returning `undefined` is what admits the identity — Better Auth reads a
 * returned object as a rejection and nothing as consent, so the fall-through at
 * the end of this function is the only path that lets anyone in.
 */
export function refuseUninvited(
  user: { email?: string | null },
  invitedEmail: string,
): Refusal | undefined {
  const invited = normalise(invitedEmail)
  if (!invited)
    return NOT_INVITED

  const candidate = normalise(user.email)
  if (!candidate)
    return NOT_INVITED

  if (candidate !== invited)
    return NOT_INVITED

  return undefined
}
