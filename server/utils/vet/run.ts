/**
 * `04` §7.1's *vetting session* — **the run boundary, in one module.**
 *
 * It exists because `CONTEXT.md` makes a *rejection* reversible only within the
 * run that declined it and permanent afterwards, which needs a durable boundary
 * rather than a belief held by the browser tab. Three things write or read that
 * boundary — the queue, a decision and the undo — and the first draft of #10 had
 * each of them finding the open run for itself, with the idle horizon spelled
 * out twice. **The horizon having two homes is the failure `04` §13 argues
 * against**, so it has one.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { IngestDatabase } from '../ingest/record'

/** ⚠️ `04` §7.1's third way a run ends, and the one that cannot be asked anything. */
export const IDLE_HORIZON = '30 minutes'

export interface OpenRun {
  id: string
  /** Decisions in the run — `10` §4.5 state 3's `18 vetted in this run`. */
  vetted: number
  /** ⚠️ ADR 0033's confirmation appears only above zero. */
  rejections: number
}

/**
 * ⚠️ **`04` §7.1's idle sweep, run where somebody is looking**
 * ([ADR 0050](../../../docs/adr/0050-the-idle-sweep-runs-on-the-next-read-because-there-is-no-scheduler.md)).
 *
 * The column has three writers — `Esc`, the Done control, and a 30-minute idle
 * sweep — and the third one has nowhere to live: ADR 0022 forbids Vercel Cron, a
 * serverless deployment holds no timer, and the worker claims `job` rows over
 * **shared** entities and has never touched a personal table. So it runs on the
 * read that would otherwise have found the stale run.
 *
 * **What that costs is stated rather than hidden:** a run abandoned by a reader
 * who never comes back stays open until somebody looks, so a *rejection* inside
 * it stays reversible while nobody is asking. The moment anybody asks, it is
 * permanent — which is ADR 0033's own story, *a reader who walks away comes back
 * to a run that ended without them*.
 *
 * ⚠️ **Idleness is measured from the last decision, not from `started_at`** —
 * otherwise a run longer than half an hour would end underneath a reader who was
 * still working.
 */
export async function sweepIdleRuns(db: IngestDatabase, ownerId: string): Promise<void> {
  await db.execute(sql`
    update vetting_session vs
       set ended_at = now()
     where vs.owner_id = ${ownerId}
       and vs.ended_at is null
       and coalesce(
             (select max(nv.vetted_at) from note_vetting nv where nv.vetting_session_id = vs.id),
             vs.started_at
           ) < now() - interval '${sql.raw(IDLE_HORIZON)}'
  `)
}

/**
 * The open run's id, or `null`.
 *
 * ⚠️ **Newest first, and there should never be a second.** Nothing in the
 * application opens a run while one is open; ordering rather than asserting
 * means a row left behind by a crash mid-write is a run the reader can still end
 * rather than a screen that refuses to load.
 */
export async function findOpenRun(db: IngestDatabase, ownerId: string): Promise<string | null> {
  const [run] = await db
    .select({ id: schema.vettingSession.id })
    .from(schema.vettingSession)
    .where(and(eq(schema.vettingSession.ownerId, ownerId), isNull(schema.vettingSession.endedAt)))
    .orderBy(desc(schema.vettingSession.startedAt))
    .limit(1)

  return run?.id ?? null
}

/** The open run and what it holds — what the chrome bar and ADR 0033's question read. */
export async function openRunTally(db: IngestDatabase, ownerId: string): Promise<OpenRun | null> {
  const [run] = await db
    .select({
      id: schema.vettingSession.id,
      vetted: sql<number>`(${db
        .select({ n: sql`count(*)` })
        .from(schema.noteVetting)
        .where(eq(schema.noteVetting.vettingSessionId, schema.vettingSession.id))})::int`,
      rejections: sql<number>`(${db
        .select({ n: sql`count(*)` })
        .from(schema.noteVetting)
        .where(
          and(
            eq(schema.noteVetting.vettingSessionId, schema.vettingSession.id),
            eq(schema.noteVetting.state, 'rejected'),
          ),
        )})::int`,
    })
    .from(schema.vettingSession)
    .where(and(eq(schema.vettingSession.ownerId, ownerId), isNull(schema.vettingSession.endedAt)))
    .orderBy(desc(schema.vettingSession.startedAt))
    .limit(1)

  return run ?? null
}

/**
 * The open run, opening one if there is none — `04` §7.1's "contiguous run at
 * the keyboard".
 *
 * ⚠️ **The idle sweep runs first**, so a keystroke half an hour after the last
 * one starts a *new* run rather than extending a run the reader has walked away
 * from. Without that the undo horizon would quietly be "since I last opened this
 * laptop", which is not a horizon.
 */
export async function openOrStartRun(tx: IngestDatabase, ownerId: string): Promise<string> {
  await sweepIdleRuns(tx, ownerId)

  const open = await findOpenRun(tx, ownerId)
  if (open)
    return open

  const [started] = await tx
    .insert(schema.vettingSession)
    .values({ ownerId })
    .returning({ id: schema.vettingSession.id })

  return started!.id
}

/**
 * Done, and `Esc` — `04` §7.1's `ended_at`, which is what makes every
 * *rejection* in the run permanent (ADR 0006, ADR 0033).
 *
 * ⚠️ **It is idempotent and it takes no run id.** The reader has one open run by
 * construction, and a second press of Done during the document load that the
 * first one started must not answer differently.
 */
export async function endOpenRun(db: IngestDatabase, ownerId: string): Promise<void> {
  await db
    .update(schema.vettingSession)
    .set({ endedAt: sql`now()` })
    .where(and(eq(schema.vettingSession.ownerId, ownerId), isNull(schema.vettingSession.endedAt)))
}
