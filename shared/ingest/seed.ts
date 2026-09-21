/**
 * What a *seed* request may ask for — [ADR 0070](../../docs/adr/0070-a-seeded-list-is-a-draft-the-reader-submits.md), #25.
 *
 * *Ingest* asks the worker for a word list with a *domain*, a *level* and a
 * count. The answer is a draft that lands in the word-list field, and it becomes
 * a *source* only when the reader submits it (ADR 0070 §1).
 *
 * ⚠️ **Pure, and the one place the request is judged** (`11` §8). The form
 * offers only valid values, so a request refused here was posted from somewhere
 * else — and a refusal writes nothing, because a seed row is a job, and a job
 * is money on the worker's key.
 */

import { domainValues, levelValues } from '../subject/declaration'
import type { SubjectDeclaration } from '../subject/declaration'
import { CHUNK_TARGET_TERMS } from './chunk'

/**
 * ⚠️ **The counts *Ingest* offers** — ADR 0070 § Left to the build, settled.
 *
 * The default is **one 25-term word-list *chunk*** (ADR 0063), so the ordinary
 * seed is one `generate` request. Above it every count is whole *chunks*, and
 * the ceiling is four: 100 words is ten days of ADR 0066's brake, and a longer
 * draft is the long list #25's out-of-scope line says the reader does not want
 * to curate. `S2`'s 100,000-code-point cap is never the binding bound — 100
 * terms are a few hundred code points. 10 is there for a first
 * look at a *domain* before paying for a *chunk* of it.
 */
export const SEED_COUNTS = [10, CHUNK_TARGET_TERMS, 50, 100] as const

export const DEFAULT_SEED_COUNT: number = CHUNK_TARGET_TERMS

export interface SeedRequest {
  domain: string
  level: string
  count: number
}

/**
 * The request, or `null` when it is not one the worker may spend on.
 *
 * ⚠️ **Values from the *subject*'s closed sets only** (ADR 0065 §2): a seed for
 * a *domain* no claim can carry would draft words no filter could ever select.
 */
export function readSeedRequest(
  body: Record<string, unknown> | undefined,
  declaration: SubjectDeclaration,
): SeedRequest | null {
  const domain = trimmed(body?.domain)
  const level = trimmed(body?.level)
  const count = trimmed(body?.count)

  if (domain === null || !domainValues(declaration).includes(domain))
    return null
  if (level === null || !levelValues(declaration).includes(level))
    return null
  if (count === null || !/^\d+$/.test(count))
    return null

  const parsed = Number(count)
  if (!(SEED_COUNTS as readonly number[]).includes(parsed))
    return null

  return { domain, level, count: parsed }
}

/**
 * The title a draft is offered under, and the ledger's name for the request.
 * ⚠️ It says how the list was made, so a *source* that came from a seed can
 * still be told apart from one the reader typed after the fact.
 */
export function seedTitle(request: SeedRequest): string {
  return `${request.domain} · ${request.level} · ${request.count} words`
}

/** The draft as the word-list field holds it: one line per word. */
export function draftContent(terms: readonly string[]): string {
  return terms.join('\n')
}

function trimmed(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null
}
