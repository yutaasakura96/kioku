// @vitest-environment nuxt
//
// What is waiting, on the screen — ADR 0076 §8 and ADR 0066 §7. ⚠️ **A brake
// that is silent is a bug report.** The arithmetic is
// `test/unit/review-brake.test.ts` and `test/unit/review-offer.test.ts`, and
// the rows are `test/schema/review.test.ts`; what is here is that *Review*
// opens on what is waiting and starts nothing, says which brake is on, and
// sends the zone the day is counted in (ADR 0066 §4).

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NOTHING_WAITING, open, resetServer, server, texts, unmountAll, word } from './support/review-server'

beforeEach(() => {
  resetServer()
  server.live = false
})
afterEach(unmountAll)

const start = () => open('.start .statement', '/review?from=/')

describe('the zone the day is counted in (ADR 0066 §4)', () => {
  it('rides the mount\'s request, before anything has been chosen', async () => {
    await start()

    expect(server.starts).toEqual([{ size: 20, domains: [], levels: [], zone: Intl.DateTimeFormat().resolvedOptions().timeZone }])
  })
})

describe('the screen before a run (ADR 0076 §8)', () => {
  // ⚠️ A lesson spends the day's allowance by being composed, so opening the
  // screen must not be the reader starting one.
  it('opens on what is waiting and starts nothing', async () => {
    server.offer = { ...NOTHING_WAITING, dueCount: 12, lesson: 5, waiting: true }
    const view = await start()

    expect(view.find('.statement').text()).toBe('12 words to review, then 5 new ones.')
    expect(texts(view, '.cta button')).toEqual([
      'Start reviews · 12 due',
      'Start lesson · 5 new words',
    ])
    expect(server.starts.every(body => body.start === undefined)).toBe(true)
    expect(view.find('.quizcard').exists()).toBe(false)
  })

  it('starts the run the reader asks for, and only then', async () => {
    server.offer = { ...NOTHING_WAITING, dueCount: 2 }
    const view = await start()

    await view.find('.cta button').trigger('click')
    await vi.waitFor(() => expect(view.find('.quizcard').exists()).toBe(true))

    expect(server.starts.map(body => body.start)).toEqual([undefined, 'review'])
    expect(view.find('.modebar .name').text()).toBe('Reviews')
  })

  it('draws no control for a run of nothing', async () => {
    server.offer = { ...NOTHING_WAITING, lesson: 3, waiting: true }
    const view = await start()

    expect(texts(view, '.cta button')).toEqual(['Start lesson · 3 new words'])
  })

  it('says the day\'s new words are spent rather than that there are none', async () => {
    server.offer = { ...NOTHING_WAITING, introducedToday: 10, waiting: true, nextDue: null }
    const view = await start()

    expect(view.find('.statement').text()).toBe('All done for now.')
    expect(view.find('.sub').text()).toContain('You have had today\'s new words.')
    expect(view.find('.brake').text()).toBe('10 of 10 new words today.')
    expect(view.findAll('.cta button')).toHaveLength(0)
  })

  it('says the gate is shut, and how many are waiting', async () => {
    server.offer = { ...NOTHING_WAITING, dueCount: 71, waiting: true }
    const view = await start()

    expect(view.find('.sub').text()).toBe('No new words while 50 or more reviews wait. 71 are waiting.')
    expect(view.find('.brake').text()).toBe('No new words today, 71 due.')
  })

  // ADR 0076 §2: the sentence names the reader's own number.
  it('names the reader\'s own limits', async () => {
    server.offer = {
      ...NOTHING_WAITING,
      introducedToday: 4,
      waiting: true,
      limits: { lessonSize: 2, dailyNew: 4, pauseAbove: 30 },
    }
    const view = await start()

    expect(view.find('.brake').text()).toBe('4 of 4 new words today.')
  })

  // ⚠️ A changed filter asks again and starts nothing: the count on the lesson
  // control is the server's.
  it('asks again through a changed filter, and starts nothing', async () => {
    server.offer = { ...NOTHING_WAITING, lesson: 5, waiting: true }
    const view = await start()

    await view.find('input[value=N3]').setValue(true)
    await vi.waitFor(() => expect(server.starts).toHaveLength(2))

    expect(server.starts[1]).toMatchObject({ levels: ['N3'], domains: [] })
    expect(server.starts[1]!.start).toBeUndefined()
  })

  // ⚠️ The re-ask must not take the screen away: the checkbox the reader
  // ticked is the one still there, so their place and focus are too.
  it('keeps the screen, and the checkbox just ticked, while it asks again', async () => {
    server.offer = { ...NOTHING_WAITING, lesson: 5, waiting: true }
    const view = await start()
    const box = view.find('input[value=N3]').element
    const drawn: boolean[] = []
    const watching = new MutationObserver(() => drawn.push(view.find('.start').exists()))
    watching.observe(view.element, { childList: true, subtree: true })

    await view.find('input[value=N3]').setValue(true)
    await vi.waitFor(() => expect(server.starts).toHaveLength(2))
    await flushPromises()
    watching.disconnect()

    expect(drawn.every(Boolean), 'the start screen left the page during the re-ask').toBe(true)
    expect(view.find('input[value=N3]').element).toBe(box)
    expect((box as HTMLInputElement).checked).toBe(true)
    expect(texts(view, '.cta button')).toEqual(['Start lesson · 5 new words'])
  })

  it('keeps the screen when the re-ask does not arrive', async () => {
    server.offer = { ...NOTHING_WAITING, lesson: 5, waiting: true }
    const view = await start()
    const box = view.find('input[value=N3]').element

    server.reachable = false
    await view.find('input[value=N3]').setValue(true)
    await new Promise(resolve => setTimeout(resolve, 50))
    await flushPromises()

    expect(view.text()).not.toContain('That did not load')
    expect(view.find('input[value=N3]').element).toBe(box)
    expect(texts(view, '.cta button')).toEqual(['Start lesson · 5 new words'])
  })

  // The reader's own start still says so when it fails: nothing was held for it.
  it('says a run the reader started did not load', async () => {
    server.offer = { ...NOTHING_WAITING, dueCount: 2 }
    const view = await start()

    server.reachable = false
    await view.find('.cta button').trigger('click')

    await vi.waitFor(() => expect(view.text()).toContain('That did not load'))
  })
})

