import jlptVocabJson from '../../subjects/jlpt-vocab.json' with { type: 'json' }

/**
 * The *subject* declaration — ADR 0003 and `03` §6.
 *
 * One declaration with three consumers (the LLM's structured-output contract,
 * the *note*'s field list, and the *card templates*), naming the *pipeline
 * stages* an *ingestion* runs. ADR 0019 then put the pipeline in Python and
 * left the other three here, so the declaration is **language-neutral JSON in
 * `subjects/`, owned by neither toolchain**. This module is TypeScript's view
 * of it; `worker/subject.py` is Python's; the two are compared by a test
 * (`worker/tests/test_subject_drift.py`).
 *
 * ⚠️ **Every type below is derived from the file, never restated.** The file is
 * the declaration; this module knows only its shape.
 *
 * ⚠️ **And the derivation is weaker than it looks: TypeScript widens every
 * string in an imported JSON module to `string`.** `FieldName` is `string`, not
 * a union of the six names — measured 2026-09-10, because `typeof
 * declaration.fields[number]['name']` reads exactly like it should produce one.
 * Nothing here is checked by `tsc`, which is why `checkDeclaration` exists and
 * why `03` §6 says the guard is a test rather than a convention.
 */
export type SubjectDeclaration = typeof jlptVocabJson

export type SubjectField = SubjectDeclaration['fields'][number]
export type SubjectTemplate = SubjectDeclaration['templates'][number]
export type SubjectStage = SubjectDeclaration['stages'][number]

/** A *note*'s fields, as they are held in `note.fields` (`04` §5.3). */
export type FieldName = SubjectField['name']

/** ADR 0004's honesty bit, at declaration time: looked up, or judged. */
export const FIELD_KINDS = ['lookup', 'judgement'] as const

export type ErrorCode
  = | 'not_an_object'
    | 'malformed'
    | 'missing'
    | 'unknown'
    | 'not_a_string'
    | 'empty'
    | 'duplicate_field'
    | 'unknown_kind'
    | 'identity_key_empty'
    | 'identity_key_unknown_field'
    | 'identity_key_optional_field'
    | 'template_unknown_field'
    | 'template_empty_side'
    | 'duplicate_template'
    | 'no_stages'
    | 'duplicate_stage'

/**
 * `field` is the field, template or stage the error is about, and `null` when
 * the error is about the whole value.
 *
 * ⚠️ **The codes are shared with Python and the order is part of the contract.**
 * Two implementations over one file are only worth having if they answer the
 * same way, and a message string would not survive translation.
 */
export interface ValidationError {
  field: string | null
  code: ErrorCode
}

export type ValidationResult
  = | { ok: true }
    | { ok: false, errors: ValidationError[] }

/** The path Python reads, relative to the repository root. */
export const DECLARATION_PATH = 'subjects/jlpt-vocab.json'

/** The JLPT vocabulary subject — the first, and in v1 the only one. */
export const jlptVocab: SubjectDeclaration = jlptVocabJson

export function fieldNames(declaration: SubjectDeclaration): string[] {
  return declaration.fields.map(field => field.name)
}

export function requiredFieldNames(declaration: SubjectDeclaration): string[] {
  return declaration.fields.filter(field => field.required).map(field => field.name)
}

/**
 * The fields *Vet* foregrounds (`S4`, CONTEXT.md) and the only ones edit
 * reaches (`10` §4.4).
 */
export function judgementFieldNames(declaration: SubjectDeclaration): string[] {
  return declaration.fields.filter(field => field.kind === 'judgement').map(field => field.name)
}

/**
 * The fields whose change begins a new *scheduling epoch* (ADR 0011). A change
 * to any other field leaves review history standing.
 */
export function memoryBearingFieldNames(declaration: SubjectDeclaration): string[] {
  return declaration.fields.filter(field => field.memory_bearing).map(field => field.name)
}

/** The *pipeline stages* this *subject*'s *ingestion* runs, in order (`03` §5.1). */
export function stageKeys(declaration: SubjectDeclaration): string[] {
  return declaration.stages.map(stage => stage.key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function malformed(field: string | null): ValidationResult {
  return { ok: false, errors: [{ field, code: 'malformed' }] }
}

function result(errors: ValidationError[]): ValidationResult {
  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}

/**
 * Whether a declaration is one — the check `tsc` cannot do, because the JSON
 * arrives widened.
 *
 * ⚠️ **The template check is ADR 0003's whole reason for existing**: a template
 * naming a field the field list does not carry is the "cards rendering fields
 * the model was never asked to produce" failure, and it is silent everywhere
 * else.
 */
export function checkDeclaration(value: unknown): ValidationResult {
  if (!isRecord(value))
    return { ok: false, errors: [{ field: null, code: 'not_an_object' }] }

  const { fields, identity_key: identityKey, templates, stages } = value

  if (!Array.isArray(fields) || !fields.every(isRecord))
    return malformed('fields')
  if (!Array.isArray(identityKey) || !identityKey.every(name => typeof name === 'string'))
    return malformed('identity_key')
  if (!Array.isArray(templates) || !templates.every(isRecord))
    return malformed('templates')
  if (!Array.isArray(stages) || !stages.every(isRecord))
    return malformed('stages')

  const errors: ValidationError[] = []
  const required = new Map<string, boolean>()

  for (const field of fields) {
    const { name, kind } = field
    if (typeof name !== 'string' || typeof field.required !== 'boolean'
      || typeof field.memory_bearing !== 'boolean') {
      return malformed('fields')
    }
    if (required.has(name))
      errors.push({ field: name, code: 'duplicate_field' })
    else
      required.set(name, field.required)

    if (typeof kind !== 'string' || !(FIELD_KINDS as readonly string[]).includes(kind))
      errors.push({ field: name, code: 'unknown_kind' })
  }

  if (identityKey.length === 0) {
    errors.push({ field: null, code: 'identity_key_empty' })
  }
  else {
    for (const name of identityKey) {
      if (!required.has(name))
        errors.push({ field: name, code: 'identity_key_unknown_field' })
      // The key is rendered from the fields it names (`04` §5.3), so a note
      // that may legally omit one of them has no identity at all.
      else if (!required.get(name))
        errors.push({ field: name, code: 'identity_key_optional_field' })
    }
  }

  const templateKeys = new Set<string>()

  for (const template of templates) {
    const { key, prompt, answer } = template
    if (typeof key !== 'string'
      || !Array.isArray(prompt) || !prompt.every(name => typeof name === 'string')
      || !Array.isArray(answer) || !answer.every(name => typeof name === 'string')) {
      return malformed('templates')
    }
    if (templateKeys.has(key))
      errors.push({ field: key, code: 'duplicate_template' })
    templateKeys.add(key)

    if (prompt.length === 0 || answer.length === 0)
      errors.push({ field: key, code: 'template_empty_side' })

    for (const name of [...prompt, ...answer]) {
      if (!required.has(name))
        errors.push({ field: name, code: 'template_unknown_field' })
    }
  }

  if (stages.length === 0) {
    errors.push({ field: null, code: 'no_stages' })
  }
  else {
    const stageKeySet = new Set<string>()
    for (const stage of stages) {
      const { key } = stage
      if (typeof key !== 'string')
        return malformed('stages')
      if (stageKeySet.has(key))
        errors.push({ field: key, code: 'duplicate_stage' })
      stageKeySet.add(key)
    }
  }

  return result(errors)
}
