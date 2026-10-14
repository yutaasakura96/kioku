/**
 * The *place* paths, and the only values a mode's Done control will navigate
 * to. Five since ADR 0077 §3 added `/categories`; four since ADR 0076 §2
 * added `/settings`; three until then. ⚠️ **The order is the nav's.**
 *
 * ADR 0032: the origin travels in a `from` query parameter set by the start
 * control. It is a redirect target arriving in a URL, so it is an open-redirect
 * hole if it is trusted — and the allowlist is five strings long. A mode
 * reached without the parameter returns to `/`, which ADR 0031 makes Ingest.
 */
export const PLACES = ['/', '/categories', '/sources', '/stats', '/settings'] as const

export type Place = (typeof PLACES)[number]

/** Matches `from` against the place paths. Anything else is `/`. */
export function resolveOrigin(from: unknown): Place {
  if (typeof from !== 'string')
    return '/'

  if (!(PLACES as readonly string[]).includes(from))
    return '/'

  return from as Place
}
