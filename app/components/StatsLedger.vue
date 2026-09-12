<script setup lang="ts">
// `10` §8.3 — tokens and cost per *ingestion*, "rows written when they happened
// rather than metrics scraped from logs" (`03` §12).
//
// ⚠️ **The title comes from `ingestion.source_title`, not from a join.** `04` §9
// makes `ingestion.source_id` `SET NULL` and snapshots the title at submit
// precisely so **the spend ledger survives a hard delete** — a ledger that read
// the *source* would lose the row the moment the material is gone, which is the
// one case the snapshot exists for.
//
// ⚠️ **`worker_environment` is a column here as well as a line on the figure
// above** (`03` §12). It is not duplication: the figure says which environment
// the *measurement* was taken in, and this says which one each *run* spent in.
// A ledger with both `laptop` and `server` in it is what ADR 0022's move looks
// like from underneath.

import { costUsd } from '~~/shared/metrics/stats'
import type { LedgerRow } from '~~/server/utils/stats/queries'

defineProps<{ rows: LedgerRow[] }>()

/**
 * ⚠️ **Null in, dash out — the cost is read, never estimated** (`11` §3, `04`
 * §6.1). A run that recorded tokens and no cost has no cost, and ADR 0018's
 * price table has an effective date: multiplying the tokens by a constant here
 * would start lying silently the day the provider changes a price.
 */
function cost(microUsd: bigint | null): string {
  const dollars = costUsd(microUsd)
  return dollars === null ? '—' : `$${dollars.toFixed(4)}`
}

const tokens = (value: number | null) => (value === null ? '—' : value.toLocaleString('en-GB'))
</script>

<template>
  <section v-if="rows.length" class="ledger">
    <div class="row head">
      <span class="eyebrow source">Source</span>
      <span class="eyebrow">Model</span>
      <span class="eyebrow value">Tokens in</span>
      <span class="eyebrow value">Tokens out</span>
      <span class="eyebrow value">Cost</span>
      <span class="eyebrow">Environment</span>
    </div>

    <div v-for="row in rows" :key="row.ingestionId" class="row">
      <span class="title">{{ row.title }}</span>
      <span class="fact">{{ row.modelId ?? '—' }}</span>
      <span class="fact value">{{ tokens(row.inputTokens) }}</span>
      <span class="fact value">{{ tokens(row.outputTokens) }}</span>
      <span class="fact value">{{ cost(row.costMicroUsd) }}</span>
      <span class="fact">{{ row.workerEnvironment }}</span>
    </div>
  </section>
</template>

<style scoped>
/* `10` §8.3: 940px, a `--k-rule` above the first row, `--k-rule` between rows,
   `20px` padding. */
.ledger {
  margin-top: var(--k-space-8);
  border-top: 1px solid var(--k-rule);
}

.row {
  display: grid;
  grid-template-columns: 2fr 1.2fr 0.8fr 0.8fr 0.8fr 0.9fr;
  gap: var(--k-space-3);
  align-items: baseline;
  padding: var(--k-space-5) 0;
  border-bottom: 1px solid var(--k-rule);
}

.head {
  padding: var(--k-space-3) 0;
}

.eyebrow {
  font-family: var(--k-face-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--k-ink-secondary);
}

.title {
  font-size: 15px;
  color: var(--k-ink);
}

.fact {
  font-family: var(--k-face-mono);
  font-size: 12px;
  color: var(--k-ink-value);
}

.value {
  text-align: right;
}
</style>
