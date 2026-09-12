// *Review*'s key map — ADR 0023's `space`-is-forward rule on the other *mode*,
// and ADR 0034's four digits.
//
// ⚠️ **The map is face-dependent and that is the point of testing it.** A
// *grade* is arithmetic that cannot be undone (ADR 0016, `03` §2.4) — there is
// no `Z` here, because `Z` is *Vet*'s key and `X` is a flag rather than a
// correction — so a digit pressed while the *term* is still face-down must do
// nothing at all. It is the one keystroke in the application that would
// permanently record an answer to a question the reader has not been shown.

import { describe, expect, it } from 'vitest'

import { endScreenAction, reviewAction } from '../../shared/review/keystroke'

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

describe('the front — `space` reveals, and nothing grades', () => {
  it('reveals on space', () => {
    expect(reviewAction(press(' '), 'front')).toEqual({ kind: 'reveal' })
  })

  it('leaves on Escape', () => {
    expect(reviewAction(press('Escape'), 'front')).toEqual({ kind: 'leave' })
  })

  // ⚠️ The assertion this file exists for.
  it.each(['1', '2', '3', '4'])('ignores %s, because the answer is still face-down', (key) => {
    expect(reviewAction(press(key), 'front')).toBeNull()
  })
})

describe('the back — four grades, and no fifth way forward', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    ['3', 3],
    ['4', 4],
  ] as const)('%s grades %i', (key, grade) => {
    expect(reviewAction(press(key), 'back')).toEqual({ kind: 'grade', grade })
  })

  it('leaves on Escape', () => {
    expect(reviewAction(press('Escape'), 'back')).toEqual({ kind: 'leave' })
  })

  // `10` §5.1: the back's footer holds the four grade controls and nothing
  // else. A `space` that advanced would be a fifth answer with no value behind
  // it — and it is the key the reader's thumb is already on.
  it('does nothing on space, which has already done its job', () => {
    expect(reviewAction(press(' '), 'back')).toBeNull()
  })

  it.each(['5', '0', 'z', 'Z', 'Enter', 'ArrowRight'])('ignores %s', (key) => {
    expect(reviewAction(press(key), 'back')).toBeNull()
  })
})

// ⚠️ `09` §4.7 step 7: starting another *session* is **one deliberate action and
// never automatic**, and `space` is safe here "because the key before it was a
// digit" — the reader cannot arrive on this screen with `space` held down.
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
    for (const key of [' ', '1', '2', '3', '4', 'Escape']) {
      expect(reviewAction(press(key, { [modifier]: true }), 'front')).toBeNull()
      expect(reviewAction(press(key, { [modifier]: true }), 'back')).toBeNull()
      expect(endScreenAction(press(key, { [modifier]: true }))).toBeNull()
    }
  })
})

// ⚠️ **`S9`'s `X`, and the reason it is not face-dependent.** A digit answers a
// question; `X` reports that the question should not have been asked — it
// advances **without a *grade*** and leaves *Review* history untouched (`09`
// §4.9, `04` §7.8), so a *card* that is wrong in a way the *term* alone shows is
// caught before the answer is read. `10` §5.1 puts its legend line on both
// faces, which is the same fact drawn.
describe('`X` — the flag (`S9`, `10` §5.1)', () => {
  it.each(['front', 'back'] as const)('flags on %s', (face) => {
    expect(reviewAction(press('x'), face)).toEqual({ kind: 'flag' })
    expect(reviewAction(press('X', { shiftKey: true }), face)).toEqual({ kind: 'flag' })
  })

  // The same rule the rest of the map follows: a modifier means the keystroke
  // belongs to the browser.
  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('ignores it under %s', (modifier) => {
    expect(reviewAction(press('x', { [modifier]: true }), 'back')).toBeNull()
  })

  it('is not a grade, and does not become one on the back', () => {
    expect(reviewAction(press('x'), 'back')).not.toMatchObject({ kind: 'grade' })
  })
})
