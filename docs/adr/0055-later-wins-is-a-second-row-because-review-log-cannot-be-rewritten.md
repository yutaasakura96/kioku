# Later wins is a second row, because review_log cannot be rewritten

**PRD §5's *the same card graded twice — both replay; the later timestamp wins* is implemented as:
the second *grade* is refused when its stamp is at or before the one already recorded, and
**written as a second `review_log` row** when it is genuinely later. The rail and the tally read the
rows in stamp order, so the later one is the one that shows.**

## The rule could not mean what it sounds like

*Later wins* sounds like *the later one replaces the earlier one*. **Nothing in this system can do
that.** `04` §7.5's trigger refuses an `UPDATE` and a `DELETE` against `review_log`, which is ADR
0011's one irreplaceable thing, and `03` §13.6 names it as the only thing a backup exists for. A rule
that replaced a committed row would have been unimplementable against the table it is about.

So *later wins* has exactly one available meaning: **the later one is also written, and everything
that reads a *card*'s answer reads the latest stamp.** That is what `snapshotOf` now does — the
`review_log` rows for a *session* are read `ORDER BY reviewed_at`, so the last one into the map is
the last one the reader gave.

## The two cases are told apart by the stamp, not by counting

#12 refused any second *grade* for a `(session, card)` pair as `already_graded`, and called it a held
key. #13 has to keep that and allow PRD §5's case, and the stamp is what separates them:

| What happened | The stamp | What the server does |
| --- | --- | --- |
| A held key, or the same entry replayed because the acknowledgement was lost | **Identical** | `already_graded` — nothing is written |
| The reader genuinely answered the same *card* again | **Later** | A second `review_log` row; the epoch moves on |

⚠️ **The duplicate case is the common one and it is exact.** The outbox replays *entries*, and an
entry carries the stamp it was created with (`shared/review/outbox.ts`) — so a replay after a lost
response is byte-identical, and `reviewed_at >= incoming` catches it without a heuristic.

## The genuinely-later case is rare by construction, and that is deliberate

A single device cannot easily produce it: a graded position leaves the run (`S7`, ADR 0016), and
⚠️ **a resumed run is re-answered from the outbox before the reader sees it**
(`unsentAnswers`, ADR 0039 property 4), so a reload with an unflushed *grade* does not ask again.
What remains is ADR 0007's explicitly undefined territory — *reviewing the same card offline on two
devices is undefined behaviour, and the answer is "don't"* — plus a stale tab.

**Recording both is the honest answer for that territory.** The reader answered twice; two answers
happened; the scheduler sees two reviews and the history says so. The alternative — dropping one —
would be the conflict resolution ADR 0007 says does not exist anywhere in this system.

## Alternatives considered

**Keep #12's rule: the first *grade* for a pair wins, always.** Simple, and it contradicts a PRD
acceptance criterion. It also silently discards the only *grade* the reader would remember giving.

**Supersede the first epoch and start a new one.** Rejected: `04` §7.4 makes a new *scheduling epoch*
mean *what was memorised was invalidated*, which is a reset. A second answer to the same question is
not a reset, and spending the mechanism on it would make `scheduling_epoch.ordinal` mean two
different things.

**A unique index on `(review_session_id, card_id)`.** Rejected — it would turn PRD §5's case into a
database error on the one path that must never lose a *grade*, and the error would surface as a
flush that retries forever.

## Consequences

⚠️ **A *session* can hold more `review_log` rows than it has positions**, and every consumer that
counts reviews per *session* has to know it. The two that exist do: `snapshotOf` builds a map keyed
on `card_id`, and the end screen's tally counts positions rather than rows (ADR 0053). **#14's
*session* completion rate is the next one**, and *graded ÷ size* stays correct only because it reads
positions.

The epoch advances twice, so `reps` counts both answers. That is the truth about what happened, and
it is what an optimiser reading the log six months from now should see.

## Revisit if

A second device is ever supported, which is the moment ADR 0007's "one user, one device" stops being
the boundary and *later wins* stops being an edge case — at which point the rule needs a merge
policy rather than an ordering, and that is the local-first architecture `01` §2.2 refused.
