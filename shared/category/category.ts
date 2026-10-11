/**
 * A *category* — what the reader chooses new words from (ADR 0075 §3, #68).
 *
 * ⚠️ **Derived, never stored.** A *category* is a question asked of rows that
 * already exist, so there is no table to fall out of step with them:
 *
 * - `jlpt:N5` … `jlpt:N1` — the *notes* the declared *authority* places at that
 *   *level* (`level_claim.authority_key`, ADR 0005). The starter set is these.
 * - `deck:<source id>` — the *notes* seen in one imported Anki deck that is
 *   still live.
 * - `my-words` — the *notes* seen in any live word list or pasted text.
 *
 * ⚠️ **A word can be in several**, and that is the point of deriving them: 会う
 * is `jlpt:N5` from the list and is also in the deck that taught it. Nothing
 * here picks one.
 *
 * ⚠️ **A model's estimate puts a word in no JLPT category** (ADR 0075 §2). A
 * word the list does not carry is the reader's own, and it is found under *My
 * decks* by where it came from.
 *
 * This module is the vocabulary and the keys. `server/utils/category/queries.ts`
 * is what asks the database; #69 builds the screen.
 */

import { authorityKeys, jlptVocab, levelValues } from '../subject/declaration'
import type { SubjectDeclaration } from '../subject/declaration'

/** The two shelves the prototype draws: *JLPT levels*, then *My decks*. */
export type CategoryGroup = 'jlpt' | 'my-decks'

export type CategoryRef
  = | { kind: 'level', level: string }
    | { kind: 'deck', sourceId: string }
    | { kind: 'my-words' }

export const MY_WORDS_KEY = 'my-words'
export const MY_WORDS_LABEL = 'My words'

const LEVEL_PREFIX = 'jlpt:'
const DECK_PREFIX = 'deck:'

/**
 * The *authority* a word's *level* is read from: the declaration's first.
 *
 * ⚠️ **`authorities` is ordered, and the order is the precedence** ADR 0005
 * left for a later decision. One list today; a second is added behind it or in
 * front of it, on purpose, in the declaration.
 */
export function levelAuthority(declaration: SubjectDeclaration = jlptVocab): string {
  const [first] = authorityKeys(declaration)
  if (first === undefined)
    throw new Error('the declaration names no authority to read a level from')

  return first
}

export function categoryGroup(ref: CategoryRef): CategoryGroup {
  return ref.kind === 'level' ? 'jlpt' : 'my-decks'
}

export function categoryKey(ref: CategoryRef): string {
  if (ref.kind === 'level')
    return `${LEVEL_PREFIX}${ref.level}`
  if (ref.kind === 'deck')
    return `${DECK_PREFIX}${ref.sourceId}`

  return MY_WORDS_KEY
}

/**
 * A key back into a *category*, or `null` for anything that is not one.
 *
 * ⚠️ **A level outside the declared set is not a category.** The key arrives
 * from a request, and `jlpt:N6` answered with an empty category would look
 * like a level with no words in it.
 */
export function parseCategoryKey(
  key: unknown,
  declaration: SubjectDeclaration = jlptVocab,
): CategoryRef | null {
  if (typeof key !== 'string')
    return null
  if (key === MY_WORDS_KEY)
    return { kind: 'my-words' }

  if (key.startsWith(LEVEL_PREFIX)) {
    const level = key.slice(LEVEL_PREFIX.length)
    return levelValues(declaration).includes(level) ? { kind: 'level', level } : null
  }

  if (key.startsWith(DECK_PREFIX)) {
    const sourceId = key.slice(DECK_PREFIX.length)
    return UUID.test(sourceId) ? { kind: 'deck', sourceId } : null
  }

  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The JLPT shelf, in the declaration's order — easiest first. */
export function levelCategories(declaration: SubjectDeclaration = jlptVocab): CategoryRef[] {
  return levelValues(declaration).map(level => ({ kind: 'level', level }))
}
