import { describe, expect, it } from 'vitest'

import {
  choiceText,
  declaredLevel,
  isRight,
  knownLevels,
  nextQuestion,
  parseAnswers,
  placedLevel,
  placementQuestion,
  resultBody,
  resultHeadline,
  scoreAnswers,
  startLevel,
  tally,
} from '../../shared/level/placement'
import type { PlacementQuestion, PlacementWord } from '../../shared/level/placement'
import { PLACEMENT_CHOICES, PLACEMENT_PASS_MARK, PLACEMENT_WORDS_PER_LEVEL } from '../../shared/level/thresholds'

// ADR 0079 §1 — the placement test, the prototype's `vPlacement`.
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']

const word = (noteId: string, level: string, meaning: string, partOfSpeech = 'noun'): PlacementWord =>
  ({ noteId, level, term: noteId, meaning, partOfSpeech })

/** A test of five questions a level, ids `N5-0` to `N1-4`. */
function fullTest(): PlacementQuestion[] {
  return LEVELS.flatMap(level => Array.from({ length: PLACEMENT_WORDS_PER_LEVEL }, (_, index) => ({
    noteId: `${level}-${index}`,
    level,
    term: `${level}-${index}`,
    choices: [],
    answer: '',
  })))
}

/** Answer the test as it asks, right while `knows(level, index)` says so. */
function walk(knows: (level: string, index: number) => boolean) {
  const questions = fullTest()
  const answers: Array<{ noteId: string, right: boolean }> = []

  for (let question = nextQuestion(questions, answers); question; question = nextQuestion(questions, answers)) {
    const [level, index] = question.noteId.split('-')
    answers.push({ noteId: question.noteId, right: knows(level!, Number(index)) })
  }

  return answers
}

describe('the thresholds', () => {
  it('ask about twenty-five words, five levels of five, with four choices each', () => {
    expect(PLACEMENT_WORDS_PER_LEVEL * LEVELS.length).toBe(25)
    expect(PLACEMENT_PASS_MARK).toBe(4)
    expect(PLACEMENT_CHOICES).toBe(4)
  })
})

describe('choiceText', () => {
  it('shows the gloss\'s first two pieces', () => {
    expect(choiceText('to meet; to encounter; to see')).toBe('to meet; to encounter')
    expect(choiceText('water')).toBe('water')
  })
})

describe('placementQuestion', () => {
  const pool = [
    word('a', 'N5', 'water'),
    word('b', 'N5', 'fire'),
    word('c', 'N5', 'tree'),
    word('d', 'N5', 'money'),
    word('e', 'N5', 'to eat', 'godan verb'),
    word('f', 'N5', 'blue; azure'),
    word('g', 'N5', 'blue; azure', 'い adjective'),
  ]

  it('draws four choices, the right one among them, none repeated', () => {
    const question = placementQuestion(pool[0]!, pool, () => 0.3)

    expect(question.choices).toHaveLength(PLACEMENT_CHOICES)
    expect(question.choices).toContain('water')
    expect(question.answer).toBe('water')
    expect(new Set(question.choices).size).toBe(PLACEMENT_CHOICES)
  })

  it('never offers a wrong choice that shares a meaning with the right one', () => {
    // 青 and 青い are both *blue; azure* in the starter set.
    for (let seed = 0; seed < 20; seed += 1) {
      const question = placementQuestion(pool[5]!, pool, () => (seed % 10) / 10)
      expect(question.choices.filter(choice => choice.includes('blue'))).toEqual(['blue; azure'])
    }
  })

  it('prefers wrong choices of the same word class', () => {
    const verbs = [
      word('v1', 'N4', 'to collect', 'ichidan verb'),
      word('v2', 'N4', 'to throw away', 'godan verb'),
      word('v3', 'N4', 'to decide', 'ichidan verb'),
      word('v4', 'N4', 'to borrow', 'ichidan verb'),
      word('n1', 'N4', 'economy'),
      word('n2', 'N4', 'politics'),
    ]
    const question = placementQuestion(verbs[0]!, verbs, () => 0.5)

    expect(question.choices.every(choice => choice.startsWith('to '))).toBe(true)
  })
})

describe('isRight', () => {
  it('is the word\'s own choice, and never *I do not know*', () => {
    expect(isRight({ choice: 'to meet; to encounter' }, 'to meet; to encounter; to see')).toBe(true)
    expect(isRight({ choice: 'fire' }, 'water')).toBe(false)
    expect(isRight({ choice: null }, 'water')).toBe(false)
  })
})

