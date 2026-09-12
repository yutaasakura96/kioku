// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import StatsFigures from '../../app/components/StatsFigures.vue'
import { summarise } from '../../shared/metrics/stats'
import type { StatsRows } from '../../shared/metrics/stats'

// `S10`'s figure grid — `10` §8.1 and §8.2.
//
// ⚠️ **The suppression boundary is the only branch on this screen**, and `11` §3
// says it is *off by default in every naive implementation*. That is why both
// sides are mounted rather than one: a grid that reports at nineteen passes
// every test that only checks twenty.
//
// ⚠️ **No test here asserts a threshold** (ADR 0037). Nothing below says the
// median is under five seconds or that *acceptance rate* clears a floor — ADR
// 0018 walks the model down until it degrades, so the number has to be free to
// fall.

const NO_VETTING = { acceptedUnedited: 0, acceptedWithEdit: 0, rejected: 0, pending: 0 }

const NOTHING: StatsRows = {
  vetting: NO_VETTING,
  secondsPerNote: [],
  flags: 0,
  timeToFirstReview: [],
  sourcesIngested: 0,
  workerEnvironments: [],
}

/** Twenty decided *notes* — one past the boundary. */
const REPORTING: StatsRows = {
  vetting: { acceptedUnedited: 15, acceptedWithEdit: 3, rejected: 2, pending: 0 },
  secondsPerNote: [3, 4, 5, 9],
  flags: 2,
  timeToFirstReview: [8 * 60, 12 * 60],
  sourcesIngested: 2,
  workerEnvironments: ['laptop'],
}

function mount(rows: Partial<StatsRows> = {}) {
  return mountSuspended(StatsFigures, { props: { view: summarise({ ...NOTHING, ...rows }) } })
}

describe('the five eyebrows — `10` §8.1', () => {
  it('names every figure, in the order the grid is specified in', async () => {
    const view = await mount(REPORTING)

    expect(view.findAll('.eyebrow').map(node => node.text())).toEqual([
      'ACCEPTANCE RATE',
      'FALSE-ACCEPT RATE',
      'SECONDS PER NOTE',
      'TIME TO FIRST REVIEW',
      'NOTES VETTED',
    ])
  })
})

describe('the suppression boundary — nineteen suppresses, twenty reports', () => {
  // ⚠️ **The test that matters most.** Reporting at nineteen is what every naive
  // implementation does, and the screen looks correct while it does it.
  it('suppresses at nineteen', async () => {
    const view = await mount({
      ...REPORTING,
      vetting: { acceptedUnedited: 15, acceptedWithEdit: 3, rejected: 1, pending: 0 },
    })

    expect(view.text()).not.toContain('%')
    expect(view.text()).toContain('Ratios appear at twenty vetted notes.')
  })

  it('reports at twenty', async () => {
    const view = await mount(REPORTING)

    expect(view.text()).toContain('%')
    expect(view.text()).not.toContain('Ratios appear at twenty vetted notes.')
  })

  // ⚠️ `S10` and PRD §4 require **raw counts and a line saying why**, and `10`
  // §8.2 requires the columns to keep their slot — "not hidden, not dashed out:
  // the reader can see the numbers accumulating toward the threshold".
  it('shows the raw pair behind each withheld ratio rather than hiding it', async () => {
    const view = await mount({
      vetting: { acceptedUnedited: 4, acceptedWithEdit: 1, rejected: 12, pending: 0 },
      secondsPerNote: [3, 5],
      flags: 1,
      timeToFirstReview: [600],
      sourcesIngested: 3,
      workerEnvironments: ['laptop'],
    })

    const figures = view.findAll('.figure').map(node => node.text())

    expect(figures[0]).toContain('4 / 17') // unedited accepts ÷ notes generated
    expect(figures[1]).toContain('1 / 5') //  flags ÷ accepted notes
    expect(figures[2]).toContain('2 / 4') //  stamps ÷ unedited accepts
    expect(figures[3]).toContain('1 / 3') //  sources studied ÷ sources ingested
  })

  // The count the boundary is measured on is never withheld — it is how the
  // reader watches it approach.
  it('always shows the notes-vetted count', async () => {
    const view = await mount({
      vetting: { acceptedUnedited: 2, acceptedWithEdit: 0, rejected: 1, pending: 40 },
    })

    expect(view.findAll('.figure').at(4)!.text()).toBe('3')
  })
})

describe('the four figures, above the boundary', () => {
  it('reads acceptance rate as a percentage of notes generated', async () => {
    const view = await mount(REPORTING)
    expect(view.findAll('.figure').at(0)!.text()).toBe('75%')
  })

  // ⚠️ A second flag on the same *card* is a second row (`11` §3), so this can
  // exceed 100% — and the screen must not clamp what the arithmetic does not.
  it('reads false-accept rate over accepted notes, unclamped', async () => {
    const view = await mount({ ...REPORTING, flags: 20 })
    expect(view.findAll('.figure').at(1)!.text()).toBe('111%')
  })

  // ⚠️ `11` §3: an even count takes the mean of the middle two — 4 and 5 → 4.5.
  it('reads the median seconds-per-note', async () => {
    const view = await mount(REPORTING)
    expect(view.findAll('.figure').at(2)!.text()).toBe('4.5')
  })

  it('reads time-to-first-review as a duration', async () => {
    const view = await mount(REPORTING)
    expect(view.findAll('.figure').at(3)!.text()).toContain('10m')
  })

  // ⚠️ **A measured non-zero is never rendered as a zero.** One flag over three
  // hundred accepted *notes* rounds to 0% — which reads as *nothing has ever
  // been wrong*, the one claim *false-accept rate* must never make by accident.
  it('reads a rate that rounds to zero as less than one percent, not as zero', async () => {
    const view = await mount({
      vetting: { acceptedUnedited: 300, acceptedWithEdit: 0, rejected: 0, pending: 0 },
      flags: 1,
    })

    expect(view.findAll('.figure').at(1)!.text()).toBe('<1%')
  })

  // ⚠️ **`null`, not zero** — `acceptance.ts`'s rule, carried onto the screen. A
  // `0%` before the first paste is a claim about a pipeline that produced
  // nothing usable.
  it('shows no figure at all where there is nothing to compute one from', async () => {
    const view = await mount({
      vetting: { acceptedUnedited: 0, acceptedWithEdit: 0, rejected: 20, pending: 0 },
    })

    expect(view.findAll('.figure').at(1)!.text()).toBe('—')
    expect(view.findAll('.figure').at(2)!.text()).toBe('—')
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
