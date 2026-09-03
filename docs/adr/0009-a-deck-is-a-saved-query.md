# A deck is a saved query

**v1 has no decks.** One subject, one queue, no grouping concept at all. Everything below is v2 —
except the scheduling rule, which is in the data model and therefore due now.

A **deck** is a saved query over the card pool. It owns nothing, and nothing is ever moved into or
out of it. Deck *ownership* is an artifact of hand-authoring — you type a card into a place, so the
place is where it lives. Kioku generates in bulk, and by the time a card exists it already carries
its subject, its source, its level claims and its lapse count, so every grouping worth having is
derivable. Asking the user to then file cards into folders is manual organisation work: the same
category of chore as manual authoring, which is the category the app exists to delete.

## One schedule per card, never per card-per-deck

This is not a preference. A card's scheduling state models **your memory of a fact**, and you have
one memory of a word regardless of which query surfaced it. Per-deck scheduling would make the same
word simultaneously well-known and forgotten — not a trade-off, an incoherence. It also dissolves
"can a card be in several decks?": trivially yes, and it changes nothing.

## Consequences

- Unlike Anki's filtered decks, a deck never relocates cards. Anki's move-out-and-back mechanism
  exists to work around deck ownership; query-first does not need it.
- **The pool is everything due; a deck narrows it, and "everything due" is always available**, so no
  card is orphaned by matching no saved query.
- Whether a deck re-evaluates mid-session answers itself: ADR 0007 prefetches the session, so it is
  snapshotted at the start.

## The cost, stated plainly

Query-first is only as good as its query builder. Anki's search syntax is powerful and genuinely
unpleasant, and a bad query UI is worse than folders. That is the thing that could make this wrong.
