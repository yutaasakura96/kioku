/**
 * One keystroke, one transaction — `S3`'s accept, reject and accept-with-edit,
 * and since #20 the flag queue's **keep, drop and fix** (ADR 0064 §3).
 *
 * ⚠️ **The keystrokes did not move and neither did the wire** (ADR 0064 §6).
 * `space` is `accept`, `R` is `reject`, `Enter` out of an edit is `accept` with
 * edits — and what they mean is decided by the row the keystroke lands on. A
 * *pending* *note* is decided exactly as it always was: acceptance mints. An
 * *accepted* *note* whose *card* carries an open flag is resolved: keep
 * unsuspends, fix edits and unsuspends, drop leaves the *card* suspended and
 * writes the *note* `rejected`. **All three resolve every open flag on the
 * *note*.** The *Vet* queue only offers the second kind; the first is still
 * reachable by a stale client, and it is the path `Z`'s un-mint belongs to.
 *
 * ⚠️ **Acceptance mints the *card*, and minting is what acceptance means**
 * (`04` §7.3, "minted at acceptance, never before"). The two writes are in one
 * transaction because ADR 0033's undo is a query against the pair: an accepted
 * *note* with no *card* is a reader who owes a review that will never be
 * offered, and a *card* whose *note* is still pending is a review of something
 * nobody agreed to.
 *
 * ⚠️ **What acceptance does *not* mint is a *scheduling epoch*, and that is
 * forced rather than chosen.** `scheduling_epoch.card_id` is `RESTRICT` (`04`
 * §9), so an epoch written here would make `Z` fail on **every** acceptance —
 * the database would refuse the delete and ADR 0033's undo would be dead on
 * arrival. ADR 0033 says as much in its own words: the card it deletes is "a
 * card with no `review_log` and no `scheduling_epoch`". The epoch belongs to the
 * *session* that first schedules the *card*, which is #12's.
 *
 * ⚠️ **Minting is `mint_cards`, a database function** (ADR 0067), because the
 * worker mints too since ADR 0064 and #20's criterion is that the path is
 * reused rather than copied. This file no longer spells the `INSERT`.
 *
 * ⚠️ **A fix to a *memory-bearing field* resets the *card*** (`04` §7.4,
 * ADR 0064 §5) — the application's first *scheduling epoch* reset, in
 * `server/utils/review/epoch.ts`. An edit that changes nothing memory-bearing
 * leaves the history standing.
 *
 * ⚠️ **An edit writes `human` provenance for the fields that actually changed,
 * and for no others** (ADR 0048: `kind` records the mechanism that produced the
 * value). `09` §4.3 sets `note_vetting.edited` on the **commit**, so a reader who
 * opens the edit, changes nothing and presses `Enter` has edited the *note* for
 * `S6`'s purposes — but the values are still the model's, and stamping them
 * `human` would take ADR 0018's instrument away one *note* at a time.
 *
 * ⚠️ **`edited` never goes back to `false`.** ADR 0033's `Z` returns the *note*
 * to *pending* and the edit stays in `note.fields`, so a later plain acceptance
 * of a *note* the reader had to fix is still a *note* the reader had to fix —
 * which is exactly what `S6` counts.
 */

