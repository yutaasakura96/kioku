/**
 * The *place* paths, and the only values a mode's Done control will navigate
 * to. Seven since #71 (ADR 0078) made `/` Home and moved Ingest to `/add`, with
 * `/more` as the menu the prototype puts everything else under; five since
 * ADR 0077 §3 added `/categories`; four since ADR 0076 §2 added `/settings`;
 * three until then.
 *
 * ADR 0032: the origin travels in a `from` query parameter set by the start
 * control. It is a redirect target arriving in a URL, so it is an open-redirect
 * hole if it is trusted — and the allowlist is seven strings long. A mode
 * reached without the parameter returns to `/`, which is Home since ADR 0078
 * (Ingest until then, ADR 0031).
 */
export const PLACES = ['/', '/categories', '/more', '/add', '/sources', '/stats', '/settings'] as const

export type Place = (typeof PLACES)[number]

/**
 * The bar's three items, the prototype's `NAV` without *Words*, which no
 * ticket has built. ⚠️ **The order is the nav's.** Every other *place* is
 * reached from More, and the bar marks More while the reader is on one of
 * them (`navItemOf`).
 */
export const NAV = ['/', '/categories', '/more'] as const

export type NavItem = (typeof NAV)[number]

/** The nav item a path sits under: its own, or More for a *place* reached from More. */
export function navItemOf(path: string): NavItem | null {
  if (path === '/')
    return '/'

  if (path === '/categories')
    return '/categories'

  const underMore = ['/more', '/add', '/sources', '/stats', '/settings']
  return underMore.some(place => path === place || path.startsWith(`${place}/`)) ? '/more' : null
}

/** Matches `from` against the place paths. Anything else is `/`. */
export function resolveOrigin(from: unknown): Place {
  if (typeof from !== 'string')
    return '/'

  if (!(PLACES as readonly string[]).includes(from))
    return '/'

  return from as Place
}
