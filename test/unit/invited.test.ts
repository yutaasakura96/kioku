import { describe, expect, it } from 'vitest'

import { refuseUninvited } from '../../server/utils/invited'

// `08-authentication.md` §4.3 — the allowlist's **shape** is the decision, not
// its location, and this is the shape under test.
//
// ⚠️ The two shapes that are *not* used both fail open, and neither failure is
// visible from a passing happy path:
//
// - A list — `if (allowed.length && !allowed.includes(email))` — **admits
//   everyone when the list is empty.** The single constant has no empty case.
// - Provider narrowing — the library's own documented example opens with
//   `if (source.oauth?.providerId !== "google") return`, which is correct for a
//   domain check across several providers and is a fail-open gate for an
//   allowlist. That half is asserted in `auth-config.test.ts`, which calls the
//   configured callback with a provider that is not Google.
//
// `11` §9: this tests **our** configuration, never Better Auth's correctness.

const INVITED = 'reader@example.com'

describe('the invited-account comparison', () => {
  it('admits the invited address', () => {
    expect(refuseUninvited({ email: INVITED }, INVITED)).toBeUndefined()
  })

  it('is case-insensitive on both sides', () => {
    // The internal adapter lowercases on the create-user path; **nothing
    // documents the same for the sign-in path** (verification §11.5), and this
    // comparison has to hold on both.
    expect(refuseUninvited({ email: 'Reader@Example.COM' }, INVITED)).toBeUndefined()
    expect(refuseUninvited({ email: INVITED }, 'READER@EXAMPLE.COM')).toBeUndefined()
  })

  it('ignores surrounding whitespace on both sides', () => {
    expect(refuseUninvited({ email: `  ${INVITED} ` }, INVITED)).toBeUndefined()
    expect(refuseUninvited({ email: INVITED }, `\t${INVITED}\n`)).toBeUndefined()
  })

  it.each([
    ['a different account', 'someone@example.com'],
    ['the same local part at another domain', 'reader@example.org'],
    ['a superstring', `${INVITED}.evil.com`],
    ['a substring', 'reader@example.co'],
    ['an address that only differs by an interior space', 'reader@exam ple.com'],
    ['the empty string', ''],
    ['whitespace', '   '],
  ])('refuses %s', (_label, email) => {
    expect(refuseUninvited({ email }, INVITED)).toEqual({
      error: 'not_invited',
      errorDescription: 'Access is invite-only',
    })
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('refuses a profile whose email is %s', (_label, email) => {
    // A provider that returns no email must not compare equal to anything.
    expect(refuseUninvited({ email }, INVITED)).toMatchObject({ error: 'not_invited' })
  })

  it('says nothing about the invited address in what it hands back', () => {
    // ⚠️ `errorDescription` is returned to the client, and `03` §13.4 classifies
    // the reader's email as sensitive. The refusal must not become the leak.
    const refusal = refuseUninvited({ email: 'someone@example.com' }, INVITED)

    expect(JSON.stringify(refusal)).not.toContain('reader')
    expect(JSON.stringify(refusal)).not.toContain('example.com')
  })
})
