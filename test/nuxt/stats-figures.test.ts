// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import StatsFigures from '../../app/components/StatsFigures.vue'
import { summarise } from '../../shared/metrics/stats'
import type { StatsRows } from '../../shared/metrics/stats'

// `S10`'s figure grid — `10` §8.1 and §8.2. ⚠️ **Rebuilt by #23** (ADR 0062).
//
// ⚠️ **The suppression boundaries are the only branches on this screen**, and
// `11` §3 says a boundary is *off by default in every naive implementation*.
// That is why both sides of each are mounted rather than one: a grid that
// reports at nineteen passes every test that only checks twenty. There are three
// boundaries now, because ADR 0062 gives each ratio its own evidence.
//
// ⚠️ **No test here asserts a threshold** (ADR 0037). Nothing below says
// retention clears a floor or flag rate stays under one — ADR 0062 makes flag
// rate the model walk's only remaining instrument, so it has to be free to move.

const NOW = new Date('2026-09-17T12:00:00Z')
const CONTEXT = { now: NOW, zone: 'UTC' }

const NOTHING: StatsRows = {
  retention: { recalled: 0, qualifying: 0 },
  gradeMinutes: [],
  firstGradeAt: null,
  flaggedCards: 0,
  cardsMinted: 0,
  timeToFirstReview: [],
  sourcesIngested: 0,
  workerEnvironments: [],
}

/** A reader past every boundary — twenty qualifying reviews, fourteen days, twenty *cards*. */
const REPORTING: StatsRows = {
  retention: { recalled: 15, qualifying: 20 },
  firstGradeAt: new Date(NOW.getTime() - 13 * 86_400_000),
  gradeMinutes: Array.from({ length: 7 }, (_, i) => new Date(NOW.getTime() - i * 86_400_000)),
  flaggedCards: 2,
  cardsMinted: 20,
  timeToFirstReview: [8 * 60, 12 * 60],
  sourcesIngested: 2,
  workerEnvironments: ['laptop'],
}

function mount(rows: Partial<StatsRows> = {}) {
  return mountSuspended(StatsFigures, {
    props: { view: summarise({ ...NOTHING, ...rows }, CONTEXT) },
  })
}

describe('the five eyebrows — `10` §8.1', () => {
  it('names every figure, in the order the grid is specified in', async () => {
    const view = await mount(REPORTING)

    expect(view.findAll('.eyebrow').map(node => node.text())).toEqual([
      'RETENTION',
      'CONSISTENCY',
      'FLAG RATE',
      'TIME TO FIRST REVIEW',
      'CARDS MINTED',
    ])
  })

  // ⚠️ **The retirement is an absence, and `S10` says removed rather than
  // shrunk** (ADR 0062): *a number nobody acts on is a number somebody will
  // eventually act on by accident*.
  it('has retired acceptance rate and seconds per note from the screen', async () => {
    const eyebrows = (await mount(REPORTING)).findAll('.eyebrow').map(node => node.text())

    expect(eyebrows).not.toContain('ACCEPTANCE RATE')
    expect(eyebrows).not.toContain('SECONDS PER NOTE')
    expect(eyebrows).not.toContain('FALSE-ACCEPT RATE')
    expect(eyebrows).not.toContain('NOTES VETTED')
  })
})

// ⚠️ **Each assertion names the value that must be absent**, never `not
// .toContain('%')` over the whole render — § Carrying, measured 2026-09-12: a
// negative assertion over markup is an assertion about a haystack, and it passes
// for the opposite reason the day the grid fails to render at all.
describe('retention suppresses at nineteen qualifying reviews and reports at twenty', () => {
  it('withholds the percentage at nineteen and shows the pair instead', async () => {
    const view = await mount({ ...REPORTING, retention: { recalled: 15, qualifying: 19 } })

    expect(view.findAll('.figure').at(0)!.text()).toBe('15 / 19')
  })

  it('reports the percentage at twenty', async () => {
    const view = await mount(REPORTING)

    expect(view.findAll('.figure').at(0)!.text()).toBe('75%')
  })
})

describe('consistency suppresses at thirteen days and reports at fourteen', () => {
  const studied = (days: number) =>
    Array.from({ length: days }, (_, i) => new Date(NOW.getTime() - i * 86_400_000))

  it('withholds the percentage at thirteen days possible', async () => {
    const view = await mount({
      ...REPORTING,
      firstGradeAt: new Date(NOW.getTime() - 12 * 86_400_000),
      gradeMinutes: studied(7),
    })

    expect(view.findAll('.figure').at(1)!.text()).toBe('7 / 13')
  })

  it('reports the percentage at fourteen', async () => {
    const view = await mount({ ...REPORTING, gradeMinutes: studied(7) })

    expect(view.findAll('.figure').at(1)!.text()).toBe('50%')
  })
})

describe('flag rate suppresses at nineteen minted cards and reports at twenty', () => {
  it('withholds the percentage at nineteen and shows the pair instead', async () => {
    const view = await mount({ ...REPORTING, cardsMinted: 19 })

    expect(view.findAll('.figure').at(2)!.text()).toBe('2 / 19')
  })

  it('reports the percentage at twenty', async () => {
    const view = await mount(REPORTING)

    expect(view.findAll('.figure').at(2)!.text()).toBe('10%')
  })
})

