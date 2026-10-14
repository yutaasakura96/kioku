<script setup lang="ts">
// Welcome — the prototype's `vWelcome`, on `/` for a reader's first visit
// (ADR 0078). What Kioku is, how it works in three steps, and where to start.
//
// ⚠️ **No *shell***, as the prototype draws it: Welcome asks for one decision
// and the nav would be three ways around it. Choosing a level writes the
// reader's *category* (ADR 0077 §2) and lands on Home, which from then on is
// the dashboard.
//
// ⚠️ **Each level is a form with one button**, posting to `/api/category`:
// `/` ships no JavaScript (`03` §2.1).
//
// ⚠️ ***Find my level* is not drawn.** The placement test is #72's, and a
// control that led nowhere would be a disabled one in disguise (ADR 0035).
// Starting at a level is the whole of the choice until then.
//
// ⚠️ **The sources' acknowledgement is the prototype's fine print here**, with
// its links (ADR 0075 §8), and stays in the *shell*'s footer too, because
// Welcome is seen once.

import { categoryKey, levelCategories } from '#shared/category/category'

const levels = levelCategories().flatMap(ref => (ref.kind === 'level' ? [{ level: ref.level, key: categoryKey(ref) }] : []))
const first = levels[0]
</script>

<template>
  <main class="welcome">
    <p class="eyebrow accent">
      <span lang="ja">記憶</span> · Kioku
    </p>
    <h1>Learn the Japanese words you need for the JLPT.</h1>
    <p class="lede">
      Kioku teaches you a few new words a day, then quizzes you: you type what each word means and how
      it is read. It brings every word back just before you would forget it.
    </p>

    <ol class="how">
      <li class="card">
        <span class="n">1 · LEARN</span>
        <h2>Five new words at a time</h2>
        <p>The words are already here, N5 to N1. Nothing to set up.</p>
        <div class="demo">
          <span class="big" lang="ja">経験</span>
          <span><span lang="ja" class="quiet">けいけん</span><br>experience</span>
        </div>
      </li>
      <li class="card">
        <span class="n">2 · TYPE</span>
        <h2>Type the meaning, then the reading</h2>
        <p>No multiple choice. You either know it or you find out.</p>
        <div class="demo">
          <span class="fakein">experience</span>
          <span class="fakein" lang="ja">けいけん</span>
        </div>
      </li>
      <li class="card">
        <span class="n">3 · REMEMBER</span>
        <h2>Words come back on a schedule</h2>
        <p>Sooner if you missed one, later each time you get it right.</p>
        <div class="demo">
          <div class="timeline" aria-hidden="true">
            <span>today</span><span>3 days</span><span>1 week</span><span>1 month</span>
          </div>
        </div>
      </li>
    </ol>

    <form v-if="first" method="post" action="/api/category" class="cta">
      <input type="hidden" name="category" :value="first.key">
      <button type="submit" class="btn">
        I am new to Japanese · start at {{ first.level }}
      </button>
    </form>

    <div class="know">
      <span>Already know your level? Start at</span>
      <form v-for="level in levels" :key="level.key" method="post" action="/api/category">
        <input type="hidden" name="category" :value="level.key">
        <button type="submit" :aria-label="`Start at ${level.level}`">
          {{ level.level }}
        </button>
      </form>
    </div>

    <p class="fine">
      Words and meanings come from
      <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project">JMdict</a>,
      the open Japanese dictionary (© EDRDG,
      <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>), with JLPT levels from
      <a href="https://www.tanos.co.uk/jlpt/">Jonathan Waller's JLPT Resources</a>
      (<a href="https://www.tanos.co.uk/jlpt/sharing/">CC BY</a>). You can also import an Anki deck or
      add your own words later.
    </p>
  </main>
</template>

<style scoped>
.welcome {
  max-width: var(--k-measure-read);
  padding: 52px var(--k-gutter) var(--k-space-10);
}

.eyebrow {
  margin: 0;
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--k-ink-secondary);
}

.eyebrow.accent {
  color: var(--k-accent);
}

h1 {
  max-width: 15em;
  margin: 14px 0 0;
  font-size: 52px;
  font-weight: 300;
  line-height: 1.1;
  letter-spacing: -0.015em;
}

.lede {
  max-width: 34em;
  margin: 18px 0 0;
  font-size: 20px;
  color: var(--k-ink-quiet);
}

.quiet {
  color: var(--k-ink-secondary);
}

/* The prototype's three steps. */
.how {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 34px 0 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 20px 22px;
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
}

.n {
  font-family: var(--k-face-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--k-accent);
}

.card h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 400;
}

.card p {
  margin: 0;
  font-size: 15.5px;
  color: var(--k-ink-secondary);
}

.demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-height: 76px;
  margin-top: 12px;
}

.demo .big {
  font-size: 44px;
  line-height: 1;
}

/* An answer the quiz would mark right, in `--k-right` beside its tint. */
.fakein {
  min-width: 0;
  padding: 7px 12px;
  background: var(--k-right-tint);
  border: 1px solid var(--k-right);
  border-radius: var(--k-radius-control);
  font-size: 16px;
  color: var(--k-right-ink);
}

.timeline {
  display: flex;
  align-items: center;
  width: 100%;
  font-family: var(--k-face-mono);
  font-size: 11px;
  color: var(--k-ink-secondary);
}

.timeline span {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  padding-top: 16px;
  text-align: center;
  white-space: nowrap;
}

.timeline span::before {
  position: absolute;
  top: 3px;
  left: 50%;
  z-index: 1;
  width: 9px;
  height: 9px;
  margin-left: -4.5px;
  content: '';
  background: var(--k-ink);
  border-radius: 50%;
}

.timeline span::after {
  position: absolute;
  top: 7px;
  right: 0;
  left: 0;
  height: 1px;
  content: '';
  background: var(--k-border-dashed);
}

.cta {
  margin: 36px 0 0;
}

/* The prototype's `.btn`. */
.btn {
  padding: 12px 22px;
  background: var(--k-ink-ground);
  border: 1px solid var(--k-ink-ground);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 17px;
  line-height: 1.2;
  color: var(--k-on-ink);
  cursor: pointer;
}

.btn:hover {
  color: var(--k-on-ink-quiet);
}

.know {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--k-space-2);
  margin-top: 18px;
  color: var(--k-ink-secondary);
}

.know form {
  margin: 0;
}

.know button {
  padding: 5px 14px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: 999px;
  font-family: var(--k-face-mono);
  font-size: 13px;
  color: var(--k-ink);
  cursor: pointer;
}

.know button:hover {
  background: var(--k-key-face);
}

.fine {
  max-width: 44em;
  margin: 30px 0 0;
  font-size: 14px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

.fine a {
  color: inherit;
}

/* `10` §10.1's breakpoint, and the prototype's phone frame. */
@media (width < 720px) {
  .welcome {
    padding-top: 28px;
  }

  h1 {
    font-size: 36px;
  }

  .lede {
    font-size: 18px;
  }

  .how {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin-top: 24px;
  }

  .card {
    padding: 16px 16px 18px;
  }

  .demo {
    min-height: 0;
  }

  .btn {
    width: 100%;
  }
}
</style>
