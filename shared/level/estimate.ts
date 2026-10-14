/**
 * *Your level* — [ADR 0079](../../docs/adr/0079-a-level-is-proved-and-placement-is-checked.md)
 * §2 and §3, the prototype's `levelCard`. The level the reader has proved,
 * and how far they are toward the next. A vocabulary estimate and nothing
 * more: the real JLPT also tests grammar, reading and listening.
 *
 * ⚠️ **Pure.** The read is `server/utils/level/queries.ts`; everything that
 * decides a level is here, and every number it uses is in `./thresholds.ts`.
 *
 * ⚠️ **Results outrank the placement, level by level.** A level with answers
 * to fifty of its words is decided by them; one with fewer is decided by the
 * placement, unless that level's spot-checks have said otherwise.
 */

import { jlptVocab, levelValues } from '../subject/declaration'
import { knownLevels } from './placement'
import { PROVED_MIN_WORDS, PROVED_RIGHT_SHARE, SPOT_CHECKS_DECIDE_AFTER } from './thresholds'

/** A level's first-try answers in the window. */
export interface LevelEvidence {
  level: string
  /** Distinct words of the level answered. */
  words: number
  /** Answers, each a word's first try in a run. */
  answers: number
  /** Of them, right first try. */
  right: number
}

/** The reader's latest placement: from the test, or the level they said they start at. */
export interface StandingPlacement {
  kind: 'test' | 'declared'
  /** The level placed at, or `null` for a test that placed at none. */
  level: string | null
}

/** A level's spot-checks so far: the first answer to each. */
export interface SpotCheckTally {
  level: string
  answered: number
  right: number
}

/**
 * - `proved` — fifty words or more, and at least 80 % right.
 * - `disproved` — fifty words or more, and under 80 %.
 * - `placed` — fewer than fifty, and the placement covers it.
 * - `open` — neither.
 */
export type LevelStatus = 'proved' | 'disproved' | 'placed' | 'open'

export interface LevelRow {
  level: string
  status: LevelStatus
  words: number
  /** Right first try as a share of answers, or `null` with none. */
  share: number | null
}

export interface LevelEstimate {
  /** The level proved, or `null` for none yet. */
  level: string | null
  /** The level being worked toward, or `null` at the top. */
  next: string | null
  /** `0` to `1`: how far toward `next`. */
  progress: number
  /** What `level` rests on. */
  source: 'results' | 'placement' | 'none'
  placement: StandingPlacement | null
  /** The levels whose words are marked known by the placement and still are. */
  placedOut: string[]
  /** Levels whose spot-checks took the placement's word away. */
  withdrawn: string[]
  rows: LevelRow[]
  /** The sentence under the ladder. */
  why: string
}

const share = (evidence: Pick<LevelEvidence, 'answers' | 'right'> | undefined): number | null =>
  evidence && evidence.answers > 0 ? evidence.right / evidence.answers : null

/**
 * The levels the spot-checks have taken from the placement: answered at least
 * `SPOT_CHECKS_DECIDE_AFTER` times and right first try under
 * `PROVED_RIGHT_SHARE`.
 */
export function withdrawnLevels(spotChecks: SpotCheckTally[]): string[] {
  return spotChecks
    .filter(check => check.answered >= SPOT_CHECKS_DECIDE_AFTER && check.right / check.answered < PROVED_RIGHT_SHARE)
    .map(check => check.level)
}

/**
 * The levels the placement still vouches for: every level up to the one it
 * placed at, stopping below the first one a spot-check withdrew. A reader who
 * misses N5 words was not placed at N4 either.
 */
function coveredLevels(placement: StandingPlacement | null, withdrawn: string[], levels: string[]): string[] {
  if (!placement?.level)
    return []

  const covered: string[] = []
  for (const level of levels.slice(0, levels.indexOf(placement.level) + 1)) {
    if (withdrawn.includes(level))
      break
    covered.push(level)
  }

  return covered
}

export function statusOf(evidence: LevelEvidence | undefined, covered: boolean): LevelStatus {
  const words = evidence?.words ?? 0
  const right = share(evidence)

  if (words >= PROVED_MIN_WORDS)
    return right !== null && right >= PROVED_RIGHT_SHARE ? 'proved' : 'disproved'

  return covered ? 'placed' : 'open'
}

/**
 * How far toward a level: the less complete of its two conditions, so the
 * bar is full only when both are met — fifty words, and 80 % of answers right.
 */
