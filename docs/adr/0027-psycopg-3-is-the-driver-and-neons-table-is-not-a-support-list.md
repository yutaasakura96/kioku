# psycopg 3 is the driver, and Neon's table is not a support list

**The Python worker connects with `psycopg[binary]` ≥ 3.2.4, on Neon's direct endpoint,
`autocommit=True`, using the `Connection.notifies(timeout=...)` generator. The connection string is
the one Neon issues, unmodified — no `options=endpoint%3D...`.**

This ADR exists mostly to stop the objection being raised a third time.

## The table that appeared to exclude psycopg is a SNI-compatibility list

Neon's driver table lives on `connect/connection-errors`, not on the compatibility page an earlier
session searched — that page contains no driver list at all. The sentence immediately **above** the
table is the load-bearing one:

> Clients on the list of drivers on the PostgreSQL community wiki that use your system's `libpq`
> library should work if your `libpq` version is >= 14.

Only then: "Neon has tested the following drivers for SNI support." **Every entry in that table is a
native reimplementation of the wire protocol** — asyncpg, pg8000, node-postgres, postgres.js, pgx,
Postgrex, PostgresNIO. It is a list of drivers Neon had to test *because they do not use libpq*.
psycopg is a libpq wrapper, so it is covered by the sentence above the table. The word "supported"
appears nowhere on the page except per-row, about SNI.

Neon's own Python and Django guides then use psycopg 3 with a plain connection string and no SNI
workaround, and the Django guide steers explicitly toward `psycopg[binary]` and away from psycopg2.
`psycopg[binary]` bundles libpq 17.2; libpq sets `sslsni=1` by default. Full sourcing in
`phase-4-verification.md` §9.

## ≥ 3.2.4 is a reason, not a version pin

Before psycopg 3.2.4, **notifications arriving between issuing `LISTEN` and starting the generator
were silently lost**. That is precisely the worker's startup sequence, and precisely the failure
mode that is invisible until a job goes missing. The floor exists for that reason and must not be
relaxed by a future dependency cleanup that sees only a version number.

## It is the only one of the three with a blocking wait

asyncpg's `add_listener()` requires an event loop the worker does not otherwise need. pg8000 offers
a `notifications` deque and no blocking API at all, so it must be polled. psycopg 3's
`notifies(timeout=...)` generator is the shape of a synchronous listener, which is what ADR 0015
describes.

## Alternatives considered

**asyncpg** — rejected. It is in Neon's table, which was the entire argument for it, and that
argument turns out to be about SNI rather than support. It would impose async on a worker that has
no other reason to be async.

**pg8000** — rejected. Pure-Python and dependency-light, but polling-shaped.

**psycopg2** — rejected. Neon documents an actual SNI failure mode for it when built against a
system libpq older than 14, and it is the driver Neon's own guide tells people to move off.

## What it costs

Nothing measurable. The dependency is heavier than pg8000 by a bundled libpq.

## Revisit if

The worker ever needs to be async for a reason unrelated to the database — at which point asyncpg
becomes the natural choice and this decision is cheap to reverse, because ADR 0028 keeps
correctness out of the notification path.
