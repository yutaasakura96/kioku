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
    :pending="counts.pending"
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

    <form method="post" action="/" class="form">
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

.field + .field,
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
