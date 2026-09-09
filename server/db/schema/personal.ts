// `04-database-schema.md` §7 — the eight *personal* tables.
//
// ⚠️ **Every `owner_id` here is `ON DELETE RESTRICT`, and that is a correction,
// not a default.** Better Auth's generated schema wires every child of `user`
// with `onDelete: "cascade"` (verification §10.2, and `auth.ts` carries them).
// Following that convention here would make deleting one row destroy every
// *scheduling epoch* and every *review log* beneath it — which `03` §13.6 names
// as the worst thing an attacker could do, arriving by way of a copied ORM
// default. `RESTRICT` means the `user` row cannot be deleted while any history
// references it. That is the second of ADR 0011's two independent guards; the
// first is that the app has no delete-account path at all.
//
// **The rule is not "no cascades"** — it is that a cascade must never reach a
// table that cannot be rebuilt. `review_session_card → review_session` cascades,
// because membership without a session is nothing.
//
// ⚠️ `owner_id` is `text` while every other key here is `uuid`, because Better
// Auth mints string ids itself (`04` §3). That mixed pair is the visible seam of
// a table this project does not own, and it is cheaper to look at than to hide.

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  doublePrecision,
} from 'drizzle-orm/pg-core'

import { user } from './auth'
import { note, source } from './shared'

const primaryId = () => uuid('id').primaryKey().default(sql`uuidv7()`)
const tstz = (name: string) => timestamp(name, { withTimezone: true })

/** Every personal entity's owner — `04` §3. `RESTRICT`, never `CASCADE`. */
const ownerId = () =>
  text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' })

/**
 * `04` §7.1 — the contiguous run at the keyboard.
 *
 * It exists because `CONTEXT.md` makes a *rejection* **reversible only within
 * the session that declined it, and permanent afterwards** — a rule that needs a
 * durable boundary rather than a belief held by the browser tab. Ending the
 * session is what makes a rejection permanent, so the mode's one visible exit
 * (ADR 0026) is a data boundary as well as an interaction one.
 *
 * ⚠️ **This is not a *session* in `CONTEXT.md`'s sense.** That word is reserved
 * for the bounded run of due cards. Vetting is a queue, not a session (PRD §5),
 * and every note still commits on its keystroke.
 */
export const vettingSession = pgTable('vetting_session', {
  id: primaryId(),
  ownerId: ownerId(),
  startedAt: tstz('started_at').notNull().defaultNow(),
  /** Set on `Esc` or the **Done** control (ADR 0026), and by a 30-minute idle sweep. */
  endedAt: tstz('ended_at'),
})

/**
 * `04` §7.2 — the *pending* / *accepted* / *rejected* state, personal because
 * ADR 0012 says a rejection is a claim about the reader, not about the word.
 *
 * **`state = 'rejected'` is also the filter.** Stage 5 of the pipeline joins
 * `note.identity_key` for this owner and drops anything already rejected — which
 * is `S5`, and why the fiftieth source asks about fewer notes than the fifth.
 * ⚠️ **There is no separate `rejected_term` table** (`04` §13); adding one would
 * be a second copy of a fact this row already carries, and copies drift.
 */
