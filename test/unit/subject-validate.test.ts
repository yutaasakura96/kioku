import { describe, expect, it } from 'vitest'
import { validate } from '../../shared/subject/validate'
import type { SubjectDeclaration } from '../../shared/subject/declaration'

// `03` §6 and ADR 0003: `validate(declaration, output)` is the function every
// generated *note* passes through on its way into the database, and it is
// derived from the declaration rather than restating it. These tests use a
// two-field synthetic declaration on purpose — a test written against
// `jlpt-vocab.json`'s six fields would pass for the wrong reason the day the
// validator hard-codes one of them.
const twoFields = {
  subject_id: 'test-subject',
  name: 'Test subject',
  identity_key: ['head'],
  fields: [
    { name: 'head', kind: 'lookup', required: true, memory_bearing: false, label: 'HEAD' },
    { name: 'tail', kind: 'judgement', required: false, memory_bearing: true, label: 'TAIL' },
  ],
  templates: [{ key: 'only', name: 'Only', prompt: ['head'], answer: ['tail'] }],
  stages: [{ key: 'one', title: 'One' }],
} as SubjectDeclaration

describe('validate', () => {
  it('accepts an output carrying every declared field', () => {
    expect(validate(twoFields, { head: '図書館', tail: 'library' })).toEqual({ ok: true })
  })

  it('accepts an output that omits an optional field', () => {
    expect(validate(twoFields, { head: '図書館' })).toEqual({ ok: true })
  })

  // ADR 0003's schema evolution rule: a field added later is optional, and
  // "existing notes carry it empty" — so an optional field present and empty is
  // a legal note, and the same emptiness in a required field is not.
  it('accepts an optional field that is present and empty', () => {
    expect(validate(twoFields, { head: '図書館', tail: '' })).toEqual({ ok: true })
  })

  it('refuses a missing required field', () => {
    expect(validate(twoFields, { tail: 'library' })).toEqual({
      ok: false,
      errors: [{ field: 'head', code: 'missing' }],
    })
  })

  it('refuses a required field that is empty or whitespace', () => {
    expect(validate(twoFields, { head: '   ' })).toEqual({
      ok: false,
      errors: [{ field: 'head', code: 'empty' }],
    })
  })

  // ⚠️ Measured 2026-09-10: TypeScript and Python disagreed here until they were
  // made to agree. `null` is what JSON carries where TypeScript would say
  // `undefined`, so a model answering `"tail": null` is answering nothing — and
  // reading it as a wrong *type* rather than an absent *field* had this side
  // refusing an optional field the Python side accepted.
  it('reads null as an absent field, not as a value of the wrong type', () => {
    expect(validate(twoFields, { head: 'x', tail: null })).toEqual({ ok: true })
    expect(validate(twoFields, { head: null })).toEqual({
      ok: false,
      errors: [{ field: 'head', code: 'missing' }],
    })
  })

  // ⚠️ The other measured divergence. `trim()` and `str.strip()` differ on six
  // characters across the BMP — Python strips `U+001C`–`U+001F` and `U+0085`,
  // JavaScript strips `U+FEFF` — and `U+001F` is what `04` §5.3 joins the
  // *identity key* with. Both validators use the union of the two sets.
  it.each([
    ['U+001F, the identity-key separator', '\u001F', true],
    ['U+0085', '\u0085', true],
    ['U+FEFF', '\uFEFF', true],
    ['an ideographic space', '\u3000', true],
    ['a trailing newline after content', 'x\n', false],
  ])('agrees with Python about %s', (_label, value, blank) => {
    expect(validate(twoFields, { head: value })).toEqual(
      blank ? { ok: false, errors: [{ field: 'head', code: 'empty' }] } : { ok: true },
    )
  })

  it('refuses a value that is not a string', () => {
    expect(validate(twoFields, { head: 7 })).toEqual({
      ok: false,
      errors: [{ field: 'head', code: 'not_a_string' }],
    })
  })

  // The half of ADR 0003 that is about the *contract*: a model that returns a
  // field nobody declared is a model answering a different prompt, and letting
  // it through is how `note.fields` and the templates drift apart.
  it('refuses a field the declaration does not name', () => {
    expect(validate(twoFields, { head: '図書館', extra: 'x' })).toEqual({
      ok: false,
      errors: [{ field: 'extra', code: 'unknown' }],
    })
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'head'],
    ['undefined', undefined],
  ])('refuses %s in place of an object', (_label, output) => {
    expect(validate(twoFields, output)).toEqual({
      ok: false,
      errors: [{ field: null, code: 'not_an_object' }],
    })
  })

  // The order is part of the contract, because the Python validator has to
  // produce the same list for the same input — declared fields in declaration
  // order, then unknown keys in the order the output carries them.
  it('reports declared fields in declaration order, then unknown keys', () => {
    const result = validate(twoFields, { zulu: 1, tail: 4 })
    expect(result).toEqual({
      ok: false,
      errors: [
        { field: 'head', code: 'missing' },
        { field: 'tail', code: 'not_a_string' },
        { field: 'zulu', code: 'unknown' },
      ],
    })
  })

  it('does not mutate the output it was given', () => {
    const output = { head: '図書館' }
    validate(twoFields, output)
    expect(output).toEqual({ head: '図書館' })
  })
})
