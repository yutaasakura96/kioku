<script setup lang="ts">
// *Vet* — a *mode* (ADR 0013). `routeRules: { ssr: false }`, no header, no
// navigation, and exactly one way out: `Esc`, and a Done control present on
// every viewport, because a phone has no `Esc` (ADR 0026, ADR 0032).
//
// ⚠️ **The key handlers bind to the mode container, never to `document` or
// `window`** (ADR 0025, `10` §4.1). Focus lives there so keystrokes land
// somewhere and a reload restores it — and because ADR 0023's map is all
// printable characters, **SC 2.1.4 Character Key Shortcuts (Level A)** applies
// and this application conforms only through that criterion's "active only on
// focus" exception. Binding to the document is the obvious shortcut and it fails
// a Level A criterion with nothing on screen to show it. `11` §6.2's behavioural
// proxy is the test, and it lives in `test/e2e/vet.test.ts`.
//
// ⚠️ **Done performs an external document navigation** (`09` §5.2, ADR 0032,
// verification §12.1). A bare `<NuxtLink>` renders the *place* into the page that
// is already running and hands the reader a `noScripts` screen with a live Vue
// application on it, **with no error anywhere**. `test/nuxt/modes.test.ts` is the
// cover and nothing else in the system would notice.
//
// ⚠️ **The client holds no position in the queue.** Every endpoint answers with
// the whole queue and its head is the *note* on screen, so a reload lands where
// the reader was and `Z` puts a *note* back in front of them without anything
// here having to agree — ADR 0033's "the durable record decides", one step
// further than it was written for. What is local is a short list of decisions
// still in flight, so that `S3`'s next *note* paints on the keystroke rather
// than on the response.

import { confirmationAction, editAction, vetAction } from '#shared/vet/keystroke'
import { jlptVocab, judgementFieldNames } from '#shared/subject/declaration'
import { resolveOrigin } from '#shared/utils/origin'
import type { VetQueue } from '../../server/utils/vet/queries'

const route = useRoute()
const origin = computed(() => resolveOrigin(route.query.from))

/** `10` §4.5: states 2 and 3 are the only self-updating screens in the app. */
const POLL_INTERVAL = 5_000

/** `10` §4.8: below this a statement flashing is worse than quiet ground. */
const LOADING_THRESHOLD = 500

interface DecisionResponse {
  outcome: 'ok' | 'not_pending'
  queue: VetQueue
}

interface UndoResponse {
  outcome: 'ok' | 'nothing_to_undo' | 'reviewed'
  queue: VetQueue
}

const queue = ref<VetQueue | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const slow = ref(false)
const confirming = ref(false)
const message = ref<string | null>(null)

/**
 * Decisions sent but not yet reflected in a queue the server has answered with.
 *
 * ⚠️ **This is the whole of the client's optimism and it is a list, not a
 * position.** It is pruned against every answer — an entry survives only while
 * the *note* is still in the server's queue — so the counts below add exactly
 * once whether the request has landed or not.
 */
const inFlight = ref<{ noteId: string, action: 'accept' | 'reject' }[]>([])

const visible = computed(() =>
  (queue.value?.notes ?? []).filter(note => !inFlight.value.some(d => d.noteId === note.noteId)),
)

const note = computed(() => visible.value[0] ?? null)
const pending = computed(() => Math.max(0, (queue.value?.pending ?? 0) - inFlight.value.length))
const vetted = computed(() => (queue.value?.vetted ?? 0) + inFlight.value.length)
const rejections = computed(() =>
  (queue.value?.rejections ?? 0) + inFlight.value.filter(d => d.action === 'reject').length,
)
const running = computed(() => queue.value?.running ?? null)

/**
 * `10` §4.5 — ***Vet* has three empty states, not one**, and the difference
 * between the first two is the difference between leaving and waiting thirty
 * seconds (`09` §8).
 *
 * ⚠️ **State 3 is not a repeat of state 2.** `S2` promises the first *note* is
 * vettable while the rest generate, so the queue running dry mid-run is a normal
 * event rather than an ending — the reader has done work, and *nothing yet* and
 * *caught up* are different feelings about the same database.
 */
const empty = computed(() => {
  if (note.value)
    return null
  if (!running.value)
    return 'nothing' as const
  return vetted.value === 0 ? ('not-yet' as const) : ('caught-up' as const)
})

// -- The edit ---------------------------------------------------------------

