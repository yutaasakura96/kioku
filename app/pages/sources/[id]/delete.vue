<script setup lang="ts">
// The delete confirmation — `10` §7.3, `09` §4.11, `S11`.
//
// ⚠️ **A page, not a modal.** A *place* has no client to hold a dialog, so the
// delete is two steps: this page, then a `POST` to `/api/source/:id/delete`
// that answers `303` back to `/sources/:id`.
//
// ⚠️ **The count is the whole reason the page exists** (`10` §7.3), so it is the
// 46px statement and not a line in the body — and when it is zero the statement
// says so, because 41 and 0 are the difference between a pause and a click. It
// is read through the same predicate the `POST` suspends by
// (`server/utils/ingest/delete.ts`).
//
// ⚠️ **There is no primary control on this page.** The submit takes the quiet
// affordance without its arrow and `Keep it` is a plain accent link: this page
// has no action it wants to encourage, and the loudest face in the system on
// the irreversible half is how a reader who arrived by mistake leaves without a
// *source*.

import { isUuid } from '~~/shared/utils/uuid'

const route = useRoute()
const id = String(route.params.id)

const counts = await useStartBlockCounts()
// ⚠️ **An id that is not an id is a `404`, not a database error** — it arrives
// in the URL, and `shared/utils/uuid.ts` is the shape `04` §1 gives every key.
const deletion = isUuid(id) ? ((await usePlace()?.sourceDeletion(id)) ?? null) : null

if (!deletion)
  throw createError({ statusCode: 404, statusMessage: 'No such source', fatal: true })

const statement = deletion.cardCount === 0
  ? 'No cards will be suspended.'
  : `${deletion.cardCount} ${deletion.cardCount === 1 ? 'card' : 'cards'} will be suspended.`
</script>

<template>
  <PlaceShell origin="/sources" :flagged="counts.flagged" :due="counts.due" :new-today="counts.newToday">
    <section class="confirm">
      <EmptyBlock tag="h1">
        <template #statement>
          {{ statement }}
        </template>
        <template #body>
          Deleting {{ deletion.title }} deletes no review history, no note and no card. Its cards
          leave the schedule, and the source stays readable.
        </template>

        <div class="controls">
          <form method="post" :action="`/api/source/${deletion.id}/delete`">
            <button type="submit" class="quiet">
              Delete this source
            </button>
          </form>
          <NuxtLink :to="`/sources/${deletion.id}`" class="keep">
            Keep it
          </NuxtLink>
        </div>
      </EmptyBlock>
    </section>
  </PlaceShell>
</template>

<style scoped>
.confirm {
  margin-top: var(--k-space-8);
}

/* `10` §7.3: the two controls, `28px` apart. */
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--k-space-6);
}

.controls form {
  margin: 0;
}

/* `05` §7's quiet affordance **without its arrow** — `10` §7.3 gives its
   geometry: `--k-raised`, `1px --k-border-control`, `13px 20px`, 17px `--k-ink`. */
.quiet {
  padding: 13px 20px;
  background: var(--k-raised);
  border: 1px solid var(--k-border-control);
  border-radius: var(--k-radius-control);
  font-family: var(--k-face-en);
  font-size: 17px;
  color: var(--k-ink);
  cursor: pointer;
}

.quiet:hover {
  background: var(--k-key-face);
}

/* A plain accent link (`05` §2). */
.keep {
  font-size: 17px;
  color: var(--k-accent);
}

.keep:hover {
  color: var(--k-accent-hover);
}
</style>
