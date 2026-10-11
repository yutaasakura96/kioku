import { describe, expect, it } from 'vitest'
import { resolveOrigin } from '../../shared/utils/origin'

// ADR 0032: the origin travels in a `from` query parameter set by the start
// control, and on the way out it is matched against the *place* paths — four
// since ADR 0076 §2 added `/settings`.
// Anything else falls back to `/`, which ADR 0031 makes Ingest.
// The attacks are named in `11-testing-plan.md` §8.

describe('resolveOrigin', () => {
  it('admits the place paths and nothing else', () => {
    expect(resolveOrigin('/')).toBe('/')
    expect(resolveOrigin('/sources')).toBe('/sources')
    expect(resolveOrigin('/stats')).toBe('/stats')
    expect(resolveOrigin('/settings')).toBe('/settings')
  })

  it.each([
    ['a protocol-relative URL', '//evil.com'],
    ['an absolute URL', 'https://evil.com'],
    ['a mode, which is not a place', '/vet'],
    ['the other mode', '/review'],
    ['a traversal', '/stats/../../x'],
    ['an encoded traversal', '/stats%2F..%2F..%2Fx'],
    ['a path that only starts like a place', '/statsomething'],
    ['a page under a place', '/settings/saved'],
    ['a trailing slash', '/stats/'],
    ['the empty string', ''],
    ['an absent parameter', undefined],
    ['a null', null],
    ['a repeated parameter, which arrives as an array', ['/stats', '/']],
    ['a number', 42],
  ])('falls back to / for %s', (_label, from) => {
    expect(resolveOrigin(from)).toBe('/')
  })
})