export function progressToward(evidence: LevelEvidence | undefined): number {
  const right = share(evidence)
  if (!evidence || right === null)
    return 0

  return Math.min(1, evidence.words / PROVED_MIN_WORDS, right / PROVED_RIGHT_SHARE)
}

export function estimateLevel(
  evidence: LevelEvidence[],
  placement: StandingPlacement | null,
  spotChecks: SpotCheckTally[] = [],
  levels: string[] = levelValues(jlptVocab),
): LevelEstimate {
  const byLevel = new Map(evidence.map(row => [row.level, row]))
  const withdrawn = placement ? withdrawnLevels(spotChecks) : []
  const covered = coveredLevels(placement, withdrawn, levels)

  const rows: LevelRow[] = levels.map((level) => {
    const row = byLevel.get(level)
    return { level, status: statusOf(row, covered.includes(level)), words: row?.words ?? 0, share: share(row) }
  })

  // The hardest proved or placed level with nothing disproved beneath it. An
  // open level does not break the run: a reader who proves N4 without having
  // answered fifty N5 words has not shown they lack N5.
  let level: string | null = null
  for (const row of rows) {
    if (row.status === 'disproved')
      break
    if (row.status === 'proved' || row.status === 'placed')
      level = row.level
  }

  const index = level === null ? -1 : levels.indexOf(level)
  const next = index + 1 < levels.length ? levels[index + 1]! : null
  const status = rows[index]?.status
  const source = level === null ? 'none' : status === 'proved' ? 'results' : 'placement'

  const placedOut = placement
    ? knownLevels(placement.level, levels).filter(known =>
        covered.includes(known) && levels.indexOf(known) <= index)
    : []

  return {
    level,
    next,
    progress: next ? progressToward(byLevel.get(next)) : 1,
    source,
    placement,
    placedOut,
    withdrawn,
    rows,
    why: whySentence({ level, next, source, placement, withdrawn }, byLevel),
  }
}

const percent = (value: number) => `${Math.round(value * 100)}%`

/** *From your placement test.* or *From the level you chose to start at.* */
function placementSource(placement: StandingPlacement): string {
  return placement.kind === 'test' ? 'From your placement test.' : 'From the level you chose to start at.'
}

/**
 * The prototype's sentence under the ladder: what the level rests on, how the
 * next one is going, and what moves the reader up.
 */
function whySentence(
  estimate: Pick<LevelEstimate, 'level' | 'next' | 'source' | 'placement' | 'withdrawn'>,
  byLevel: Map<string, LevelEvidence>,
): string {
  const { level, next, source, placement, withdrawn } = estimate
  const atShare = share(level ? byLevel.get(level) : undefined)
  const toward = next ? byLevel.get(next) : undefined
  const towardShare = share(toward)

  if (level === null && placement === null && towardShare === null)
    return `No estimate yet. Take the placement test, or just start studying and it will appear after about ${PROVED_MIN_WORDS} answers.`

  const parts: string[] = []

  if (withdrawn.length > 0)
    parts.push(`Your spot-checks of ${withdrawn.join(' and ')} words were under ${percent(PROVED_RIGHT_SHARE)} right, so the placement no longer counts for ${withdrawn.length === 1 ? 'that level' : 'those levels'}.`)

  // What the level rests on.
  if (source === 'results' && atShare !== null && towardShare !== null)
    parts.push(`You get ${level} words right ${percent(atShare)} of the time and ${next} words ${percent(towardShare)} of the time.`)
  else if (source === 'results' && atShare !== null)
    parts.push(`You get ${level} words right ${percent(atShare)} of the time.`)
  else if (placement && (source === 'placement' || placement.level === null))
    parts.push(placementSource(placement))

  if (next === null)
    return parts.join(' ')

  // How the next level is going, and what moves the reader up.
  if (towardShare === null || !toward) {
    parts.push(source !== 'results' && placement && parts.at(-1) === placementSource(placement)
      ? 'It will sharpen as you answer lessons and reviews.'
      : `Answer ${PROVED_MIN_WORDS} ${next} words with ${percent(PROVED_RIGHT_SHARE)} right to move up.`)
    return parts.join(' ')
  }

  if (!(source === 'results' && atShare !== null))
    parts.push(`You get ${next} words right ${percent(towardShare)} of the time.`)

  parts.push(toward.words >= PROVED_MIN_WORDS
    ? `Reach ${percent(PROVED_RIGHT_SHARE)} on ${next} to move up.`
    : `Reach ${percent(PROVED_RIGHT_SHARE)} across ${PROVED_MIN_WORDS} ${next} words to move up (${toward.words} so far).`)

  return parts.join(' ')
}
