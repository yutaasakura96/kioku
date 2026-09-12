// The two things `server/middleware/shell-data.ts` and
// `server/middleware/submit-source.ts` hand to the three *places*, typed here in
// `server/types/`, which Nuxt scans for server-only types — the same place and
// for the same reason as `session.d.ts` (`08` §6.2).

import type { RunRow, SourceDetail, SourceRow, StartBlockCounts } from '../utils/ingest/queries'
import type { StatsData } from '../utils/stats/queries'

/**
 * A lazy reader over the *places*' data. Every member is a function: a `POST /`
 * that succeeds redirects without rendering, and should pay for no queries.
 */
interface PlaceReader {
  /** The start block's two figures — `10` §3.2. Never used to disable a control. */
  counts: () => Promise<StartBlockCounts>
  /** The runs above the Ingest form — `10` §6.1, newest first. */
  runs: () => Promise<RunRow[]>
  /** The Sources list — `10` §7.1. **Deleted *sources* are in it** (`S11`). */
  sources: () => Promise<SourceRow[]>
  /** The earlier *source* named by `?existing=` — `09` §4.2. */
  sourceTitle: (id: string) => Promise<string | null>
  /** One *source*, readable — `10` §7.2's first half. */
  sourceDetail: (id: string) => Promise<SourceDetail | null>
  /**
   * `S10`'s six figures and the spend ledger — `10` §8.
   *
   * ⚠️ **Lazy like the rest of this reader.** Stats is five sequential reads
   * and a ledger; the other two *places* must pay for none of it.
   */
  stats: () => Promise<StatsData>
}

/**
 * A refused submission, on its way back to the form it came from — `09` §4.2,
 * `10` §6.3.
 *
 * ⚠️ `content` is **what the reader typed**, not the normalised text. The whole
 * point of the re-render is that a paste which cannot be got back is handed
 * back; handing back a subtly different string would be a worse bug than losing
 * it, because nothing would show.
 */
interface IngestFailure {
  code: 'empty' | 'over_cap'
  message: string
  title: string
  content: string
}

declare module 'h3' {
  interface H3EventContext {
    /**
     * Attached on `/`, `/sources` and `/stats`, for a reader with a session.
     *
     * ⚠️ `undefined` means either that this is not a *place* or that no session
     * resolved — the *place* renders its empty state rather than guessing.
     */
    place?: PlaceReader

    /** Present only on the `POST /` that was refused. */
    ingestFailure?: IngestFailure
  }
}

export {}
