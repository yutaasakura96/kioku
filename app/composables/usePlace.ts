import { FALLBACK_ZONE } from '#shared/time/local-day'

/**
 * What a *place* reads, in one call.
 *
 * ⚠️ **The three *places* read from the request event, not from a fetch** —
 * `server/middleware/shell-data.ts` carries that argument, and
 * `app/pages/auth/index.vue` set the idiom in #5. This is the shape of it, so
 * that four pages do not each repeat the same three lines and then disagree
 * about the fallback.
 *
 * ⚠️ **The fallback is the empty state, not a crash.** `useRequestEvent()`
 * returns `undefined` anywhere but a server render, and `context.place` is
 * absent when no session resolved. Both mean *this reader has nothing to show*,
 * which every *place* already has a written screen for (PRD §4, `09` §8).
 */
export function usePlace() {
  return useRequestEvent()?.context.place
}

/**
 * The start block's three figures — `10` §3.2 (the third, `· N new`, since #33).
 *
 * ⚠️ Zero is a number, never a disabled control (ADR 0032, ADR 0035): a zero on
 * Vet is how the reader reaches the line saying nothing is flagged, and a zero on
 * Review is how they reach the line saying when the next *card* is due.
 */
export async function useStartBlockCounts() {
  return (await usePlace()?.counts()) ?? { flagged: 0, due: 0, newToday: 0 }
}

/**
 * The reader's zone, for a screen that ships no JavaScript and so cannot ask
 * the browser (ADR 0020). UTC when there is no *place* or no reported zone.
 */
export async function useReaderZone() {
  return (await usePlace()?.zone()) ?? FALLBACK_ZONE
}