describe('nextQuestion — the test stops early', () => {
  it('asks every word of a level the reader keeps getting half right, then stops', () => {
    // Right, wrong, right, wrong: two misses at a pass mark of four out of five.
    const answers = walk((level, index) => level === 'N5' && index % 2 === 0)

    expect(answers.map(answer => answer.noteId)).toEqual(['N5-0', 'N5-1', 'N5-2', 'N5-3'])
  })

  it('leaves a level as soon as it is passed', () => {
    const answers = walk(level => level === 'N5')

    // Four right at N5, then two misses end N4.
    expect(answers.map(answer => answer.noteId)).toEqual(['N5-0', 'N5-1', 'N5-2', 'N5-3', 'N4-0', 'N4-1'])
  })

  it('asks no more than twenty-five words of a reader who knows everything', () => {
    const answers = walk(() => true)

    expect(answers).toHaveLength(LEVELS.length * PLACEMENT_PASS_MARK)
  })

  it('ends at once for a reader who knows nothing at N5', () => {
    expect(walk(() => false).map(answer => answer.noteId)).toEqual(['N5-0', 'N5-1'])
  })

  it('stops at a level with too few words to pass', () => {
    const questions = fullTest().filter(question => question.level !== 'N3' || question.noteId === 'N3-0')
    const answers = LEVELS.slice(0, 2).flatMap(level =>
      [0, 1, 2, 3].map(index => ({ noteId: `${level}-${index}`, right: true })))

    expect(nextQuestion(questions, answers)).toBeNull()
  })
})

describe('placedLevel', () => {
  it('is the hardest of an unbroken run of passed levels', () => {
    const answers = walk(level => ['N5', 'N4', 'N3'].includes(level))
    const scored = answers.map(answer => ({ level: answer.noteId.split('-')[0]!, right: answer.right }))

    expect(placedLevel(tally(scored))).toBe('N3')
  })

  it('is null when N5 was not passed', () => {
    expect(placedLevel(tally([{ level: 'N5', right: false }, { level: 'N5', right: false }]))).toBeNull()
  })

  it('does not skip a failed level to a passed one above it', () => {
    const scored = [
      ...Array.from({ length: 4 }, () => ({ level: 'N5', right: true })),
      ...Array.from({ length: 2 }, () => ({ level: 'N4', right: false })),
      ...Array.from({ length: 4 }, () => ({ level: 'N3', right: true })),
    ]

    expect(placedLevel(tally(scored))).toBe('N5')
  })

  it('tallies a level that was never reached as nothing asked', () => {
    const rows = tally([{ level: 'N5', right: true }])

    expect(rows.find(row => row.level === 'N1')).toEqual({ level: 'N1', asked: 0, right: 0, passed: false })
  })
})

describe('where lessons start, and what is marked known', () => {
  it('starts the level after the one placed at', () => {
    expect(startLevel(null)).toBe('N5')
    expect(startLevel('N5')).toBe('N4')
    expect(startLevel('N3')).toBe('N2')
    expect(startLevel('N1')).toBe('N1')
  })

  it('marks known every level below the start', () => {
    expect(knownLevels(null)).toEqual([])
    expect(knownLevels('N5')).toEqual(['N5'])
    expect(knownLevels('N3')).toEqual(['N5', 'N4', 'N3'])
    expect(knownLevels('N1')).toEqual(['N5', 'N4', 'N3', 'N2'])
  })

  it('reads *start at N3* as a claim to N4', () => {
    expect(declaredLevel('N5')).toBeNull()
    expect(declaredLevel('N4')).toBe('N5')
    expect(declaredLevel('N3')).toBe('N4')
    expect(declaredLevel('N1')).toBe('N2')
  })
})

describe('the result screen\'s words', () => {
  it('says the prototype\'s sentences', () => {
    expect(resultHeadline(null)).toBe('You are just getting started.')
    expect(resultHeadline('N4')).toBe('You are at about N4 level.')
    expect(resultBody(null)).toBe('Your lessons start at N5, with the most common words first.')
    expect(resultBody('N5')).toBe('Your lessons start at N4. N5 words are marked as known, and a few will show up in reviews to make sure.')
    expect(resultBody('N4')).toBe('Your lessons start at N3. N5 and N4 words are marked as known, and a few will show up in reviews to make sure.')
    expect(resultBody('N1')).toBe('You knew the hardest words we showed you. Lessons start at N1, and easier levels are marked as known.')
  })
})

describe('parseAnswers and scoreAnswers — the server scores the test again', () => {
  it('reads a list of word ids and choices', () => {
    expect(parseAnswers({ answers: [{ noteId: 'a', choice: 'water' }, { noteId: 'b', choice: null }] }))
      .toEqual([{ noteId: 'a', choice: 'water' }, { noteId: 'b', choice: null }])
  })

  it('refuses anything else', () => {
    expect(parseAnswers(undefined)).toBeNull()
    expect(parseAnswers({ answers: 'all right' })).toBeNull()
    expect(parseAnswers({ answers: [{ noteId: 1, choice: null }] })).toBeNull()
    expect(parseAnswers({ answers: [{ noteId: 'a', choice: 3 }] })).toBeNull()
    expect(parseAnswers({ answers: [{ noteId: 'a', choice: null }, { noteId: 'a', choice: null }] })).toBeNull()
    expect(parseAnswers({ answers: Array.from({ length: 26 }, (_, index) => ({ noteId: `${index}`, choice: null })) })).toBeNull()
  })

  it('scores against the meaning the server holds, and drops a word it does not', () => {
    const words = [word('a', 'N5', 'water'), word('b', 'N5', 'fire')]

    expect(scoreAnswers([
      { noteId: 'a', choice: 'water' },
      { noteId: 'b', choice: 'water' },
      { noteId: 'z', choice: 'water' },
    ], words)).toEqual([{ level: 'N5', right: true }, { level: 'N5', right: false }])
  })
})
