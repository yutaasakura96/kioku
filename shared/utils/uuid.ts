/**
 * The shape `04` §1 gives every primary key.
 *
 * ⚠️ **Every value that arrives from outside and is read straight into a query
 * is checked against this first**, and the reason is the same in both places it
 * is used: an id that is not an id should be a missing line or a refused
 * keystroke, not a database error on a page that was otherwise fine.
 *
 * Any RFC 4122 version is accepted. The guard is about **shape** — `04` defaults
 * every key to `uuidv7()`, but a v4 id typed in by hand is still a well-formed
 * id that will simply not be found, and refusing it here would be a second,
 * quieter version of "not found".
 *
 * ⚠️ **One copy.** It was written twice — `shared/ingest/existing.ts` had it and
 * so did the *Vet* decision validator — which is the drift `04` §13 argues
 * against in the small.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
