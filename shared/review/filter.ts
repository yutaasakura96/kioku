/**
 * The *session* filter — ADR 0065 §5, and the reason this app exists rather
 * than WaniKani: study `tech` next, and nothing else new.
 *
 * ⚠️ **It restricts which new *cards* are introduced and never which due *cards*
 * are owed.** That rule is applied where the new half is read
 * (`server/utils/review/queries.ts`'s `newCards`); the due read takes no filter
 * at all, so there is no argument for it to be passed by mistake.
 *
 * ⚠️ **It is an argument to one *session*, not a *deck*** (ADR 0009, ADR 0065
 * §6). Nothing here is saved, and *Review* forgets it on a reload.
 */

import type { SubjectDeclaration } from '../subject/declaration'
import { domainValues, levelValues } from '../subject/declaration'

export interface SessionFilter {
  /** An empty set restricts nothing. */
  domains: string[]
  levels: string[]
}

// ⚠️ **Frozen all the way down**: it is the shared default, and a `push` onto a
// shallowly frozen one would filter every later *session* in the process.
export const NO_FILTER: SessionFilter = Object.freeze({
  domains: Object.freeze([]),
  levels: Object.freeze([]),
}) as unknown as SessionFilter

export type FilterErrorCode = 'bad_domains' | 'bad_levels'

export type FilterParseResult
  = | { ok: true, filter: SessionFilter }
    | { ok: false, code: FilterErrorCode }

/** Whether either set restricts anything. */
export function isFiltered(filter: SessionFilter): boolean {
  return filter.domains.length > 0 || filter.levels.length > 0
}

/**
 * The filter a `POST /api/review/session` carries, checked against the
 * declaration's closed sets (ADR 0065 §2).
 *
 * ⚠️ **An absent set is no restriction, and an unknown value is a refusal.** The
 * first-ever *session* sends no body; a value nobody declared is a filter that
 * would either match nothing or, dropped, silently match everything — and the
 * reader asked for neither.
 */
export function parseSessionFilter(body: unknown, declaration: SubjectDeclaration): FilterParseResult {
  const record = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {}

  const domains = valuesIn(record.domains, domainValues(declaration))
  if (domains === null)
    return { ok: false, code: 'bad_domains' }

  const levels = valuesIn(record.levels, levelValues(declaration))
  if (levels === null)
    return { ok: false, code: 'bad_levels' }

  if (domains.length === 0 && levels.length === 0)
    return { ok: true, filter: NO_FILTER }

  return { ok: true, filter: { domains, levels } }
}

/** The set, deduplicated in the order sent, or `null` for one that is not legal. */
function valuesIn(value: unknown, legal: string[]): string[] | null {
  if (value === undefined || value === null)
    return []

  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string' && legal.includes(entry)))
    return null

  return [...new Set(value as string[])]
}
