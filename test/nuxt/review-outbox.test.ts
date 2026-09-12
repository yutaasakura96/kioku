// @vitest-environment nuxt
//
// The outbox on the screen it belongs to — ⚠️ **ADR 0039's five properties, in
// the browser idiom** (`11` §6.3). The pure half is `test/unit/review-outbox.ts`
// and `test/unit/review-stamp.ts`; what is here is the half that only exists
// once a page, a store and a network are involved.
//
// ⚠️ **`localStorage` is the durable record here** (ADR 0014), so every
// assertion about *what survives* reads the store rather than the component.
// That is the point of property 4: the thing that decides is not what the screen
// remembers.
//
// ⚠️ **One harness, not three** (ADR 0039). The job table and the worker loop
// assert the same five properties in their own tiers and their own languages,
// and a shared harness would have had to span `localStorage` in a page and
// psycopg in a subprocess — an adapter layer larger than the tests it replaced,
// with no production counterpart.

import { createError, readBody } from 'h3'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Review from '../../app/pages/review.vue'
import { OUTBOX_KEY, REFUSED_KEY, SNAPSHOT_KEY } from '../../app/utils/review-store'
import { parseOutbox } from '../../shared/review/outbox'

const SESSION = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const FIRST = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01'
const SECOND = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02'

const FIELDS = {
  term: '図書館',
  reading: 'としょかん',
  part_of_speech: '名詞',
  meaning: 'library',
  example_sentence: '駅の近くに図書館があります。',
  example_gloss: 'There is a library near the station.',
}

/** What the fake server is doing this test. */
const server = {
  reachable: true,
  /** What an unreachable server answers — a tunnel is a 503, an expiry is a 401. */
  failWith: 503 as number,
  answer: 'ok' as 'ok' | 'stamped_in_future',
  /** A body the server cannot read — `shared/review/request.ts` answers `400`. */
  unreadable: false,
  /** ⚠️ The order entries arrived in — property 3's whole assertion. */
  seen: [] as string[],
  graded: new Set<string>(),
  flagged: new Set<string>(),
  /** Held open to observe the moment between the write and the acknowledgement. */
  gate: null as null | Promise<void>,
}

function snapshot() {
  return {
    sessionId: SESSION,
    size: 2,
    snapshotTakenAt: '2026-09-12T09:00:00.000Z',
    positions: [FIRST, SECOND].map((cardId, ordinal) => ({
      ordinal,
      cardId,
      templateKey: 'recognition',
      fields: FIELDS,
      grade: server.graded.has(cardId) ? 3 : null,
      flagged: server.flagged.has(cardId),
    })),
  }
}

registerEndpoint('/api/review/session', {
  method: 'POST',
  handler: () => {
    if (!server.reachable)
      throw createError({ statusCode: 503 })

    return { session: snapshot(), empty: null }
  },
})

async function receive(kind: 'grade' | 'flag', event: Parameters<typeof readBody>[0]) {
  const body = await readBody(event) as { cardId: string }

  if (!server.reachable)
    throw createError({ statusCode: server.failWith })

  if (server.unreadable)
    throw createError({ statusCode: 400, statusMessage: 'bad_card_id' })

  if (server.gate)
    await server.gate

  server.seen.push(`${kind}:${body.cardId}`)

  if (kind === 'grade' && server.answer !== 'ok')
    return { outcome: server.answer, session: snapshot() }

  if (kind === 'grade')
    server.graded.add(body.cardId)
  else
    server.flagged.add(body.cardId)

  return { outcome: 'ok', session: snapshot() }
}

registerEndpoint('/api/review/grade', { method: 'POST', handler: event => receive('grade', event) })
registerEndpoint('/api/review/flag', { method: 'POST', handler: event => receive('flag', event) })

beforeEach(() => {
  localStorage.clear()
  server.reachable = true
  server.failWith = 503
  server.answer = 'ok'
  server.unreadable = false
  server.seen = []
  server.graded = new Set()
  server.flagged = new Set()
  server.gate = null
})

type Mounted = Awaited<ReturnType<typeof mountSuspended>>

