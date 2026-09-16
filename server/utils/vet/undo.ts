/**
 * `Z`, and the Done control — [ADR 0033](../../../docs/adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md).
 *
 * ⚠️ **`Z`'s target is read from the database, not from client memory** — the
 * most recent decision in the open run, which is the highest `vetted_at` in
 * `note_vetting` for this `vetting_session_id`. That is what lets the undo
 * survive a reload, and it is ADR 0028's and ADR 0014's rule for the third time:
 * the durable record decides.
 *
 * ⚠️ **It reverses an acceptance as well as a rejection, and that un-mints a
 * *card*.** `04` §9.1 says there is no path to delete a *card* anywhere in the
 * app or the worker; this is the one exception the section was amended to carry,
 * and the reason it is safe is that the *card* is provably historyless — a
 * *card* minted inside an open run cannot have been reviewed, because reaching
 * *Review* means leaving *Vet* and every exit from *Vet* ends the run.
 *
 * ⚠️ **The proof is not what the code relies on.** `review_session_card → card`
 * and `review_log → card` are both `RESTRICT` (`04` §9.1), so a *card* that
 * reached a snapshot in a second tab **cannot** be deleted: the database refuses
 * and `Z` fails with a message rather than tearing a hole in a *session*. That
 * refusal is caught here and surfaced as `reviewed` — `10` §4.8 renders it in
 * place of the footer legend, and **not on a timer**, because the reader's eyes
 * are on the *term*.
 *
 * ⚠️ **On the flag queue `Z` never deletes a *card*** (#20, ADR 0064 §6). A
 * keep, a fix or a drop acts on a *card* minted long before this run, usually
 * with a history; what `Z` reverses is the resolution — the flags it resolved
 * are reopened, a *card* it unsuspended is suspended again, and the *note* goes
 * back to `accepted` with no run, which puts it back on the queue. **The fields
 * and any *scheduling epoch* reset stay**, for the reason `edited` stays below:
 * the *note* is shared (`04` §4) and the undo is personal. ⚠️ **The reset stays
 * because the fields do.** It exists because the memorised text changed, and
 * the text is still changed; restoring the superseded epoch would schedule a
 * memory of a meaning the *note* no longer carries. The un-mint path is
 * still here, for a *pending* *note* accepted inside the run.
 *
 * ⚠️ **Which kind of decision it was is read from `card_flag`, not stored.**
 * `decide()` stamps `resolved_at` and `vetted_at` with the same transaction's
 * `now()`, so the flags a keystroke resolved are exactly the ones whose
 * `resolved_at` equals that *note*'s `vetted_at`. None means the decision was
 * an acceptance or a rejection of a *pending* *note*.
 */

import { and, desc, eq, isNotNull, isNull, min } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { findOpenRun } from './run'
import type { IngestDatabase } from '../ingest/record'

export type UndoOutcome
  = | { ok: true, noteId: string }
    | { ok: false, reason: 'nothing_to_undo' | 'reviewed' }

/**
 * ⚠️ **`restrict_violation`, and it is not `foreign_key_violation`.** Measured
 * 2026-09-12 against PGlite 0.5.8 (PostgreSQL 18.3): a `RESTRICT` refusal raises
 * **`23001`**, while `23503` is what a `NO ACTION` constraint raises when its
 * deferred check fails. `04` §9 spells every one of these rules `RESTRICT`, so
 * `23503` alone would have caught nothing — and the code path it guards is the
 * one ADR 0033 says the whole argument falls back on.
 *
 * Both are listed because the distinction is the constraint's spelling rather
 * than anything about this delete: a future `04` that writes `NO ACTION`
 * anywhere in the chain would raise the other one, and `Z` failing visibly is
 * the property, not which of the two arrived.
 */
const RESTRICT_REFUSALS = new Set(['23001', '23503'])

/**
 * ⚠️ **The chain is walked, because Drizzle wraps.** What arrives is a
 * `Failed query: delete from "card" …` whose own `code` is `undefined`; the
 * driver's error — the one carrying `23001` — is its `cause`. Reading `code` off
 * the top would have made this guard silently never match, and the symptom would
 * have been `Z` crashing the request instead of `10` §4.8's message.
 */
function isRestrictRefusal(error: unknown): boolean {
  for (let cursor = error; cursor instanceof Error || (typeof cursor === 'object' && cursor !== null);) {
    const { code, cause } = cursor as { code?: unknown, cause?: unknown }

    if (typeof code === 'string' && RESTRICT_REFUSALS.has(code))
      return true

    if (cause === undefined || cause === cursor)
      return false

    cursor = cause
  }

  return false
}

