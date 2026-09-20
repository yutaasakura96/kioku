import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SOURCE_KIND,
  INGEST_DEFAULT_SOURCE_KIND,
  SOURCE_KINDS,
  SUBMITTABLE_SOURCE_KINDS,
  isSourceKind,
  readSourceKind,
} from '../../shared/ingest/kind'

// ADR 0063: a *source* declares what it is made of, and the value chooses both
// the chunking rule and the *pipeline*. The list is `04` §5.1's `CHECK` and the
// keys of the declaration's `pipelines` at once — `worker/subject.py` carries
// Python's copy and `worker/tests/test_subject_drift.py` compares the two.

describe('the source kinds', () => {
  it('is `04` §5.1\'s three, in the order the column was written', () => {
    expect([...SOURCE_KINDS]).toEqual(['prose', 'word_list', 'anki'])
  })

  // ⚠️ **`anki` became submittable on 2026-09-20 with #26** (ADR 0068). From
  // ADR 0063 until then it was in `04` §5.1's `CHECK` and in nothing else,
  // because the `.apkg` format and the licensing of shared decks were
  // unverified and #24 opened with the research — a value the schema accepted
  // and no path produced was the honest state of a decision made and not built.
  it('offers all three of `04` §5.1\'s kinds', () => {
    expect([...SUBMITTABLE_SOURCE_KINDS].sort()).toEqual([...SOURCE_KINDS].sort())
  })

  it('offers anki last, because a deck is the least common of the three', () => {
    expect(SUBMITTABLE_SOURCE_KINDS.at(-1)).toBe('anki')
  })

  it('offers the word list first, because that is what the pivot is about', () => {
    expect(SUBMITTABLE_SOURCE_KINDS[0]).toBe(INGEST_DEFAULT_SOURCE_KIND)
    expect(INGEST_DEFAULT_SOURCE_KIND).toBe('word_list')
  })
})

describe('readSourceKind', () => {
  it.each([...SUBMITTABLE_SOURCE_KINDS])('takes the reader at their word for %s', (kind) => {
    expect(readSourceKind(kind)).toBe(kind)
  })

  // ⚠️ **The column's default and not the form's, and the two differ.** The form
  // always sends a value — a radio is pre-checked and a browser cannot uncheck
  // one — so this branch is only reached by a post that did not come from the
  // form: a fixture, the resume control's encoding, a future caller. Every one
  // of those is submitting prose or submitting nothing, and answering them
  // `word_list` would silently chunk a pasted passage at 25 terms.
  it.each([undefined, null, '', 'epub', 7, {}])('falls back to prose for %s', (value) => {
    expect(readSourceKind(value)).toBe('prose')
    expect(readSourceKind(value)).toBe(DEFAULT_SOURCE_KIND)
  })

  // ⚠️ **And it answers `anki` since #26**, which is the one line of this
  // function that ADR 0068 changed. It still answers `prose` for a value
  // outside the three, so the fallback's argument above is untouched.
  it('answers anki, which Ingest offers since ADR 0068', () => {
    expect(isSourceKind('anki')).toBe(true)
    expect(readSourceKind('anki')).toBe('anki')
  })
})
