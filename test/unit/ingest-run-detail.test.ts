import { describe, expect, it } from 'vitest'

import { type RunFacts, runDetail } from '../../shared/ingest/run-detail'

// `10` §6.2's run-row detail table, and `09` §7's flow behind it. The whole
// point of this seam is the sentence `09` §7 spends four paragraphs on:
//
//   **Ingest reports what the job table knows and does not diagnose a dead
//   worker.** `job.heartbeat_at` is refreshed every 30 seconds *while working*
//   (`04` §6.4), so an idle worker looks exactly like an absent one. There is no
//   liveness signal in the schema and `09` §7 declines to invent one.
//
// So "queued for four minutes, not yet picked up" is the actionable sentence and
// "the worker is down" would be a guess dressed as a status. A function is the
// right place for that rule because it is the place a future session will reach
// to add the guess.

const NOW = new Date('2026-09-10T09:16:00Z')

function facts(overrides: Partial<RunFacts> = {}): RunFacts {
  return {
    status: 'queued',
    submittedAt: new Date('2026-09-10T09:12:00Z'),
    claimedAt: null,
    totalChunks: 31,
    completeChunks: 0,
    failedChunks: 0,
    notesProduced: 0,
    ...overrides,
  }
}

describe('queued', () => {
  it('says how long, and that nothing has picked it up — `09` §7', () => {
    expect(runDetail(facts(), NOW)).toBe('queued 4m, not yet picked up')
  })

  it('says seconds under a minute, because the first look is usually immediate', () => {
    const submittedAt = new Date('2026-09-10T09:15:48Z')
    expect(runDetail(facts({ submittedAt }), NOW)).toBe('queued 12s, not yet picked up')
  })

  it('says hours and minutes once it has been a while', () => {
    const submittedAt = new Date('2026-09-10T06:04:00Z')
    expect(runDetail(facts({ submittedAt }), NOW)).toBe('queued 3h 12m, not yet picked up')
  })

  it('⚠️ never diagnoses a dead worker, however long it has been', () => {
    const submittedAt = new Date('2026-09-08T09:12:00Z')
    const detail = runDetail(facts({ submittedAt }), NOW)

    expect(detail).toBe('queued 48h 4m, not yet picked up')
    expect(detail).not.toMatch(/worker|down|offline|dead|not running/i)
  })

  it('drops the "not yet" once a worker has claimed it', () => {
    const claimedAt = new Date('2026-09-10T09:15:00Z')
    expect(runDetail(facts({ claimedAt }), NOW)).toBe('queued 4m, picked up 1m ago')
  })
})

describe('running', () => {
  it('is chunks done of total — `10` §6.2', () => {
    const detail = runDetail(facts({ status: 'running', completeChunks: 12 }), NOW)
    expect(detail).toBe('12 of 31 chunks')
  })

  it('reads sensibly before the worker has finished the first chunk', () => {
    expect(runDetail(facts({ status: 'running' }), NOW)).toBe('0 of 31 chunks')
  })
})

describe('complete', () => {
  it('is the number of notes produced', () => {
    const detail = runDetail(facts({ status: 'complete', completeChunks: 31, notesProduced: 41 }), NOW)
    expect(detail).toBe('41 notes')
  })

  it('says one note in the singular, because a run of one is ordinary', () => {
    const detail = runDetail(facts({ status: 'complete', completeChunks: 31, notesProduced: 1 }), NOW)
    expect(detail).toBe('1 note')
  })

  it('⚠️ zero new notes is a success and the row says so — PRD §5', () => {
    // PRD §5: "A success, not an error, and the expected steady state as the
    // corpus grows." The tally of what each filter dropped is a separate
    // component (`10` §6.2, the *session tally*); this line must not read as a
    // failure while it sits above it.
    const detail = runDetail(facts({ status: 'complete', completeChunks: 31, notesProduced: 0 }), NOW)

    expect(detail).toBe('no new notes')
    expect(detail).not.toMatch(/fail|error|nothing found|empty/i)
  })
})

describe('incomplete', () => {
  it('⚠️ says what completed rather than what broke — `04` §6.1 calls it resumable', () => {
    const detail = runDetail(
      facts({ status: 'incomplete', completeChunks: 28, failedChunks: 3, notesProduced: 22 }),
      NOW,
    )

    expect(detail).toBe('28 of 31 chunks · 22 notes so far')
  })
})

describe('failed', () => {
  it('says how much failed', () => {
    const detail = runDetail(
      facts({ status: 'failed', completeChunks: 0, failedChunks: 31 }),
      NOW,
    )

    expect(detail).toBe('31 of 31 chunks failed')
  })

  it('⚠️ never names the provider — `03` §11', () => {
    // `03` §11's table: "Model provider erroring or rate-limiting → the same
    // incomplete state — **the provider is not named at the reader**". The run
    // row is the one place a provider name could leak onto a screen, because
    // `ingestion_chunk.last_error` is right there in the query.
    const detail = runDetail(facts({ status: 'failed', failedChunks: 31 }), NOW)

    expect(detail).not.toMatch(/anthropic|openai|claude|gpt|429|rate.?limit|provider/i)
  })
})
