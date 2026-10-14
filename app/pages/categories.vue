<script setup lang="ts">
// Categories — the fifth *place* (ADR 0077 §3), the prototype's `vCategories`:
// the shelf of *categories*, how far the reader is into each, and the one
// their new words come from.
//
// ⚠️ **One active *category*, and it feeds new words only.** Reviews mix
// everything the reader has learned, whichever *category* it came from, and
// the sentence under the heading says so.
//
// ⚠️ **Each row is a form with one button.** This route ships no JavaScript
// (`03` §2.1), so choosing posts to `/api/category` and the answer is a `303`
// to the screen before a run, as the prototype's choice lands on Home.
//
// ⚠️ **The active row has no button.** It says *New words come from here*
// where the others say *Study*, which is the accent spent on where you are
// (`05` §2) and never on a state.
//
// ⚠️ **A *category* with no words is still a row** (`categories`): an
// unloaded starter set reads as five empty levels, and a deck whose import
// has written nothing yet is a deck at zero.

import { learned } from '#shared/category/shelf'
import type { ShelfRow } from '#shared/category/shelf'
import { STAGES, STAGE_LABELS } from '#shared/review/stage'

const counts = await useStartBlockCounts()
const shelf = await useCategoryShelf()

/**
 * What a *level* is called beside its code, as the prototype has it. ⚠️ Copy
 * for this *subject*'s five; a *level* without a name here is drawn by its code
 * alone.
 */
const LEVEL_NAMES: Record<string, string> = {
  N5: 'Beginner',
  N4: 'Elementary',
  N3: 'Intermediate',
  N2: 'Upper intermediate',
  N1: 'Advanced',
}

const levels = computed(() => shelf.filter(row => row.group === 'jlpt'))
const mine = computed(() => shelf.filter(row => row.group === 'my-decks'))

const figure = (count: number) => count.toLocaleString('en-US')
const words = (count: number) => `${figure(count)} ${count === 1 ? 'word' : 'words'}`

function isDeck(row: ShelfRow) {
  return row.key.startsWith('deck:')
}

/** *684 words · 12 learned*, and *· imported* for a deck. */
function meta(row: ShelfRow) {
  return [words(row.words), `${figure(learned(row.progress))} learned`, ...(isDeck(row) ? ['imported'] : [])].join(' · ')
}

/** The bar's segments, furthest along first, as shares of the *category*. */
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
</script>

<template>
  <PlaceShell
    origin="/categories"
    :flagged="counts.flagged"
    :due="counts.due"
    :new-today="counts.newToday"
    measure="var(--k-measure-object)"
  >
    <section class="categories">
      <span class="eyebrow">CATEGORIES</span>
      <h1>Choose what to study.</h1>
      <p class="lede">
        Your new words come from one category at a time. Reviews always cover everything you have
        learned, whichever category it came from.
      </p>

      <section class="shelf">
        <h2 class="eyebrow">
          JLPT LEVELS
        </h2>

        <div v-for="row in levels" :key="row.key" class="cat" :class="{ on: row.active }">
          <span class="code">{{ row.label }}</span>
          <div class="info">
            <b>{{ LEVEL_NAMES[row.label] ?? `JLPT ${row.label}` }}</b>
            <div class="meta">
              {{ meta(row) }}
            </div>
            <div class="sbar" role="img" :aria-label="barLabel(row)">
              <i v-for="segment in segments(row)" :key="segment.stage" :class="segment.stage" :style="{ width: segment.width }" />
            </div>
          </div>
          <div class="act">
            <span v-if="row.active" class="tag">New words come from here</span>
            <form v-else method="post" action="/api/category">
              <input type="hidden" name="category" :value="row.key">
              <button type="submit" class="study">
                Study {{ row.label }}
              </button>
            </form>
          </div>
        </div>
      </section>

      <!-- The prototype's placeholder: topic categories are a later ticket,
           and these are not controls. -->
      <section class="shelf">
        <h2 class="eyebrow">
          TOPICS · COMING LATER
        </h2>
        <div class="soon">
          <span>Tech and IT</span><span>Business</span><span>Travel</span><span>Food</span><span>Daily life</span>
        </div>
      </section>

      <section class="shelf">
        <h2 class="eyebrow">
          MY DECKS
        </h2>

        <div v-for="row in mine" :key="row.key" class="cat" :class="{ on: row.active }">
          <span class="code small">{{ isDeck(row) ? 'Anki' : 'Mine' }}</span>
          <div class="info">
            <b>{{ row.label }}</b>
            <div class="meta">
              {{ meta(row) }}
            </div>
            <div class="sbar" role="img" :aria-label="barLabel(row)">
              <i v-for="segment in segments(row)" :key="segment.stage" :class="segment.stage" :style="{ width: segment.width }" />
            </div>
          </div>
          <div class="act">
            <span v-if="row.active" class="tag">New words come from here</span>
            <form v-else method="post" action="/api/category">
              <input type="hidden" name="category" :value="row.key">
              <button type="submit" class="study" :aria-label="`Study ${row.label}`">
                Study this
              </button>
            </form>
          </div>
        </div>

        <!-- Both live on Ingest, `/add` since #71 (ADR 0078); one form serves both. -->
        <div class="dashed">
          <span>Nothing here fits?</span>
          <NuxtLink to="/add" class="link">
            Import an Anki deck
          </NuxtLink>
          <NuxtLink to="/add" class="link">
            Add my own words
          </NuxtLink>
        </div>
      </section>
    </section>
  </PlaceShell>
