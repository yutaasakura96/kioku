# The reading half of the identity key is written in the word's own script

**Stage 3 converts SudachiPy's `reading_form()` from katakana to hiragana, *except* when the term is
itself written wholly in katakana, in which case the reading keeps it. 図書館 reads としょかん;
コーヒー reads コーヒー.**

## Something had to give

ADR 0006 keys a *note* on *(term, reading)* and `04` §5.3 renders that key by NFC-normalising each
value and joining them with U+001F. It gives three worked examples — `図書館␟としょかん`,
`開く␟ひらく`, `開く␟あく` — and the note-fields example alongside them,
`{"term":"図書館","reading":"としょかん", …}`. **Every one is hiragana.** So are the rows the schema tier
has been seeding since #4: `test/schema/harness.ts` and `test/schema/schema.test.ts` insert
`'図書館␟としょかん'` and `'開く␟ひらく'` as literals.

SudachiPy returns `トショカン`. Nothing had noticed, because until #8 no code produced a key — every
key in the repository was a test literal written by hand. The first ticket to render one had to pick,
and the documents and the committed fixtures agree with each other: hiragana.

## Why not simply convert everything

The obvious rule — shift U+30A1–U+30F6 down by 0x60 — gives コーヒー the reading こーひー. That is
deterministic and it is wrong, for a reason that only shows up when you ask *who reads this*:

⚠️ **`reading` is not only half of a key. It is a field on the card.** The declaration marks it
`kind: "lookup"`, `memory_bearing: true`, and the recognition *template* puts it on the answer side.
So it is rendered on *Vet* and rendered again on every *review* — `10` §5. A key nobody sees can be
odd; a field on the answer side of a card cannot, because the whole point of ADR 0004's *lookup* kind
is that the reader trusts it enough to read past it quietly.

Japanese does not write loanword readings in hiragana. こーひー is not a spelling anyone uses.

## The rule, and where it is drawn

**Wholly katakana → keep. Anything else → hiragana.** The test is on the *term* (Sudachi's
`normalized_form`), not on the surface, and the block is U+30A1–U+30FF so that ー and ・ count.
Measured 2026-09-11 against `SudachiDict-core` 20260723:

| Surface | Term (`normalized_form`) | `reading_form()` | Reading stored |
| --- | --- | --- | --- |
| 図書館 | 図書館 | トショカン | としょかん |
| コーヒー | コーヒー | コーヒー | コーヒー |
| ひらがな | **平仮名** | ヒラガナ | ひらがな |
| パン屋 | パン屋 | パンヤ | ぱんや |

⚠️ **ひらがな is the case that decides the rule is about the term rather than the surface.** Its
normalized form is 平仮名 — kanji — so a rule reading the surface would have kept ヒラガナ for a word
the reader pasted in kana.

パン屋 is the honest cost: mixed script takes the hiragana branch and reads ぱんや, where a human might
write パンや. A half-converted reading would be worse than either, so the rule is *wholly* katakana.

## Alternatives considered

**Store katakana everywhere and let the screen convert.** Rejected: the conversion would then live in
a Vue component, where `11` §8 has no seam for it, and the identity key — which is `04` §5.3's
"rendering rule is part of the identity" — would be in a script the documents' own examples do not
use.

**Store both, key on one.** Rejected as a column the declaration does not have and nothing would
read. ADR 0003 makes fields additive, so this stays available if a reason appears.

**Keep the mechanical conversion and accept こーひー.** Rejected once it was clear the value is
rendered on a card.

## Revisit if

⚠️ **This is a reviewed data event, not a refactor.** `04` §5.3: *changing the rendering rule changes
the identity of existing notes* — the same class as a `SudachiDict` bump (`03` §5.3). Today the cost
is zero because no *note* has ever been written; after the first real ingestion it is a re-ingestion
plan. If the first twenty notes (`00-status.md` § Next's experiment) show readings that look wrong on
a card, that is the moment to change it, and it is the cheapest moment there will ever be.