export const noteVetting = pgTable(
  'note_vetting',
  {
    noteId: uuid('note_id')
      .notNull()
      // ⚠️ ADR 0006: **a rejection must survive re-ingestion.** A cascade here
      // would resurrect two hundred declined words — `04` §9.
      .references(() => note.id, { onDelete: 'restrict' }),
    ownerId: ownerId(),
    /** **There is no provisional state** (ADR 0004). */
    state: text('state').notNull().default('pending'),
    /** `S6`: an edited note counts against *acceptance rate* as an edit, not as an acceptance. */
    edited: boolean('edited').notNull().default(false),
    /** **`S3`'s measured criterion**, stamped per note from day one (`03` §12). */
    secondsToVet: numeric('seconds_to_vet', { precision: 6, scale: 2 }),
    /**
     * Which run decided it. `RESTRICT`: the reversibility rule reads
     * `vetting_session.ended_at` through this column, and losing it would make a
     * permanent rejection look reversible (`04` §9).
     */
    vettingSessionId: uuid('vetting_session_id').references(() => vettingSession.id, {
      onDelete: 'restrict',
    }),
    vettedAt: tstz('vetted_at'),
    /** Set by `S9`: an accepted note returned to the queue flagged. */
    flaggedAt: tstz('flagged_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.noteId, t.ownerId] }),
    check('note_vetting_state', sql`${t.state} IN ('pending','accepted','rejected')`),
    // The *Vet* queue — the only query that runs between every keystroke.
    index('note_vetting_pending_idx')
      .on(t.ownerId, t.state)
      .where(sql`${t.state} = 'pending'`),
    // *Acceptance rate*, *seconds-per-note*, and stage 5's rejected filter.
    index('note_vetting_owner_vetted_idx').on(t.ownerId, t.vettedAt),
  ],
)

/**
 * `04` §7.3 — ADR 0002: one note rendered through one template.
 *
 * **A card is never deleted.** `S9` and `S11` both suspend, and suspension
 * leaves history untouched. ⚠️ One exception, ADR 0033: `Z` in *Vet* un-mints
 * the card its own acceptance created, inside the run that created it, which is
 * provably historyless — and if that proof is ever wrong,
 * `review_session_card → card` and `review_log → card` are both `RESTRICT`, so
 * the database refuses and `Z` fails visibly (`04` §9.1 as amended).
 */
export const card = pgTable(
  'card',
  {
    id: primaryId(),
    noteId: uuid('note_id')
      .notNull()
      // A card without its note is unrenderable, and deleting cards is never the
      // answer — `04` §9.
      .references(() => note.id, { onDelete: 'restrict' }),
    ownerId: ownerId(),
    /** Key into the subject declaration. ⚠️ **Not** a foreign key — `04` §13. */
    templateKey: text('template_key').notNull(),
    /** *Suspended*: withdrawn from scheduling, **history untouched**. */
    suspendedAt: tstz('suspended_at'),
    suspendedReason: text('suspended_reason'),
    /** Minted at acceptance, never before. */
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  t => [
    // `S9` and `S11` are the only two.
    check('card_suspended_reason', sql`${t.suspendedReason} IN ('flagged','source_deleted')`),
    // One card per note per template per reader. v1 ships exactly one template,
    // so this constraint is doing nothing today and is the thing that stops a
    // second template from silently minting duplicates when it arrives (ADR 0002).
    uniqueIndex('card_owner_note_template_key').on(t.ownerId, t.noteId, t.templateKey),
  ],
)

/**
 * `04` §7.4 — **the FSRS state lives here, not on `card`, and that is the
 * decision this table exists to make.**
 *
 * A *scheduling epoch* is one continuous scheduling life of a card; a reset
 * begins a new one and the prior one is retained and exportable (ADR 0011,
 * `S12`). If the scheduler's state lived on `card`, a reset would be an `UPDATE`
 * over the history it is supposed to preserve, and the only thing standing
 * between six months of review data and an overwrite would be remembering to
 * copy it first. **Putting the state on the epoch makes a reset an `INSERT`.**
 * The irreplaceable thing is never in the path of an update.
 *
 * ⚠️ **There is no `elapsed_days` column and none may be added.** It is
 * deprecated and removed in `ts-fsrs` 6.0.0, and it is derivable from
 * `last_review` (verification §1.2). This is why the 5.4.2 → 6.0.0 major is a
 * data review rather than a migration (`03` §13.5).
 */
export const schedulingEpoch = pgTable(
  'scheduling_epoch',
  {
    id: primaryId(),
    cardId: uuid('card_id')
      .notNull()
      // The epoch is the history — `04` §9.
      .references(() => card.id, { onDelete: 'restrict' }),
    ownerId: ownerId(),
    /** 1-based. */
    ordinal: integer('ordinal').notNull(),
    startedAt: tstz('started_at').notNull().defaultNow(),
    /** Non-null means a later epoch replaced it. */
    supersededAt: tstz('superseded_at'),
    supersededReason: text('superseded_reason'),
    /** `ts-fsrs` `Card.due`. */
    due: tstz('due').notNull(),
    /**
     * `double precision` because `ts-fsrs` computes these as JavaScript numbers
     * and a round trip through `numeric` would not return the value the
     * scheduler produced (`04` §1).
     */
    stability: doublePrecision('stability').notNull(),
    difficulty: doublePrecision('difficulty').notNull(),
    scheduledDays: integer('scheduled_days').notNull(),
    /** ⚠️ **Required, not optional** (verification §1.2). */
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** New 0, Learning 1, Review 2, Relearning 3. */
    state: smallint('state').notNull().default(0),
    /** Null on a fresh epoch. */
    lastReview: tstz('last_review'),
  },
  t => [
    unique('scheduling_epoch_card_ordinal_key').on(t.cardId, t.ordinal),
    check(
      'scheduling_epoch_superseded_reason',
      sql`${t.supersededReason} IN ('memory_bearing_field_changed','manual_reset')`,
    ),
    check('scheduling_epoch_state', sql`${t.state} BETWEEN 0 AND 3`),
    // **Exactly one live epoch per card.** Without this partial unique index
    // "the current epoch" is a convention; with it, it is a constraint — and it
    // happens to be the lookup as well.
    uniqueIndex('scheduling_epoch_one_live_per_card')
      .on(t.cardId)
      .where(sql`${t.supersededAt} is null`),
    // **The due query — the hottest read in the app.** Composing a session joins
    // `card` to filter `suspended_at IS NULL`; suspension is on the card, so it
    // cannot be in this partial predicate (`04` §11).
    index('scheduling_epoch_owner_due_idx')
      .on(t.ownerId, t.due)
      .where(sql`${t.supersededAt} is null`),
  ],
)

/**
 * `04` §7.6 — `S7`: a bounded, finishable run, snapshotted at the start.
 */
export const reviewSession = pgTable(
  'review_session',
  {
    id: primaryId(),
    ownerId: ownerId(),
    /** The one knob (ADR 0016). */
    size: integer('size').notNull().default(20),
    /** **Server-side, because `03` §8.2's replay rule compares against it.** */
    snapshotTakenAt: tstz('snapshot_taken_at').notNull().defaultNow(),
    startedAt: tstz('started_at').notNull().defaultNow(),
    /** Null means abandoned; the end screen's numbers only exist for a completed run. */
    completedAt: tstz('completed_at'),
  },
  t => [check('review_session_size', sql`${t.size} > 0 AND ${t.size} <= 200`)],
)

/**
 * `04` §7.7 — the snapshot's membership, and the *progress rail*'s length.
 *
 * **This is what "the snapshot wins" means** (PRD §5): a note edited mid-session
 * does not change what this table already lists.
 */
export const reviewSessionCard = pgTable(
  'review_session_card',
  {
    reviewSessionId: uuid('review_session_id')
      .notNull()
      // Membership without a session is nothing — `04` §9.
      .references(() => reviewSession.id, { onDelete: 'cascade' }),
    /** 0-based position in the rail. */
    ordinal: integer('ordinal').notNull(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'restrict' }),
    ownerId: ownerId(),
  },
  t => [
    primaryKey({ columns: [t.reviewSessionId, t.ordinal] }),
    // A card appears once. That constraint is ADR 0016's *no same-day
    // relearning* expressed in the schema: with `enable_short_term` off, a
    // graded card leaves the session, so twenty cards is twenty answers and the
    // rail knows its own length.
    unique('review_session_card_session_card_key').on(t.reviewSessionId, t.cardId),
    // "Is this card in the live session?"
    index('review_session_card_card_idx').on(t.cardId),
  ],
)

/**
 * `04` §7.5 — **the one thing in the system that cannot be regenerated**
 * (ADR 0011, `03` §13.6). Stored from day one because it is what an optimiser
 * consumes later and it cannot be reconstructed (verification §1.2).
 *
 * ⚠️ **Append-only, enforced twice.** The application never issues `UPDATE` or
 * `DELETE` against it, and a `BEFORE UPDATE OR DELETE` trigger raises. **That
 * trigger is the only one in the schema** and it ships as a raw SQL migration —
 * see `server/db/migrations/`. It is here rather than anywhere else because
 * ADR 0011's pattern — pin the irreplaceable data and guard it in more than one
 * place — names exactly one thing as irreplaceable.
 *
 * ⚠️ **No `elapsed_days` and no `last_elapsed_days`**, both deprecated
 * (verification §1.2). Elapsed days for a review is the gap to the previous
 * `review_log` row in the same epoch, ordered by `reviewed_at`.
 */
export const reviewLog = pgTable(
  'review_log',
  {
    id: primaryId(),
    /** **The irreplaceable thing** — `04` §9. */
    cardId: uuid('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'restrict' }),
    schedulingEpochId: uuid('scheduling_epoch_id')
      .notNull()
      .references(() => schedulingEpoch.id, { onDelete: 'restrict' }),
    ownerId: ownerId(),
    /** The grade outlives its session — `04` §9. */
    reviewSessionId: uuid('review_session_id').references(() => reviewSession.id, {
      onDelete: 'set null',
    }),
    /**
     * ⚠️ **`Manual = 0` is excluded**, matching `ts-fsrs`'s own `Grade` type
     * (verification §1.1) — and `5` has never been a rating.
     */
    rating: smallint('rating').notNull(),
    /** The state *before* the grade. */
    state: smallint('state').notNull(),
    due: tstz('due').notNull(),
    stability: doublePrecision('stability').notNull(),
    difficulty: doublePrecision('difficulty').notNull(),
    scheduledDays: integer('scheduled_days').notNull(),
    learningSteps: integer('learning_steps').notNull(),
    /**
     * **`ts-fsrs`'s `review` — the client's stamp, the moment the grade was
     * given.** ADR 0007: the scheduler must see that moment, or a card answered
     * underground at 09:00 and flushed at 18:00 tells FSRS that recall took nine
     * hours.
     */
    reviewedAt: tstz('reviewed_at').notNull(),
    /**
     * The server's clock, at replay. `03` §12 requires *time-to-first-review* to
     * be measured with the submit instant and the first grade instant **on the
     * same clock**, and a client stamp is not on the server's.
     *
     * ⚠️ **The two timestamps are not redundant**: `reviewed_at` feeds the
     * scheduler and `received_at` feeds the metric, and neither column can do
     * the other's job.
     */
    receivedAt: tstz('received_at').notNull().defaultNow(),
    /** `received_at - reviewed_at` at replay. Diagnostic for the replay rejection rule. */
    clockSkewSeconds: integer('clock_skew_seconds'),
  },
  t => [
    check('review_log_rating', sql`${t.rating} BETWEEN 1 AND 4`),
    // Per-card history, the export, and the previous-review lookup that derives
    // elapsed days. ⚠️ No index on `card_id` alone: every access is per epoch and
    // ordered by time, which this composite already covers (`04` §11.1).
    index('review_log_epoch_reviewed_idx').on(t.schedulingEpochId, t.reviewedAt),
    // *Time-to-first-review*, on the server clock.
    index('review_log_owner_received_idx').on(t.ownerId, t.receivedAt),
  ],
)

/**
 * `04` §7.8 — `S9`: one action during review that suspends the card, returns the
 * note to the queue flagged, and records the flag against the note's source and
 * prompt version.
 *
 * ⚠️ **`prompt_version` and `model_id` are copied here rather than joined.**
 * ADR 0004 says the third part is the one that matters: without it you learn
 * "some cards are bad" instead of "prompt v3 writes bad example sentences", and
 * only the second is actionable. A join through `note_field_provenance` would
 * answer the same question **until a note is re-generated**, at which point the
 * provenance describes the new version and the flag would silently start blaming
 * the wrong prompt. Denormalising is what makes the fact survive the thing it is
 * a fact about.
 *
 * **`false-accept rate` is `count(card_flag) / count(note_vetting WHERE
 * state='accepted')`.** No metrics table exists (`04` §13).
 */
export const cardFlag = pgTable(
  'card_flag',
  {
    id: primaryId(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'restrict' }),
    noteId: uuid('note_id')
      .notNull()
      .references(() => note.id, { onDelete: 'restrict' }),
    ownerId: ownerId(),
    /**
     * Nullable and `SET NULL` so a hard delete does not erase the signal — the
     * actionable half, prompt version and model id, is denormalised and survives
     * (`04` §9).
     */
    sourceId: uuid('source_id').references(() => source.id, { onDelete: 'set null' }),
    /** **Denormalised on purpose** — resolved at flag time. */
    promptVersion: text('prompt_version'),
    /** Denormalised, same reason. */
    modelId: text('model_id'),
    reviewSessionId: uuid('review_session_id').references(() => reviewSession.id, {
      onDelete: 'set null',
    }),
    flaggedAt: tstz('flagged_at').notNull().defaultNow(),
    /** Set when the note is re-vetted. */
    resolvedAt: tstz('resolved_at'),
  },
  t => [
    // ADR 0004's actionable query.
    index('card_flag_source_prompt_idx').on(t.sourceId, t.promptVersion),
    // The flagged notes waiting in the *Vet* queue.
    index('card_flag_unresolved_note_idx')
      .on(t.noteId)
      .where(sql`${t.resolvedAt} is null`),
  ],
)
