/**
 * What the reader typed, read into what the schema needs — the pure half of
 * `POST /api/source`.
 *
 * ⚠️ **This runs before anything is written and before anything is spent.**
 * `03` §13.2: "Source text is capped at 100,000 characters and checked
 * server-side before the job is written — before any spend, per PRD §5." PRD §5
 * calls the cap "a judgement about what a human will vet, not a technical
 * limit", which is why it is 100,000 rather than a byte budget.
 *
 * ⚠️ **Server-side is the only side.** Ingest ships no JavaScript (`03` §2.1),
 * so there is no client validation to duplicate and none to be bypassed — the
 * usual mistake is structurally impossible here rather than merely avoided.
 * There is also no live character counter for the same reason (`10` §6.2), so
 * the count in the refusal message is the only way the reader learns how much to
 * cut.
 *
 * What this function does **not** decide is the *answer*. `09` §4.2 refuses
 * over-cap with `200` and the form re-rendered with the reader's text still in
 * it — a redirect would throw away a paste that cannot be got back — and that is
 * a property of the response body, so `11` §8 puts it in the end-to-end-only
 * column.
 */

import { BLANK } from '../subject/validate'
import { countCharacters, sliceCharacters, toNfc } from './text'

/**
 * `S2`, `03` §13.2, and `04` §5.1's
 * `CHECK (char_count > 0 AND char_count <= 100000)` — the same rule stated
 * twice, deliberately. This one gives the reader a sentence; the schema's one
 * refuses a row that arrived by any other path.
 */
export const SOURCE_CHARACTER_CAP = 100_000

/** How much of the first line becomes a derived title. */
export const DERIVED_TITLE_CHARACTERS = 60

export interface Submission {
  title: string
  content: string
}

export type SubmissionResult
  = | {
    ok: true
    /** NFC, and never blank. Derived from the content when the field was empty. */
    title: string
    /** NFC. **Everything downstream reads this, not the raw input.** */
    content: string
    /** Code points, and therefore what `04` §5.1's `char_count` will hold. */
    characterCount: number
  }
  | {
    ok: false
    code: 'empty' | 'over_cap'
    /** `10` §6.3 gives the over-cap sentence verbatim, separators included. */
    message: string
    characterCount: number
  }

/**
 * ⚠️ **Normalisation happens first, and the order is load-bearing.** `04` §5.1
 * defines `content_hash` as the SHA-256 of NFC-normalised content. If the count,
 * the cap and the chunk offsets were computed against the raw text and only the
 * hash against the normalised one, the four would disagree about what the text
 * is — and the disagreement would be invisible until a re-ingestion missed the
 * cache or an *occurrence* pointed at the wrong span.
 */
export function readSubmission(submission: Submission): SubmissionResult {
  const content = toNfc(submission.content)
  const characterCount = countCharacters(content)

  // ⚠️ Blank is the shared character class from `shared/subject/validate.ts`,
  // not `.trim()`. #3 measured that `trim()` and Python's `str.strip()` differ
  // on six characters across the BMP, one of which is `U+001F` — the character
  // `04` §5.3 joins the *identity key* with (`00-status.md` § Carrying). There
  // is one class in this repository and this is it.
  if (BLANK.test(content)) {
    return {
      ok: false,
      code: 'empty',
      message: 'Nothing to ingest — paste the text you want notes from.',
      characterCount,
    }
  }

  if (characterCount > SOURCE_CHARACTER_CAP) {
    return {
      ok: false,
      code: 'over_cap',
      message: `${characterCount.toLocaleString('en-US')} characters — the cap is ${SOURCE_CHARACTER_CAP.toLocaleString('en-US')}. Split it and submit the halves.`,
      characterCount,
    }
  }

  return {
    ok: true,
    title: readTitle(submission.title, content),
    content,
    characterCount,
  }
}

/**
 * `09` §4.2 makes the title optional and `04` §5.1 makes the column `not null`.
 * Something has to bridge that, and a *source* with no title still has to be
 * nameable — it is the link text in the runs list and in the Sources list
 * (`10` §6.2, §7.1), so an empty string would render a row with nothing to click.
 *
 * The first non-blank line is what a person would have typed anyway.
 */
function readTitle(raw: string, content: string): string {
  const given = toNfc(raw)
  if (!BLANK.test(given))
    return given.trim()

  const firstLine = content.split('\n').find(line => !BLANK.test(line))?.trim() ?? ''

  // Truncation is by code point: a title cut at a UTF-16 boundary can end in
  // half a character (`shared/ingest/text.ts`).
  if (countCharacters(firstLine) <= DERIVED_TITLE_CHARACTERS)
    return firstLine

  return `${sliceCharacters(firstLine, 0, DERIVED_TITLE_CHARACTERS)}…`
}
