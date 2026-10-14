<script setup lang="ts">
// Home — the landing *place* since #71 (ADR 0078), the prototype's `vHome`.
// `noScripts: true`.
//
// ⚠️ **Welcome on a first visit, the dashboard after** (`homeData`'s
// `firstVisit`). Both are drawn on the server from the request event, like
// every *place* (`server/middleware/shell-data.ts`).
//
// ⚠️ **The two cards are the entrances to a run**, links with `?start=` as the
// start block's are (ADR 0076 § Settled by the build), so the start block is
// not drawn here: the same two counts twice would be the page saying
// everything twice. ⚠️ **A card with nothing to start has no control**, and the
// sentence under its figure says why — never a disabled one (ADR 0035).
//
// ⚠️ **The line naming the active *category* lives here since #71**; it was on
// `/review`'s screen before a run as Home's stand-in (ADR 0077 §3).
//
// ⚠️ ***Your JLPT vocabulary level* is the estimate since #72** (ADR 0079):
// the level proved, working toward the next, and the sentence that says what
// it rests on — all `shared/level/estimate.ts`'s. A level the placement marks
// known reads *placed out* under *Progress by level*, as the prototype has it.
// *How is this worked out?* is a `<details>`, which needs no script.
//
// ⚠️ **The prototype's links to *Words* are not drawn**: no ticket has built
// that screen, so a level's progress row and the weak words are text, and
// *Practise these* is not offered, because a weak-word run is not a kind of
// *session* (ADR 0076 §1).

import { learned } from '#shared/category/shelf'
import type { ShelfRow } from '#shared/category/shelf'
import { lessonsHint, missedNote, reviewsHint } from '#shared/home/dashboard'
import { noLessonLine, startLines } from '#shared/review/offer'
import { STAGES, STAGE_LABELS } from '#shared/review/stage'
import { ESTIMATE_WINDOW_DAYS, PROVED_MIN_WORDS, PROVED_RIGHT_SHARE } from '#shared/level/thresholds'

const home = await useHome()

const now = new Date()
const lines = home && !home.firstVisit ? startLines(home.offer, now) : null

const offer = home?.offer
const due = offer?.dueCount ?? 0
const lesson = offer?.lesson ?? 0

const reviewLink = `/review?start=review&from=${encodeURIComponent('/')}`
const lessonLink = `/review?start=lesson&from=${encodeURIComponent('/')}`

const figure = (count: number) => count.toLocaleString('en-US')

/** The bar's segments, furthest along first, as shares of the level's words. */
function segments(row: ShelfRow) {
  return [...STAGES].reverse().map(stage => ({
    stage,
    width: row.words > 0 ? `${Math.min(100, (row.progress[stage] / row.words) * 100)}%` : '0%',
  }))
}

/** *3 known, 4 familiar, 5 learning* — what the bar draws, in words. */
function barLabel(row: ShelfRow) {
  return [...STAGES].reverse().map(stage => `${figure(row.progress[stage])} ${STAGE_LABELS[stage].toLowerCase()}`).join(', ')
}

const legend = [...[...STAGES].reverse().map(stage => ({ key: stage, label: STAGE_LABELS[stage] })), { key: 'none', label: 'Not started' }]

const studiedOn = computed(() => home?.days.filter(day => day.studied).length ?? 0)

const estimate = home?.estimate

/** The ladder: each level done, being worked toward, or neither. */
const ladder = computed(() => {
  const levels = home?.levels.map(row => row.label) ?? []
  const reached = estimate?.level ? levels.indexOf(estimate.level) : -1

  return levels.map((level, index) => ({
    level,
    state: index <= reached ? 'done' : index === reached + 1 ? 'now' : '',
    // The prototype's sliver: an empty bar would read as no level to work toward.
    pct: `${Math.max(6, Math.round((estimate?.progress ?? 0) * 100))}%`,
  }))
})

const placementLink = `/placement?from=${encodeURIComponent('/')}`
const rule = `From your first-try answers over the last ${ESTIMATE_WINDOW_DAYS} days. A level counts as yours once you get at least ${Math.round(PROVED_RIGHT_SHARE * 100)}% right across ${PROVED_MIN_WORDS} or more of its words. The placement test gives the first estimate.`

const placedOut = (row: ShelfRow) => estimate?.placedOut.includes(row.label) ?? false
</script>

