// ADR 0023's key map, as a function — `11` §8's seam list gains one, and the
// reason it earns a place there is not that the map is hard.
//
// ⚠️ **The modifier rule is the part that is worth a test.** `10` §4.1: the map
// is all printable characters, so **SC 2.1.4 Character Key Shortcuts (Level A)**
// applies and the application passes only through the criterion's "active only
// on focus" exception. The other half of not breaking a keyboard is that a
// **modified** key is never ours: `Ctrl`+`R` reloads, `Cmd`+`Z` is the browser's
// undo in a text field, and a map that answered `reject` to `Ctrl`+`R` would
// take a reload away from the reader and reject a *note* instead.
//
// The container binding itself is not assertable — `11` §6.2 says so and gives
// the behavioural proxy that replaces it, which is `test/e2e/vet.test.ts`.

import { describe, expect, it } from 'vitest'

import { confirmationAction, editAction, vetAction } from '../../shared/vet/keystroke'

/** The shape both handlers read — a `KeyboardEvent` without needing a DOM. */
function press(key: string, modifiers: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  }
}

describe('vetAction — ADR 0023, the three outcomes and the way out', () => {
  it.each([
    [' ', 'accept'],
    ['e', 'edit'],
    ['r', 'reject'],
    ['z', 'undo'],
    ['Escape', 'leave'],
  ] as const)('%s is %s', (key, action) => {
    expect(vetAction(press(key))).toBe(action)
  })

  // `event.key` for a shifted letter *is* the capital, so the map has to carry
  // both cases or `R` — which is how the legend spells it — does nothing.
  it.each([['E', 'edit'], ['R', 'reject'], ['Z', 'undo']] as const)('%s is %s', (key, action) => {
    expect(vetAction(press(key, { shiftKey: true }))).toBe(action)
  })

  it('answers nothing to a key the map does not carry', () => {
    for (const key of ['a', 'x', '1', 'Enter', 'Tab', 'ArrowDown', 'F5'])
      expect(vetAction(press(key))).toBeNull()
  })

  // ⚠️ The reason this is a seam. `Ctrl`+`R` is a reload and `Cmd`+`Z` is the
  // platform undo; either one answered here is a keystroke stolen from the
  // browser, and the map is otherwise all printable characters.
  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('answers nothing while %s is held', (modifier) => {
    for (const key of [' ', 'e', 'r', 'z', 'Escape'])
      expect(vetAction(press(key, { [modifier]: true }))).toBeNull()
  })
})

describe('editAction — `09` §4.3, and the one contextual `Esc` in the application', () => {
  it('commits on Enter, whatever is held with it short of a modifier', () => {
    expect(editAction(press('Enter'))).toBe('commit')
    // `10` §4.4: the field wraps and **no key inserts a line break**, so the
    // usual escape hatch is not one here.
    expect(editAction(press('Enter', { shiftKey: true }))).toBe('commit')
  })

  it('cancels on Escape — which leaves the mode when no edit is open', () => {
    expect(editAction(press('Escape'))).toBe('cancel')
    expect(vetAction(press('Escape'))).toBe('leave')
  })

  it('cycles the fields on Tab, in both directions', () => {
    expect(editAction(press('Tab'))).toBe('next')
    expect(editAction(press('Tab', { shiftKey: true }))).toBe('previous')
  })

  it('answers nothing to the letters that act outside an edit', () => {
    for (const key of [' ', 'e', 'r', 'z'])
      expect(editAction(press(key))).toBeNull()
  })

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('answers nothing while %s is held', (modifier) => {
    for (const key of ['Enter', 'Escape', 'Tab'])
      expect(editAction(press(key, { [modifier]: true }))).toBeNull()
  })
})

describe('confirmationAction — ADR 0033, answered from the keyboard', () => {
  it('ends the run on space and goes back on Z', () => {
    expect(confirmationAction(press(' '))).toBe('end')
    expect(confirmationAction(press('z'))).toBe('back')
    expect(confirmationAction(press('Z', { shiftKey: true }))).toBe('back')
  })

  // ⚠️ `Esc` is deliberately not an answer. It is the key that *asked* the
  // question (ADR 0033 gives Done and `Esc` the same effect), and answering it
  // with itself would make one press open the question and the next dismiss it
  // — which is the reflexive dismissal ADR 0033 refused the dialog over.
  it('answers nothing to Escape, or to the keys that act on a note', () => {
    for (const key of ['Escape', 'e', 'r', 'Enter'])
      expect(confirmationAction(press(key))).toBeNull()
  })
})
