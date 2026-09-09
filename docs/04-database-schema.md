# Kioku — database schema

**Date:** 2026-09-06
**Status:** Phase 4. Closes the note's storage shape (ADR 0029) and the owner foreign key's target.
This is the schema as documentation, and it stays the authority on *what the rows are*.

⚠️ **Amended 2026-09-09.** This line used to say "it is not a migration and there is no code in the
repo yet". **Both halves are now spent**: #4 built the schema, and it lives in `server/db/schema/`
with its migrations in `server/db/migrations/`. Drizzle owns every one of them and the worker issues
no DDL (`03` §4.2). **What changed is the direction of authority, not the content** — where this
document and the code disagree, this document is the argument and the code is the bug, except where a
section carries a dated amendment saying otherwise. §11's twenty-one indexes, §9's delete rules and
§14's one trigger are each asserted by `test/schema/schema.test.ts`.

Vocabulary is [`../CONTEXT.md`](../CONTEXT.md). Requirements are
[`02-product-requirements.md`](02-product-requirements.md), cited `S1`–`S12`. Mechanisms are
[`03-technical-design.md`](03-technical-design.md), cited by section. Verified facts are
[`phase-4-verification.md`](phase-4-verification.md), cited by section — **do not re-verify it.**

---

## 0. What this document decides, and what it does not

**Decides:**

- **The note's storage shape** — the one thing deliberately left open through two rounds of grilling.
  [ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md).
- **What the owner foreign key points at**, which ADR 0017 handed here explicitly (§3).
- Every table, column, type, nullability, default and primary key.
- **A delete behaviour for every foreign key**, chosen deliberately, because review history is the
  one thing in this system that cannot be regenerated (`§2.4`, ADR 0011).
- Every index, each justified by the query that needs it — and the ones deliberately absent.

**Does not decide:**

- **Migration order, or any migration at all.** Drizzle owns them; Phase 6 writes them.
- **The subject declaration's contents.** That is repo JSON under `subjects/` and belongs to neither
  toolchain (`03` §6). This schema references it by key and validates against it at the application
  boundary.
- **Query implementations.** §12 states the queries the shape exists to serve, not their SQL.

---

## 1. Conventions, stated once

| | |
| --- | --- |
| **Postgres** | 18 on Neon, one branch per environment (ADR 0022). `jsonb` never `json` — only `jsonb` is indexable and `json` is reparsed on every execution (verification §6.2) |
| **Case** | `snake_case` for tables and columns. **Singular table names**, matching the four Better Auth already owns |
| **Primary keys** | `id uuid primary key default uuidv7()`. Postgres 18 ships `uuidv7()` as a built-in — time-ordered, so inserts stay at the right-hand edge of the index instead of scattering (verification §10.1) |
| **Foreign keys** | `<referenced_table>_id`. **Every one carries an explicit `ON DELETE`** — §9 |
| **Timestamps** | `timestamptz`, always. Never `timestamp`. A laptop crosses timezones (`03` §8.2) |
| **Booleans** | Avoided where the real question is *when*. `claimed_at`, `suspended_at`, `deleted_at` and `superseded_at` are nullable timestamps, not flags with a date beside them |
| **Enumerations** | `text` with a `CHECK` constraint, not a Postgres `enum` type. Every value set here is owned by an ADR or by the subject declaration; a `CHECK` is a one-line migration and shows up in `\d` |
| **Money** | `bigint` of micro-USD. Never a float, never `money` |
| **Text** | `text`, never `varchar(n)`. Length limits that matter are `CHECK`s with a reason |
| **Character offsets** | **Characters, not bytes.** Japanese makes the distinction load-bearing and a byte offset would be wrong the first time it was used |
| **Floats** | `double precision` for `stability` and `difficulty` only, because `ts-fsrs` computes them as JavaScript numbers and a round trip through `numeric` would not return the value the scheduler produced |
| **Schemas** | Better Auth's four tables live in a `auth` Postgres schema; everything else in `public`. §8 |

**Two nouns are not tables and never become tables:** the *note type* with its *templates*, and the
list of *authorities* with their precedence order. Both are the subject declaration, which lives in
the repo as JSON (ADR 0003, ADR 0005, `03` §6). The database references them by key. §13.

---

## 2. The note's storage shape — decided

**`note.fields` is one `jsonb` document. `note_field_provenance` is relational, keyed
`(note_id, field_name)`.** Full argument in
[ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md); the short form:

PostgreSQL §8.14.2 says a JSON document should be an atomic datum that cannot reasonably be
subdivided into smaller datums modified independently, and should have a somewhat fixed structure.
**Fields pass both tests** — the note is the unit of vetting (ADR 0004), it is written whole on the
accept keystroke, and after acceptance it is frozen (ADR 0006). **Provenance fails both** — its
structure is identical across every subject while the fields it describes are not, and its entries
are written independently by different pipeline stages.

The row-lock half of the warning is a concurrency argument and ADR 0012 guarantees one reader, so it
is not what decided this. What decided it is that **ADR 0018 made the model choice a measurement**,
and that measurement is *acceptance rate grouped by model id, per field* — an aggregation across
notes. A GIN index serves containment, not `GROUP BY`. Storing provenance as a blob would leave the
project's own instrument answering only by sequential scan.

**The cost is one derived column**: `note.identity_key`, because ADR 0006's key lives inside the
blob and a unique constraint cannot be an expression index over a subject-declared path. §5.3.

---

## 3. The owner, and what it points at

ADR 0012: **personal entities carry an owner from the first row written.** ADR 0017 left open whether
that owner references Better Auth's `user.id` directly or an app-level table, and named `04` as the
place to decide.

**Decision: directly at `auth."user".id`, typed `text`, with `ON DELETE RESTRICT`.**

`user.id` is `text`, not `uuid` — Better Auth's Drizzle generator emits `text("id").primaryKey()`
and mints string ids itself (verification §10.2). So the owner column is `text` while every other key
in this schema is `uuid`. That mixed pair is the visible seam of a table this project does not own,
and it is cheaper to look at than to hide.

An app-level `reader` table was considered and rejected: at one row it is an indirection whose only
job is to be indirect, it puts a join on every personal query, and the rename it protects against is
a Drizzle migration either way — **nothing but our own migration ever touches that table**, because
Better Auth's `getMigrations` does not work with the Drizzle adapter and its schema is generated once
and then lands in Drizzle's flow (verification §2.3, `03` §4.2).

⚠️ **`ON DELETE RESTRICT` is the part that matters, and it is a correction, not a default.** Better
Auth's generated schema wires **every** child of `user` with `onDelete: "cascade"` — `session`,
`account` and each plugin table (verification §10.2). Following that convention for *personal*
entities would make deleting one row destroy every *scheduling epoch* and every *review log* under
it: §13.6 of `03` names destroying review history as the worst thing an attacker could do, arriving
by way of a copied ORM default. `RESTRICT` means the `user` row cannot be deleted while any history
references it. That is the second of ADR 0011's two independent guards; the first is that the app has
no delete-account path at all.

