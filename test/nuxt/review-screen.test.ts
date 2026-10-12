// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import LessonCard from '../../app/components/LessonCard.vue'
import ModeBar from '../../app/components/ModeBar.vue'
import PlaceShell from '../../app/components/PlaceShell.vue'
import QuizCard from '../../app/components/QuizCard.vue'
import SessionSummary from '../../app/components/SessionSummary.vue'
import SessionTally from '../../app/components/SessionTally.vue'
import SessionFilterControls from '../../app/components/SessionFilterControls.vue'
import StartBlock from '../../app/components/StartBlock.vue'
import { DEFAULT_LIMITS } from '../../shared/review/limits'
import { jlptVocab } from '../../shared/subject/declaration'
import type { QuizFeedback } from '../../app/components/QuizCard.vue'
import type { StudyOffer } from '../../shared/review/offer'
import type { ReviewPosition } from '../../shared/review/snapshot'

// *Review*'s drawn components, since ADR 0076. Each of these assertions is
// about something that is invisible when it is wrong:
//
// - ⚠️ **The quiz card shows the word and never its answer** until the answer
//   has been given. A *card* that leaked its meaning onto the question would
//   still look like a question, and the only thing that would ever say so is
//   the retention curve months later.
// - ⚠️ **The band is the only thing that tells the two questions apart**, so it
//   says which in words and not by colour alone.
// - ⚠️ **The summary says where a word went from what the server recorded**,
//   never from arithmetic done on the screen.

const FIELDS = {
  term: '図書館',
  reading: 'としょかん',
  part_of_speech: '名詞',
  meaning: 'library; book room',
  example_sentence: '駅の近くに図書館があります。',
  example_gloss: 'There is a library near the station.',
}

/** A starter word (ADR 0075 §7): no example sentence. */
const STARTER = { term: '会う', reading: 'あう', part_of_speech: '動詞', meaning: 'to meet; to encounter; to see; to have an accident' }

describe('a lesson\'s word (ADR 0076 §1)', () => {
  const lesson = (fields: Record<string, string>, level: string | null = 'N5') =>
    mountSuspended(LessonCard, { props: { fields, level } })

  it('shows the word, its reading, its meaning, its part of speech and its level', async () => {
    const view = await lesson(FIELDS)

    expect(view.find('.term').text()).toBe('図書館')
    expect(view.find('.reading').text()).toBe('としょかん')
    expect(view.find('.meaning').text()).toBe('library')
    expect(view.findAll('.tag').map(tag => tag.text())).toEqual(['名詞', 'JLPT N5'])
    expect(view.find('.example').text()).toContain('駅の近くに図書館があります。')
  })

  // ⚠️ The quiz accepts any piece of the gloss (ADR 0069 §3), so a lesson that
  // showed one would be teaching a narrower answer than the one it will take.
  it('shows the other meanings the quiz will accept, three at most', async () => {
    const view = await lesson(STARTER)

    expect(view.find('.meaning').text()).toBe('to meet')
    expect(view.find('.others').text()).toBe('Also: to encounter, to see, to have an accident')
  })

  // ADR 0075 §7: a word from the dictionary has no example sentence. Nothing
  // is invented and no empty slot is drawn.
  it('draws a word with no example without leaving a gap for one', async () => {
    const view = await lesson(STARTER)

    expect(view.find('.example').exists()).toBe(false)
    expect(view.findAll('p').every(paragraph => paragraph.text() !== '')).toBe(true)
  })

  it('draws no level for a word no list places', async () => {
    const view = await lesson(FIELDS, null)

    expect(view.findAll('.tag').map(tag => tag.text())).toEqual(['名詞'])
  })

  // `05` §4: Mincho carries every Japanese glyph and Newsreader every English
  // one. The `:lang(ja)` hook in `tokens.css` is what does it, so the attribute
  // is the assertion.
  it('marks the Japanese so Mincho reaches it', async () => {
    const view = await lesson(FIELDS)

    expect(view.find('.term').attributes('lang')).toBe('ja')
    expect(view.find('.reading').attributes('lang')).toBe('ja')
    expect(view.find('.meaning').attributes('lang')).toBeUndefined()
  })
})

