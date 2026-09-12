/**
 * `04` §12's first query, as the only read *Vet* makes.
 *
 * ⚠️ **A *mode* fetches; the three *places* do not** (`03` §2.1, ADR 0013).
 * This is the first `/api/**` route in the application, and the reason it exists
 * here rather than as a `useAsyncData` against a *place* is the split itself:
 * `/vet` is `ssr: false`, so there is no request event to hang data off and no
 * server render to put it in.
 *
 * ⚠️ **It is also where `04` §7.1's idle sweep runs** — see
 * `server/utils/vet/queries.ts`, which carries the argument and its cost.
 */
import { requireOwnerId } from '../../utils/reader'
import { useDatabase } from '../../db'
import { vetQueue } from '../../utils/vet/queries'

export default defineEventHandler(async (event) => {
  return vetQueue(useDatabase(), requireOwnerId(event))
})