const edit = ref<Record<string, string> | null>(null)
const fieldIndex = ref(0)
const noteView = useTemplateRef<{ focusField: (index: number) => void, fieldCount: () => number }>('noteView')

// -- Focus ------------------------------------------------------------------

const container = useTemplateRef<HTMLElement>('container')
const endControl = useTemplateRef<HTMLButtonElement>('endControl')

function focusContainer() {
  container.value?.focus()
}

// -- Requests ---------------------------------------------------------------

/**
 * ⚠️ **One at a time, in the order they were pressed.** A reader who holds
 * `space` sends three decisions before the first answers; letting them overlap
 * would apply the answers in whatever order they came back and rewind the queue
 * under the reader's hands.
 */
let chain: Promise<unknown> = Promise.resolve()

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work)
  chain = next.catch(() => undefined)
  return next
}

function apply(fresh: VetQueue) {
  queue.value = fresh
  inFlight.value = inFlight.value.filter(d => fresh.notes.some(note => note.noteId === d.noteId))
}

async function load() {
  try {
    apply(await $fetch<VetQueue>('/api/vet/queue'))
    inFlight.value = []
    status.value = 'ready'
  }
  catch {
    status.value = 'error'
  }
}

// -- The three outcomes -----------------------------------------------------

/**
 * `S3`'s stamp — **measured at the keystroke**, from the moment the *note*
 * rendered (`09` §3, `04` §7.2). `03` §12 wants it from day one so the median is
 * measured from the first run rather than retrofitted.
 *
 * ⚠️ `performance.now()` rather than `Date.now()`: it is monotonic, so a clock
 * correction mid-run cannot produce a negative reading.
 *
 * ⚠️ **The watch keys on the *note*'s id, never on the *note*.** `apply()`
 * installs a freshly parsed queue after every answer, so the *note* on screen
 * gets a **new object** with the same contents — and a watcher on the object
 * restarts the clock every time a response lands. The stamp would then measure
 * from the previous request's reply rather than from when the *note* rendered:
 * every reading understated by one round trip, biased **low**, on the one number
 * `S3` exists to measure. Found by review 2026-09-12, and the fix is the
 * getter.
 */
const shownAt = ref(0)

watch(() => note.value?.noteId, () => {
  shownAt.value = typeof performance === 'undefined' ? 0 : performance.now()
}, { immediate: true })

function elapsedSeconds(): number | null {
  if (typeof performance === 'undefined' || shownAt.value === 0)
    return null

  return Math.round(performance.now() - shownAt.value) / 1000
}

async function submit(action: 'accept' | 'reject', edits: Record<string, string> | null) {
  const current = note.value
  if (!current)
    return

  const secondsToVet = elapsedSeconds()

  edit.value = null
  inFlight.value = [...inFlight.value, { noteId: current.noteId, action }]
  focusContainer()

  await enqueue(async () => {
    try {
      const response = await $fetch<DecisionResponse>('/api/vet/decision', {
        method: 'POST',
        body: { noteId: current.noteId, action, secondsToVet, edits },
      })
      apply(response.queue)
    }
    catch {
      // ⚠️ The optimism is dropped by reloading rather than by rolling back:
      // what is on the screen has to agree with the database, and the database
      // is the only thing that knows whether the write landed.
      message.value = 'That keystroke did not reach the database. The queue has been reloaded.'
      await load()
    }
  })
}

function openEdit() {
  if (!note.value)
    return

  const fields = note.value.fields
  edit.value = Object.fromEntries(
    judgementFieldNames(jlptVocab).map(name => [name, fields[name] ?? '']),
  )
  fieldIndex.value = 0
  void nextTick(() => noteView.value?.focusField(0))
}

function cycleField(step: number) {
  const count = noteView.value?.fieldCount() ?? 0
  if (count === 0)
    return

  fieldIndex.value = (fieldIndex.value + step + count) % count
  noteView.value?.focusField(fieldIndex.value)
}

async function undo() {
  await enqueue(async () => {
    try {
      const response = await $fetch<UndoResponse>('/api/vet/undo', { method: 'POST' })
      apply(response.queue)

      // ⚠️ `10` §4.8: the message replaces the footer legend **in place and
      // stays until the next keystroke** — never on a timer. A timed message is
      // the one thing a keyboard-driven screen must not use, because the
      // reader's eyes are on the *term* and not on the footer.
      if (response.outcome === 'reviewed')
        message.value = 'That card has already been reviewed, so the acceptance cannot be undone.'
      else if (response.outcome === 'nothing_to_undo')
        message.value = 'Nothing to undo — this run has no decisions in it yet.'
    }
    catch {
      message.value = 'The undo did not reach the database. The queue has been reloaded.'
      await load()
    }
  })
}