// ⚠️ **Every mount is unmounted**, and not for tidiness: the page listens for
// `online` on `window`, so a screen left mounted by an earlier test answers the
// next test's reconnection with its own outbox. That is the listener working —
// it is one `window` — and it is why the teardown is part of the harness.
const mounted: Mounted[] = []

async function open(): Promise<Mounted> {
  const view = await mountSuspended(Review, { route: '/review?from=/sources' })
  mounted.push(view)
  await vi.waitFor(() => expect(view.find('.term').exists()).toBe(true))
  return view
}

afterEach(() => {
  while (mounted.length > 0)
    mounted.pop()!.unmount()
})

async function press(view: Mounted, key: string) {
  await view.find('.container').trigger('keydown', { key })
  await flushPromises()
}

/** `space`, then the digit — a *grade* is refused while the *card* is face-down. */
async function answer(view: Mounted, key: string) {
  await press(view, ' ')
  await press(view, key)
}

const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null')

describe('property 1 — the write happens before the acknowledgement', () => {
  it('has the grade in the store, and the next card on screen, while the request is still open', async () => {
    const view = await open()

    let open_: () => void = () => {}
    server.gate = new Promise<void>((resolve) => { open_ = resolve })

    await answer(view, '3')

    // ⚠️ The request has not been answered — nothing below has been
    // acknowledged by anything.
    expect(server.seen).toEqual([])
    expect(parseOutbox(stored(OUTBOX_KEY))).toHaveLength(1)
    expect(view.find('.rail').text()).toContain('2')
    expect(view.findAll('.tick.graded')).toHaveLength(1)

    open_()
    await vi.waitFor(() => expect(server.seen).toEqual([`grade:${FIRST}`]))
  })

  it('settles the entry out of the store once the server has it', async () => {
    const view = await open()

    await answer(view, '3')

    await vi.waitFor(() => expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([]))
  })
})

// ⚠️ **The test removes the signal entirely** and asserts the outcome is
// unchanged — ADR 0028's central claim, in the tier where the signal is a
// network rather than a `NOTIFY`.
describe('property 2 — losing the network costs latency, never data', () => {
  it('finishes a session with the network gone and loses nothing when it returns', async () => {
    const view = await open()
    server.reachable = false

    await answer(view, '3')
    await answer(view, '2')

    // The run ended on the client's own snapshot, with nothing acknowledged.
    expect(view.text()).toContain('Start another session')
    expect(server.seen).toEqual([])
    expect(parseOutbox(stored(OUTBOX_KEY))).toHaveLength(2)
    expect(view.text()).toContain('2 answers have not reached the database yet')

    server.reachable = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(server.seen).toEqual([`grade:${FIRST}`, `grade:${SECOND}`]))
    expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([])
  })
})

describe('property 3 — replay is in order, across two entry types', () => {
  // ⚠️ **The ordering that matters is a flag landing after a *grade* for a
  // different *card*** (ADR 0039), which is why the outbox has two entry types
  // rather than one parameterised one.
  it('replays a flag behind the grade that came before it', async () => {
    const view = await open()
    server.reachable = false

    await answer(view, '3')
    await press(view, 'x')

    expect(parseOutbox(stored(OUTBOX_KEY)).map(entry => entry.kind)).toEqual(['grade', 'flag'])

    server.reachable = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(server.seen).toEqual([`grade:${FIRST}`, `flag:${SECOND}`]))
  })

  it('sends nothing behind an entry the network would not take', async () => {
    const view = await open()
    server.reachable = false

    await answer(view, '3')
    await press(view, 'x')

    expect(server.seen).toEqual([])
  })
})

