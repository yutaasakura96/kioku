import jlptVocabJson from '../../subjects/jlpt-vocab.json' with { type: 'json' }
// ⚠️ **The `.ts` is not optional and nothing in this repository's own build can
// tell you so.** `scripts/print-subject-view.ts` imports this module and is run
// by `node` for the drift test; Node's ESM resolver will not extension-guess
// (`ERR_MODULE_NOT_FOUND`), while Vite accepts either form — so an extensionless
// import here typechecks, bundles, and breaks the one test that compares the two
// languages (`00-status.md` § Carrying).
import type { SourceKind } from '../ingest/kind.ts'
import { SOURCE_KINDS, SUBMITTABLE_SOURCE_KINDS } from '../ingest/kind.ts'

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
/**
 * ⚠️ **One ordered stage list per *source kind*, not one list** — ADR 0063. The
 * *subject* is the same *subject* whichever way the words arrived: the fields,
 * the templates, the *identity key* and the dictionary do not change, and what
 * does change is which stages run. A second declaration would have been one file
 * copied with two lines different, and the copy would drift the first time a
 * field was added.
 */
export type SubjectPipelines = SubjectDeclaration['pipelines']

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
    | 'no_pipelines'
    | 'unknown_pipeline_kind'
    | 'missing_pipeline'
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

/**
 * The *pipeline stages* an *ingestion* of this *kind* runs, in order (`03` §5.1,
 * ADR 0063).
 *
 * ⚠️ **It raises for a kind the declaration does not carry, and that is the
 * named failure rather than a crash at stage dispatch.** `anki` is in `04`
 * §5.1's `CHECK` and in no pipeline — the format and the licensing of shared
 * decks are unverified and #24 opens with the research (ADR 0063) — so a row
 * that somehow carried it would otherwise reach the worker and find nothing to
 * run. `checkDeclaration` refuses a declaration missing one of the kinds
 * *Ingest* can actually submit; this is the same rule one layer down, where it
 * is the row rather than the declaration that names the kind.
 */
export function stageKeys(declaration: SubjectDeclaration, kind: SourceKind): string[] {
  const pipeline = (declaration.pipelines as Record<string, string[] | undefined>)[kind]
  if (pipeline === undefined) {
    throw new Error(
      `the subject declaration has no pipeline for a source of kind '${kind}' `
      + `(ADR 0063; ${DECLARATION_PATH} declares ${pipelineKinds(declaration).join(', ')})`,
    )
  }
  return [...pipeline]
}

/**
 * The *source kinds* this declaration can ingest, in declaration order.
 *
 * ⚠️ **`SourceKind[]` rather than `string[]`, and the narrowing is asserted
 * rather than assumed.** `Object.keys` answers `string[]`, and a caller that
 * feeds one of these straight back to `stageKeys` would otherwise need a cast —
 * which `as never` happily satisfies for *any* string. `checkDeclaration`'s
 * `unknown_pipeline_kind` is what makes the claim true, and
 * `test/unit/subject-declaration.test.ts` is what checks it of the real file.
 */
export function pipelineKinds(declaration: SubjectDeclaration): SourceKind[] {
  return Object.keys(declaration.pipelines) as SourceKind[]
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

  const { fields, identity_key: identityKey, templates, pipelines } = value

  if (!Array.isArray(fields) || !fields.every(isRecord))
    return malformed('fields')
  if (!Array.isArray(identityKey) || !identityKey.every(name => typeof name === 'string'))
    return malformed('identity_key')
  if (!Array.isArray(templates) || !templates.every(isRecord))
    return malformed('templates')
  if (!isRecord(pipelines)
    || !Object.values(pipelines).every(
      pipeline => Array.isArray(pipeline) && pipeline.every(key => typeof key === 'string'),
    )) {
    return malformed('pipelines')
  }

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

  // ⚠️ **`pipelines`, and the kind is what a stage list belongs to** — ADR 0063.
  // Four failures, and the third is the one the ADR is about: a *source* whose
  // kind names no pipeline reaches the worker and finds nothing to run, and the
  // ADR's rejected alternative — one pipeline whose prose-only stages skip
  // themselves — is the same silence one layer down.
  const declaredKinds = Object.keys(pipelines)

  if (declaredKinds.length === 0) {
    errors.push({ field: null, code: 'no_pipelines' })
  }
  else {
    for (const kind of declaredKinds) {
      if (!(SOURCE_KINDS as readonly string[]).includes(kind))
        errors.push({ field: kind, code: 'unknown_pipeline_kind' })

      const pipeline = pipelines[kind] as string[]
      if (pipeline.length === 0) {
        errors.push({ field: kind, code: 'no_stages' })
        continue
      }

      const seen = new Set<string>()
      for (const stage of pipeline) {
        if (seen.has(stage))
          errors.push({ field: stage, code: 'duplicate_stage' })
        seen.add(stage)
      }
    }
  }

  // ⚠️ **Only the kinds *Ingest* can submit are required, and `anki` is
  // deliberately not one.** ADR 0063 puts the `.apkg` format and the licensing
  // of shared decks in #24 and says in as many words that it does not pre-decide
  // that ticket's answer — so declaring an `anki` pipeline here to satisfy a
  // check would be deciding it by the back door. The value is in `04` §5.1's
  // `CHECK`, nothing produces it, and `stageKeys` names the gap if anything ever
  // does.
  for (const kind of SUBMITTABLE_SOURCE_KINDS) {
    if (!declaredKinds.includes(kind))
      errors.push({ field: kind, code: 'missing_pipeline' })
  }

  return result(errors)
}