// -- Leaving ----------------------------------------------------------------

/**
 * ⚠️ **Done and `Esc` ask once, and only when the run holds at least one
 * rejection** (ADR 0033). The question is off `S3`'s measured path entirely —
 * Done happens once per run and a run is hundreds of *notes* — and it guards the
 * only irreversible act in the application a reader can trigger by pointing at
 * something. It does not appear at all when there is nothing to lose, because a
 * dialog with nothing behind it teaches the reader to dismiss it unread.
 */
function requestLeave() {
  if (rejections.value > 0) {
    confirming.value = true
    void nextTick(() => endControl.value?.focus())
    return
  }

  void leave()
}

async function leave() {
  await enqueue(() => $fetch('/api/vet/end', { method: 'POST' }).catch(() => undefined))

  // ADR 0032 blesses this spelling alongside `<NuxtLink … external>`: both do a
  // real document load, which is what strips the *mode*'s JavaScript.
  await navigateTo(origin.value, { external: true })
}

/**
 * The Done anchor's click — and the one place the run is ended **without being
 * waited for**.
 *
 * ⚠️ **Not preventing the default is the point.** `<NuxtLink … external>`'s
 * whole property is that the click falls through to the browser
 * (`test/nuxt/modes.test.ts` asserts exactly that bit), so the document load
 * starts here and this request has to travel beside it — which is what
 * `keepalive` and `sendBeacon` exist for.
 *
 * ⚠️ **And losing it costs nothing, which is why this is allowed at all.** The
 * only thing `ended_at` decides is whether a *rejection* can still be reversed,
 * and this branch runs only when the run holds none (the other branch is the
 * confirmation above, which waits). `04` §7.1's idle sweep closes the row half an
 * hour later either way.
 */
function onDoneClick(event: MouseEvent) {
  if (rejections.value > 0) {
    event.preventDefault()
    requestLeave()
    return
  }

  endWithoutWaiting()
}

function endWithoutWaiting() {
  try {
    if (navigator.sendBeacon?.('/api/vet/end', new Blob([], { type: 'application/json' })))
      return
  }
  catch {
    // `sendBeacon` is absent or refused the payload; the fetch below is the same
    // request by another route.
  }

  void $fetch('/api/vet/end', { method: 'POST', keepalive: true }).catch(() => undefined)
}

// -- The keyboard -----------------------------------------------------------

function onKeydown(event: KeyboardEvent) {
  if (confirming.value) {
    const action = confirmationAction(event)
    if (!action)
      return

    // ⚠️ The primary control is a focused `<button>`, so `space` would activate
    // it as well. Preventing the default leaves exactly one path through.
    event.preventDefault()

    if (action === 'end')
      void leave()
    else
      backToQueue()

    return
  }

  if (edit.value) {
    const action = editAction(event)
    if (!action)
      return

    event.preventDefault()

    if (action === 'commit')
      void submit('accept', { ...edit.value })
    else if (action === 'cancel')
      cancelEdit()
    else
      cycleField(action === 'next' ? 1 : -1)

    return
  }

  const action = vetAction(event)
  if (!action)
    return

  event.preventDefault()
  message.value = null

  switch (action) {
    case 'accept': void submit('accept', null); break
    case 'reject': void submit('reject', null); break
    case 'edit': openEdit(); break
    case 'undo': void undo(); break
    case 'leave': requestLeave(); break
  }
}

/** `09` §4.3: `Esc` closes the edit and returns the *note* unchanged. */
function cancelEdit() {
  edit.value = null
  focusContainer()
}

function backToQueue() {
  confirming.value = false
  focusContainer()
}

// -- Lifecycle --------------------------------------------------------------

let poll: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  const threshold = setTimeout(() => (slow.value = true), LOADING_THRESHOLD)

  await enqueue(load)
  clearTimeout(threshold)
  focusContainer()

  // ⚠️ **The screen polls while an *ingestion* could still add to it, and only
  // then** — which is `09` §7's row for `/vet` ("Notes keep arriving; the count
  // in the chrome bar rises") rather than `10` §4.5's narrower reading.
  //
  // The two documents look like they disagree and do not: §4.5's claim is that
  // *Vet*'s empty states are **the only self-updating screens in the
  // application*, which is a statement about the three *places* never
  // refreshing (`09` §2) — not a rule that this screen stops noticing arrivals
  // the moment it has a *note* to show. Polling only when empty would leave the
  // chrome bar's count frozen in front of a reader who is reading rather than
  // pressing, which is the one thing that row promises does not happen.
  //
  // When nothing is queued or running there is nothing that could arrive: a
  // *mode* has no path to Ingest, so the poll would be a request per five
  // seconds for a number that cannot change.
  poll = setInterval(() => {
    if (running.value)
      void enqueue(load)
  }, POLL_INTERVAL)
})

