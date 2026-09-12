/**
 * Done, and `Esc` — `04` §7.1's `ended_at`, which is what makes every
 * *rejection* in the run permanent (ADR 0006, ADR 0033).
 *
 * ⚠️ **A `POST`, and never a `GET` on the way out.** `10` §6.2's resume control
 * carries the same argument for the same reason: a `GET` that writes is actioned
 * by a prefetch or a back button, and this one would end a run the reader is
 * still in.
 *
 * ⚠️ **It is fired without being awaited when the run holds no rejections**, and
 * that is safe rather than sloppy: the only thing `ended_at` decides is whether
 * a *rejection* can still be reversed, so a run with none loses nothing if the
 * request never lands — and `04` §7.1's idle sweep closes it half an hour later
 * anyway. The run that *does* hold rejections goes through `10` §4.6's
 * confirmation, which waits for this before it navigates.
 */
import { endOpenRun } from '../../utils/vet/run'
import { requireOwnerId } from '../../utils/reader'
import { useDatabase } from '../../db'

export default defineEventHandler(async (event) => {
  await endOpenRun(useDatabase(), requireOwnerId(event))

  return { ended: true }
})
