import type { SubjectDeclaration, ValidationError, ValidationResult } from './declaration'

/**
 * ⚠️ **Emptiness is spelled out because `trim()` and `str.strip()` do not agree**
 * — measured 2026-09-10 across the whole BMP. Six characters differ: Python
 * strips `U+001C`–`U+001F` and `U+0085`, JavaScript strips `U+FEFF`, and
 * **`U+001F` is the character `04` §5.3 joins the *identity key* with**. Left to
 * each language's own idea of whitespace, one validator accepts a required field
 * the other calls empty.
 *
 * This class is the **union** of the two, written the same way on both sides:
 * anything either language would call whitespace is not content.
 *
 * ⚠️ Anchored `^…$` rather than tested with `.trim()`. Python's twin uses
 * `\A…\Z`, because Python's `$` also matches before a trailing newline and
 * JavaScript's does not — which would have been the seventh divergence.
 */
export const BLANK_CLASS = '\\t\\n\\v\\f\\r\\u001C-\\u001F \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF'

export const BLANK = new RegExp(`^[${BLANK_CLASS}]*$`)

/**
 * One or more blanks, for splitting on and collapsing — the same class, once.
 *
 * ⚠️ **Exported so that nothing builds it a second time.** `00-status.md`
 * § Carrying's standing rule is that this class is written out **once**; two
 * modules each compiling their own `[${BLANK_CLASS}]+` is that rule being
 * obeyed in the letter and lost in the spirit, because the next one will be
 * built from `\s` by someone who did not know this existed.
 */
export const BLANK_RUN = new RegExp(`[${BLANK_CLASS}]+`, 'g')

const BLANK_EDGES = new RegExp(`^[${BLANK_CLASS}]+|[${BLANK_CLASS}]+$`, 'g')

/**
 * The value with its edges stripped and its inner blanks collapsed to one
 * space — this class and no other.
 *
 * ⚠️ **Not `.trim()`, and not even after a collapse has made it look safe.**
 * `trim()` and Python's `str.strip()` disagree on six characters across the BMP
 * (§ Carrying), one of which is `U+001F` — the character `04` §5.3 joins the
 * *identity key* with and `shared/ingest/anki/line.ts` splits a stored deck
 * line on. A `collapse-then-trim` is correct only because the collapse has
 * already turned every one of those into an ASCII space, which is a dependency
 * between two statements that nothing states; doing both from the one class
 * removes the question.
 */
export function collapseBlank(value: string): string {
  return value.replace(BLANK_EDGES, '').replace(BLANK_RUN, ' ')
}

/**
 * The seam of `03` §6: `validate(declaration, output) → ok | error`, one
 * implementation per language over the one file. It is the function every
 * generated *note* passes through on its way into the database.
 *
 * ⚠️ **It is derived from the declaration, not written against JLPT
 * vocabulary.** Nothing here names a field; adding a field to `subjects/` is
 * the whole of adding it to this validator.
 *
 * ⚠️ **Nothing upstream does this job.** `03` §7: structured output is not
 * trusted because the provider documents constrained decoding, and `03` §2.3:
 * not trusted because Drizzle typed the column — neither Drizzle nor Kysely
 * validates `jsonb` at runtime (verification §6.4).
 *
 * Its Python twin is `worker/subject.py`, and the two answer with the same
 * codes in the same order by contract, not by coincidence.
 */
export function validate(declaration: SubjectDeclaration, output: unknown): ValidationResult {
  if (typeof output !== 'object' || output === null || Array.isArray(output))
    return { ok: false, errors: [{ field: null, code: 'not_an_object' }] }

  const values = output as Record<string, unknown>
  const errors: ValidationError[] = []
  const declared = new Set<string>()

  // Declared fields first, in declaration order.
  for (const field of declaration.fields) {
    declared.add(field.name)

    const present = Object.prototype.hasOwnProperty.call(values, field.name)
    const value = values[field.name]

    // ⚠️ **`null` is absent, not a bad value**, and it has to be — Python's twin
    // reads the same JSON, where `null` is the only thing `undefined` can be. A
    // model that answers `"meaning": null` is answering nothing; treating that
    // as a wrong *type* here while Python treats it as a missing *field* would
    // make the two disagree on an input the boundary actually sees, and on an
    // optional field it would be one accepting what the other refuses.
    if (!present || value === undefined || value === null) {
      if (field.required)
        errors.push({ field: field.name, code: 'missing' })
      continue
    }

    if (typeof value !== 'string') {
      errors.push({ field: field.name, code: 'not_a_string' })
      continue
    }

    // ⚠️ An *optional* field present and empty is legal, and that is ADR 0003's
    // schema-evolution rule rather than laxity: fields are additive and
    // optional, and "existing notes carry it empty" until a backfill runs.
    if (field.required && BLANK.test(value))
      errors.push({ field: field.name, code: 'empty' })
  }

  // Then whatever the output carried that the declaration does not name — the
  // other half of ADR 0003's drift, and the half a permissive validator misses.
  for (const name of Object.keys(values)) {
    if (!declared.has(name))
      errors.push({ field: name, code: 'unknown' })
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
