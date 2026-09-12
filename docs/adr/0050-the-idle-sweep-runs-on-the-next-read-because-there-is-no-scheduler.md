# The idle sweep runs on the next read, because there is no scheduler

**`04` §7.1's 30-minute idle sweep runs at the top of every *Vet* read and before every decision,
against the reader whose request it is. It is not a cron job, a timer or a worker task, and there is
nowhere in this deployment it could be one.**

`04` §7.1 gives `vetting_session.ended_at` three writers — `Esc`, the Done control, and a 30-minute
idle sweep. ADR 0033 leans on the third one hard: "The idle sweep cannot be asked, so the legend has
to carry the horizon anyway." #10 built the first two and found that the third had no home.

## There is no scheduler, and the two obvious ones are both closed

**Vercel Cron is forbidden.** [ADR 0022](0022-vercel-neon-and-a-local-worker-until-the-numbers-say-otherwise.md)'s
whole premise is that the move to EC2 or Lightsail stays a Nitro preset change plus a `pg_dump`, and
`CLAUDE.md` states it as a hard constraint: nothing may depend on a Vercel-only feature — no KV, no
Blob, **no Cron**.

**The worker is the wrong process.** `worker/` claims `job` rows and runs the *ingestion* pipeline
over **shared** entities. `vetting_session` is personal (`04` §4, §7), and a sweep there would be the
first time the worker touched a reader's own data — for a reason unrelated to any job it was given.
It would also have to be running, and ADR 0022 makes it a laptop: a reader who closes the laptop and
opens the browser somewhere else would get no sweep at all, which is the case the sweep exists for.

## So it runs where somebody is already looking

`sweepIdleRuns` is one `UPDATE`, run on the *Vet* read and inside the decision transaction. Idleness
is measured from the **last decision** in the run, falling back to `started_at` when it has none —
not from `started_at` alone, or a run longer than half an hour would end underneath a reader who was
still working.

⚠️ **What that costs is a lag, and it is stated rather than hidden.** A run abandoned by a reader who
never comes back stays open until somebody looks. So a *rejection* inside it stays reversible while
nobody is asking — and becomes permanent the instant anybody does. Nothing observable differs from a
real sweep except *when the row is written*, and the reader's experience is identical: ADR 0033's
story is already "a reader who walks away comes back to a run that ended without them, with the undo
spent and no dialog anywhere in the story".

⚠️ **It is not a lock on anything.** Two requests sweeping at once both issue the same conditional
`UPDATE` and the second matches nothing. The run either was idle or was not.

## The one case this is genuinely weaker on

A *rejection* is reversible for as long as the row stays open, so a second device signing in an hour
later — before any read has swept — could still `Z` it. In v1 that is one reader with one laptop and
a worker on the same machine (ADR 0022), so the window is theoretical. It stops being theoretical the
day this is deployed for more than one person, and that is the revisit condition.

## Alternatives considered

**A timer in the Nitro server.** Rejected on ADR 0022 again: a serverless deployment has no process
to hold a timer, and writing one would work in development and silently do nothing in production —
the worst available failure shape.

**Ending the run when the *mode* is entered.** Tempting, and wrong: it makes entering *Vet* twice in
a minute end a run the reader is in the middle of, and PRD §5's "leaving mid-queue loses nothing"
covers leaving *and coming back*.

**`ended_at` set to the idle instant rather than to `now()`.** Genuinely arguable — it would make the
column mean "when the keyboard run stopped" rather than "when we noticed". Rejected because a sweep
is an event, `04` §7.1's example reads `ended_at` as when the run was ended, and a timestamp in the
past written by a statement running now is the kind of thing that is true once and confusing
thereafter.

**Not building it at all, and letting Done and `Esc` be the only writers.** Rejected: an abandoned
run never closes, so a *rejection* made months ago stays reversible for ever and `CONTEXT.md`'s
definition of *rejected* — reversible only within the session that declined it — stops being true of
the data.

## Revisit if

Kioku runs for more than one reader, or the worker gains any task that is not an *ingestion* — at
which point the sweep is one query on a schedule and this decision is a paragraph in its history.
