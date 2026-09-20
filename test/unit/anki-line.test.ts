// The one line an Anki *note* becomes — ADR 0068 §3, #26.
//
// ⚠️ **Every note in this file is invented.** The repository is public and the
// AnkiWeb Shared Deck License is personal-studies-only, so a row copied out of a
// real deck would be redistribution (`anki-apkg-research.md` §3.3, §6). The two
// *shapes* measured in real decks are reproduced with made-up words.

import { describe, expect, it } from 'vitest'

import {
  ankiLine,
  ankiLines,
  hintOf,
  levelsIn,
  looksLikeALevel,
  readingOf,
  stripHtml,
  termOf,
  withFurigana,
} from '../../shared/ingest/anki/line'
import type { AnkiNote } from '../../shared/ingest/anki/line'

function note(patch: Partial<AnkiNote> = {}): AnkiNote {
  return {
    fields: ['図書館'],
    fieldNames: ['expression'],
    tags: [],
    deckName: '',
    ...patch,
  }
}

describe('stripHtml', () => {
  it('removes tags and keeps their text', () => {
    expect(stripHtml('<b>漢字</b>')).toBe('漢字')
  })

  it('removes a sound tag entirely', () => {
    expect(stripHtml('図書館[sound:tosho.mp3]')).toBe('図書館')
  })

  it('removes an image and keeps nothing of it', () => {
    expect(stripHtml('図書館<img src="a.png" alt="x">')).toBe('図書館')
  })

  it('turns `&nbsp;` into a space, because Anki\'s own filters do', () => {
    expect(stripHtml('お&nbsp;茶')).toBe('お 茶')
  })

  it('decodes entities after the tags are gone, never before', () => {
    // ⚠️ Decoding first would turn `&lt;b&gt;` into a tag and then remove it.
    expect(stripHtml('&lt;b&gt;')).toBe('<b>')
    expect(stripHtml('A&amp;B')).toBe('A&B')
    expect(stripHtml('&#x6f22;&#23383;')).toBe('漢字')
  })

  it('turns a line break into a space rather than gluing two words', () => {
    expect(stripHtml('赤<br>青')).toBe('赤 青')
    expect(stripHtml('<div>赤</div><div>青</div>')).toBe('赤 青')
  })

  it('collapses every blank in the class to one space and trims', () => {
    expect(stripHtml('　 赤\t\n青  ')).toBe('赤 青')
  })
})

describe('withFurigana', () => {
  it('reads Anki\'s own bracket form, both ways', () => {
    expect(withFurigana('内陸[ないりく]')).toEqual({
      carriesFurigana: true,
      kanji: '内陸',
      kana: 'ないりく',
    })
  })

  it('eats the space that marks where the ruby starts', () => {
    // The manual's own example. The leading space belongs to the match.
    expect(withFurigana('世[よ]の 中[なか]')).toEqual({
      carriesFurigana: true,
      kanji: '世の中',
      kana: 'よのなか',
    })
  })

  it('says so when a field carries none', () => {
    expect(withFurigana('図書館')).toEqual({
      carriesFurigana: false,
      kanji: '図書館',
      kana: '図書館',
    })
  })
})

describe('termOf', () => {
  it('is field 0', () => {
    expect(termOf(note({ fields: ['図書館', 'としょかん'] }))).toBe('図書館')
  })

  it('is the kanji side of a furigana field', () => {
    expect(termOf(note({ fields: ['内陸[ないりく]'] }))).toBe('内陸')
  })

  it('drops a parenthesised segment and the wave dash — `(かさを～) さす`', () => {
    // One of the two shapes measured in real decks (~1% of notes). `～` here is
    // U+FF5E, the full-width tilde.
    expect(termOf(note({ fields: ['(かさを～) さす'] }))).toBe('さす')
  })

  it('drops them the other way round too — `〜 (まる) ごと`', () => {
    // ⚠️ The second measured shape, and it comes out **wrong**: the word is
    // 丸ごと and this gives ごと. ADR 0068 §3 accepts it — the raw field goes
    // into the hint and *Vet*'s flag queue catches the rest.
    expect(termOf(note({ fields: ['〜 (まる) ごと'] }))).toBe('ごと')
  })

  it('handles full-width brackets as well as ASCII ones', () => {
    expect(termOf(note({ fields: ['（ごはんを）たべる'] }))).toBe('たべる')
  })

  it('keeps the inside when removing the segment would leave nothing', () => {
    // ⚠️ A term that is *entirely* parenthesised loses everything under the
    // rule above, and an empty term is a dropped note. Removing only the
    // brackets keeps the word.
    expect(termOf(note({ fields: ['(あいさつ)'] }))).toBe('あいさつ')
    expect(termOf(note({ fields: ['〜（ため）'] }))).toBe('ため')
  })

  it('is empty when there is no field at all', () => {
    expect(termOf(note({ fields: [] }))).toBe('')
    expect(termOf(note({ fields: ['[sound:a.mp3]'] }))).toBe('')
  })
})

