// The fake server *Review*'s three nuxt-tier files mount against — one, so the
// run they describe is the same run (`11` §6.3).
//
// ⚠️ **It answers the shapes the endpoints answer and decides nothing**: which
// *grade* a word gets, which question is next and what the summary says are
// the page's, and those are what the tests assert.

import { createError, readBody } from 'h3'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { expect, vi } from 'vitest'

import Review from '../../../app/pages/review.vue'
import { DEFAULT_LIMITS } from '../../../shared/review/limits'
import type { StudyOffer } from '../../../shared/review/offer'
import type { SessionKind } from '../../../shared/review/snapshot'

export const SESSION = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
export const FIRST = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01'
export const SECOND = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02'

export const FIELDS = {
  term: '図書館',
  reading: 'としょかん',
  part_of_speech: '名詞',
  meaning: 'library',
  example_sentence: '駅の近くに図書館があります。',
  example_gloss: 'There is a library near the station.',
}

export const NOTHING_WAITING: StudyOffer = {
  introducedToday: 0,
  dueCount: 0,
  lesson: 0,
  waiting: false,
  category: { key: 'jlpt:N5', name: 'JLPT N5' },
  limits: DEFAULT_LIMITS,
  nextDue: null,
}

/** What the fake server is doing this test. */
export const server = {
  reachable: true,
  /** What an unreachable server answers — a tunnel is a 503, an expiry is a 401. */
  failWith: 503 as number,
  answer: 'ok' as 'ok' | 'stamped_in_future',
  /** A body the server cannot read — `shared/review/request.ts` answers `400`. */
  unreadable: false,
  /** Whether a run is live. `false` until a request starts one. */
  live: true,
  kind: 'review' as SessionKind,
  cards: [FIRST, SECOND],
  /** What is waiting, sent with a session answer — and with the answer that ends a run. */
  offer: NOTHING_WAITING,
  finalOffer: NOTHING_WAITING,
  /** Every body `/api/review/session` was sent. */
  starts: [] as Record<string, unknown>[],
  /** ⚠️ The order entries arrived in — property 3's whole assertion. */
  seen: [] as string[],
  /** Every body an answer endpoint was sent, in that order. */
  answers: [] as Record<string, unknown>[],
  graded: new Map<string, number>(),
  flagged: new Set<string>(),
  finished: false,
  /** Held open to observe the moment between the write and the acknowledgement. */
  gate: null as null | Promise<void>,
}

export function resetServer() {
  localStorage.clear()
  server.reachable = true
  server.failWith = 503
  server.answer = 'ok'
  server.unreadable = false
  server.live = true
  server.kind = 'review'
  server.cards = [FIRST, SECOND]
  server.offer = NOTHING_WAITING
  server.finalOffer = NOTHING_WAITING
  server.starts = []
  server.seen = []
  server.answers = []
  server.graded = new Map()
  server.flagged = new Set()
  server.finished = false
  server.gate = null
}

export function snapshot() {
  return {
    sessionId: SESSION,
    kind: server.kind,
    size: server.cards.length,
    snapshotTakenAt: '2026-09-12T09:00:00.000Z',
    positions: server.cards.map((cardId, ordinal) => ({
      ordinal,
      cardId,
      templateKey: 'recognition',
      fields: FIELDS,
      meanings: [],
      synonyms: [],
      // ADR 0069 §5: what the server would compute from 図書館's kanji.
      kanjiReadings: ['ずしょかん'],
      level: 'N3',
      stage: server.kind === 'lesson' ? null : 'familiar',
      outcome: server.graded.has(cardId)
        ? { stage: 'familiar', due: '2026-09-20T09:00:00.000Z' }
        : null,
      grade: server.graded.get(cardId) ?? null,
      flagged: server.flagged.has(cardId),
    })),
  }
}

function over() {
  return server.finished || server.cards.every(cardId => server.graded.has(cardId) || server.flagged.has(cardId))
}

registerEndpoint('/api/review/session', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody(event) as Record<string, unknown>

    if (!server.reachable)
      throw createError({ statusCode: 503 })

    server.starts.push(body)

    if (!server.live && (body.start === 'review' || body.start === 'lesson')) {
      server.live = true
      server.kind = body.start
    }

    return { session: server.live && !over() ? snapshot() : null, offer: server.offer }
  },
})

async function receive(kind: 'grade' | 'flag' | 'finish', event: Parameters<typeof readBody>[0]) {
  const body = await readBody(event) as { cardId?: string, grade?: number }

  if (!server.reachable)
    throw createError({ statusCode: server.failWith })

  if (server.unreadable)
    throw createError({ statusCode: 400, statusMessage: 'bad_card_id' })

  if (server.gate)
    await server.gate

  server.seen.push(kind === 'finish' ? 'finish' : `${kind}:${body.cardId}`)
  server.answers.push(body as Record<string, unknown>)

  if (kind === 'grade' && server.answer !== 'ok')
    return { outcome: server.answer, session: snapshot(), offer: null }

  if (kind === 'grade')
    server.graded.set(body.cardId!, body.grade!)
  else if (kind === 'flag')
    server.flagged.add(body.cardId!)
  else
    server.finished = true

  return { outcome: 'ok', session: snapshot(), offer: over() ? server.finalOffer : null }
}

registerEndpoint('/api/review/grade', { method: 'POST', handler: event => receive('grade', event) })
registerEndpoint('/api/review/flag', { method: 'POST', handler: event => receive('flag', event) })
registerEndpoint('/api/review/finish', { method: 'POST', handler: event => receive('finish', event) })

export type Mounted = Awaited<ReturnType<typeof mountSuspended>>

// ⚠️ **Every mount is unmounted**, and not for tidiness: the page listens for
// `online` on `window`, so a screen left mounted by an earlier test answers the
// next test's reconnection with its own outbox. That is the listener working —
// it is one `window` — and it is why the teardown is part of the harness.
const mounted: Mounted[] = []

/** Mount *Review* and wait for `ready` — the quiz's word, unless told otherwise. */
export async function open(ready = '.quizcard .term', route = '/review?from=/sources'): Promise<Mounted> {
  const view = await mountSuspended(Review, { route })
  mounted.push(view)
  await vi.waitFor(() => expect(view.find(ready).exists()).toBe(true))
  return view
}

export function unmountAll() {
  while (mounted.length > 0)
    mounted.pop()!.unmount()
}

export async function press(view: Mounted, key: string) {
  await view.find('.container').trigger('keydown', { key })
  await flushPromises()
}

/** Types an answer and checks it — the form's own submission, as `Enter` or *Check* makes it. */
export async function give(view: Mounted, text: string) {
  await view.find('.quizcard input').setValue(text)
  await view.find('.quizcard form').trigger('submit')
  await flushPromises()
}

/** *Next*: the result leaves and the next question is asked. */
export async function next(view: Mounted) {
  await view.find('.quizcard form').trigger('submit')
  await flushPromises()
}

/** Both of a word's questions, meaning first — right by default — and on past each result. */
export async function word(view: Mounted, meaning = 'library', reading = 'としょかん') {
  await give(view, meaning)
  await next(view)
  await give(view, reading)
  await next(view)
}

export const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null')
export const count = (view: Mounted) => view.find('.modebar .count').text()
export const asked = (view: Mounted) => view.find('.quizcard .ask b').text()

/** The text of every match — typed here, because a suspended mount's wrapper is not. */
export function texts(view: Mounted, selector: string): string[] {
  return view.findAll(selector).map((found: { text: () => string }) => found.text())
}
