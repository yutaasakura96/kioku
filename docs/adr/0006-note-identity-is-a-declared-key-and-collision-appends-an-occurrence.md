# Note identity is a declared key; collision appends an occurrence

A note's **identity key** is declared per subject alongside its schema (ADR 0003). For JLPT
vocabulary it is *(dictionary-form term, reading)* — enough to separate 開く/ひらく from 開く/あく,
which are two words wearing one set of kanji. A tech subject keys on a normalised term string.

Sense-level identity was rejected because it defeats the question it claims to answer: the same word
becomes several notes, so a fifty-page ingestion yields かける eight times because eight senses
appeared, and the deduplication §4.6 exists to provide stops working. A word with several senses is
one thing you learn that holds several meanings.

*(A second argument against sense-keying — that dictionary sense indices are not stable across
releases — is plausible for JMdict but **unverified**, and the decision does not rest on it. It must
be checked before anything keys on a sense id.)*

## Collision appends, it does not combine

On a key match the second sighting **appends an occurrence** — this note also appeared in source Y at
position Z. It does not produce a competing set of fields to reconcile. Provenance grows; the note's
fields do not change; no card is minted, so **scheduling is untouched**. There was never a merge in
the difficult sense.

Consequently **there is no merge review**: a deterministic key means there is an exact match or there
is not, never a *proposal*. Merge review is the tax paid for fuzzy identity, and keeping identity
deterministic is what buys the automatic path. Deduplication runs before review, so a fifty-page
ingestion presents thirty unique notes rather than four hundred occurrences.

## Two consequences, accepted deliberately

- **An accepted note's fields are frozen.** A later source implying a sense the note lacks raises a
  flag; it does not rewrite the note. Silently editing a card studied for a month breaks the contract
  between the card and the memory of it — you would be re-learning without being told. Flag, then
  optional re-review. (Picked up again in §4.11.)
- **Rejection is permanent and survives re-ingestion.** A rejected term is not resurrected by a
  second sighting. Otherwise every ingestion re-asks about the two hundred words already declined,
  and review cost would grow with corpus size rather than with new material — the shape that kills §5.

The rejected set therefore accumulates into a lexicon of what is already known, which is §3's
known-word tracking arriving as a side effect. Noted, not designed; that is §4.8.
