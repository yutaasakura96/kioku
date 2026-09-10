/**
 * The one value that travels in a query string on a *place*.
 *
 * `09` §4.2: identical content resubmitted answers `303` to `/` "plus a line
 * naming the earlier *source* and linking to it". The redirect is the whole
 * mechanism — there is no client to hold the fact across, and no server-side
 * flash anywhere in this application — so the earlier *source*'s id rides in
 * `?existing=`.
 *
 * ⚠️ **It is a value arriving in a URL, so it is checked before it is used**,
 * for the same reason `shared/utils/origin.ts` checks `from`. This one cannot be
 * an open redirect — it is never navigated to unchecked — but it is read
 * straight into a query, and an id that is not an id should be a missing line
 * rather than a database error on a page that was otherwise rendering fine.
 *
 * The shape is the one `04` §1 gives every primary key: a UUID, and specifically
 * a `uuidv7()`. This accepts any RFC 4122 version — the guard is about shape,
 * and a v4 id typed in by hand is still a well-formed id that simply will not be
 * found.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** The id, or `null` for anything that is not one. */
export function resolveExisting(value: unknown): string | null {
  if (typeof value !== 'string')
    return null

  return UUID.test(value) ? value : null
}
