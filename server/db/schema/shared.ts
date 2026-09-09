// `04-database-schema.md` §5 and §6 — the ten *shared* tables.
//
// ⚠️ The split across `shared.ts` and `personal.ts` is `04` §4's own label, not
// a filing convenience: *shared* is true regardless of who is asking, *personal*
// is a statement about one reader. `04` §4 calls the label "product
// specification, not schema decoration", and it is the label that decides
// whether a foreign key to the owner is `RESTRICT` (§3).
//
// §5 and §6 are one file because their foreign keys cross the section line in
// both directions — `ingestion → source`, `note → ingestion`,
// `occurrence → ingestion` — and two modules referencing each other's tables is
// a cycle waiting to be tripped over.
//
// Conventions, all from `04` §1 and none of them defaults:
//   - `uuidv7()` on every primary key. A Postgres 18 built-in, time-ordered, so
//     inserts stay at the right-hand edge of the index (verification §10.1).
//     ⚠️ This is half of a pin: `@electric-sql/pglite` 0.5.8 is PostgreSQL 18.3,
//     measured, and a PGlite that regressed to 17 fails on the first
//     `CREATE TABLE` (ADR 0038, `03` §13.5).
//   - `timestamptz`, always. A laptop crosses timezones (`03` §8.2).
//   - `text` with a `CHECK`, never a Postgres `enum` type. A `CHECK` is a
//     one-line migration and shows up in `\d`.
//   - Nullable timestamps rather than booleans wherever the real question is
//     *when*: `deleted_at`, `claimed_at`, `superseded_at`.
//   - Character offsets are **characters, not bytes**. Japanese makes the
//     distinction load-bearing.

import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { user } from './auth'

/** `uuid primary key default uuidv7()` — `04` §1. */
const primaryId = () => uuid('id').primaryKey().default(sql`uuidv7()`)

/** `timestamptz`, the only timestamp type in this schema — `04` §1. */
const tstz = (name: string) => timestamp(name, { withTimezone: true })

// ---------------------------------------------------------------------------
// §5 — the corpus
// ---------------------------------------------------------------------------

/**
 * `04` §5.1 — the ingested material, retained after ingestion because
 * incremental reading requires it (ADR 0008).
 */