describe('one question (ADR 0076 §3, §5)', () => {
  const quiz = (part: 'meaning' | 'reading', feedback: QuizFeedback | null = null, problem: string | null = null) =>
    mountSuspended(QuizCard, {
      props: { fields: FIELDS, part, feedback, problem, refusals: 0, clearings: 0 },
    })

  it('shows the word and neither of its answers while the question is open', async () => {
    const view = await quiz('meaning')

    expect(view.find('.term').text()).toBe('図書館')
    expect(view.text()).not.toContain('library')
    expect(view.text()).not.toContain('としょかん')
    expect(view.find('.more-info').exists()).toBe(false)
  })

  it('says which half it is asking, in words', async () => {
    expect((await quiz('meaning')).find('.ask').text()).toContain('Meaning')
    expect((await quiz('meaning')).find('.ask').text()).toContain('Answer in English')
    expect((await quiz('reading')).find('.ask').text()).toContain('Reading')
    expect((await quiz('reading')).find('.ask').text()).toContain('kana')
  })

  it('labels the field for the half it takes, and marks a reading as Japanese', async () => {
    const meaning = (await quiz('meaning')).find('input')
    const reading = (await quiz('reading')).find('input')

    expect(meaning.attributes('aria-label')).toBe('Meaning')
    expect(meaning.attributes('lang')).toBeUndefined()
    expect(reading.attributes('aria-label')).toBe('Reading')
    expect(reading.attributes('lang')).toBe('ja')
  })

  // ⚠️ **By key or by pointer** (ADR 0036, `10` §10.3): a phone has no `Enter`,
  // so the check has to be a real button — one, that becomes *Next*.
  it('checks what was typed through its one control', async () => {
    const view = await quiz('meaning')

    await view.find('input').setValue('library')
    await view.find('form').trigger('submit')

    expect(view.findAll('button')).toHaveLength(1)
    expect(view.find('button').text()).toBe('Check')
    expect(view.emitted('check')).toEqual([['library']])
  })

  it('moves on through the same control once the result is shown', async () => {
    const view = await quiz('meaning', { right: true, close: false, typed: 'library', also: [] })

    expect(view.find('button').text()).toBe('Next')
    expect(view.find('input').attributes('readonly')).toBeDefined()

    await view.find('form').trigger('submit')

    expect(view.emitted('next')).toHaveLength(1)
    expect(view.emitted('check')).toBeUndefined()
  })

  it('says a right answer is right, and names what else would have been', async () => {
    const view = await quiz('meaning', { right: true, close: false, typed: 'library', also: ['book room'] })

    expect(view.find('.fb.ok').text()).toContain('Correct')
    expect(view.find('.fb.ok').text()).toContain('Also: book room')
  })

  // ADR 0076 §5: a near miss is accepted and the reader is shown the spelling.
  it('says a near miss was close enough, and shows the answer', async () => {
    const view = await quiz('meaning', { right: true, close: true, typed: 'libary', also: [] })

    expect(view.find('.fb.ok').text()).toContain('Close enough. The answer is library, book room')
  })

  it('says a wrong answer is wrong and gives the answer for the half that was asked', async () => {
    const meaning = await quiz('meaning', { right: false, close: false, typed: 'station', also: [] })
    const reading = await quiz('reading', { right: false, close: false, typed: 'としょか', also: [] })

    expect(meaning.find('.fb.no').text()).toContain('Not quite')
    expect(meaning.find('.fb.no .ans').text()).toBe('library, book room')
    expect(reading.find('.fb.no .ans').text()).toBe('としょかん')
    expect(reading.find('.fb.no .ans').attributes('lang')).toBe('ja')
  })

  // ⚠️ ADR 0076 §5: **no manual override.** Nothing on the result changes it.
  it('offers nothing that changes the result', async () => {
    const view = await quiz('meaning', { right: false, close: false, typed: 'station', also: [] })

    expect(view.findAll('button').map(button => button.text())).toEqual(['Next'])
    expect(view.text()).not.toMatch(/synonym|I was right|Hard|Easy/i)
  })

  it('says why an entry was not taken, in the place the result goes', async () => {
    const view = await quiz('meaning', null, 'Type the meaning in English.')

    expect(view.find('#quiz-result').text()).toBe('Type the meaning in English.')
    expect(view.find('#quiz-result').attributes('role')).toBe('status')
    expect(view.find('input').attributes('aria-describedby')).toBe('quiz-result')
  })

  it('opens the whole word only after the answer', async () => {
    const view = await quiz('reading', { right: true, close: false, typed: 'としょかん', also: [] })

    expect(view.find('.more-info').text()).toContain('library, book room')
    expect(view.find('.more-info').text()).toContain('駅の近くに図書館があります。')
  })
})

