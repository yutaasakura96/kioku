// @vitest-environment nuxt
//
// The quiz on the screen — ADR 0076 §3 to §6. The rules have their own unit
// tests (`test/unit/review-quiz.test.ts`, `review-answer.test.ts`); what is
// here is that the page obeys them: a miss is asked again and still counts, a
// near miss passes, an entry in the wrong script is not an answer, and nothing
// the reader can press changes a result.

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRouter } from '#imports'

import { OUTBOX_KEY, QUIZ_KEY, SNAPSHOT_KEY } from '../../app/utils/review-store'
import { parseOutbox } from '../../shared/review/outbox'
import {
  FIRST, NOTHING_WAITING, SECOND, asked, count, give, next, open, press, resetServer, server, snapshot, stored, texts, unmountAll, word,
} from './support/review-server'

beforeEach(resetServer)
afterEach(unmountAll)

const owed = () => parseOutbox(stored(OUTBOX_KEY))
const grades = () => owed().map(entry => entry.kind === 'grade' && [entry.cardId, entry.grade])

describe('one word, two questions (ADR 0076 §3)', () => {
  it('ignores touch and pointer drags, then checks through the rendered control', async () => {
    const view = await open()
    server.reachable = false
    const before = stored(QUIZ_KEY)
    const card = view.find('.quizcard')

    for (const event of ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'dragstart', 'drag'])
      await card.trigger(event)

    expect(asked(view)).toBe('Meaning')
    expect(view.find('.fb.hint').exists()).toBe(true)
    expect(view.find('.fb.ok').exists()).toBe(false)
    expect(view.find('.fb.no').exists()).toBe(false)
    expect(view.find('.quizcard button').text()).toBe('Check')
    expect(stored(QUIZ_KEY)).toEqual(before)
    expect(stored(OUTBOX_KEY)).toBeNull()
    expect(server.graded.size).toBe(0)

    await view.find('.quizcard input').setValue('library')
    const form = view.find('.quizcard form').element as HTMLFormElement
    const button = view.find('.quizcard button').element as HTMLButtonElement
    form.requestSubmit(button)
    await flushPromises()

    expect(view.find('.fb.ok').text()).toContain('Correct')
    expect(owed()).toEqual([])

    form.requestSubmit(button)
    await flushPromises()

    expect(asked(view)).toBe('Reading')
  })

  it('asks the meaning, then the reading, back to back', async () => {
    const view = await open()

    expect(asked(view)).toBe('Meaning')

    await give(view, 'library')

    expect(view.find('.fb.ok').text()).toContain('Correct')
    expect(owed(), 'a word was graded on half its questions').toEqual([])

    await next(view)

    expect(asked(view)).toBe('Reading')
    expect(view.find('.quizcard input').attributes('lang')).toBe('ja')
  })

  it('grades Good when both were right the first time', async () => {
    const view = await open()
    server.reachable = false

    await word(view)

    expect(grades()).toEqual([[FIRST, 3]])
  })

  // ADR 0069 §4: a kana word is its own reading.
  it('asks a kana-only word for its meaning alone', async () => {
    server.cards = [FIRST]
    // The fixture's fields are the server's; the run the reader holds is the
    // store's (property 4), so a kana word is put there.
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      ...snapshot(),
      positions: snapshot().positions.map(position => ({
        ...position,
        fields: { term: 'こんな', reading: 'こんな', meaning: 'like this' },
      })),
    }))
    const view = await open()
    server.reachable = false

    await give(view, 'like this')

    expect(grades()).toEqual([[FIRST, 3]])

    await next(view)

    expect(view.find('.summary').exists()).toBe(true)
    // Its row draws the word once, not the word and then the word again.
    expect(view.find('.wrow .t').text()).toBe('こんな')
    expect(view.find('.wrow small').exists()).toBe(false)
  })
})

