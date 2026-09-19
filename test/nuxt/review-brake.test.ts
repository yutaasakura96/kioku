// @vitest-environment nuxt
//
// ADR 0066 §7 on the screen — ⚠️ **a brake that is silent is a bug report.**
// The arithmetic is `test/unit/review-compose.test.ts` and
// `test/unit/review-brake.test.ts`, and the rows are `test/schema/review.test.ts`;
// what is here is that *Review* says which brake is on, and that it sends the
// zone the day is counted in (ADR 0066 §4).

import { readBody } from 'h3'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Review from '../../app/pages/review.vue'

const SESSION = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const CARD = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01'

const FIELDS = {
  term: '図書館',
  reading: 'としょかん',
  part_of_speech: '名詞',
  meaning: 'library',
  example_sentence: '駅の近くに図書館があります。',
  example_gloss: 'There is a library near the station.',
}

const server = {
  /** `false` answers *nothing to study*. */
  run: true,
  empty: { hasCards: true, nextDue: null as string | null, newWaiting: true },
  brake: { introducedToday: 0, dueCount: 0 },
  /** What the end screen should read, sent with the last answer. */
  finalBrake: { introducedToday: 0, dueCount: 0 },
  bodies: [] as unknown[],
  graded: false,
}

function snapshot() {
  return {
    sessionId: SESSION,
    size: 1,
    snapshotTakenAt: '2026-09-12T09:00:00.000Z',
    positions: [{
      ordinal: 0,
      cardId: CARD,
      templateKey: 'recognition',
      fields: FIELDS,
      grade: server.graded ? 3 : null,
      flagged: false,
    }],
  }
}

registerEndpoint('/api/review/session', {
  method: 'POST',
  handler: async (event) => {
    server.bodies.push(await readBody(event))

    return server.run
      ? { session: snapshot(), empty: null, brake: server.brake }
      : { session: null, empty: server.empty, brake: server.brake }
  },
})

registerEndpoint('/api/review/grade', {
  method: 'POST',
  handler: () => {
    server.graded = true
    return { outcome: 'ok', session: snapshot(), brake: server.finalBrake }
  },
})

beforeEach(() => {
  localStorage.clear()
  server.run = true
  server.empty = { hasCards: true, nextDue: null, newWaiting: true }
  server.brake = { introducedToday: 0, dueCount: 0 }
  server.finalBrake = { introducedToday: 0, dueCount: 0 }
  server.bodies = []
  server.graded = false
})

type Mounted = Awaited<ReturnType<typeof mountSuspended>>

// Unmounted every time — the page listens on `window` (`review-outbox.test.ts`).
const mounted: Mounted[] = []

afterEach(() => {
  while (mounted.length > 0)
    mounted.pop()!.unmount()
})

async function open(ready: string): Promise<Mounted> {
  const view = await mountSuspended(Review, { route: '/review?from=/' })
  mounted.push(view)
  await vi.waitFor(() => expect(view.find(ready).exists()).toBe(true))
  return view
}

async function type(view: Mounted, selector: string, text: string) {
  const field = view.find(selector)
  await field.setValue(text)
  await field.trigger('keydown', { key: 'Enter' })
  await flushPromises()
}

async function finishRun(view: Mounted) {
  await type(view, '#answer-reading', 'としょかん')
  await type(view, '#answer-meaning', 'library')
  await view.find('.container').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  await vi.waitFor(() => expect(view.find('.end').exists()).toBe(true))
}

describe('the zone the day is counted in (ADR 0066 §4)', () => {
  it('rides the mount\'s request, before anything has been chosen', async () => {
    await open('.term')

    expect(server.bodies).toEqual([{ zone: Intl.DateTimeFormat().resolvedOptions().timeZone }])
  })
})

describe('the end screen names the brake (ADR 0066 §7)', () => {
  // ⚠️ **The reading that came back with the last answer, not the one the run
  // was composed with.** Twenty answers later the due count has moved.
  it('says the gate is shut, with the count as it stands after the run', async () => {
    server.brake = { introducedToday: 0, dueCount: 71 }
    server.finalBrake = { introducedToday: 0, dueCount: 70 }
    const view = await open('.term')

    await finishRun(view)

    await vi.waitFor(() => expect(view.find('.brake').text()).toBe('No new words today, 70 due.'))
  })

  it('says the day\'s ten are spent', async () => {
    server.finalBrake = { introducedToday: 10, dueCount: 3 }
    const view = await open('.term')

    await finishRun(view)

    await vi.waitFor(() => expect(view.find('.brake').text()).toBe('10 of 10 new words today.'))
  })
})

describe('`10` §5.7\'s third empty state (ADR 0066 §7)', () => {
  it('says the brake held new words back rather than that nothing is due', async () => {
    server.run = false
    server.brake = { introducedToday: 10, dueCount: 0 }
    const view = await open('.statement')

    // ⚠️ Waited for by text: the loading state is an `EmptyBlock` too.
    await vi.waitFor(() => expect(view.find('.statement').text()).toBe('No new words today.'))
    expect(view.text()).toContain('10 of 10 new words today.')
  })

  it('stays *Nothing due* when the day still has room', async () => {
    server.run = false
    server.brake = { introducedToday: 4, dueCount: 0 }
    const view = await open('.statement')

    await vi.waitFor(() => expect(view.find('.statement').text()).toBe('Nothing due.'))
  })
})
