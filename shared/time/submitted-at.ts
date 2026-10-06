import { resolveZone } from './local-day'

/**
 * ⚠️ **One formatter, so two screens cannot render the same instant two ways.**
 * `09` §2 stamps every figure in the *shell* "as of this page load"; two
 * spellings of the same timestamp would make one of those stamps read as a
 * different page load.
 *
 * ⚠️ **The zone is an argument, never the runtime's.** Vercel renders in UTC and
 * Sources ships no JavaScript (ADR 0020), so a `DateTimeFormat` without a
 * `timeZone` shows the server's clock — #60. Callers pass the reader's stored
 * zone (`readerZone`), the same one `/stats` reads.
 */
export function formatSubmittedAt(instant: Date, zone: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: resolveZone(zone),
  }).format(instant)
}
