/**
 * *Acceptance rate* — `S10`'s first number, as arithmetic over counts.
 *
 * > **acceptance rate** — cards accepted with no edit ÷ cards generated
 * > (`01` §5, and it is the sentence the project exists to answer)
 *
 * ⚠️ **This is a seam because `11` §3 calls it the most likely error in the app
 * and the one that would flatter the thesis** — and both ways of getting it
 * wrong bias it the same direction, up. An edited accept counted as an
 * acceptance (`S6` says it is an edit) and a denominator of *notes the reader
 * has seen* rather than *notes generated* each turn a run the pipeline did badly
 * on into a run that looks fine. There is nothing to observe in the failure: the
 * number is plausible, it is just wrong, and it is wrong in the direction
 * nobody checks.
 *
 * ⚠️ **`11` §8's "metric arithmetic" seam is split, and this is #11's half.**
 * #11 owns *acceptance rate* because it is #11's own acceptance criterion; the
 * other three numbers of `11` §3 — median *seconds-per-note*, *false-accept
 * rate*, *time-to-first-review* — are Stats', which is #14. **What is not here
 * is the query.** These are counts; where they come from is `note_vetting`, and
 * reading them is #14's.
 *
 * ⚠️ **`S10`'s suppression boundary is not here either, and it is not a count
 * this file has.** Below **twenty *vetted* notes** the ratios are suppressed —
 * *vetted*, not *generated*, so a hundred *pending notes* and nineteen decisions
 * is still suppressed, because what is thin is the evidence rather than the
 * corpus. The branch governs all four of `S10`'s ratios at once and belongs
 * where they are rendered together (#14).
 *
 * ⚠️ **No threshold, ever** (ADR 0037, ADR 0018). ADR 0018 walks the model
 * *down* until *acceptance rate* degrades, so a test that fails when the number
 * falls turns the experiment into a regression. What is tested is the
 * arithmetic.
 */

/**
 * One reader's *notes*, in the four states `note_vetting` can be in — three
 * states and the `edited` flag splitting one of them.
 *
 * ⚠️ **`acceptedWithEdit` is a state here and a boolean column there.** `04`
 * §7.2 stores `state = 'accepted'` with `edited = true`; the split is done at
 * the read because it is the split the number is about.
 */
export interface VettingCounts {
  /** `state = 'accepted' AND NOT edited` — the numerator, and the only one. */
  acceptedUnedited: number
  /** `state = 'accepted' AND edited` — `S6`: an **edit**, not an acceptance. */
  acceptedWithEdit: number
  rejected: number
  /** Generated and not yet judged. **In the denominator** — see below. */
  pending: number
}

/**
 * The denominator: every *note* the pipeline produced for this reader.
 *
 * ⚠️ **`pending` is in it.** *Cards generated*, not *cards seen* — a *pending
 * note* is a *note* the pipeline wrote and spent money on, and leaving it out
 * would score a run abandoned after its six good *notes* at a hundred percent.
 */
export function notesGenerated(counts: VettingCounts): number {
  return counts.acceptedUnedited + counts.acceptedWithEdit + counts.rejected + counts.pending
}

/**
 * *Acceptance rate*, as a fraction of one.
 *
 * @returns `null` when nothing has been generated. ⚠️ **Not zero** — zero is a
 * claim about a pipeline that produced nothing usable, and a reader who has not
 * pasted anything yet would read it as one.
 */
export function acceptanceRate(counts: VettingCounts): number | null {
  const generated = notesGenerated(counts)

  if (generated === 0)
    return null

  return counts.acceptedUnedited / generated
}
