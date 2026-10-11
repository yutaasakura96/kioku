/**
 * The three study settings — [ADR 0076](../../docs/adr/0076-new-words-are-taught-in-a-lesson-and-a-miss-is-asked-again.md)
 * §2. How many new words a lesson teaches, how many a day, and how many
 * waiting reviews stop new words altogether.
 *
 * ⚠️ **ADR 0066 §1 and §2 made the second and third constants, on purpose**,
 * and Yuta's answer on the prototype is that they are adjustable. The defaults
 * are that ADR's numbers, and the rule it cared about most is untouched: the
 * day is counted from what was offered (`shared/review/brake.ts`).
 *
 * ⚠️ **One clamp, used by the form and by the read.** A row written by hand, or
 * by a later version with wider bounds, is clamped on the way out too, so no
 * composition ever sees a lesson of zero or a day of a million.
 */

export interface StudyLimits {
  /** New words one lesson teaches. */
  lessonSize: number
  /** New words a local day. Zero stops new words. */
  dailyNew: number
  /** At this many waiting reviews or more, no lesson is offered (ADR 0066 §2). */
  pauseAbove: number
}

export const DEFAULT_LIMITS: StudyLimits = Object.freeze({
  lessonSize: 5,
  dailyNew: 10,
  pauseAbove: 50,
})

export const LIMIT_BOUNDS: Record<keyof StudyLimits, { min: number, max: number }> = {
  lessonSize: { min: 1, max: 20 },
  dailyNew: { min: 0, max: 100 },
  pauseAbove: { min: 1, max: 2000 },
}

/**
 * What the settings form sent, as limits.
 *
 * ⚠️ **Out of range clamps, and blank is the default**, as the *session*-size
 * knob does (`clampSessionSize`): a form refused over a typo would be the
 * settings page taking the reader's lesson away.
 */
export function clampLimits(raw: unknown): StudyLimits {
  const record = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}

  return {
    lessonSize: bounded('lessonSize', record.lessonSize),
    dailyNew: bounded('dailyNew', record.dailyNew),
    pauseAbove: bounded('pauseAbove', record.pauseAbove),
  }
}

function bounded(name: keyof StudyLimits, value: unknown): number {
  // ⚠️ `Number('')` and `Number(null)` are both `0`, which for two of the three
  // would be a value rather than *nothing was sent*.
  const asked = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN

  if (!Number.isFinite(asked))
    return DEFAULT_LIMITS[name]

  const { min, max } = LIMIT_BOUNDS[name]

  return Math.min(max, Math.max(min, Math.floor(asked)))
}
