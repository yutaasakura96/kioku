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
 * The start block's two figures — `10` §3.2.
 *
 * ⚠️ Zero is a number, never a disabled control (ADR 0032, ADR 0035): a zero on
 * Vet is how the reader finds out an *ingestion* is still running, and a zero on
 * Review is how they reach the line saying when the next *card* is due.
 */
export async function useStartBlockCounts() {
  return (await usePlace()?.counts()) ?? { pending: 0, due: 0 }
}

/**
 * ⚠️ **One formatter, so two screens cannot render the same instant two ways.**
 * `09` §2 stamps every figure in the *shell* "as of this page load"; two
 * spellings of the same timestamp would make one of those stamps read as a
 * different page load.
 */
export const submittedAtFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
