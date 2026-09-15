/**
 * *Review*'s key map, as pure functions over a keyboard event — the same seam
 * `shared/vet/keystroke.ts` is for the other *mode*.
 *
 * ⚠️ **Amended 2026-09-15 by
 * [ADR 0060](../../docs/adr/0060-review-is-answered-by-typing-and-the-check-proposes-the-grade.md):
 * *Review* is answered by typing.** The front is two steps, the reading and then
 * the meaning, each a text field whose `Enter` checks it. The back carries both
 * results and the four *grades* with one **proposed**: `Enter` commits the
 * proposal, `1`–`4` commit any *grade*, `X` flags. `space` no longer reveals,
 * because there is nothing left to reveal by hand. `Esc` leaves from anywhere.
 *
 * ⚠️ **The map depends on the step, and that is the whole reason it is a seam.**
 * A *grade* is arithmetic that cannot be undone (ADR 0016, `03` §2.4), so a digit
 * pressed before the reader has answered must do nothing at all. While a field
 * has focus a digit is typing, not a command.
 *
 * ⚠️ **`X` is on the back only** (ADR 0060 §7). It was on both faces while the
 * front was the *term* alone; now the front is a text field, and an `x` there is
 * the first letter of a meaning.
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

/** Where the reader is on one *card* (ADR 0060 §2). */
export type ReviewStep = 'reading' | 'meaning' | 'back'

export type ReviewAction
  = | { kind: 'commit' }
    | { kind: 'grade', grade: Grade }
    | { kind: 'flag' }
    | { kind: 'leave' }

/** ADR 0034: the labels name recall, because this configuration cannot name a time. */
export const GRADE_KEYS: { key: string, grade: Grade, label: string }[] = [
  // ⚠️ **`Again` does not survive.** With `enable_short_term: false` the soonest
  // a graded *card* returns is tomorrow, so `Again` would promise a same-day
  // return this configuration cannot make (verification §13.1). `Forgot` names
  // the lapse the library itself counts.
  { key: '1', grade: 1, label: 'Forgot' },
  { key: '2', grade: 2, label: 'Hard' },
  { key: '3', grade: 3, label: 'Good' },
  { key: '4', grade: 4, label: 'Easy' },
]

function modified(event: Keystroke): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

/**
 * The mode container's map.
 *
 * @param fromField the event's target is one of the two answer fields. ⚠️ **The
 * container ignores those** (ADR 0060 §7) — `space`, `x` and the digits are
 * typing — except `Esc`, which leaves from anywhere.
 */
export function reviewAction(event: ReviewKeystroke, step: ReviewStep, fromField: boolean): ReviewAction | null {
  if (modified(event) || event.isComposing)
    return null

  if (event.key === 'Escape')
    return { kind: 'leave' }

  if (fromField || step !== 'back' || event.repeat)
    return null

  // ⚠️ **`Enter` commits the proposal and never checks again.** The results are
  // already on the back; a second `Enter` from the meaning field that fell
  // through to here would grade a *card* the reader has not yet looked at, which
  // is why the page moves focus to the container only after the back renders.
  if (event.key === 'Enter')
    return { kind: 'commit' }

  if (event.key === 'x' || event.key === 'X')
    return { kind: 'flag' }

  const pressed = GRADE_KEYS.find(entry => entry.key === event.key)

  if (!pressed)
    return null

  return { kind: 'grade', grade: pressed.grade }
}

/** An answer field's own map: `Enter` checks what was typed, and nothing else is ours. */
export function fieldAction(event: ReviewKeystroke): 'check' | null {
  if (modified(event) || event.isComposing || event.repeat)
    return null

  return event.key === 'Enter' ? 'check' : null
}

/**
 * The end screen — ⚠️ **starting another *session* is one deliberate action and
 * never automatic** (`S7`, `09` §4.7 step 7). `space` is safe here because the
 * key before it was a digit or `Enter` on the back: no reader arrives on this
 * screen with it held down.
 */
export function endScreenAction(event: Keystroke): 'start' | 'leave' | null {
  if (modified(event))
    return null

  switch (event.key) {
    case ' ': return 'start'
    case 'Escape': return 'leave'
    default: return null
  }
}