describe('readingOf', () => {
  it('is the kana side when field 0 carries furigana', () => {
    expect(readingOf(note({
      fields: ['内陸[ないりく]', 'inland'],
      fieldNames: ['expression', 'meaning'],
    }))).toBe('ないりく')
  })

  it('is the first field whose name looks like a reading, ignoring case', () => {
    expect(readingOf(note({
      fields: ['図書館', 'library', 'としょかん'],
      fieldNames: ['Expression', 'Meaning', 'Reading (furigana form)'],
    }))).toBe('としょかん')
  })

  it('matches the Japanese name too', () => {
    expect(readingOf(note({
      fields: ['図書館', 'としょかん'],
      fieldNames: ['単語', '読み'],
    }))).toBe('としょかん')
  })

  it('prefers field 0\'s furigana over a separate reading field', () => {
    expect(readingOf(note({
      fields: ['内陸[ないりく]', 'ちがう'],
      fieldNames: ['expression', 'kana'],
    }))).toBe('ないりく')
  })

  it('searches from field 1, because field 0 is the term', () => {
    // ⚠️ Research §2.3 sampled a deck whose field 0 is called
    // `kana with precedence over kanjis`. Matching at 0 would hand the term
    // back as its own reading; refusing on a match at 0 would miss the real
    // one further along.
    expect(readingOf(note({
      fields: ['としょかん', 'library', 'としょかん(かな)'],
      fieldNames: ['kana with precedence over kanjis', 'meaning', 'reading'],
    }))).toBe('としょかん(かな)')
  })

  it('is empty when the deck carries no reading', () => {
    expect(readingOf(note({
      fields: ['図書館', 'library'],
      fieldNames: ['word', 'meaning'],
    }))).toBe('')
  })

  it('strips the HTML out of the reading field it finds', () => {
    expect(readingOf(note({
      fields: ['図書館', '<b>としょかん</b>'],
      fieldNames: ['word', 'yomi'],
    }))).toBe('としょかん')
  })
})

describe('looksLikeALevel', () => {
  it('keeps what names a JLPT level', () => {
    for (const value of ['JLPT', 'JLPT_3', 'JLPT_N5', 'jlpt::n2', 'N1', 'N5-vocab', 'JLPT::N4'])
      expect(looksLikeALevel(value), value).toBe(true)
  })

  it('drops what does not', () => {
    // ⚠️ `Intermediate_Japanese_Ln.10` is a real tag *shape* from a sampled
    // deck (research §1.3) and the naive `/n[1-5]/i` keeps it.
    for (const value of ['Genki', 'vocab::noun', 'Intermediate_Japanese_Ln.10', 'Core2000', 'N6', ''])
      expect(looksLikeALevel(value), value).toBe(false)
  })
})

describe('levelsIn', () => {
  it('keeps only the words that name a level', () => {
    expect(levelsIn('Open Anki JLPT N2 Deck')).toBe('JLPT N2')
    expect(levelsIn('JLPT::N5')).toBe('JLPT N5')
    expect(levelsIn('JLPT-N1')).toBe('JLPT N1')
  })

  it('is empty when the name names none', () => {
    expect(levelsIn('Japanese::Core 2000')).toBe('')
    expect(levelsIn('')).toBe('')
  })

  it('says each level once, however often the name repeats it', () => {
    expect(levelsIn('JLPT::JLPT N4::N4 vocab')).toBe('JLPT N4')
  })
})

