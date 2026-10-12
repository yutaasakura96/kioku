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
//
// ⚠️ **A word is one entry** (ADR 0076 §4): its two questions are the screen's
// and the stream carries the *grade* the last of them produced.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OUTBOX_KEY, REFUSED_KEY, SNAPSHOT_KEY } from '../../app/utils/review-store'
import { parseOutbox } from '../../shared/review/outbox'
import {
  FIELDS, FIRST, SECOND, count, give, next, open, press, resetServer, server, snapshot, stored, texts, unmountAll, word,
} from './support/review-server'

beforeEach(resetServer)
afterEach(unmountAll)

describe('property 1 — the write happens before the acknowledgement', () => {
  it('has the grade in the store, and the next word on screen, while the request is still open', async () => {
    const view = await open()

    let open_: () => void = () => {}
    server.gate = new Promise<void>((resolve) => { open_ = resolve })

    await word(view)

    // ⚠️ The request has not been answered — nothing below has been
    // acknowledged by anything.
    expect(server.seen).toEqual([])
    expect(parseOutbox(stored(OUTBOX_KEY))).toHaveLength(1)
    expect(count(view)).toBe('1 of 2 words')
    expect(view.find('.quizcard input').exists()).toBe(true)

    open_()
    await vi.waitFor(() => expect(server.seen).toEqual([`grade:${FIRST}`]))
  })

  it('settles the entry out of the store once the server has it', async () => {
    const view = await open()

    await word(view)

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

    await word(view)
    await word(view)

    // The run ended on the client's own snapshot, with nothing acknowledged.
    expect(view.find('.summary .statement').text()).toBe('Reviews done.')
    expect(server.seen).toEqual([])
    expect(parseOutbox(stored(OUTBOX_KEY))).toHaveLength(2)
    expect(view.text()).toContain('2 answers have not reached the database yet')
    // ⚠️ And no row promises a schedule the database has not written.
    expect(texts(view, '.wrow .x')).toEqual(['not sent yet', 'not sent yet'])

    server.reachable = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(server.seen).toEqual([`grade:${FIRST}`, `grade:${SECOND}`]))
    expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([])
    await vi.waitFor(() => expect(view.find('.wrow .x').text()).not.toBe('not sent yet'))
  })
})

describe('property 3 — replay is in order, across entry types', () => {
  // ⚠️ **The ordering that matters is a flag landing after a *grade* for a
  // different *card*** (ADR 0039), which is why the outbox has more than one
  // entry type rather than one parameterised one.
  it('replays a flag behind the grade that came before it', async () => {
    const view = await open()
    server.reachable = false

    await word(view)
    await give(view, 'library')
    await press(view, 'x')

    expect(parseOutbox(stored(OUTBOX_KEY)).map(entry => entry.kind)).toEqual(['grade', 'flag'])

    server.reachable = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(server.seen).toEqual([`grade:${FIRST}`, `flag:${SECOND}`]))
  })

  // ADR 0076 §6: the Forgot for a missed word, then the finish behind it.
  it('replays a finish behind the grades it ended the run with', async () => {
    const view = await open()
    server.reachable = false

    await give(view, 'station')
    await press(view, 'Escape')

    expect(parseOutbox(stored(OUTBOX_KEY)).map(entry => entry.kind)).toEqual(['grade', 'finish'])

    server.reachable = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(server.seen).toEqual([`grade:${FIRST}`, 'finish']))
    expect(server.graded.get(FIRST)).toBe(1)
  })

  it('sends nothing behind an entry the network would not take', async () => {
    const view = await open()
    server.reachable = false

    await word(view)
    await give(view, 'library')
    await press(view, 'x')

    expect(server.seen).toEqual([])
  })
})

describe('property 4 — the durable record decides, including after a reload', () => {
  it('does not ask again for a word whose grade is still in the store', async () => {
    const first = await open()
    server.reachable = false
    await word(first)
    first.unmount()

    server.reachable = true
    server.gate = new Promise<void>(() => {})
    const second = await open()

    // ⚠️ The server still believes nothing was graded — its snapshot answers
    // `grade: null` for both — and the reader is on the **second** word.
    expect(count(second)).toBe('1 of 2 words')
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
    await give(view, 'station')

    // ⚠️ The server's answer for this *card* says `library`; the store says
    // otherwise, and the store is what the reader was handed.
    expect(view.find('.fb.no .ans').text()).toBe('the words the reader started with')
  })
})

