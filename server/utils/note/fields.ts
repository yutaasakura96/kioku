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
 * ⚠️ **A rejection freezes nothing.** ADR 0012: a rejection is a claim about the
 * reader, not about the word. Nobody has confirmed the fields, so there is
 * nothing here to protect.
 *
 * ⚠️ **Not a trigger, deliberately.** `04` §7.5 has exactly one trigger and says
 * so — ADR 0011's *pin the irreplaceable data and guard it in more than one
 * place* names `review_log` and nothing else. The second half of this rule is in
 * the worker, where `pipeline/write_pending.py`'s `ON CONFLICT DO NOTHING`
 * makes a re-ingestion append an *occurrence* rather than an update, which is
 * ADR 0006's own sentence. Two write paths, two guards, both in the statement
 * that does the writing.
 */

import { and, eq, exists, not, sql } from 'drizzle-orm'

import * as schema from '../../db/schema'
import type { IngestDatabase } from '../ingest/record'

/**
 * Write a *note*'s fields unless some reader has accepted it.
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
    .where(and(eq(schema.note.id, noteId), not(acceptedByAnyone(tx, noteId))))
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
