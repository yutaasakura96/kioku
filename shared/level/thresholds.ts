/**
 * Every number behind *Your level*, the placement test and the spot-check —
 * [ADR 0079](../../docs/adr/0079-a-level-is-proved-and-placement-is-checked.md),
 * #72. One file, so that adjusting the rule is editing one line here and
 * reading the tests that fail.
 *
 * ⚠️ **None of these is measured.** #67 calls the 80 % and the fifty words a
 * proposal, and the spot-check's size one too; the rest are this ticket's.
 * Each is a constant so that moving it is one line.
 */

// -- The estimate -------------------------------------------------------------

/** A level is proved at this share of first-try answers right, or more. */
export const PROVED_RIGHT_SHARE = 0.8

/** …across at least this many of its words, answered in the window. */
export const PROVED_MIN_WORDS = 50

/** The window the answers are read from, in days. */
export const ESTIMATE_WINDOW_DAYS = 30

// -- The spot-check -----------------------------------------------------------

/** How many words of each level marked known are asked again in reviews. */
export const SPOT_CHECKS_PER_LEVEL = 10

/** How many of them come due a day, from the day after the placement. */
export const SPOT_CHECKS_PER_DAY = 2

/**
 * A level's spot-checks overrule the placement once this many have been
 * answered and fewer than `PROVED_RIGHT_SHARE` of them were right first try.
 */
export const SPOT_CHECKS_DECIDE_AFTER = 5

// -- The placement test -------------------------------------------------------

/** Words asked at each level: five levels of five is the issue's *about 25*. */
export const PLACEMENT_WORDS_PER_LEVEL = 5

/** Right answers out of `PLACEMENT_WORDS_PER_LEVEL` that pass a level. */
export const PLACEMENT_PASS_MARK = 4

/** Choices under each word, the right one among them. */
export const PLACEMENT_CHOICES = 4
