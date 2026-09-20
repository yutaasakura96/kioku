/**
 * One Anki *note*, read into one line of a *word list* — ADR 0068 §3.
 *
 * ⚠️ **Pure, and deliberately the only part of the reader that is.** The zip,
 * the zstd and the SQLite live in `server/utils/ingest/anki/`, behind Node
 * built-ins that need a file on disk; everything that *decides what a note says*
 * is here, where a test can look at it. That split is `11` §8's seam rule
 * applied to a new reader: the part that can be wrong in a way nobody notices is
 * the part that gets tested with no I/O at all.
 *
 * **A line is `term⇥reading⇥hint`**, and from there an `anki` *source* is a word
 * list with extra columns (ADR 0068 §1). `worker/pipeline/normalise.py` reads
 * column 1 as the term and hands columns 2 and 3 to `generate` as the deck's
 * hints — they are hints and never the *identity key*, which stays Sudachi's
 * (ADR 0068 §5, ADR 0045).
 *
 * ⚠️ **The deck's meaning does not travel, and that is a measurement rather than
 * a preference** (ADR 0068 §3). A line of term, reading and level tags comes to
 * 38,866–56,875 code points across the four decks measured; adding the meaning
 * cut to 40 characters puts two of them over `S2`'s 100,000-code-point cap, and
 * adding every field puts all four over. The model writes the meaning either
 * way, and the meaning is where decks' wording differs most.
 */

import { collapseBlank } from '../../subject/validate'

/**
 * A *note* as the collection holds it, already split — `anki-apkg-research.md`
 * §2.2.
 *
 * ⚠️ **`fields` and `fieldNames` are two lists and neither indexes the other.**
 * `notes.flds` is one `\x1f`-joined string and the names come from the notetype,
 * so a note can carry more values than its notetype has names (or fewer). Every
 * read below is by index with a fallback, never by assuming they are the same
 * length.
 */
export interface AnkiNote {
  /** `notes.flds`, split on `\x1f`, in `ord` order. */
  fields: string[]
  /** The notetype's field names, in `ord` order. */
  fieldNames: string[]
  /** `notes.tags`, split on blanks. Anki pads the stored string at both ends. */
  tags: string[]
  /**
   * The deck the note's **first card** sits in, `::`-joined — `cards.did`, not
   * a column on the note (research §2.2). Empty when the deck is unknown.
   */
  deckName: string
}

export interface DeckLines {
  /** One per note that produced a term. */
  lines: string[]
  /** How many notes were read. */
  notes: number
  /**
   * ⚠️ **Dropped, and counted rather than lost.** A note whose term comes out
   * empty — a media-only field, an empty first field — is not a word, and a
   * blank line would ride through `chunk` as a non-term and through `normalise`
   * as nothing at all. The count is what tells a reader that a 2,000-note deck
   * became 1,900 lines on purpose.
   */
  dropped: number
}

/** The furigana form — `Text[ruby]`, a space marking where the ruby starts. */
const FURIGANA = new RegExp(' ?([^ >]+?)\\[(.+?)\\]', 'g')

/**
 * ⚠️ **Removed before the furigana regex ever runs**, because `[sound:a.mp3]`
 * is bracketed exactly like ruby and Anki's own filters exempt it by name
 * (research §2.2). Media is out of scope (ADR 0068 §8) and Kioku has nowhere to
 * play it.
 */
const SOUND = /\[sound:[^\]]*\]/g

/**
 * A line break in field HTML, which has to become a **space** and not nothing.
 * `赤<br>青` with the tag simply deleted is one six-character word that does not
 * exist; with a space it is two, which is what the reader wrote.
 */
const BREAK = /<br\s*\/?>|<\/(?:div|p|li|tr|h[1-6])>/gi

const TAG = /<[^>]*>/g

/**
 * Both brackets in both widths, with whatever is inside them — ADR 0068 §3 and
 * research §1.3's two measured shapes.
 */
const BRACKETED = /[(（][^)）]*[)）]/g

/** Just the bracket characters, for the fallback below. */
const BRACKETS = /[(（)）]/g

/**
 * ⚠️ **Two of them, and a deck uses whichever its author's keyboard produced.**
 * `〜` is U+301C WAVE DASH and `～` is U+FF5E FULLWIDTH TILDE; they render
 * alike and are different characters. Both mark "something goes here" in a deck
 * entry and neither is part of the word.
 */
const WAVE_DASHES = /[〜～]/g

/**
 * A field name that promises a reading — ADR 0068 §3.
 *
 * ⚠️ **Names belong to the deck author** (research §2.3): three sampled JLPT
 * decks share no field name, and the reading turned up as `reading`,
 * `Reading (furigana form)` and `kana with precedence over kanjis`. A substring
 * match without case is the most that can be claimed, and when it finds nothing
 * the column is empty rather than guessed.
 */
const READING_NAME = /reading|kana|yomi|読み/i

