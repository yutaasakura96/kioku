// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import GradeControls from '../../app/components/GradeControls.vue'
import ProgressRail from '../../app/components/ProgressRail.vue'
import ReviewCard from '../../app/components/ReviewCard.vue'
import SessionTally from '../../app/components/SessionTally.vue'
import { jlptVocab } from '../../shared/subject/declaration'

// *Review*'s three drawn components. Each of these assertions is about
// something that is invisible when it is wrong:
//
// - ⚠️ **The *grade* labels name recall, not time** (ADR 0034). Anyone comparing
//   a screenshot with Anki's will read `Forgot` where they expect `Again` and
//   think the difference is cosmetic; it is the visible end of ADR 0016, and
//   with `enable_short_term` off `Again` would promise a same-day return this
//   configuration cannot make.
// - ⚠️ **The *progress rail* is the header and the only progress indicator in
//   the app** (`10` §5.2, `CONTEXT.md`), so its length is `review_session.size`
//   and a tick is a *card*.
// - ⚠️ **The front is the *term* alone** (`10` §5.4). A *card* that leaked its
//   answer onto the front would still look like a *card*, and the only thing
//   that would ever say so is the retention curve months later.

const FIELDS = {
  term: '図書館',
  reading: 'としょかん',
  part_of_speech: '名詞',
  meaning: 'library',
  example_sentence: '駅の近くに図書館があります。',
  example_gloss: 'There is a library near the station.',
}

function card(face: 'front' | 'back') {
  return mountSuspended(ReviewCard, {
    props: { fields: FIELDS, declaration: jlptVocab, templateKey: 'recognition', face },
  })
}

describe('the card\'s two faces (`10` §5.4, ADR 0002)', () => {
  it('shows the term alone on the front', async () => {
    const view = await card('front')

    expect(view.text()).toContain('図書館')
    expect(view.text()).not.toContain('library')
    expect(view.text()).not.toContain('としょかん')
  })

  // The declaration's `answer` list, in its own order — a second *template* is a
  // row in `subjects/jlpt-vocab.json` rather than a second component (ADR 0003).
  it('shows every answer field on the back', async () => {
    const view = await card('back')

    for (const value of Object.values(FIELDS))
      expect(view.text()).toContain(value)
  })

  // `05` §4: Mincho carries every Japanese glyph and Newsreader every English
  // one, and a screen never mixes a family into a role that is not its own. The
  // `:lang(ja)` hook in `tokens.css` is what does it, so the attribute is the
  // assertion.
  it('marks the Japanese so Mincho reaches it', async () => {
    const view = await card('back')

    expect(view.find('.term').attributes('lang')).toBe('ja')
    expect(view.find('.value.meaning').attributes('lang')).toBeUndefined()
  })
})

describe('the four grade controls (ADR 0034, ADR 0016)', () => {
  it('names recall and never a time', async () => {
    const view = await mountSuspended(GradeControls)

    expect(view.text()).toContain('Forgot')
    expect(view.text()).not.toContain('Again')
    expect(view.findAll('.grade').map(control => control.text())).toEqual([
      '1Forgot',
      '2Hard',
      '3Good',
      '4Easy',
    ])
  })

  // ⚠️ **By key or by pointer** (ADR 0036, `10` §10.3) — the four controls are
  // the single-pointer path SC 2.5.1 requires, so they have to be real buttons
  // rather than a surface a gesture is read off.
  it('grades by pointer', async () => {
    const view = await mountSuspended(GradeControls)

    await view.findAll('button')[1]!.trigger('click')

    expect(view.emitted('grade')).toEqual([[2]])
  })
})

describe('the progress rail (`05` §7, `10` §5.2, §5.3)', () => {
  const rail = (ticks: string[], complete = false) =>
    mountSuspended(ProgressRail, { props: { ticks: ticks as never, complete, position: 2 } })

  it('is one tick per card and knows its own length', async () => {
    const view = await rail(['graded', 'current', 'empty', 'empty'])

    expect(view.findAll('.tick')).toHaveLength(4)
    expect(view.findAll('.tick.graded')).toHaveLength(1)
    expect(view.findAll('.tick.current')).toHaveLength(1)
  })

  it('carries the counters, which are the halves the phone drops', async () => {
    const view = await rail(['graded', 'current'])

    expect(view.findAll('.counter').map(counter => counter.text())).toEqual(['2', '2'])
  })

  // ⚠️ `10` §5.3's fourth mark. Nothing produces one until #13 builds `X`, and
  // the vocabulary is four states rather than three so that ticket does not have
  // to rediscover the argument.
  it('draws a flagged position thinner rather than in another colour', async () => {
    const view = await rail(['flagged', 'current'])

    expect(view.findAll('.tick.flagged')).toHaveLength(1)
  })
})

describe('the session tally (`05` §7, `10` §11)', () => {
  // One component with a column count, not two: *Review*'s end screen takes
  // four and Stats takes five.
  it('takes its column count from what it is given', async () => {
    const five = await mountSuspended(SessionTally, {
      props: {
        columns: [
          { eyebrow: 'A', figure: 1 },
          { eyebrow: 'B', figure: 2 },
          { eyebrow: 'C', figure: 3 },
          { eyebrow: 'D', figure: 4 },
          { eyebrow: 'E', figure: '5 / 7' },
        ],
      },
    })

    expect(five.findAll('.column')).toHaveLength(5)
    expect(five.text()).toContain('5 / 7')
  })
})
