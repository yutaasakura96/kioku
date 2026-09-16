/**
 * What a *source* is made of — `04` §5.1's `kind`, decided by
 * [ADR 0063](../../docs/adr/0063-the-input-is-a-chosen-word-list.md).
 *
 * ⚠️ **This list is the schema's `CHECK` and the declaration's pipeline keys at
 * once.** `server/db/schema/shared.ts` refuses a row whose `kind` is not one of
 * these, and `checkDeclaration` refuses a *subject* that has no pipeline for one
 * of them — so a fourth kind added here fails in both places by name rather than
 * reaching stage dispatch and finding nothing to run.
 *
 * ⚠️ **Python has its own copy and the two are compared by a test.** The same
 * shape as the `kioku_job` channel and the declaration's field lists
 * (`worker/tests/test_subject_drift.py`): a cross-language constant that drifts
 * is silent, so it is asserted rather than agreed.
 */

/**
 * ⚠️ **The order is the declaration order in `subjects/`**, and `prose` is first
 * because it is the column's default — the rows that existed before ADR 0063
 * keep their meaning.
 */
export const SOURCE_KINDS = ['prose', 'word_list', 'anki'] as const

export type SourceKind = (typeof SOURCE_KINDS)[number]

/**
 * ⚠️ **The column's default, and not the form's.** `04` §5.1 defaults to `prose`
 * so that every row written before ADR 0063 still says what it is; *Ingest*
 * offers `word_list` first, because that is the input the pivot is about
 * (ADR 0063 §5, `10` §6.2). The two are deliberately different, each is right
 * where it stands, and `readSourceKind` — which answers a post rather than a
 * reader — uses **this** one.
 */
export const DEFAULT_SOURCE_KIND: SourceKind = 'prose'

/** What *Ingest* selects when the reader chooses nothing — ADR 0063 §5. */
export const INGEST_DEFAULT_SOURCE_KIND: SourceKind = 'word_list'

/**
 * The kinds a reader may submit. ⚠️ **`anki` is in the `CHECK` and not here**:
 * ADR 0063 leaves the `.apkg` format and the licensing of shared decks
 * unverified, and [#24](https://github.com/yutaasakura96/kioku/issues/24) opens
 * with the research. A value the schema accepts and no path produces is the
 * honest state of a decision that has been made and not built.
 */
export const SUBMITTABLE_SOURCE_KINDS: readonly SourceKind[] = ['word_list', 'prose']

export function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === 'string' && (SOURCE_KINDS as readonly string[]).includes(value)
}

/**
 * The kind a submission asked for, or `prose`.
 *
 * ⚠️ **It falls back to the *column's* default and not to the form's**, and the
 * difference is the whole reason this function is worth a docstring. The form
 * always sends a value — a radio is pre-checked and a browser cannot uncheck one
 * — so this branch is only reached by a post that did not come from the form:
 * a fixture, the resume control's encoding, a future caller. **Every one of
 * those is submitting prose or submitting nothing**, and answering them
 * `word_list` would silently chunk a pasted passage at 25 terms.
 *
 * ⚠️ **And the fallback is not a validation.** A value outside
 * `SUBMITTABLE_SOURCE_KINDS` is answered with the default rather than refused,
 * which is what `09` §4.2 does with every other malformed field on this form —
 * but that means `04` §5.1's `CHECK` never sees a bad value from this path, so
 * **this function is the check**, not the schema.
 */
export function readSourceKind(value: unknown): SourceKind {
  if (!isSourceKind(value))
    return DEFAULT_SOURCE_KIND
  return SUBMITTABLE_SOURCE_KINDS.includes(value) ? value : DEFAULT_SOURCE_KIND
}