<template>
  <WelcomeScreen v-if="!home || home.firstVisit" />

  <PlaceShell
    v-else
    origin="/"
    :flagged="0"
    :due="due"
    :new-today="lesson"
    :start-block="false"
  >
    <div class="today">
      <span class="eyebrow accent">Today</span>
      <h1 class="statement">
        {{ lines?.statement }}
      </h1>
      <p v-if="lines?.body" class="sub">
        {{ lines.body }}
      </p>
    </div>

    <div class="heroes">
      <section class="card hero" :class="{ ink: due > 0 }" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" class="eyebrow">
          Reviews
        </h2>
        <div class="big">
          <span class="num">{{ figure(due) }}</span>
          <span class="unit">{{ due === 1 ? 'word due' : 'words due' }}</span>
        </div>
        <p class="hint">
          {{ reviewsHint(due, home.hasHistory) }}
        </p>
        <a v-if="due > 0" :href="reviewLink" class="btn onink">Start reviews</a>
      </section>

      <section class="card hero" :class="{ ink: due === 0 && lesson > 0 }" aria-labelledby="lessons-heading">
        <h2 id="lessons-heading" class="eyebrow">
          Lessons
        </h2>
        <div class="big">
          <span class="num">{{ figure(lesson) }}</span>
          <span class="unit">{{ lesson > 0 ? 'new words ready' : 'new words left today' }}</span>
        </div>
        <p class="hint">
          {{ lesson > 0 ? lessonsHint(lesson, home.offer.category.name, home.offer.limits.dailyNew) : noLessonLine(home.offer) }}
        </p>
        <a v-if="lesson > 0" :href="lessonLink" class="btn" :class="due > 0 ? 'ghost' : 'onink'">Start lesson</a>
      </section>
    </div>

    <!-- ADR 0077 §3: which *category* new words come from, and the way to
         change it. It was on `/review`'s screen before a run until #71. -->
    <p class="studying">
      <span>New words come from</span>
      <span class="tag solid">{{ home.offer.category.name }}</span>
      <NuxtLink to="/categories" class="link">
        Change category
      </NuxtLink>
    </p>

    <!-- `09` §2: every figure on a *place* is as of the page load, and the
         *shell* says so. The start block carries this line elsewhere. -->
    <p class="asof">
      as of this page load
    </p>

    <div class="grid2">
      <div>
        <section class="sec">
          <h2 class="eyebrow">
            Your JLPT vocabulary level · estimate
          </h2>
          <div class="card levelcard">
            <div class="levelnow">
              <span class="lv">{{ home.estimate.level ?? '–' }}</span>
              <span v-if="home.estimate.next" class="to">working toward <b>{{ home.estimate.next }}</b></span>
              <span v-else class="to">top level</span>
            </div>
            <div class="ladder" aria-hidden="true">
              <div v-for="step in ladder" :key="step.level" :class="step.state" :style="step.state === 'now' ? { '--pct': step.pct } : undefined">
                {{ step.level }}
              </div>
            </div>
            <p class="why">
              {{ home.estimate.why }}
            </p>
            <p v-if="!home.estimate.placement && home.estimate.level === null" class="take">
              <a :href="placementLink" class="link">Take the 3 minute placement test</a>
            </p>
            <details>
              <summary>How is this worked out?</summary>
              <p>{{ rule }}</p>
              <p>It measures vocabulary only. The real JLPT also tests grammar, reading and listening.</p>
            </details>
          </div>
        </section>

        <template v-if="home.hasHistory">
          <section class="sec">
            <h2 class="eyebrow">
              Coming up
            </h2>
            <div class="figs">
              <div class="card fig" :class="{ now: home.comingUp.now > 0 }">
                <div class="v">
                  {{ figure(home.comingUp.now) }}
                </div>
                <div class="k">
                  now
                </div>
              </div>
              <div class="card fig">
                <div class="v">
                  {{ figure(home.comingUp.laterToday) }}
                </div>
                <div class="k">
                  later today
                </div>
              </div>
              <div class="card fig">
                <div class="v">
                  {{ figure(home.comingUp.tomorrow) }}
                </div>
                <div class="k">
                  tomorrow
                </div>
              </div>
              <div class="card fig">
                <div class="v">
                  {{ figure(home.comingUp.laterThisWeek) }}
                </div>
                <div class="k">
                  later this week
                </div>
              </div>
            </div>
          </section>

          <section class="sec">
            <h2 class="eyebrow">
              Last {{ home.days.length }} days · studied on {{ studiedOn }}
            </h2>
            <div class="days" role="img" :aria-label="`Studied on ${studiedOn} of the last ${home.days.length} days`">
              <i v-for="day in home.days" :key="day.key" :class="{ on: day.studied && !day.today, today: day.today }" />
            </div>
          </section>
        </template>
      </div>

      <div>
        <section class="sec">
          <h2 class="eyebrow">
            Progress by level
          </h2>
          <div v-for="row in home.levels" :key="row.key" class="prow">
            <span class="lvl">{{ row.label }}</span>
            <span v-if="placedOut(row)" class="sbar" role="img" aria-label="Placed out: marked known by your placement">
              <i class="placed" style="width: 100%" />
            </span>
            <span v-else class="sbar" role="img" :aria-label="barLabel(row)">
              <i v-for="segment in segments(row)" :key="segment.stage" :class="segment.stage" :style="{ width: segment.width }" />
            </span>
            <span class="cnt">{{ placedOut(row) ? 'placed out' : `${figure(learned(row.progress))} of ${figure(row.words)}` }}</span>
          </div>
          <div class="legend">
            <span v-for="item in legend" :key="item.key" :class="item.key">{{ item.label }}</span>
          </div>
        </section>

        <section v-if="home.hasHistory" class="sec">
          <h2 class="eyebrow">
            Weak words · you keep missing these
          </h2>
          <ul v-if="home.weak.length" class="weak">
            <WordRow
              v-for="word in home.weak"
              :key="word.cardId"
              :fields="word.fields"
              :note="missedNote(word)"
              missed
            />
          </ul>
          <p v-else class="empty">
            None yet. A word you miss twice and have not learned yet shows up here.
          </p>
        </section>
      </div>
    </div>

    <p class="tucked">
      <span>Want words that are not here?</span>
      <NuxtLink to="/add" class="link">
        Add my own words
      </NuxtLink>
      <NuxtLink to="/add" class="link">
        Import an Anki deck
      </NuxtLink>
    </p>
  </PlaceShell>