describe('the header (ADR 0076 §8)', () => {
  it('is a name, one track with the count as its text, and the way out', async () => {
    const view = await mountSuspended(ModeBar, {
      props: { name: 'Reviews', progress: 0.25, count: '3 of 12 words' },
      slots: { exit: '<button class="exit">Finish early</button>' },
    })
    const track = view.find('[role=progressbar]')

    expect(view.find('.name').text()).toBe('Reviews')
    expect(track.attributes('aria-valuenow')).toBe('25')
    expect(track.attributes('aria-valuetext')).toBe('3 of 12 words')
    expect(view.find('.count').text()).toBe('3 of 12 words')
    expect(view.find('.exit').text()).toBe('Finish early')
  })

  it('draws no track on a screen with nothing to be through', async () => {
    const view = await mountSuspended(ModeBar, { props: { name: 'Study' } })

    expect(view.find('[role=progressbar]').exists()).toBe(false)
  })
})

const OFFER: StudyOffer = {
  introducedToday: 5,
  dueCount: 0,
  lesson: 0,
  waiting: false,
  limits: DEFAULT_LIMITS,
  nextDue: null,
}

function position(index: number, extra: Partial<ReviewPosition> = {}): ReviewPosition {
  return {
    ordinal: index,
    cardId: `0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a0${index}`,
    templateKey: 'recognition',
    fields: { ...FIELDS, term: `語${index}` },
    meanings: [],
    synonyms: [],
    kanjiReadings: [],
    level: 'N5',
    stage: null,
    outcome: null,
    grade: null,
    flagged: false,
    ...extra,
  }
}

/** Noon, `days` local days from today — `backIn` counts calendar days. */
function inDays(days: number): string {
  const today = new Date()

  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, 12).toISOString()
}

