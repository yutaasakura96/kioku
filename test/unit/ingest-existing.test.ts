import { describe, expect, it } from 'vitest'

import { resolveExisting } from '../../shared/ingest/existing'

// The second value in this application that arrives in a URL, after `from`
// (`shared/utils/origin.ts`). `11` §8 puts that one at a seam and says "test the
// attacks"; this one gets the same treatment for the same reason, even though it
// is the weaker of the two — `existing` is never navigated to, it is read into a
// query, so the worst case is a database error on a page that was otherwise
// rendering fine rather than an open redirect.

const REAL = '019bd3f1-2c4e-7a91-8b23-0bdc18694aa5'

describe('resolveExisting', () => {
  it('admits a well-formed id', () => {
    expect(resolveExisting(REAL)).toBe(REAL)
  })

  it('admits it case-insensitively, because a URL may arrive either way', () => {
    expect(resolveExisting(REAL.toUpperCase())).toBe(REAL.toUpperCase())
  })

  it.each([
    ['the empty string', ''],
    ['absent', undefined],
    ['an array, which is what a repeated query parameter is', [REAL, REAL]],
    ['a number', 1],
    ['SQL', `' OR 1=1 --`],
    ['a path', '../../etc/passwd'],
    ['an absolute URL', 'https://evil.com'],
    ['an id with something appended', `${REAL} OR true`],
    ['an id with whitespace around it', ` ${REAL} `],
    ['a truncated id', REAL.slice(0, 30)],
    ['an id with a non-hex character', REAL.replace('f', 'z')],
    ['the nil UUID, whose version nibble is 0', '00000000-0000-0000-0000-000000000000'],
  ])('refuses %s', (_name, value) => {
    expect(resolveExisting(value)).toBeNull()
  })
})