describe('property 5 — a rejected entry is surfaced, never dropped', () => {
  // `03` §8.2: a wrong system clock is one of the few things the reader can
  // actually fix, and a *grade* that quietly did not happen is the failure `S8`
  // exists to prevent arriving as a success.
  it('says so on the summary and stops retrying', async () => {
    const view = await open()
    server.answer = 'stamped_in_future'

    await word(view)
    await word(view)
    await vi.waitFor(() => expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([]))
    await flushPromises()

    expect(view.text()).toContain('2 answers were refused and will not be sent again')
    expect(view.text()).not.toContain('have not reached the database yet')
    expect(parseOutbox(stored(REFUSED_KEY))).toHaveLength(2)
    expect(texts(view, '.figure .v')).toEqual(['0', '0%', '0'])
    expect(texts(view, '.wrow .x')).toEqual(['refused · not recorded', 'refused · not recorded'])
  })

  // ⚠️ **An entry the server cannot read blocks the head of the stream for
  // ever**, and everything behind it with it — which is the drop this property
  // exists to prevent, arriving through the mechanism added to prevent it. A
  // `400` can never succeed, so it leaves the stream and is shown.
  it('takes a refused body out of the stream rather than retrying it at the head', async () => {
    const view = await open()
    server.unreadable = true

    await word(view)
    await vi.waitFor(() => expect(parseOutbox(stored(REFUSED_KEY))).toHaveLength(1))

    // The word behind it is reachable: the stream drained rather than stalled.
    server.unreadable = false
    await word(view)

    await vi.waitFor(() => expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([]))
    expect(server.seen).toEqual([`grade:${SECOND}`])
    expect(view.text()).toContain('1 answer was refused and will not be sent again')
    expect(texts(view, '.figure .v')).toEqual(['1', '100%', '0'])
    expect(texts(view, '.wrow .x')).toContain('refused · not recorded')
  })

  // ⚠️ **A flush that answers 401 is not a network error** (`08` §5.6, `09`
  // §4.8). It must not retry on the same backoff forever.
  it('reports an expired session on the summary rather than replaying into it', async () => {
    const view = await open()
    server.reachable = false
    server.failWith = 401

    await word(view)
    await word(view)
    await flushPromises()

    expect(view.text()).toContain('2 answers have not reached the database yet')
    expect(view.find('.sign-in').exists()).toBe(true)

    // The second entry was never attempted: the replay stopped at the 401.
    server.reachable = true
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(server.seen).toEqual([])
  })

  // ⚠️ A *Finish early* is not an answer: one the server would not take is
  // neither counted as unsent nor kept as refused.
  it('counts a finish as neither an unsent answer nor a refused one', async () => {
    const view = await open()
    server.reachable = false

    await press(view, 'Escape')

    expect(parseOutbox(stored(OUTBOX_KEY)).map(entry => entry.kind)).toEqual(['finish'])
    expect(view.find('.unsent').exists()).toBe(false)

    server.reachable = true
    server.unreadable = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([]))
    expect(parseOutbox(stored(REFUSED_KEY))).toEqual([])
    expect(view.find('.unsent').exists()).toBe(false)
  })
})

// `S9` on the screen — `09` §4.9.
describe('the flag advances without a grade', () => {
  it('takes the word out of the run with every question it owed, and counts no grade', async () => {
    const view = await open()

    await give(view, 'library')
    await press(view, 'x')

    await vi.waitFor(() => expect(server.seen).toEqual([`flag:${FIRST}`]))
    expect(count(view)).toBe('1 of 2 words')
    // ⚠️ The first word still owed its reading; the next question is the
    // second word's meaning, not that.
    expect(view.find('.quizcard .ask b').text()).toBe('Meaning')

    await give(view, 'library')
    await view.find('.flag').trigger('click')
    await flushPromises()

    // ⚠️ A run can end with no *grades* at all, and the summary says so rather
    // than inventing one (ADR 0053).
    expect(view.find('.summary').exists()).toBe(true)
    expect(texts(view, '.figure .v')).toEqual(['0', '0%', '0'])
    await vi.waitFor(() => expect(server.seen).toEqual([`flag:${FIRST}`, `flag:${SECOND}`]))
  })

  // ⚠️ ADR 0060 §7: `X` is on the result only. In the open field an `x` is the
  // first letter of a meaning.
  it('is offered on the result only, and an x typed in the field is typing', async () => {
    const view = await open()

    expect(view.find('.flag').exists()).toBe(false)

    await press(view, 'x')
    const field = view.find('.quizcard input')
    await field.setValue('x')
    await field.trigger('keydown', { key: 'x' })
    await flushPromises()

    expect(parseOutbox(stored(OUTBOX_KEY))).toEqual([])
    expect(count(view)).toBe('0 of 2 words')

    await give(view, 'library')

    expect(view.find('.flag').text()).toContain('Something is wrong with this word')
  })

  // A word the last answer completed is already graded: the flag still
  // suspends the *card*, and the summary counts what the *grade* was.
  it('keeps the grade of a word flagged after it was finished', async () => {
    const view = await open()
    server.reachable = false

    await give(view, 'library')
    await next(view)
    await give(view, 'としょかん')
    await press(view, 'x')

    expect(parseOutbox(stored(OUTBOX_KEY)).map(entry => entry.kind)).toEqual(['grade', 'flag'])

    await word(view)

    expect(texts(view, '.figure .v')).toEqual(['2', '100%', '0'])
  })
})
