# Postgres is forced by two writing processes, not chosen

**The database is PostgreSQL.** This is recorded as a *constraint discovered* rather than a
preference exercised, because the lighter alternative was ruled out by its own documentation
before taste entered. Findings in [`../phase-4-verification.md`](../phase-4-verification.md) §6.

## SQLite and its descendants cannot host this architecture

ADR 0015 put *ingestion* in a separate always-on process that **reads and writes the database
directly**, and ADR 0019 made that process Python. So there are **two writers, in two languages,
potentially on two machines**.

- SQLite's own WAL documentation: *"All processes using a database must be on the same host
  computer; WAL does not work over a network filesystem"* — WAL requires shared memory. Its
  "When To Use" page names PostgreSQL explicitly for the client/server case.
- **Turso / libSQL embedded replicas are read replicas** — writes go to a single cloud primary.
  There is no multi-writer mode.

The two-writer shape was settled in Round 1 for reasons that had nothing to do with storage. It
turns out to have decided storage anyway. **Current major is PostgreSQL 18.6.**

## The shape of a note is still open, and this is the recommendation on the table

⚠️ **Not decided.** Recorded so the argument is not re-derived. A *subject*-declared *note* carries
per-field *provenance* (ADR 0003, ADR 0004), and Postgres §8.14.2 warns that a JSON document should
be *"an atomic datum … that cannot reasonably be further subdivided into smaller datums that could
be modified independently"* — which per-field provenance is, by definition.

The recommendation is to **split along that line**:

- **`notes.fields` as `jsonb`.** Values are read and written as a unit, and their shape is declared
  in the repo by ADR 0003 — so a blob keeps the one-declaration-three-consumers property, and
  ADR 0003's additive fields never require a migration.
- **`note_field_provenance` relational**, keyed `(note_id, field_name)`. Its shape is *fixed across
  every subject*, unlike the fields, and ADR 0004's flag mechanism must query it **across** notes —
  *"prompt v3 writes bad example sentences"* is a `GROUP BY prompt_version`, which a blob serves
  only through GIN indexes and path expressions.
- **Everything else relational with real columns**: *occurrences*, *level claims* (ADR 0005 says
  never collapsed), *cards* with the nine `ts-fsrs` fields and no `elapsed_days`, and the
  append-only review log.

**The honest counter, recorded because it is not weak:** the row-lock half of the Postgres warning
is a *concurrency* argument, and ADR 0012 guarantees one user, so there is no contention. Both-as-
blobs is defensible and is less schema. The surviving argument is the cross-note query, not the
lock. This closes in `04-database-schema.md`.

## The job table

`SELECT … FOR UPDATE SKIP LOCKED`, which Postgres documents for exactly this: *"can be used to
avoid lock contention with multiple consumers accessing a queue-like table."* Wakeup via
`LISTEN`/`NOTIFY` — subject to the connection constraint in ADR 0022, which is not optional.

## Client libraries

- **Drizzle, not Kysely.** Better Auth's *built-in* path is Kysely and `getMigrations` is documented
  as not working with the Drizzle adapter — but `lfca-lab/app` already runs Better Auth 1.7.2
  against Drizzle 0.45.2, so that cost is already paid and the workaround known
  (`auth generate --adapter drizzle`). Adopting Kysely here would mean two query builders across two
  live projects to save one CLI command. **Drizzle is also the only piece of the existing house
  stack that survives the Vue decision in ADR 0020.**
- **The Python worker uses a raw driver, no ORM.** The schema is defined once, in TypeScript.
  SQLAlchemy would put a second definition of the same tables in a second language, which is the
  drift ADR 0003 exists to design out.
- ⚠️ **Which** Python driver is open. `psycopg` 3.3.5 was recommended first; **Neon's SNI-tested
  driver list names `asyncpg` and `pg8000` and does not include psycopg.** Verify psycopg against
  Neon before committing, or take `asyncpg`.

## Revisit if

The worker and the app ever collapse back into one process — at which point SQLite becomes legal
again, though nothing else about this decision would recommend moving.
