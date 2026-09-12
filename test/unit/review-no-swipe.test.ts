// ⚠️ **No swipe, and the absence of a thing is what has to be asserted**
// ([ADR 0036](../../docs/adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md),
// `10` §10.3).
//
// **SC 2.5.1 Pointer Gestures is Level A** and **SC 2.5.7 Dragging Movements is
// Level AA** (verification §13.2), so a path-based or dragging gesture owes a
// single-pointer equivalent — which is the four *grade* controls it was meant to
// replace. **Swipe could only ever have been additive**, and ADR 0026 had
// deferred it here by name as "genuinely good and not needed to ship".
//
// ⚠️ **It is a source test because there is nothing else to ask.** A gesture
// that was never written leaves no behaviour to observe, and the failure mode is
// not a bug — it is somebody adding a touch handler in six months because the
// phone layout (ADR 0026) makes it look obvious. The four controls are already
// 74 × 48 at 375px, which clears SC 2.5.8's Level AA floor **and** SC 2.5.5's
// Level AAA one (`10` §10.4), so there is nothing a gesture would buy.
//
// ⚠️ And the deeper reason it stays refused: **a *grade* is arithmetic that
// cannot be undone** (ADR 0016, `03` §2.4). `Z` is *Vet*'s key and `X` is a
// flag, not a correction — so the one screen where an accidental input is
// permanent is the one screen that must not read an accident as an answer.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const FILES = [
  '../../app/pages/review.vue',
  '../../app/components/GradeControls.vue',
  '../../app/components/ReviewCard.vue',
  '../../app/components/ProgressRail.vue',
]

/**
 * A gesture *handler*, in every spelling a Vue single-file component can carry.
 *
 * ⚠️ **It matches the binding, not the word.** The files below discuss swipe at
 * length — ADR 0036 is an argument worth keeping next to the code that lost it —
 * so a regex over prose would fail on its own reasoning. `click` and `keydown`
 * are deliberately absent from the list: those are the two paths ADR 0036
 * **keeps**.
 */
const GESTURE
  = /(?:@|v-on:|\bon)(?:touchstart|touchmove|touchend|pointerdown|pointermove|pointerup|dragstart|drag|swipe)\b|addEventListener\(\s*['"`](?:touch|pointer|drag)/i

describe('grade by swipe is refused (ADR 0036)', () => {
  it.each(FILES)('%s reads no gesture', (file) => {
    const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')

    expect(GESTURE.test(source), `${file} handles a gesture — SC 2.5.1 is Level A`).toBe(false)
  })

  // The single-pointer path the criterion requires, and the one this screen
  // actually ships: four `<button>`s and a key map.
  it('grades by pointer through a real control', () => {
    const controls = readFileSync(
      fileURLToPath(new URL('../../app/components/GradeControls.vue', import.meta.url)),
      'utf8',
    )

    expect(controls).toContain('type="button"')
    expect(controls).toContain('@click')
  })
})
