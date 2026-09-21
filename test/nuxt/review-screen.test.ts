// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import CheckControls from '../../app/components/CheckControls.vue'
import PlaceShell from '../../app/components/PlaceShell.vue'
import ProgressRail from '../../app/components/ProgressRail.vue'
import ReviewAnswer from '../../app/components/ReviewAnswer.vue'
import ReviewCard from '../../app/components/ReviewCard.vue'
import SessionTally from '../../app/components/SessionTally.vue'
import SessionFilterControls from '../../app/components/SessionFilterControls.vue'
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

// ADR 0069 §1–§2: the check is the grade, so the back has one control that
// commits it and — after a refused meaning only — one that adds a synonym.
describe('the check\'s controls (ADR 0069, ADR 0034)', () => {
  const controls = (grade: 1 | 3, offerSynonym: boolean) =>
    mountSuspended(CheckControls, { props: { grade, offerSynonym } })

  it('names the grade the check gave, in recall words and never a time', async () => {
    expect((await controls(3, false)).text()).toContain('Good')
    expect((await controls(1, false)).text()).toContain('Forgot')
    expect((await controls(1, false)).text()).not.toContain('Again')
  })

  it('offers no choice of grade', async () => {
    const view = await controls(3, false)

    expect(view.findAll('button')).toHaveLength(1)
    expect(view.text()).not.toMatch(/Hard|Easy/)
  })

  // ⚠️ **By key or by pointer** (ADR 0036, `10` §10.3): a phone has no `Enter`,
  // so the commit has to be a real button.
  it('commits by pointer', async () => {
    const view = await controls(3, false)

    await view.find('.commit').trigger('click')

    expect(view.emitted('commit')).toHaveLength(1)
  })

  it('offers the synonym only when asked to, and adds it by pointer', async () => {
    const view = await controls(1, true)

    await view.find('.synonym').trigger('click')

    expect(view.emitted('synonym')).toHaveLength(1)
    expect(view.findAll('button')).toHaveLength(2)
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

// ADR 0065 §5 — the *session* filter. ⚠️ **Its values are the declaration's**,
// so a second *domain* in `subjects/jlpt-vocab.json` is a second checkbox and
// nothing here; and **it says it touches the new half only**, because a reader
// who believed the due half was filtered would be reading the screen wrong.
describe('the session filter (ADR 0065 §5)', () => {
  const controls = (filter = { domains: [] as string[], levels: [] as string[] }) =>
    mountSuspended(SessionFilterControls, { props: { modelValue: filter, declaration: jlptVocab } })

  it('offers every declared domain and level, and says it filters new cards only', async () => {
    const view = await controls()

    expect(view.findAll('input[type=checkbox]').map(box => box.attributes('value'))).toEqual([
      ...jlptVocab.domains,
      ...jlptVocab.levels,
    ])
    expect(view.text()).toContain('New cards only')
  })

  it('keeps the declaration order whatever order the boxes are ticked in', async () => {
    const view = await controls({ domains: ['business'], levels: [] })

    await view.find('input[value=tech]').setValue(true)

    expect(view.emitted('update:modelValue')).toEqual([[{ domains: ['tech', 'business'], levels: [] }]])
  })
})

// ADR 0069 §4: a kana word is its own reading, so its *card* has no reading row
// on either face — which step it opens on is the page's, from `answerSteps`.
describe('the answer steps for a kana-only term', () => {
  const answer = (step: 'meaning' | 'back', asksReading: boolean) =>
    mountSuspended(ReviewAnswer, {
      props: {
        step,
        declaration: jlptVocab,
        typed: { reading: '', meaning: 'like this' },
        check: { reading: null, meaning: step === 'back' ? true : null },
        storedReading: 'こんな',
        asksReading,
      },
    })

  it('asks for the meaning with no reading field or result', async () => {
    const view = await answer('meaning', false)

    expect(view.find('#answer-reading').exists()).toBe(false)
    expect(view.find('#answer-meaning').exists()).toBe(true)
    expect(view.text()).not.toContain('こんな')
  })

  it('shows the meaning result alone on the back', async () => {
    const view = await answer('back', false)

    expect(view.findAll('.given')).toHaveLength(1)
    expect(view.text()).toContain('like this')
  })

  it('keeps the reading row for a term with kanji', async () => {
    const view = await answer('back', true)

    expect(view.findAll('.given')).toHaveLength(2)
  })
})

// #30: EDRDG's licence §3 asks for the acknowledgement on the app's site, with
// links. The *shell* carries it, so every *place* does and no *mode* does.
describe('the KANJIDIC2 acknowledgement', () => {
  it('sits under a place with the project, licence and CC BY-SA links', async () => {
    const view = await mountSuspended(PlaceShell, { props: { origin: '/stats', flagged: 0, due: 0 } })
    const footer = view.find('footer')

    expect(footer.text()).toContain('KANJIDIC2')
    expect(footer.text()).toContain('EDRDG')
    expect(footer.findAll('a').map(link => link.attributes('href'))).toEqual([
      'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
      'https://www.edrdg.org/edrdg/licence.html',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    ])
  })
})