describe('the suppressed state — `10` §8.2, ADR 0058', () => {
  // ⚠️ `S10` and PRD §4 require **raw counts and a line saying why**, and `10`
  // §8.2 requires the columns to keep their slot — "not hidden, not dashed out:
  // the reader can see the numbers accumulating toward the threshold".
  it('shows the raw pair behind every withheld ratio rather than hiding it', async () => {
    const view = await mount({
      retention: { recalled: 4, qualifying: 6 },
      firstGradeAt: new Date(NOW.getTime() - 2 * 86_400_000),
      gradeMinutes: [NOW, new Date(NOW.getTime() - 2 * 86_400_000)],
      flaggedCards: 1,
      cardsMinted: 5,
      timeToFirstReview: [600],
      sourcesIngested: 3,
      workerEnvironments: ['laptop'],
    })

    const figures = view.findAll('.figure').map(node => node.text())

    expect(figures[0]).toContain('4 / 6') //   recalled ÷ qualifying reviews
    expect(figures[1]).toContain('2 / 3') //   days studied ÷ days possible
    expect(figures[2]).toContain('1 / 5') //   flagged cards ÷ cards minted
    expect(figures[3]).toContain('1 / 3') //   sources studied ÷ sources ingested
  })

  // ⚠️ ADR 0058: the aside is `S10`'s *line saying why*. Its **second** sentence
  // is the argument and is carried across unparaphrased; the first is the rule,
  // and the rule is what #23 changed, because there is no single boundary left
  // to name.
  it('says why each ratio is withheld, and keeps the argument verbatim', async () => {
    const text = (await mount({ cardsMinted: 5 })).text()

    expect(text).toContain('Each ratio appears once there is enough behind it:')
    expect(text).toContain('retention at 20 reviews of a learned card')
    expect(text).toContain('consistency at 14 days')
    expect(text).toContain('flag rate and time to first review at 20 cards')
    expect(text).toContain('A rate over seventeen is noise.')
  })

  it('names only the ratios that are actually withheld', async () => {
    const text = (await mount({ ...REPORTING, cardsMinted: 5 })).text()

    expect(text).toContain('flag rate and time to first review at 20 cards')
    expect(text).not.toContain('retention at 20 reviews')
    expect(text).not.toContain('consistency at 14 days')
  })

  it('drops the aside entirely once nothing is withheld', async () => {
    const view = await mount(REPORTING)

    expect(view.find('.aside').exists()).toBe(false)
  })

  // The count two of the boundaries are measured on is never withheld — it is
  // how the reader watches them approach.
  it('always shows the cards-minted count', async () => {
    const view = await mount({ cardsMinted: 3 })

    expect(view.findAll('.figure').at(4)!.text()).toBe('3')
  })
})

describe('the figures, above the boundary', () => {
  it('reads time-to-first-review as a duration', async () => {
    const view = await mount(REPORTING)
    expect(view.findAll('.figure').at(3)!.text()).toContain('10m')
  })

  // ⚠️ **A measured non-zero is never rendered as a zero.** One flag over three
  // hundred *cards* rounds to 0% — which reads as *nothing has ever been wrong*,
  // the one claim flag rate must never make by accident.
  it('reads a rate that rounds to zero as less than one percent, not as zero', async () => {
    const view = await mount({ ...REPORTING, cardsMinted: 300, flaggedCards: 1 })

    expect(view.findAll('.figure').at(2)!.text()).toBe('<1%')
  })

  // ⚠️ And the mirror: a retention of 199 of 200 is not a perfect record.
  it('reads a rate that rounds to one hundred as more than ninety-nine percent', async () => {
    const view = await mount({ ...REPORTING, retention: { recalled: 199, qualifying: 200 } })

    expect(view.findAll('.figure').at(0)!.text()).toBe('>99%')
  })

  it('reads a true one hundred percent as one hundred percent', async () => {
    const view = await mount({ ...REPORTING, retention: { recalled: 200, qualifying: 200 } })

    expect(view.findAll('.figure').at(0)!.text()).toBe('100%')
  })

  // ⚠️ **`null`, not zero**, carried onto the screen.
  //
  // ⚠️ **After #23 the em dash is reachable through *time-to-first-review*
  // alone, and that is a property of the new boundaries rather than an
  // oversight.** The other three are each gated on their own denominator, so a
  // figure that is reported at all has a denominator above nineteen and cannot
  // be `null`; *time-to-first-review* is gated on minted *cards* and divided
  // over *sources studied*, so a reader who has minted twenty and reviewed none
  // sees it — **which is exactly the state the first run left the database in**
  // (39 minted, none reviewed, `docs/first-run-expectation.md`).
  it('shows no figure at all where there is nothing to compute one from', async () => {
    const view = await mount({ ...REPORTING, timeToFirstReview: [], sourcesIngested: 3 })

    expect(view.findAll('.figure').at(3)!.text()).toContain('—')
  })
})

describe('the worker environment — `03` §12, `10` §8.1', () => {
  // ⚠️ It rides **on the number**, not in a paragraph: figures measured against
  // a laptop are not comparable across ADR 0022's move, and putting it on the
  // row is what stops a future session averaging across the boundary.
  it('names the environment beneath time-to-first-review', async () => {
    const view = await mount(REPORTING)
    expect(view.findAll('.figure').at(3)!.text()).toContain('laptop')
  })

  it('names both when a figure spans the move', async () => {
    const view = await mount({ ...REPORTING, workerEnvironments: ['laptop', 'server'] })
    expect(view.findAll('.figure').at(3)!.text()).toContain('laptop · server')
  })

  it('names none when nothing has been measured', async () => {
    const view = await mount()
    expect(view.findAll('.figure').at(3)!.text()).not.toContain('laptop')
  })
})