describe('a miss is asked again, and still counts (ADR 0076 §4)', () => {
  it('sends a wrong question to the back and asks it again before the run ends', async () => {
    const view = await open()
    server.reachable = false

    await give(view, 'station')

    expect(view.find('.fb.no').text()).toContain('Not quite')
    expect(view.find('.fb.no .ans').text()).toBe('library')
    expect(view.find('.foot').text()).toBe('This one comes back before the session ends.')

    await next(view)

    // The first word's reading, then the second word, and the run is not over.
    await give(view, 'としょかん')
    await next(view)
    await word(view)

    expect(view.find('.summary').exists(), 'the run ended with a question still owed').toBe(false)
    expect(asked(view)).toBe('Meaning')
    expect(count(view)).toBe('1 of 2 words')

    await give(view, 'library')
    await next(view)

    expect(view.find('.summary').exists()).toBe(true)
  })

  // ⚠️ The criterion in its own words: *the word still counts as missed for
  // scheduling*, however many times it is then got right.
  it('grades the word Forgot once it is finally right, and the other Good', async () => {
    const view = await open()
    server.reachable = false

    await give(view, 'station')
    await next(view)
    await give(view, 'としょかん')
    await next(view)
    await word(view)
    await give(view, 'library')
    await next(view)

    expect(grades()).toEqual([[SECOND, 3], [FIRST, 1]])
    expect(texts(view, '.figure .v')).toEqual(['2', '50%', '1'])
  })

  it('asks a missed question again at once when it is the only one left', async () => {
    server.cards = [FIRST]
    const view = await open()
    server.reachable = false

    await give(view, 'library')
    await next(view)
    await give(view, 'としょか')
    await next(view)

    expect(asked(view)).toBe('Reading')

    await give(view, 'としょかん')
    await next(view)

    expect(grades()).toEqual([[FIRST, 1]])
  })

  // ⚠️ The queue is durable: a reload must not forgive a miss.
  it('keeps the miss across a reload', async () => {
    const first = await open()
    server.reachable = false
    await give(first, 'station')
    first.unmount()

    const second = await open()

    // The missed meaning went to the back: the reading is asked first.
    expect(asked(second)).toBe('Reading')

    await give(second, 'としょかん')
    await next(second)
    await word(second)
    await give(second, 'library')
    await next(second)

    expect(grades()).toEqual([[SECOND, 3], [FIRST, 1]])
  })
})

