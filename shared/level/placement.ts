/**
 * The placement test — [ADR 0079](../../docs/adr/0079-a-level-is-proved-and-placement-is-checked.md)
 * §1, the prototype's `vPlacement` (`docs/prototype/`). Multiple choice, easiest
 * level first, and it stops as soon as a level is failed.
 *
 * ⚠️ **Pure, and run twice**: the screen walks the test with it, and the
 * server scores the answers with it again when the result is accepted, so the
 * level the screen showed is the level that is written.
 */

import { glossPieces } from '../review/answer'
import { jlptVocab, levelValues } from '../subject/declaration'
import { PLACEMENT_CHOICES, PLACEMENT_PASS_MARK, PLACEMENT_WORDS_PER_LEVEL } from './thresholds'

/** One starter word as the test reads it. */
export interface PlacementWord {
  noteId: string
  level: string
  term: string
  meaning: string
  partOfSpeech: string
}

export interface PlacementQuestion {
  noteId: string
  level: string
  term: string
  /** `PLACEMENT_CHOICES` meanings, the right one among them, in the order drawn. */
  choices: string[]
  /**
   * The right one. ⚠️ **Sent to the screen**, which walks the test with it;
   * the server never reads it back and scores the answers from the meanings it
   * holds (`scoreAnswers`).
   */
  answer: string
}

/** What the reader picked: a choice, or `null` for *I do not know this one*. */
export interface PlacementAnswer {
  noteId: string
  choice: string | null
}

/** An answer, scored. */
export interface ScoredAnswer {
  level: string
  right: boolean
}

export interface LevelTally {
  level: string
  asked: number
  right: number
  passed: boolean
}

/**
 * The meaning a choice shows: the gloss's first two pieces. A JMdict gloss
 * runs to five, and four choices of five meanings each is a reading test.
 */
export function choiceText(meaning: string): string {
  return glossPieces(meaning).slice(0, 2).join('; ')
}

/** The answer is right when it is the word's own choice. *I do not know* is never right. */
export function isRight(answer: Pick<PlacementAnswer, 'choice'>, meaning: string): boolean {
  return answer.choice !== null && answer.choice === choiceText(meaning)
}

/** A rough word class, so that a verb's wrong choices are verbs where the level has enough. */
function wordClass(partOfSpeech: string): string {
  const pos = partOfSpeech.toLowerCase()
  if (pos.includes('verb'))
    return 'verb'
  if (pos.includes('adjective'))
    return 'adjective'
  if (pos.includes('adverb'))
    return 'adverb'

  return 'noun'
}

const normalised = (text: string) => text.trim().toLowerCase()

/**
 * One question: the word and `PLACEMENT_CHOICES` meanings drawn from `pool`.
 *
 * ⚠️ **A wrong choice shares no piece of meaning with the right one.** The
 * starter set has 青 and 青い, both *blue; azure*, and a choice that is also
 * right makes the question unanswerable.
 */
export function placementQuestion(
  word: PlacementWord,
  pool: PlacementWord[],
  random: () => number = Math.random,
): PlacementQuestion {
  const right = choiceText(word.meaning)
  const rightPieces = new Set(glossPieces(word.meaning).map(normalised))
  const seen = new Set([normalised(right)])

  const usable = pool.filter((other) => {
    if (other.noteId === word.noteId)
      return false

    return !glossPieces(other.meaning).some(piece => rightPieces.has(normalised(piece)))
  })

  const kind = wordClass(word.partOfSpeech)
  const ranked = [
    ...shuffle(usable.filter(other => wordClass(other.partOfSpeech) === kind), random),
    ...shuffle(usable.filter(other => wordClass(other.partOfSpeech) !== kind), random),
  ]

  const wrong: string[] = []
  for (const other of ranked) {
    if (wrong.length === PLACEMENT_CHOICES - 1)
      break

    const text = choiceText(other.meaning)
    if (text === '' || seen.has(normalised(text)))
      continue

    seen.add(normalised(text))
    wrong.push(text)
  }

  return {
    noteId: word.noteId,
    level: word.level,
    term: word.term,
    choices: shuffle([right, ...wrong], random),
    answer: right,
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[out[index], out[other]] = [out[other]!, out[index]!]
  }

  return out
}

/**
 * Each level's answers, in the declaration's order, and whether it passed.
 * A level passes at `PLACEMENT_PASS_MARK` right; one that was never reached has
 * nothing asked and has not.
 */
export function tally(answers: ScoredAnswer[], levels: string[] = levelValues(jlptVocab)): LevelTally[] {
  return levels.map((level) => {
    const mine = answers.filter(answer => answer.level === level)
    const right = mine.filter(answer => answer.right).length

    return { level, asked: mine.length, right, passed: right >= PLACEMENT_PASS_MARK }
  })
}

