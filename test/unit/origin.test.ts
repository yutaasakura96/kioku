import { describe, expect, it } from 'vitest'
import { navItemOf, resolveOrigin } from '../../shared/utils/origin'

// ADR 0032: the origin travels in a `from` query parameter set by the start
// control, and on the way out it is matched against the *place* paths — seven
// since #71 (ADR 0078) added `/more` and moved Ingest to `/add`, five since
// ADR 0077 §3 added `/categories`, four since ADR 0076 §2 added `/settings`.
// Anything else falls back to `/`, which is Home since ADR 0078.
// The attacks are named in `11-testing-plan.md` §8.

describe('resolveOrigin', () => {
  it('admits the place paths and nothing else', () => {
    expect(resolveOrigin('/')).toBe('/')
    expect(resolveOrigin('/sources')).toBe('/sources')
    expect(resolveOrigin('/stats')).toBe('/stats')
    expect(resolveOrigin('/settings')).toBe('/settings')
    expect(resolveOrigin('/categories')).toBe('/categories')
    expect(resolveOrigin('/more')).toBe('/more')
    expect(resolveOrigin('/add')).toBe('/add')
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
    ['a category under the shelf', '/categories/jlpt:N5'],
    ['a page under More', '/more/add'],
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

// ADR 0078 — the bar's three items, and More marked for the *places* under it.
describe('navItemOf', () => {
  it.each([
    ['/', '/'],
    ['/categories', '/categories'],
    ['/more', '/more'],
    ['/add', '/more'],
    ['/settings', '/more'],
    ['/stats', '/more'],
    ['/sources', '/more'],
    ['/sources/0198c0de-0000-7000-8000-000000000000', '/more'],
    ['/sources/0198c0de-0000-7000-8000-000000000000/delete', '/more'],
  ])('puts %s under %s', (path, item) => {
    expect(navItemOf(path)).toBe(item)
  })

  it.each(['/review', '/vet', '/auth', '/statsomething', '/additional'])('marks nothing on %s', (path) => {
    expect(navItemOf(path)).toBeNull()
  })
})