**Better Auth keeps its own cascades.** Sessions and accounts *should* disappear with a user; they
are regenerable by signing in again. The rule is not "no cascades" — it is that a cascade must never
reach a table that cannot be rebuilt.

---

## 4. Every entity, labelled

ADR 0012: the label is **product specification, not schema decoration.** *Shared* is true regardless
of who is asking. *Personal* is a statement about one reader.

| Table | Label | Owner column | Why |
| --- | --- | --- | --- |
| `source` | shared | — | The material. Expensive to obtain, true for anyone |
| `source_chunk` | shared | — | A deterministic division of shared content |
| `ingestion` | shared | — | A statement about the *source* and what processing it cost |
| `ingestion_chunk` | shared | — | Per-chunk progress of a shared run |
| `generation_cache` | shared | — | A model's output for a given input. The reader is not in the key |
| `job` | shared | — | Operational. What the worker must do |
| `note` | shared | — | Fields are about the word (ADR 0012) |
| `note_field_provenance` | shared | — | Where a field's value came from, not who liked it |
| `occurrence` | shared | — | This term appeared here, at this position |
| `level_claim` | shared | — | An *authority*'s assertion, or the model's estimate |
| `note_vetting` | **personal** | `owner_id` | ⚠️ *Rejected* is a claim about the reader, not about the word (ADR 0012) |
| `vetting_session` | **personal** | `owner_id` | The run at the keyboard, and the boundary that makes a rejection permanent |
| `card` | **personal** | `owner_id` | A card exists because someone accepted a note |
| `scheduling_epoch` | **personal** | `owner_id` | Models *your* memory of a fact (ADR 0009) |
| `review_log` | **personal** | `owner_id` | The irreplaceable thing |
| `review_session` | **personal** | `owner_id` | One reader's bounded run |
| `review_session_card` | **personal** | `owner_id` | The snapshot's membership |
| `card_flag` | **personal** | `owner_id` | A judgement that a card is wrong |