export const source = pgTable(
  'source',
  {
    id: primaryId(),
    /** Key into `subjects/`. ⚠️ Deliberately **not** a foreign key — `04` §13. */
    subjectId: text('subject_id').notNull(),
    title: text('title').notNull(),
    /** The material itself. ⚠️ Never logged (`03` §13.4). */
    content: text('content').notNull(),
    /** SHA-256 hex of NFC-normalised `content`. Indexed, **not unique**. */
    contentHash: text('content_hash').notNull(),
    charCount: integer('char_count').notNull(),
    /** The left-hand end of *time-to-first-review* (`03` §12). */
    submittedAt: tstz('submitted_at').notNull().defaultNow(),
    /** Soft delete. Non-null suspends its cards — `04` §9.1, `S11`. */
    deletedAt: tstz('deleted_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    // `S2`'s cap as a constraint, refused before any spend. The handler checks
    // it too; this is the schema refusing it as well (`11` §5).
    check('source_char_count_cap', sql`${t.charCount} > 0 AND ${t.charCount} <= 100000`),
    // ⚠️ Not unique. PRD §5: resubmitting identical content creates a new
    // *source* and offers to open the existing one. Detection, not prevention.
    index('source_content_hash_idx').on(t.contentHash),
    // The *Sources* list.
    index('source_subject_submitted_idx')
      .on(t.subjectId, t.submittedAt.desc())
      .where(sql`${t.deletedAt} is null`),
  ],
)

/**
 * `04` §5.2 — the deterministic division of a source's content. Boundaries are
 * a function of content, so they are shared and stable across re-ingestions;
 * **progress against them is not**, and lives in `ingestion_chunk` (§6.2).
 */
export const sourceChunk = pgTable(
  'source_chunk',
  {
    id: primaryId(),
    sourceId: uuid('source_id')
      .notNull()
      // Chunk boundaries are meaningless without the content — `04` §9.
      .references(() => source.id, { onDelete: 'cascade' }),
    /** 0-based. */
    ordinal: integer('ordinal').notNull(),
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
    /** **The first element of the cache key** — §6.3. */
    contentHash: text('content_hash').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    unique('source_chunk_source_ordinal_key').on(t.sourceId, t.ordinal),
    check('source_chunk_range', sql`${t.charEnd} > ${t.charStart}`),
  ],
)

// ---------------------------------------------------------------------------
// §6 — ingestion and the worker
// ---------------------------------------------------------------------------

/**
 * `04` §6.1 — one run turning one source into pending notes, and **the spend
 * ledger `S10` reports from.**
 */
export const ingestion = pgTable(
  'ingestion',
  {
    id: primaryId(),
    /**
     * ⚠️ Nullable, and `SET NULL` on delete, so **the spend ledger survives a
     * hard delete** — `04` §9. `sourceTitle` is snapshotted for that case.
     */
    sourceId: uuid('source_id').references(() => source.id, { onDelete: 'set null' }),
    /** Snapshot at submit. The ledger stays readable after a hard delete. */
    sourceTitle: text('source_title').notNull(),
    subjectId: text('subject_id').notNull(),
    status: text('status').notNull().default('queued'),
    submittedAt: tstz('submitted_at').notNull().defaultNow(),
    startedAt: tstz('started_at'),
    completedAt: tstz('completed_at'),
    /**
     * ⚠️ An audit line, **not an owner** — `04` §4. A column that references a
     * user does not make an entity personal; the label asks what the row
     * *asserts*, and this row asserts something about the material.
     */
    submittedBy: text('submitted_by').references(() => user.id, { onDelete: 'set null' }),
    modelId: text('model_id'),
    promptVersion: text('prompt_version'),
    dictionaryVersion: text('dictionary_version'),
    /** **From the API response** (`03` §7), never estimated. */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /** Micro-USD. `bigint`, never a float and never `money` (`04` §1). */
    costMicroUsd: bigint('cost_micro_usd', { mode: 'bigint' }),
    /**
     * The price table is configuration with an effective date, not a constant
     * (`03` §7). Without this the ledger starts lying silently.
     */
    priceTableEffectiveDate: date('price_table_effective_date'),
    /** PRD §5: zero-new-notes reports how many were filtered… */
    candidatesExtracted: integer('candidates_extracted'),
    /** …and **by which filter**. */
    candidatesDeduplicated: integer('candidates_deduplicated'),
    candidatesAlreadyKnown: integer('candidates_already_known'),
    candidatesRejected: integer('candidates_rejected'),
    /**
     * ⚠️ `03` §12: early *time-to-first-review* figures are not comparable
     * across ADR 0022's move, **recorded on the number** rather than only in a
     * paragraph.
     */
    workerEnvironment: text('worker_environment').notNull().default('laptop'),
  },
  t => [
    // ⚠️ `incomplete` is `S2`'s resumable state, not an error.
    check(
      'ingestion_status',
      sql`${t.status} IN ('queued','running','complete','incomplete','failed')`,
    ),
    check('ingestion_worker_environment', sql`${t.workerEnvironment} IN ('laptop','server')`),
  ],
)

/**
 * `04` §6.2 — per-chunk progress, durable, **so a resume is a query rather than
 * a judgement call** (`S2`'s failure case, ADR 0015, `03` §5.4).
 *
 * Resume is `WHERE ingestion_id = $1 AND status <> 'complete'`. That is the
 * whole mechanism, and it is why there is no queue service: once this record
 * exists, it *is* the queue.
 */
export const ingestionChunk = pgTable(
  'ingestion_chunk',
  {
    ingestionId: uuid('ingestion_id')
      .notNull()
      .references(() => ingestion.id, { onDelete: 'cascade' }),
    sourceChunkId: uuid('source_chunk_id')
      .notNull()
      .references(() => sourceChunk.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    /** ⚠️ Never contains source text (`03` §13.4). */
    lastError: text('last_error'),
    startedAt: tstz('started_at'),
    completedAt: tstz('completed_at'),
  },
  t => [
    primaryKey({ columns: [t.ingestionId, t.sourceChunkId] }),
    check('ingestion_chunk_status', sql`${t.status} IN ('pending','running','complete','failed')`),
    // The resume query. Partial, because the interesting rows are the minority.
    index('ingestion_chunk_incomplete_idx')
      .on(t.ingestionId)
      .where(sql`${t.status} <> 'complete'`),
  ],
)

/**
 * `04` §6.3 — ADR 0010's replayable cache, with the dictionary version added by
 * `03` §5.3.
 *
 * **This is the only table in the schema that is safe to truncate.** Doing so
 * costs money on the next re-ingestion and nothing else (`04` §10).
 */
export const generationCache = pgTable(
  'generation_cache',
  {
    /** PK part 1 — the *chunk*'s hash. */
    contentHash: text('content_hash').notNull(),
    /**
     * PK part 2 — added in `03` §5.3. ⚠️ A SudachiDict upgrade changes
     * tokenisation, which changes candidate extraction, which changes
     * `normalized_form` — **which is half of ADR 0006's identity key.** Without
     * this column a dictionary bump silently serves cached results computed
     * against a different tokenisation of the same text.
     */
    dictionaryVersion: text('dictionary_version').notNull(),
    /** PK part 3. */
    promptVersion: text('prompt_version').notNull(),
    /** PK part 4. */
    modelId: text('model_id').notNull(),
    /** The structured output as returned. */
    response: jsonb('response').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    // The four-tuple written out rather than hashed into one column, so the key
    // is legible in `\d`. A composite PK is also the lookup index, so **no
    // second index exists** (`04` §11).
    primaryKey({
      columns: [t.contentHash, t.dictionaryVersion, t.promptVersion, t.modelId],
    }),
  ],
)

/**
 * `04` §6.4 — ADR 0028: **the job table is the truth and `NOTIFY` only shortens
 * latency.**
 *
 * A claim is a row state with an owner and a timestamp, **not a held lock**
 * (`03` §3.2): a lock held for the life of a job dies with the connection and
 * tells nobody. A job in `claimed` whose `heartbeat_at` is older than five
 * minutes is reclaimable, which is what "the laptop closed mid-job" resolves to.
 *
 * ⚠️ The stale-claim sweep runs **in the worker**, at the top of its poll — ADR
 * 0022 forbids depending on a Vercel-only feature, and Vercel Cron is named in
 * that list.
 */
export const job = pgTable(
  'job',
  {
    id: primaryId(),
    kind: text('kind').notNull(),
    ingestionId: uuid('ingestion_id')
      .notNull()
      // A job for a deleted run is noise — `04` §9.
      .references(() => ingestion.id, { onDelete: 'cascade' }),
    state: text('state').notNull().default('queued'),
    /** Backoff. A retry sets it forward rather than sleeping in the worker. */
    availableAt: tstz('available_at').notNull().defaultNow(),
    /** Worker instance id — hostname plus process start time. */
    claimedBy: text('claimed_by'),
    claimedAt: tstz('claimed_at'),
    /** **The column that survives the laptop closing.** */
    heartbeatAt: tstz('heartbeat_at'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    /** An audit line, not an owner — `04` §4. */
    requestedBy: text('requested_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
    finishedAt: tstz('finished_at'),
  },
  t => [
    check('job_kind', sql`${t.kind} IN ('ingest','resume')`),
    check('job_state', sql`${t.state} IN ('queued','claimed','done','failed')`),
    // The claim query, run on every connect, reconnect and notification.
    index('job_queued_idx')
      .on(t.availableAt)
      .where(sql`${t.state} = 'queued'`),
    // The stale-claim sweep.
    index('job_claimed_heartbeat_idx')
      .on(t.heartbeatAt)
      .where(sql`${t.state} = 'claimed'`),
  ],
)

// ---------------------------------------------------------------------------
// §5, continued — the notes, which reference §6's `ingestion`
// ---------------------------------------------------------------------------

/**
 * `04` §5.3 — the note. `fields` is one `jsonb` document (ADR 0029): the note is
 * the unit of vetting (ADR 0004), written whole on the accept keystroke, and
 * frozen afterwards (ADR 0006).
 *
 * ⚠️ **The rendering rule is part of the identity.** `identity_key` is the
 * subject's declared key fields, NFC-normalised, joined by `U+001F`, in the
 * order the declaration lists them — so `開く␟ひらく` and `開く␟あく` are two
 * notes, which is the pair ADR 0006 exists to keep apart. **Changing the
 * rendering rule changes the identity of existing notes**, and is the same class
 * of event as a `SudachiDict` bump: a reviewed data event with a re-ingestion
 * plan, never a refactor (`03` §5.3).
 *
 * ⚠️ **Numerals never reach `identity_key`.** `is_oov=True` rewrites
 * `normalized_form` to ASCII — 六 becomes `6` — so numerals are excluded at
 * candidate extraction, before the key is built (`03` §5.2).
 */
export const note = pgTable(
  'note',
  {
    id: primaryId(),
    subjectId: text('subject_id').notNull(),
    identityKey: text('identity_key').notNull(),
    /**
     * ADR 0029. Shape declared per subject and **validated at the application
     * boundary**, not by Drizzle — neither Drizzle nor Kysely validates `jsonb`
     * at runtime (verification §6.4).
     *
     * ⚠️ **No index, deliberately** (`04` §11.1). No v1 query reads inside it:
     * the card browser is cut (PRD §6) and there is no field search. This is the
     * index a future session adds on the general principle that jsonb wants a
     * GIN index. It does not; queries do.
     */
    fields: jsonb('fields').notNull(),
    /**
     * The run that paid to generate it. Nullable, and `SET NULL`, so a
     * hard-deleted source does not take the note with it — a note outlives the
     * run that made it (`04` §9).
     */
    originIngestionId: uuid('origin_ingestion_id').references(() => ingestion.id, {
      onDelete: 'set null',
    }),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    // ADR 0006's deduplication as a constraint: a collision cannot create a
    // second note, it appends an *occurrence*. Also the dedup lookup index
    // (`04` §11) — pipeline stage 4, once per candidate, before any spend.
    uniqueIndex('note_subject_identity_key').on(t.subjectId, t.identityKey),
  ],
)

/**
 * `04` §5.4 — ADR 0004: trust is a property of where a value came from, recorded
 * per field. ADR 0029 makes this relational, and **this is the table its
 * argument is about**: its structure is identical across every subject while the
 * fields it describes are not, and its entries are written independently by
 * different pipeline stages.
 *
 * **`kind` is the honesty bit.** `lookup` renders quietly; `judgement` and
 * `generated` are foregrounded — that is `S4`, and it is why *Vet* is a decision
 * rather than a transcription check.
 */
export const noteFieldProvenance = pgTable(
  'note_field_provenance',
  {
    noteId: uuid('note_id')
      .notNull()
      // Provenance without its note describes nothing — `04` §9.
      .references(() => note.id, { onDelete: 'cascade' }),
    /** A key present in `note.fields`. */
    fieldName: text('field_name').notNull(),
    kind: text('kind').notNull(),
    /** Null for `lookup` and `human`. */
    modelId: text('model_id'),
    promptVersion: text('prompt_version'),
    /** `SudachiDict-core` release, e.g. `20260723`. Null where the tokeniser was not involved. */
    dictionaryVersion: text('dictionary_version'),
    /** The raw signal `kind` was derived from, kept because `03` §5.2 reads it for two reasons. */
    isOov: boolean('is_oov'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    // No surrogate id: the pair is the identity, and a surrogate would permit
    // two provenance rows for one field, which is not a state that means
    // anything.
    primaryKey({ columns: [t.noteId, t.fieldName] }),
    check(
      'note_field_provenance_kind',
      sql`${t.kind} IN ('lookup','judgement','generated','human')`,
    ),
    // ⚠️ **The query that decided ADR 0029** — acceptance rate grouped by model
    // and prompt, and ADR 0004's "prompt v3 writes bad example sentences".
    // A GIN index over a blob serves containment, not `GROUP BY`.
    index('note_field_provenance_model_prompt_idx').on(t.modelId, t.promptVersion),
  ],
)

/**
 * `04` §5.5 — ADR 0006: a collision appends an occurrence and **never alters the
 * note's fields.** Append-only by convention: there is no `UPDATE` path, and a
 * correction is a new occurrence.
 */
export const occurrence = pgTable(
  'occurrence',
  {
    id: primaryId(),
    noteId: uuid('note_id')
      .notNull()
      // Notes are never deleted; the rule is written so it is already right if
      // that ever changes — `04` §9.
      .references(() => note.id, { onDelete: 'restrict' }),
    sourceId: uuid('source_id')
      .notNull()
      // An occurrence is a character range **in** that text.
      .references(() => source.id, { onDelete: 'cascade' }),
    sourceChunkId: uuid('source_chunk_id')
      .notNull()
      .references(() => sourceChunk.id, { onDelete: 'cascade' }),
    /** Position **within the source**, in characters. */
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
    /** As it appeared. C split mode keeps 図書館 whole (`03` §5.1). */
    surfaceForm: text('surface_form').notNull(),
    /** Which run found it — nice to have, not load-bearing, so `SET NULL`. */
    ingestionId: uuid('ingestion_id').references(() => ingestion.id, { onDelete: 'set null' }),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    // Re-running a source appends nothing it already has. This is what makes
    // re-ingestion idempotent in the one place idempotence is cheap.
    unique('occurrence_note_source_start_key').on(t.noteId, t.sourceId, t.charStart),
    check('occurrence_range', sql`${t.charEnd} > ${t.charStart}`),
    // `S11` — open a source, see what came from it; a note links to its occurrences.
    index('occurrence_source_idx').on(t.sourceId),
    index('occurrence_note_idx').on(t.noteId),
  ],
)

/**
 * `04` §5.6 — ADR 0005: a *level* is a set of attributed claims and **the set is
 * never collapsed.** Precedence decides the display value and lives in the
 * subject declaration, not here.
 *
 * `authority_key IS NULL` is the one bit of difference `S4` requires — a named
 * authority versus a model estimate, distinguishable without a caveat paragraph.
 * It is what the *provenance marker* draws: filled when non-null, hollow when
 * null (`10` §—, `04` §14).
 */
export const levelClaim = pgTable(
  'level_claim',
  {
    id: primaryId(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => note.id, { onDelete: 'cascade' }),
    /**
     * Key into the subject declaration's authority list. ⚠️ Deliberately not a
     * foreign key (`04` §13). **Null means the model estimated it.**
     */
    authorityKey: text('authority_key'),
    /** Subject-defined band, e.g. `N3`. */
    level: text('level').notNull(),
    /** Set when `authority_key` is null. */
    modelId: text('model_id'),
    promptVersion: text('prompt_version'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    // Keeps the two halves from drifting.
    check(
      'level_claim_attribution',
      sql`(${t.authorityKey} IS NULL) = (${t.modelId} IS NOT NULL)`,
    ),
    // One claim per authority, and exactly one model estimate. Postgres 15 and
    // later spell this `UNIQUE NULLS NOT DISTINCT` — without it, every model
    // estimate would be distinct from every other and the "exactly one" half
    // would not hold.
    unique('level_claim_note_authority_key').on(t.noteId, t.authorityKey).nullsNotDistinct(),
    // Rendering one note on *Vet*. The set is never collapsed, so it is always a
    // fetch of several.
    index('level_claim_note_idx').on(t.noteId),
  ],
)