export async function undoLastDecision(
  db: IngestDatabase,
  ownerId: string,
): Promise<UndoOutcome> {
  try {
    return await db.transaction(async (tx): Promise<UndoOutcome> => {
      const run = await findOpenRun(tx, ownerId)

      // ⚠️ No open run is not an error. It is a reader who pressed `Z` on their
      // first *note*, or one whose run the idle sweep closed while they were
      // away — ADR 0033's "the undo is spent" seen from the keyboard.
      if (!run)
        return { ok: false, reason: 'nothing_to_undo' }

      const [last] = await tx
        .select({
          noteId: schema.noteVetting.noteId,
          state: schema.noteVetting.state,
          vettedAt: schema.noteVetting.vettedAt,
        })
        .from(schema.noteVetting)
        .where(
          and(
            eq(schema.noteVetting.ownerId, ownerId),
            eq(schema.noteVetting.vettingSessionId, run),
          ),
        )
        .orderBy(desc(schema.noteVetting.vettedAt))
        .limit(1)

      if (!last)
        return { ok: false, reason: 'nothing_to_undo' }

      if (await reopenResolvedFlags(tx, ownerId, last.noteId))
        return { ok: true, noteId: last.noteId }

      // ⚠️ **The delete comes first**, so a `RESTRICT` refusal aborts before the
      // *note* has been returned to *pending*. The other order leaves a reader
      // looking at a *note* they still own a *card* for.
      if (last.state === 'accepted') {
        await tx
          .delete(schema.card)
          .where(and(eq(schema.card.noteId, last.noteId), eq(schema.card.ownerId, ownerId)))
      }

      await tx
        .update(schema.noteVetting)
        .set({
          state: 'pending',
          secondsToVet: null,
          vettingSessionId: null,
          vettedAt: null,
          // ⚠️ **`edited` and `flagged_at` are deliberately left standing.** The
          // edit is in `note.fields` and was not undone (the *note* is shared —
          // `04` §4 — and this is a personal action), so a later acceptance of a
          // *note* the reader had to fix is still one `S6` should count; and the
          // `returned by a flag` aside is a fact about why the *note* is here,
          // not about the decision just reversed.
        })
        .where(
          and(
            eq(schema.noteVetting.noteId, last.noteId),
            eq(schema.noteVetting.ownerId, ownerId),
          ),
        )

      return { ok: true, noteId: last.noteId }
    })
  }
  catch (error) {
    if (isRestrictRefusal(error))
      return { ok: false, reason: 'reviewed' }

    throw error
  }
}

/**
 * Reverse a flag resolution, if the last decision was one.
 *
 * ⚠️ **The instant is compared in the database**, against the row's own
 * `vetted_at`, rather than round-tripped through a JS `Date`: a `timestamptz`
 * carries microseconds and a `Date` carries milliseconds, so the equality would
 * fail on almost every keystroke and `Z` would fall through to the un-mint.
 *
 * ⚠️ **The suspension is restored at the earliest reopened flag**, because the
 * instant a *card* left scheduling is a fact about its first flag (`04` §7.8)
 * and keep erased it. `suspended_at IS NULL` in the `WHERE` leaves a drop's
 * *card*, which never came back, exactly as it is.
 *
 * @returns `false` when nothing was resolved by the last decision, and nothing
 * was written.
 */
async function reopenResolvedFlags(
  tx: IngestDatabase,
  ownerId: string,
  noteId: string,
): Promise<boolean> {
  const resolvedByIt = and(
    eq(schema.cardFlag.noteId, noteId),
    eq(schema.cardFlag.ownerId, ownerId),
    isNotNull(schema.cardFlag.resolvedAt),
    eq(
      schema.cardFlag.resolvedAt,
      tx
        .select({ vettedAt: schema.noteVetting.vettedAt })
        .from(schema.noteVetting)
        .where(and(eq(schema.noteVetting.noteId, noteId), eq(schema.noteVetting.ownerId, ownerId))),
    ),
  )

  const [first] = await tx
    .select({ flaggedAt: min(schema.cardFlag.flaggedAt) })
    .from(schema.cardFlag)
    .where(resolvedByIt)

  if (!first?.flaggedAt)
    return false

  await tx
    .update(schema.cardFlag)
    .set({ resolvedAt: null })
    .where(resolvedByIt)

  await tx
    .update(schema.card)
    .set({ suspendedAt: first.flaggedAt, suspendedReason: 'flagged' })
    .where(
      and(
        eq(schema.card.noteId, noteId),
        eq(schema.card.ownerId, ownerId),
        isNull(schema.card.suspendedAt),
      ),
    )

  await tx
    .update(schema.noteVetting)
    .set({
      state: 'accepted',
      secondsToVet: null,
      vettingSessionId: null,
      // ⚠️ **Null, and that loses the instant the *note* was first accepted.**
      // The run is what `Z` walks back through, so the row has to leave it; the
      // alternative is a second column for a fact nothing reads.
      vettedAt: null,
    })
    .where(and(eq(schema.noteVetting.noteId, noteId), eq(schema.noteVetting.ownerId, ownerId)))

  return true
}
