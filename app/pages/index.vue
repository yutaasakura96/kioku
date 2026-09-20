<script setup lang="ts">
// Ingest — the *place*, and the landing route (ADR 0031). `noScripts: true`.
//
// ⚠️ **Signing in puts the reader in front of the form, not in front of a
// choice** (ADR 0031). `08` §6.3 discards the requested path on a redirect to the
// door, which is exactly why `/` has to be worth landing on, and PRD §4 makes
// Ingest "the only screen that works with nothing ingested".
//
// ⚠️ **The page reads its data from the request event**, not from a fetch —
// `server/middleware/shell-data.ts` carries that argument in full, and
// `app/pages/auth/index.vue` established the idiom in #5. The three *places*
// render only on the server; `useRequestEvent()` returns `undefined` anywhere
// else, so every read below falls back to the empty state rather than to a
// half-rendered screen.
//
// ⚠️ **There is no live character counter** (`10` §6.2). The cap is 100,000
// characters and this route ships no JavaScript, so nothing can count as the
// reader types. The count appears in the refusal, which is the honest
// consequence of ADR 0013's split rather than a thing to work around.

import { resolveExisting } from '~~/shared/ingest/existing'
import { INGEST_DEFAULT_SOURCE_KIND, SUBMITTABLE_SOURCE_KINDS } from '~~/shared/ingest/kind'

const event = useRequestEvent()
const place = usePlace()

// ⚠️ `09` §4.2 — the refused submission, with the reader's text in it. It is
// present only on a `POST /` that was refused, and the response is a `200`
// carrying this document (`server/middleware/submit-source.ts`).
const failure = event?.context.ingestFailure ?? null

/**
 * ⚠️ **One newline more than the reader typed, because the HTML parser eats
 * exactly one.**
 *
 * Measured 2026-09-11, and it corrects a comment in this file that had asserted
 * the opposite from memory. `@vue/compiler-ssr` compiles a `value` bind on a
 * `<textarea>` into the element's **raw children** — `isTextareaWithValue` — so
 * `:value` and text between the tags render identically, and the parser's rule
 * applies to both: *the first newline immediately after `<textarea>` is
 * dropped*. A paste that begins with a blank line therefore comes back one line
 * shorter than it went in.
 *
 * That is precisely the loss `09` §4.2 exists to prevent — "a redirect would
 * throw away a paste the reader cannot get back" is about the whole paste, and
 * silently shortening it is the same failure in miniature and harder to notice.
 * Prepending one newline makes the eaten one ours.
 */
const refusedContent = computed(() => `\n${failure?.content ?? ''}`)

/**
 * ⚠️ **A word list is the default and prose is the other choice** — ADR 0063 §5.
 * Prose ingestion is kept: it is built, it has tests, it is the only path that
 * produces *occurrences* in real text, and `S11` still points at it. What it
 * loses is its place as the default, because mining prose answers *which words
 * are in this text* and the question is *which words do I want*.
 *
 * ⚠️ **The order of the radios is the order of the constant**, so the default is
 * first on the screen as well as first in the code. ⚠️ **`anki` joined them on
 * 2026-09-20** (ADR 0068, #26) and is last, because a deck is the least common
 * of the three; #24's research is what it was waiting for.
 */
const kinds = SUBMITTABLE_SOURCE_KINDS

const KIND_LABELS: Record<string, { label: string, hint: string }> = {
  word_list: { label: 'Word list', hint: 'One term per line.' },
  prose: { label: 'Prose', hint: 'Mined for the words in it.' },
  // ⚠️ *Deck*, not *cards*: `CONTEXT.md` gives *Card* an `_Avoid_` list and a
  // Kioku *card* is one rendering of a *note* through a *template*, which is not
  // what an Anki note is. The hint says what the reader gets back.
  anki: { label: 'Anki deck', hint: 'A .apkg, read into a word list.' },
}

/**
 * ⚠️ **What the file picker offers, by *kind*** — ADR 0068, #26. It is a hint
 * to the picker and never a check: the server reads whatever arrives, and
 * `unpackDeck` is what refuses a file that is not a deck, by name.
 *
 * ⚠️ **There is no JavaScript to change this when the radio changes** (ADR 0020
 * — Ingest ships none), so the attribute is the union and the reader's choice of
 * radio is what actually decides how the bytes are read. A picker that offered
 * only `.txt` would hide the deck the reader came to upload.
 */
const FILE_ACCEPT = '.txt,text/plain,.apkg,application/zip'

