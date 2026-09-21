# A seeded list is a draft the reader submits, and its request has its own ledger row

**Decided 2026-09-21, for [#25](https://github.com/yutaasakura96/kioku/issues/25)**, in triage with
Yuta. It answers the four open questions #25 was filed with. It covers the second of
[ADR 0063](0063-the-input-is-a-chosen-word-list.md)'s three ways a word gets in: a model proposes a
list for a *domain* and a *level*.

## Why this needed deciding

ADR 0063 named AI-seeded lists and left the mechanism open. Three facts in the code narrow it:

- **The Anthropic key exists only in `worker/.env`.** The app makes no model request (`03` §3). So
  the seeding request is worker work whichever screen asks for it.
- **The spend ledger is `ingestion`**: one row per *source*, with `input_tokens`, `output_tokens`,
  `cost_micro_usd` and `price_table_effective_date` (`04` §6.1). The seeding request runs before any
  *source* exists, so it has no row to go on.
- **`filter_known` drops a word the corpus already has before `generate` spends anything**
  (`worker/pipeline/filter_known.py`, checked 2026-09-21). A repeated seed costs nothing at
  `generate`. It does cost the seed request itself, and that request returns mostly known words.

## What is decided

**1. The seed is a draft, and the reader submits it.** *Ingest* takes a *domain*, a *level* and a
count. The worker returns a list, and the list lands pre-filled in *Ingest*'s word-list field. The
reader submits it unchanged with one action, or removes words first. What is submitted is an
ordinary `word_list` *source*, and its `source.content` is the list as submitted. The reader chose
every word in it, even when the choice was to accept the draft whole, so ADR 0063's premise holds.
There is no third pipeline, and no new `source.kind`.

**2. Each seeding request has its own ledger row.** It records the same fields `ingestion` does
(model, prompt version, tokens from the API response, micro-USD cost, price-table date, requester),
plus the *domain*, *level* and count asked for and the list returned. A draft the reader never
submits is still counted. `/stats`' cost figures include seed rows.

**3. *Time-to-first-review* is unchanged.** It still runs from `source.submitted_at`, which is after
the draft is accepted, so it does not count the seed request or the time the draft waits on the
screen. It measures the pipeline from submission to first review. The reader's time spent deciding
is not part of it, and that is why it stays out.

**4. The seed prompt excludes what the corpus already has.** It lists the owner's existing terms
whose `domain_claim` and `level_claim` match the request, so the model proposes new words.
`filter_known` stays as the backstop for anything the model repeats anyway. At about 475 *notes*
this adds a few thousand input tokens a request. The cost grows with the corpus, and the revisit
condition below covers that.

**Carried from #25 and not re-opened:** the *domains* and *levels* are the *subject*'s closed sets
(ADR 0065), and nothing is vetted (ADR 0064). A useless seeded word leaves through the flag queue.

## Left to the build

- **The shape of the ledger row and its job.** `job.ingestion_id` is `NOT NULL` and `job_kind`
  allows only `ingest` and `resume` today, so a seed job needs either a nullable `ingestion_id` with
  a `seed` reference, where exactly one of the two is set, or a table of its own. Choose the one
  that keeps the claim, heartbeat and sweep code single.
- **How the draft reaches the screen.** The worker may be offline (ADR 0022's laptop). The draft
  waits the way any queued job does, and the screen says so.
- **The count's bounds.** They are bounded by `S2`'s cap and the 25-term word-list *chunk*.

## Alternatives considered

- **One shot: domain, level and count go straight to a *source*.** One fewer action, but
  `source.content` would hold a list the reader never saw, which weakens ADR 0063's premise that a
  word is chosen. Rejected.
- **Fold the seed's tokens into the resulting `ingestion` row.** No new table, but one row would mix
  two prompt versions, and a draft the reader discards would never be counted. Rejected.
- **Rely on `filter_known` alone for repeats.** A simpler prompt, but later seeds for the same
  *domain* and *level* would give only a handful of new *cards* per paid request. Rejected.

## Revisit if

- The exclusion list makes a seed request's input cost more than its output. Then send a sample or
  a count instead of every known term.
- The reader almost never edits a draft before submitting. Then the draft step is one action too
  many, and the one-shot alternative is worth another look.
- Seeded *notes* get flagged noticeably more often than listed ones (ADR 0062's flag rate, split by
  how the list was made). Then the seed prompt is the problem, not the pipeline.
