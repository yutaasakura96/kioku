/**
 * The one write path to `note.fields`, and the freeze `S6` asks for.
 *
 * > Once *accepted*, the *note*'s fields are frozen — a later *source* implying
 * > something different raises a flag rather than rewriting it. (`S6`, ADR 0006)
 *
 * ⚠️ **The guard is in the `WHERE`, not asserted around it.** Until #11 this
 * property was true because of who happened to be calling: `decide()` is the
 * application's only writer of `note.fields` and it refuses a *note* that is not
 * `pending`, so nothing could reach an accepted one. A property held by the
 * absence of a caller is a property that survives exactly until the next caller,
 * and the *note* is the one table in the corpus that cannot be rebuilt from a
 * re-ingestion (`04` §10) — the fields a reader confirmed are the reader's work,
 * not the pipeline's.
 *
 * ⚠️ **Not owner-scoped, and that is a decision.** `note` is *shared* and
 * `note_vetting` is *personal* (`04` §4), so a *note* pending on one reader's
 * queue can be a *note* another reader has already accepted and studied. **Any
 * acceptance freezes it**, because the fields are the thing that reader
 * confirmed and there is only one copy of them. The narrower rule — freeze only
 * against the reader who accepted — would let a second reader rewrite the first
 * reader's *cards* under them. v1 invites one reader (ADR 0012), so this branch
 * is unreachable today and is written for the day it is not.
 *
 * ⚠️ **An open flag lifts it, and nothing else does** (ADR 0052 § Amendment,
 * ADR 0064 §4). The freeze protects a review history from having its text
 * swapped underneath it; an unresolved `card_flag` on the *note*'s *card* is the
 * reader saying that text is already wrong, so the history it protects is
 * measuring something he has rejected. **The guard gains a condition and keeps
 * its clause** — a `WHERE` that dropped the `NOT EXISTS` would be a freeze that
 * lifts for any caller who remembered to flag first, and there is no such
 * caller. Like the freeze, the lift is not owner-scoped: there is one copy of
 * the fields, and the flag is the reason to change it.
 *
 * ⚠️ **A rejection freezes nothing.** ADR 0012: a rejection is a claim about the
 * reader, not about the word. Nobody has confirmed the fields, so there is
 * nothing here to protect.
 *
 * ⚠️ **Not a trigger, deliberately.** `04` §7.5 has exactly one trigger and says
 * so — ADR 0011's *pin the irreplaceable data and guard it in more than one
 * place* names `review_log` and nothing else. The second half of this rule is in
 * the worker, where `pipeline/write_notes.py`'s `ON CONFLICT DO NOTHING`
 * makes a re-ingestion append an *occurrence* rather than an update, which is
 * ADR 0006's own sentence. Two write paths, two guards, both in the statement
 * that does the writing.
 */

import { and, eq, exists, isNull, not, or, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { IngestDatabase } from '../ingest/record'

/**
 * Write a *note*'s fields unless some reader has accepted it — or unless its
 * *card* carries an open flag.
 *
 * @returns `false` when the *note* is frozen and nothing was written. The caller
 * decides what that means; it is never *written anyway*.
 */
export async function writeNoteFields(
  tx: IngestDatabase,
  noteId: string,
  fields: Record<string, string>,
): Promise<boolean> {
  const written = await tx
    .update(schema.note)
    .set({ fields })
    .where(
      and(
        eq(schema.note.id, noteId),
        or(not(acceptedByAnyone(tx, noteId)), openFlag(tx, noteId)),
      ),
    )
    .returning({ id: schema.note.id })

  return written.length > 0
}

/** `EXISTS (SELECT … FROM note_vetting …)`, as the `WHERE` reads it. */
function acceptedByAnyone(tx: IngestDatabase, noteId: string) {
  return exists(
    tx
      .select({ one: sql`1` })
      .from(schema.noteVetting)
      .where(
        and(eq(schema.noteVetting.noteId, noteId), eq(schema.noteVetting.state, 'accepted')),
      ),
  )
}

/**
 * `EXISTS (SELECT … FROM card_flag … WHERE resolved_at IS NULL)` — `04` §11's
 * partial index, `card_flag (note_id) WHERE resolved_at IS NULL`, is what
 * answers it.
 */
function openFlag(tx: IngestDatabase, noteId: string) {
  return exists(
    tx
      .select({ one: sql`1` })
      .from(schema.cardFlag)
      .where(and(eq(schema.cardFlag.noteId, noteId), isNull(schema.cardFlag.resolvedAt))),
  )
}
