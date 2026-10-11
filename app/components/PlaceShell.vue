<script setup lang="ts">
// The *shell* — `10` §3, `09` §2, ADR 0013. The bar, the start block, its
// aside, and the page body in whichever measure the *place* reads at.
//
// ⚠️ **It is a component the three *places* opt into, not a layout they inherit.**
// ADR 0013 makes "which screens carry the shell" load-bearing — a *mode* has no
// navigation, and that is what a mode *is* — so it is written at each of the
// three call sites where it can be seen, rather than defaulted into and then
// switched off twice.
//
// ⚠️ **`05` §5's measures, and `10` §2.2 adds no sixth.** Ingest takes 760 (one
// object of attention that the reader acts on); the Sources list and Stats take
// 940 (a list is read across).

import type { Place } from '~~/shared/utils/origin'

withDefaults(
  defineProps<{
    origin: Place
    flagged: number
    due: number
    newToday: number
    /** `05` §5's measure for this *place* — `10` §2.2. */
    measure?: string
  }>(),
  { measure: 'var(--k-measure-read)' },
)
</script>

<template>
  <div>
    <ShellBar />

    <main :style="{ '--measure': measure }">
      <StartBlock :origin="origin" :flagged="flagged" :due="due" :new-today="newToday" />

      <slot />
    </main>

    <!-- ⚠️ **EDRDG's licence §3 asks for the acknowledgement on the app's site**,
         with links (#30, `docs/kanjidic-research.md` §7 call 2). It sits on the
         three *places* and not in a *mode*, which has no chrome (ADR 0013); the
         retry *Review* shows quotes nothing from the file, so no screen owes it
         per display. `server/data/kanjidic/NOTICE.md` is the repository's half.

         ⚠️ **The first line is #68's, and it is the starter set's** (ADR 0075
         §8): JMdict under the same licence, and Jonathan Waller's JLPT lists
         under CC BY, which asks for his site to be credited. The prototype puts
         this sentence on the Welcome screen (#71); until that screen exists it
         is here, on every *place*. `subjects/starter/NOTICE.md` is the
         repository's half. -->
    <footer :style="{ '--measure': measure }">
      <p>
        Words and meanings from
        <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project">JMdict</a>,
        the open Japanese dictionary, © EDRDG, used under its
        <a href="https://www.edrdg.org/edrdg/licence.html">licence</a>
        (<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>).
        JLPT levels from
        <a href="https://www.tanos.co.uk/jlpt/">Jonathan Waller's JLPT Resources</a>
        (<a href="https://www.tanos.co.uk/jlpt/sharing/">CC BY</a>), by way of
        <a href="https://github.com/stephenmk/yomitan-jlpt-vocab">yomitan-jlpt-vocab</a>
        (CC BY-SA 4.0).
      </p>
      <p>
        Kanji readings from
        <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project">KANJIDIC2</a>,
        © EDRDG, under the same licence.
      </p>
    </footer>
  </div>
</template>

<style scoped>
main {
  max-width: var(--measure);

  /* `10` §3.2: the start block sits `28px` below the bar's rule, `--k-gutter`
     aligned, with no rule of its own. */
  padding: var(--k-space-6) var(--k-gutter) var(--k-space-10);
}

/* One quiet line under the page, in the fact row's 10px mono (`05` §4). */
footer {
  max-width: var(--measure);
  padding: 0 var(--k-gutter) var(--k-space-6);
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--k-ink-quiet);
}

footer p {
  margin: 0;
}

footer p + p {
  margin-top: var(--k-space-1);
}

footer a {
  color: inherit;
}
</style>
