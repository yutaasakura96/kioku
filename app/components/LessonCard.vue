<script setup lang="ts">
// One word, taught — ADR 0076 §1, the prototype's `.lesson`: the word, how it
// is read, what it means, its part of speech and *level*, and an example.
//
// ⚠️ **The example is drawn only when the *note* has one** (ADR 0076 §8). A
// starter word has none (ADR 0075 §7) and its screen is simply shorter; no
// sentence is invented and no empty slot is drawn.
//
// ⚠️ **The meaning shown large is the first of the gloss, and the rest follow
// it small.** The quiz accepts any of them (ADR 0069 §3), so a lesson that
// showed one would be teaching a narrower answer than the one it will take.

import { glossPieces } from '#shared/review/answer'

const props = defineProps<{
  /** `note.fields`, as the snapshot holds them. */
  fields: Record<string, string>
  /** The list's *level* for the word, or `null` when no list places it. */
  level: string | null
}>()

const meanings = computed(() => glossPieces(props.fields.meaning ?? ''))
const others = computed(() => meanings.value.slice(1, 4))
</script>

<template>
  <article class="lesson">
    <div class="term" lang="ja">
      {{ fields.term }}
    </div>
    <!-- A kana word is its own reading (ADR 0069 §4). -->
    <div v-if="fields.reading !== fields.term" class="reading" lang="ja">
      {{ fields.reading }}
    </div>

    <hr>

    <div class="meaning">
      {{ meanings[0] ?? fields.meaning }}
    </div>
    <p v-if="others.length > 0" class="others">
      Also: {{ others.join(', ') }}
    </p>

    <div v-if="fields.part_of_speech || level" class="tags">
      <span v-if="fields.part_of_speech" class="tag">{{ fields.part_of_speech }}</span>
      <span v-if="level" class="tag">JLPT {{ level }}</span>
    </div>

    <div v-if="fields.example_sentence" class="example">
      <p lang="ja">
        {{ fields.example_sentence }}
      </p>
      <p v-if="fields.example_gloss">
        {{ fields.example_gloss }}
      </p>
    </div>
  </article>
</template>

<style scoped>
.lesson {
  padding: 44px 48px 36px;
  background: var(--k-raised);
  border: 1px solid var(--k-rule-raised);
  border-radius: var(--k-radius-card);
  box-shadow: var(--k-shadow-card);
  text-align: center;
}

.term {
  font-size: 96px;
  line-height: 1.1;
  letter-spacing: 0.04em;
  /* A long word is one line as far as it can be, and wraps before it clips. */
  overflow-wrap: anywhere;
}

.reading {
  margin-top: 10px;
  font-size: 26px;
  color: var(--k-ink-secondary);
}

hr {
  margin: 28px 0 24px;
  border: 0;
  border-top: 1px solid var(--k-rule-raised);
}

.meaning {
  font-size: 36px;
  font-weight: 300;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.others {
  margin: 10px 0 0;
  font-size: 16px;
  color: var(--k-ink-secondary);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--k-space-2);
  margin-top: var(--k-space-3);
}

.tag {
  display: inline-block;
  padding: 2px 7px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: 999px;
  font-family: var(--k-face-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--k-ink-value);
  white-space: nowrap;
}

.example {
  margin-top: 26px;
}

.example p {
  margin: 0;
}

.example p:first-child {
  font-size: 22px;
  line-height: 1.6;
  color: var(--k-ink-quiet);
}

.example p:last-child:not(:first-child) {
  font-size: 16px;
  font-style: italic;
  color: var(--k-ink-secondary);
}

@media (width < 720px) {
  .lesson {
    padding: 28px 18px 26px;
  }

  .term {
    font-size: 68px;
  }

  .meaning {
    font-size: 28px;
  }

  .example p:first-child {
    font-size: 19px;
  }
}
</style>