describe('the summary (ADR 0076 §7, §8)', () => {
  const summary = (props: Record<string, unknown>) =>
    mountSuspended(SessionSummary, {
      props: {
        kind: 'review',
        early: false,
        positions: [],
        offer: OFFER,
        filtered: false,
        unsent: 0,
        refused: [],
        sessionExpired: false,
        home: { to: '/', name: 'Home' },
        ...props,
      },
    })

  it('counts the words, the share right first try, and the missed', async () => {
    const view = await summary({
      positions: [
        position(0, { grade: 3, stage: 'learning', outcome: { stage: 'familiar', due: inDays(9) } }),
        position(1, { grade: 3, stage: 'known', outcome: { stage: 'known', due: inDays(40) } }),
        position(2, { grade: 1, stage: 'familiar', outcome: { stage: 'learning', due: inDays(1) } }),
        position(3, { flagged: true }),
      ],
    })

    expect(view.find('.statement').text()).toBe('Reviews done.')
    expect(view.findAll('.figure .v').map(figure => figure.text())).toEqual(['3', '67%', '1'])
  })

  // ⚠️ Where a word went is what the server recorded — the stage it came with,
  // the stage the *grade* left it at, and the real due date.
  it('says where each word went, the missed ones first', async () => {
    const view = await summary({
      positions: [
        position(0, { grade: 3, stage: 'learning', outcome: { stage: 'familiar', due: inDays(9) } }),
        position(1, { grade: 1, stage: 'familiar', outcome: { stage: 'learning', due: inDays(1) } }),
      ],
    })
    const lists = view.findAll('.sumlist')

    expect(lists).toHaveLength(2)
    expect(lists[0]!.text()).toContain('Missed · 1')
    expect(lists[0]!.find('.wrow .t').text()).toBe('語1')
    expect(lists[0]!.find('.wrow .x').text()).toBe('down to Learning · back tomorrow')
    expect(lists[1]!.text()).toContain('Right first try · 1')
    expect(lists[1]!.find('.wrow .x').text()).toBe('up to Familiar · back in 9 days')
  })

  // ⚠️ An answer still in the outbox has no outcome. The row says so rather
  // than promising a schedule nothing has computed.
  it('says an answer has not been sent rather than inventing where it went', async () => {
    const view = await summary({ positions: [position(0, { grade: 3 })], unsent: 1 })

    expect(view.find('.wrow .x').text()).toBe('not sent yet')
    expect(view.find('.unsent').text()).toContain('1 answer has not reached the database yet')
  })

  it('names a lesson by what was learned', async () => {
    const view = await summary({
      kind: 'lesson',
      positions: [
        position(0, { grade: 3, outcome: { stage: 'learning', due: inDays(2) } }),
        position(1, { grade: 1, outcome: { stage: 'learning', due: inDays(1) } }),
      ],
    })

    expect(view.text()).toContain('Lesson complete')
    expect(view.find('.statement').text()).toBe('2 new words learned.')
    expect(view.find('.wrow .x').text()).toBe('now Learning · back tomorrow')
    expect(view.find('.next').text()).toContain('These 2 words are in your reviews now')
  })

  // ADR 0076 §6: what a run that stopped short left behind, by kind.
  it('says what finishing early left, and where it went', async () => {
    const review = await summary({ early: true, positions: [position(0, { grade: 1 }), position(1), position(2)] })
    const lesson = await summary({ kind: 'lesson', early: true, positions: [position(0), position(1)] })

    expect(review.find('.statement').text()).toBe('Session finished early.')
    expect(review.find('.left').text()).toBe('2 words were not reached and are still due.')
    expect(lesson.find('.statement').text()).toBe('Lesson finished early.')
    expect(lesson.find('.left').text()).toBe('2 words were not finished and will be taught again in the next lesson.')
  })

  // ⚠️ `S7`: the summary shows the run's numbers and **never** starts the next
  // one. Starting another is a control that says which run it starts.
  it('offers the run that is waiting, and starts it only when asked', async () => {
    const view = await summary({ offer: { ...OFFER, dueCount: 7 } })
    const start = view.find('.next button')

    expect(start.text()).toBe('Carry on with reviews')
    expect(view.emitted('start')).toBeUndefined()

    await start.trigger('click')

    expect(view.emitted('start')).toEqual([['review']])
  })

  it('offers a lesson when no review is waiting and one is on offer', async () => {
    const view = await summary({ offer: { ...OFFER, lesson: 5, waiting: true } })

    expect(view.find('.next button').text()).toBe('Start lesson · 5 new words')
  })

  it('offers only the way out when nothing is waiting, and says why no lesson is', async () => {
    const view = await summary({ offer: { ...OFFER, introducedToday: 10, waiting: true } })

    expect(view.find('.next button').exists()).toBe(false)
    expect(view.find('.next').text()).toContain('You have had today\'s new words.')
    expect(view.find('.next a').text()).toBe('Back to Home')
    expect(view.find('.next a').attributes('href')).toBe('/')
  })

  it('names the place the way out goes to', async () => {
    const view = await summary({ home: { to: '/stats', name: 'Stats' } })

    expect(view.find('.next a').text()).toBe('Back to Stats')
    expect(view.find('.next a').attributes('href')).toBe('/stats')
  })

  // `09` §4.8: a flush that answered 401 is not a network error.
  it('offers the door when the session expired with answers unsent', async () => {
    const view = await summary({ positions: [position(0, { grade: 3 })], unsent: 1, sessionExpired: true })

    expect(view.find('.sign-in').attributes('href')).toBe('/auth')
  })

  it('says an answer was refused, and that it will not be sent again', async () => {
    const view = await summary({ refused: [
      { kind: 'flag', sessionId: 'run', cardId: 'a', seq: 1 },
      { kind: 'flag', sessionId: 'run', cardId: 'b', seq: 2 },
    ] })

    expect(view.find('.unsent').text()).toContain('2 answers were refused and will not be sent again')
  })

  it('keeps a refused grade out of the totals and labels its row as not recorded', async () => {
    const refused = position(0, { grade: 1 })
    const landed = position(1, { grade: 3, outcome: { stage: 'familiar', due: inDays(9) } })
    const view = await summary({
      positions: [refused, landed],
      refused: [{ kind: 'grade', sessionId: 'run', cardId: refused.cardId, grade: 1, reviewedAt: new Date().toISOString(), seq: 1 }],
    })

    expect(view.findAll('.figure .v').map(figure => figure.text())).toEqual(['1', '100%', '0'])
    expect(view.find('.sumlist').text()).toContain('Right first try · 1')
    expect(view.findAll('.wrow .x').map(row => row.text())).toContain('refused · not recorded')
    expect(view.text()).not.toContain('not sent yet')
  })

  it('does not call a refused lesson word learned', async () => {
    const refused = position(0, { grade: 3 })
    const view = await summary({
      kind: 'lesson',
      positions: [refused],
      refused: [{ kind: 'grade', sessionId: 'run', cardId: refused.cardId, grade: 3, reviewedAt: new Date().toISOString(), seq: 1 }],
    })

    expect(view.find('.statement').text()).toBe('Lesson complete.')
    expect(view.findAll('.figure .v').map(figure => figure.text())).toEqual(['0', '0%', '0'])
    expect(view.find('.wrow .x').text()).toBe('refused · not recorded')
  })
})

