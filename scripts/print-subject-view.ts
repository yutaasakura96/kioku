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
  domainValues,
  fieldNames,
  jlptVocab,
  judgementFieldNames,
  levelValues,
  memoryBearingFieldNames,
  pipelineKinds,
  requiredFieldNames,
  stageKeys,
} from '../shared/subject/declaration.ts'
import { SOURCE_KINDS, SUBMITTABLE_SOURCE_KINDS } from '../shared/ingest/kind.ts'
import { BLANK_CLASS } from '../shared/subject/validate.ts'

const view = {
  declaration_path: DECLARATION_PATH,
  subject_id: jlptVocab.subject_id,
  identity_key: jlptVocab.identity_key,
  field_names: fieldNames(jlptVocab),
  required_field_names: requiredFieldNames(jlptVocab),
  judgement_field_names: judgementFieldNames(jlptVocab),
  memory_bearing_field_names: memoryBearingFieldNames(jlptVocab),
  // ADR 0063: one stage list per *source kind*, so the drift test compares the
  // whole map rather than one list. The three constants beside it are the other
  // cross-language values this file now carries — `04` §5.1's `CHECK`, and which
  // of those kinds a pipeline is required for.
  // ⚠️ Not a list derived from the declaration, and here for the same reason
  // those are: a constant with a twin in the other language and no compiler
  // between them. ADR 0063 gave the blank class a second job — deciding which
  // lines of a *word list* are terms — and the two halves have to be one string.
  blank_class: BLANK_CLASS,
  source_kinds: [...SOURCE_KINDS],
  submittable_source_kinds: [...SUBMITTABLE_SOURCE_KINDS],
  pipeline_kinds: pipelineKinds(jlptVocab),
  pipelines: Object.fromEntries(
    pipelineKinds(jlptVocab).map(kind => [kind, stageKeys(jlptVocab, kind)]),
  ),
  template_keys: jlptVocab.templates.map(template => template.key),
  // ADR 0065 §2: the closed sets the model is told and the writer and the
  // *session* filter both enforce — one on each side of the repository.
  levels: levelValues(jlptVocab),
  domains: domainValues(jlptVocab),
}

process.stdout.write(`${JSON.stringify(view)}\n`)
