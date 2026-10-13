/**
 * The shelf `/categories` draws — ADR 0077 §3. The shape that crosses from the
 * read (`server/utils/category/queries.ts`) to the page, and the one piece of
 * arithmetic both of them need.
 */

import type { CategoryGroup } from './category'
import { STAGES } from '../review/stage'
import type { Stage } from '../review/stage'

export interface CategoryRow {
  key: string
  group: CategoryGroup
  /** `N5`, a deck's title, or *My words*. */
  label: string
  /** The *notes* in it — shared rows, so the same number for every reader. */
  words: number
}

/** How many of a *category*'s words the reader has at each stage (ADR 0076 §7). */
export type CategoryProgress = Record<Stage, number>

export interface ShelfRow extends CategoryRow {
  progress: CategoryProgress
  /** The one the reader's new words come from. Exactly one row has it. */
  active: boolean
}

export const noProgress = (): CategoryProgress => ({ learning: 0, familiar: 0, known: 0 })

/** The words of a *category* the reader has been graded on, at any stage. */
export function learned(progress: CategoryProgress): number {
  return STAGES.reduce((sum, stage) => sum + progress[stage], 0)
}
