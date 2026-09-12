/**
 * One keystroke, one transaction — `S3`'s accept, reject and accept-with-edit.
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

import { and, eq, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import { jlptVocab } from '../../../shared/subject/declaration'
import { openOrStartRun } from './run'
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
    // ⚠️ **`state = 'pending'` is in the `WHERE`, not asserted afterwards.** It
    // is what makes a second keystroke on a *note* already decided — a held key,
    // a stale tab, a client that got ahead of itself — answer "not pending"
    // instead of stamping a second `seconds_to_vet` over the first.
    const [current] = await tx
      .select({
        noteId: schema.note.id,
        subjectId: schema.note.subjectId,
        fields: schema.note.fields,
        edited: schema.noteVetting.edited,
      })
      .from(schema.noteVetting)
      .innerJoin(schema.note, eq(schema.note.id, schema.noteVetting.noteId))
      .where(
        and(
          eq(schema.noteVetting.noteId, decision.noteId),
          eq(schema.noteVetting.ownerId, ownerId),
          eq(schema.noteVetting.state, 'pending'),
        ),
      )
      .limit(1)

    if (!current)
      return { ok: false, reason: 'not_pending' }

    const declaration = declarationFor(current.subjectId)
    if (!declaration)
      return { ok: false, reason: 'unknown_subject' }

    if (decision.edits) {
      const applied = await applyEdit(
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
      if (!applied)
        return { ok: false, reason: 'frozen' }
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

    if (decision.action === 'accept')
      await mint(tx, ownerId, current.noteId, declaration)

    return { ok: true }
  })
}

/**
 * ⚠️ **One *card* per declared template** (`04` §7.3's `UNIQUE (owner_id,
 * note_id, template_key)`). v1 declares exactly one, so this writes one row —
 * and the day a second template is declared, accepting a *note* mints both
 * without anybody remembering to come back here.
 *
 * `ON CONFLICT DO NOTHING` because `Z` and a re-acceptance are a legal
 * round trip (ADR 0033), and the second acceptance must not fail on the *card*
 * the first one minted if the delete was ever refused.
 */
async function mint(
  tx: IngestDatabase,
  ownerId: string,
  noteId: string,
  declaration: SubjectDeclaration,
): Promise<void> {
  await tx
    .insert(schema.card)
    .values(declaration.templates.map(template => ({
      noteId,
      ownerId,
      templateKey: template.key,
    })))
    .onConflictDoNothing()
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
 * @returns `false` when the freeze refused the write. Committing nothing is
 * already true of an edit that changed nothing, which returns `true`: there was
 * no write to refuse.
 */
async function applyEdit(
  tx: IngestDatabase,
  noteId: string,
  fields: Record<string, string>,
  edits: Record<string, string>,
): Promise<boolean> {
  const changed = Object.entries(edits).filter(([name, value]) => fields[name] !== value)

  if (changed.length === 0)
    return true

  const written = await writeNoteFields(tx, noteId, { ...fields, ...Object.fromEntries(changed) })

  if (!written)
    return false

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

  return true
}