⚠️ **A column that references a user does not make an entity personal.** `ingestion.submitted_by` and
`job.requested_by` exist for the audit line and are nullable; the label asks what the row *asserts*,
and both assert something about the material. This distinction is the thing to hold on to if a second
reader is ever invited — at which point the label stops being a label and starts being enforced
(ADR 0012's revisit condition).

---

## 5. The corpus — shared

### 5.1 `source`

The ingested material, retained after ingestion because incremental reading requires it (ADR 0008).

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `subject_id` | `text` | no | — | Key into `subjects/`. Not a foreign key — §13 |
| `title` | `text` | no | — | Reader-supplied or first line |
| `content` | `text` | no | — | The material itself. ⚠️ Never logged (`03` §13.4) |
| `content_hash` | `text` | no | — | SHA-256 hex of NFC-normalised `content` |
| `char_count` | `integer` | no | — | `CHECK (char_count > 0 AND char_count <= 100000)` — `S2`'s cap as a constraint, refused before any spend |
| `submitted_at` | `timestamptz` | no | `now()` | The left-hand end of *time-to-first-review* |
| `deleted_at` | `timestamptz` | **yes** | `null` | Soft delete. Non-null suspends its cards — §9, `S11` |
| `created_at` | `timestamptz` | no | `now()` | |

**Example:** `(019bd3…, 'jlpt-vocab', '朝日新聞 2026-09-01 社説', '日本の図書館は…', 'a3f9…', 4820, 2026-09-06T09:12Z, null, …)`

`content_hash` is indexed but **not unique**: PRD §5 says resubmitting identical content creates a
new *source* and offers to open the existing one. Detection, not prevention.

### 5.2 `source_chunk`

The deterministic division of a source's content. Chunk boundaries are a function of content, so they
are shared and stable across re-ingestions; **progress against them is not, and lives in
`ingestion_chunk`** (§6.2).

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `source_id` | `uuid` | no | — | → `source` |
| `ordinal` | `integer` | no | — | 0-based. `UNIQUE (source_id, ordinal)` |
| `char_start` | `integer` | no | — | Characters, not bytes |
| `char_end` | `integer` | no | — | `CHECK (char_end > char_start)` |
| `content_hash` | `text` | no | — | **The first element of the cache key** (§6.3) |
| `created_at` | `timestamptz` | no | `now()` | |

**Example:** `(019bd3…, source 019bd3…, 0, 0, 1200, '7c11…', …)`

### 5.3 `note`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `subject_id` | `text` | no | — | Key into `subjects/` |
| `identity_key` | `text` | no | — | ADR 0006's key, rendered canonically. §2 and below |
| `fields` | `jsonb` | no | — | ADR 0029. Shape declared per subject; **validated at the application boundary**, not by Drizzle (verification §6.4) |
| `origin_ingestion_id` | `uuid` | **yes** | — | The run that paid to generate it. Nullable so a hard-deleted source does not take the note with it — §9 |
| `created_at` | `timestamptz` | no | `now()` | |

**`UNIQUE (subject_id, identity_key)`.** This is ADR 0006's deduplication expressed as a constraint:
a collision cannot create a second note, it appends an *occurrence*.

**The rendering rule is part of the identity.** Values NFC-normalised, joined by `U+001F`, in the
order the subject declaration lists them. For JLPT vocabulary that is *(dictionary-form term,
reading)*, so `開く␟ひらく` and `開く␟あく` are two notes — which is the pair ADR 0006 exists to keep
apart. ⚠️ **Changing the rendering rule changes the identity of existing notes**, and is the same
class of event as a `SudachiDict` bump: a reviewed data event with a re-ingestion plan, never a
refactor (`03` §5.3).

⚠️ **Numerals never reach this column.** `is_oov=True` rewrites `normalized_form` to ASCII — 六
becomes `6` — so numerals are excluded at candidate extraction, before the key is built (`03` §5.2).

**Example:**

```
id             019bd3…
subject_id     'jlpt-vocab'
identity_key   '図書館␟としょかん'
fields         {"term":"図書館","reading":"としょかん","part_of_speech":"名詞",
                "meaning":"library","example_sentence":"駅の近くに図書館があります。"}
```

`fields` carries **no index**. No v1 query reads inside it: the card browser is cut (`PRD §6`) and
there is no field search. §11.

### 5.4 `note_field_provenance`

ADR 0004: trust is a property of where a value came from, recorded per field. ADR 0029 makes this
relational, and this is the table its argument is about.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `note_id` | `uuid` | no | — | → `note`. PK with `field_name` |
| `field_name` | `text` | no | — | A key present in `note.fields` |
| `kind` | `text` | no | — | `CHECK (kind IN ('lookup','judgement','generated','human'))` |
| `model_id` | `text` | **yes** | — | Null for `lookup` and `human` |
| `prompt_version` | `text` | **yes** | — | Null for `lookup` and `human` |
| `dictionary_version` | `text` | **yes** | — | `SudachiDict-core` release, e.g. `20260723`. Null where the tokeniser was not involved |
| `is_oov` | `boolean` | **yes** | — | The raw signal `kind` was derived from, kept because `03` §5.2 reads it for two different reasons |
| `created_at` | `timestamptz` | no | `now()` | |

**PK `(note_id, field_name)`.** No surrogate id: the pair is the identity, and a surrogate would
permit two provenance rows for one field, which is not a state that means anything.

**`kind` is the honesty bit.** `lookup` renders quietly, `judgement` and `generated` are foregrounded
— that is `S4`, and it is why *Vet* is a decision rather than a transcription check.

**Example:** two rows for the note above —
`(019bd3…, 'reading', 'lookup', null, null, '20260723', false, …)` and
`(019bd3…, 'example_sentence', 'generated', 'claude-sonnet-5', 'v3', null, null, …)`.

### 5.5 `occurrence`

ADR 0006: a collision appends an occurrence and **never alters the note's fields.**

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `note_id` | `uuid` | no | — | → `note` |
| `source_id` | `uuid` | no | — | → `source` |
| `source_chunk_id` | `uuid` | no | — | → `source_chunk` |
| `char_start` | `integer` | no | — | Position **within the source**, in characters |
| `char_end` | `integer` | no | — | `CHECK (char_end > char_start)` |
| `surface_form` | `text` | no | — | As it appeared. C split mode keeps 図書館 whole (`03` §5.1) |
| `ingestion_id` | `uuid` | **yes** | — | → `ingestion`. Which run found it |
| `created_at` | `timestamptz` | no | `now()` | |

**`UNIQUE (note_id, source_id, char_start)`** — re-running a source appends nothing it already has.
This is what makes re-ingestion idempotent in the one place idempotence is cheap.

**Example:** `(019bd3…, note 019bd3…, source 019bd3…, chunk 0, 412, 415, '図書館', …)`

**Append-only.** There is no `UPDATE` path. A correction is a new occurrence.

### 5.6 `level_claim`

ADR 0005: a *level* is a set of attributed claims and **the set is never collapsed.**

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `note_id` | `uuid` | no | — | → `note` |
| `authority_key` | `text` | **yes** | — | Key into the subject declaration's authority list. **Null means the model estimated it** |
| `level` | `text` | no | — | Subject-defined band, e.g. `N3` |
| `model_id` | `text` | **yes** | — | Set when `authority_key` is null |
| `prompt_version` | `text` | **yes** | — | Set when `authority_key` is null |
| `created_at` | `timestamptz` | no | `now()` | |

**`authority_key IS NULL` is the one bit of difference `S4` requires** — a named authority versus a
model estimate, distinguishable without a caveat paragraph, and it is what the *provenance marker*
draws (`CONTEXT.md`). `CHECK ((authority_key IS NULL) = (model_id IS NOT NULL))` keeps the two
halves from drifting.

**`UNIQUE (note_id, authority_key)` with nulls not distinct** — one claim per authority, and exactly
one model estimate. Postgres 15 and later spell this `UNIQUE NULLS NOT DISTINCT`.

**Example:** two rows, kept apart on purpose —
`(…, note 019bd3…, 'jlpt-tango-n3', 'N3', null, null)` and
`(…, note 019bd3…, null, 'N4', 'claude-sonnet-5', 'v3')`. PRD §5 requires both to be kept and shown;
precedence decides the display value and lives in the declaration, not here.

---

## 6. Ingestion and the worker — shared

### 6.1 `ingestion`

One run turning one source into pending notes, and **the spend ledger `S10` reports from.**

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `source_id` | `uuid` | **yes** | — | → `source`. Nullable so hard deletion does not erase the cost record — §9 |
| `source_title` | `text` | no | — | Snapshot at submit. The ledger stays readable after a hard delete |
| `subject_id` | `text` | no | — | |
| `status` | `text` | no | `'queued'` | `CHECK (status IN ('queued','running','complete','incomplete','failed'))`. **`incomplete` is `S2`'s resumable state**, not an error |
| `submitted_at` | `timestamptz` | no | `now()` | |
| `started_at` | `timestamptz` | yes | — | |
| `completed_at` | `timestamptz` | yes | — | |
| `submitted_by` | `text` | **yes** | — | → `auth."user".id`, `ON DELETE SET NULL`. Audit line, not an owner — §4 |
| `model_id` | `text` | yes | — | |
| `prompt_version` | `text` | yes | — | |
| `dictionary_version` | `text` | yes | — | |
| `input_tokens` | `integer` | yes | — | **From the API response** (`03` §7), never estimated |
| `output_tokens` | `integer` | yes | — | |
| `cost_micro_usd` | `bigint` | yes | — | |
| `price_table_effective_date` | `date` | yes | — | The price table is configuration with an effective date, not a constant (`03` §7). Without this the ledger starts lying silently |
| `candidates_extracted` | `integer` | yes | — | PRD §5: zero-new-notes reports how many were filtered… |
| `candidates_deduplicated` | `integer` | yes | — | …and **by which filter** |
| `candidates_already_known` | `integer` | yes | — | |
| `candidates_rejected` | `integer` | yes | — | |
| `worker_environment` | `text` | no | `'laptop'` | `CHECK (worker_environment IN ('laptop','server'))`. ⚠️ `03` §12: early *time-to-first-review* figures are not comparable across ADR 0022's move, **recorded on the number rather than only in a paragraph** |

**Example:** `(…, source 019bd3…, '朝日新聞 2026-09-01 社説', 'jlpt-vocab', 'complete', 09:12Z, 09:12Z, 09:15Z, 'usr_7f…', 'claude-sonnet-5', 'v3', '20260723', 18400, 6200, 41300, 2026-08-01, 214, 106, 71, 9, 'laptop')`

### 6.2 `ingestion_chunk`

**Per-chunk progress, durable, so a resume is a query rather than a judgement call** (`S2`'s failure
case, ADR 0015, `03` §5.4).

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `ingestion_id` | `uuid` | no | — | → `ingestion`. PK with `source_chunk_id` |
| `source_chunk_id` | `uuid` | no | — | → `source_chunk` |
| `status` | `text` | no | `'pending'` | `CHECK (status IN ('pending','running','complete','failed'))` |
| `attempts` | `integer` | no | `0` | |
| `last_error` | `text` | yes | — | ⚠️ Never contains source text (`03` §13.4) |
| `started_at` | `timestamptz` | yes | — | |
| `completed_at` | `timestamptz` | yes | — | |

**Resume is `WHERE ingestion_id = $1 AND status <> 'complete'`.** That is the whole mechanism, and it
is why there is no queue service: once this record exists, it *is* the queue (ADR 0015).

**Example:** `(ingestion 019bd3…, chunk 0, 'complete', 1, null, 09:12Z, 09:13Z)` beside
`(ingestion 019bd3…, chunk 3, 'failed', 3, 'provider 429 after 3 attempts', 09:14Z, null)` — the
second is what a resume picks up, and the first is the money already spent that a discard would throw
away.

### 6.3 `generation_cache`

ADR 0010's replayable cache, with the dictionary version added by `03` §5.3.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `content_hash` | `text` | no | — | PK part 1 — the *chunk*'s hash |
| `dictionary_version` | `text` | no | — | PK part 2 — **added in `03` §5.3** |
| `prompt_version` | `text` | no | — | PK part 3 |
| `model_id` | `text` | no | — | PK part 4 |
| `response` | `jsonb` | no | — | The structured output as returned |
| `input_tokens` | `integer` | no | — | |
| `output_tokens` | `integer` | no | — | |
| `created_at` | `timestamptz` | no | `now()` | |

**The primary key is the four-tuple**, written out rather than hashed into one column, so the key is
legible in `\d` and a future session cannot mistake which four things it is. A composite PK is also
the lookup index, so no second index exists.

⚠️ **Why the dictionary version is in the key:** a SudachiDict upgrade changes tokenisation, which
changes candidate extraction, which changes `normalized_form` — **which is half of ADR 0006's
identity key.** Without this column a dictionary bump silently serves cached results computed against
a different tokenisation of the same text.

**Example:** `('7c11…', '20260723', 'v3', 'claude-sonnet-5', {"notes":[…]}, 1840, 620, …)`

**This is the only table in the schema that is safe to truncate.** Doing so costs money on the next
re-ingestion and nothing else. §10.

### 6.4 `job`

ADR 0028: **the job table is the truth and `NOTIFY` only shortens latency.**

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `kind` | `text` | no | — | `CHECK (kind IN ('ingest','resume'))` |
| `ingestion_id` | `uuid` | no | — | → `ingestion` |
| `state` | `text` | no | `'queued'` | `CHECK (state IN ('queued','claimed','done','failed'))` |
| `available_at` | `timestamptz` | no | `now()` | Backoff. A retry sets it forward rather than sleeping in the worker |
| `claimed_by` | `text` | yes | — | Worker instance id — hostname plus process start time |
| `claimed_at` | `timestamptz` | yes | — | |
| `heartbeat_at` | `timestamptz` | yes | — | **The column that survives the laptop closing** |
| `attempts` | `integer` | no | `0` | |
| `last_error` | `text` | yes | — | |
| `requested_by` | `text` | **yes** | — | → `auth."user".id`, `ON DELETE SET NULL`. Audit line, not an owner |
| `created_at` | `timestamptz` | no | `now()` | |
| `finished_at` | `timestamptz` | yes | — | |

**A claim is a row state with an owner and a timestamp, not a held lock** — `03` §3.2 requires
exactly this, because a lock held for the life of a job dies with the connection and tells nobody.
The sequence:

1. `SELECT id FROM job WHERE state = 'queued' AND available_at <= now() ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1`
   — Postgres documents `SKIP LOCKED` for precisely this and warns it is unsuitable for anything else
   (verification §6.3). At one worker it buys nothing today and costs nothing; ADR 0015's revisit
   condition is a second worker, which is when it starts mattering.
2. In the same transaction, `UPDATE` to `state='claimed'` with `claimed_by`, `claimed_at` and
   `heartbeat_at`. **The row lock is held for the length of that update, not the length of the job.**
3. The worker refreshes `heartbeat_at` every 30 seconds while working.
4. **A job in `claimed` whose `heartbeat_at` is older than 5 minutes is reclaimable** and is returned
   to `queued` by the next worker to look. This is what "the laptop closed mid-job" resolves to: the
   claim is still visible, it is visibly stale, and a timed rule releases it.

⚠️ **The stale-claim sweep runs in the worker, not on a schedule elsewhere.** ADR 0022 forbids
depending on a Vercel-only feature, and Vercel Cron is named in that list. The sweep is a query the
worker runs at the top of its poll — which it is already doing on every connect and reconnect
(`03` §3.1), so it costs nothing extra.

**Example:** `(019bd3…, 'ingest', ingestion 019bd3…, 'claimed', 09:12Z, 'yutas-mbp:1725… ', 09:12Z, 09:14Z, 1, null, 'usr_7f…', …, null)`

---

## 7. Vetting, cards and history — personal

### 7.1 `vetting_session`

The contiguous run at the keyboard. It exists because `CONTEXT.md` makes a *rejection* **reversible
only within the session that declined it, and permanent afterwards** — a rule that needs a durable
boundary rather than a belief held by the browser tab.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `owner_id` | `text` | no | — | → `auth."user".id`, `RESTRICT` |
| `started_at` | `timestamptz` | no | `now()` | |
| `ended_at` | `timestamptz` | yes | — | Set on `Esc` or the **Done** control (ADR 0026), and by a 30-minute idle sweep |

**Example:** `(019bd3…, 'usr_7f…', 2026-09-06T09:58Z, 2026-09-06T10:31Z)` — thirty-three minutes,
and every rejection inside it became permanent at `10:31`.

**Ending the session is what makes a rejection permanent.** The mode's one visible exit (ADR 0026)
turns out to be a data boundary as well as an interaction one.

⚠️ **This is not a *session* in `CONTEXT.md`'s sense.** That word is reserved for the bounded run of
due cards. Vetting is a queue, not a session — PRD §5 — and every note still commits on its keystroke.
This row records *when the keyboard run was*, and nothing about it is prefetched, snapshotted or
finishable.

### 7.2 `note_vetting`

The *pending* / *accepted* / *rejected* state, personal because ADR 0012 says a rejection is a claim
about the reader.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `note_id` | `uuid` | no | — | → `note`. PK with `owner_id` |
| `owner_id` | `text` | no | — | → `auth."user".id`, `RESTRICT` |
| `state` | `text` | no | `'pending'` | `CHECK (state IN ('pending','accepted','rejected'))`. **There is no provisional state** (ADR 0004) |
| `edited` | `boolean` | no | `false` | `S6`: an edited note counts against *acceptance rate* as an edit, not as an acceptance |
| `seconds_to_vet` | `numeric(6,2)` | yes | — | **`S3`'s measured criterion**, stamped per note from day one (`03` §12) |
| `vetting_session_id` | `uuid` | yes | — | → `vetting_session`. Which run decided it |
| `vetted_at` | `timestamptz` | yes | — | |
| `flagged_at` | `timestamptz` | yes | — | Set by `S9`: an accepted note returned to the queue flagged |
| `created_at` | `timestamptz` | no | `now()` | |

**A rejection is reversible while `vetting_session.ended_at IS NULL` for its
`vetting_session_id`, and permanent afterwards.** That is CONTEXT's rule as a query.

**`state = 'rejected'` is also the filter.** Stage 5 of the pipeline joins `note.identity_key` for
this owner and drops anything already rejected — which is `S5`, and why the fiftieth source asks
about fewer notes than the fifth. **There is no separate `rejected_term` table**, and adding one
would be a second copy of a fact this row already carries. §13.

**Example:** `(note 019bd3…, 'usr_7f…', 'accepted', false, 3.41, session 019bd3…, 2026-09-06T10:02Z, null, …)`

### 7.3 `card`

ADR 0002: one note rendered through one template, and **it owns its own scheduling state** — which
lives in §7.4, for the reason given there.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `note_id` | `uuid` | no | — | → `note`, `RESTRICT` |
| `owner_id` | `text` | no | — | → `auth."user".id`, `RESTRICT` |
| `template_key` | `text` | no | — | Key into the subject declaration. **Not a foreign key** — §13 |
| `suspended_at` | `timestamptz` | yes | — | *Suspended*: withdrawn from scheduling, **history untouched** |
| `suspended_reason` | `text` | yes | — | `CHECK (suspended_reason IN ('flagged','source_deleted'))` — `S9` and `S11` are the only two |
| `created_at` | `timestamptz` | no | `now()` | Minted at acceptance, never before |

**`UNIQUE (owner_id, note_id, template_key)`** — one card per note per template per reader. v1 ships
exactly one template, so this constraint is doing nothing today and is the thing that stops a second
template from silently minting duplicates when it arrives (ADR 0002).

**A card is never deleted.** `S9` and `S11` both suspend. §9.

**Example:** `(019bd3…, note 019bd3…, 'usr_7f…', 'recognition', null, null, 2026-09-06T10:02Z)`

### 7.4 `scheduling_epoch`

**The FSRS state lives here, not on `card`, and that is the decision this table exists to make.**

A *scheduling epoch* is one continuous scheduling life of a card; a reset begins a new one and
**the prior one is retained and exportable** (ADR 0011, `S12`). If the scheduler's state lived on
`card`, a reset would be an `UPDATE` over the history it is supposed to preserve, and the only thing
standing between six months of review data and an overwrite would be remembering to copy it first.
Putting the state on the epoch makes a reset an `INSERT`. The irreplaceable thing is never in the
path of an update.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `card_id` | `uuid` | no | — | → `card`, `RESTRICT` |
| `owner_id` | `text` | no | — | → `auth."user".id`, `RESTRICT` |
| `ordinal` | `integer` | no | — | 1-based. `UNIQUE (card_id, ordinal)` |
| `started_at` | `timestamptz` | no | `now()` | |
| `superseded_at` | `timestamptz` | yes | — | Non-null means a later epoch replaced it |
| `superseded_reason` | `text` | yes | — | `CHECK (superseded_reason IN ('memory_bearing_field_changed','manual_reset'))` |
| `due` | `timestamptz` | no | — | `ts-fsrs` `Card.due` |
| `stability` | `double precision` | no | — | |
| `difficulty` | `double precision` | no | — | |
| `scheduled_days` | `integer` | no | — | |
| `learning_steps` | `integer` | no | `0` | ⚠️ **Required, not optional** (verification §1.2) |
| `reps` | `integer` | no | `0` | |
| `lapses` | `integer` | no | `0` | |
| `state` | `smallint` | no | `0` | `CHECK (state BETWEEN 0 AND 3)` — New 0, Learning 1, Review 2, Relearning 3 |
| `last_review` | `timestamptz` | yes | — | Null on a fresh epoch |

⚠️ **There is no `elapsed_days` column and none may be added.** It is deprecated and removed in
`ts-fsrs` 6.0.0, and it is derivable from `last_review` (verification §1.2). This is why the 5.4.2 →
6.0.0 major is a data review rather than a migration (`03` §13.5).

**`UNIQUE (card_id) WHERE superseded_at IS NULL`** — a partial unique index enforcing exactly one
live epoch per card. Without it "the current epoch" is a convention; with it, it is a constraint.

**Example — a reset, as two rows:**

```
ordinal 1  started 2026-03-01  superseded 2026-09-06  'memory_bearing_field_changed'
           due 2026-11-02  stability 61.4  difficulty 5.2  reps 7  lapses 1  state 2
ordinal 2  started 2026-09-06  superseded null
           due 2026-09-06  stability 0.4   difficulty 5.2  reps 0  lapses 0  state 0
```

The first row is what `S12` means by "every scheduling epoch including superseded ones", and it is
the row a system that stored state on the card would no longer have.

### 7.5 `review_log`

**The one thing in the system that cannot be regenerated** (`§2.4`, ADR 0011, `03` §13.6). Stored
from day one because it is what an optimiser consumes later and it cannot be reconstructed
(verification §1.2).

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `card_id` | `uuid` | no | — | → `card`, `RESTRICT` |
| `scheduling_epoch_id` | `uuid` | no | — | → `scheduling_epoch`, `RESTRICT` |
| `owner_id` | `text` | no | — | → `auth."user".id`, `RESTRICT` |
| `review_session_id` | `uuid` | yes | — | → `review_session`, `SET NULL` |
| `rating` | `smallint` | no | — | `CHECK (rating BETWEEN 1 AND 4)`. **`Manual = 0` is excluded**, matching `ts-fsrs`'s own `Grade` type (verification §1.1) |
| `state` | `smallint` | no | — | The state *before* the grade |
| `due` | `timestamptz` | no | — | |
| `stability` | `double precision` | no | — | |
| `difficulty` | `double precision` | no | — | |
| `scheduled_days` | `integer` | no | — | |
| `learning_steps` | `integer` | no | — | |
| `reviewed_at` | `timestamptz` | no | — | **`ts-fsrs`'s `review` — the client's stamp, the moment the grade was given** |
| `received_at` | `timestamptz` | no | `now()` | The server's clock, at replay |
| `clock_skew_seconds` | `integer` | yes | — | `received_at - reviewed_at` at replay. Diagnostic for the rejection rule below |

**Two timestamps, and they are not redundant.** ADR 0007: the scheduler must see the moment the grade
was given, or a card answered underground at 09:00 and flushed at 18:00 tells FSRS that recall took
nine hours. But `03` §12 requires *time-to-first-review* to be measured with the submit instant and
the first grade instant **on the same clock** — and a client stamp is not on the server's clock.
So **`reviewed_at` feeds the scheduler and `received_at` feeds the metric**, and neither column can
do the other's job.

**Replay rejects a grade** stamped beyond a small skew allowance in the future, or stamped before its
own session's snapshot was taken (`03` §8.2). A rejected grade is surfaced to the reader rather than
dropped — it is one of the few things the reader can actually fix. `review_session.snapshot_taken_at`
is what the second half compares against, which is why §7.6 stores it server-side.

⚠️ **No `elapsed_days` and no `last_elapsed_days`**, both deprecated (verification §1.2). Elapsed days
for a review is the gap to the previous `review_log` row in the same epoch, ordered by `reviewed_at`.

**Append-only, enforced twice.** The application never issues `UPDATE` or `DELETE` against it, and a
`BEFORE UPDATE OR DELETE` trigger raises. **This is the only trigger in the schema**, and it is here
rather than anywhere else because ADR 0011's pattern — pin the irreplaceable data and guard it in
more than one place — names exactly one thing as irreplaceable. It ships as a raw SQL migration under
Drizzle, which is still one migration owner (`03` §4.2).

**Example:** `(…, card 019bd3…, epoch 2, 'usr_7f…', session 019bd3…, 3, 2, 2026-09-06T…, 61.4, 5.2, 63, 0, reviewed_at 2026-09-06T08:41:12Z, received_at 2026-09-06T09:03:55Z, 1363)` — a grade given underground and replayed twenty-two minutes later, which is `S8` working.

### 7.6 `review_session`

`S7`: a bounded, finishable run, snapshotted at the start.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `owner_id` | `text` | no | — | → `auth."user".id`, `RESTRICT` |
| `size` | `integer` | no | `20` | `CHECK (size > 0 AND size <= 200)`. The one knob (ADR 0016) |
| `snapshot_taken_at` | `timestamptz` | no | `now()` | **Server-side, because `03` §8.2's replay rule compares against it** |
| `started_at` | `timestamptz` | no | `now()` | |
| `completed_at` | `timestamptz` | yes | — | Null means abandoned; the end screen's numbers only exist for a completed run |

**Example:** `(019bd3…, 'usr_7f…', 20, snapshot 2026-09-06T08:30:02Z, started 08:30:02Z, completed 08:41:47Z)`
— and `snapshot_taken_at` is what rejects a replayed grade stamped before `08:30:02`.

### 7.7 `review_session_card`

The snapshot's membership, and the *progress rail*'s length.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `review_session_id` | `uuid` | no | — | → `review_session`, `CASCADE`. PK with `ordinal` |
| `ordinal` | `integer` | no | — | 0-based position in the rail |
| `card_id` | `uuid` | no | — | → `card`, `RESTRICT` |
| `owner_id` | `text` | no | — | → `auth."user".id`, `RESTRICT` |

**`UNIQUE (review_session_id, card_id)`** alongside the PK — a card appears once. That constraint is
ADR 0016's *no same-day relearning* expressed in the schema: with `enable_short_term` off, a graded
card leaves the session, so twenty cards is twenty answers and the rail knows its own length.

**Example:** `(session 019bd3…, 0, card 019bd3…, 'usr_7f…')` through `(session 019bd3…, 19, …)` —
twenty rows, which is the *progress rail*'s twenty ticks.

**This is what "the snapshot wins" means** (PRD §5). A note edited mid-session does not change what
this table already lists.

### 7.8 `card_flag`

`S9`: one action during review that suspends the card, returns the note to the queue flagged, and
records the flag **against the note's source and prompt version.**

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `uuidv7()` | PK |
| `card_id` | `uuid` | no | — | → `card`, `RESTRICT` |
| `note_id` | `uuid` | no | — | → `note`, `RESTRICT` |
| `owner_id` | `text` | no | — | → `auth."user".id`, `RESTRICT` |
| `source_id` | `uuid` | **yes** | — | → `source`, `SET NULL`. Nullable so a hard delete does not erase the signal |
| `prompt_version` | `text` | yes | — | **Denormalised on purpose** — resolved at flag time |
| `model_id` | `text` | yes | — | Denormalised, same reason |
| `review_session_id` | `uuid` | yes | — | → `review_session`, `SET NULL` |
| `flagged_at` | `timestamptz` | no | `now()` | |
| `resolved_at` | `timestamptz` | yes | — | Set when the note is re-vetted |

**Example:** `(019bd3…, card 019bd3…, note 019bd3…, 'usr_7f…', source 019bd3…, 'v3', 'claude-sonnet-5', session 019bd3…, 2026-09-06T08:36Z, null)` — an example sentence that survived vetting and was caught a month later, which is `S9` working.

⚠️ **`prompt_version` and `model_id` are copied here rather than joined.** ADR 0004 says the third
part is the one that matters: without it you learn "some cards are bad" instead of "prompt v3 writes
bad example sentences", and only the second is actionable. A join through `note_field_provenance`
would answer the same question **until a note is re-generated**, at which point the provenance
describes the new version and the flag would silently start blaming the wrong prompt. Denormalising
is what makes the fact survive the thing it is a fact about.

**`false-accept rate` is `count(card_flag) / count(note_vetting WHERE state='accepted')`.** No metrics
table exists; §13.

---

## 8. The four tables Better Auth owns

**`user`, `session`, `account`, `verification`**, in a `auth` Postgres schema.

They are generated by the Better Auth CLI and then land in Drizzle's migration flow like
everything else — ⚠️ **`getMigrations` does not work with the Drizzle adapter** (verification §2.3),
so Better Auth never runs a migration against this database. That is what makes `03` §4.2's
one-migration-owner rule true in practice.

⚠️ **Amended 2026-09-09, while building the schema.** This section used to give the command as
`npx auth@latest generate --adapter drizzle --dialect pg`. **Those two flags produce the wrong
output.** They make the CLI synthesise an adapter rather than read the configured one, and the
configured one is where `schemaName` lives — so the generator emits `pgTable(...)` in `public` and
**silently drops the `auth` schema this section exists to create**. The tables appear, the migration
succeeds, and the separation is simply absent. The command is:

```
npx auth@1.7.3 generate --config <the auth config> --output server/db/schema/auth.ts
```

with the adapter configured as `drizzleAdapter(db, { provider: "pg", schemaName: "auth" })`. The
correction is held by a test — `test/schema/schema.test.ts` asserts the four tables are in `auth` —
rather than by this paragraph. `08` §7 carried the same wrong command and is amended too.

`user` is `id (text PK), name, email (unique), emailVerified, image?, createdAt, updatedAt`, all
remappable via `modelName`/`fields` and extendable via `additionalFields` (verification §2.3, §10.2).
**Nothing here remaps them.** A rename would buy tidiness and cost the ability to regenerate the
schema and diff it against what is deployed.

**Why a separate Postgres schema:** it makes "this project does not own these four tables" structural
rather than a comment, and cross-schema foreign keys are ordinary. It also keeps `user` — a reserved
word needing quotes as `auth."user"` — out of `public`.

⚠️ **Better Auth's own children cascade from `user` and that is correct**; §3 explains why ours do
not.

---

## 9. Delete behaviour — every foreign key

Review history cannot be regenerated, so **no foreign key in this schema gets a delete rule by
default.** Each one below was chosen.

| Child → parent | Rule | Why |
| --- | --- | --- |
| `source_chunk` → `source` | `CASCADE` | Chunk boundaries are meaningless without the content |
| `occurrence` → `source` | `CASCADE` | An occurrence is a character range **in** that text |
| `occurrence` → `source_chunk` | `CASCADE` | Same |
| `occurrence` → `note` | `RESTRICT` | Notes are never deleted; the rule is written so it is already right if that ever changes |
| `occurrence` → `ingestion` | `SET NULL` | Which run found it is nice to have, not load-bearing |
| `note_field_provenance` → `note` | `CASCADE` | Provenance without its note describes nothing |
| `level_claim` → `note` | `CASCADE` | Same |
| `note` → `ingestion` (`origin_ingestion_id`) | `SET NULL` | A note outlives the run that made it |
| `ingestion` → `source` | `SET NULL` | ⚠️ **The spend ledger survives a hard delete.** `source_title` is snapshotted for this case |
| `ingestion_chunk` → `ingestion` | `CASCADE` | Progress is meaningless without its run |
| `ingestion_chunk` → `source_chunk` | `CASCADE` | Same |
| `job` → `ingestion` | `CASCADE` | A job for a deleted run is noise |
| `note_vetting` → `vetting_session` | `RESTRICT` | The reversibility rule reads `vetting_session.ended_at` through this column; losing it would make a permanent rejection look reversible |
| `note_vetting` → `note` | `RESTRICT` | ⚠️ **ADR 0006: a rejection must survive re-ingestion.** A cascade here would resurrect two hundred declined words |
| `card` → `note` | `RESTRICT` | A card without its note is unrenderable, and deleting cards is never the answer |
| `scheduling_epoch` → `card` | `RESTRICT` | The epoch is the history |
| `review_log` → `card` | `RESTRICT` | **The irreplaceable thing** |
| `review_log` → `scheduling_epoch` | `RESTRICT` | Same |
| `review_log` → `review_session` | `SET NULL` | The grade outlives its session |
| `review_session_card` → `review_session` | `CASCADE` | Membership without a session is nothing |
| `review_session_card` → `card` | `RESTRICT` | |
| `card_flag` → `card`, `note` | `RESTRICT` | |
| `card_flag` → `source` | `SET NULL` | The actionable half — prompt version and model id — is denormalised and survives |
| `card_flag` → `review_session` | `SET NULL` | |
| **every** `owner_id` → `auth."user".id` | **`RESTRICT`** | §3. The user row cannot be deleted while any history references it |
| `ingestion.submitted_by`, `job.requested_by` → `auth."user".id` | `SET NULL` | Audit lines, not owners |

### 9.1 What each delete actually does

**Rejecting a note** is not a delete. `note_vetting.state = 'rejected'` and the note row stays
forever, because that row *is* the filter that keeps `S5` true.

**Deleting a source** — the reader's action from *Sources* (`S11`) — is a **soft delete**:
`source.deleted_at` is set, and every card whose note originated in that source is suspended with
`suspended_reason = 'source_deleted'`. **No review history is touched.** The source stays readable.

**Hard-deleting a source** is a separate deliberate act. It removes the `source` row, cascading
`source_chunk` and `occurrence` — the positional links, which mean nothing without the text. It
**preserves** notes, cards, epochs, review logs, flags and the ingestion's cost record, which is what
`S11` and ADR 0011 require. Cards suspended by the soft delete stay suspended; nothing un-suspends
itself.

**Deleting a note, card, epoch or review log:** there is no path, in the app or in the worker. If one
is ever needed it is a migration written by a person who has read this section. ⚠️ **One exception,
added 2026-09-07:** `Z` in *Vet* un-mints the `card` its own acceptance created, inside the run that
created it, which is provably historyless — and if that proof is ever wrong, `review_session_card →
card` and `review_log → card` are both `RESTRICT`, so the database refuses and `Z` fails visibly
([ADR 0033](adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md), `09` §5.3).

---

## 10. What is soft-deleted, what expires, and the one table safe to truncate

| | Mechanism | Retention |
| --- | --- | --- |
| `source` | `deleted_at` — soft | Forever, unless hard-deleted deliberately |
| `card` | `suspended_at` — **not a delete** | Forever |
| `scheduling_epoch` | `superseded_at` — **not a delete** | Forever. `S12` exports superseded epochs |
| `note_vetting` (`rejected`) | State, not deletion | Forever. ADR 0006 requires it |
| `job` | Deleted once `finished_at` is older than **30 days** | The sweep runs **in the worker**, at the top of its poll — ADR 0022 forbids a Vercel Cron dependency |
| `vetting_session` | Idle sessions closed after 30 minutes; rows kept | Forever — they are how *seconds-per-note* is grouped |
| `generation_cache` | None. **Safe to truncate** | The only such table. Truncating costs money on the next re-ingestion and nothing else |
| `auth.session` | Better Auth, 7 days sliding | Its concern (`03` §2.2) |
| `auth.verification` | Better Auth, on expiry | Its concern |
| The *session* snapshot and the *grade* outbox | `localStorage`, not this database | **A bounded cache, not a replica** (ADR 0014) |

**Backups are `S12`'s tested export, not the platform.** Neon Free gives six hours of instant restore
and one snapshot, and six hours is not a backup for the one thing that cannot be regenerated
(`03` §13.6). The export covers *notes*, *cards*, *grades* and **every** epoch including superseded
ones, and it is exercised by a test that reads it back and reconciles counts — an untested export is
a belief.

---

## 11. Indexes, each with the query that needs it

| Index | Serves |
| --- | --- |
| `note (subject_id, identity_key)` **unique** | Pipeline stage 4 — the dedup lookup, once per candidate. Also the constraint |
| `note_vetting (owner_id, state) WHERE state = 'pending'` | The *Vet* queue. The only query that runs between every keystroke |
| `note_vetting (owner_id, vetted_at)` | *Acceptance rate*, *seconds-per-note*, and stage 5's rejected filter |
| `note_field_provenance (model_id, prompt_version)` | ⚠️ **The query that decided ADR 0029** — acceptance rate grouped by model, and ADR 0004's "prompt v3 writes bad example sentences" |
| `occurrence (source_id)` | `S11` — open a source, see what came from it |
| `occurrence (note_id)` | `S11` — a note links to its occurrences |
| `level_claim (note_id)` | Rendering one note on *Vet*. The set is never collapsed, so it is always a fetch of several |
| `source (content_hash)` | PRD §5 — identical content offers to open the existing source |
| `source (subject_id, submitted_at DESC) WHERE deleted_at IS NULL` | The *Sources* list |
| `ingestion_chunk (ingestion_id) WHERE status <> 'complete'` | **The resume query** (§6.2). Partial, because the interesting rows are the minority |
| `job (available_at) WHERE state = 'queued'` | The claim query, run on every connect, reconnect and notification |
| `job (heartbeat_at) WHERE state = 'claimed'` | The stale-claim sweep |
| `card (owner_id, note_id, template_key)` **unique** | One card per note per template |
| `scheduling_epoch (card_id) WHERE superseded_at IS NULL` **unique** | **Exactly one live epoch per card.** A constraint that happens to be the lookup |
| `scheduling_epoch (owner_id, due) WHERE superseded_at IS NULL` | **The due query — the hottest read in the app.** Composing a session joins `card` to filter `suspended_at IS NULL`; suspension is on the card, so it cannot be in this partial predicate |
| `review_log (scheduling_epoch_id, reviewed_at)` | Per-card history, the export, and the previous-review lookup that derives elapsed days |
| `review_log (owner_id, received_at)` | *Time-to-first-review*, on the server clock (§7.5) |
| `review_session_card (card_id)` | "Is this card in the live session?" |
| `card_flag (source_id, prompt_version)` | ADR 0004's actionable query |
| `card_flag (note_id) WHERE resolved_at IS NULL` | The flagged notes waiting in the *Vet* queue |
| `generation_cache` — the composite PK | The cache lookup. **No second index** |

### 11.1 Indexes deliberately absent

- **No index on `note.fields`.** A GIN index there would serve no v1 query: the card browser is cut
  (`PRD §6`), there is no field search, and the one cross-note question anyone asks is about
  provenance, which is a table. This is the index a future session will add on the general principle
  that jsonb wants a GIN index. It does not; queries do.
- **No index on `source.content`.** Nothing searches source text in v1. Full-text search over the
  corpus is L3's territory.
- **No index on `review_log (card_id)` alone.** Every access is per epoch and ordered by time, which
  the composite already covers.
- **No covering or partial index tuned for a query that does not exist yet.** At eight hundred notes
  and a few thousand review rows, the planner does not need help; each index above earns its write
  cost by naming a query in the PRD or an ADR.

---

## 12. The queries this shape exists to serve

Stated as behaviour, not SQL. If a later change makes one of these awkward, the change is wrong.

1. **The *Vet* queue** — pending notes for this owner, with their fields, provenance and level claims.
   One note per keystroke, and `S3` gives it a five-second median to live inside.
2. **The dedup lookup** — does `(subject_id, identity_key)` exist? Once per candidate, in the worker,
   before any spend (ADR 0010).
3. **The rejected filter** — every `identity_key` this owner has rejected. `S5`, and it is why the
   fiftieth source is cheaper than the fifth.
4. **The due query** — live epochs for this owner with `due <= now()`, joined to unsuspended cards,
   ordered due-first with new cards filling the remainder (`S7`). Queue ordering is the app's job, not
   FSRS's (verification §1.4).
5. **The resume query** — incomplete chunks for an ingestion. §6.2. A query, never a judgement call.
6. **The claim query** — one queued job, `FOR UPDATE SKIP LOCKED`, then an `UPDATE` to a claimed row
   state. §6.4.
7. **The cache lookup** — the four-tuple. §6.3.
8. **The model comparison** — acceptance rate and false-accept rate grouped by `model_id` and
   `prompt_version`. **This is ADR 0018's instrument**, and ADR 0029 chose the storage shape for it.
9. **The export** — notes, cards, grades and every epoch including superseded ones, as plain JSON,
   read back by a test that reconciles counts (`S12`).
10. **The four numbers** — all six values `S10` reports, derived from rows written at the moment they
    happened. §13.

---

## 13. What is not a table, and stays that way

Each of these is something a future session will reach for. Each is absent for a reason already
argued somewhere else.

- **`note_type` and `template`.** The subject declaration is language-neutral JSON in `subjects/`,
  owned by neither toolchain (ADR 0003, `03` §6). `note.subject_id` and `card.template_key` are text
  keys into it, deliberately **not** foreign keys — a foreign key would put a second copy of the
  declaration in the database and re-create the drift ADR 0003 exists to design out. The guard is the
  cross-language test in `03` §6, plus validation at the application boundary.
- **`authority`.** Same reasoning. The authority list *and its precedence order* are declared per
  subject (ADR 0005), so `level_claim.authority_key` is a text key and `NULL` means the model
  estimated it.
- **`subject`.** Adding a subject is a code change plus tests, not a row (ADR 0003).
- **`deck`.** A deck is a saved query and v1 has none (ADR 0009, `PRD L2`). The scheduling rule that
  *is* due now — one schedule per card, never per card-per-deck — is already true here, because
  scheduling state hangs off `card` through `scheduling_epoch` and nothing else.
- **`rejected_term`.** `note_vetting.state = 'rejected'` joined to `note.identity_key` is the filter.
  A second table would be a second copy of the same fact, and copies drift.
- **Metrics tables.** All six of `S10`'s values are derived from rows written by the code that
  produced them (`03` §12): acceptance rate and *seconds-per-note* from `note_vetting`, false-accept
  rate from `card_flag`, *time-to-first-review* from `source.submitted_at` to the first
  `review_log.received_at`, tokens and cost from `ingestion`. **Nothing durable depends on a log**,
  which is what makes the numbers survive ADR 0022's move.
- **A queue table separate from `job`.** `ingestion_chunk` is the per-chunk queue and `job` is the
  per-run one; a third would be a queue service with extra steps (ADR 0015).
- **A sessions table for auth.** Better Auth owns it (§8).

---

## 14. What this hands forward

- **`08-authentication.md`** — §3 and §8 are its schema half: the `auth` Postgres schema, the `text`
  owner column, `RESTRICT` on every personal reference, and ⚠️ the cascade convention that had to be
  broken.
- **`11-testing-plan.md`** — `S12`'s export test reconciles counts across `note`, `card`,
  `scheduling_epoch` (**including superseded**) and `review_log`. The append-only trigger on
  `review_log` is itself testable: an `UPDATE` must raise.
- **Phase 6** — Drizzle migrations, in the order the foreign keys imply. The `review_log`
  append-only trigger is a raw SQL migration; everything else is generated. **The worker never issues
  DDL** (`03` §4.2).
- **`10-screen-specifications.md`** — the *progress rail*'s length is `review_session.size`, and the
  *provenance marker* is filled when `level_claim.authority_key IS NOT NULL` and hollow when it is
  null (§5.6).

**Nothing here depends on a Vercel-only feature.** The one place it could have — the stale-claim
sweep — runs in the worker instead (§6.4), so ADR 0022's move stays a Nitro preset change plus a
`pg_dump`.
