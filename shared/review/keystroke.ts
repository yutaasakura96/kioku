/**
 * *Review*'s key map, as pure functions over a keyboard event — the same seam
 * `shared/vet/keystroke.ts` is for the other *mode*.
 *
 * ⚠️ **Rewritten 2026-10-12 for
 * [ADR 0076](../../docs/adr/0076-new-words-are-taught-in-a-lesson-and-a-miss-is-asked-again.md).**
 * The quiz is one question at a time: a text field whose `Enter` checks it, and
 * then the result, where `Enter` is the *Next* control's own and `X` flags the
 * word. **No key commits a *grade* and none changes a result** — the *grade* is
 * what the answers were (ADR 0069 §1), and `S`, which added a synonym from #28
 * until #70, is gone with the override it was (ADR 0076 §5). `Esc` is the
 * screen's one way out from anywhere.
 *
 * ⚠️ **The map depends on the step, and that is the whole reason it is a seam.**
 * While a field has focus every printable key is typing, not a command.
 *
 * ⚠️ **`X` is on the result only** (ADR 0060 §7). While the question is open
 * the focus is in a text field, and an `x` there is a letter of a meaning.
 *
 * ⚠️ **Grades are given by key or by pointer and never by swipe**
 * ([ADR 0036](../../docs/adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md)).
 * SC 2.5.1 Pointer Gestures is Level A, so a path-based gesture owes a
 * single-pointer equivalent — which is the four controls it was meant to
 * replace. Swipe could only ever have been additive, so there is no touch path
 * here and none in the page.
 *
 * ⚠️ **Where the handler is bound is the other half of `10` §4.1 and is not
 * decidable here** — it is the *mode* container, never `document` or `window`
 * (ADR 0025), and `11` §6.2 holds it with a behavioural proxy. Whether the event
 * came from a field is passed in rather than read off the event, so the seam
 * still cannot quietly start depending on a DOM target.
 */

import type { Grade } from './scheduler'
// ⚠️ **One shape, not two.** `Keystroke` is the readable half of a
// `KeyboardEvent` and #10 put it in the other *mode*'s map; a second copy here
// would be `04` §13's drift argument applied to a five-field interface. The
// import crosses a *mode* boundary and nothing else does — which is why it is
// the type and not a function.
import type { Keystroke } from '../vet/keystroke'

export type { Keystroke }

/**
 * `Keystroke` plus the one flag a text field adds. ⚠️ **A system IME uses
 * `Enter` to finish a conversion** (ADR 0060 §7), so an `Enter` while composing
 * belongs to the IME and never to this map.
 */
export interface ReviewKeystroke extends Keystroke {
  isComposing: boolean
  /**
   * ⚠️ **A held key is never an answer.** `Enter` on the meaning field moves
   * focus to the container, and the browser sends the auto-repeat of the same
   * held key to wherever focus now is — which would commit a *grade* for a back
   * the reader has not seen.
   */
  repeat: boolean
}

/** Where the reader is on one question (ADR 0076 §3): typing, or reading the result. */
export type ReviewStep = 'asking' | 'result'

export type ReviewAction
  = | { kind: 'flag' }
    | { kind: 'exit' }

/**
 * ADR 0034: the labels name recall, because this configuration cannot name a
 * time. ⚠️ **Four labels for two *grades* the check gives** (ADR 0069 §1): the
 * back names the one it will commit, and `/stats` and the tally still read
 * whatever `review_log` holds, including the Hard and Easy given before #28.
 */
export const GRADE_LABELS: Record<Grade, string> = {
  // ⚠️ **`Again` does not survive.** With `enable_short_term: false` the soonest
  // a graded *card* returns is tomorrow, so `Again` would promise a same-day
  // return this configuration cannot make (verification §13.1). `Forgot` names
  // the lapse the library itself counts.
  1: 'Forgot',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
}

function modified(event: Keystroke): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

/**
 * The mode container's map, in the quiz.
 *
 * @param fromField the event's target is the answer field. ⚠️ **The container
 * ignores those** (ADR 0060 §7) — every printable key is typing — except `Esc`,
 * which is the way out from anywhere. In the quiz that is *Finish early*
 * (ADR 0076 §6); what it does is the page's.
 */
export function reviewAction(event: ReviewKeystroke, step: ReviewStep, fromField: boolean): ReviewAction | null {
  if (modified(event) || event.isComposing)
    return null

  if (event.key === 'Escape')
    return { kind: 'exit' }

  if (fromField || step !== 'result' || event.repeat)
    return null

  if (event.key === 'x' || event.key === 'X')
    return { kind: 'flag' }

  // ⚠️ **Nothing else is in the map** (ADR 0069 §1, ADR 0076 §5). `Enter` on
  // the result is the *Next* control's own activation; a digit or an `S` is
  // nothing, rather than a *grade* or a pass the check did not give.
  return null
}

/** An answer field's own map: `Enter` checks what was typed, and nothing else is ours. */
export function fieldAction(event: ReviewKeystroke): 'check' | null {
  if (modified(event) || event.isComposing || event.repeat)
    return null

  return event.key === 'Enter' ? 'check' : null
}

/**
 * A held `Enter` must not answer twice. ⚠️ `Enter` on the field moves focus to
 * the *Next* control, and the browser sends the auto-repeat of the same held
 * key to wherever focus now is — which would skip a result the reader has not
 * read. The control asks this before it lets a key activate it.
 */
export function isHeldActivation(event: Keystroke & { repeat: boolean }): boolean {
  return event.repeat && (event.key === 'Enter' || event.key === ' ')
}

/**
 * Every screen of the *mode* that is not a question: the screen before a run,
 * a lesson's teaching and the summary. ⚠️ **Starting a run is a control and
 * never a key** (`S7`: one deliberate action, never automatic), so `Esc` is the
 * only key here.
 */
export function restingAction(event: Keystroke): 'leave' | null {
  if (modified(event))
    return null

  return event.key === 'Escape' ? 'leave' : null
}
