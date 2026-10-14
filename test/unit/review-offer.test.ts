// What is waiting, as sentences — ADR 0076 §8: the screen before a run and the
// summary's *What next*. The wording is the prototype's Home and summary, with
// the real numbers and the real date in it.
//
// ⚠️ **A brake that is silent is a bug report** (ADR 0066 §7), so each reason
// no lesson is on offer has its own sentence, and that is what is held here.

import { describe, expect, it } from 'vitest'

import { DEFAULT_LIMITS } from '../../shared/review/limits'
import { noLessonLine, startLines, whatNext } from '../../shared/review/offer'
import type { StudyOffer } from '../../shared/review/offer'

const now = new Date(2026, 9, 10, 20, 0)
const tomorrow = new Date(2026, 9, 11, 8, 40)

const offer = (over: Partial<StudyOffer> = {}): StudyOffer => ({
  introducedToday: 0,
  dueCount: 0,
  lesson: 0,
  waiting: false,
  category: { key: 'jlpt:N5', name: 'JLPT N5' },
  limits: DEFAULT_LIMITS,
  nextDue: null,
  ...over,
})

const time = tomorrow.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

describe('the screen before a run', () => {
  it('puts reviews first when both are waiting', () => {
    expect(startLines(offer({ dueCount: 12, lesson: 5, waiting: true }), now)).toEqual({
      statement: '12 words to review, then 5 new ones.',
      body: 'Reviews first, so nothing slips.',
    })
  })

  it('counts one of each as one', () => {
    expect(startLines(offer({ dueCount: 1, lesson: 1, waiting: true }), now).statement).toBe('1 word to review, then 1 new one.')
  })

  // The prototype's day one: nothing has ever been scheduled.
  it('opens a first visit on the first lesson', () => {
    expect(startLines(offer({ lesson: 5, waiting: true }), now)).toEqual({
      statement: 'Start with your first 5 words.',
      body: 'A short lesson, then a quiz on the same words.',
    })
  })

  it('says the reviews are done and the lesson is ready, with when the next reviews are', () => {
    expect(startLines(offer({ lesson: 5, waiting: true, nextDue: tomorrow.toISOString() }), now)).toEqual({
      statement: 'Reviews are done. 5 new words are ready.',
      body: `Next reviews tomorrow, ${time}.`,
    })
  })

  it('says why no lesson follows the reviews', () => {
    const paused = offer({ dueCount: 63, waiting: true })

    expect(startLines(paused, now)).toEqual({
      statement: '63 words to review.',
      body: 'No new words while 50 or more reviews wait. 63 are waiting.',
    })
  })

  it('says all done, when the next reviews are, and why nothing is new', () => {
    const spent = offer({ introducedToday: 10, waiting: true, nextDue: tomorrow.toISOString() })

    expect(startLines(spent, now)).toEqual({
      statement: 'All done for now.',
      body: `Next reviews tomorrow, ${time}. You have had today's new words. More tomorrow, so reviews stay manageable.`,
    })
  })
})

describe('why no lesson is on offer', () => {
  it('says nothing when one is', () => {
    expect(noLessonLine(offer({ lesson: 5, waiting: true }))).toBe('')
  })

  it('names the gate and the number at it', () => {
    expect(noLessonLine(offer({ dueCount: 80, waiting: true, limits: { ...DEFAULT_LIMITS, pauseAbove: 75 } })))
      .toBe('No new words while 75 or more reviews wait. 80 are waiting.')
  })

  it('says the day is spent', () => {
    expect(noLessonLine(offer({ introducedToday: 10, waiting: true })))
      .toBe('You have had today\'s new words. More tomorrow, so reviews stay manageable.')
  })

  // ⚠️ Zero a day is the reader's own setting, not a day that ran out.
  it('says new words are switched off when the reader set none a day', () => {
    expect(noLessonLine(offer({ waiting: true, limits: { ...DEFAULT_LIMITS, dailyNew: 0 } })))
      .toBe('New words are switched off in settings.')
  })

  // ⚠️ ADR 0077 §4: of the *category*, never of the app. With N5 finished
  // there are thousands of words left, one screen away.
  it('says nothing is left in the active category, by its name', () => {
    expect(noLessonLine(offer())).toBe('There are no new words left in JLPT N5.')
    expect(noLessonLine(offer({ category: { key: 'my-words', name: 'My words' } })))
      .toBe('There are no new words left in My words.')
  })
})

describe('the summary\'s *What next*', () => {
  it('offers the reviews still waiting first', () => {
    expect(whatNext(offer({ dueCount: 8, lesson: 5, waiting: true }), now)).toEqual({
      body: '8 reviews are still waiting.',
      start: 'review',
    })
    expect(whatNext(offer({ dueCount: 1 }), now).body).toBe('1 review is still waiting.')
  })

  it('offers a lesson when no review is waiting', () => {
    expect(whatNext(offer({ lesson: 5, waiting: true, nextDue: tomorrow.toISOString() }), now)).toEqual({
      body: `Next reviews tomorrow, ${time}. You also have 5 new words ready.`,
      start: 'lesson',
    })
  })

  it('offers nothing when nothing is waiting, and says why', () => {
    expect(whatNext(offer({ introducedToday: 10, waiting: true, nextDue: tomorrow.toISOString() }), now)).toEqual({
      body: `Nothing else due. Next reviews tomorrow, ${time}. You have had today's new words. More tomorrow, so reviews stay manageable.`,
      start: null,
    })
  })

  it('says the active category has nothing left', () => {
    expect(whatNext(offer(), now).body).toBe('Nothing else due. There are no new words left in JLPT N5.')
  })
})