// A refused submission keeps the reader's answer. Everything else on the form
// comes back; this must too, or a refusal silently changes what they said the
// material was.
const selectedKind = failure?.kind && (kinds as readonly string[]).includes(failure.kind)
  ? failure.kind
  : INGEST_DEFAULT_SOURCE_KIND

const counts = await useStartBlockCounts()
const runs = (await place?.runs()) ?? []

// ⚠️ **One instant for every figure on the page** — `09` §2. Two rows stamped a
// millisecond apart would be two page loads, and the aside under the start block
// promises one.
const now = new Date()

// PRD §5: identical content resubmitted creates a new *source* and the screen
// offers to open the existing one. The id rides in `?existing=` because the
// answer is a `303` and there is nothing else to carry it in (`09` §4.2).
const route = useRoute()
const existingId = resolveExisting(route.query.existing)
const existingTitle = existingId ? (await place?.sourceTitle(existingId)) ?? null : null
</script>

<template>
  <PlaceShell
    origin="/"
    :flagged="counts.flagged"
    :due="counts.due"
    measure="var(--k-measure-object)"
  >
    <!-- `10` §6.1: the start block and its aside, then **the runs**, then the
      form. The reader submits, gets `303`'d back here, and the thing they just
      did is above the thing they might do next (`09` §3 step 7). -->
    <section class="runs">
      <p v-if="existingTitle" class="existing">
        Identical to an earlier source —
        <NuxtLink :to="`/sources/${existingId}`">{{ existingTitle }}</NuxtLink>.
      </p>

      <ul v-if="runs.length" class="list">
        <RunRow v-for="run in runs" :key="run.ingestionId" :run="run" :now="now" />
      </ul>
    </section>

    <!-- ⚠️ **`enctype` is load-bearing, not decoration.** A urlencoded form sends
      a file input's *name* and not its bytes, so the `.txt` ADR 0063 asks for
      needs `multipart/form-data`. `server/middleware/submit-source.ts` reads
      both encodings, because the resume control above still posts the other. -->
    <form method="post" action="/" enctype="multipart/form-data" class="form">
      <!--
        ⚠️ **The action is `/`, not `/api/source`.** `09` §1's table said the
        latter and is amended: a refused paste has to be answered with this
        document re-rendered and the text still in it, and a Nitro route handler
        cannot render a page. `server/middleware/submit-source.ts` carries the
        two measurements behind the change.

        ⚠️ **A same-site form `POST` carries the session cookie and a cross-site
        one does not**, which is the CSRF story with nothing added — `SameSite=Lax`
        sends the cookie cross-site only for top-level navigations using a safe
        method, which excludes `POST` (`09` §1, verification §12.2).
      -->
      <!-- `10` §6.2's form, with ADR 0063's question first: what is this? It is
        above the title because it decides what the other fields mean — a *word
        list* is read line by line and prose is mined for the words in it, and a
        reader who answers it last has typed everything under the wrong heading.

        ⚠️ **Radios and not a `<select>`.** Two choices, both worth reading, on a
        route that ships no JavaScript: a select hides the alternative behind a
        click and gains nothing when the whole list fits on one line. -->
      <fieldset class="kinds">
        <legend class="eyebrow">SOURCE</legend>
        <label v-for="kind in kinds" :key="kind" class="kind">
          <input
            type="radio"
            name="kind"
            :value="kind"
            :checked="kind === selectedKind"
          >
          <span class="kind-label">{{ KIND_LABELS[kind]?.label }}</span>
          <span class="kind-hint">{{ KIND_LABELS[kind]?.hint }}</span>
        </label>
      </fieldset>

      <label class="field">
        <span class="eyebrow">TITLE</span>
        <input
          name="title"
          type="text"
          autocomplete="off"
          :value="failure?.title ?? ''"
        >
      </label>

      <!-- ⚠️ `10` §6.3 places this **above the content field**, not at the top
        of the form: it is a sentence about the field beneath it, and a message
        floating above an untouched title box reads as being about that box. -->
      <p v-if="failure" class="refusal">
        {{ failure.message }}
      </p>

      <label class="field">
        <span class="eyebrow">CONTENT</span>
        <!--
          ⚠️ **The reader's text, back in the box.** `09` §4.2 argues this at
          length: a `303` after a rejected 120,000-character paste loses a paste
          that cannot be got back, and there is no client to hold it.

          The value carries one newline more than the reader typed — see
          `refusedContent` above. `:value` and text between the tags render the
          same thing here, so the choice between them buys nothing; what matters
          is the extra newline.
        -->
        <textarea
          name="content"
          :class="{ refused: failure }"
          :value="refusedContent"
        />
      </label>

      <!-- ⚠️ **A `.txt` reaches the same handler as a paste** (ADR 0063), so
        there is one submit control and not two: the file is read into the same
        `content`, `S2`'s cap refuses an over-cap upload before any spend, and
        the refusal renders on this screen like every other.

        ⚠️ **`accept` is a hint to the file picker and never a check.** The
        server reads whatever arrives and the cap is what refuses it; a browser
        will happily post a file whose extension says otherwise.

        ⚠️ **An `.apkg` is a file and only a file** (ADR 0068): there is nothing
        to paste, so choosing *Anki deck* above and leaving this empty is
        refused by name (`no_file`) rather than read as an empty paste. -->
      <label class="field file">
        <span class="eyebrow">OR A FILE</span>
        <input name="file" type="file" :accept="FILE_ACCEPT">
      </label>

      <!-- `10` §6.2: the full-width primary control. ⚠️ **Its key hint slot is
        empty and the label centres alone** — there is no key on a route with no
        client, and a key cap naming a key that does nothing is worse than no
        cap. -->
      <button type="submit" class="submit">
        Ingest
      </button>
    </form>
  </PlaceShell>
