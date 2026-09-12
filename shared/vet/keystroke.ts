/**
 * [ADR 0023](../../docs/adr/0023-space-is-the-forward-action-and-z-is-the-confirm.md)'s
 * key map, as three pure functions over a keyboard event.
 *
 * `space` accept · `E` edit · `R` reject · `Z` undo · `Esc` leave. Inside an
 * edit the map is a different one — `Enter` commits **and accepts**, `Esc`
 * cancels, `Tab` cycles the three *judgement fields* (`09` §4.3) — and on the
 * run-end confirmation it is a third, two keys wide (ADR 0033).
 *
 * ⚠️ **A modified key is never ours.** `10` §4.1 records that the map is all
 * printable characters, which is what puts the application under **SC 2.1.4
 * Character Key Shortcuts (Level A)** and leaves it conformant only through the
 * criterion's "active only on focus" exception. The other half of not breaking a
 * keyboard is this rule: `Ctrl`+`R` is a reload and `Cmd`+`Z` is the platform's
 * own undo, and a map that answered `reject` to the first would take the reload
 * away *and* reject a *note*.
 *
 * ⚠️ **`Shift` is not a modifier for this purpose**, because it is how a capital
 * is typed at all: `event.key` for shift-and-`r` is `R`, which is how the footer
 * legend spells it.
 *
 * Where the handler is *bound* is the other half of §4.1 and is not decidable
 * here — it is the *mode* container, never `document` or `window`, and `11` §6.2
 * holds it with a behavioural proxy rather than an assertion about a listener.
 */

/** The three outcomes, and the way out. */
export type VetAction = 'accept' | 'edit' | 'reject' | 'undo' | 'leave'

/** Inside an edit — `09` §4.3's table. */
export type EditAction = 'commit' | 'cancel' | 'next' | 'previous'

/** On the run-end confirmation — ADR 0033's two keys. */
export type ConfirmationAction = 'end' | 'back'

/**
 * Only the parts of a `KeyboardEvent` the map reads, so the seam is testable
 * without a DOM and cannot quietly start depending on the event's target.
 */
export interface Keystroke {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

function modified(event: Keystroke): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

export function vetAction(event: Keystroke): VetAction | null {
  if (modified(event))
    return null

  switch (event.key) {
    case ' ': return 'accept'
    case 'e': case 'E': return 'edit'
    case 'r': case 'R': return 'reject'
    case 'z': case 'Z': return 'undo'
    case 'Escape': return 'leave'
    default: return null
  }
}

export function editAction(event: Keystroke): EditAction | null {
  if (modified(event))
    return null

  switch (event.key) {
    // ⚠️ `10` §4.4: the field wraps and **never accepts a newline**, so
    // `Shift`+`Enter` is not an escape hatch here — there is nothing for it to
    // insert.
    case 'Enter': return 'commit'
    case 'Escape': return 'cancel'
    case 'Tab': return event.shiftKey ? 'previous' : 'next'
    default: return null
  }
}

export function confirmationAction(event: Keystroke): ConfirmationAction | null {
  if (modified(event))
    return null

  switch (event.key) {
    case ' ': return 'end'
    case 'z': case 'Z': return 'back'
    // ⚠️ `Esc` is deliberately absent. It is one of the two keys that *asks* the
    // question (ADR 0033 gives Done and `Esc` the same effect), and letting it
    // also answer would make the second press of one key dismiss the screen the
    // first press opened — the reflexive dismissal the dialog exists to avoid.
    default: return null
  }
}
