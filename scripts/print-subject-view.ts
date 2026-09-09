/**
 * Prints TypeScript's view of the *subject* declaration as JSON, so that
 * Python can compare it with its own (`worker/tests/test_subject_drift.py`).
 *
 * `03` §6: the declaration has consumers in two languages, and "the failure
 * ADR 0003 exists to prevent — the contract, the field list and the templates
 * drifting apart — comes back as a cross-language version of itself." The guard
 * is a test, and a test needs one side to be able to ask the other what it
 * thinks. This is that question.
 *
 * ⚠️ **Run it with `node`, not with a bundler.** Node 24.11.0 strips the types
 * and executes this file directly — measured 2026-09-10 — which is what keeps
 * the drift test one subprocess rather than a second build.
 *
 * ⚠️ **The JSON import needs `with { type: 'json' }`** and it is not optional
 * on this path: Node refuses a JSON module without the attribute
 * (`ERR_IMPORT_ATTRIBUTE_MISSING`), while Vite would have accepted either.
 * That is in `shared/subject/declaration.ts`, and it is why.
 */
import {
  DECLARATION_PATH,
  fieldNames,
  jlptVocab,
  judgementFieldNames,
  memoryBearingFieldNames,
  requiredFieldNames,
  stageKeys,
} from '../shared/subject/declaration.ts'

const view = {
  declaration_path: DECLARATION_PATH,
  subject_id: jlptVocab.subject_id,
  identity_key: jlptVocab.identity_key,
  field_names: fieldNames(jlptVocab),
  required_field_names: requiredFieldNames(jlptVocab),
  judgement_field_names: judgementFieldNames(jlptVocab),
  memory_bearing_field_names: memoryBearingFieldNames(jlptVocab),
  stage_keys: stageKeys(jlptVocab),
  template_keys: jlptVocab.templates.map(template => template.key),
}

process.stdout.write(`${JSON.stringify(view)}\n`)