describe('what is accepted (ADR 0076 §5)', () => {
  it('accepts a near miss in the meaning and shows the spelling', async () => {
    const view = await open()
    server.reachable = false

    await give(view, 'libary')

    expect(view.find('.fb.ok').text()).toContain('Close enough. The answer is library')
    expect(stored(QUIZ_KEY).missed).toEqual([])
  })

  it('takes a reading exactly, and marks a near one wrong', async () => {
    const view = await open()
    server.reachable = false

    await give(view, 'library')
    await next(view)
    await give(view, 'としょか')

    expect(view.find('.fb.no .ans').text()).toBe('としょかん')
    expect(stored(QUIZ_KEY).missed).toEqual([FIRST])
  })

  // ⚠️ An entry in the wrong script is not an answer. Nothing is counted, the
  // question stays, and the line under the field says what it wants.
  it('refuses kana typed for a meaning without counting it', async () => {
    const view = await open()

    await give(view, 'としょかん')

    expect(view.find('#quiz-result').text()).toBe('Type the meaning in English.')
    expect(view.find('.fb.no .verdict').exists()).toBe(false)
    expect(asked(view)).toBe('Meaning')
    expect(stored(QUIZ_KEY).missed).toEqual([])
    expect(view.find('.quizcard button').text()).toBe('Check')
  })

  it('refuses English typed for a reading without counting it', async () => {
    const view = await open()

    await give(view, 'library')
    await next(view)
    await give(view, 'library')

    expect(view.find('#quiz-result').text()).toContain('Type the reading in kana.')
    expect(asked(view)).toBe('Reading')
    expect(stored(QUIZ_KEY).missed).toEqual([])
  })

  it('does nothing with an empty field', async () => {
    const view = await open()

    await give(view, '   ')

    expect(view.find('.fb.hint').exists()).toBe(true)
    expect(stored(QUIZ_KEY).missed).toEqual([])
  })

  // ⚠️ ADR 0076 §5: **no manual override.** No key changes a result or gives a
  // *grade*, and `S` no longer adds a synonym.
  it('lets no key overrule a wrong answer', async () => {
    const view = await open()
    server.reachable = false

    await give(view, 'station')

    for (const key of ['1', '2', '3', '4', 's', 'S'])
      await press(view, key)

    expect(owed()).toEqual([])
    expect(view.find('.fb.no').exists(), 'a key moved the result on').toBe(true)
    expect(stored(QUIZ_KEY).missed).toEqual([FIRST])
  })

  // ⚠️ ADR 0060 §4: the typed text and the result are not recorded.
  it('persists the grade and nothing that was typed', async () => {
    server.cards = [FIRST]
    const view = await open()
    server.reachable = false

    await give(view, 'a very particular answer')
    await next(view)
    await give(view, 'としょかん')
    await next(view)
    await give(view, 'library')
    await next(view)

    const everything = Object.keys(localStorage).map(key => localStorage.getItem(key)).join('\n')
    expect(everything).not.toContain('a very particular answer')
    expect(Object.keys(owed()[0]!).sort()).toEqual(['cardId', 'grade', 'kind', 'reviewedAt', 'seq', 'sessionId'])
  })

  it('does not check on the Enter that ends an IME conversion', async () => {
    const view = await open()
    const field = view.find('.quizcard input')
    let prevented = false
    view.element.addEventListener('keydown', (event: Event) => void (prevented = event.defaultPrevented))

    await field.setValue('らいぶ')
    await field.trigger('keydown', { key: 'Enter', isComposing: true })

    expect(prevented, 'the form would have submitted half a word').toBe(true)
  })
})

// ADR 0069 §5, #30: a reading of the kanji typed for the word's is a retry, once.
describe('a kanji\'s reading is a retry, not a miss', () => {
  async function toReading() {
    const view = await open()
    server.reachable = false
    await give(view, 'library')
    await next(view)
    return view
  }

  it('says so, empties the field, stays on the reading and counts nothing', async () => {
    const view = await toReading()

    await give(view, 'ずしょかん')

    expect(view.find('#quiz-result').text()).toBe('That is a reading of the kanji, not of this word. Try once more.')
    expect((view.find('.quizcard input').element as HTMLInputElement).value).toBe('')
    expect(stored(QUIZ_KEY).missed).toEqual([])

    await give(view, 'としょかん')

    expect(view.find('.fb.ok').text()).toContain('Correct')
    expect(grades()).toEqual([[FIRST, 3]])
  })

  // ⚠️ One per asking, or the reader walks the kanji's readings until one passes.
  it('marks a second kanji reading wrong', async () => {
    const view = await toReading()

    await give(view, 'ずしょかん')
    await give(view, 'ずしょかん')

    expect(view.find('.fb.no').text()).toContain('Not quite')
    expect(stored(QUIZ_KEY).missed).toEqual([FIRST])
  })
})