describe('hintOf', () => {
  it('carries the level-ish tags and drops the rest', () => {
    expect(hintOf(note({ tags: ['JLPT_3', 'Genki', 'JLPT_2', 'vocab::noun'] }), '図書館'))
      .toBe('JLPT_3 JLPT_2')
  })

  it('carries the level out of a deck name and leaves the rest of it', () => {
    expect(hintOf(note({ deckName: 'JLPT::N5' }), '図書館')).toBe('JLPT N5')
  })

  it('drops a deck name that names nothing', () => {
    expect(hintOf(note({ deckName: 'Japanese::Core 2000' }), '図書館')).toBe('')
  })

  it('does not put a deck title on every line of the deck', () => {
    // ⚠️ **Measured, and it is why `levelsIn` exists.** Carried whole, the name
    // below is 22 code points on each of 2,699 lines and the largest column in
    // the source — enough to push two of the four real decks measured past
    // `S2`'s cap (ADR 0068 § Amended 2026-09-20).
    expect(hintOf(note({ deckName: 'Open Anki JLPT N2 Deck' }), '図書館')).toBe('JLPT N2')
  })

  it('carries field 0 when the term cleanup changed it', () => {
    // ⚠️ This is the repair for the `〜 (まる) ごと` case above: the model sees
    // what the deck actually said.
    expect(hintOf(note({ fields: ['〜 (まる) ごと'] }), 'ごと')).toBe('〜 (まる) ごと')
  })

  it('does not repeat field 0 when the term is already it', () => {
    expect(hintOf(note({ fields: ['図書館'] }), '図書館')).toBe('')
  })

  it('does not repeat a furigana field, because the reading column has it', () => {
    // The comparison happens after Anki's `kanji` transform, so a furigana
    // field only reaches the hint when the *bracket* cleanup moved something.
    expect(hintOf(note({ fields: ['内陸[ないりく]'] }), '内陸')).toBe('')
  })

  it('never carries the deck\'s meaning', () => {
    // ADR 0068 §3: with it, every real deck goes over `S2`'s cap.
    const hint = hintOf(note({
      fields: ['図書館', 'としょかん', 'library'],
      fieldNames: ['expression', 'reading', 'meaning'],
      tags: ['JLPT_5'],
    }), '図書館')
    expect(hint).toBe('JLPT_5')
    expect(hint).not.toContain('library')
  })
})

describe('ankiLine', () => {
  it('is three columns joined by tabs', () => {
    expect(ankiLine(note({
      fields: ['図書館', 'としょかん'],
      fieldNames: ['expression', 'reading'],
      tags: ['JLPT_5'],
      deckName: 'JLPT::N5',
    }))).toBe('図書館\tとしょかん\tJLPT_5 JLPT N5')
  })

  it('is one line even when a value held a tab or a newline', () => {
    // ⚠️ A value that kept its own tab would move every later column along by
    // one, silently, for that note alone.
    const line = ankiLine(note({
      fields: ['図書館', 'とし\tょ\nかん'],
      fieldNames: ['expression', 'reading'],
    }))
    expect(line).toBe('図書館\tとし ょ かん\t')
    expect(line?.split('\t')).toHaveLength(3)
  })

  it('is null when the term comes out empty', () => {
    expect(ankiLine(note({ fields: [''] }))).toBeNull()
    expect(ankiLine(note({ fields: ['<img src="a.png">'] }))).toBeNull()
  })
})

describe('ankiLines', () => {
  it('counts what it dropped rather than losing it silently', () => {
    const result = ankiLines([
      note({ fields: ['図書館', 'としょかん'], fieldNames: ['expression', 'reading'] }),
      note({ fields: [''] }),
      note({ fields: ['新聞', 'しんぶん'], fieldNames: ['expression', 'reading'] }),
      note({ fields: ['[sound:a.mp3]'] }),
    ])

    expect(result.lines).toEqual(['図書館\tとしょかん\t', '新聞\tしんぶん\t'])
    expect(result.dropped).toBe(2)
    expect(result.notes).toBe(4)
  })

  it('keeps both of two notes that share a term, because identity is Sudachi\'s', () => {
    // ADR 0068 §5. `deduplicate` folds them on the *identity key*, which this
    // module has no business computing.
    const result = ankiLines([
      note({ fields: ['開く', 'ひらく'], fieldNames: ['expression', 'reading'] }),
      note({ fields: ['開く', 'あく'], fieldNames: ['expression', 'reading'] }),
    ])

    expect(result.lines).toHaveLength(2)
  })
})
