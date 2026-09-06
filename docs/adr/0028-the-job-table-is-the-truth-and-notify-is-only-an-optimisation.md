# The job table is the truth, and NOTIFY is only an optimisation

**The worker's correctness never depends on a notification arriving. It claims work by querying the
job table; `LISTEN`/`NOTIFY` exists only to shorten the latency between a job being written and the
worker noticing. On every connect and reconnect the worker re-`LISTEN`s and then polls the table for
anything unclaimed, in that order.**

## Neon guarantees the listener will be torn down

Neon's own compatibility documentation:

> notifications and listeners defined using NOTIFY/LISTEN commands only exist for the duration of
> the current session and are lost when the session ends.

The Free plan **cannot disable scale-to-zero** — the compute suspends after five minutes of
inactivity. So the session ends routinely, by design, and every notification fired while the worker
was disconnected is not delayed but gone. A design in which `NOTIFY` is the transport loses jobs on
a schedule.

Ordering matters and is easy to get backwards: `LISTEN` first, then poll. Polling first leaves a
window between the query and the subscription in which a notification lands with nobody listening.

## This also settles a contradiction the project was carrying

`00-status.md` asserted that a held listener keeps the Neon compute awake and would exhaust the free
month. Neon documents what *wakes* an idle compute — connecting, querying, API access — but never
states what *prevents* suspension, so that assertion is unverified in both directions
(`phase-4-verification.md` §9). **This decision is correct whichever way it resolves**, which is the
main reason to take it now rather than after the experiment.

## It is the pattern the project already uses twice

ADR 0007 stamps each *grade* client-side and flushes through an outbox, so the interface never waits
on the network and a lost flush costs latency rather than data. ADR 0015 makes ingestion a job table
in the first place. This is the same shape a third time: **write immediately, treat the signal as a
hint, and let the durable record be the one that decides.** `CLAUDE.md` names it as the pattern
worth stealing from `lfca-lab`.

## Alternatives considered

**`NOTIFY` as transport, with a paid plan to keep the compute alive** — rejected. It buys a
guarantee with money that a poll gives for free, and ADR 0022 makes the current hosting deliberately
temporary, so building on a plan feature is building on something scheduled to move.

**Polling only, no `NOTIFY` at all** — genuinely close, and it would be simpler. Rejected on
*time-to-first-review*: a poll interval long enough to be cheap adds itself to the measured number,
and that number is one of the project's two health metrics.

**A held daemon that never disconnects** — rejected as unverified in one direction and forbidden in
the other: `00-status.md` warns against it on cost grounds, and Neon does not confirm it would even
work.

## What it costs

Reconnect-and-catch-up logic that would not exist if the notification were trustworthy, and a
`claimed`/`unclaimed` distinction in the job table that `04-database-schema.md` now has to carry.

## Revisit if

The worker moves off Neon Free to the EC2 or Lightsail destination in ADR 0022 and the database
stops suspending — at which point the poll can lengthen, but it should not be removed, because it is
what makes the notification optional.
