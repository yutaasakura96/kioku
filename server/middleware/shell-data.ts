// What the three *places* read, attached to the request the *place* renders on.
//
// ⚠️ **This is #5's idiom, not a new one.** `app/pages/auth/index.vue` already
// reads `useRequestEvent()?.context.session` rather than calling a client
// library, and `08` §6.1 gives the reason: a *place* has no client, so anything
// that would fetch on the client is either dead code or a script tag that
// `noScripts` will strip and leave behind a page with no data. The three *places*
// render **only** on the server, so the request event is where their data
// belongs.
//
// The alternative was `useAsyncData` + `$fetch` against new `/api/**` read
// routes. It was rejected on three counts, in order of weight: it adds routes
// `09` §1's table does not have; `useAsyncData` serialises its result into the
// Nuxt payload, which is a `<script type="application/json">` on a route whose
// whole contract is that it emits no `<script>`; and the internal call would
// need `useRequestFetch()` to forward the session cookie, which is a fourth
// thing to get right for no gain over reading the row here.
//
// ⚠️ **Everything attached is a function, not a result.** A `POST /` that
// succeeds redirects without rendering anything, and a lazy reader means that
// path pays for no queries at all.

import {
  allSources,
  recentRuns,
  sourceDetail,
  sourceTitle,
  startBlockCounts,
} from '../utils/ingest/queries'
import { statsData } from '../utils/stats/queries'
import { readerZone } from '../utils/review/queries'
import { useDatabase } from '../db'

/** The three *places* — `10` §3, ADR 0013. */
const SHELL_PATHS = new Set(['/', '/sources', '/stats'])

/** `/sources/:id` carries the *shell* too — ADR 0013, `09` §2. */
const SHELL_PREFIX = '/sources/'

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0] ?? '/'

  if (!SHELL_PATHS.has(path) && !path.startsWith(SHELL_PREFIX))
    return

  // ⚠️ **Ordering, and why violating it is safe.** Nitro runs
  // `server/middleware/` alphabetically, so `session.ts` has already resolved
  // `event.context.session` by the time this runs — `shell-data` sorts after
  // `session` on the `h` / `e`. If that ever stops being true the session reads
  // `undefined` rather than `null`, and this attaches nothing: the *place* then
  // renders its empty state instead of one reader's counts appearing under
  // another's name. It fails closed, which is the only property worth relying on
  // when the mechanism is a filename.
  //
  // ⚠️ **And this branch is deliberately not covered by a test.** It was
  // sabotaged on 2026-09-11 — replaced with a fallback owner — and the suite
  // stayed green, which is the correct result rather than a hole: `session.ts`
  // has already answered `302` to an unauthenticated document request, so
  // nothing downstream of it ever runs without a session. The branch is defence
  // against a **reordering**, and a test for it would have to reorder the
  // middleware to mean anything.
  const session = event.context.session
  if (!session)
    return

  const ownerId = session.user.id
  const db = useDatabase()

  event.context.place = {
    counts: () => startBlockCounts(db, ownerId),
    runs: () => recentRuns(db),
    sources: () => allSources(db),
    sourceTitle: (id: string) => sourceTitle(db, id),
    sourceDetail: (id: string) => sourceDetail(db, id),
    // ⚠️ **The zone is the one the newest *session* stored** (#21). `/stats`
    // ships no JavaScript (ADR 0020), so it cannot ask; the *session* request
    // is the one place a client reports it (ADR 0066 §4), and `readerZone`
    // falls back to UTC for a reader who has never composed a run from one.
    // ⚠️ **Not `Accept-Language`**, which carries no zone, and **not a
    // `<script>`**, which is the property ADR 0020 exists to hold.
    stats: async () => statsData(db, ownerId, { now: new Date(), zone: await readerZone(db, ownerId) }),
  }
})