import { and, eq, isNull, or, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { jlptVocab, memoryBearingFieldNames } from '../../../shared/subject/declaration'
import { openFlagFor } from './queries'
import { openOrStartRun } from './run'
import { resetForMemoryBearingChange } from '../review/epoch'
import { writeNoteFields } from '../note/fields'
import type { IngestDatabase } from '../ingest/record'
import type { SubjectDeclaration } from '../../../shared/subject/declaration'
import type { VetDecision } from '../../../shared/vet/decision'

export type DecideOutcome
  = | { ok: true }
    | { ok: false, reason: 'not_pending' | 'unknown_subject' | 'frozen' }

/**
 * The one *subject* v1 ships.
 *
 * ⚠️ A *note* naming a subject this build has no declaration for is refused
 * rather than guessed at: `card.template_key` is a key into the declaration and
 * is deliberately not a foreign key (`04` §13), so a wrong one is a *card* that
 * renders nothing and nothing that says so.
 */
function declarationFor(subjectId: string): SubjectDeclaration | null {
  return subjectId === jlptVocab.subject_id ? jlptVocab : null
}

export async function decide(
  db: IngestDatabase,
  ownerId: string,
  decision: VetDecision,
): Promise<DecideOutcome> {
  return db.transaction(async (tx): Promise<DecideOutcome> => {
    // ⚠️ **What is decidable is in the `WHERE`, not asserted afterwards.** It
    // is what makes a second keystroke on a *note* already decided — a held key,
    // a stale tab, a client that got ahead of itself — answer "not pending"
    // instead of stamping a second `seconds_to_vet` over the first. A resolved
    // flag is decided in exactly that sense: the *note* is accepted with no open
    // flag, and it matches neither half.
    const [current] = await tx
      .select({
        noteId: schema.note.id,
        subjectId: schema.note.subjectId,
        fields: schema.note.fields,
        edited: schema.noteVetting.edited,
        state: schema.noteVetting.state,
      })
      .from(schema.noteVetting)
      .innerJoin(schema.note, eq(schema.note.id, schema.noteVetting.noteId))
      .where(
        and(
          eq(schema.noteVetting.noteId, decision.noteId),
          eq(schema.noteVetting.ownerId, ownerId),
          or(
            eq(schema.noteVetting.state, 'pending'),
            and(eq(schema.noteVetting.state, 'accepted'), openFlagFor(tx, ownerId)),
          ),
        ),
      )
      .limit(1)

    if (!current)
      return { ok: false, reason: 'not_pending' }

    const declaration = declarationFor(current.subjectId)
    if (!declaration)
      return { ok: false, reason: 'unknown_subject' }

    const resolving = current.state === 'accepted'

    if (decision.edits) {
      const changed = await applyEdit(
        tx,
        current.noteId,
        current.fields as Record<string, string>,
        decision.edits,
      )

      // ⚠️ **Nothing is decided when the edit is refused**, and this returns
      // before the first of the other writes rather than rolling them back. An
      // acceptance that quietly dropped the correction would be an acceptance
      // of the value the reader had just said was wrong — which is the failure
      // `S6` exists to prevent, arriving as a success.
      if (!changed)
        return { ok: false, reason: 'frozen' }

      const memoryBearing = new Set(memoryBearingFieldNames(declaration))
      if (changed.some(name => memoryBearing.has(name)))
        await resetForMemoryBearingChange(tx, current.noteId)
    }

    const runId = await openOrStartRun(tx, ownerId)

    await tx
      .update(schema.noteVetting)
      .set({
        state: decision.action === 'accept' ? 'accepted' : 'rejected',
        edited: current.edited || decision.edits !== null,
        secondsToVet: decision.secondsToVet === null ? null : String(decision.secondsToVet),
        vettingSessionId: runId,
        vettedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.noteVetting.noteId, decision.noteId),
          eq(schema.noteVetting.ownerId, ownerId),
        ),
      )

    if (resolving)
      await resolveFlags(tx, ownerId, current.noteId, decision.action === 'accept')
    else if (decision.action === 'accept')
      await mint(tx, ownerId, current.noteId, declaration)

    return { ok: true }
  })
}

/**
 * ADR 0064 §3's three resolutions, after the *note* row has been written.
 *
 * ⚠️ **`resolved_at` is `now()`, and `now()` is the transaction's instant** —
 * the same one the `note_vetting.vetted_at` beside it was stamped with. That
 * equality is what `Z` reads to find the flags this keystroke resolved
 * (`server/utils/vet/undo.ts`), so both writes must stay in one transaction and
 * both must say `now()` rather than a client or application clock.
 *
 * ⚠️ **Only a `flagged` suspension is lifted.** `S11`'s `source_deleted` is a
 * different reason with a different way back, and `flag.ts` already refuses to
 * overwrite it.
 */