</template>

<style scoped>
/* The prototype's Home (`docs/prototype/`), on `05`'s tokens. */
.eyebrow {
  display: block;
  margin: 0;
  font-family: var(--k-face-mono);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--k-ink-secondary);
}

.eyebrow.accent {
  color: var(--k-accent);
}

.today {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--k-space-3);
}

.statement {
  max-width: 18em;
  margin: 0;
  font-size: 44px;
  font-weight: 300;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.sub {
  margin: 0;
  font-size: 17px;
  color: var(--k-ink-secondary);
}

.card {
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
}

.heroes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: var(--k-space-6);
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 24px 26px 26px;
}

.hero.ink {
  background: var(--k-ink-ground);
  border-color: var(--k-ink-ground);
  color: var(--k-on-ink);
}

.hero.ink .eyebrow,
.hero.ink .hint {
  color: var(--k-on-ink-quiet);
}

.big {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 6px;
}

.num {
  font-size: 72px;
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.02em;
}

.unit {
  font-size: 19px;
}

.hint {
  min-height: 3em;
  margin: 0;
  font-size: 15.5px;
  color: var(--k-ink-secondary);
}

/* The prototype's `.btn`, its ghost and its inverse on an ink card. */
.btn {
  align-self: flex-start;
  margin-top: 14px;
  padding: 12px 22px;
  background: var(--k-ink-ground);
  border: 1px solid var(--k-ink-ground);
  border-radius: var(--k-radius-control);
  font-size: 17px;
  line-height: 1.2;
  color: var(--k-on-ink);
  text-align: center;
  text-decoration: none;
}

.btn.ghost {
  background: var(--k-raised);
  border-color: var(--k-border-control);
  color: var(--k-ink);
}

.btn.ghost:hover {
  background: var(--k-key-face);
}

.btn.onink {
  background: var(--k-ground);
  border-color: var(--k-ground);
  color: var(--k-ink);
}

.btn.onink:hover {
  background: var(--k-raised);
}

.studying,
.tucked {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  color: var(--k-ink-secondary);
}

.studying {
  gap: 10px;
  margin: var(--k-space-4) 0 0;
  font-size: 15.5px;
}

