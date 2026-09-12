// What `POST /api/vet/decision` will accept, as a pure function — the seam
// between a keystroke and a row.
//
// Two of these tests are the ones worth having:
//
// - ⚠️ **An edit reaches the *judgement fields* and nothing else** (`10` §4.4).
//   The *term* is half of `note.identity_key` (ADR 0006) and a *level* is a
//   claim that needs an *authority* behind it (ADR 0005); neither is an edit,
//   and the request arrives from a client, so the refusal belongs here rather
//   than in the component that happens not to render a box for them.
// - ⚠️ **The decision never fails on its own metric.** `seconds_to_vet` is
//   `numeric(6,2)`, so a client that sends `Infinity` or 40000 would otherwise
//   take the *vetting decision* down with it — and `S3`'s stamp is worth less
//   than the keystroke it is a measurement of.

import { describe, expect, it } from 'vitest'

import { MAX_SECONDS_TO_VET, parseDecision } from '../../shared/vet/decision'
import { jlptVocab } from '../../shared/subject/declaration'

const NOTE = '019bd3a1-7c2e-7f31-8a44-9e0b1c2d3e4f'

function body(overrides: Record<string, unknown> = {}) {
  return { noteId: NOTE, action: 'accept', secondsToVet: 3.41, ...overrides }
}

function parse(overrides: Record<string, unknown> = {}) {
  return parseDecision(body(overrides), jlptVocab)
}

describe('the shape of a decision', () => {
  it('accepts an unedited acceptance', () => {
    expect(parse()).toEqual({
      ok: true,
      decision: { noteId: NOTE, action: 'accept', secondsToVet: 3.41, edits: null },
    })
  })

  it('accepts a rejection', () => {
    expect(parse({ action: 'reject' })).toMatchObject({ ok: true, decision: { action: 'reject' } })
  })

  it.each([null, undefined, 'accept', 42, []])('refuses %s as a body', (value) => {
    expect(parseDecision(value, jlptVocab)).toEqual({ ok: false, code: 'not_an_object' })
  })

  it.each(['', 'not-a-uuid', '../../etc/passwd', 19 as unknown as string])(
    'refuses %s as a note id',
    (noteId) => {
      expect(parse({ noteId })).toEqual({ ok: false, code: 'bad_note_id' })
    },
  )

  it.each(['pending', 'ACCEPT', 'flag', '', null])('refuses %s as an action', (action) => {
    expect(parse({ action })).toEqual({ ok: false, code: 'bad_action' })
  })
})

describe('the metric is stamped, and never fails the keystroke', () => {
  it('rounds to the two decimal places the column has', () => {
    expect(parse({ secondsToVet: 3.4159 })).toMatchObject({ decision: { secondsToVet: 3.42 } })
  })

  it.each([null, undefined, 'soon', Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'records %s as unmeasured rather than refusing the decision',
    (secondsToVet) => {
      expect(parse({ secondsToVet })).toMatchObject({ ok: true, decision: { secondsToVet: null } })
    },
  )

  // A *note* left on screen for three hours is not a measurement of vetting. The
  // cap is the column's, and the alternative is a `numeric` overflow that loses
  // the decision the reader actually made.
  it('clamps a value the column could not hold', () => {
    expect(parse({ secondsToVet: 40_000 })).toMatchObject({
      decision: { secondsToVet: MAX_SECONDS_TO_VET },
    })
  })
})

describe('an edit reaches the judgement fields and nothing else', () => {
  it('carries the three the declaration marks as judgement', () => {
    const edits = { meaning: 'library', example_sentence: '駅の近くに図書館があります。', example_gloss: 'There is a library near the station.' }

    expect(parse({ edits })).toMatchObject({ ok: true, decision: { edits } })
  })

  it('carries a subset — an edit that touched one field sends one field', () => {
    expect(parse({ edits: { meaning: 'library' } })).toMatchObject({
      decision: { edits: { meaning: 'library' } },
    })
  })

  // ⚠️ The *term* is half of ADR 0006's *identity key* and the *reading* is the
  // other half. Editing either is a different feature, not an edit (`10` §4.4).
  it.each(['term', 'reading', 'part_of_speech'])('refuses %s, which is a lookup field', (name) => {
    expect(parse({ edits: { [name]: 'x' } })).toEqual({ ok: false, code: 'not_editable' })
  })

  it('refuses a field the declaration does not name at all', () => {
    expect(parse({ edits: { mnemonic: 'x' } })).toEqual({ ok: false, code: 'unknown_field' })
  })

  it.each([[''], ['   '], ['　'], [42], [null]])('refuses %s as a value', (value) => {
    expect(parse({ edits: { meaning: value } })).toEqual({ ok: false, code: 'bad_value' })
  })

  it.each(['', 42, [], 'meaning'])('refuses %s as the edits themselves', (edits) => {
    expect(parse({ edits })).toEqual({ ok: false, code: 'bad_edits' })
  })

  // A rejection carries no edit. `09` §4.3's `Enter` commits **and accepts**, so
  // there is no path that edits and then declines.
  it('refuses an edit alongside a rejection', () => {
    expect(parse({ action: 'reject', edits: { meaning: 'library' } })).toEqual({
      ok: false,
      code: 'bad_edits',
    })
  })

  // ⚠️ An empty object is the reader opening the edit, changing nothing and
  // pressing `Enter`. It is still an edit for `S6` — `09` §4.3 sets
  // `note_vetting.edited` on the commit, not on the diff — and the provenance
  // it writes is decided per field by what actually changed.
  it('keeps an empty edit distinguishable from no edit at all', () => {
    expect(parse({ edits: {} })).toMatchObject({ decision: { edits: {} } })
    expect(parse()).toMatchObject({ decision: { edits: null } })
  })
})
