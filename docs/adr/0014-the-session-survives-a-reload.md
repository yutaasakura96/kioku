# A session survives a reload; the snapshot and the outbox both persist to localStorage

**Reloading mid-*session* resumes where the reader left off.** The prefetched *session* snapshot and
the *grade* outbox are both written to `localStorage`, not held in memory.

PRD S8 requires that a *session* completed with the network off loses nothing. An in-memory outbox
satisfies that right up until the tab reloads or crashes, at which point it silently does not.
Surviving a tunnel but not a refresh is a poor way to fail the story that exists to prevent it.

## This closes a PRD gap, not just a storage question

S7 says a *session* is snapshotted at the start, and §5's edge case says the snapshot wins over a
concurrent edit. **Neither says what a mid-session reload does.** That gap is what decides the
storage: resuming means persisting the snapshot as well as the outbox; restarting means persisting
only the outbox.

## Why localStorage rather than IndexedDB

At a default *session* of 20 *cards*, the snapshot is on the order of 10KB and the outbox is a few
hundred bytes. IndexedDB's async-and-durable advantage buys nothing at that size and costs more
code. The standard objection to `localStorage` — synchronous writes on the main thread — is real in
general and negligible here, which matters because *Review*'s keystroke latency is a criterion.

## The line this does not cross

§2.2 rejected local-first specifically to avoid building sync infrastructure before the product.
**A per-session snapshot with a bounded lifetime is a cache, not a replica.** It holds one session,
it expires, it never merges, and it resolves no conflicts — ADR 0007's outbox already established
that the client never reconciles. If a future change makes this store unbounded or authoritative,
that is the moment §2.2 is genuinely being reopened.

## Alternatives considered

**Memory only, restart on reload** — the honest minimal reading of §2.2, rejected because it
discards a finished offline session to an accidental refresh.

**IndexedDB** — rejected as premature at this size. It is where this goes if session size ever
becomes unbounded.

## Revisit if

*Session* size stops being a fixed small number, or anything beyond the current session needs to
survive on the client.