</template>

<style scoped>
.runs {
  margin-top: var(--k-space-7); /* 32px */
}

.list {
  margin: 0;
  padding: 0;
}

/* PRD §5's offer. Accent link text — `05` §2 spends the accent on what costs
   you the decision, and whether this paste was a mistake is one. */
.existing {
  margin: 0 0 var(--k-space-5);
  font-size: 15px;
  color: var(--k-ink);
}

.existing a {
  color: var(--k-accent);
}

.existing a:hover {
  color: var(--k-accent-hover);
}

.form {
  margin-top: var(--k-space-8); /* 40px */
}

/* ⚠️ **No colour is spent on the refusal** (`10` §6.3). The accent is for where
   you are and what costs you the decision; a validation message is neither, and
   a red that means "wrong" would be an eighth colour saying something the
   sentence already says. */
.refusal {
  margin: var(--k-space-6) 0 var(--k-space-3);
  font-size: 15px;
  color: var(--k-ink);
}

.field {
  display: block;
}

/* ⚠️ **No new colour and no new type size** (`05` §2, §4). The kind chooser is
   made of the eyebrow, the body face and the ink ramp — the accent is for where
   you are and what costs you the decision, and this costs you neither: choosing
   wrong is one resubmission. */
.kinds {
  margin: 0;
  padding: 0;
  border: 0;
}

.kinds legend {
  padding: 0;
  margin-bottom: var(--k-space-2);
}

.kind {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: baseline;
  gap: var(--k-space-2);
  font-family: var(--k-face-en);
  font-size: 15px;
  color: var(--k-ink);
  cursor: pointer;
}

.kind + .kind {
  margin-top: var(--k-space-2);
}

.kind-hint {
  font-size: 13px;
  color: var(--k-ink-secondary);
}

/* The file input draws itself; what it gets here is the same eyebrow and the
   same rhythm as the two fields above it. */
.file input {
  padding: 0;
  background: none;
  border: 0;
  font-size: 14px;
}

.field + .field,
.kinds + .field,
.refusal + .field {
  margin-top: var(--k-space-6); /* 28px */
}

.eyebrow {
  display: block;
  margin-bottom: var(--k-space-2); /* 8px */
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--k-ink-secondary);
}

input,
textarea {
  box-sizing: border-box;
  width: 100%;
  padding: var(--k-space-3) var(--k-space-4); /* 12px 16px */
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);

  /* The content field is prose the reader pasted; it is read at body size, not
     at data size — `10` §6.2. */
  font-family: var(--k-face-en);
  font-size: 17px;
  color: var(--k-ink);
}

textarea {
  min-height: 320px;
  resize: vertical;
}

/* `10` §6.3: on a refusal the field keeps a `1px --k-ink-secondary` border
   rather than its resting one. One ramp step, no new colour. */
textarea.refused {
  border-color: var(--k-ink-secondary);
}

/* `05` §7's primary control, full width of its column. */
.submit {
  display: block;
  width: 100%;
  margin-top: var(--k-space-6);
  padding: 9px 0;
  background: var(--k-ink-ground);
  border: 1px solid var(--k-ink-ground);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 14px;
  color: var(--k-ground);
  cursor: pointer;
}

/* An inverted control has no face left to darken, so its hover moves its ink —
   `10` §3.3. It gets no active state, because it submits immediately. */
.submit:hover {
  color: var(--k-on-ink);
}
</style>
