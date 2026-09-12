// `03` §8.2's *grade* validator — the rules for a stamp the server cannot trust.
//
// ⚠️ **This is the seam `11` §8 names**, and it is a pure function for the
// reason the whole list is: reachable only through the endpoint, a wrong bound
// here reads as a *grade* that mysteriously did not land, months after the
// laptop that produced it was fixed.
//
// ⚠️ **Both bounds are a client stamp against a server one**, which is why the
// allowance applies to both — see `shared/review/stamp.ts`.

import { describe, expect, it } from 'vitest'

import { SKEW_ALLOWANCE_SECONDS, checkStamp } from '../../shared/review/stamp'

const SNAPSHOT = new Date('2026-09-12T09:00:00.000Z')
const RECEIVED = new Date('2026-09-12T09:10:00.000Z')

const at = (offsetSeconds: number, from: Date) => new Date(from.getTime() + offsetSeconds * 1000)

const check = (reviewedAt: Date) =>
  checkStamp(reviewedAt, { snapshotTakenAt: SNAPSHOT, receivedAt: RECEIVED })

describe('the ordinary case — everything between the bounds is taken as given', () => {
  it('accepts a grade given inside the run', () => {
    expect(check(at(120, SNAPSHOT))).toBeNull()
  })

  // ⚠️ **A *session* answered underground and flushed hours later is the story**
  // (`S8`). A stamp far in the past is not suspicious; it is the feature.
  it('accepts a grade flushed nine hours after it was given', () => {
    const late = new Date('2026-09-12T18:00:00.000Z')

    expect(checkStamp(at(60, SNAPSHOT), { snapshotTakenAt: SNAPSHOT, receivedAt: late })).toBeNull()
  })
})

describe('a stamp in the future (`03` §8.2)', () => {
  it('refuses a clock running an hour fast', () => {
    expect(check(at(3600, RECEIVED))).toBe('stamped_in_future')
  })

  it('absorbs a clock inside the allowance', () => {
    expect(check(at(SKEW_ALLOWANCE_SECONDS - 1, RECEIVED))).toBeNull()
  })

  it('refuses one step beyond it', () => {
    expect(check(at(SKEW_ALLOWANCE_SECONDS + 1, RECEIVED))).toBe('stamped_in_future')
  })
})

describe('a stamp from before the run existed (`03` §8.2)', () => {
  it('refuses a grade stamped before its own snapshot was taken', () => {
    expect(check(at(-3600, SNAPSHOT))).toBe('stamped_before_snapshot')
  })

  // ⚠️ The assertion the symmetry exists for: a reader three seconds slow
  // answers the first *card* of the run before `snapshot_taken_at`, and a strict
  // rule would refuse the opening *grade* of every *session* on that laptop.
  it('absorbs a slightly slow clock on the first card of a run', () => {
    expect(check(at(-3, SNAPSHOT))).toBeNull()
  })

  it('refuses one step beyond the allowance', () => {
    expect(check(at(-(SKEW_ALLOWANCE_SECONDS + 1), SNAPSHOT))).toBe('stamped_before_snapshot')
  })
})

// ⚠️ A clock wrong in both directions at once is impossible, but the order of
// the two tests is not arbitrary: a stamp in the future is the one that corrupts
// the scheduler, so it is the reason reported.
describe('the two rules together', () => {
  it('reports the future when a snapshot is somehow later than the receipt', () => {
    const refusal = checkStamp(new Date('2027-01-01T00:00:00.000Z'), {
      snapshotTakenAt: new Date('2027-06-01T00:00:00.000Z'),
      receivedAt: RECEIVED,
    })

    expect(refusal).toBe('stamped_in_future')
  })
})