async function resolveFlags(
  tx: IngestDatabase,
  ownerId: string,
  noteId: string,
  unsuspend: boolean,
): Promise<void> {
  await tx
    .update(schema.cardFlag)
    .set({ resolvedAt: sql`now()` })
    .where(
      and(
        eq(schema.cardFlag.noteId, noteId),
        eq(schema.cardFlag.ownerId, ownerId),
        isNull(schema.cardFlag.resolvedAt),
      ),
    )

  if (!unsuspend)
    return

  await tx
    .update(schema.card)
    .set({ suspendedAt: null, suspendedReason: null })
    .where(
      and(
        eq(schema.card.noteId, noteId),
        eq(schema.card.ownerId, ownerId),
        eq(schema.card.suspendedReason, 'flagged'),
      ),
    )
}

/**
 * ⚠️ **One *card* per declared template** (`04` §7.3's `UNIQUE (owner_id,
 * note_id, template_key)`). v1 declares exactly one, so this writes one row —
 * and the day a second template is declared, accepting a *note* mints both
 * without anybody remembering to come back here.
 *
 * `mint_cards`' `ON CONFLICT DO NOTHING` is there because `Z` and a
 * re-acceptance are a legal round trip (ADR 0033), and the second acceptance
 * must not fail on the *card* the first one minted if the delete was ever
 * refused.
 *
 * ⚠️ **The template keys are an `ARRAY[…]` of parameters, not one parameter.**
 * Drizzle's `sql` template expands a JS array into a comma-separated list, so
 * handing it the array directly would call the function with one argument per
 * template.
 */
async function mint(
  tx: IngestDatabase,
  ownerId: string,
  noteId: string,
  declaration: SubjectDeclaration,
): Promise<void> {
  const keys = sql.join(declaration.templates.map(template => sql`${template.key}`), sql`, `)

  await tx.execute(sql`SELECT mint_cards(${noteId}::uuid, ${ownerId}, ARRAY[${keys}]::text[])`)
}

/**
 * `S6` — the reader fixes a *note* before accepting it.
 *
 * ⚠️ **`note` is a *shared* entity** (`04` §4), so this writes to the corpus
 * rather than to anything personal. That is ADR 0006's own shape: a *note*'s
 * fields are written once and frozen at acceptance, and a later *source* that
 * implies something different appends an *occurrence* rather than rewriting. The
 * edit is the last write before the freeze, which is the only window in which
 * changing them is not a rewrite — and `writeNoteFields` is what makes *the only
 * window* a guard rather than a description.
 *
 * @returns the names of the fields that changed, or `null` when the freeze
 * refused the write. Committing nothing is already true of an edit that changed
 * nothing, which returns `[]`: there was no write to refuse.
 */
async function applyEdit(
  tx: IngestDatabase,
  noteId: string,
  fields: Record<string, string>,
  edits: Record<string, string>,
): Promise<string[] | null> {
  const changed = Object.entries(edits).filter(([name, value]) => fields[name] !== value)

  if (changed.length === 0)
    return []

  const written = await writeNoteFields(tx, noteId, { ...fields, ...Object.fromEntries(changed) })

  if (!written)
    return null

  await tx
    .insert(schema.noteFieldProvenance)
    .values(changed.map(([fieldName]) => ({
      noteId,
      fieldName,
      // ADR 0048's fourth value, and the first thing in the repository to write
      // it. `human` carries neither a `model_id` nor a `dictionary_version` —
      // there is no authority behind it and no tokeniser involved.
      kind: 'human',
    })))
    .onConflictDoUpdate({
      target: [schema.noteFieldProvenance.noteId, schema.noteFieldProvenance.fieldName],
      set: {
        kind: 'human',
        modelId: null,
        promptVersion: null,
        dictionaryVersion: null,
        isOov: null,
        createdAt: sql`now()`,
      },
    })

  return changed.map(([name]) => name)
}