describe('property 4 — the durable record decides, including after a reload', () => {
  it('does not ask again for a card whose grade is still in the store', async () => {
    const first = await open()
    server.reachable = false
    await answer(first, '3')
    first.unmount()

    server.reachable = true
    const second = await open()

    // ⚠️ The server still believes nothing was graded — `snapshot()` answers
    // `grade: null` for both — and the reader is on the **second** *card*.
    expect(second.findAll('.tick.graded')).toHaveLength(1)
    expect(second.find('.rail').text()).toContain('2')
  })

  // ⚠️ **The words come back from the store, not from the database**
  // (§ Carrying, PRD §5). A resumed run that rehydrated the text would be *a
  // note edited mid-session shows the old text* failing through the mechanism
  // added to make the run survive a reload.
  it('resumes with the text the reader was handed', async () => {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      ...snapshot(),
      positions: snapshot().positions.map(position => ({
        ...position,
        fields: { ...FIELDS, meaning: 'the words the reader started with' },
      })),
    }))

    const view = await open()
    await press(view, ' ')

    // ⚠️ The server's answer for this *card* says `library`; the store says
    // otherwise, and the store is what the reader was handed.
    expect(view.find('.value.meaning').text()).toBe('the words the reader started with')
  })
})

describe('property 5 — a rejected entry is surfaced, never dropped', () => {
  // `03` §8.2: a wrong system clock is one of the few things the reader can
  // actually fix, and a *grade* that quietly did not happen is the failure `S8`
  // exists to prevent arriving as a success.
  it('says so on the end screen and stops retrying', async () => {
    const view = await open()
    server.answer = 'stamped_in_future'

    await answer(view, '3')
    await answer(view, '2')
    await vi.waitFor(() => expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([]))
    await flushPromises()

    expect(view.text()).toContain('2 answers were refused and will not be sent again')
    expect(view.text()).not.toContain('have not reached the database yet')
    expect(parseOutbox(stored(REFUSED_KEY))).toHaveLength(2)
  })

  // ⚠️ **An entry the server cannot read blocks the head of the stream for
  // ever**, and everything behind it with it — which is the drop this property
  // exists to prevent, arriving through the mechanism added to prevent it. A
  // `400` can never succeed, so it leaves the stream and is shown.
  it('takes a refused body out of the stream rather than retrying it at the head', async () => {
    const view = await open()
    server.unreadable = true

    await answer(view, '3')
    await vi.waitFor(() => expect(parseOutbox(stored(REFUSED_KEY))).toHaveLength(1))

    // The *card* behind it is reachable: the stream drained rather than stalled.
    server.unreadable = false
    await answer(view, '2')

    await vi.waitFor(() => expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([]))
    expect(server.seen).toEqual([`grade:${SECOND}`])
    expect(view.text()).toContain('1 answer was refused and will not be sent again')
  })

  // ⚠️ **A flush that answers 401 is not a network error** (`08` §5.6, `09`
  // §4.8). It must not retry on the same backoff forever.
  it('reports an expired session on the end screen rather than replaying into it', async () => {
    const view = await open()
    server.reachable = false
    server.failWith = 401

    await answer(view, '3')
    await answer(view, '2')
    await flushPromises()

    expect(view.text()).toContain('2 answers have not reached the database yet')
    expect(view.find('.sign-in').exists()).toBe(true)

    // The second entry was never attempted: the replay stopped at the 401.
    server.reachable = true
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(server.seen).toEqual([])
  })
})

// `S9` on the screen — `09` §4.9, `10` §5.1, §5.3.
describe('the flag advances without a grade', () => {
  it('marks the position flagged, moves on, and counts no grade', async () => {
    const view = await open()

    await press(view, 'x')

    expect(view.findAll('.tick.flagged')).toHaveLength(1)
    expect(view.findAll('.tick.graded')).toHaveLength(0)
    await vi.waitFor(() => expect(server.seen).toEqual([`flag:${FIRST}`]))

    await press(view, 'x')

    // ⚠️ A run can end with no *grades* at all, and the tally says so rather
    // than inventing one (ADR 0053).
    expect(view.text()).toContain('Start another session')
    expect(view.findAll('.figure').map((figure: { text: () => string }) => figure.text())).toEqual(['0', '0', '0', '0'])
  })

  // `10` §5.1: the legend carries `X` on both faces, because a *card* can be
  // wrong in a way the *term* alone already shows.
  it('is offered on the front and on the back', async () => {
    const view = await open()

    expect(view.find('.legend').text()).toContain('flag')

    await press(view, ' ')

    expect(view.find('.legend').text()).toContain('flag')
    expect(view.find('.legend').text()).toContain('Forgot')
  })
})