describe('the summary\'s what next (ADR 0066 §7, ADR 0076 §8)', () => {
  // ⚠️ **The offer that came back with the last answer, not the one the run
  // was composed with.** Twenty answers later the due count has moved.
  it('reads what is waiting as it stands after the run', async () => {
    server.live = true
    server.cards = [server.cards[0]!]
    server.offer = { ...NOTHING_WAITING, dueCount: 71 }
    server.finalOffer = { ...NOTHING_WAITING, dueCount: 70 }
    const view = await open()

    await word(view)
    await flushPromises()

    await vi.waitFor(() => expect(view.find('.next').text()).toContain('70 reviews are still waiting.'))
    expect(view.find('.next button').text()).toBe('Carry on with reviews')
  })

  // ⚠️ The summary's lesson is started through the filter the reader chose, so
  // every answer carries it and the offer that ends the run is counted with it.
  it('sends the chosen filter with every answer, and keeps it for the next run', async () => {
    server.offer = { ...NOTHING_WAITING, dueCount: 1, lesson: 5, waiting: true }
    server.finalOffer = { ...NOTHING_WAITING, lesson: 2, waiting: true }
    server.cards = [server.cards[0]!]
    const view = await start()

    await view.find('input[value=N3]').setValue(true)
    await vi.waitFor(() => expect(server.starts).toHaveLength(2))
    await view.find('.cta button').trigger('click')
    await vi.waitFor(() => expect(view.find('.quizcard').exists()).toBe(true))

    await word(view)
    await vi.waitFor(() => expect(view.find('.next button').text()).toBe('Start lesson · 2 new words'))

    expect(server.answers).toHaveLength(1)
    expect(server.answers[0]).toMatchObject({ cardId: server.cards[0], grade: 3, levels: ['N3'], domains: [] })

    server.live = false
    server.graded = new Map()
    await view.find('.next button').trigger('click')
    await vi.waitFor(() => expect(server.starts.at(-1)).toMatchObject({ start: 'lesson', levels: ['N3'] }))
  })

  it('offers a lesson once the reviews are done', async () => {
    server.live = true
    server.cards = [server.cards[0]!]
    server.finalOffer = { ...NOTHING_WAITING, lesson: 5, waiting: true }
    const view = await open()

    await word(view)

    await vi.waitFor(() => expect(view.find('.next button').text()).toBe('Start lesson · 5 new words'))
  })
})
