# A domain is a claim like a level, and a filter only touches the new half

**Decided 2026-09-16, with [ADR 0063](0063-the-input-is-a-chosen-word-list.md).**
Every term carries a *domain* and a *level*, both filled by the model as attributed claims. *Domain*
gets its own table, mirroring `level_claim`. The values come from a closed set declared in the
*subject*. A filtered *session* filters which new *cards* are introduced and never which due *cards*
are owed.

## Why this is the reason the app exists

WaniKani teaches kanji in an order chosen for kanji, and the word that shows up in a stand-up about a
deployment is not in it. Yuta said the missing thing plainly: he wants tech and business vocabulary,
and no existing app lets him ask for it. **A *domain* on every term is that ask, and everything else
in this ADR is plumbing for it.**

## The word collides, and I am taking it anyway

`CONTEXT.md` lists *domain* in the `_Avoid_` line for **subject**. That was written when nothing else
wanted the word. Something does now, and the two are not close enough to confuse once both are
stated:

- A ***subject*** is declared in `subjects/`, names the *fields* and the *templates*, and picks the
  pipeline (ADR 0003, ADR 0063). There is one of them.
- A ***domain*** is a claim about one term, filled by the model, and filters what the reader studies
  next. There are a handful, and they live in data.

*Domain* comes off **subject**'s avoid list and gets its own entry. The alternative words were worse:
*field* already means a *note*'s field, *category* and *topic* are the ones `CONTEXT.md` pushed away
from **subject** for being vague, and *register* means something specific and different to linguists.

## What is decided

**1. `domain_claim`, shaped exactly like `level_claim`.**

```
domain_claim(id, note_id → note ON DELETE CASCADE, authority_key, domain, model_id,
             prompt_version, created_at)
CHECK ((authority_key IS NULL) = (model_id IS NOT NULL))
UNIQUE NULLS NOT DISTINCT (note_id, authority_key)
INDEX (note_id)
```

Same attribution check, same *exactly one model estimate* rule, same reason
([ADR 0005](0005-a-level-is-a-set-of-attributed-claims.md)). A deck's own tag becomes an authority
later; the model estimate is authority-less and carries the model and prompt version that produced
it.

**2. The values are a closed set, declared per *subject*.** The declaration gains `domains` and
`levels`:

```
"levels":  ["N5", "N4", "N3", "N2", "N1"],
"domains": ["tech", "business", "daily", "academic", "general"]
```

⚠️ **This is the decision that makes the filter work at all.** Ask a model for a free-text domain and
it will answer `tech`, `technology`, `IT`, `software engineering` and `computing` for five words that
belong together, and a filter over that returns four of the five. The prompt names the legal values
and the writer rejects anything else.

**`general` exists so the model always has a legal answer.** Without a bucket for *this is just a
word*, every borderline term gets forced into `tech`, and `tech` stops meaning anything.

**3. Nothing writes a level claim today, and that is the work.** `level_claim` has a table, a read
path in `server/utils/vet/queries.ts`, schema tests, and the *provenance marker* that renders a model
estimate hollow. What it does not have is a producer. The `generate` stage fills the level and the
domain alongside the six *fields*, in the same request, because it is the same paragraph of
understanding about the same word and a second request would pay twice for it.

**4. A level is still an attributed claim and is never treated as fact.** ADR 0005 was verified in
2026-09-03: the JLPT has published no official vocabulary list since 2010, deliberately. A model's
`N3` is a guess with a name on it. The *provenance marker*, hollow for a model estimate, is the one
visible honesty bit and it does not go behind a hover.

**5. A filtered *session* filters the new half only.** The *session* request may carry a set of
domains and a set of levels. They restrict which *cards* are introduced. **The due half is never
filtered.**

⚠️ **This is not a simplification, it is the point.** A filter over due *cards* lets the reader study
`tech` for a fortnight while `business` quietly rots, and then hands him the backlog that
[ADR 0066](0066-the-review-load-has-a-brake.md) exists to prevent. What is owed is owed. What is
chosen is what comes next.

**6. This is not a *deck*.** [ADR 0009](0009-a-deck-is-a-saved-query.md) says a *deck* is a saved
query over the *card* pool, and nothing here is saved. The filter is an argument to one *session*.
When it is worth saving, it becomes a *deck*, and ADR 0009 already says what that means.

## Alternatives considered

**Put the domain in `note.fields`.** It is one string and the blob is right there. Rejected on
[ADR 0029](0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md)'s own terms: the blob has
no index because no query reads inside it, and its note says the index is the one a future session
adds on principle rather than for a query. This is the query. It also splits the answer, with *level*
relational and *domain* in a document, and the split would have to be undone the first time anything
filtered on both.

**Generalise `level_claim` into one `term_claim(kind, value, …)` table.** The dry answer, and I
nearly took it. Rejected because it migrates a live table to buy nothing today, and it trades a
column named `level` for a pair of columns named `kind` and `value`, which every query then has to
filter. ⚠️ **The third attribute is the moment to generalise**, and this ADR is the note that says
so.

**Let the model invent domain labels and normalise them later.** Rejected: the normalisation is a
second model call, or a mapping table nobody maintains, and it fails silently in the direction of
missing *cards*.

**Ask the reader for the domain when he compiles the list.** He said he does not want to do anything
manually beyond studying, and a list of fifty words with a domain typed beside each is exactly the
kind of manual work that stops a list from being compiled at all.

## Revisit if

- A third attribute wants a claim table. Generalise then, with three producers to design against.
- An authority arrives with real domain tags, most likely an imported Anki deck's own tags
  (ADR 0063). `authority_key` is already in the table for it.
- The closed set stops fitting. Five values is a guess, and the evidence will be a `general` bucket
  holding half the deck, or a reader who keeps wanting a split that does not exist.
