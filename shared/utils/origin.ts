/**
 * The three *place* paths, and the only values a mode's Done control will
 * navigate to.
 *
 * ADR 0032: the origin travels in a `from` query parameter set by the start
 * control. It is a redirect target arriving in a URL, so it is an open-redirect
 * hole if it is trusted — and the allowlist is three strings long. A mode
 * reached without the parameter returns to `/`, which ADR 0031 makes Ingest.
 */
export const PLACES = ['/', '/sources', '/stats'] as const

export type Place = (typeof PLACES)[number]

/** Matches `from` against the three place paths. Anything else is `/`. */
export function resolveOrigin(from: unknown): Place {
  if (typeof from !== 'string')
    return '/'

  if (!(PLACES as readonly string[]).includes(from))
    return '/'

  return from as Place
}
