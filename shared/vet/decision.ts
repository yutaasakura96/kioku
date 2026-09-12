/**
 * What `POST /api/vet/decision` will accept — the seam between a keystroke and a
 * row (`11` §8).
 *
 * A *mode* has a client, so this is the first request in the application that
 * arrives as JSON from JavaScript this project wrote. That changes nothing about
 * how much of it is trusted: `03` §2.3's rule is that a typed column validates
 * nothing at runtime, and the client that sends this is a file anybody can read.
 *
 * Two of the rules here are the ones worth stating out loud.
 *
 * ⚠️ **An edit reaches the *judgement fields* and nothing else** (`10` §4.4).
 * The *term* and the *reading* are the two halves of ADR 0006's *identity key*,
 * so editing either would change which *note* this is; a *level* is a claim that
 * needs an *authority* behind it (ADR 0005), so editing one would manufacture a
 * claim with nothing behind it. Neither is an edit — both are a different
 * feature — and the refusal belongs here rather than in the component that
 * happens not to draw a box around them.
 *
 * ⚠️ **The decision never fails on its own metric.** `seconds_to_vet` is
 * `numeric(6,2)`; a client that sent `Infinity`, a negative number or 40000
 * would otherwise take the *vetting decision* down with it. `S3`'s stamp is a
 * measurement *of* the keystroke and is worth less than the keystroke — so a
 * value that is not a finite, non-negative number is recorded as **unmeasured**,
 * and one too large for the column is clamped to it.
 */

import { BLANK } from '../subject/validate'
import { isUuid } from '../utils/uuid'
import { judgementFieldNames } from '../subject/declaration'
import type { SubjectDeclaration } from '../subject/declaration'

/** `numeric(6,2)`'s largest value — `04` §7.2. */
export const MAX_SECONDS_TO_VET = 9999.99

/** ⚠️ **Two, not three.** There is no provisional state (ADR 0004). */
export const VET_ACTIONS = ['accept', 'reject'] as const

export type VetDecisionAction = (typeof VET_ACTIONS)[number]

export interface VetDecision {
  noteId: string
  action: VetDecisionAction
  /** `null` means unmeasured, which is what the nullable column is for. */
  secondsToVet: number | null
  /**
   * ⚠️ **`null` and `{}` are different**, and `S6` is why. `null` is a *note*
   * accepted as it stands; `{}` is the reader opening the edit, changing nothing
   * and pressing `Enter`, which `09` §4.3 still counts as an edit because the
   * commit is what sets `note_vetting.edited` rather than the diff. **Which
   * fields get `human` provenance is decided separately, by what actually
   * changed** (ADR 0048) — an unchanged value was still produced by the model.
   */
  edits: Record<string, string> | null
}

export type DecisionErrorCode
  = | 'not_an_object'
    | 'bad_note_id'
    | 'bad_action'
    | 'bad_edits'
    | 'unknown_field'
    | 'not_editable'
    | 'bad_value'

export type DecisionResult
  = | { ok: true, decision: VetDecision }
    | { ok: false, code: DecisionErrorCode }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `numeric(6,2)`, or nothing. It is never an error — see the header.
 */
function secondsToVet(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return null

  return Math.min(Math.round(value * 100) / 100, MAX_SECONDS_TO_VET)
}

export function parseDecision(body: unknown, declaration: SubjectDeclaration): DecisionResult {
  if (!isRecord(body))
    return { ok: false, code: 'not_an_object' }

  const { noteId, action, edits } = body

  if (!isUuid(noteId))
    return { ok: false, code: 'bad_note_id' }

  if (typeof action !== 'string' || !(VET_ACTIONS as readonly string[]).includes(action))
    return { ok: false, code: 'bad_action' }

  const decision: VetDecision = {
    noteId,
    action: action as VetDecisionAction,
    secondsToVet: secondsToVet(body.secondsToVet),
    edits: null,
  }

  if (edits === undefined || edits === null)
    return { ok: true, decision }

  // ⚠️ `09` §4.3's `Enter` commits **and accepts**, so there is no path through
  // the interface that edits and then declines. A request carrying both is not a
  // reader; it is a client that has been edited.
  if (!isRecord(edits) || decision.action !== 'accept')
    return { ok: false, code: 'bad_edits' }

  const editable = new Set(judgementFieldNames(declaration))
  const declared = new Set(declaration.fields.map(field => field.name))

  for (const [name, value] of Object.entries(edits)) {
    if (!declared.has(name))
      return { ok: false, code: 'unknown_field' }

    if (!editable.has(name))
      return { ok: false, code: 'not_editable' }

    // Every *judgement field* in the declaration is required, and a required
    // field that is blank is the `empty` the generation boundary already refuses
    // (`shared/subject/validate.ts`). Blankness is spelled out there because
    // `trim()` and `str.strip()` do not agree; this reads the same class.
    if (typeof value !== 'string' || BLANK.test(value))
      return { ok: false, code: 'bad_value' }
  }

  return { ok: true, decision: { ...decision, edits: edits as Record<string, string> } }
}
