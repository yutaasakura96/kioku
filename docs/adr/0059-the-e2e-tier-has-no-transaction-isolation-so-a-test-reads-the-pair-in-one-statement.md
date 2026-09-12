# The e2e tier has no transaction isolation, so a test reads the pair in one statement

**`test/e2e/database.ts` hands the test an in-process PGlite handle and hands the app a socket in
front of the same instance. They are not two connections to one database — they are one backend
session. A test that polls one field and then reads another can read both out of a transaction the
app has not committed, and `test/e2e/vet.test.ts` did, in roughly one full-suite run in four. ⚠️ **The
rule: what the app writes in one transaction, the test reads in one statement.***

## The measurement

Probed 2026-09-12 against `@electric-sql/pglite-socket` 0.2.11, `@electric-sql/pglite` 0.5.8 and
`pg` 8.23.0 — a `pg` client through the socket opens a transaction and does not commit it, while the
in-process handle reads:

| | |
| --- | --- |
| in-process read, app mid-transaction | sees the **uncommitted** row |
| `txid_current_if_assigned()` | `753` from both |
| `pg_backend_pid()` | `42` from both |
| in-process write, then app `ROLLBACK` | the write is **gone** |

Both directions follow from the one fact. The in-process handle does not observe the app's
transaction; it is **inside** it.

## What it made fail, and how it was demonstrated

`server/utils/vet/decide.ts` is one transaction by design and says so at the top — `BEGIN`, update
`note_vetting` to `accepted`, insert the `card`, `COMMIT`. Between the two writes is a socket round
trip. `test/e2e/vet.test.ts` polled `state` alone, took `'accepted'` as *the decision has landed*,
and read the `card` count as a second statement:

```
AssertionError: acceptance mints the card — `04` §7.3: expected +0 to be 1
 ❯ test/e2e/vet.test.ts:153:70
```

⚠️ **A committed `accepted` with no `card` is impossible, which is what made this look like a missing
`await` for as long as it went unexplained.** It is not one. The poll landed in the gap, read
`accepted` out of the open transaction, and the card count landed in the same gap behind it.

**Demonstrated rather than argued**: a 150 ms sleep inserted between the update and the mint turns
the failure from intermittent into every run, with that message verbatim. The same 150 ms against the
one-statement form below passes.

## It is the third face of a finding this tier already had

`11` §6.1 carries the `Promise.all` trap and `11` §4 carries the `page.reload()` one. Both are the
socket refusing a second connection; both answer `500`; both are loud once you know to look.

⚠️ **This one is the same root cause and the opposite symptom.** Nothing is refused, nothing errors,
and the test goes green most of the time. The sharper statement of the shared cause, which neither
existing bullet makes:

> The single connection is a single **session**, not merely a single **socket**. The first two
> findings are about what the socket refuses. This one is about what the session shares.

## Alternatives considered

**Read through a second `pg` connection instead of the in-process handle.** Rejected on the
measurement: same `pg_backend_pid`, same `txid`. There is no second session to be had, so this moves
the reads without changing what they can see.

**Wait on the browser rather than on the database** — let the *mode* advance or the queue empty, then
read once. Not rejected, and it is sound for the reason the poll is not: a response in the browser
implies the transaction committed. It is not *the* rule because it asserts the screen where the test
means to assert the row, and not every write has a visible consequence.

**Set an isolation level.** Rejected because isolation levels separate transactions and there is only
one transaction here. The test's reads are not in a *different* transaction from the app's; they are
in *the same* one.

**Give the e2e tier a real Postgres container.** Rejected: ADR 0038 confines Docker to `worker/`, and
this would buy a whole tier's setup cost to defeat one race that a one-statement read defeats for
free. It stays the revisit condition rather than the answer.

## Consequences

⚠️ **The rule, written so it can be applied without re-deriving it: if the app writes it in one
transaction, the test reads it in one statement.** A poll whose predicate spans two statements is a
poll over two snapshots, and this tier gives no guarantee they are the same snapshot.

The measured form in `test/e2e/vet.test.ts` reads the pair as one value —

```sql
SELECT v.state || '/' || (SELECT count(*) FROM card WHERE note_id = v.note_id) AS shape
  FROM note_vetting v WHERE v.note_id = '…';
```

— and polls it to `accepted/1`. A read that straddles the gap now returns `accepted/0`, which is not
the expected value, so the poll keeps going instead of passing a wrong answer through.

⚠️ **The reach is wider than the one file, which is why the audit is a ticket and not this ADR.**
Every e2e test that polls for state the app wrote is exposed to the same read, and each has to be
read on its own — some are safe by construction, because they assert after the browser has already
shown the consequence.

⚠️ **And the write direction is not fixed by this rule at all.** A *test* write issued while the app
holds a transaction joins that transaction and a rollback takes it with it. Nothing in the suite is
known to do this today — the seeds run before the page opens — but a `beforeEach` cleanup placed
between two browser actions would, and the symptom would be a fixture that silently was not there.

## Amended 2026-09-12 — the audit, and what it found

**The audit this ADR ticketed is done, and there was a second one.** `test/e2e/review.test.ts`
polled the `card_flag` count to `1` and then counted suspended *cards* as a separate statement.
`server/utils/review/flag.ts` writes both — four writes, one transaction (`04` §7.8) — so a poll
that lands between the insert and the update takes an uncommitted `1` for *the flag has landed* and
reads the suspension as `0`. ⚠️ **It had never been observed to fail**, and it fails **every** run
once the gap is widened. It now polls a single value to `1/1`.

**The other four e2e files are safe by construction, and the reason is structural rather than
lucky.** `stats.test.ts`, `ingest.test.ts`, `auth.test.ts` and `no-scripts.test.ts` open no browser:
every database read in them follows an **awaited** `nuxtFetch`, and a response that has arrived is a
transaction that has committed. Only a test that acts on a page and then looks at a row can read
while a request is in flight, which is why the two browser files are the two that were exposed.

**The write direction is clean today, by the narrower margin this ADR predicted.** Every test write
in the tier is in a `beforeAll` that runs before a page is opened, or sits between two awaited
fetches. Nothing writes between two browser actions.

⚠️ **One thing the audit measured that changes how the probe must be used.** The 150 ms sleep
reproduces this finding **only when it is narrowed to the path under test**. Put it on every
`decide()` call and the *reject* test's transaction stays open across its `page.close()` and into
the next test's page open — and that test then fails on an **empty queue**, because the single
connection is busy. That is the `Promise.all` trap wearing this one's clothes: a probe placed too
widely reproduces the wrong finding and looks like a regression in the fix.

## Revisit if

`@electric-sql/pglite-socket` grows real per-connection backends — 0.2.11 does not — or the e2e tier
moves to a container database. Either makes this rule unnecessary rather than wrong, and the
`Promise.all` and reload findings go with it.