describe('finishing early (ADR 0076 §6)', () => {
  // ⚠️ Ending the run must not be the way to take a miss back.
  it('grades a missed word Forgot, leaves an unreached one alone, and ends the run', async () => {
    const view = await open()

    await give(view, 'station')
    await next(view)
    await view.find('.modebar .exit').trigger('click')
    await flushPromises()

    expect(view.find('.summary .statement').text()).toBe('Session finished early.')
    expect(view.find('.left').text()).toBe('1 word was not reached and is still due.')
    await vi.waitFor(() => expect(server.seen).toEqual([`grade:${FIRST}`, 'finish']))
    expect(server.graded.get(FIRST)).toBe(1)
    expect(server.graded.has(SECOND)).toBe(false)
  })

  it('finishes on Escape, from the field too', async () => {
    const view = await open()

    await view.find('.quizcard input').trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(view.find('.summary').exists()).toBe(true)
    await vi.waitFor(() => expect(server.seen).toEqual(['finish']))
  })

  it('stays finished across a reload', async () => {
    const first = await open()
    server.reachable = false
    await press(first, 'Escape')
    first.unmount()

    const second = await open('.summary')

    expect(second.find('.quizcard').exists()).toBe(false)
  })

  // ⚠️ The run ended by being answered. *Finish early* on the last result is
  // *Next* by another key: no early summary, and no `finish` in the stream.
  it.each([
    ['Escape', (view: Awaited<ReturnType<typeof open>>) => press(view, 'Escape')],
    ['the exit control', (view: Awaited<ReturnType<typeof open>>) => view.find('.modebar .exit').trigger('click')],
  ])('shows the ordinary summary when every word is already answered (%s)', async (_name, finishEarly) => {
    server.cards = [FIRST]
    const view = await open()
    server.reachable = false

    await give(view, 'library')
    await next(view)
    await give(view, 'としょかん')
    expect(view.find('.fb.ok').exists()).toBe(true)

    await finishEarly(view)
    await flushPromises()

    expect(view.find('.summary .statement').text()).toBe('Reviews done.')
    expect(view.find('.left').exists()).toBe(false)
    expect(owed().map(entry => entry.kind)).toEqual(['grade'])
  })
})

// ⚠️ The offer that came with the run was counted before it was answered. The
// summary draws only the one that comes back with the answer that ends it.
describe('the summary before its offer lands (ADR 0076 §8)', () => {
  beforeEach(() => {
    server.offer = { ...NOTHING_WAITING, dueCount: 2 }
    server.finalOffer = { ...NOTHING_WAITING, dueCount: 7 }
  })

  it('draws no count and no start control while the last answer is unsent, then the fresh one', async () => {
    const view = await open()
    server.reachable = false

    await word(view)
    await word(view)

    expect(view.find('.summary .statement').text()).toBe('Reviews done.')
    expect(view.find('.next').text()).not.toContain('waiting')
    expect(texts(view, '.next .btn')).toEqual(['Back to Sources'])

    server.reachable = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(view.find('.next').text()).toContain('7 reviews are still waiting.'))
    expect(texts(view, '.next .btn')).toEqual(['Carry on with reviews', 'Back to Sources'])
  })

  it('does the same when the run is finished early', async () => {
    const view = await open()
    server.reachable = false

    await press(view, 'Escape')

    expect(view.find('.summary .statement').text()).toBe('Session finished early.')
    expect(view.find('.next').text()).not.toContain('waiting')
    expect(texts(view, '.next .btn')).toEqual(['Back to Sources'])

    server.reachable = true
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(() => expect(view.find('.next').text()).toContain('7 reviews are still waiting.'))
    await flushPromises()
  })
})