</template>

<style scoped>
.categories {
  margin-top: var(--k-space-8);
}

/* `05` §4's eyebrow, as Settings carries it. */
.eyebrow {
  display: block;
  margin: 0;
  font-family: var(--k-face-mono);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

h1 {
  margin: var(--k-space-2) 0 0;
  font-size: 26px;
  font-weight: 400;
  line-height: 1.25;
}

.lede {
  max-width: 40em;
  margin: var(--k-space-2) 0 0;
  font-size: 17px;
  color: var(--k-ink-secondary);
}

.shelf {
  margin-top: var(--k-space-8);
}

.shelf > .eyebrow {
  margin-bottom: var(--k-space-3);
}

/* The prototype's `.card.cat`: a code, what it is, and the one action. */
.cat {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  margin-bottom: 10px;
  padding: var(--k-space-4) var(--k-space-5);
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
}

.cat.on {
  border-color: var(--k-ink);
  box-shadow: var(--k-shadow-card);
}

.code {
  font-size: 36px;
  font-weight: 300;
  line-height: 1;
}

.code.small {
  font-size: 22px;
}

.info {
  min-width: 0;
}

.info b {
  font-size: 18px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.meta {
  margin: 2px 0 var(--k-space-2);
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-secondary);
}

/* The stage bar: Known, Familiar, Learning, over what is not started. */
.sbar {
  display: flex;
  height: 10px;
  overflow: hidden;
  background: var(--k-st-none);
  border-radius: var(--k-radius-tick);
}

.sbar i {
  display: block;
  height: 100%;
}

.sbar .known {
  background: var(--k-st-known);
}

.sbar .familiar {
  background: var(--k-st-familiar);
}

.sbar .learning {
  background: var(--k-st-learning);
}

.act form {
  margin: 0;
}

/* The prototype's `.tag.accent`: where the reader is. */
.tag {
  display: inline-block;
  padding: 2px 7px;
  background: var(--k-raised);
  border: 1px solid var(--k-accent);
  border-radius: 999px;
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--k-accent);
}

/* The prototype's `.btn.ghost.small`. */
.study {
  padding: 8px 14px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 15px;
  color: var(--k-ink);
  cursor: pointer;
}

.study:hover {
  background: var(--k-key-face);
}

.soon {
  display: flex;
  flex-wrap: wrap;
  gap: var(--k-space-2);
}

.soon span {
  padding: 6px 14px;
  border: 1px dashed var(--k-border-dashed);
  border-radius: 999px;
  color: var(--k-ink-secondary);
}

.dashed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px var(--k-space-4);
  padding: var(--k-space-4) var(--k-space-5);
  border: 1px dashed var(--k-border-dashed);
  border-radius: var(--k-radius-card);
  color: var(--k-ink-secondary);
}

.link {
  color: var(--k-accent);
  text-underline-offset: 3px;
}

.link:hover {
  color: var(--k-accent-hover);
}

/* `10` §10.1's breakpoint: the action drops under the row and fills it. */
@media (width < 720px) {
  .cat {
    grid-template-columns: 52px minmax(0, 1fr);
    gap: var(--k-space-3);
    padding: 14px var(--k-space-4);
  }

  .code {
    font-size: 28px;
  }

  .code.small {
    font-size: 18px;
  }

  .act {
    grid-column: 1 / -1;
  }

  .act .study,
  .act .tag {
    box-sizing: border-box;
    width: 100%;
    text-align: center;
  }
}
</style>
