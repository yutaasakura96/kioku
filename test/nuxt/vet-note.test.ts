// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import VetNote from '../../app/components/VetNote.vue'
import { jlptVocab } from '../../shared/subject/declaration'
import type { VetNoteView } from '../../server/utils/vet/queries'

// One *note*, as `S4` renders it. Three of these assertions are about things
// that are invisible when they are wrong:
//
// - ⚠️ **The *authority*'s name is in the document, never behind a hover**
//   (`09` §4.4, `CONTEXT.md`, #11's fourth criterion). A `title` attribute looks
//   identical in a screenshot and is unreachable without a pointer — on the one
//   screen whose thesis is that the pointer is never reached for.
// - ⚠️ **The *provenance marker* is the honesty bit ADR 0005 requires**, filled
//   for a named *authority* and hollow for a model estimate. Two claims that
//   disagree are **both** kept and **both** shown (PRD §5); precedence decides
//   the display value only.
// - ⚠️ **Edit reaches the *judgement fields* and nothing else** (`10` §4.4).
//   Editing the *term* would change `note.identity_key`; editing a *level* would
//   manufacture a claim with no *authority*. `test/unit/vet-decision.test.ts`
//   refuses them at the server; this is the half that never offers them.

const FIELDS = {
  term: '図書館',
  reading: 'としょかん',
  part_of_speech: '名詞',
  meaning: 'library',
  example_sentence: '駅の近くに図書館があります。',
  example_gloss: 'There is a library near the station.',
}

function note(overrides: Partial<VetNoteView> = {}): VetNoteView {
  return {
    noteId: '019bd3a1-7c2e-7f31-8a44-9e0b1c2d3e4f',
    fields: FIELDS,
    provenance: [
      { fieldName: 'reading', kind: 'lookup', modelId: null, dictionaryVersion: '20260723' },
      { fieldName: 'meaning', kind: 'generated', modelId: 'claude-sonnet-5', dictionaryVersion: null },
    ],
    levels: [{ authorityKey: null, level: 'N4' }],
    sourceTitle: '朝日新聞 社説',
    flagged: false,
    ...overrides,
  }
}

function mount(overrides: Partial<VetNoteView> = {}, edit: Record<string, string> | null = null) {
  return mountSuspended(VetNote, {
    props: { note: note(overrides), declaration: jlptVocab, edit },
  })
}

describe('the level, and the one visible honesty bit', () => {
  it('names the authority in the document rather than behind a hover', async () => {
    const view = await mount({ levels: [{ authorityKey: 'jlpt-tango-n3', level: 'N3' }] })

    expect(view.text()).toContain('jlpt-tango-n3')
    expect(view.find('.marker').attributes('title')).toBeUndefined()
  })

  it('fills the marker for a named authority and leaves it hollow for an estimate', async () => {
    const attributed = await mount({ levels: [{ authorityKey: 'jlpt-tango-n3', level: 'N3' }] })
    expect(attributed.find('.marker').classes()).toContain('attributed')

    const estimated = await mount({ levels: [{ authorityKey: null, level: 'N4' }] })
    expect(estimated.find('.marker').classes()).not.toContain('attributed')
  })

  // ADR 0005: the set is never collapsed. PRD §5 requires both to be kept **and
  // shown**; precedence decides only which one sits beside the marker.
  it('shows both of two disagreeing claims', async () => {
    const view = await mount({
      levels: [
        { authorityKey: 'jlpt-tango-n3', level: 'N3' },
        { authorityKey: null, level: 'N4' },
      ],
    })

    const text = view.text()
    expect(text).toContain('N3')
    expect(text).toContain('N4')
    expect(text).toContain('jlpt-tango-n3')
    expect(text).toContain('estimate')
  })

  it('renders a dash where nothing has claimed a level', async () => {
    const view = await mount({ levels: [] })

    expect(view.find('.marker').exists()).toBe(false)
    expect(view.text()).toContain('—')
  })
})

describe('`S4` — the provenance note names the mechanism', () => {
  it('says looked up, with the dictionary release, and generated without a model', async () => {
    const view = await mount()
    const text = view.text()

    expect(text).toContain('generated')
    // ⚠️ The model id is the subject of `S10`'s ledger (`10` §8.3), not of this
    // screen — and `03` §11 keeps the provider off reader-facing text.
    expect(text).not.toContain('claude-sonnet-5')
  })

  it('says the reader wrote it once an edit has been committed', async () => {
    const view = await mount({
      provenance: [{ fieldName: 'meaning', kind: 'human', modelId: null, dictionaryVersion: null }],
    })

    expect(view.text()).toContain('edited by you')
  })
})

describe('the edit reaches the judgement fields and nothing else', () => {
  it('offers no field at all while no edit is open', async () => {
    const view = await mount()

    expect(view.findAll('textarea')).toHaveLength(0)
    expect(view.text()).toContain('図書館')
  })

  it('offers exactly the three the declaration marks as judgement', async () => {
    const view = await mount({}, {
      meaning: 'library',
      example_sentence: FIELDS.example_sentence,
      example_gloss: FIELDS.example_gloss,
    })

    const labels = view.findAll('textarea').map(field => field.attributes('aria-label'))

    expect(labels).toEqual(['MEANING', 'EXAMPLE', 'GLOSS'])
  })
})