/**
 * The level the test places the reader at: the hardest of an unbroken run of
 * passed levels from the easiest, or `null` when the first was not passed.
 */
export function placedLevel(tallies: LevelTally[]): string | null {
  let level: string | null = null

  for (const row of tallies) {
    if (!row.passed)
      break
    level = row.level
  }

  return level
}

/**
 * The next question, or `null` when the test is over.
 *
 * ⚠️ **It stops early, both ways.** A level is left as soon as it is passed,
 * and the test ends as soon as a level can no longer be — two misses of five
 * at a pass mark of four. That is *the test stops early once it has found your
 * level*, and it is what keeps 25 words near three minutes.
 */
export function nextQuestion(
  questions: PlacementQuestion[],
  answers: Array<{ noteId: string, right: boolean }>,
  levels: string[] = levelValues(jlptVocab),
): PlacementQuestion | null {
  const answered = new Map(answers.map(answer => [answer.noteId, answer.right]))

  for (const level of levels) {
    const asked = questions.filter(question => question.level === level)
    const right = asked.filter(question => answered.get(question.noteId) === true).length
    const open = asked.filter(question => !answered.has(question.noteId))

    if (right >= PLACEMENT_PASS_MARK)
      continue

    if (right + open.length < PLACEMENT_PASS_MARK)
      return null

    return open[0] ?? null
  }

  return null
}

/**
 * Where lessons start: the level after the one placed at, N5 for a reader
 * placed at none, and N1 for a reader placed at N1 — there is nothing after it.
 */
export function startLevel(placed: string | null, levels: string[] = levelValues(jlptVocab)): string {
  if (placed === null)
    return levels[0]!

  const index = levels.indexOf(placed)
  return levels[Math.min(index + 1, levels.length - 1)]!
}

/**
 * The levels whose words are marked known: every level below the one lessons
 * start at. A reader placed at N1 starts at N1, so N1 itself is not among them.
 */
export function knownLevels(placed: string | null, levels: string[] = levelValues(jlptVocab)): string[] {
  const start = startLevel(placed, levels)
  return placed === null ? [] : levels.slice(0, levels.indexOf(start))
}

/**
 * The level a reader who says *start at N3* claims to have — the one below it,
 * as the prototype's *Already know your level?* reads it. Starting at the
 * first level claims none.
 */
export function declaredLevel(start: string, levels: string[] = levelValues(jlptVocab)): string | null {
  const index = levels.indexOf(start)
  return index > 0 ? levels[index - 1]! : null
}

/** *You are at about N4 level.*, the result's headline. */
export function resultHeadline(placed: string | null): string {
  return placed ? `You are at about ${placed} level.` : 'You are just getting started.'
}

/** The sentence under the headline, in the prototype's words. */
export function resultBody(placed: string | null, levels: string[] = levelValues(jlptVocab)): string {
  if (placed === null)
    return `Your lessons start at ${levels[0]}, with the most common words first.`

  const known = knownLevels(placed, levels)
  if (placed === levels[levels.length - 1])
    return `You knew the hardest words we showed you. Lessons start at ${placed}, and easier levels are marked as known.`

  return `Your lessons start at ${startLevel(placed, levels)}. ${joinAnd(known)} words are marked as known, and a few will show up in reviews to make sure.`
}

function joinAnd(items: string[]): string {
  if (items.length <= 1)
    return items.join('')

  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * The answers in a request body, or `null` when it is not a list of them.
 * ⚠️ **Bounded by the test's own length**: a body longer than every level's
 * words is not a test this app composed.
 */
export function parseAnswers(body: unknown, levels: string[] = levelValues(jlptVocab)): PlacementAnswer[] | null {
  const answers = (body as Record<string, unknown> | undefined)?.answers
  if (!Array.isArray(answers) || answers.length > levels.length * PLACEMENT_WORDS_PER_LEVEL)
    return null

  const parsed: PlacementAnswer[] = []
  const seen = new Set<string>()

  for (const answer of answers) {
    const { noteId, choice } = (answer ?? {}) as Record<string, unknown>
    if (typeof noteId !== 'string' || seen.has(noteId))
      return null
    if (choice !== null && typeof choice !== 'string')
      return null

    seen.add(noteId)
    parsed.push({ noteId, choice })
  }

  return parsed
}

/** Score answers against the words the server holds. An answer to a word it does not hold is dropped. */
export function scoreAnswers(answers: PlacementAnswer[], words: PlacementWord[]): ScoredAnswer[] {
  const byId = new Map(words.map(word => [word.noteId, word]))

  return answers.flatMap((answer) => {
    const word = byId.get(answer.noteId)
    return word ? [{ level: word.level, right: isRight(answer, word.meaning) }] : []
  })
}
