<script setup lang="ts">
// `05` §7's *card*, and `10` §5.4's two faces.
//
// ⚠️ **The two faces are one *card* rendered through one *template*** (ADR
// 0002): the declaration's `prompt` is the front and its `answer` is the back,
// so a second *template* is a row in `subjects/jlpt-vocab.json` rather than a
// second component. Nothing here names a field except the type ramp below.
//
// ⚠️ **`05` §4's type ramp is written per *field name* and the declaration has
// no role that would generalise it** — § Carrying carries this in full, and
// `app/components/VetNote.vue` holds the same map for the same reason. "The
// *meaning* at 36px Newsreader" and "the example sentence at 22px Mincho" are
// three JLPT field names, not three roles; the declaration carries `kind`,
// `required`, `memory_bearing` and `label` and nothing that says *this value is
// Japanese prose read at length*. **A second *subject* closes it in the
// declaration** (ADR 0003), not in a third map.
//
// ⚠️ **One value moves from `05` §7** (`10` §5.4, via §2.3): the
// *meaning*-to-example-pair gap is `28px` rather than `30px`. Nothing else on
// the card changes.

import type { SubjectDeclaration, SubjectTemplate } from '#shared/subject/declaration'

const props = defineProps<{
  fields: Record<string, string>
  declaration: SubjectDeclaration
  templateKey: string
  /** `10` §5.1's two states. The front is the *term* alone. */
  face: 'front' | 'back'
}>()

const template = computed<SubjectTemplate | undefined>(() =>
  props.declaration.templates.find(entry => entry.key === props.templateKey),
)

const prompt = computed(() => template.value?.prompt ?? [])

/**
 * The back's fields, in the order the declaration lists them — ⚠️ **`reading`
 * first, and it is the one this ticket does not draw around**:
 * [#15](https://github.com/yutaasakura96/kioku/issues/15) is in front of
 * *Review* on the screen rather than behind it. ADR 0045 makes the *reading* a
 * field on the answer side, and the reading half of ADR 0006's *identity key* is
 * the **surface**'s, so the first *card* studied from an inflected word shows
 * ひらい rather than ひらく. Fixing that changes the identity of existing
 * *notes*, which is why it is its own ticket and not a patch here.
 */
const answer = computed(() => template.value?.answer ?? [])

const value = (name: string) => props.fields[name] ?? ''

/** Which of `05` §4's entries a field is rendered at. */
function roleOf(name: string): string {
  switch (name) {
    case 'reading': return 'reading'
    case 'meaning': return 'meaning'
    case 'example_sentence': return 'example'
    case 'example_gloss': return 'gloss'
    default: return 'fact'
  }
}

/** The Japanese faces, so `:lang(ja)` puts Mincho on them (`05` §4). */
const JAPANESE = new Set(['term', 'reading', 'example_sentence'])
</script>

<template>
  <article class="card" :class="face">
    <!-- The front: the *term* alone at 104px, centred both ways. On the back it
         is the same element at the same size, which is what makes the reveal a
         change of what is *under* it rather than a new screen. -->
    <div class="prompt">
      <p
        v-for="name in prompt"
        :key="name"
        class="term"
        :lang="JAPANESE.has(name) ? 'ja' : undefined"
      >
        {{ value(name) }}
      </p>
    </div>

    <template v-if="face === 'back'">
      <template v-for="name in answer" :key="name">
        <!-- ⚠️ The fact row is last and carries its eyebrow, which is the
             declaration's own `label` rather than a string written here. -->
        <p v-if="roleOf(name) === 'fact'" class="fact">
          <span class="eyebrow">{{ declaration.fields.find(field => field.name === name)?.label }}</span>
          <span class="fact-value" :lang="JAPANESE.has(name) ? 'ja' : undefined">{{ value(name) }}</span>
        </p>

        <p
          v-else
          class="value"
          :class="roleOf(name)"
          :lang="JAPANESE.has(name) ? 'ja' : undefined"
        >
          {{ value(name) }}
        </p>
      </template>
    </template>
  </article>
</template>

<style scoped>
/* `05` §7: 760px, `min-height: 527px`, `--k-raised`, `1px --k-rule-raised`,
   `--k-radius-card`, `--k-shadow-card`, padding `54px 64px 46px` — asymmetric,
   more at the top than the bottom. */
.card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--k-measure-object);
  min-height: 527px;
  box-sizing: border-box;
  padding: 54px 64px 46px;
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
  box-shadow: var(--k-shadow-card);
}

/* The front is the *term* alone, centred both ways — so the prompt takes the
   whole card until there is an answer under it. */
.card.front .prompt {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* `05` §4's third display size: 104px Mincho **400** — recall, where *Vet*'s
   term at 54px is 500 for judgement (`10` §10.2). */
.term {
  margin: 0;
  font-size: 104px;
  font-weight: 400;
  line-height: 1.1;
  text-align: center;
  color: var(--k-ink);
}

.card.back .term {
  text-align: left;
}

/* `10` §5.4: the *reading* `16px` below the *term*, then a full-width rule at
   `38px / 34px`. The rule is drawn on the *meaning* rather than as its own
   element so the two gaps stay the two numbers the document gives. */
.value.reading {
  margin: var(--k-space-4) 0 0;
  font-size: 25px;
  color: var(--k-ink-quiet);
}

.value.meaning {
  margin: 38px 0 0;
  padding-top: 34px;
  border-top: 1px solid var(--k-rule-raised);
  font-size: 36px;
  font-weight: 300;
  line-height: 1.25;
  color: var(--k-ink);
}

/* ⚠️ `28px`, not `05` §7's `30px` — `10` §2.3 moved it and §5.4 states it. */
.value.example {
  margin: var(--k-space-6) 0 0;
  font-size: 22px;
  line-height: 1.65;
  color: var(--k-ink-quiet);
}

.value.gloss {
  margin: var(--k-space-2) 0 0;
  font-size: 16px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

.fact {
  display: flex;
  align-items: baseline;
  gap: var(--k-space-3);
  margin: var(--k-space-8) 0 0;
}

/* `05` §4's muted eyebrow: 10px mono at 0.14em. */
.eyebrow {
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

.fact-value {
  font-size: 15px;
  color: var(--k-ink-value);
}

/* `10` §10.2 — the phone layout, which *Review* alone gets (ADR 0026). */
@media (width < 720px) {
  .card {
    min-height: 60vh;
    padding: 32px 20px 28px;
  }

  /* ⚠️ 54px is *Vet*'s *term* size and that is not a collision: 104px cannot
     hold a four-character term inside 295px of card, the system owns nothing
     between 54 and 104, and the two never co-occur because *Vet* has no phone
     layout at all. The weight distinguishes them anyway — 400 for recall. */
  .term {
    font-size: 54px;
  }

  .value.reading {
    font-size: 18px;
  }

  /* ⚠️ **24px is where the *meaning* stops being display type.** `05` §4 puts
     English display type at weight 300 above 24px; at 24px the ramp's own entry
     is Newsreader **400**, so the weight changes with the size rather than the
     size alone. */
  .value.meaning {
    font-size: 24px;
    font-weight: 400;
  }

  .value.example {
    font-size: 17px;
  }

  .value.gloss {
    font-size: 14px;
  }
}
</style>