onBeforeUnmount(() => {
  if (poll)
    clearInterval(poll)
})
</script>

<template>
  <div class="mode">
    <!--
      `05` §7's chrome bar: 56px, `--k-gutter` padding, a `--k-rule` bottom. It
      stays in every state, including all three empty ones (`10` §4.5) — its
      counts are what empty out, not the bar.
    -->
    <header class="chrome">
      <span class="bar-left">
        <span class="screen">VET</span>

        <span v-if="note?.sourceTitle" class="source" lang="ja">{{ note.sourceTitle }}</span>

      <!--
        ⚠️ `10` §4.3 — the one thing nothing else in the project named. `X` in
        *Review* puts a *note* back in the queue flagged (`09` §4.9), so the
        reader is seeing it a second time, and the reason they are is the only
        thing that makes the second look different from the first.
      -->
        <span v-if="note?.flagged" class="flagged">returned by a flag</span>
      </span>

      <span class="gap" />

      <span v-if="note" class="counts">
        <span class="figure">{{ pending }}</span>
        <span class="word">pending</span>
        <span class="dot" aria-hidden="true">·</span>
        <!--
          `05` §7's "*note* index", read as **the position in this run** — the
          only monotone number on the screen, and the one that answers "how much
          have I done". The pending count beside it already answers "how much is
          left".
        -->
        <span class="figure">#{{ vetted + 1 }}</span>
      </span>

      <!--
        ⚠️ `external` is load-bearing (ADR 0032, `09` §5.2, verification §12.1),
        and `10` §4.3 repeats it because this is the file someone reads while
        building the control. It is the key cap plus its label rather than a
        button, because the control's job is to name the key as much as to be a
        target (ADR 0026).
      -->
      <NuxtLink :to="origin" external class="done" @click="onDoneClick">
        <KeyCap cap="Esc" label="Done" />
      </NuxtLink>
    </header>

    <!--
      ⚠️ **The mode container.** Key handlers bind here and focus lives here —
      never on `document` or `window` (ADR 0025, `10` §4.1, `11` §6.2). The Done
      control above is deliberately **outside** it: `11` §6.2's behavioural proxy
      focuses Done, presses `R`, and asserts that nothing happened.
    -->
    <div ref="container" class="container" tabindex="-1" @keydown="onKeydown">
      <div class="column">
        <!-- `10` §10.5 — ADR 0026 refuses to degrade *Vet* into a tappable
             version of itself, because `S3` measures one keystroke per *note* and
             a tap-target version is what the numbers would then be measured
             against. -->
        <EmptyBlock class="phone-only">
          <template #statement>
            Vetting needs a keyboard.
          </template>
          <template #body>
            This screen is a keystroke per <i>note</i> and has no tappable form. Review works here.
          </template>
        </EmptyBlock>

        <div class="desktop-only">
          <!-- `10` §4.6. **It is not a modal** — `05` §6 has one shadow on one
               element — so it replaces the reading column and leaves the chrome
               bar standing. -->
          <EmptyBlock v-if="confirming">
            <template #statement>
              {{ rejections }} rejection{{ rejections === 1 ? ' becomes' : 's become' }} permanent.
            </template>
            <template #body>
              Re-ingesting a <i>source</i> will not surface {{ rejections === 1 ? 'it' : 'them' }} again.
            </template>

            <div class="answers">
              <button ref="endControl" type="button" class="answer" @click="leave">
                <KeyCap cap="space" label="end the run" variant="primary" />
              </button>
              <button type="button" class="answer" @click="backToQueue">
                <KeyCap cap="Z" label="back to the queue" />
              </button>
            </div>
          </EmptyBlock>

          <VetNote
            v-else-if="note"
            ref="noteView"
            :note="note"
            :declaration="jlptVocab"
            :edit="edit"
          />

          <EmptyBlock v-else-if="status === 'error'">
            <template #statement>
              The queue could not be loaded.
            </template>
            <template #body>
              Nothing has been lost — every decision commits on its own keystroke. Leave and come back.
            </template>
          </EmptyBlock>

          <!-- `10` §4.8: the reading column stays empty ground until 500ms have
               passed, because a statement that flashes for 120ms is worse than
               120ms of quiet. -->
          <EmptyBlock v-else-if="status === 'loading'" v-show="slow">
            <template #statement>
              Loading the queue.
            </template>
            <template #body>
              &nbsp;
            </template>
          </EmptyBlock>

          <EmptyBlock v-else-if="empty === 'nothing'">
            <template #statement>
              Nothing to vet.
            </template>
            <template #body>
              Everything ingested has been judged.
            </template>

            <!--
              ⚠️ **Two controls that mean different things, and they are not to
              be simplified into one** (ADR 0032, `10` §4.5). Done returns the
              reader to the *place* they came from, which may be Sources; this
              says what to do instead. ⚠️ It is `external` for the same reason
              Done is.
            -->
            <NuxtLink to="/" external class="affordance">
              <span class="arrow" aria-hidden="true">→</span>
              <span>Ingest a source</span>
            </NuxtLink>
          </EmptyBlock>

          <EmptyBlock v-else-if="empty === 'not-yet'">
            <template #statement>
              Nothing to vet yet.
            </template>
            <template #body>
              <span lang="ja">{{ running?.title }}</span> — {{ running?.detail }}.
            </template>
          </EmptyBlock>

          <EmptyBlock v-else>
            <template #statement>
              Caught up.
            </template>
            <template #body>
              <span lang="ja">{{ running?.title }}</span> — {{ running?.detail }}.
              {{ vetted }} vetted in this run.
            </template>
          </EmptyBlock>
        </div>
      </div>
    </div>

    <!--
      `10` §4.7 — 68px, a `--k-rule` top, aligned to the 940px column.
      ⚠️ Hidden on a phone and during the run-end confirmation. `10` §10.5 gives
      the phone the chrome bar and the refusal and nothing else; §4.6 says the
      confirmation replaces the reading column and is silent about the footer,
      and a legend naming four keys that do nothing on the screen in front of the
      reader is worse than no legend.
    -->
    <footer v-if="!confirming" class="legend desktop-only">
      <div class="column legend-row">
        <p v-if="message" class="message">
          {{ message }}
        </p>

        <!--
          ⚠️ **The legend changes inside an edit, and `10` §4.4 and §4.7
          disagree about how.** §4.4 says "while an edit is open the legend's
          `Esc` label reads `cancel edit` rather than `leave`"; §4.7's legend has
          no `Esc` in it at all, because §4.3 gives that key to the Done cluster.
          The reading that honours both: inside an edit the legend names the
          edit's keys, one of which is `Esc` — `cancel edit`.
        -->
        <template v-else-if="edit">
          <span class="keys">
            <KeyCap cap="Enter" label="accept" variant="primary" />
            <KeyCap cap="Tab" label="next field" />
            <KeyCap cap="Esc" label="cancel edit" />
          </span>
        </template>

        <!--
          ⚠️ **The legend names only the keys that act on the screen in front of
          the reader**, which is a reading `10` §4.7 does not state and §4.5
          does not forbid. With a *note* on screen that is all four. On an empty
          queue `space`, `E` and `R` have nothing to act on — but `Z` does, for
          as long as the run holds a decision (ADR 0033 reads its target from the
          database, not from what is rendered), so the undo and its horizon are
          exactly what survives.
        -->
        <template v-else-if="note">
          <span class="keys">
            <KeyCap cap="space" label="accept" variant="primary" />
            <KeyCap cap="E" label="edit" />
            <KeyCap cap="R" label="reject" />
            <KeyCap cap="Z" label="undo" />
          </span>

          <!--
            ⚠️ ADR 0023 put the horizon here on purpose and ADR 0033 made it
            load-bearing: the 30-minute idle sweep ends a run while nobody is
            looking, so this is the only thing that tells the reader the horizon
            exists before they find out that it closed.
          -->
          <span class="horizon">undo lasts until this run ends</span>
        </template>

        <template v-else-if="vetted > 0">
          <span class="keys">
            <KeyCap cap="Z" label="undo" />
          </span>
          <span class="horizon">undo lasts until this run ends</span>
        </template>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* `05` §5: every screen is a fixed-height column — chrome, a growing middle,
   chrome. 1440 × 900 is the frame; the column is what survives other sizes. */