/**
 * ⚠️ **A level tag, and not merely something with an `n` and a digit in it.**
 * The naive `/n[1-5]/i` keeps `Intermediate_Japanese_Ln.10`, a tag shape from a
 * sampled deck (research §1.3). The boundary on both sides is what makes it a
 * token rather than a substring.
 */
const LEVEL = /(?:^|[^A-Za-z0-9])(?:JLPT|N[1-5])(?:[^A-Za-z0-9]|$)/i

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
}

/**
 * Field HTML, read as the text it displays — research §2.2.
 *
 * ⚠️ **The order is the whole of it.** `&nbsp;` first, because Anki's own
 * filters replace it before they look for ruby and the furigana pattern's
 * character class excludes a space. Sound tags next, because they are bracketed
 * like ruby. Then the tags, and **only then** the entities: decoding first would
 * turn `&lt;b&gt;` into a tag and the next step would delete it.
 */
export function stripHtml(value: string): string {
  const text = value
    .replaceAll('&nbsp;', ' ')
    .replace(SOUND, '')
    .replace(BREAK, ' ')
    .replace(TAG, '')

  return collapse(decodeEntities(text))
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X'))
      return codePoint(Number.parseInt(body.slice(2), 16), whole)
    if (body.startsWith('#'))
      return codePoint(Number.parseInt(body.slice(1), 10), whole)
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

function codePoint(value: number, whole: string): string {
  // An entity naming nothing addressable is left as the reader wrote it: it is
  // more likely to be a literal `&#` in the text than a character.
  if (!Number.isFinite(value) || value < 0 || value > 0x10FFFF)
    return whole
  return String.fromCodePoint(value)
}

/**
 * ⚠️ **One space, from the one blank class** (`00-status.md` § Carrying), and
 * `collapseBlank` is where that class lives — never `.trim()`, which disagrees
 * with Python's `str.strip()` on six characters including the `U+001F` this
 * file's own columns are joined with.
 *
 * `shared/ingest/chunk.ts` counts the lines of this same text to place a *chunk*
 * boundary and `worker/pipeline/normalise.py` reads them back out of it, so a
 * character one language calls blank and the other calls content is a chunk
 * holding 25 terms on one side of the repository and 24 on the other. It is also
 * what keeps a value that held a tab from becoming two columns.
 */
const collapse = collapseBlank

export interface Furigana {
  carriesFurigana: boolean
  /** Anki's `kanji` filter — the text the ruby sits over. */
  kanji: string
  /** Anki's `kana` filter — the ruby itself. */
  kana: string
}

/**
 * Anki's two furigana filters, run over one value — research §2.2.
 *
 * The pattern is Anki's own, `" ?([^ >]+?)\[(.+?)\]"`
 * ([`rslib/src/template_filters.rs`](https://github.com/ankitects/anki/blob/26.09.2/rslib/src/template_filters.rs)),
 * and the leading optional space belongs to the match — which is why
 * `世[よ]の 中[なか]` gives `世の中` and not `世の 中`.
 */
export function withFurigana(value: string): Furigana {
  FURIGANA.lastIndex = 0
  const carriesFurigana = FURIGANA.test(value)

  return {
    carriesFurigana,
    kanji: value.replace(FURIGANA, '$1'),
    kana: value.replace(FURIGANA, '$2'),
  }
}

function fieldAt(note: AnkiNote, index: number): string {
  return note.fields[index] ?? ''
}

/**
 * Field 0, read as the word — ADR 0068 §3.
 *
 * ⚠️ **The bracket rule is a repair for a shape real decks contain and it is
 * not always right.** About 1% of the notes measured are entries rather than
 * words: `(かさを～) さす` is a word with its usual object shown, and
 * `〜 (まる) ごと` is 丸ごと written as a pattern. The first comes out as さす,
 * which is correct; the second comes out as ごと, which is not. ADR 0068 §3
 * takes the trade knowingly — the raw field goes into the hint, so the model
 * sees what the deck said, and *Vet*'s flag queue catches what neither of them
 * got right (ADR 0064).
 *
 * ⚠️ **The fallback exists because the rule can erase the word.** A term that is
 * entirely parenthesised — `(あいさつ)` — has nothing left after the segment is
 * removed, and an empty term is a dropped note. Removing only the brackets keeps
 * it.
 */
export function termOf(note: AnkiNote): string {
  const { kanji } = withFurigana(stripHtml(fieldAt(note, 0)))

  const cleaned = collapse(kanji.replace(BRACKETED, ' ').replace(WAVE_DASHES, ' '))
  if (cleaned !== '')
    return cleaned

  return collapse(kanji.replace(BRACKETS, ' ').replace(WAVE_DASHES, ' '))
}

/**
 * The deck's reading — ADR 0068 §3. **A hint, never half of a key.**
 *
 * ⚠️ **Field 0's furigana wins over a field whose name promises a reading.**
 * Ruby on the word itself is the deck saying how *this* entry is read; a
 * separate column is the author's convention, and research §1.3 measured decks
 * where that column repeats the expression rather than reading it.
 */
export function readingOf(note: AnkiNote): string {
  const furigana = withFurigana(stripHtml(fieldAt(note, 0)))
  if (furigana.carriesFurigana)
    return collapse(furigana.kana)

  // ⚠️ **The search starts at field 1, because field 0 is the term.** A deck
  // whose field 0 is called `kana` — a kana-only deck, and research §2.3 found
  // one called `kana with precedence over kanjis` — would otherwise match at 0
  // and either hand back the term as its own reading or, if the match were
  // refused outright, find nothing at all while a real reading sat at field 2.
  const found = note.fieldNames.slice(1).findIndex(name => READING_NAME.test(name))
  if (found === -1)
    return ''

  return stripHtml(fieldAt(note, found + 1))
}

/** Whether a tag names a JLPT level — ADR 0068 §3. */
export function looksLikeALevel(value: string): boolean {
  return LEVEL.test(value)
}

/** A deck name, split into the words a level could be hiding among. */
const WORDS = /[^A-Za-z0-9]+/

/**
 * The *level* a deck's name names, and nothing else of it — ADR 0068 §3,
 * **amended 2026-09-20 by the re-measurement #26 was asked for**.
 *
 * ⚠️ **A deck name is prose and a tag is a token, which is why only one of them
 * is cut down.** `JLPT_3` means what it says as a whole; `Open Anki JLPT N2
 * Deck` is a title with a level in it, and the other four words are the same
 * four words on every line of the deck.
 *
 * ⚠️ **Measured, and it is the whole reason this function exists.** Carrying
 * the name whole made it the **largest** column in all four real decks —
 * 43,171 to 62,077 code points against 4,684–6,710 of term and 22,594–40,697 of
 * tags — and pushed the N3 and N1 decks past `S2`'s 100,000-code-point cap
 * (106,117 and 117,469). It is the same finding ADR 0068 §3 made about the
 * deck's *meaning*, arriving through the column that ADR's last sentence asked
 * this ticket to re-measure. The information lost is nil: the words dropped are
 * constant across the deck, so they say nothing about any particular word.
 *
 * ⚠️ **The deck name is still read, and that is not redundant with the tags.**
 * Research §2.4 sampled a deck that encodes its levels as *subdecks*
 * (`JLPT-N1` … `JLPT-N5`) and keeps tags for something else entirely — there
 * the name is the only level signal there is.
 */
export function levelsIn(deckName: string): string {
  const seen = new Set<string>()

  for (const word of deckName.split(WORDS)) {
    if (word !== '' && looksLikeALevel(word))
      seen.add(word.toUpperCase())
  }

  return [...seen].join(' ')
}

/**
 * What the deck knows that is worth a hint — ADR 0068 §3, and Yuta's second
 * triage call (research §6).
 *
 * ⚠️ **A level tag is a hint to the model and never a `level_claim`.**
 * open-anki's tags are *cumulative* — every note in its N3 deck carries
 * `JLPT_3`, most also carry `JLPT_2` and some also `JLPT_1` (research §1.3) — so
 * a tag does not name one level and no `authority_key` names a deck. The model's
 * claim stays the only claim (ADR 0065).
 *
 * ⚠️ **Field 0 comes along only when the term cleanup moved something**, which
 * is the ~1% of notes `termOf` explains. Comparing after Anki's `kanji`
 * transform rather than against the raw string is what keeps a furigana deck
 * from paying for a second copy of every word: `内陸[ないりく]` already has its
 * reading in column 2.
 */
export function hintOf(note: AnkiNote, term: string): string {
  const deck = levelsIn(note.deckName)
  const levels = [...note.tags.filter(looksLikeALevel), ...(deck === '' ? [] : [deck])]

  const asWritten = collapse(withFurigana(stripHtml(fieldAt(note, 0))).kanji)
  const parts = asWritten !== '' && asWritten !== term ? [...levels, asWritten] : levels

  return collapse(parts.join(' '))
}

/**
 * One note, one line — or `null` when it has no word in it.
 *
 * ⚠️ **Three columns, always**, even when two of them are empty: `normalise`
 * splits on the tab and a line with fewer columns would be read as a different
 * shape. Every value has had its own tabs and newlines collapsed to spaces by
 * `stripHtml`, so the count is a property of this function rather than of the
 * deck.
 */
export function ankiLine(note: AnkiNote): string | null {
  const term = termOf(note)
  if (term === '')
    return null

  return [term, readingOf(note), hintOf(note, term)].join('\t')
}

/** The whole deck, as the text an `anki` *source* stores (ADR 0068 §1). */
export function ankiLines(notes: Iterable<AnkiNote>): DeckLines {
  const lines: string[] = []
  let read = 0

  for (const note of notes) {
    read++
    const line = ankiLine(note)
    if (line !== null)
      lines.push(line)
  }

  return { lines, notes: read, dropped: read - lines.length }
}
