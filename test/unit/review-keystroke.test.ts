// *Review*'s key map — ADR 0060's typed answers as ADR 0069 and ADR 0076 left
// them: the check is the *grade*, and nothing the reader can press changes it.
//
// ⚠️ **The map is step-dependent and that is the point of testing it.** A
// *grade* is arithmetic that cannot be undone (ADR 0016, `03` §2.4), so no key
// may reach one — and while a question is open the field is a text field, where
// an `x` is an answer being written, not a command.

import { describe, expect, it } from 'vitest'

import { fieldAction, isHeldActivation, restingAction, reviewAction } from '../../shared/review/keystroke'

type Modifier = 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'repeat'

function press(key: string, modifiers: Partial<Record<Modifier, boolean>> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    ...modifiers,
  }
}

// ⚠️ `Enter` on *Check* moves focus to *Next*, and a held key's auto-repeat
// follows focus. Without this a held `Enter` checks an answer and skips the
// result in one press.
describe('a held key is never an answer', () => {
  it('ignores a repeated Enter in a field', () => {
    expect(fieldAction(press('Enter', { repeat: true }))).toBeNull()
  })

  it('ignores a repeated X on the result', () => {
    expect(reviewAction(press('x', { repeat: true }), 'result', false)).toBeNull()
  })

  it.each(['Enter', ' '])('calls a repeated %j a held activation, for the page to swallow', (key) => {
    expect(isHeldActivation(press(key, { repeat: true }))).toBe(true)
    expect(isHeldActivation(press(key))).toBe(false)
  })

  it('does not call a repeated letter one', () => {
    expect(isHeldActivation(press('a', { repeat: true }))).toBe(false)
  })
})

describe('while a question is open — a field, and no commands', () => {
  // ⚠️ The assertion this file exists for.
  it('ignores every command key, in the field or out of it', () => {
    for (const key of ['1', '2', '3', '4', ' ', 'x', 'X', 's', 'S', 'Enter']) {
      expect(reviewAction(press(key), 'asking', true)).toBeNull()
      expect(reviewAction(press(key), 'asking', false)).toBeNull()
    }
  })

  // ADR 0076 §6: in the quiz the exit ends the run, and `Esc` is that exit.
  it.each(['asking', 'result'] as const)('exits on Escape from the %s step, in a field or not', (step) => {
    expect(reviewAction(press('Escape'), step, true)).toEqual({ kind: 'exit' })
    expect(reviewAction(press('Escape'), step, false)).toEqual({ kind: 'exit' })
  })
})

describe('a field checks on Enter', () => {
  it('checks on Enter', () => {
    expect(fieldAction(press('Enter'))).toBe('check')
  })

  // ⚠️ ADR 0060 §7: a system IME finishes its conversion with `Enter`. Checking
  // there would submit half a word.
  it('ignores Enter while an IME is composing', () => {
    expect(fieldAction(press('Enter', { isComposing: true }))).toBeNull()
    expect(reviewAction(press('Escape', { isComposing: true }), 'asking', true)).toBeNull()
  })

  it.each([' ', '1', 'x', 'a', 'Tab'])('leaves %j to the field', (key) => {
    expect(fieldAction(press(key))).toBeNull()
  })
})

describe('the result — the flag, and nothing that changes the answer', () => {
  it('flags on X', () => {
    expect(reviewAction(press('x'), 'result', false)).toEqual({ kind: 'flag' })
    expect(reviewAction(press('X', { shiftKey: true }), 'result', false)).toEqual({ kind: 'flag' })
  })

  // ⚠️ ADR 0069 §1 and ADR 0076 §5: **the assertion the override's removal
  // rests on.** No digit reaches a *grade*, and `S` no longer adds a synonym.
  it.each(['1', '2', '3', '4', 's', 'S'])('does nothing on %s', (key) => {
    expect(reviewAction(press(key), 'result', false)).toBeNull()
  })

  // `Enter` is the *Next* control's own activation, not a key in this map.
  it.each(['Enter', ' ', '5', '0', 'z', 'Z', 'ArrowRight'])('ignores %j', (key) => {
    expect(reviewAction(press(key), 'result', false)).toBeNull()
  })

  // ⚠️ The container ignores events whose target is a field (ADR 0060 §7).
  it('ignores a field-targeted X even on the result', () => {
    expect(reviewAction(press('x'), 'result', true)).toBeNull()
  })
})

// The screens with no question on them — what is waiting, a lesson's teaching,
// the summary. ⚠️ `09` §4.7 step 7: starting a run is **one deliberate action
// and never automatic**, so no key here starts one; the controls do.
describe('a screen at rest — Escape leaves, and nothing else is a key', () => {
  it('leaves on Escape', () => {
    expect(restingAction(press('Escape'))).toBe('leave')
  })

  it.each([' ', '1', '2', '3', '4', 'Enter', 'x', 's'])('ignores %j', (key) => {
    expect(restingAction(press(key))).toBeNull()
  })
})

// The same rule as ADR 0023's map on *Vet*: `Ctrl`+`R` is a reload and `Cmd`+`1`
// switches a browser tab. A map that answered either would take a keystroke away
// from the reader's browser.
describe('a modified key is never ours', () => {
  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('answers nothing while %s is held', (modifier) => {
    for (const key of [' ', '1', '2', '3', '4', 'x', 'Enter', 'Escape']) {
      expect(reviewAction(press(key, { [modifier]: true }), 'result', false)).toBeNull()
      expect(reviewAction(press(key, { [modifier]: true }), 'asking', true)).toBeNull()
      expect(fieldAction(press(key, { [modifier]: true }))).toBeNull()
      expect(restingAction(press(key, { [modifier]: true }))).toBeNull()
    }
  })
})