.mode {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--k-ground);
}

.chrome {
  display: flex;
  align-items: center;
  flex: 0 0 var(--k-bar-height); /* 56px — the *shell* and *Vet* share a horizon */
  padding: 0 var(--k-gutter);
  border-bottom: 1px solid var(--k-rule);
}

/* ⚠️ **The bar's left group carries its own gap, and the bar carries none.**
   `10` §4.3 measures `28px` from the counts to the Done cluster; a gap on the
   bar itself would be added to that margin and make it 40. `12px` is `05` §5's
   "inside one thing", which is what `VET`, the *source* name and the flag aside
   are — and §4.3 states it for the aside. */
.bar-left {
  display: flex;
  align-items: baseline;
  gap: var(--k-space-3);
}

.screen {
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  color: var(--k-accent);
}

.source {
  font-size: 14px;
  color: var(--k-ink-secondary);
}

/* `10` §4.3: a 13px Newsreader italic aside, `12px` after the *source* name. */
.flagged {
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

.gap {
  flex: 1;
}

.counts {
  display: inline-flex;
  align-items: baseline;
  gap: var(--k-space-2);
  font-family: var(--k-face-mono);
  font-size: 12px;
}

.figure {
  color: var(--k-ink);
}

.word {
  color: var(--k-ink-secondary);
}

.dot {
  color: var(--k-dot);
}

/* `10` §4.3: `28px` from the counts to its left. */
.done {
  margin-left: var(--k-space-6);
  text-decoration: none;
}

/* ⚠️ **Neither `05` nor `10` gives the reading column's inset from the chrome**,
   so both values are steps off `05` §5's scale rather than figures either
   document states: `52px` below the bar, `40px` above the legend. They are
   named here because an undeclared dimension is the thing `05` §5 exists to
   stop. */
.container {
  flex: 1;
  display: flex;
  padding: var(--k-space-10) var(--k-gutter) var(--k-space-8);
}

/* ADR 0025: the modes hold focus on the container and **draw no ring**. Focus
   never moves within this screen, so a ring would mark a position that cannot
   change — decoration where the system spends nothing on decoration. */
.container:focus,
.container:focus-visible {
  outline: none;
}

/* `05` §5: *Vet*'s reading column is 940px — the measure to read and judge. */
.column {
  width: 100%;
  max-width: var(--k-measure-read);
  margin: 0 auto;
}

.answers {
  display: flex;
  /* `10` §4.6: two key caps with labels, `28px` apart. */
  gap: var(--k-space-6);
}

/* ⚠️ Both caps are clickable targets for the reader who arrived by pressing
   Done with a pointer (`10` §4.6). The button is a carrier — the cap is the
   control, and `KeyCap` already clears SC 2.5.8's 24 × 24. */
.answers .answer {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font: inherit;
}

/* `05` §7's **quiet** affordance, whole: `--k-raised` face,
   `1px --k-border-control`, `--k-radius-control`, `13px 20px`, a 17px label in
   `--k-ink` and an accent `→`. "It is not the primary control — nothing here is
   urgent." It keeps the arrow because it is alone on the screen (`10` §4.5);
   `10` §3.2 drops it in the start block, where two of them would be decoration. */
.affordance {
  display: inline-flex;
  align-items: baseline;
  gap: var(--k-space-2);
  padding: 13px 20px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-size: 17px;
  color: var(--k-ink);
  text-decoration: none;
}

.affordance .arrow {
  color: var(--k-accent);
}

.affordance:hover {
  color: var(--k-accent-hover);
}

.legend {
  flex: 0 0 68px;
  display: flex;
  align-items: center;
  padding: 0 var(--k-gutter);
  border-top: 1px solid var(--k-rule);
}

.legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--k-space-6);
}

.keys {
  display: inline-flex;
  align-items: center;
  gap: var(--k-space-6); /* 28px apart — `10` §4.7 */
}

/* ⚠️ `10` §4.8: a failed keystroke replaces the legend **in place**, and stays
   until the next keystroke rather than on a timer. */
.message {
  margin: 0;
  font-size: 15px;
  color: var(--k-ink);
}

.horizon {
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

/*
 * ⚠️ `10` §10.5 — the phone refusal is a media query and not a measured
 * viewport, deliberately. A rendered decision about width would have to be made
 * before the first paint and re-made on every resize; CSS makes both free, and
 * the reader who rotates a tablet does not lose an edit in progress.
 */
.phone-only {
  display: none;
}

@media (width < 720px) {
  .phone-only {
    display: block;
  }

  .desktop-only {
    display: none;
  }
}
</style>
