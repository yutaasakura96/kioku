import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DECLARATION_PATH,
  checkDeclaration,
  fieldNames,
  jlptVocab,
  judgementFieldNames,
  memoryBearingFieldNames,
  pipelineKinds,
  stageKeys,
} from '../../shared/subject/declaration'

// ⚠️ Read independently of the module under test. The module imports the JSON;
// if this test asked the module for the file's contents it would be comparing a
// value with itself, and `03` §6's guard would be a tautology.
const onDisk = JSON.parse(
  readFileSync(fileURLToPath(new URL(`../../${DECLARATION_PATH}`, import.meta.url)), 'utf8'),
)

describe('the JLPT vocabulary declaration', () => {
  it('is the file at subjects/jlpt-vocab.json', () => {
    // `03` §6, ADR 0003: one file, at the repository root, owned by neither
    // toolchain. The path is asserted because it is the half of the contract
    // Python cannot check against TypeScript's import.
    expect(DECLARATION_PATH).toBe('subjects/jlpt-vocab.json')
    expect(jlptVocab).toEqual(onDisk)
  })

  it('is internally consistent', () => {
    expect(checkDeclaration(onDisk)).toEqual({ ok: true })
  })

  it("names ADR 0006's identity key, dictionary-form term plus reading", () => {
    expect(jlptVocab.identity_key).toEqual(['term', 'reading'])
  })

  // ADR 0063: the declaration stops naming one ordered stage list and names one
  // per *source kind*. Prose is `03` §5.1's seven, unchanged.
  it('names one pipeline per source kind', () => {
    expect(pipelineKinds(jlptVocab)).toEqual(['prose', 'word_list'])
    expect(stageKeys(jlptVocab, 'prose')).toEqual([
      'chunk',
      'tokenise',
      'extract_candidates',
      'deduplicate',
      'filter_known',
      'generate',
      'write_notes',
    ])
    expect(stageKeys(jlptVocab, 'word_list')).toEqual([
      'chunk',
      'normalise',
      'deduplicate',
      'filter_known',
      'generate',
      'write_notes',
    ])
  })

  // ⚠️ `anki` is in `04` §5.1's `CHECK` and in no pipeline: ADR 0063 leaves the
  // `.apkg` format and the licensing of shared decks to #24 and says it does not
  // pre-decide that ticket. A row carrying it has to say so by name rather than
  // run whichever pipeline happens to be first.
  it('refuses a kind it has no pipeline for, by name', () => {
    expect(() => stageKeys(jlptVocab, 'anki')).toThrow(/anki/)
  })

  it('names its fields, and which of them vetting foregrounds', () => {
    expect(fieldNames(jlptVocab)).toEqual([
      'term',
      'reading',
      'part_of_speech',
      'meaning',
      'example_sentence',
      'example_gloss',
    ])
    // CONTEXT.md: a *judgement field* is one the LLM chose or wrote rather than
    // looked up, and they are the only fields vetting foregrounds. `10` §4.4
    // says edit reaches exactly these three.
    expect(judgementFieldNames(jlptVocab)).toEqual([
      'meaning',
      'example_sentence',
      'example_gloss',
    ])
  })

  it('names the memory-bearing fields, which are the recognition answer', () => {
    // ADR 0011: a change to a memory-bearing field starts a new *scheduling
    // epoch*; a change to any other field leaves history standing. What was
    // memorised is what the one template asks for — term to reading and meaning
    // (PRD §6) — so the example pair is not memory-bearing and `meaning` is.
    expect(memoryBearingFieldNames(jlptVocab)).toEqual(['reading', 'meaning'])
  })

  it('declares one recognition template, and v1 ships no second one', () => {
    // PRD §6: "v1 ships recognition only — term to reading and meaning."
    expect(jlptVocab.templates).toHaveLength(1)
    const [recognition] = jlptVocab.templates
    expect(recognition!.key).toBe('recognition')
    expect(recognition!.prompt).toEqual(['term'])
    expect(recognition!.answer).toContain('reading')
    expect(recognition!.answer).toContain('meaning')
  })
})

