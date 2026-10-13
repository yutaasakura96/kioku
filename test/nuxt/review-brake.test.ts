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

    expect(server.starts).toEqual([{ size: 20, zone: Intl.DateTimeFormat().resolvedOptions().timeZone }])
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

  // ADR 0077 §3 — the prototype's line under Home's two heroes. ⚠️ The
  // *category* is the server's, named beside the count it was counted in, and
  // the way to change it is a document load: `/categories` is a *place*.
  it('names the category new words come from, and links to where it is changed', async () => {
    server.offer = { ...NOTHING_WAITING, lesson: 5, waiting: true, category: { key: 'jlpt:N4', name: 'JLPT N4' } }
    const view = await start()

    expect(view.find('.studying').text()).toContain('New words come from')
    expect(view.find('.studying .tag').text()).toBe('JLPT N4')
    expect(view.find('.studying a').text()).toBe('Change category')
    expect(view.find('.studying a').attributes('href')).toBe('/categories')
    // ⚠️ ADR 0065 §5's checkboxes are gone: one *category*, chosen elsewhere.
    expect(view.find('input[type=checkbox]').exists()).toBe(false)
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

  // ⚠️ No answer says which words come next: the *category* is the server's
  // (ADR 0077 §1), so an answer is its own fields and nothing else.
  it('sends each answer with nothing about the next lesson in it', async () => {
    server.offer = { ...NOTHING_WAITING, dueCount: 1, lesson: 5, waiting: true }
    server.finalOffer = { ...NOTHING_WAITING, lesson: 2, waiting: true }
    server.cards = [server.cards[0]!]
    const view = await start()

    await view.find('.cta button').trigger('click')
    await vi.waitFor(() => expect(view.find('.quizcard').exists()).toBe(true))

    await word(view)
    await vi.waitFor(() => expect(view.find('.next button').text()).toBe('Start lesson · 2 new words'))

    expect(server.answers).toHaveLength(1)
    expect(Object.keys(server.answers[0]!).sort()).toEqual(['cardId', 'grade', 'reviewedAt', 'sessionId'])

    server.live = false
    server.graded = new Map()
    await view.find('.next button').trigger('click')
    await vi.waitFor(() => expect(Object.keys(server.starts.at(-1)!).sort()).toEqual(['size', 'start', 'zone']))
    // ⚠️ Let that answer land here, and not in the next test's store.
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 50))
    await flushPromises()
  })

  // ⚠️ Of the *category*, not of the app: the next one is a screen away.
  it('says no new words are left in the active category', async () => {
    server.live = true
    server.cards = [server.cards[0]!]
    const view = await open()

    await word(view)

    await vi.waitFor(() => expect(view.find('.next').text()).toContain('There are no new words left in JLPT N5.'))
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