.tag {
  padding: 2px 7px;
  border-radius: 999px;
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.tag.solid {
  background: var(--k-ink-ground);
  border: 1px solid var(--k-ink-ground);
  color: var(--k-on-ink);
}

.link {
  color: var(--k-accent);
  text-underline-offset: 3px;
}

.link:hover {
  color: var(--k-accent-hover);
}

/* `05` §4's aside role, as the start block draws it. */
.asof {
  margin: var(--k-space-2) 0 0;
  font-size: 13px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

.grid2 {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  gap: 40px;
  align-items: start;
  margin-top: 40px;
}

.sec > .eyebrow {
  margin-bottom: 12px;
}

.sec + .sec {
  margin-top: 36px;
}

/* *Your JLPT vocabulary level*. */
.levelcard {
  padding: 22px 24px 20px;
}

.levelnow {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 14px;
}

.lv {
  font-size: 68px;
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.02em;
}

.to {
  font-size: 18px;
  color: var(--k-ink-quiet);
}

.to b {
  font-weight: 500;
}

.ladder {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  margin-top: 18px;
}

.ladder div {
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-secondary);
  text-align: center;
}

.ladder div::before {
  display: block;
  height: 8px;
  margin-bottom: 6px;
  content: '';
  background: var(--k-tick-empty);
  border-radius: 3px;
}

/* A level proved, or placed. */
.ladder div.done {
  color: var(--k-ink);
}

.ladder div.done::before {
  background: var(--k-ink);
}

/* The level being worked toward, filled as far as the reader is toward it. */
.ladder div.now {
  color: var(--k-accent);
}

.ladder div.now::before {
  background: linear-gradient(90deg, var(--k-accent) var(--pct, 6%), var(--k-tick-empty) var(--pct, 6%));
}

.why {
  margin: 14px 0 0;
  font-size: 15.5px;
  color: var(--k-ink-quiet);
}

.take {
  margin: 10px 0 0;
}

.levelcard details {
  margin-top: 10px;
  font-size: 14.5px;
  color: var(--k-ink-secondary);
}

.levelcard summary {
  width: fit-content;
  color: var(--k-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.levelcard details p {
  margin: 8px 0 0;
}

/* *Progress by level*. */
.prow {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid var(--k-rule);
}

.prow:first-of-type {
  border-top: 1px solid var(--k-rule);
}

.lvl {
  font-family: var(--k-face-mono);
  font-size: 14px;
}

.cnt {
  font-family: var(--k-face-mono);
  font-size: 12.5px;
  color: var(--k-ink-secondary);
  white-space: nowrap;
}

.sbar {
  display: flex;
  min-width: 0;
  height: 10px;
  overflow: hidden;
  background: var(--k-st-none);
  border-radius: var(--k-radius-tick);
}

.sbar i {
  display: block;
  height: 100%;
}

.sbar .known,
.legend .known::before {
  background: var(--k-st-known);
}

.sbar .familiar,
.legend .familiar::before {
  background: var(--k-st-familiar);
}

.sbar .learning,
.legend .learning::before {
  background: var(--k-st-learning);
}

.legend .none::before {
  background: var(--k-st-none);
}

/* A level the placement marks known: the prototype's hatch of the two middle stages. */
.sbar .placed {
  background: repeating-linear-gradient(135deg, var(--k-st-familiar) 0 3px, var(--k-st-learning) 3px 6px);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--k-ink-secondary);
}

.legend span::before {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 6px;
  content: '';
  border-radius: 2px;
}

/* *Coming up*. */
.figs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.fig {
  padding: 12px 14px;
}

.fig.now {
  border-color: var(--k-accent);
}

.fig .v {
  font-size: 32px;
  font-weight: 300;
  line-height: 1.1;
}

.fig .k {
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--k-ink-secondary);
}

/* *Last 14 days*. */
.days {
  display: flex;
  gap: 5px;
  margin-top: 4px;
}

.days i {
  flex: 1 1 0;
  max-width: 26px;
  height: 22px;
  background: var(--k-tick-empty);
  border-radius: 3px;
}

.days i.on {
  background: var(--k-ink);
}

.days i.today {
  background: var(--k-accent);
}

/* *Weak words*. */
.weak {
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty {
  margin: 0;
  padding: 14px 0;
  border-top: 1px solid var(--k-rule);
  font-size: 15px;
  color: var(--k-ink-secondary);
}

.tucked {
  gap: 8px 22px;
  margin: 44px 0 0;
  padding-top: 18px;
  border-top: 1px solid var(--k-rule);
  font-size: 15px;
}

/* `10` §10.1's breakpoint, and the prototype's phone frame. */
@media (width < 720px) {
  .statement {
    font-size: 30px;
  }

  .heroes {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    margin-top: 18px;
  }

  .hero {
    padding: 18px 20px 20px;
  }

  .num {
    font-size: 56px;
  }

  .hint {
    min-height: 0;
  }

  .btn {
    align-self: stretch;
  }

  .grid2 {
    grid-template-columns: minmax(0, 1fr);
    gap: 34px;
    margin-top: 32px;
  }

  .lv {
    font-size: 56px;
  }

  .figs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