// The declaration is data with no compiler behind it — TypeScript widens every
// string in an imported JSON module to `string`, so none of the checks below is
// enforced by `tsc`. `03` §6: the guard is a test, not a convention.
describe('checkDeclaration', () => {
  const valid = {
    subject_id: 'test-subject',
    name: 'Test subject',
    identity_key: ['head'],
    fields: [
      { name: 'head', kind: 'lookup', required: true, memory_bearing: false, label: 'HEAD' },
      { name: 'tail', kind: 'judgement', required: false, memory_bearing: true, label: 'TAIL' },
    ],
    templates: [{ key: 'only', name: 'Only', prompt: ['head'], answer: ['tail'] }],
    // ⚠️ **Both submittable kinds, because the validator requires both**
    // (ADR 0063), with synthetic stage names for the same reason the fields are
    // synthetic.
    pipelines: { word_list: ['one'], prose: ['one', 'two'] },
  }

  const withDeclaration = (patch: Record<string, unknown>) => ({ ...valid, ...patch })

  it('accepts a well-formed declaration', () => {
    expect(checkDeclaration(valid)).toEqual({ ok: true })
  })

  it('refuses a value that is not an object', () => {
    expect(checkDeclaration(null)).toEqual({
      ok: false,
      errors: [{ field: null, code: 'not_an_object' }],
    })
  })

  it.each([
    ['fields', { fields: 'six of them' }],
    ['identity_key', { identity_key: 'term' }],
    ['templates', { templates: {} }],
    ['pipelines', { pipelines: { prose: [7] } }],
    ['pipelines', { pipelines: ['prose'] }],
  ])('refuses a malformed %s section without throwing', (section, patch) => {
    expect(checkDeclaration(withDeclaration(patch))).toEqual({
      ok: false,
      errors: [{ field: section, code: 'malformed' }],
    })
  })

  it('refuses two fields wearing one name', () => {
    expect(checkDeclaration(withDeclaration({
      fields: [...valid.fields, { ...valid.fields[0] }],
    }))).toEqual({ ok: false, errors: [{ field: 'head', code: 'duplicate_field' }] })
  })

  it('refuses a kind that is neither lookup nor judgement', () => {
    expect(checkDeclaration(withDeclaration({
      fields: [{ ...valid.fields[0], kind: 'judgment' }, valid.fields[1]],
    }))).toEqual({ ok: false, errors: [{ field: 'head', code: 'unknown_kind' }] })
  })

  it('refuses an empty identity key', () => {
    // ADR 0006: identity is a declared key, and deduplication is a UNIQUE
    // constraint over it (`04` §5.3). An empty tuple keys every note alike.
    expect(checkDeclaration(withDeclaration({ identity_key: [] }))).toEqual({
      ok: false,
      errors: [{ field: null, code: 'identity_key_empty' }],
    })
  })

  it('refuses an identity key naming a field that does not exist', () => {
    expect(checkDeclaration(withDeclaration({ identity_key: ['ghost'] }))).toEqual({
      ok: false,
      errors: [{ field: 'ghost', code: 'identity_key_unknown_field' }],
    })
  })

  it('refuses an identity key naming an optional field', () => {
    // The key is rendered from the fields it names (`04` §5.3), so a note that
    // may legally omit one of them has no identity at all.
    expect(checkDeclaration(withDeclaration({ identity_key: ['tail'] }))).toEqual({
      ok: false,
      errors: [{ field: 'tail', code: 'identity_key_optional_field' }],
    })
  })

  // ⚠️ ADR 0003's bug class, stated in the ADR's own words: "cards rendering
  // fields the model was never asked to produce, silently and only for some
  // notes". This is the assertion that closes it.
  it('refuses a template rendering a field the declaration does not name', () => {
    expect(checkDeclaration(withDeclaration({
      templates: [{ key: 'only', name: 'Only', prompt: ['head'], answer: ['ghost'] }],
    }))).toEqual({ ok: false, errors: [{ field: 'ghost', code: 'template_unknown_field' }] })
  })

  it('refuses a template with nothing on one of its two sides', () => {
    expect(checkDeclaration(withDeclaration({
      templates: [{ key: 'only', name: 'Only', prompt: [], answer: ['tail'] }],
    }))).toEqual({ ok: false, errors: [{ field: 'only', code: 'template_empty_side' }] })
  })

  it('refuses two templates wearing one key', () => {
    // `card.template_key` is a text key into the declaration and not a foreign
    // key (`04` §13), so nothing in the database keeps these apart.
    expect(checkDeclaration(withDeclaration({
      templates: [valid.templates[0], { ...valid.templates[0], name: 'Other' }],
    }))).toEqual({ ok: false, errors: [{ field: 'only', code: 'duplicate_template' }] })
  })

  it('refuses a subject with no pipelines at all', () => {
    expect(checkDeclaration(withDeclaration({ pipelines: {} }))).toEqual({
      ok: false,
      errors: [
        { field: null, code: 'no_pipelines' },
        { field: 'word_list', code: 'missing_pipeline' },
        { field: 'prose', code: 'missing_pipeline' },
      ],
    })
  })

  it('refuses a pipeline with no stages in it, and two stages wearing one key', () => {
    expect(checkDeclaration(withDeclaration({
      pipelines: { word_list: [], prose: ['one'] },
    }))).toEqual({ ok: false, errors: [{ field: 'word_list', code: 'no_stages' }] })

    expect(checkDeclaration(withDeclaration({
      pipelines: { word_list: ['one', 'one'], prose: ['one'] },
    }))).toEqual({ ok: false, errors: [{ field: 'one', code: 'duplicate_stage' }] })
  })

  // ⚠️ #19's criterion in its own words: *a declaration with no pipeline for a
  // kind fails validation with a named error, not a crash at stage dispatch.*
  it('refuses a declaration missing a pipeline Ingest can submit', () => {
    expect(checkDeclaration(withDeclaration({ pipelines: { prose: ['one'] } }))).toEqual({
      ok: false,
      errors: [{ field: 'word_list', code: 'missing_pipeline' }],
    })
  })

  // The other direction, and the one a second *subject* would trip: a pipeline
  // keyed on something `04` §5.1's `CHECK` would refuse is one nothing can ever
  // select.
  it('refuses a pipeline for a kind a source may not be', () => {
    expect(checkDeclaration(withDeclaration({
      pipelines: { ...valid.pipelines, epub: ['one'] },
    }))).toEqual({ ok: false, errors: [{ field: 'epub', code: 'unknown_pipeline_kind' }] })
  })
})
