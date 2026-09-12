# The Vet queue is oldest-first, and the client holds no position in it

**`04` §12's first query orders by `note_vetting.created_at` ascending, and every *Vet* endpoint —
the read, each decision, the undo — answers with the same batch. The head of that batch *is* the
*note* on screen. The client stores no index, no cursor and no "which one am I on".**

ADR 0033 settled where `Z` reads its target from: the database, not client memory, "which is what
lets the undo survive a reload". Nothing settled what the *queue* was ordered by, or what the client
had to remember in order to put a *note* back "at the head of the queue" (ADR 0033's own words) after
an undo.

## Oldest-first is what makes the undo free

A queue drained in the order it was filled has a useful property: **the *note* just decided is older
than every *note* still waiting.** So returning it to *pending* returns it to the front, and the
`ORDER BY` that was already there does the work. There is nothing to remember and nothing to insert.

Under any other ordering — newest-first, random, by *source* — the undo has to carry a position, and
a position is client state. That is the state ADR 0033 spent its argument removing: `Z`'s target
comes from the durable record precisely so that a reload does not lose it, and it would be strange to
read the target from Postgres and then decide where to put it from a number held in a browser tab.

It is also the order `S2` implies. *Notes* are written as each *chunk* returns (ADR 0047), so
oldest-first is the order the *source* was read in — the reader vets 図書館 before 新しい because the
sentence had them in that order, which is the only ordering that makes the run feel like reading.

## The client holding no position is the same decision seen from the front

Because a *note* leaves the query the moment it is decided, **every answer's head is the *note* the
reader is looking at**. So the client renders `notes[0]` and nothing else. A reload lands where the
reader was. `Z` puts a *note* in front of them without the client agreeing to anything. Two tabs
cannot disagree about whose turn it is.

⚠️ **What is local is a short list of decisions still in flight**, and that is a different thing
from a position. `S3` measures one keystroke per *note* with nothing moving between them, so the next
*note* has to paint on the keystroke rather than on the response — the client drops the decided
*note* from what it renders, and every answer prunes that list back down. It adds exactly once
whether the request has landed or not, which is what keeps the chrome bar's counts honest.

## The answer is the whole batch, on every endpoint

Ten *notes*, on the read, on each decision and on the undo. Two consequences are deliberate:

- **The reader never waits.** The batch ahead is already in the page, so `S3`'s budget is spent on
  the reader rather than on a round trip per *note*.
- **The counts are never more than one keystroke old.** `09` §7 promises that *Vet* is where the
  queue visibly grows while an *ingestion* runs, and the count riding back on every decision is what
  makes that true without a second request.

## Alternatives considered

**A cursor** — `?after=<created_at>`, so a refill does not re-send what the client holds. Rejected:
it is an optimisation over a payload of ten rows, and it re-introduces exactly the position this
decision removes. A cursor over a queue being drained from the front and filled from the back is also
the classic place to skip a row.

**One *note* per request.** Simplest, and it fails `S3`: a round trip between every keystroke is a
wait the reader can see, on the screen whose whole thesis is that nothing moves between keystrokes.

**Flagged *notes* first.** `S9` returns an *accepted* *note* to the queue flagged, and it is tempting
to put it at the front. Rejected for now, and cheaply reversible: a flagged *note* already sorts to
the front, because its `note_vetting` row was created when the *note* was first generated and is
therefore old. The ordering gives it for free; a special case would be a second rule saying the same
thing.

## What it costs

**Ten rows on every keystroke**, with their provenance and *level claims* — a few kilobytes at
`S3`'s five-second median. That is the price of the client holding no state, and it is cheap in the
direction that matters: there is no way for the screen and the database to disagree about which
*note* is next, because only one of them has an opinion.

And **the queue is FIFO with no way to skip**. A reader stuck on a *note* they do not want to judge
has three keys and all of them decide it; there is no "later". PRD §5 makes vetting a queue rather
than a *session* and nothing has asked for one.

## Revisit if

A reader wants to vet one *source* at a time while two are ingesting — at which point the ordering
grows a partition by *source* and the start control grows a choice, and this decision becomes "within
a *source*, oldest first" rather than being replaced.
