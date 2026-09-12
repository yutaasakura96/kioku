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

## Amended 2026-09-13 — this decided *which script*, and left *whose reading* unstated

**Stage 3 took the surface's, and nothing had said otherwise.** `reading_of` reads
`token.reading_form` — the reading of the form the word happened to appear in — so あります keys
`有る␟あり` beside ある's `有る␟ある`, one word as two *notes*, which is the failure ADR 0006 exists
to prevent arriving through the half of the key the `normalized_form` finding did not cover. ⚠️ **And
it is worse than a key problem, for this ADR's own reason**: `reading` is on the answer side of the
recognition *template*, so the first *card* minted from an inflected word shows ひらい for 開く.
[#15](https://github.com/yutaasakura96/kioku/issues/15) is the finding; this is the rule.

**The rule: when the surface is inflected, the reading is the dictionary form's.** The test is
`surface != dictionary_form`; the reading is then Sudachi's answer for `dictionary_form`
re-tokenised, and otherwise the token's own `reading_form`. ⚠️ **The script rule above is unchanged
and applies on top of it** — wholly katakana keeps, everything else converts, tested on the term.

### Three candidates, and the measurement ranks them the other way round

Measured 2026-09-13, SudachiPy 0.6.11 / `SudachiDict-core` 20260723:

| | Rule | し (`する`) | 開い | 時 in 六時 | API |
| --- | --- | --- | --- | --- | --- |
| A | re-tokenise `normalized_form` | **ナル** | ヒラク | **トキ** | public |
| B | `dictionary_form_word_id`, resolved | スル | ヒラク | ジ | deprecated accessor |
| C | re-tokenise `dictionary_form`, inflected only | スル | ヒラク | ジ | public |

⚠️ **A is #15's preferred candidate and it is wrong for する.** `normalized_form` for し is 為る, and
為る tokenised alone reads **ナル** — a word as common as any in the language, given the reading of a
different one. Nothing in #15's five verified cases (有る, 開く, 引っ越し, ひらがな, コーヒー) reaches
it, because every one of them normalises to an orthography that is read the way it is written.

**The 時 column is what makes the inflection guard load-bearing rather than an optimisation.** 六時's
時 is uninflected and reads ジ; re-tokenised alone it reads トキ. Any rule that rewrites every token's
reading breaks the words it was not aimed at, so the rule is scoped to the tokens that actually
inflected.

**C is chosen over B on the API and nothing else.** They agree on every token measured. B needs
`WordInfo.dictionary_form_word_id`, and SudachiPy 0.6.11 emits
`DeprecationWarning: Users should not touch the raw WordInfo` for the accessor that reaches it. C is
2.1 µs/token against B's 2.6 (24 inflected tokens, 200 iterations), which is not the reason — the
deprecation is.

⚠️ **One correction to #15, kept because it will be looked for again.** #15 says SudachiPy 0.6.11
"exposes no public lexicon accessor", and that is wrong: `Dictionary.lookup(dictionary_form)` returns
the candidate entries and each carries a public `word_id()`, so matching B's dfwid needs no private
API. What B cannot avoid is reading the dfwid itself. **The public route exists and B still loses.**

### What #15's second acceptance criterion asked for is not reachable

⚠️ **`開く␟あく` is not produced by this tokeniser, under any of the three rules, and was not produced
before the defect either.** The あく entries are in the lexicon — word ids 732354 and 732125, readings
アク and アイ — and the analyser never selects them. Sixteen sentences written to force the sense
(店が開く, 穴が開く, 鍵が開く, 差が開く, 幕が開く, 傷口が開く …) across all three split modes gave
**48 hits out of 48 as 732355 ヒラク**. The inflected entry 開い carries one fixed
`dictionary_form_word_id`, so there is no in-context resolution being discarded either — which is the
advantage #15 claims for B and it is not there.

**So `04` §5.3's `開く␟ひらく` / `開く␟あく` pair is a worked example of the key's shape, not a pair
this pipeline mints.** The two *notes* it actually produced were `開く␟ひらく` and `開く␟ひらい`, and
the second one is the bug. #15's criterion was rewritten to say what the tokeniser does; the pair
stays in `04` §5.3 as what the key is *for*, because a second dictionary or a second *subject* can
still produce it.

### Where the rule goes, which is not where the defect is

⚠️ **`reading_of` cannot implement this and must not learn how.** Stage 3 is pure — *tokens in,
candidates out: no dictionary* — and re-tokenising needs the dictionary. The re-tokenised reading is
stage 2's to compute and to carry on `Token`, beside `dictionary_form`, which is already there;
stage 3 keeps the inflection test and the script rule, both of which read fields it already has.

### The consequence, and the only cheap moment to take it

⚠️ **This changes `note.identity_key` for every *note* written from an inflected form** — `04` §5.3's
reviewed data event, the same class as a `SudachiDict` bump. **Today the cost is zero because no
*note* has ever been written**, and it stops being zero the moment `docs/first-run-expectation.md`'s
run mints twenty of them. That is the whole reason #15 is sequenced in front of the first run rather
than after it. `worker/tests/test_generation.py::test_an_ingestion_that_produces_no_new_notes_is_a_success`
seeds `有る␟あり` and becomes `有る␟ある` with it.

## Revisit if

⚠️ **This is a reviewed data event, not a refactor.** `04` §5.3: *changing the rendering rule changes
the identity of existing notes* — the same class as a `SudachiDict` bump (`03` §5.3). Today the cost
is zero because no *note* has ever been written; after the first real ingestion it is a re-ingestion
plan. If the first twenty notes (`00-status.md` § Next's experiment) show readings that look wrong on
a card, that is the moment to change it, and it is the cheapest moment there will ever be.
