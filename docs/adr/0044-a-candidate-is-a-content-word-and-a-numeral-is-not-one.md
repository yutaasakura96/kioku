# A candidate is a content word, and a numeral is not one

**Stage 3 keeps a morpheme as a *candidate* only when its part of speech is on a closed allowlist of
eleven `(pos₀, pos₁)` pairs — ordinary nouns, verbs, adjectives, adjectival nouns, adverbs,
prenominals, conjunctions and non-filler interjections. Everything else is dropped: particles,
auxiliaries, punctuation, whitespace, symbols, bound prefixes and suffixes, proper nouns, fillers,
pronouns, and numerals.**

No document names this rule. `03` §5.1 names the stage — *extract candidates* — and `03` §5.2 gives
exactly one exclusion, numerals, for a reason that is about the *identity key* rather than about what
vocabulary is. The nearest thing to a specification is `04` §6.1's worked example of the ledger,
`(…, 214, 106, 71, 9, …)`: a *source* that produced 214 candidates and generated 28. Two pages of
Japanese tokenise to far more morphemes than 214, so heavy filtering was always implied and never
written down. It is written down here, with #8, for the same reason ADR 0041 wrote down the chunking
rule with #6: the ticket that has to produce the rows is the one that can no longer avoid deciding.

## The line is *content words*

A *note* costs a vetting decision (`S3` gives the median five seconds) and, once accepted, a card and
a place in the scheduler forever. The question the allowlist answers is not "is this a morpheme" but
"is this a thing you learn". は is not. 。 is not. お‑ is not a word at all.

The taxonomy is not guessed at: `SudachiDict-core` 20260723 declares **1,558 part-of-speech tuples
over 16 top-level classes**, enumerated from the installed dictionary on 2026-09-11 with
`Dictionary().pos_matcher`. The allowlist is 11 of the 38 distinct `(pos₀, pos₁)` pairs and the
explicit exclusion list is the other 27, so the two cover the dictionary exactly — and
`worker/tests/test_extract_candidates.py` asserts that they do. **A release that added a category
would fail that test by name** rather than dropping a word class in silence, which is the only way a
closed allowlist is safe to hold.

Three of the exclusions are judgements rather than obvious, and they are the ones to argue with:

- **固有名詞 — proper nouns.** A news *source* is full of them, no JLPT list contains any of them, and
  each one would cost a decision. Excluded.
- **代名詞 — pronouns.** ⚠️ **The most arguable line in the list.** これ / それ / あなた are closed-class,
  they appear in nearly every *source*, and a reader running this tool is past them. But they are
  genuinely N5 vocabulary, and this is the exclusion most likely to be wrong.
- **感動詞 フィラー** — えーと, あのー. Speech, not words.

Against them, two inclusions that look wrong and are not: **動詞 非自立可能** is ある / いる / くる — the
name means *can be non-independent*, not *is not a word* — and **形容詞 非自立可能** is ない.

## The numeral rule is the one exclusion a document already required

`03` §5.2 records it as a measured finding: 六 comes back `is_oov=True` with `normalized_form`
rewritten to ASCII `6`. ADR 0006's *identity key* takes its term half from `normalized_form`
(`03` §16, and ADR 0019's table), so a numeral-heavy *source* keys strangely and, worse, keys
**consistently** strangely — which is how it survives review. `04` §5.3 states the consequence
directly: *numerals never reach this column.*

⚠️ **It is implemented twice, deliberately.** The part of speech — 名詞 数詞 — is the correct signal
and catches both 六 and a plain `6`, which is `is_oov=False` and would otherwise walk straight
through. The second clause reads `is_oov` together with an all-ASCII-digit normalised form, which is
the finding `03` §5.2 actually recorded and holds even if a future dictionary files a numeral
somewhere else. Neither is load-bearing alone. `04` §5.3's sentence is worth guarding twice, which is
the practice `11` §5 established for the schema's own guards.

⚠️ **`is_oov` is read twice for two different reasons and both readers are now built** (`03` §5.2):
here by the numeral rule, and by *provenance* to distinguish a looked-up reading from a generated one
(ADR 0019, `04` §5.4). Stage 3 carries the flag onto the *candidate* rather than consuming it, so #9
has something to write.

## Alternatives considered

**No filter — every morpheme is a candidate.** Rejected on `S3`: the reader would spend the five
seconds saying no to は. It also makes ADR 0006's rejected set — which ADR 0006 notes accumulates
into a lexicon of what is already known — a lexicon of Japanese grammar instead.

**A frequency or JLPT-level filter instead of a grammatical one.** Rejected because ADR 0005 already
established that the JLPT publishes no official list, so a level filter would be a model estimate
deciding what the reader is *shown*, not merely how it is labelled. A part of speech is a fact the
tokeniser reports.

**An allowlist of top-level classes only, without the second element.** Rejected: three of the
exclusions live one level down — 数詞, 固有名詞 and 助動詞語幹 are all 名詞 — so a top-level list could not
express the one rule a document already required.

## Revisit if

The first real run of twenty notes (`00-status.md` § Next's experiment, ADR 0037) comes back full of
words the reader immediately rejects, or missing words they expected. **That experiment is the
instrument for this decision**, and the rejected set is the evidence: a filter this list should have
made is visible as a cluster of rejections sharing a part of speech. 代名詞 is the first line to
re-argue.

⚠️ **Changing the allowlist does not change the identity of an existing *note*** — unlike a
`SudachiDict` bump (`03` §5.3) or the rendering rule (`04` §5.3). It changes which *candidates* reach
*vetting* from then on, and nothing already written moves. It is safe to change and it is not free:
words already rejected stay rejected (ADR 0006), so widening the list does not re-ask about them.
