/**
 * A word's stage — [ADR 0076](../../docs/adr/0076-new-words-are-taught-in-a-lesson-and-a-miss-is-asked-again.md)
 * §7. *Learning*, *Familiar* or *Known*, read from the scheduler and stored
 * nowhere.
 *
 * ⚠️ **The scheduler is unchanged and this is a reading of it.** Stability is
 * FSRS's own figure for how long the word lasts — the days until recall falls
 * to the configured retention — so a stage is a band of it, and a lapse that
 * cuts stability also takes the word down a stage without any rule here.
 *
 * ⚠️ **Both thresholds are #70's and neither is measured.** Twenty-one days is
 * the line Anki draws between a young *card* and a mature one; seven is this
 * file's. They are constants so that moving one is one line.
 */

export const STAGES = ['learning', 'familiar', 'known'] as const

export type Stage = (typeof STAGES)[number]

export const FAMILIAR_FROM_DAYS = 7
export const KNOWN_FROM_DAYS = 21

export const STAGE_LABELS: Record<Stage, string> = {
  learning: 'Learning',
  familiar: 'Familiar',
  known: 'Known',
}

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value)
}

/** The stage of a word whose live *scheduling epoch* has this stability, in days. */
export function stageOf(stability: number): Stage {
  if (stability >= KNOWN_FROM_DAYS)
    return 'known'

  return stability >= FAMILIAR_FROM_DAYS ? 'familiar' : 'learning'
}

/**
 * The stage of an epoch as a row gives it, or `null` for one that has never
 * been answered: `state` 0 is the library's New, and its stability is a zero
 * that means *not yet known* rather than *known for no time*.
 */
export function stageOfEpoch(epoch: { state: number, stability: number } | null | undefined): Stage | null {
  if (!epoch || epoch.state === 0)
    return null

  return stageOf(epoch.stability)
}

/**
 * Where a *grade* sent the word, in the prototype's words: *now Learning* for a
 * word that had no stage, then *up to*, *stays* or *down to*.
 */
export function movement(before: Stage | null, after: Stage): string {
  const label = STAGE_LABELS[after]

  if (before === null)
    return `now ${label}`

  const moved = STAGES.indexOf(after) - STAGES.indexOf(before)

  if (moved === 0)
    return `stays ${label}`

  return moved > 0 ? `up to ${label}` : `down to ${label}`
}

/**
 * When the word is back — *back tomorrow*, *back in 5 days*, *back in 3 weeks*.
 *
 * ⚠️ **Calendar days between two local midnights**, for `shared/review/next-due.ts`'s
 * reason: the reader reads a date, and a rounded difference in milliseconds is
 * wrong twice a year.
 */
export function backIn(due: Date, now: Date = new Date()): string {
  const days = Math.round((midnight(due) - midnight(now)) / 86_400_000)

  if (days <= 0)
    return 'back today'
  if (days === 1)
    return 'back tomorrow'
  if (days < 14)
    return `back in ${days} days`
  if (days < 60)
    return `back in ${Math.round(days / 7)} weeks`

  return `back in ${Math.round(days / 30)} months`
}

function midnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}
