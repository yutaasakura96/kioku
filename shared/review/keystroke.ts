/**
 * *Review*'s key map, as two pure functions over a keyboard event — the same
 * seam `shared/vet/keystroke.ts` is for the other *mode*.
 *
 * `space` reveal · `1`–`4` grade · `X` flag · `Esc` leave (ADR 0023, ADR 0034,
 * `09` §4.7).
 *
 * ⚠️ **`X` is live on both faces, and that is `10` §5.1 rather than a
 * convenience.** The front's legend carries it beside `space` and the back's
 * carries it under the four *grade* controls, because a *card* can be wrong in a
 * way the *term* alone already shows — a word that should never have become a
 * *card* is caught before the answer is read, and a reader who had to reveal
 * first would be answering it to report it.
 *
 * ⚠️ **The map depends on which face is showing, and that is the whole reason it
 * is a seam.** A *grade* is arithmetic that cannot be undone (ADR 0016, `03`
 * §2.4) — there is no `Z` on this screen, because `Z` belongs to *Vet* and `X`
 * is a flag rather than a correction — so a digit pressed while the *term* is
 * still face-down must do nothing at all. It is the one keystroke in the
 * application that would permanently record an answer to a question the reader
 * has not been shown.
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
 * (ADR 0025), and `11` §6.2 holds it with a behavioural proxy.
 */

import type { Grade } from './scheduler'
// ⚠️ **One shape, not two.** `Keystroke` is the readable half of a
// `KeyboardEvent` and #10 put it in the other *mode*'s map; a second copy here
// would be `04` §13's drift argument applied to a five-field interface. The
// import crosses a *mode* boundary and nothing else does — which is why it is
// the type and not a function.
import type { Keystroke } from '../vet/keystroke'

export type { Keystroke }

/** Which face of the *card* is showing (`10` §5.1). */
export type CardFace = 'front' | 'back'

export type ReviewAction
  = | { kind: 'reveal' }
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

export function reviewAction(event: Keystroke, face: CardFace): ReviewAction | null {
  if (modified(event))
    return null

  if (event.key === 'Escape')
    return { kind: 'leave' }

  // ⚠️ **`X` is not face-dependent and the four digits are.** A flag records
  // that the *card* is bad; it advances **without a *grade*** (`09` §4.9), so
  // unlike a digit it answers nothing about a question the reader has not been
  // shown. `04` §7.8 leaves *Review* history untouched, which is what makes it
  // safe on the front face.
  if (event.key === 'x' || event.key === 'X')
    return { kind: 'flag' }

  if (face === 'front')
    return event.key === ' ' ? { kind: 'reveal' } : null

  const pressed = GRADE_KEYS.find(entry => entry.key === event.key)

  if (!pressed)
    return null

  return { kind: 'grade', grade: pressed.grade }
}

/**
 * The end screen — ⚠️ **starting another *session* is one deliberate action and
 * never automatic** (`S7`, `09` §4.7 step 7). `space` is safe here because the
 * key before it was a digit: no reader arrives on this screen with it held down.
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