describe('a lesson (ADR 0076 §1)', () => {
  beforeEach(() => {
    server.live = false
    server.offer = { ...NOTHING_WAITING, lesson: 2, waiting: true }
  })

  async function openLesson() {
    return open('.lesson .term', '/review?start=lesson&from=/')
  }

  it('starts from the start block\'s link, once, and takes the link out of the address', async () => {
    await openLesson()

    expect(server.starts.map(body => body.start)).toEqual(['lesson'])
    await vi.waitFor(() => expect(useRouter().currentRoute.value.query).toEqual({ from: '/' }))
  })

  it('teaches each word before any question, one a screen', async () => {
    const view = await openLesson()

    expect(view.find('.modebar .name').text()).toBe('Lesson')
    expect(count(view)).toBe('word 1 of 2')
    expect(view.find('.lesson .meaning').text()).toBe('library')
    expect(view.find('.quizcard').exists()).toBe(false)
    expect(view.find('.foot').text()).toBe('Take a moment with each word. The quiz comes after all 2.')

    await view.find('.rowbtns .btn:not(.ghost)').trigger('click')

    expect(count(view)).toBe('word 2 of 2')
    expect(view.find('.rowbtns .btn:not(.ghost)').text()).toBe('Quiz me on these 2')
    expect(view.find('.foot').text()).toBe('Get a word right in the quiz and it enters your reviews.')

    await view.find('.rowbtns .btn.ghost').trigger('click')

    expect(count(view)).toBe('word 1 of 2')
  })

  it('then quizzes on the same words, and a word got right is graded Good', async () => {
    const view = await openLesson()
    server.reachable = false

    await view.find('.rowbtns .btn:not(.ghost)').trigger('click')
    await view.find('.rowbtns .btn:not(.ghost)').trigger('click')

    expect(view.find('.modebar .name').text()).toBe('Lesson quiz')
    expect(view.find('.lesson').exists()).toBe(false)

    await word(view)
    await word(view)

    expect(grades()).toEqual([[FIRST, 3], [SECOND, 3]])
    expect(view.find('.summary .statement').text()).toBe('2 new words learned.')
  })

  // ⚠️ Leaving the teaching is a pause: nothing is ended and the lesson is
  // where it was.
  it('leaves the teaching by a link out that ends nothing', async () => {
    const view = await openLesson()
    const leave = view.find('.modebar .exit')

    expect(leave.text()).toBe('Leave')
    expect(leave.attributes('href')).toBe('/')
    expect(owed()).toEqual([])
  })

  it('resumes the teaching on the word the reader was on', async () => {
    const first = await openLesson()
    await first.find('.rowbtns .btn:not(.ghost)').trigger('click')
    first.unmount()

    const second = await open('.lesson .term')

    expect(count(second)).toBe('word 2 of 2')

    // ⚠️ The screen painted from the store, ahead of the server's answer. Let
    // that land before the test ends, or it lands in the next test's store.
    await vi.waitFor(() => expect(server.starts).toHaveLength(2))
    await flushPromises()
    expect(count(second)).toBe('word 2 of 2')
  })

  // ⚠️ A new word enters reviews by being got right. One that was not is
  // taught again, so finishing a lesson early grades nothing.
  it('grades nothing when a lesson\'s quiz is finished early', async () => {
    const view = await openLesson()

    await view.find('.rowbtns .btn:not(.ghost)').trigger('click')
    await view.find('.rowbtns .btn:not(.ghost)').trigger('click')
    await give(view, 'station')
    await next(view)
    await press(view, 'Escape')

    await vi.waitFor(() => expect(server.seen).toEqual(['finish']))
    // ⚠️ Let the answer land before the test ends, or it lands in the next test's store.
    await flushPromises()
    expect(view.find('.summary .statement').text()).toBe('Lesson finished early.')
    expect(view.find('.left').text()).toBe('2 words were not finished and will be taught again in the next lesson.')
  })

  // ⚠️ A lesson's size is the lesson's, not the *session*-size knob: a lesson
  // restored from the store must not cap the review run started after it.
  it('leaves the session size alone when a held lesson is restored', async () => {
    server.finalOffer = { ...NOTHING_WAITING, dueCount: 30 }
    const first = await openLesson()
    first.unmount()

    const view = await open('.lesson .term')
    await vi.waitFor(() => expect(server.starts).toHaveLength(2))
    await flushPromises()

    await view.find('.rowbtns .btn:not(.ghost)').trigger('click')
    await view.find('.rowbtns .btn:not(.ghost)').trigger('click')
    await press(view, 'Escape')
    await vi.waitFor(() => expect(view.find('.next button').text()).toBe('Start reviews · 30 due'))

    await view.find('.next button').trigger('click')

    await vi.waitFor(() => expect(server.starts.at(-1)).toMatchObject({ start: 'review', size: 20 }))
    await flushPromises()
  })
})
