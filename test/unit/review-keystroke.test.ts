// *Review*'s key map — ADR 0060's typed answers, and ADR 0034's four digits.
//
// ⚠️ **The map is step-dependent and that is the point of testing it.** A
// *grade* is arithmetic that cannot be undone (ADR 0016, `03` §2.4), so a digit
// pressed before the reader has answered must do nothing at all — and once the
// front is a text field, a digit or an `x` typed there is an answer being
// written, not a command.

import { describe, expect, it } from 'vitest'

import { endScreenAction, fieldAction, reviewAction } from '../../shared/review/keystroke'

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

// ⚠️ `Enter` on the meaning field moves focus to the container, and a held key's
// auto-repeat follows focus. Without this a held `Enter` checks the meaning and
// commits a *grade* in one press.
describe('a held key is never an answer', () => {
  it('ignores a repeated Enter in a field and on the back', () => {
    expect(fieldAction(press('Enter', { repeat: true }))).toBeNull()
    expect(reviewAction(press('Enter', { repeat: true }), 'back', false)).toBeNull()
    expect(reviewAction(press('3', { repeat: true }), 'back', false)).toBeNull()
  })
})

describe('the front — two fields, and nothing grades', () => {
  // ⚠️ The assertion this file exists for.
  it.each(['reading', 'meaning'] as const)('ignores every command key on the %s step', (step) => {
    for (const key of ['1', '2', '3', '4', ' ', 'x', 'X', 'Enter']) {
      expect(reviewAction(press(key), step, true)).toBeNull()
      expect(reviewAction(press(key), step, false)).toBeNull()
    }
  })

  // ADR 0060 §7: `space` no longer reveals, because there is nothing to reveal
  // by hand.
  it('has no reveal', () => {
    expect(reviewAction(press(' '), 'reading', false)).toBeNull()
  })

  it.each(['reading', 'meaning', 'back'] as const)('leaves on Escape from the %s step, in a field or not', (step) => {
    expect(reviewAction(press('Escape'), step, true)).toEqual({ kind: 'leave' })
    expect(reviewAction(press('Escape'), step, false)).toEqual({ kind: 'leave' })
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
    expect(reviewAction(press('Escape', { isComposing: true }), 'reading', true)).toBeNull()
  })

  it.each([' ', '1', 'x', 'a', 'Tab'])('leaves %j to the field', (key) => {
    expect(fieldAction(press(key))).toBeNull()
  })
})

describe('the back — the proposal, four grades, and the flag', () => {
  it('commits the proposal on Enter', () => {
    expect(reviewAction(press('Enter'), 'back', false)).toEqual({ kind: 'commit' })
  })

  it.each([
    ['1', 1],
    ['2', 2],
    ['3', 3],
    ['4', 4],
  ] as const)('%s grades %i, whatever was proposed', (key, grade) => {
    expect(reviewAction(press(key), 'back', false)).toEqual({ kind: 'grade', grade })
  })

  it('flags on X', () => {
    expect(reviewAction(press('x'), 'back', false)).toEqual({ kind: 'flag' })
    expect(reviewAction(press('X', { shiftKey: true }), 'back', false)).toEqual({ kind: 'flag' })
  })

  it.each([' ', '5', '0', 'z', 'Z', 'ArrowRight'])('ignores %j', (key) => {
    expect(reviewAction(press(key), 'back', false)).toBeNull()
  })

  // ⚠️ The container ignores events whose target is a field (ADR 0060 §7).
  it('ignores a field-targeted event even on the back', () => {
    expect(reviewAction(press('3'), 'back', true)).toBeNull()
    expect(reviewAction(press('Enter'), 'back', true)).toBeNull()
  })
})

// ⚠️ `09` §4.7 step 7: starting another *session* is **one deliberate action and
// never automatic**.
describe('the end screen — one deliberate action', () => {
  it('starts another session on space', () => {
    expect(endScreenAction(press(' '))).toBe('start')
  })

  it('leaves on Escape', () => {
    expect(endScreenAction(press('Escape'))).toBe('leave')
  })

  it.each(['1', '2', '3', '4', 'Enter'])('ignores %s', (key) => {
    expect(endScreenAction(press(key))).toBeNull()
  })
})

// The same rule as ADR 0023's map on *Vet*: `Ctrl`+`R` is a reload and `Cmd`+`1`
// switches a browser tab. A map that answered either would take a keystroke away
// from the reader's browser — and on this screen it would also record a grade.
describe('a modified key is never ours', () => {
  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('answers nothing while %s is held', (modifier) => {
    for (const key of [' ', '1', '2', '3', '4', 'x', 'Enter', 'Escape']) {
      expect(reviewAction(press(key, { [modifier]: true }), 'back', false)).toBeNull()
      expect(reviewAction(press(key, { [modifier]: true }), 'reading', true)).toBeNull()
      expect(fieldAction(press(key, { [modifier]: true }))).toBeNull()
      expect(endScreenAction(press(key, { [modifier]: true }))).toBeNull()
    }
  })
})