describe('the session tally (`05` §7, `10` §11)', () => {
  // Stats still draws its figures with it; *Review*'s summary has its own.
  it('takes its column count from what it is given', async () => {
    const five = await mountSuspended(SessionTally, {
      props: {
        columns: [
          { eyebrow: 'A', figure: 1 },
          { eyebrow: 'B', figure: 2 },
          { eyebrow: 'C', figure: 3 },
          { eyebrow: 'D', figure: 4 },
          { eyebrow: 'E', figure: '5 / 7' },
        ],
      },
    })

    expect(five.findAll('.column')).toHaveLength(5)
    expect(five.text()).toContain('5 / 7')
  })
})

// ADR 0065 §5 — the *session* filter. ⚠️ **Its values are the declaration's**,
// so a second *domain* in `subjects/jlpt-vocab.json` is a second checkbox and
// nothing here; and **it says it touches new words only**, because a reader who
// believed their reviews were filtered would be reading the screen wrong.
describe('the session filter (ADR 0065 §5)', () => {
  const controls = (filter = { domains: [] as string[], levels: [] as string[] }) =>
    mountSuspended(SessionFilterControls, { props: { modelValue: filter, declaration: jlptVocab } })

  it('offers every declared domain and level, and says it filters new words only', async () => {
    const view = await controls()

    expect(view.findAll('input[type=checkbox]').map(box => box.attributes('value'))).toEqual([
      ...jlptVocab.domains,
      ...jlptVocab.levels,
    ])
    expect(view.text()).toContain('New words only')
    expect(view.text()).toContain('reviews are never filtered')
  })

  it('keeps the declaration order whatever order the boxes are ticked in', async () => {
    const view = await controls({ domains: ['business'], levels: [] })

    await view.find('input[value=tech]').setValue(true)

    expect(view.emitted('update:modelValue')).toEqual([[{ domains: ['tech', 'business'], levels: [] }]])
  })
})

// ADR 0076 §8: the start block names the two runs apart, and each control
// asks for its own.
describe('the start block\'s two runs', () => {
  it('links a review run and a lesson separately, each by what it starts', async () => {
    const view = await mountSuspended(StartBlock, { props: { origin: '/sources', flagged: 2, due: 7, newToday: 5 } })
    const links = view.findAll('a').map(link => link.attributes('href'))

    expect(links).toContain('/review?start=review&from=%2Fsources')
    expect(links).toContain('/review?start=lesson&from=%2Fsources')
    expect(view.text()).toContain('7')
    expect(view.text()).toContain('5')
  })
})

// #30: EDRDG's licence §3 asks for the acknowledgement on the app's site, with
// links. The *shell* carries it, so every *place* does and no *mode* does.
// ⚠️ #68 added the starter set's two sources in front of it (ADR 0075 §8):
// JMdict under the same licence, and the JLPT lists, whose CC BY terms ask for
// Jonathan Waller's site to be credited.
describe('the acknowledgements under a place', () => {
  it('credits JMdict, the JLPT lists and KANJIDIC2, each with its links', async () => {
    const view = await mountSuspended(PlaceShell, { props: { origin: '/stats', flagged: 0, due: 0, newToday: 0 } })
    const footer = view.find('footer')

    expect(footer.text()).toContain('JMdict')
    expect(footer.text()).toContain('Jonathan Waller')
    expect(footer.text()).toContain('KANJIDIC2')
    expect(footer.text()).toContain('EDRDG')
    expect(footer.findAll('a').map(link => link.attributes('href'))).toEqual([
      'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
      'https://www.edrdg.org/edrdg/licence.html',
      'https://creativecommons.org/licenses/by-sa/4.0/',
      'https://www.tanos.co.uk/jlpt/',
      'https://www.tanos.co.uk/jlpt/sharing/',
      'https://github.com/stephenmk/yomitan-jlpt-vocab',
      'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
    ])
  })
})
