<script setup lang="ts">
// `10` §6.2's run row — one per *ingestion*, above the Ingest form.
//
// ⚠️ **The detail line is `shared/ingest/run-detail.ts`, not this file**, and
// that is deliberate: the rule it holds is that **Ingest reports what the job
// table knows and does not diagnose a dead worker** (`09` §7). `job.heartbeat_at`
// only ticks while working, so an idle worker and an absent one are identical,
// and "the worker is down" would be a guess dressed as a status. A template is
// where that guess would be added; a tested function is where it is refused.
//
// ⚠️ **`incomplete` has its resume control, and #8 is the ticket that could
// honestly build it.** `10` §6.2 and `09` §7 both give that row "a resume action
// (the quiet affordance, with its arrow)". It waited through three tickets for a
// good reason each time: the control is a *write* — a second `job` at
// `kind = 'resume'` (`04` §6.4) — and what resuming *means* is `04` §6.2's
// `WHERE ingestion_id = $1 AND status <> 'complete'`, which is the worker's
// query. #6 had no such query; #7 had the query and no *chunk processor*, so a
// resume re-settled the run and changed nothing a reader would see. **#8 has the
// stages**, so the chunks that did not complete are re-run and the number in the
// line beside this control moves.
//
// ⚠️ **It is a form, not a link.** A `GET` that writes a job would be actioned
// by a prefetch, a crawler or a back button; there is no JavaScript here to
// intercept anything (ADR 0020), so the method is the whole of the protection.
// `server/middleware/submit-resume.ts` answers it with a `303`.
//
// ⚠️ **The filter tally is the zero-new-*notes* case and it is a success**
// (PRD §5, `09` §4.5). It is `05` §7's *session tally* component, one column per
// stage, with the figure dropped from 38px to 24px because it sits inside a run
// row rather than being the whole screen (`10` §6.2).

import { type RunFacts, runDetail } from '~~/shared/ingest/run-detail'

const props = defineProps<{
  run: RunFacts & {
    ingestionId: string
    sourceId: string | null
    title: string
    candidatesExtracted: number | null
    candidatesDeduplicated: number | null
    candidatesAlreadyKnown: number | null
    candidatesRejected: number | null
  }
  /** One instant for every row on the page — `09` §2. */
  now: Date
}>()

const detail = computed(() => runDetail(props.run, props.now))

/**
 * PRD §5: "the screen reports how many candidates were filtered and by which
 * filter". Shown only where it says something — a complete run that produced
 * nothing, with counts recorded.
 */
const tally = computed(() => {
  if (props.run.status !== 'complete' || props.run.notesProduced > 0)
    return null

  if (props.run.candidatesExtracted === null)
    return null

  return [
    { label: 'EXTRACTED', value: props.run.candidatesExtracted },
    { label: 'DUPLICATE', value: props.run.candidatesDeduplicated ?? 0 },
    { label: 'KNOWN', value: props.run.candidatesAlreadyKnown ?? 0 },
    { label: 'REJECTED', value: props.run.candidatesRejected ?? 0 },
  ]
})
</script>

<template>
  <li class="run">
    <p class="line">
      <!-- ⚠️ `source_id` is null once the *source* has been hard-deleted
        (`04` §6.1's `SET NULL`) and the run stays in the ledger regardless —
        `source_title` is snapshotted for exactly that. A row with nowhere to go
        renders its title as text rather than as a dead link. -->
      <NuxtLink v-if="run.sourceId" :to="`/sources/${run.sourceId}`" class="title">
        {{ run.title }}
      </NuxtLink>
      <span v-else class="title">{{ run.title }}</span>

      <span class="status">{{ run.status }}</span>
      <span class="dot" aria-hidden="true">·</span>
      <span class="detail">{{ detail }}</span>
    </p>

    <!-- `10` §6.2: *what completed, and a resume control*. The line above says
      what completed; this is the rest of the row. -->
    <form v-if="run.status === 'incomplete'" method="post" action="/" class="resume">
      <input type="hidden" name="resume" :value="run.ingestionId">
      <button type="submit" class="affordance">
        <span>Resume</span>
        <!-- ⚠️ **With its arrow**, which `05` §7 spends the accent on: this is a
          way onward, and `10` §6.2 asks for it by name. The start block is the
          one place the arrow is dropped, and that is its own decision. -->
        <span class="arrow" aria-hidden="true">→</span>
      </button>
    </form>

    <dl v-if="tally" class="tally">
      <div v-for="column in tally" :key="column.label">
        <dt>{{ column.label }}</dt>
        <dd>{{ column.value }}</dd>
      </div>
    </dl>
  </li>
</template>

<style scoped>
.run {
  padding: var(--k-space-5) 0; /* 20px */
  border-top: 1px solid var(--k-rule);
  list-style: none;
}

.line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--k-space-2);
  margin: 0;
}

a.title:hover {
  color: var(--k-accent-hover);
}

.title {
  font-size: 15px;
  font-weight: 400;
  color: var(--k-ink);
  text-decoration: none;
}

/* Mono, because `05` §4 gives Plex Mono "everything that is a number, a key, or
   a label rather than language" — and a status is a label. */
.status,
.detail {
  font-family: var(--k-face-mono);
  font-size: 12px;
}

.status {
  color: var(--k-ink-value);
}

.detail {
  color: var(--k-ink-secondary);
}

.dot {
  color: var(--k-dot);
}

/* `05` §7's quiet affordance, at the scale of a row rather than of a screen:
   the geometry is the same and the type steps down from 17px to 14px, the way
   the tally's figure steps from 38px to 24px for the same reason (`10` §6.2). */
.resume {
  margin: var(--k-space-3) 0 0;
}

.affordance {
  display: inline-flex;
  align-items: baseline;
  gap: var(--k-space-3);
  padding: 7px 14px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: inherit;
  font-size: 14px;
  color: var(--k-ink);
  cursor: pointer;
}

.affordance:hover {
  background: var(--k-key-face);
}

.affordance:focus-visible {
  outline: 2px solid var(--k-focus);
  outline-offset: 2px;
}

.arrow {
  color: var(--k-accent);
}

/* `05` §7's *session tally*: equal columns 8px apart, a 10px mono eyebrow at
   0.14em, 8px down the figure. 24px here rather than 38px — `10` §6.2. */
.tally {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--k-space-2);
  margin: var(--k-space-3) 0 0;
}

.tally dt {
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

.tally dd {
  margin: var(--k-space-2) 0 0;
  font-size: 24px;
  font-weight: 300;
  color: var(--k-ink);
}
</style>
