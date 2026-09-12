# Project status

**Project:** Kioku (記憶) — builds spaced-repetition decks automatically from bulk source material,
and is the app they're studied in. First subject: JLPT vocabulary.
**Phase:** 6 — Build. **Open.** Phases 1–5 are closed; the spec and the route are published.
**50 ADRs**, eleven documents, an empty frontier, and **eight open issues** on the tracker — #1 the
spec, #5, #10 (which closes when this work merges), #11–#14, and **#15, which #9 found and did not
fix**.
**#2 through #10 are built.** ⚠️ **The frontier is
[#11](https://github.com/yutaasakura96/kioku/issues/11) alone**, and it is **much smaller than its
ticket** — see § Next. There is a schema, a door, a *subject* declaration both toolchains read, a
reader who can paste two pages of Japanese and get control back, a worker that wakes up and claims
the job, a pipeline that turns that paste into *pending notes* one *chunk* at a time — and now
**a reader who can see one, judge it in a keystroke, and mint a *card* by doing so.** What nothing
does yet is **review** one: `card` rows exist with no *scheduling epoch* under them, which is #12's.
⚠️ **#5 is still open on the tracker while `00-status.md` records it closed.** Nobody has ever signed
in — there is no Google client, no redirect URI and no `.env`. Whether that closes it is Yuta's call
and it is the one thing this file and the tracker disagree about.
**Updated:** 2026-09-12

Read `CLAUDE.md` first, then this.

## Done

**Phase 6, #10 — *Vet* as a *mode*, 2026-09-12.** **A *pending note* is now on a screen, and one
keystroke turns it into a *card*.** `/vet` replaces the *shell* entirely; `space`, `R` and `E` each
cost one keystroke; acceptance mints in the same transaction; `Z` un-mints and **fails visibly** when
the database refuses; Done ends the run and spends the undo, after asking once if there is anything
to lose. The three empty states, the run-end confirmation, the edit, the phone refusal and the
footer legend are all built.

**Suite: 400 TypeScript** (was 293) **plus 199 pytest**, unchanged — the worker was not touched.
Typecheck, build and `drizzle-kit check` clean.

⚠️ **`11` §6.1's two-ticket debt is paid: the e2e tier opens a browser again.** #5 gated both
*modes* and took the browser assertions away; #6 paid the **context** (a database the built app can
reach, and a forged session); #10 pays the **browser**. `test/e2e/vet.test.ts` is `11` §6.2's
behavioural proxy written down as one test — focus the Done control, press `R`, assert `note_vetting`
is unchanged; focus the container, same key, assert it is `rejected`. **Sabotaged 2026-09-12**:
moving the handler to `document.addEventListener` turns it red and nothing else in the suite notices.
⚠️ It is a proxy and the file says so — **if Done is ever moved inside the container the test needs
re-thinking rather than re-running.**

**Two decisions this session made rather than transcribed:**

- ⚠️ **[ADR 0049](adr/0049-the-vet-queue-is-oldest-first-and-the-client-holds-no-position-in-it.md)
  — the queue is oldest-first and the client holds no position in it.** ADR 0033 said `Z` reads its
  target from the database "so the undo survives a reload" and then said the *note* goes "back at the
  head of the queue" without saying what the head was. Oldest-first makes that free: a *note* just
  decided is older than every *note* still waiting, so returning it to *pending* returns it to the
  front. Every endpoint answers with the whole batch, whose head **is** the *note* on screen, so the
  client renders `notes[0]` and stores no index — two tabs cannot disagree about whose turn it is.
- ⚠️ **[ADR 0050](adr/0050-the-idle-sweep-runs-on-the-next-read-because-there-is-no-scheduler.md) —
  `04` §7.1's idle sweep had no home.** Vercel Cron is forbidden by ADR 0022, a serverless deployment
  holds no timer, and the worker claims `job` rows over **shared** entities and has never touched a
  personal table. It runs on the next read. **The cost is stated**: a run abandoned by a reader who
  never comes back stays open until somebody looks, so a *rejection* in it stays reversible while
  nobody is asking — and is permanent the instant anybody is.

**And three readings recorded in the decision log rather than as ADRs**, each of which is a sentence
somebody had already written without noticing what it decided:

- ⚠️ **Acceptance mints the *card* and **must not** mint a *scheduling epoch*.** `scheduling_epoch.
  card_id` is `RESTRICT` (`04` §9), so an epoch written at acceptance makes ADR 0033's `Z` fail on
  **every** acceptance the application ever makes — with a failure that reads like a database problem
  rather than a decision. ADR 0033 said it in its own words and nothing had put the sentence beside
  the constraint: the *card* it deletes is "a card with no `review_log` and no `scheduling_epoch`".
  `test/schema/vet.test.ts` asserts the **absence**.
- **`human` provenance follows the diff; `note_vetting.edited` follows the commit.** `09` §4.3 sets
  `edited` on the `Enter`, which is a fact about the reader's act; ADR 0048 makes `kind` a fact about
  each value, and a field the reader read and left alone was produced by the model. Stamping it
  `human` would take ADR 0018's instrument away one *note* at a time. `edited` is also monotone — `Z`
  leaves it standing, because the edit is still in `note.fields`.
- **Done does not wait for the run to end when the run holds no rejections.** The anchor's click is
  not prevented — that bit is exactly what `test/nuxt/modes.test.ts` guards — so the end request
  travels beside the document load as a `sendBeacon`. Losing it costs nothing, because the only thing
  `ended_at` decides is whether a *rejection* can be reversed and this branch has none. The branch
  that matters is `10` §4.6's confirmation, and it **awaits**.

⚠️ **Two measurements nobody publishes, both found by a test going red for the right reason:**

- **A `RESTRICT` refusal raises `23001`, not `23503`.** PGlite 0.5.8 / PostgreSQL 18.3, 2026-09-12.
  `23503` is `foreign_key_violation` and belongs to `NO ACTION`; `04` §9 spells every rule in the
  `card` chain `RESTRICT`, so a guard written against `23503` alone would have caught **nothing** —
  and the code path it guards is the one ADR 0033 says the whole argument falls back on. Drizzle also
  **wraps**: the driver error carrying the code is the `cause`, and reading `code` off the top would
  have made the guard silently never match.
- ⚠️ **`@electric-sql/pglite-socket` fronts a single-connection PGlite, so `Promise.all` in a request
  handler fails in the e2e tier and only there.** Four reads at once make `node-postgres` open four
  connections; the socket server resets three, the route answers `500`, and the browser shows an
  empty screen with nothing in the test output naming the cause. **Production would have been fine.**
  `server/utils/vet/queries.ts` runs its reads sequentially and says why.

⚠️ **The documents disagreed about the footer legend and the disagreement is now closed in `10`
§4.7.** §4.4 says "while an edit is open the legend's `Esc` label reads `cancel edit`"; §4.7's legend
has no `Esc` in it, because §4.3 gives that key to the Done cluster. The reading that honours both is
that **the legend names the keys that act on the screen in front of the reader** — four with a
*note*, three inside an edit, `Z` alone on an empty queue with an open run (the undo really does
reach back into an empty screen, because ADR 0033 reads its target from the database), and nothing at
all on the confirmation or on a phone. `10` §4.7 carries the table.

⚠️ **And two things `05` §7 and `05` §4 name without defining, decided in `10` and marked as gaps:**
the ***note* index** is the position in this run (`#19`) — the only monotone figure on the screen, and
the pending count beside it already answers the other direction; and **`05` §4's ramp is written per
*field name***, so `app/components/VetNote.vue` holds a three-entry map from field name to type with
a fallback. The declaration carries `kind`, `required`, `memory_bearing` and `label` and nothing that
says *this value is Japanese prose*. **A second *subject* closes that, in the declaration** (ADR 0003)
rather than in a second map.

⚠️ **`/code-review` found one bug that would have biased `S3`'s own number, and it was a Vue
subtlety rather than a mistake in the arithmetic.** `watch(note, …)` keyed on the *note* **object**;
every answer installs a freshly parsed queue, so the *note* on screen gets a new reference with the
same contents and the timer restarted each time a response landed. `seconds_to_vet` would then have
measured from the previous request's reply rather than from when the *note* rendered — **every
reading understated by one round trip, biased low**, on the one number `S3` exists to produce, from
the first run. The watch keys on `noteId` now.

⚠️ **And it caught the same failure this project has shipped in five consecutive tickets: a comment
that asserts something untrue of the code beside it.** Three of them, all written by the change that
made them false — a `.marker` comment describing a `title` attribute that had been replaced by an
`aria-label` an hour earlier; a style-block header claiming "the vertical rhythm below is not in `05`
or `10`" when `05` §5 names two of its four gaps by meaning, **and the untruth is what licensed the
wrong number** (40px where §5 says 52); and a key-cap comment about `--k-face-mono`'s default sitting
beside a `white-space` rule. **The pattern is now six tickets long and the shape is always the same**:
the sentence was true when it was written.

Four more that were real:

- ⚠️ **`draft` is on `CONTEXT.md`'s `_Avoid_` list — twice**, under **Pending** and under
  **Candidate** — and it was the name of the variable holding the uncommitted edit of a *pending
  note*, which is the exact collision the list exists to prevent. It is `edit`. **Second review
  running that has caught a vocabulary breach**, which makes it a category rather than an accident.
- ⚠️ **ADR 0050's idle horizon had two homes before it was a day old.** `decide.ts` re-inlined the
  sweep's SQL with a literal `interval '30 minutes'` beside a `queries.ts` that exported
  `IDLE_HORIZON` for exactly that, and the run boundary was being found three different ways — one of
  which had dropped the `ORDER BY` that `openRun`'s own doc comment called load-bearing.
  `server/utils/vet/run.ts` is the boundary now, and it is the only file that knows what half an hour
  is.
- **`05` §7's quiet affordance is a bounded control** — `--k-raised`, `1px --k-border-control`,
  `--k-radius-control`, `13px 20px` — and the empty state's was a bare link with an arrow, under a
  comment citing the section it did not implement.
- ⚠️ **A `28px` gap that was 40px.** `10` §4.3 measures the Done cluster `28px` from the counts; the
  chrome bar also carried a `12px` flex gap, which adds. The bar's left group carries its own gap
  now and the bar carries none.

⚠️ **And one place where two sections of `05` disagree with each other**, which is new: §5's scale
snaps the empty-state block's statement-to-body gap `18 → 20` **and gives 20 the meaning that fits it
exactly** — *between a body block and what introduced it* — while §7 restates the canvas's 18 and
`10` §4.5 copies it. §5 wins on its own terms ("New values are added to the scale, never set by hand
beside it"); both other sections carry a dated amendment, and the body's 18px **type size** is
untouched, because §5 exempts type sizes from the snap.

⚠️ **The review also named the edit path as scope creep, and it is right.** #10's criterion is that
*entering* an edit costs one keystroke; #11 owns the edit itself. Shipping `E` as a control that
opens something with no way to commit would have been worse, so it is built — and § Next says exactly
which of #11's criteria that leaves.

**What #10 does not do:** schedule anything. A minted *card* has no *scheduling epoch*, so
`startBlockCounts`'s due figure is zero until #12 — which is correct rather than broken, and is the
reason `Z` works at all. It also does not resolve a flag: `card_flag.resolved_at` is untouched and
`note_vetting.flagged_at` is **rendered** (`10` §4.3's aside) but never written, because `X` is
*Review*'s key and `S9` is #13's.

**Phase 6, #9 — generation and pending notes, 2026-09-12.** **A pasted *source* now becomes
*pending notes*, and the money is on the row.** `worker/provider.py` is ADR 0018's boundary and the
only module in the repository that imports an SDK; `worker/pipeline/generate.py` and
`write_pending.py` are stages 6 and 7, so the seven modules and the seven stage keys are finally the
same seven; `worker/prices.py` is `03` §7's price table as configuration with an effective date. The
worker **refuses to start without a key**, which is `db.require_direct_url`'s shape applied to the
second secret `03` §13.1 names.

**Suite: 293 TypeScript** (was 290) **plus 199 pytest** (was 143), 59 of them needing Docker.
Typecheck, build and `drizzle-kit check` clean.

⚠️ **The two documents disagreed about what stage 6 even is, and the cache settled it.** `03` §5.1
says *the LLM, per surviving note*; `04` §6.3 keys `generation_cache` on the *chunk*'s content hash
and stores a `{"notes": […]}` array under it. One request per candidate would put every candidate in
a chunk under **one** four-tuple — 214 candidates across 84 chunks writing and overwriting 84 rows,
each holding whichever word finished last. That is
[ADR 0047](adr/0047-generation-is-one-request-per-chunk-and-notes-are-written-as-each-chunk-returns.md):
**the chunk is the unit of the request, of the key and of the streamed write**, `03` §5.1's phrase is
about scaling, and the chunk's text is in the prompt because otherwise the key would cover text the
request never saw.

⚠️ **And the streamed write is what closed § Carrying's cross-chunk duplicate**, which is the same
decision seen from the other end: 図書館 is in both of the test *source*'s chunks and is generated
**once**, because chunk 0's *note* exists by the time chunk 1 is deduplicated. A run that batched its
writes to the end of the run would pay twice for every word that spans chunks, and there is a test
that reddens if it does.

**Two more decisions this session made rather than transcribed:**

- ⚠️ **[ADR 0048](adr/0048-provenance-kind-is-decided-by-who-produced-the-value.md) — provenance
  `kind` is decided by who produced the value.** `04` §5.4's `CHECK` gives four values and one worked
  pair; the declaration has its own two-valued `kind` that looks like a mapping and is not one.
  `lookup` is a named authority, `generated` is the model with no authority behind it, `judgement` is
  the model **choosing** among an authority's answers, and `human` is the reader. ⚠️ **`judgement` is
  unreachable in v1** — nothing hands the model a sense inventory — and two of four empty is the
  honest state rather than a gap.
- **The price table is a list of dated tables and the newest effective one wins**, recorded in the
  decision log rather than as an ADR. A price change is a **new entry**, never an edit: editing one
  rewrites history, because every `ingestion` already stamped with that date would then cite a table
  saying something else. An unpriced model raises rather than costing zero — ADR 0018 walks the
  model, so an unrecognised id is the *expected* shape of a mistake, and a free *ingestion* in the
  ledger `S10` reports from is worse than no number.

⚠️ **#9 found a defect it deliberately did not fix, and it is
[#15](https://github.com/yutaasakura96/kioku/issues/15).** `reading_of` reads the **surface's**
reading, so あります keys as `有る␟あり` while ある keys as `有る␟ある` — one word, two *notes*, which
is exactly what ADR 0006 exists to prevent, arriving through the half of the key that § Carrying's
`normalized_form` finding did not cover. It is worse than a key problem: ADR 0045 makes `reading` a
field on the answer side of the *card*, so 開いた would produce a card reading ひらい. **It is #8's
`reading_of` and the fix is a decision, not a patch** — re-tokenising the normalized form is verified
to give the right answer for 有る, 開く, 引っ越し, ひらがな and コーヒー, and **collapses 開く/ひらく
and 開く/あく into one**, which is the pair `04` §5.3 gives as the reason the key has two halves. The
issue carries both candidate rules and the measurement behind each.

⚠️ **The test fixture was serving one test's answers to the next one.** `generation_cache` is keyed on
content rather than on any row a test owns, and it was not in `conftest.py`'s cleanup list — so six of
#9's tests went green for the wrong reason before they went red for the right one: every assertion
about *what the provider was asked* had silently become an assertion about the previous test. It is
in `SCRATCH_TABLES` now, first and alone, because it references nothing and `04` §10 calls it the one
table safe to truncate.

⚠️ **The container count is no longer written in four files, which is what #8's own finding asked
for.** It has moved three times — three, twenty-three, forty, now fifty-four — and shipped stale
twice. `worker/tests/README.md` carries it; `docs/11-testing-plan.md` §7, ADR 0038,
`worker/pyproject.toml` and `worker/tests/conftest.py` now point there, and `conftest.py`'s no-Docker
message names the **files** rather than a count, because the files are what a developer is looking at
when they read it. **This is the first ticket in five that did not ship a stale number**, and the
reason is that it stopped keeping one.

⚠️ **`/code-review` found four things that were wrong rather than stale, and two of them were
tests passing for the wrong reason.**

- ⚠️ **Every "the cache saved us" test was actually watching stage 5.** Re-ingesting an identical
  *source* asks the provider nothing — but that is the **corpus filter**, not `04` §6.3: the first
  run's *notes* are already there, so nothing survives to be generated and the cache is never
  consulted. Two tests asserted `calls == []` and credited ADR 0010's cache in their own docstrings.
  `forget_the_corpus` now empties the *notes* and leaves the cache standing, which is the only state
  in which the cache is the thing doing the work — and it is a real state, because `04` §10 calls
  `generation_cache` the one table safe to truncate *because* the corpus is what cannot be rebuilt.
- ⚠️ **`write_generation_cache` used `ON CONFLICT DO NOTHING`, which would have made a chunk re-pay
  for ever.** A cached row that does not answer every survivor is treated as a miss — so the run pays
  again, and then could not store what it had paid for, because the narrow row held the key. The next
  run would read the same narrow row, miss again, and pay again. It is an upsert now, and the test is
  a **third** run rather than a second.
- ⚠️ **A refused or truncated answer dropped its tokens on the floor.** Both are a 200 that was
  billed; `ProviderRefused` now carries what the call cost and `make_generator` records it before
  re-raising. A ledger that lost them would make a *source* that failed half its chunks look
  **cheaper** than one that succeeded, which is the one direction `S10` must not be wrong in.
- ⚠️ **`03` §11's *the provider is not named at the reader* was a comment `runs.py` could not keep.**
  `runs.py` writes `str(error)` into `ingestion_chunk.last_error` and `10` §6.2 renders it, so an SDK
  exception allowed through would put the vendor, its URL and a request id on a screen. Every
  `anthropic.APIError` is translated at the boundary now, and the `stop_reason` check became an
  **allowlist of one** — `anthropic` 1.5.0 already carries seven, `model_context_window_exceeded`
  among them, and a denylist would have let a future one fall through to `json.loads` and surface as
  *the answer is not JSON*.

And three smaller ones: writing provenance only for a *note* this call created would have lost six
rows for ever if a process died between the two writes (it is unconditional now, with the conflict
clause deciding); a fully-cached run named no model at all, so *what made these notes* is now stamped
separately from *what this run paid*; and two comments in `prices.py` said things that were not true
of the file they were in.

⚠️ **The review also caught two vocabulary breaches, which is new.** The prompt said *"flashcard
fields"* — `CONTEXT.md` puts `flashcard` on *Card*'s `_Avoid_` list, and this stage does not make
*cards* at all — and ADR 0048 called a dictionary an *authority*, a word `CONTEXT.md` scopes to what a
*level claim* cites. Both are the same failure as a stale number: a word that is load-bearing
somewhere else, reused casually here.

**What #9 does not do:** show a *note* to anybody. `note_vetting` rows are written at `pending` and
`04` §12's first query has nothing rendering it — that is
[#10](https://github.com/yutaasakura96/kioku/issues/10).

**Phase 6, #8 — the pipeline, stages 1 to 5, 2026-09-12.** **A pasted *source* now becomes
*candidates*, and stops one stage short of spending anything.** `worker/pipeline/` is one flat module
per stage named by the declaration — `chunk`, `tokenise`, `extract_candidates`, `deduplicate`,
`filter_known` — every one of them pure, with the corpus arriving as two plain collections. The SQL
around them is `worker/ingest.py`, and **`worker/runs.py` is untouched**: the seam really was one
argument.

**Suite: 290 TypeScript** (was 280) **plus 143 pytest** (was 86), 40 of them needing Docker.
Typecheck, build and `drizzle-kit check` clean.

⚠️ **`/code-review` found two real things inside this commit, and the stale-number failure is now
five tickets running — this time it was the count of its own container tests.** #8 amended `11` §7
and `worker/tests/README.md` to forty and left ADR 0038, `worker/pyproject.toml` and
**`worker/tests/conftest.py`'s no-Docker message** — the one a developer actually reads — saying
twenty-three, while `worker/tests/README.md` claimed "ADR 0038 carries the amendment" for a number
ADR 0038 did not carry. All four are fixed and `11` §1's own header, which still said *Docker is
required for exactly three tests* and *there is still no code*, is fixed with them. **The count lives
in five files; the durable fix is for four of them to point at `worker/tests/README.md` rather than
repeat it**, and that is written down where the number is.

⚠️ **And criterion 9 was not met by the test that claimed to meet it.** #8 first shipped
`assert dictionary() is dictionary()` for *"constructed once per process, guarded by a test that
constructs it twice and measures memory"* — an assertion that a memoised accessor memoises, which
cannot fail, against a criterion whose whole fear is a caller that never uses the accessor. The real
guard constructs two `Dictionary()` objects and measures `ru_maxrss`; **sabotaged by swapping them
for the accessor, it reddens.** The `morphemes[:10]` guard `11` §7 also names as a test was likewise
only a docstring; it is a test now.

**Three decisions this session made rather than transcribed, all now ADRs:**

- ⚠️ **[ADR 0044](adr/0044-a-candidate-is-a-content-word-and-a-numeral-is-not-one.md) — what counts
  as a *candidate*.** No document said. `03` §5.1 named the stage and gave one exclusion (numerals),
  and `04` §6.1's `(214, 106, 71, 9)` implied heavy filtering without describing it. The line is
  **content words**: eleven `(pos₀, pos₁)` pairs kept, twenty-seven dropped, enumerated from the
  installed dictionary so the two sets cover all thirty-eight — and a test asserts they do, so a
  `SudachiDict` release that adds a category fails by name rather than dropping a word class in
  silence. **代名詞 is the most arguable exclusion** and the ADR says so.
- ⚠️ **[ADR 0045](adr/0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md)
  — the reading is written in the word's own script.** `04` §5.3's three worked keys are all
  hiragana; `reading_form()` answers in katakana. Nothing had noticed because **until #8 every
  *identity key* in the repository was a test literal written by hand.** The rule is hiragana except
  for a word written wholly in katakana, because コーヒー's reading is こーひー under a mechanical
  conversion — and `reading` is not only half of a key, it is on the answer side of the card.
- ⚠️ **[ADR 0046](adr/0046-a-job-gives-up-after-five-abandonments-and-the-retry-after-the-first-is-deferred.md)
  — the two gaps § Carrying named as one gap, closed.** `available_at` is finally the backoff `04`
  §6.4 always called it and `attempts` finally has a ceiling. The first retry stays immediate,
  because `11` §7 tests that a closed laptop's job lands in the same drain that noticed it.

**And two readings recorded in the decision log rather than as ADRs:** `04` §6.1's four candidate
counters are four disjoint buckets counted per *chunk* (the table gave the columns and one example
and never said what separated them), and a resume is one `job` row written only from `incomplete`.

⚠️ **`10` §6.2's resume control is built**, after three tickets each moved it on for a good reason.
#6 had no resume query; #7 had the query and no chunk processor, so a resume re-settled the run and
changed nothing a reader would see. It is a form `POST /` with a hidden field, answered `303` — a
`GET` that wrote a job would be actioned by a prefetch or a back button, and there is no JavaScript
here to intercept anything.

⚠️ **The test fixture could destroy `review_log`, and now cannot.** `worker/tests/conftest.py`'s
cleanup was `TRUNCATE job, ingestion_chunk, ingestion, source_chunk, source CASCADE`, with a comment
explaining that `review_log` "is not among them and must not be". Measured: the cascade reaches it
through `note.origin_ingestion_id` → `note` → `card` → `review_log`, and a row written before the
statement was gone after it. **`CASCADE` was not decorative either** — without it Postgres refuses
the statement outright, *Table "note" references "ingestion"* — so the one keyword that made the
cleanup run was the one that let it walk to the irreplaceable data. It is ordered `DELETE`s now,
which `04` §9's `RESTRICT` stops two tables short, and `test_scratch_cleanup.py` is the guard the
comment was standing in for.

**What #8 does not do:** stage 6. `generate` is a parameter defaulted to `None`, so a run today does
every stage that shrinks the work, writes `04` §6.1's ledger, and spends nothing. That is ADR 0010's
ordering made literal rather than a placeholder.

**Phase 6, #7 — the worker loop, 2026-09-11.** **`LISTEN`, then poll, then block — and the order is
the decision.** ADR 0028's seven steps are `worker/loop.py`, the claim and the stale sweep are
`worker/jobs.py`, and the chunk queue #6 deliberately left shut is `worker/runs.py`. The process has
**no listening socket, no route and no inbound surface at all** (`03` §1), it takes the **direct**
connection string and refuses the pooled one by name, and it reconnects with a doubling backoff
capped at thirty seconds for as long as it runs.

**Suite: 280 TypeScript** (was 277) **plus 86 pytest** (was 47), 23 of them needing Docker. Typecheck, build and
`drizzle-kit check` clean. ⚠️ **Twenty sabotages, twenty distinct failures** — poll before
`LISTEN` reddens six, dropping `SKIP LOCKED` reddens exactly the one test written for it, polling on
the timeout reddens two, reading the payload reddens one, sweeping on `claimed_by` instead of
`state` reddens the finished-job test by name, and a channel typo reddens the cross-language guard.

**The three tests ADR 0038 required are built and they are three of twenty-three**, which is an
amendment rather than a slip — see § Carrying. ⚠️ **The reconnect test asks the *server* what the
worker is subscribed to**, through `pg_listening_channels()`, at the moment the poll happens: a real
`pg_terminate_backend`, a `NOTIFY` fired while nobody is listening, and an assertion that the
catch-up poll found the job anyway.

**Four things this session decided rather than transcribed:**

- ⚠️ **PgBouncer's feature matrix separates `LISTEN` from `NOTIFY`** — `Never` and `Yes` in
  transaction pooling — and `03` §4.1, verification §7.2 and §9.2 all said the pair. All three are
  amended. It is what lets the app send its own wake-up from the pooled connection, which is
  **ADR 0043**: `pg_notify` after the transaction commits, swallowing its own errors, because the row
  is on disk before the notification exists.
- ⚠️ **The claim is one statement, not two**, and the reason is `autocommit=True`. See § Carrying.
- **The container tier is twenty-three tests, not three** — ADR 0038 and `11` §7 amended, with the
  sentence they were protecting intact.
- ⚠️ **`incomplete` is what every run settles as until #8**, and that is the true answer rather than
  a placeholder. `10` §6.2 is amended again: the resume control moves to #8, because #7 can claim a
  `kind = 'resume'` job and still has nothing to resume *with*.

⚠️ **`/code-review` found the stale-number failure inside this very commit, for the fourth ticket
running.** The amendment that moved ADR 0038's container count from three to twenty-three reached
four documents and **not the two files that cite them as authority** — `worker/pyproject.toml` and
`worker/tests/conftest.py` both still read "exactly three tests… and nothing else". That is
CLAUDE.md's *amend the document, don't leave a note* failing in the direction nobody checks: the
amendment was written, and then the code that quotes it was not re-read. Both fixed.

It also found three things that were wrong rather than stale, all fixed and all now tested:

- ⚠️ **The loop caught `OperationalError` and not `InterfaceError`**, and psycopg makes the second a
  sibling of `DatabaseError` rather than a kind of the first. The server ending the session raises
  one; the next statement against the object it left behind raises the other. **A worker that caught
  only the first would survive the drop it saw and die on the one it did not** — on Neon Free, where
  the compute suspends every five idle minutes, that is a worker that stops overnight for a reason
  nobody could reconstruct. `worker/db.py`'s `CONNECTION_LOST` is both, and deliberately not
  `psycopg.Error`, which would turn a query with a typo in it into an infinite reconnect.
- ⚠️ **`finish_job`, `fail_job` and `heartbeat` matched on the job id alone.** If a run outlives the
  five-minute heartbeat window the sweep returns it to `queued` and a second worker claims it — and
  the first, still going, would stamp `done` over the live claim. Every write to a claimed job now
  matches on `claimed_by` too. ADR 0015's revisit condition **is** a second worker.
- ⚠️ **`HEARTBEAT_EVERY_SECONDS = 30` was declared and never read**, with a docstring describing
  behaviour no code had. `04` §6.4's cadence belongs to the per-chunk loop, which is #8's; the
  constant is gone rather than left looking implemented.

And one claim asserted from memory, in the code **and** in the document it cited: *"`03` §5.1's
seven stages are pure transformations"*. Three of the seven are not — stage 1 chunks the whole
document and the app already did it, stage 6 is the LLM, stage 7 writes. **Stages 2 to 5 are the
pure ones.** `11` §8 carried the same overstatement since it was written and is amended.

**What #7 deliberately did not build:** the per-chunk work. `run_ingestion` takes `process_chunk` as
an argument and #8 supplies it — `03` §5.1's seven stages are pure transformations over one chunk,
and keeping them out of the bookkeeping is what lets them be tested with no database at all
(`11` §8).

**Phase 6, #6 — ingest and sources, 2026-09-11.** **A paste, four rows, one transaction, and control
back before the worker has looked.** Signing in lands on Ingest (ADR 0031); the form posts, the write
records `source` + `source_chunk` + `ingestion(queued)` + `job(queued)` **inside one transaction**,
and the answer is a `303` — `S2`'s "returns control immediately" satisfied by the job row rather than
by a fast worker. The run appears above the form on the way back, the Sources list renders, and
**every figure on all three *places* is stamped `as of this page load`**.

**Suite: 277 TypeScript passing** (was 147) plus 47 pytest. Typecheck, build and `drizzle-kit check`
clean. ⚠️ **Ten sabotages, ten distinct failures** — and two of the first sabotages did *not* fail,
which is where two of the session's findings came from.

⚠️ **`/code-review` found a real bug after the suite was green, for the third ticket running.** A
`<textarea>` bound with `:value` renders as raw children and the HTML parser eats one newline after
the tag — so a refused paste beginning with a blank line came back one line shorter. **The comment
above it asserted the opposite, from memory**, sitting between two claims in the same file that had
been measured. It is in § Carrying, it is fixed, and it is tested. The review also moved the refusal
line to where `10` §6.3 puts it, corrected `/sources/:id`'s typography to `10` §7.2, removed a
per-chunk re-split that cost 88 ms **inside the transaction**, and covered two query functions that
had shipped untested.

**The three things measured this session are all in § Carrying**, and each one changed what got
built: what a `sql` template does to a Drizzle column, what Nuxt's renderer does with a `POST`, and
what JavaScript's `.length` does to a Japanese *source*.

**#6 also paid two debts it did not open.**

- ⚠️ **`05`'s tokens exist.** § Carrying has carried "the tokens do not exist in the repo yet and **no
  ticket owns them** — the first screen ticket to need them lands them" since #5.
  `app/assets/css/tokens.css` is `05` §§1–6, ADR 0024's four greys included. ⚠️ **The font *files* are
  still not shipped and that question is genuinely open** — `05` §4 deferred it to Phase 4 and Phase 4
  never answered; the stacks carry `05` §4's own fallbacks and `06-decision-log.md` records the gap.
- ⚠️ **The end-to-end tier can sign in.** `11` §6.1 handed that to #10 and `00-status.md` § Next left
  the door open for #6 to argue it. #6 argued it, because its own criteria put the over-cap re-render
  in the end-to-end column and every route that pair touches is gated. PGlite behind a socket server,
  a session row, and a cookie signed in the test — **no endpoint mints a session.** Assertion 1's
  signed-in half is back on the three routes it is about.

**What #6 built that its criteria put out of scope, and why:** `/sources/:id`, **readable only**. Two
of its criteria — "offers to open the existing one" and "the Sources list renders" — both link there,
and a link to a `404` is not an offer. It renders the title, the fact line and the retained material;
**the *notes*, the *occurrence* positions and the delete confirmation are still `S11`'s.** `10` §7.2
is amended to say so.

**What #6 deliberately did not build:** `ingestion_chunk` rows. `04` §6.2 is per-chunk *progress*,
and progress before anything has been claimed is a fiction — #7 opens that queue when the worker
claims the job. `S2` names four rows and there are four.

**Phase 6, #3 — the subject declaration, 2026-09-10.** **One file, two toolchains, and a test that
runs one language from the other.** `subjects/jlpt-vocab.json` is ADR 0003's declaration as
language-neutral JSON at the repository root: the six fields with their `kind` and `memory_bearing`
flags, ADR 0006's *identity key*, the one recognition *template*, and `03` §5.1's seven stages in
order. TypeScript reads it through `shared/subject/`, Python through `worker/subject.py`, and
**neither restates it** — every list is derived from the file.

`03` §6's seam exists twice: `validate(declaration, output) → ok | error`, in both languages, over
one file. ⚠️ **The two answer with the same error codes in the same order by contract** — a message
string would not have survived translation — and both suites assert the order.

**Suite: 147 TypeScript passing** (was 106) **plus 47 pytest.** Typecheck, build and
`drizzle-kit check` clean. ⚠️ **Fifteen sabotages, fifteen distinct failures**, and three of them ran
in the language that did not contain the bug.

⚠️ **`/code-review` found two real divergences after both suites were green** — `null`, and six
whitespace characters. Both are in § Carrying, both are fixed, and both are now tested on each side.

**Five things this session decided rather than transcribed**, all in `06-decision-log.md`:

- **A declared field names its own roles; only ordered sets stay lists.** `kind` and `memory_bearing`
  are flags, so neither can name a field that does not exist. `identity_key` and a *template*'s two
  sides stay lists because they are ordered and may repeat a name — and those are exactly what
  `checkDeclaration` guards, in both languages.
- **The memory-bearing fields are `reading` and `meaning`** — the one *template*'s answer (`PRD` §6),
  not the subset that is also editable. ⚠️ `reading` can never change today; encoding that would bake
  ADR 0006's freeze rule into a flag ADR 0011 defines by what was *memorised*.
- ⚠️ **TypeScript's derived types are still only `string`** — measured. See § Carrying.
- ⚠️ **`null` is an absent field, and emptiness is a shared character class** — the two divergences
  the review found. See § Carrying.
- **The worker's toolchain is uv, Python 3.11, and Renovate needed no change.** See § Carrying.
- **The drift test runs `node scripts/print-subject-view.ts` from pytest**, and fails rather than
  skips when Node is missing.

⚠️ **What #3 deliberately did not build: ADR 0005's authority list and its precedence order.** `04`
§5.6 makes `level_claim.authority_key` a key into the declaration and `04` §13 says the precedence
order is declared there too — but which publications count as *authorities* for JLPT levels is a data
decision ADR 0005 left open, and #3's acceptance criteria do not ask for it. The keys are additive, so
the ticket that first renders a *level* lands them without moving anything. It is named in
`subjects/README.md`.

**Phase 6, #5 — identity, 2026-09-09.** **The door, two independent refusals, and the gate.** `S1` is
answered as far as it can be without Google: an unauthenticated request to any of the five screens is
a `302` to `/auth`, an unauthenticated `/api/**` is a `401`, `/api/auth/**` stays reachable because
nothing could sign in otherwise, and `/auth/refused` carries no link, no button and no form.

**One middleware resolves and a second step refuses** (ADR 0030, `08` §6.3) — `server/middleware/
session.ts`. Nothing re-derives a session and no page reads one from the client; the door itself
reads what the middleware already resolved, through `useRequestEvent()`, and carries it into the
payload. **The two refusals are wired as `08` §3 specifies and neither shares a failure mode with
the other**: `validateUserInfo` never reads `source`, so a second provider cannot walk past it, and
`disableSignUp` is set where the only method is enabled.

**Suite: 106 passing**, up from 54. ⚠️ **Ten sabotages, ten distinct failures** — narrowing
`validateUserInfo` on `providerId` (the library's own documented example, and a fail-open gate)
reddens three; softening `requireEnv` to `|| ''` reddens six; flipping `disableSignUp`, dropping
`onAPIError.errorURL`, hardening `sameSite` to `strict`, enabling `cookieCache` and making the
comparison case-sensitive each redden their own; widening the middleware's asset skip to every path
reddens twelve; removing a *mode*'s `external` reddens exactly one, by name. Typecheck and build
clean.

**Four things this session decided rather than transcribed:**

- **One `overrides` entry, not `--legacy-peer-deps`.** `better-auth`'s optional `vitest` peer is
  `^2 || ^3 || ^4` and this repo is on 5. The override is scoped to one subtree; the flag would turn
  off peer checking for the life of the project. `better-auth` is pinned **1.7.3 exactly** — a
  seventh pin in `03` §13.5, because `08` §7's regenerate-and-diff practice needs a known version.
- ⚠️ **The `external` guard is a click, not a browser** — and #5 is what forced the question, by
  gating both *modes* out of the e2e tier's reach. `11` §6.1 is amended; see § Carrying.
- **`better-auth/minimal`** rather than the default entry point, which carries Kysely.
- **`08` §10 gained the `schemaName` it omitted**, which would have undone #4's correction.

**Phase 6, #4 — the schema, 2026-09-09.** **Eighteen tables plus the auth library's four, in one
migration set**, with the tier that tests them. `server/db/schema/` is `04` as Drizzle, split
`shared.ts` / `personal.ts` / `auth.ts` on **`04` §4's own label** rather than on filing convenience —
the label is what decides whether an owner foreign key is `RESTRICT`. All twenty-one indexes of §11,
all eighteen `RESTRICT`s of §9, and the one trigger of §14 are in, and `drizzle-kit check` agrees the
migrations and the schema have not forked.

**The schema tier is fifteen tests in 1.8 s**, built by the real migrations through
`drizzle-orm/pglite/migrator`. ⚠️ **Each guard was checked by sabotage, not assumed**: dropping the
trigger reddens three tests, flipping `review_log → card` to `CASCADE` reddens two, making the
partial index non-unique reddens one, and flipping every `owner_id` to `CASCADE` — the copied ORM
default `04` §3 exists to refuse — reddens exactly the test that names it. Eight sabotages, eight
distinct failures. Suite: **54 passing**. Typecheck and build clean.

**Two things this session decided rather than transcribed**, both now ADR-or-log:

- **ADR 0040** — the app connects with `drizzle-orm/node-postgres` and `pg`, not
  `@neondatabase/serverless`. `03` §4.1 settled which *string* each process gets and never which
  client opens it. The deciding reason is ADR 0022 one step out: **do not depend on the current
  host's shape**, or the move stops being a preset change. ⚠️ `neon-http` would also have made a
  schema decision by accident — it has no session, so it cannot run `04` §9.1's `Z` un-mint as one
  transaction, which is the only thing that gives the `RESTRICT` guard something to protect.
- ⚠️ **The Better Auth generator's documented flags produce the wrong output**, and both documents
  that prescribed them are amended. See § Carrying.

**Phase 6, the spec and the route — 2026-09-08.** `/to-spec` published **issue #1**, scoped to
ADR 0001's first milestone; `/to-tickets` published **#2–#14**, thirteen tracer-bullet tickets, every
one labelled `ready-for-agent`, every one citing the document section it came from, every one listing
its blockers by real issue number. The three missing triage labels — `needs-triage`, `needs-info`,
`ready-for-human` — were created in the same session, so all five canonical roles now exist.

Two decisions from that session that are invisible in the tickets themselves:

- **The outbox and the `S9` flag are one ticket, #13**, not two. ADR 0039's third property — *replays
  in order, never merges* — is only assertable across **two entry types in one stream**, so splitting
  them would have made the property untestable in the first half. The breakdown was drafted as
  fourteen tickets and merged to thirteen on Yuta's call.
- **#12 (Review) is blocked by #10 (Vet mechanics), not by #11 (Vet presentation).** Review needs
  minted *cards*, which #10 delivers; the *facts strip* and the provenance marker do not gate it.
  Confirmed rather than assumed.

**Phase 5 — complete 2026-09-08.** `/setup-matt-pocock-skills` ran. `docs/agents/issue-tracker.md`,
`triage-labels.md` and `domain.md` are written, `CLAUDE.md` § Agent skills points at all three, and
`.claude/settings.json` is committed with `mattpocock-skills` on, `frontend-design` and `superpowers`
off. **No `.mcp.json`; none is needed.** This was Phase 5 of `/project`, run out of the skill's
numbered order because the grilling had to produce the ticket material first.

**Phases 1–3 — complete.** Brief, PRD, design exploration, design system. The canvas link at the top
of [`05-design-system.md`](05-design-system.md) is still the only copy of the six artboards, and that
file holds every value that matters.

**Phase 4, Round 1 — closed 2026-09-06.** Nine questions, seven ADRs (0013–0019): navigation and
rendering, session durability, where ingestion runs, the grade set, identity, the model provider,
the tokeniser.

**Phase 4, Round 2 — closed 2026-09-06. §4.12 is finished.** The brief's last open question.

| # | Question | ADR |
| --- | --- | --- |
| 6 | The framework | [0020](adr/0020-nuxt-is-the-framework-because-a-route-can-ship-no-javascript.md) — **Nuxt 4.5.2**, Vue |
| 7 | The database | [0021](adr/0021-postgres-is-forced-by-two-writers-not-chosen.md) — **Postgres**, Drizzle |
| 8 | The host | [0022](adr/0022-the-first-deployment-is-deliberately-temporary.md) — **Vercel + Neon + a local worker** |

**Phase 4, Round 3 — closed 2026-09-06. The frontier is empty.** Nine questions, six ADRs
(0023–0028) plus one full log entry, and two verification sections. The five design questions left
hanging at the end of Round 2 are answered; so are the three stack follow-ups.

| # | Question | Outcome |
| --- | --- | --- |
| 1 | Keys, and whether vetting has an undo | [0023](adr/0023-space-is-the-forward-action-and-z-is-the-confirm.md) — `space` forward, `Z` instead of a dialog |
| 2 | Four ink values failing WCAG AA | [0024](adr/0024-four-greys-that-pass-not-seven-that-do-not.md) — **seven greys become four** |
| 3 | A focus state | [0025](adr/0025-one-focus-ring-and-the-modes-do-not-draw-it.md) — one token, modes draw no ring |
| 4 | The spacing scale | Regularised to ten 4pt steps — log entry, no ADR |
| 5 | The phone layout | [0026](adr/0026-review-is-the-only-screen-that-gets-a-phone-layout.md) — *Review* only, **and every mode gains a Done control** |
| 6 | The note's storage shape | Deferred again, deliberately, to `04` — **closed there 2026-09-06**, [ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md) |
| 7 | The Python driver | [0027](adr/0027-psycopg-3-is-the-driver-and-neons-table-is-not-a-support-list.md) — psycopg 3, the objection was a misread page |
| 8 | `noScripts` on Vercel | Verification §8 — **it survives**; ADR 0020 amended |
| 9 | The worker's dropped listener | [0028](adr/0028-the-job-table-is-the-truth-and-notify-is-only-an-optimisation.md) — the job table is the truth |

**[`03-technical-design.md`](03-technical-design.md) — written 2026-09-06.** Eighteen sections. It
carries ADR 0028's worker loop (`LISTEN` **then** poll, on every connect and reconnect), the two
connection strings, the psycopg floor as a reason, the current `noScripts` API names, the
construct-`Dictionary()`-once rule, both pipeline findings, ADR 0007's outbox shape and ADR 0013's
split. **The security baseline is §13 and is answered in full.** No schema, no code.

It made **four new decisions**, all logged in [`06-decision-log.md`](06-decision-log.md) and none of
them a stack question: the dictionary version joins ADR 0010's cache key; the *subject* declaration
is language-neutral JSON owned by neither toolchain; a client-stamped *grade* is validated on
replay; Drizzle owns every migration and the worker never issues DDL.

**[`04-database-schema.md`](04-database-schema.md) — written 2026-09-06.** Eighteen tables plus the
four Better Auth owns. **It closes the last two open questions in the project.**

- **The note's storage shape** — [ADR 0029](adr/0029-the-notes-fields-are-a-blob-and-its-provenance-is-not.md).
  `note.fields` is one `jsonb` document; `note_field_provenance` is relational. ADR 0021's
  recommendation survives **on a different argument than the one it was made on**: the row-lock half
  of Postgres §8.14.2 is weak at one reader, and what decides it is that ADR 0018 made the model
  choice a *measurement*, and that measurement is an aggregation across notes that a GIN index
  cannot serve. The cost is one derived column, `note.identity_key`.
- **The owner foreign key** — directly at `auth."user".id`, typed `text`, **`ON DELETE RESTRICT`**.
  Full entry in the decision log.

Also in it, and worth knowing without opening it: **scheduling state lives on `scheduling_epoch`,
not on `card`**, so a reset is an `INSERT` and the irreplaceable data is never in the path of an
`UPDATE`; **one trigger exists in the whole schema**, making `review_log` append-only; and the
stale-job sweep runs **in the worker**, because ADR 0022 forbids a Vercel Cron dependency.

**[`08-authentication.md`](08-authentication.md) — written 2026-09-06.** Mostly citation, as
expected. **Three things it actually decided**, plus [ADR 0030](adr/0030-the-session-is-read-in-server-middleware-and-a-place-never-reads-it-from-the-client.md):

- **The session is read in one Nitro server middleware**, into `event.context.session` — ADR 0030.
  `03` §2.2 left this open and it was the one real collision in the document: Better Auth's
  documented Nuxt fix is `<ClientOnly>`, which renders **nothing** on a `noScripts` route, and all
  three *places* are those routes. ⚠️ It also **forbids `prerender`, `swr` and `isr` on the three
  *places*** — each is the ordinary advice for a form, a list and five numbers, and each silently
  disables the gate.
- **The allowlist is one environment variable**, `KIOKU_INVITED_EMAIL`. ⚠️ The load-bearing half is
  the *shape*: a list-shaped allowlist admits everyone when the list is empty, and Better Auth's own
  documented example narrows on the provider first, which fails open. Neither is used.
- **`sameSite: "lax"`, `path: "/"`, written out rather than inherited.** ⚠️ `strict` **breaks
  sign-in** — `defaultCookieAttributes` applies to the OAuth state cookie too, and a `Strict` cookie
  is not sent on the top-level redirect back from Google.

Also in it, and worth knowing without opening it: **there are six routes, not five** — `/auth` is the
door, ships JavaScript, and is neither a *place* nor a *mode*; `/auth/refused` is a `noScripts` page
with a message and deliberately nothing else. **`session.cookieCache` is off** because it would keep
a revoked session alive for its window.

**[`09-user-flows.md`](09-user-flows.md) — written 2026-09-07.** Nine sections. The twelve stories
walked end to end, with the concrete path of every route, which nothing had named. **Four things it
decided**, three of them ADRs:

- **`/` is Ingest**, permanently, and it inspects nothing — [ADR 0031](adr/0031-the-landing-route-is-ingest-and-never-a-decision-about-data.md).
  `08` set `callbackURL: "/"` without saying which screen that was. A chooser was rejected because
  the version worth building would land the reader in a *mode*, on their first sight of the app,
  with no navigation on the screen.
- **A *mode* is entered from a start control carrying its own count**, present on all three *places*
  and never disabled — [ADR 0032](adr/0032-a-mode-is-entered-from-a-start-control-and-done-is-the-only-way-out.md).
  ⚠️ **The exit has to be `external`** or Nuxt client-renders a *place* into the already-hydrated
  page, which is what `noScripts` exists to prevent, with no error (verification §12.1).
- **⚠️ ADR 0013 did not close the empty-*Vet* gap and could not** — the gap is on *Vet*, ADR 0013
  made *Vet* a mode, and a mode has no navigation. Done plus the affordance the canvas already drew
  is what closes it. `09` §8.
- **Done in *Vet* ends the run and spends the undo; Done in *Review* spends nothing** —
  [ADR 0033](adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md). It asks once, only when the
  run holds a rejection, and `Z` works up to the answer.
- **`S12`'s export is triggered from Stats**, as a plain `<a href="/api/export">` — full entry in the
  decision log. A link that downloads is the one write-shaped action a `noScripts` *place* can
  perform with no mechanism at all.

Also in it, and worth knowing without opening it: ***Vet* has three empty states, not one** — PRD §4
wrote one, and "nothing to vet yet, an ingestion is running" is a normal event under `S2`, not an
ending. **The streaming queue is visible on *Vet*, not on Ingest**, because Ingest has no client and
no *place* auto-refreshes. **Ingest reports what the job table knows and does not diagnose a dead
worker** — `heartbeat_at` only ticks while working, so an idle worker and an absent one look
identical, and "queued for four minutes, not picked up" is the honest sentence. **Hard-deleting a
*source* has no route in v1.**

⚠️ **It also generates two amendments to written documents**, both in the decision log's carried
list: `04` §9.1's "there is no path" to delete a `card` needs the `Z` exception, and `03` §8.1's
outbox carries `S9` flags as well as *grades*. **Both were applied 2026-09-07 while writing `10`.**

**[`10-screen-specifications.md`](10-screen-specifications.md) — written 2026-09-07.** Eleven
sections, seven screens, **nine new components and four screens that need none.** Mostly citation.
**Five things it decided**, three of them ADRs:

- **The grade labels** — [ADR 0034](adr/0034-the-grade-labels-name-recall-because-they-cannot-name-a-time.md).
  `1 Forgot · 2 Hard · 3 Good · 4 Easy`. ⚠️ **`Again` does not survive**: ADR 0016 turned same-day
  relearning off, and verification §13.1 read `ts-fsrs` at the pinned version — `LongTermScheduler`
  schedules every grade in **days** and `next_interval` clamps at `Math.max(1, …)`, so the soonest a
  graded *card* returns is **tomorrow**. Copying Anki's word for a ten-minute return it cannot make
  teaches the reader something false. `Forgot` names the lapse the library itself counts.
- **The five interaction states are not a set** — [ADR 0035](adr/0035-five-interaction-states-is-not-a-set-and-three-screens-have-three.md).
  ⚠️ **Ingest, Sources and Stats have three, not five.** Loading and error are client concepts and
  those routes ship no JavaScript: loading is the browser's, and an error is a re-rendered document
  (`09` §4.2). Also: **nothing in v1 is disabled**, so `--k-disabled` is not a token.
- **Grade by swipe is refused** — [ADR 0036](adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md).
  ADR 0026 deferred it here by name. ⚠️ **SC 2.5.1 Pointer Gestures is Level A** and SC 2.5.7 is
  Level AA (verification §13.2), so a gesture owes a single-pointer equivalent — the four controls it
  was meant to replace. **Swipe was only ever additive**, which removes the trade the deferral
  assumed.
- **The Done cluster** — the footer legend's own cap-plus-label, at the right of the mode's header.
  On *Review* the header is a three-column grid with a spacer the width of the cluster, so **the rail
  stays optically centred**. On the phone the cap is dropped, because a phone has no `Esc`.
- **The start block** — `05` §7's quiet affordance, **minus its accent arrow**, in the page body
  rather than the bar. Full entries in the decision log for both.

⚠️ **It also amends ADR 0025**, under that ADR's own revisit condition, which fired exactly as
written: *Review*'s end screen has three focusable elements, so **a mode draws no ring while it is
running and draws it on the screens where it has stopped.**

⚠️ **And it found that the key map is regulated.** Verification §13.4: ADR 0023's keys are all
printable characters, so **SC 2.1.4 Character Key Shortcuts (Level A)** applies, and the application
passes only on the "Active only on focus" exception — which is true *because* ADR 0025 holds focus on
the mode container. **Binding the keys to `document` moves the app from passing a Level A criterion
to failing it, with nothing on screen to show it.** It is now a test in `11`'s list.

Also in it, and worth knowing without opening it: **no new colour token and no sixth measure** —
hover borrows `--k-key-face` and active borrows `--k-ink-ground`, and the three undrawn *places* take
existing measures. **`05` §5's three ambiguous spacing values are closed** — `14 → 12`, `30 → 28` as
a gap and `30` stays as padding, and `10` was never a gap at all. ***Vet*'s edit fields are
single-line in value but `<textarea>` in element**, because a 27px Japanese example sentence wraps by
construction and an `<input>` would scroll it out of sight. **The refusal page has no rule**, and the
absent rule is the specification. **The flagged rail tick is 2px tall rather than a new colour.**

**[`11-testing-plan.md`](11-testing-plan.md) — written 2026-09-07. The last document.** Ten
sections. The twelve stories mapped to tests, five tiers, and what is deliberately not tested.
**Five things it decided**, three of them ADRs:

- **A measured criterion is reported, not asserted** — [ADR 0037](adr/0037-a-measured-criterion-is-reported-not-asserted.md).
  ⚠️ `S3`'s median and `S10`'s numbers get **no threshold assertion**. A test asserting `median < 5`
  is a test of its own fixture, and ADR 0018 walks the model *down* until *acceptance rate* degrades
  — the number has to be free to fall. What the suite asserts is that each number is **recorded
  correctly**, including the nineteen/twenty suppression boundary, which is `S10`'s only branch.
- **Two test databases** — [ADR 0038](adr/0038-two-test-databases-split-on-the-line-adr-0019-already-drew.md).
  ⚠️ **The premise inverted under measurement.** "A mock cannot fail a foreign key" is true and
  irrelevant: **PGlite is PostgreSQL 18.3**, measured because its docs never say so, and it refuses
  every `RESTRICT`, trigger, partial index and `CHECK` in `04` — in **946 ms, no Docker**. It is
  single-connection, so the worker's three concurrency behaviours get a real container. That line is
  ADR 0019's, not a new one.
- **The outbox shares a property list, not a harness** — [ADR 0039](adr/0039-the-outbox-pattern-shares-a-property-list-not-a-harness.md).
  Three instances, three processes, two languages. **Five written properties, three harnesses.**
- ⚠️ **The `noScripts` smoke test is promoted from experiment to test**, and it was always three
  assertions plus a config check — `$fetch` returns the HTML (verification §14.3). It leaves the
  first-week list.
- ⚠️ **The key-handler binding is tested by behaviour, not location.** Where a listener lives is not
  assertable; that `R` does nothing while focus is on the Done anchor is. Written down as a proxy.

Also in it, and worth knowing without opening it: **the test database is built by Drizzle's own
migrations** (`drizzle-orm/pglite/migrator`), because a hand-written test schema is the drift `04`
§13 exists to refuse. **Model quality is not tested** — ADR 0018 made it a measurement and
verification §3 found no benchmark, so generation tests use recorded fixtures and never call a
provider; what is tested is the boundary. And **`S3`'s first real run of twenty notes joins the
first-week list** as an experiment with a written-down expectation.

**[`phase-4-verification.md`](phase-4-verification.md) — the facts, checked, with sources.** Now
**fourteen** sections. §1–4 from Round 1 (FSRS, Better Auth, LLM pricing, tokenisers); **§5–7 added in
Round 2** (frameworks, database, hosting + Neon + the SudachiPy measurement); **§8–9 added in
Round 3** (`noScripts` under the Vercel preset; the Python driver and what scale-to-zero does to
`LISTEN`); **§10 added while writing `04`** (Postgres 18's `uuidv7()`; Better Auth's generated
Drizzle types and its cascades); **§11 added while writing `08`** (the cookie defaults, the OAuth
state cookie, the server-side session read, and three route rules that would disable the gate);
**§12 added while writing `09`** (`<NuxtLink external>` as the only real mode exit; `SameSite=Lax`
excluding cross-site `POST`); **§13 added while writing `10`** (what `enable_short_term: false`
actually does to grade 1; the three WCAG criteria the screens are measured against; and the Level A
criterion the key map turns out to be subject to); **§14 added while writing `11`** — and
⚠️ **§14.1 is a measurement, not a citation**: PGlite's PostgreSQL version is not stated in its own
documentation, so it was installed and queried.
Everything against primary sources. **Do not re-run this.**
Re-verify only if older than ~3 months.

⚠️ **§11.1 supersedes the ⚠️ in §2.2.** `sameSite` and `path` are no longer unverified: `lax` is in
the security reference and `path: "/"` is a hard default in `createCookieGetter`. §2.2 is left as
written because §1–9 are not edited.

Seven findings worth knowing without opening it:

- **SudachiPy's dictionary is memory-mapped and loads in 9 ms**, at 93–136 MB steady-state RSS —
  measured, because no published figure exists. It was never the cold-start cost anyone feared, and
  that killed half of ADR 0015's reasoning. **Construct `Dictionary()` once per process** — each
  construction adds its own mapping.
- **`kuromoji`'s dictionary has been frozen since 2007** and lacks 令和. The obvious JS tokeniser is
  a trap; Sudachi's `normalized_form()` is ADR 0006's dedup key for free.
- **No published benchmark tests Japanese structured extraction.** ADR 0018 makes the model a
  boundary because of it. Do not let a future session "just pick the best model" from docs.
- **Blog claims of an "FSRS-7" could not be corroborated.** FSRS-6 is current.
- **Only three of seven frameworks can make a route ship zero JavaScript.** That, not taste, is why
  ADR 0020 landed where it did.
- **`noScripts` occurs in zero files in `nitropack@2.13.4`** — the exact version Nuxt 4.5.2 pins. The
  Vercel preset cannot drop a rule it never reads, and the rule runs inside the handler the preset
  packages verbatim. **Neither vendor documents this and nothing upstream tests it**, so the
  fifteen-minute smoke test survives as regression cover, not as investigation.
- **Neon's driver table is a SNI-compatibility list for non-libpq drivers, not a support list.** An
  earlier session read a page that contains no driver list at all. psycopg 3 is Neon's own documented
  Python driver.

## Next

**Phase 6 — Build.** It is a hand-off: the commands that drive it all carry
`disable-model-invocation: true`, so **Yuta types them and no session can start one.**

⚠️ **The next command is `/implement 11`, in a fresh window.** `/to-spec` and
`/to-tickets` have both run — issue **#1** is the spec and **#2–#14** are the tickets — so neither is
the next command, and neither is `/grill-with-docs`, whose frontier is empty.

⚠️ **This line was stale for one commit and it is the fourth stale number in a row.** `07513ff`'s
subject is *"record #7 as built and move the frontier to #8"* and it updated the strikethroughs
around this sentence without updating the sentence, which then sent the next session at a ticket
that was already built. Corrected 2026-09-12. **The pattern is the finding**: every ticket so far has
shipped one number that was true when it was written and false when it was read.

~~**⚠️ #3 built 2026-09-10.** The frontier is #6 alone.~~ ~~**⚠️ #6 built 2026-09-11.** The frontier
is #7 alone.~~ ~~**⚠️ #7 built 2026-09-11.** The frontier is #8 alone.~~
~~**⚠️ [#8](https://github.com/yutaasakura96/kioku/issues/8) built 2026-09-12. The frontier is
[#9](https://github.com/yutaasakura96/kioku/issues/9) alone.**~~
~~**⚠️ [#9](https://github.com/yutaasakura96/kioku/issues/9) built 2026-09-12. The frontier is
[#10](https://github.com/yutaasakura96/kioku/issues/10) alone.**~~
**⚠️ [#10](https://github.com/yutaasakura96/kioku/issues/10) built 2026-09-12. The frontier is
[#11](https://github.com/yutaasakura96/kioku/issues/11) alone** — *the note as presented, and the
edit path*.

⚠️ **#11 is much smaller than its ticket, and the next session should read this before the ticket.**
#10 could not render a *mode* without rendering the *note* inside it, so **eight of #11's eleven
acceptance criteria were met on the way through**, covered by `test/nuxt/vet-note.test.ts` and
`test/schema/vet.test.ts`: the quiet/foregrounded split, the *facts strip* and its zoning, the
*provenance marker* filled and hollow, the *authority*'s name **in the document rather than behind a
hover**, both of two disagreeing *level claims* shown, `E` costing one keystroke without touching the
cost of the other two, the four-grey ramp, and three interaction states rather than five.
**Three are left, and one of them is a contradiction rather than work:**

- ⚠️ **#11's sixth criterion says "any field is editable before acceptance" and `10` §4.4 says it is
  not.** `S6`'s sentence is *any field*; `10` §4.4 narrows it to the three *judgement fields* and
  gives two reasons that are not stylistic — editing the *term* or the *reading* changes
  `note.identity_key` (ADR 0006) and editing a *level* manufactures a claim with no *authority*
  (ADR 0005). **#10 built `10` §4.4's version**, in the component *and* in
  `shared/vet/decision.ts`, because a client is the thing sending the request. #11 should close the
  contradiction in the ticket or in `02-product-requirements.md`, not in the code.
- ⚠️ **"An *accepted* *note*'s fields are frozen" is not enforced anywhere.** #10 writes
  `note.fields` on the edit path and nothing refuses a later write. Today nothing attempts one — the
  only writer is `decide()`, and it refuses a *note* that is not `pending` — so the property holds by
  accident rather than by a guard, which is exactly the shape `04` §13 warns about. ADR 0006 says a
  later *source* appends an *occurrence* and **never alters the fields**; the worker's write path is
  the other half.
- ⚠️ **The arithmetic `S6` calls "the most likely error in the app, and the one that would flatter
  the thesis"** — an edited accept counting as an **edit** rather than as an acceptance in
  *acceptance rate* — is not computed anywhere yet. The column is written and correct
  (`note_vetting.edited`); the metric that reads it is Stats, which is #14, and `11` §8 puts "the
  metric arithmetic" in the pure-seam list. #11 should decide whether it owns that seam or hands it
  on.

**#10 inherited five things from #9 and all five held.** Kept because each is still the shortest
statement of a thing #11 may need:

- ⚠️ **A *pending note* is already four rows and #10 reads all four.** `note`, six
  `note_field_provenance` rows, a `note_vetting` at `pending`, and one `occurrence` per sighting.
  `S4`'s *foreground the judgement fields* is a join onto the second of those, and ADR 0048 says what
  its `kind` column means.
- ⚠️ **`judgement` is unreachable in `note_field_provenance.kind` and `human` is #10's** (ADR 0048).
  An edit writes `human` with no model and no dictionary; nothing else in the pipeline can produce
  one.
- **Rejecting a *note* already shrinks the next run.** `DatabaseCorpus.rejected` is `04` §12's third
  query and it is owner-scoped and tested; `S5` is satisfied the moment #10 writes a `rejected` row.
- ⚠️ **[#15](https://github.com/yutaasakura96/kioku/issues/15) is in front of #10 on the screen, not
  behind it.** The reading is on the answer side of the recognition *template* (`10` §5), so the
  first *card* #10 mints from an inflected word shows it. Fixing it changes the identity of existing
  *notes*, which is why it is its own ticket rather than a patch inside one.
- **The end-to-end tier can sign in** — #6 paid that, and every *Vet* route is gated.

~~**#9 inherited six things from #8**, none of which needed re-deriving:~~ **All six held.** The
seam really was one parameter, the `Group` really did carry every sighting, the streamed write really
did close the cross-chunk duplicate, three of the four key parts really did already exist, `is_oov`
really was already on every *candidate*, and ADR 0046's ceiling really did matter the moment the
handler started making network calls. Kept because each is still the shortest statement of a thing
#10 may need:

- ⚠️ **The seam is one parameter, again.** `ingest.make_chunk_processor(job, *, generate=None)`
  already runs stages 1 to 5 and calls `generate(connection, group)` once per surviving group. #9
  supplies `generate` and wires it in `__main__.py`; nothing else in `runs.py` or `ingest.py` has to
  move. `worker/tests/test_ingest.py`'s `Recorder` is the shape of what it replaces.
- **A `Group` carries every sighting**, not just the first. `group.sightings` is what stage 7's
  *occurrences* are written from once the *note* exists — `ingest.append_occurrences` already does
  exactly that for the corpus-hit case and is the function to reuse.
- ⚠️ **Cross-chunk duplicates are closed by the streaming write, not by stage 4.** A *chunk* is
  tokenised independently, so a word in chunks 1 and 3 is two groups. `03` §5.1 stage 7 says *notes*
  are written **as produced, not at the end**; that is what makes chunk 3's sighting an
  `already_known` rather than a second generation. **If #9 batches the writes to the end of a run, it
  pays twice for every word that spans chunks.**
- **The cache key is four parts and three of them exist.** `04` §6.3's row is
  `(content_hash, dictionary_version, prompt_version, model_id)`; `source_chunk.content_hash` is
  written by #6 and `pipeline.tokenise.DICTIONARY_VERSION` is read from the installed package. #9
  brings the other two.
- **`is_oov` is already on every *candidate***, carried rather than consumed, because `04` §5.4 keeps
  it on `note_field_provenance` to tell a looked-up reading from a generated one (ADR 0019).
- ⚠️ **A job can now fail for good** (ADR 0046), which matters more to #9 than it did to #8: the
  handler is about to start making network calls.

**#8 inherits five things from #7**, none of which needs re-deriving:

- ⚠️ **The seam is one argument.** `worker/runs.py`'s `run_ingestion(connection, job, *,
  process_chunk)` opens the queue, marks each chunk `running`, calls `process_chunk`, marks it
  `complete` or `failed`, heartbeats, and settles the run. **#8 supplies `process_chunk` and needs to
  change nothing else in the loop.**
- **The chunk queue is open by the time #8's code runs**, with `char_start` / `char_end` already
  joined onto each row. ⚠️ They are **code-point offsets**, so `source.content[start:end]` in Python
  is simply correct — which is the point of § Carrying's `.length`-versus-`len()` bullet: the app was
  made to match Python rather than the other way round, so the worker needs no special handling and
  must not add any.
- ⚠️ **Chunk-level retry policy is not built.** `03` §11 says bounded retries then the chunk is
  marked `failed` and the job stays resumable; #7 marks it `failed` on the first raise and moves on,
  which is the `attempts = 1` version of that. **`job.available_at` is the other half and nothing
  sets it** — see § Carrying.
- ✔ **`03` §13.5's container half of PIN 6/6 is guarded** — `worker/tests/conftest.py`'s
  `_assert_postgres_18`, before the migrations run, so a Postgres 17 says so in one line instead of
  failing on the first `uuidv7()`.
- **The end-to-end tier can sign in**, if #8 ever wants a request behind the gate.

~~**#5 closed 2026-09-09.** #6 and #3 are independent; either can go first.~~ **#3 went first.**

~~⚠️ **#6 also inherits a debt #5 could not pay: the e2e tier can no longer see a signed-in
document.** `11` §6.1 points at #10; if #6 finds it needs an authenticated request sooner, that is
the ticket to argue it on.~~ ⚠️ **#6 found it needed one and argued it — paid 2026-09-11.** PGlite
behind `@electric-sql/pglite-socket`, a session row, and a cookie signed in the test. **#10 still
owes the browser; it no longer owes the context.** `11` §1 and §6.1 are amended.

~~**#4 closed 2026-09-09**; the frontier is #3 and #5.~~ **#5 closed the same day.**

**⚠️ [#2](https://github.com/yutaasakura96/kioku/issues/2) closed 2026-09-09** — `86144de`, merged to
`main`. **There is code now.** ADR 0020's revisit condition is a passing test rather than a plan, and
each of its three guards was checked by sabotage rather than assumed: removing `external` fails
assertion 2, dropping `/stats`'s `noScripts` fails three tests, setting `features.noScripts: 'all'`
fails the seam test. The dependency bot arrived in the same commit as the first manifest, carrying
all six pins of `03` §13.5. What it left behind is in § Carrying, and **two of those bullets are
findings that amended `11` §1 and §6.1**.

~~**The frontier is now two tickets** — #3 and #4.~~ **#4 closed 2026-09-09**; the frontier is
#3 and #5, above.

**The dependency order, so no session re-derives it:**

```
#2 scaffold ✔ ─┬─→ #3 subject declaration ✔ ┐
              └─→ #4 schema ✔ ─→ #5 identity ─→ #6 ingest ✔ ┐
                                               #4,#6 ─→ #7 worker loop ✔
                                        #3,#7 ─→ #8 pipeline 1–5 ✔
                                                 #8 ─→ #9 generation ✔
                                  #9 ─→ #10 vet mechanics ← the frontier ─┬─→ #11 vet presentation
                                                                        └─→ #12 review
                                                            #12 ─→ #13 outbox ─┐
                                                                     #6,#13 ─→ #14 stats
```

**How the rest of the phase runs:** **`/clear`, then `/implement <n>`** — one ticket per fresh
window. It drives `/tdd` internally and closes with `/code-review`.

⚠️ **[`START-HERE.md`](../START-HERE.md) §4 constrains the ticket order** and a session that finds it
late will re-order its own work: ADR 0001's vertical slice comes first, the `noScripts` smoke test is
cheap and falsifies what the rendering split rests on, the first dependency manifest owes a bot in
the same commit, and three experiments block nothing. **The published tickets already honour all
four.**

**Three first-week experiments**, none blocking anything:

- ~~**The `noScripts` smoke test.**~~ ⚠️ **Promoted to a test 2026-09-07** — `11` §6.1. It leaves
  this list. It was always three assertions plus a config check, and `@nuxt/test-utils`' `$fetch`
  returns the HTML, so the `curl`-and-grep is a `expect(...).not.toContain('<script')`.
- ⚠️ **`S3`'s first real run of twenty notes**, with a written-down expectation. **New here**, and it
  is an experiment rather than a test on purpose (ADR 0037): if the median comes back at eleven
  seconds that is the project learning something, and a red suite is the wrong way to be told.
  ⚠️ **It is now also the instrument for two decisions** — ADR 0044's candidate allowlist and
  ADR 0045's reading script. Both were decided with no real *source* to look at, and the rejected set
  is the evidence: a filter the allowlist should have made shows up as a cluster of rejections
  sharing a part of speech.
- ⚠️ **Nothing comes back for a future-dated `job`, and ADR 0046 made that reachable.** The sweep now
  sets `available_at` forward from the second abandonment, and `03` §3.1 step 6 forbids the timeout
  branch from issuing a query — so a deferred job waits for the next notification or reconnect.
  § Carrying's own sketch of the fix is *a shorter block timeout when and only when the drain saw a
  future-dated row*, which only helps if something then queries; that is the step that would amend
  step 6, and ADR 0028 and `tests/test_loop.py` both pin it. **The cap is thirty minutes so the gap
  stays small rather than closed.** The ticket that wants it closed owns the amendment.
- **One `psycopg.connect()`** against the direct Neon endpoint. Verification §9.1 is documentary; a
  live connection falsifies it cheaply. ⚠️ **A second line settles ADR 0043's open half** in the same
  session: `SELECT pg_notify('kioku_job','')` on the **pooled** string. PgBouncer's matrix says
  `NOTIFY` works in transaction pooling and Neon's summary says the pair does not; the worker is
  correct either way, but one statement says which.
- **Whether an idle `LISTEN` connection defers scale-to-zero.** Neon is silent. ADR 0028 holds either
  way; this settles the *cost* question only.

## Blocked

Nothing.

## Carrying

- ⚠️ **Acceptance must never mint a *scheduling epoch*, and the constraint that says so is three
  tables away from the code that would.** `scheduling_epoch.card_id` is `RESTRICT` (`04` §9), so an
  epoch written at acceptance makes ADR 0033's `Z` fail on **every** acceptance — the database
  refuses the delete and the undo is dead, with a failure that reads like a database problem rather
  than a decision. ADR 0033 said it in its own words ("a card with no `review_log` and no
  `scheduling_epoch`") and nothing had put the sentence beside the constraint until #10.
  `test/schema/vet.test.ts` asserts the **absence**, so the day #12 reaches for the obvious place to
  put the first epoch the *undo* tests redden rather than the *Review* ones. **The first epoch
  belongs to the *session* that first schedules the *card*.**
- ⚠️ **A `RESTRICT` refusal raises `23001`, and Drizzle wraps it.** Measured 2026-09-12 against
  PGlite 0.5.8 / PostgreSQL 18.3: `23503` is `foreign_key_violation` and belongs to `NO ACTION`;
  `04` §9 spells every rule in the `card` chain `RESTRICT`. A guard written against `23503` alone
  catches **nothing**, and reading `code` off the error Drizzle throws catches nothing either — the
  driver's error is its `cause`, and the wrapper's own `code` is `undefined`. `server/utils/vet/undo.ts`
  walks the chain and accepts both codes. **The class is wider than this file**: every `RESTRICT` in
  `04` §9 is a refusal some future code will have to recognise.
- ⚠️ **The e2e tier's database accepts one connection at a time, so `Promise.all` in a request
  handler fails there and only there.** Measured 2026-09-12: `@electric-sql/pglite-socket` fronts a
  single-connection PGlite (`test/schema/harness.ts` says so of the schema tier and it is just as
  true of the socket), so four concurrent reads make `node-postgres` open four connections and the
  server resets three. The route answers `500`; the browser shows an empty screen; **nothing in the
  test output names the cause**, and production would have been fine. `server/utils/vet/queries.ts`
  runs its four reads sequentially and says why. **#12 composes a *session* out of several reads and
  will meet this on its first browser test.**
- ⚠️ **`04` §7.1's idle sweep runs on the next read and therefore not at all while nobody is
  looking** ([ADR 0050](adr/0050-the-idle-sweep-runs-on-the-next-read-because-there-is-no-scheduler.md)).
  A run abandoned by a reader who never comes back stays open, so a *rejection* inside it stays
  reversible — and becomes permanent the instant anybody reads. In v1 that is one reader with one
  laptop, so the window is theoretical; it stops being theoretical for a second reader, which is the
  ADR's revisit condition. ⚠️ **It is also the reason `Done` may fire its end request without waiting
  when the run holds no rejections**: the sweep is the floor under that.
- ⚠️ **`S6`'s "an *accepted* *note*'s fields are frozen" is true by accident, not by a guard.**
  #10's `decide()` is the only writer of `note.fields` in the application and it refuses a *note*
  that is not `pending`, so nothing can currently rewrite an accepted one. **Nothing enforces it**:
  ADR 0006's rule is that a later *source* appends an *occurrence* and never alters the fields, and
  the worker's write path is the other half of that. It is #11's second criterion and it is listed
  here because a property held by the absence of a caller is exactly what `04` §13 says drifts.
- ⚠️ **`note_vetting.flagged_at` is rendered and never written.** `10` §4.3's `returned by a flag`
  aside is built, the queue query reads the column, and nothing sets it — `X` is *Review*'s key and
  `S9` is #13's. **#10 also deliberately does not resolve a flag**: `04` §7.8 says
  `card_flag.resolved_at` is "set when the note is re-vetted", and re-vetting a flagged *note* is
  reachable only through machinery that does not exist. Half of `S9` built inside #10 would have been
  a guess at the half that was not.
- ⚠️ **`05` §4's type ramp is written per *field name*, and the *subject* declaration has no role
  that would generalise it.** "*Vet* — the *meaning*" at 40px Newsreader and "*Vet* — example
  sentence" at 27px Mincho are three JLPT field names, not three roles; the declaration carries
  `kind`, `required`, `memory_bearing` and `label` and nothing that says *this value is Japanese
  prose read at length*. `app/components/VetNote.vue` holds a three-entry map with a fallback and
  says it is standing in for something. **A second *subject* closes it in the declaration** (ADR
  0003), not in a second map — and `10` §4.4 now carries the amendment.

- ⚠️ **The reading half of ADR 0006's *identity key* is the *surface*'s reading, so one word becomes
  several *notes*** — [#15](https://github.com/yutaasakura96/kioku/issues/15), found by #9 and
  deliberately not fixed in it. Measured 2026-09-12: あります gives `normalized_form` 有る with
  `reading_form` アリ, so it keys `有る␟あり`, while ある keys `有る␟ある`; 開いた keys `開く␟ひらい`
  beside `開く␟ひらく`. **§ Carrying's `normalized_form` finding fixed the term half and left the
  reading half on the surface**, and every inflecting word class — verbs and i-adjectives — is
  affected. ⚠️ **It is worse than a key problem**: ADR 0045 makes `reading` a field on the answer side
  of the *card* (`10` §5), so the first *card* #10 mints from an inflected word shows ひらい. The fix
  is a decision rather than a patch — re-tokenising `normalized_form` gives the right answer for
  有る, 開く, 引っ越し, ひらがな and コーヒー **and collapses 開く/ひらく into 開く/あく**, which is
  the pair `04` §5.3 gives as the reason the key has two halves at all; the alternative needs
  `WordInfo.dictionary_form_word_id`, which SudachiPy 0.6.11 emits a `DeprecationWarning` for and
  exposes no public lexicon accessor to resolve. **It changes the identity of existing *notes***,
  which is `03` §5.3's reviewed-data-event class.
- ⚠️ **A test fixture that does not clean a content-keyed table serves one test's answers to the
  next.** `generation_cache` is keyed on `(content_hash, dictionary_version, prompt_version,
  model_id)` — nothing a test owns — and it was not in `conftest.py`'s `SCRATCH_TABLES`. Six of #9's
  tests went **green for the wrong reason** before they went red for the right one: every assertion
  about *what the provider was asked* had quietly become an assertion about the previous test, and
  the one that failed first failed on a `UniqueViolation` rather than on the thing it was about.
  It is in the list now, first and alone, because it references nothing and `04` §10 calls it the one
  table safe to truncate. **The class is wider than this table**: a cleanup list built from "what
  this test wrote" misses anything keyed on content.
- ⚠️ **`03` §5.1 and `04` §6.3 disagreed about what stage 6 is, and only one of them could be
  wrong** — closed 2026-09-12 as
  [ADR 0047](adr/0047-generation-is-one-request-per-chunk-and-notes-are-written-as-each-chunk-returns.md).
  *The LLM, per surviving note* against a cache keyed on the *chunk*'s content hash holding a
  `{"notes": […]}` array: per-candidate requests would put every candidate in a chunk under one
  four-tuple. **The chunk is the unit**, and the chunk's text is in the prompt, because a key that
  does not cover the request is a hit answering a question nobody asked.
- ⚠️ **A cached generation can answer *more* than a run needs and never less, and the asymmetry is
  load-bearing.** The key is the chunk's content, which cannot change; the survivor set shrinks as
  the corpus grows (`S5`). So extra notes in a hit are ignored — and **a hit that misses a survivor
  is treated as a miss**, because serving it would lose a *note* in silence: the chunk would still be
  marked `complete`, so no resume would ever come back for it. The same rule makes a stored response
  that no longer validates a miss rather than an error.
- ⚠️ **`note_field_provenance.kind` has four values and v1 can now produce three** (ADR 0048).
  ⚠️ **Amended 2026-09-12 by #10: `human` is written**, and it is written **only for the fields an
  edit actually changed** — a field the reader read and left alone was produced by the model, and
  stamping it `human` takes ADR 0018's instrument away one *note* at a time. `judgement` stays
  unreachable: v1 hands the model no sense inventory, so a `judgement` row would claim a choice among
  alternatives that never existed and `04` §12's eighth query would be grouping over a distinction
  with no mechanism behind it. **One of four empty is the honest state.**
- ⚠️ **`TRUNCATE … CASCADE` does not stop at the tables you name, and `worker/tests/conftest.py`'s
  cleanup reached `review_log`.** Measured 2026-09-12: `TRUNCATE job, ingestion_chunk, ingestion,
  source_chunk, source CASCADE` follows `note.origin_ingestion_id` → `note` → `card` → `review_log`,
  and a grade written before the statement was gone after it. The comment above that line said
  `review_log` "is not among them and must not be" — true, and beside the point. ⚠️ **`CASCADE` was
  not decorative either**: without it Postgres refuses the statement outright — *cannot truncate a
  table referenced in a foreign key constraint … Table "note" references "ingestion"* — so the one
  keyword that made the cleanup run was the one that let it walk this far. It is ordered `DELETE`s
  now, which is what `04` §9's rules actually apply to: the `RESTRICT` on `card.note_id` refuses two
  tables short, and `review_log`'s `BEFORE DELETE` trigger fires. **A comment was standing in for a
  guard for a day; `test_scratch_cleanup.py` is the guard.**
- ⚠️ **A committed `review_log` row can never be deleted, so a test that writes one poisons every
  later test in the session.** `04` §7.5's trigger refuses the `DELETE`, which refuses
  `scheduling_epoch`, which refuses `card`, which refuses `note` — and `note` is in the fixture's
  cleanup list. `test_scratch_cleanup.py` runs its whole assertion inside a transaction it rolls back
  (`psycopg.Rollback`, with an inner savepoint for the refusal it expects). **The one table worth
  protecting is the one a test cannot clean up after.**
- ⚠️ **`normalized_form` is the term half of ADR 0006's *identity key*, not `dictionary_form`**, and
  the reason is measurable: 引越し and 引越 both normalise to 引っ越し while `dictionary_form` returns
  each surface unchanged, and ひらいた normalises to 開く where `dictionary_form` stops at ひらく
  (2026-09-12, SudachiPy 0.6.11). Keyed on the lemma, one word becomes three *notes*. `03` §16 is the
  sentence that reconciles ADR 0006's prose — *keys a note on (dictionary-form term, reading)* — with
  the field that does it. **And the same field rewrites 六 to `6`**, which is why the numeral rule is
  not optional: the field that buys the deduplication is the field that writes a digit where a word
  should be.
- ⚠️ **The four `ingestion.candidates_*` columns are four disjoint buckets counted per *chunk*, and
  `04` §6.1 never said so.** Extracted counts **sightings**; deduplicated is the sightings folded
  within one chunk; already-known and rejected are groups. A rejected word matches both of the last
  two filters — `04` §7.2 keys a rejection on `note_id` — and is counted **once**, under rejected,
  because `03` §11 shows the reader *which* filter removed the work. `04` §6.1 is amended and the
  decision log carries the reading in full.
- ⚠️ **A word in two *chunks* is two groups, and stage 4 cannot see across a chunk.** Tokenisation is
  per chunk (`03` §5.1), so #8 alone would ask for the same word twice. **`03` §5.1 stage 7's
  streamed write is what closes it** — once chunk 1's *note* exists, chunk 2's sighting is an
  `already_known`. So the streaming is not only `S2`'s time-to-first-review; it is also what keeps a
  long *source* from being generated twice. **#9 must not batch its writes to the end of a run.**
- ⚠️ **The reading is a field on the card, not only half of a key.** That is what decided ADR 0045:
  a mechanical katakana→hiragana conversion gives コーヒー the reading こーひー, which is fine in a key
  nobody sees and wrong on the answer side of a *review*. The rule looks at the **term** rather than
  the surface, and ひらがな is the case that proves it has to — its normalized form is 平仮名.
- ⚠️ **`worker/pipeline/` module names are the declaration's stage keys and a test asserts the
  correspondence — all seven since #9.** It asserted five while stages 6 and 7 had no module, and
  `generate.py` and `write_pending.py` are those modules. ⚠️ **Two of the seven are not pure**, and
  `03` §5.1 never said they were: `generate.py` is still a pure function over a declaration and a
  chunk (the socket is `provider.py`), but **`write_pending.py` writes**. Stages 2 to 5 are the pure
  ones, which is what `11` §8 means by the seam.
- ⚠️ **`SudachiPy`'s `MorphemeList` is still not sliceable and the finding is now closed in one
  place.** `morphemes[:3]` raises `TypeError: argument 'idx': 'slice' object cannot be interpreted as
  an integer` (re-measured 2026-09-12, 0.6.11). `pipeline/tokenise.py` iterates it once into plain
  dataclasses, so nothing downstream can rediscover it.
- ⚠️ **`SudachiDict-core` 20260723 declares 1,558 part-of-speech tuples over 16 top-level classes**,
  enumerated with `Dictionary().pos_matcher` rather than read from documentation. ADR 0044's
  allowlist is 11 of the 38 distinct `(pos₀, pos₁)` pairs and its exclusion list is the other 27, and
  a test asserts the two cover the dictionary exactly — **so a dictionary bump that adds a category
  fails by name** instead of silently dropping a word class. That test is a second reason PIN 2/6
  must not move.
- ⚠️ **`readBody` caches on the event, so two middlewares can both read one form post.**
  `submit-resume.ts` reads the body before `submit-source.ts` does, which is the one thing that could
  have made the resume control quietly break the submission it sits in front of. It is asserted
  rather than assumed: the over-cap e2e test posts 100,001 characters with no `resume` field and
  expects them back inside the textarea.
- ⚠️ **The `POST /` handlers are ordered by filename and there are two of them now.** `session` on
  the `e`, `shell-data` on the `h`, then `submit-resume` before `submit-source` on the `r`. It is the
  same mechanism `shell-data.ts` documents and it fails the same way — closed: a reordering makes the
  resume control read `undefined` for the session and fall through without writing.
- ⚠️ **`CANDIDATE_PART_OF_SPEECH` excludes 代名詞, and that is the most arguable line in the
  repository's Japanese.** これ / それ / あなた are genuinely N5 vocabulary and are also in every
  *source*. ADR 0044 says so in its own text and names the first real run as the instrument. Changing
  it does **not** change the identity of an existing *note* — unlike a dictionary bump or the
  rendering rule — so it is cheap to change and it does not re-ask about words already rejected.

- ⚠️ **On an autocommit connection, `SELECT … FOR UPDATE SKIP LOCKED` followed by an `UPDATE` hands
  the same row to two workers.** `04` §6.4 says the two statements go "in the same transaction", and
  the worker's connection runs `autocommit=True` — which is itself not optional (`03` §3.1: without
  it the listening connection sits idle *in a transaction* and Neon's five-minute
  `idle_in_transaction_session_timeout` kills it on a schedule). So there is no ambient transaction
  to put them in, the `SELECT`'s row lock is released the moment it returns, and the window between
  the two statements is exactly the race `SKIP LOCKED` was chosen to close. **The claim is one
  statement** — the select is the `UPDATE`'s sub-select — which is the strongest available form of
  "the same transaction" and the only one available at all here. `04` §6.4 is amended.
- ⚠️ **PgBouncer's own feature matrix gives `LISTEN` = `Never` and `NOTIFY` = `Yes` in transaction
  pooling**, and this project said "does not support `LISTEN`/`NOTIFY`" in three places. Checked
  2026-09-11 against [pgbouncer.org/features.html](https://www.pgbouncer.org/features.html);
  `03` §4.1, verification §7.2 and §9.2 are amended. **The mechanism is why it generalises:**
  `LISTEN` is session state and transaction pooling gives the server connection to the next client at
  commit; `NOTIFY` is a statement whose effect the *server* delivers at commit, and it does not care
  who carried it. This is what let ADR 0043 put the wake-up in the app instead of in a trigger.
  ⚠️ **Still unverified against Neon**, whose own page names the pair — and the design is correct
  either way, which is the only reason it was allowed to ship unverified. The falsifying experiment
  is one statement and it is in § Next.
- ⚠️ **The `LISTEN` channel is a cross-language constant and a mismatch is completely silent.**
  `kioku_job` lives in `server/utils/ingest/notify.ts` and in `worker/loop.py`; get them out of step
  and nothing raises, nothing logs, and the worker simply never wakes — it drains only on connect, so
  every run waits for a reconnect. `09` §7 then reports that honestly as "queued 4m, not yet picked
  up", which reads exactly like *the worker is not running*. Guarded the way `03` §6's declaration
  is: `test/unit/job-channel.test.ts` reads the Python file and asserts the two spellings agree.
- ⚠️ **ADR 0038's "three tests and nothing else" is now twenty-three, and the number was the wrong
  thing to have written down.** What the ADR was protecting is *a laptop with no Docker runs the
  entire TypeScript suite*, and that is untouched. What moved is that #7 writes SQL which is not a
  concurrency behaviour — the chunk queue, the resume query, the settle, the drain — and testing
  Python's SQL needs a database, which in Python means the container. The alternative was testing a
  **copy** of those queries from the TypeScript tier, which is `04` §13's drift argument aimed at the
  tier that exists to prevent drift. ADR 0038 and `11` §7 carry dated amendments.
- ⚠️ **`worker/tests/README.md` asserted that the container tests *skip* without Docker. They go
  red.** ADR 0038: *"it is the worker's three concurrency tests that go red — visibly and for a
  stated reason, rather than the whole suite refusing to start"*, and `11` §7 and #7's own acceptance
  criteria both say red. The sentence was written with #3 as a contrast for the drift test — *"that
  is the opposite of ADR 0038's three container tests"* — and the contrast did not exist: **nothing
  in that directory skips.** Corrected in place. It is the same failure mode as #6's `<textarea>`
  comment: a confident sentence about a decision, written next to the decision, without reading it.
- ~~⚠️ **Nothing sets `job.available_at` forward, and the loop has no branch that would notice if it
  did.**~~ **Half paid 2026-09-12 by #8 — [ADR 0046](adr/0046-a-job-gives-up-after-five-abandonments-and-the-retry-after-the-first-is-deferred.md).**
  The sweep now sets `available_at` forward from the second abandonment and gives up on a job at five,
  so the **infinite re-claim is closed**. ⚠️ **The other half is open and is in § Next**: nothing is
  scheduled to come back for a future-dated job, so the cap is thirty minutes rather than hours and a
  deferred job waits for the next notification or reconnect. The original text, which is still the
  best statement of the problem:

- ⚠️ **Nothing sets `job.available_at` forward, and the loop has no branch that would notice if it
  did.** `04` §6.4 calls it backoff — "a retry sets it forward rather than sleeping in the worker" —
  but `03` §3.1 step 6 forbids the timeout branch from issuing a query, so a job deferred into the
  future has nothing scheduled to come back for it: it waits for the next notification or the next
  reconnect. Today that costs nothing, because the only writer sets `now()`. **The ticket that
  introduces chunk-level retries owns the question**, and it is a genuine one — a timer branch that
  polls is exactly the keepalive `03` §3.1 refused, so the answer is probably a shorter block timeout
  when and only when the drain saw a future-dated row, which is still not a query on expiry.
  ⚠️ **`attempts` has no ceiling either**, and the two gaps are one gap: a job that reliably kills
  the worker is swept back to `queued` and re-claimed immediately, forever, with `attempts` counting
  up and nothing reading it. Today nothing can produce such a job — the handler is bookkeeping — and
  the ticket that makes a job able to fail owns both halves.
- ~~⚠️ **Every ingestion settles `incomplete` until #8 lands a chunk processor**~~ — **#8 landed it
  2026-09-12**, so a run that reads its whole *source* settles `complete` and `incomplete` goes back
  to meaning a run that stopped part-way. `10` §6.2 is amended. Kept because the reasoning is the
  reason `failed` is still not reachable from `settle_run`:

- ⚠️ **Every ingestion settles `incomplete` until #8 lands a chunk processor**, and that was the true
  answer rather than a placeholder: the queue is open, nothing was processed, and every chunk is
  still there. The run row says `0 of 31 chunks · 0 notes so far`. ⚠️ The two other readings would
  both be lies — `running` claims a worker is on it, `failed` claims something broke — and `04` §6.1
  is explicit that **`incomplete` is `S2`'s resumable state, not an error.**
- ⚠️ **`recordSource`'s `jobKind` parameter said "#7 writes `resume`" and #7 does not.** A resume
  enqueues a second `job` against an *ingestion* that already exists (`04` §6.2) and writes no
  `source`, no chunks and no `ingestion` — which is everything else that function does. The parameter
  is reachable only from `test/schema/ingest.test.ts`, where it drives `04` §6.4's `CHECK` through the
  production path instead of by raw SQL. The comment is corrected on the field.

- ⚠️ **`@vue/compiler-ssr` renders a `value` bind on a `<textarea>` as the element's raw children, and
  the HTML parser eats one newline after `<textarea>`.** So a refused paste beginning with a blank
  line came back one line shorter than it went in — which is exactly the loss `09` §4.2 exists to
  prevent, in miniature and harder to notice. `app/pages/index.vue` prepends a newline so the eaten
  one is ours. ⚠️ **This was a comment asserting the opposite from memory** — that `:value` avoided
  the problem — and `/code-review` caught it. It is what CLAUDE.md § Working agreements means by
  "never verify from memory": the two claims either side of it in the same commit *were* measured, and
  this one read exactly like them.
- ⚠️ **A missing `owner_id` filter on `recentRuns`, `allSources` and `sourceDetail` is `04` §4, not a
  bug**, and it was read as one during review. A *source* and an *ingestion* are **shared** — "true
  regardless of who is asking" — and `ingestion.submitted_by` is documented on the column as "**an
  audit line, not an owner**". `startBlockCounts` *is* filtered, because *note vettings* and *cards*
  are personal. **Adding a filter to the first three would be a product change.** The reasoning now
  sits on the function rather than only in `04`.
- ~~⚠️ **`incomplete` owes a resume control and #6 did not build it.**~~ **Paid 2026-09-12 by #8**,
  after #6 moved it to #7 and #7 moved it to #8 — each time correctly, because the control is only
  worth shipping once a resume does something. `server/utils/ingest/resume.ts` writes one `job` row
  at `kind = 'resume'` and refuses any status but `incomplete`; `server/middleware/submit-resume.ts`
  answers the form; `app/components/RunRow.vue` draws it. `10` §6.2 carries the geometry. The
  original, kept because three tickets deferred on its argument:

- ⚠️ **`incomplete` owed a resume control and #6 did not build it.** `10` §6.2 and `09` §7 both give
  that run row "a resume action (the quiet affordance, with its arrow)". The control is a **write** —
  a second `job` at `kind = 'resume'` (`04` §6.4) — and what resuming means is `04` §6.2's resume
  query, which is the worker's and arrives with #7. A control that wrote a job no worker could act on
  would be worse than the line that says what completed. `10` §6.2 is amended to say so.
- ⚠️ **Two of #6's acceptance criteria were met by changing the documents they cite**, and both are
  disclosed rather than quietly folded in. The submission path moved to `POST /` (ADR 0042) and
  `/sources/:id` was built readable-only although criterion 8 puts the detail route out of scope. Each
  has an amendment in the document it contradicts. **Neither is a decision a reviewer should have to
  reconstruct from the diff**; if either is wrong, the amendment is where to argue it.

- ⚠️ **Interpolating a Drizzle column into a `sql` template emits a *bare, unqualified* identifier**,
  and in a correlated subquery that silently binds to the inner table. Measured 2026-09-11,
  drizzle-orm 0.45.2: ``sql`… WHERE ${note.originIngestionId} = ${ingestion.id}` `` emits
  `WHERE "origin_ingestion_id" = "id"`, and inside a subquery over `note` that `"id"` is `note.id`.
  Valid SQL, no error, a number comes back. The fix is to build the subquery with Drizzle and embed
  it — ``sql`${subquery}` `` emits `where "n"."origin_ingestion_id" = "ingestion"."id"`.
  ⚠️ **The worst case was the *pass*, not the failure:** the chunk count written the broken way came
  out as `WHERE "source_id" = "source_id"`, trivially true, counting every chunk in the table — and it
  **agreed with the right answer for as long as there was one *source***. That is why
  `test/schema/place-queries.test.ts` seeds a second *source* and a second *ingestion* for every count
  that has one. **It generalises past that file: any `sql` template meaning to correlate is wrong the
  same way.**
- ⚠️ **JavaScript's `.length` is UTF-16 units and Python's `len()` is code points, and `04`'s offsets
  cross that line.** `'𠮟'.length` is 2; `len('𠮟')` is 1. The app writes `char_start` / `char_end`
  and the worker slices `source.content` by them in Python, so **one character outside the BMP puts
  every later offset one out** — silently, surfacing months later as an *occurrence* highlighting the
  wrong span. Everything in the ingest path goes through `shared/ingest/text.ts`, which iterates code
  points; nothing there uses `.length` or `.slice` on source text. Same class as #3's `trim()` /
  `str.strip()` divergence, closed the same way. ⚠️ `Intl.Segmenter` is the wrong fix — it counts
  *graphemes*, and the contract is with Python's `len()`.
- ⚠️ **Nuxt's page renderer answers `POST` with a fully rendered document, and a middleware cannot
  re-route by rewriting `event.node.req.url`.** Both measured 2026-09-11 against the built app; the
  second `404`s. Together they are why **the *source* submission is `POST /`, not `POST /api/source`**
  (`09` §1 and §4.2 amended): a refused paste must be answered with the Ingest document re-rendered
  and the reader's text in it, and a Nitro route handler cannot render a page. `nitropack` 2.13.4's
  `localFetch` takes no context either, so the paste cannot travel to an internal render. **Everything
  the old row was for is unchanged** — form, post-redirect-get, `SameSite=Lax` CSRF.
- ⚠️ **The three *places* read their data from `event.context`, not from a fetch.** `#5` set the idiom
  (`app/pages/auth/index.vue` reads `useRequestEvent()?.context.session`) and #6 extended it:
  `server/middleware/shell-data.ts` attaches a **lazy reader**. The alternative — `useAsyncData` +
  `$fetch` against new `/api/**` read routes — was rejected on three counts, and **the middle one is
  the trap**: `useAsyncData` serialises its result into the Nuxt payload, which is a
  `<script type="application/json">` **on a route whose whole contract is that it emits no
  `<script>`**. The other two: it adds routes `09` §1's table does not have, and the internal call
  would need `useRequestFetch()` to forward the session cookie.
- **The chunking rule was decided here, not read.** 1200 characters, breaking at the last of
  `。！？\n` at or before the target, terminator belonging to the chunk it ends, hard break where the
  window holds none. `04` §5.2 gave the *property* ("a function of content … stable across
  re-ingestions") and its worked example gave the only number. ⚠️ Moving it changes
  `source_chunk.content_hash` for every *source* ingested afterwards and therefore the first element
  of the generation cache key — **a cost, not a corruption**: unlike a `SudachiDict` bump it cannot
  change the identity of an existing *note*, because boundaries never reach `normalized_form`.
- ⚠️ **`05`'s tokens now exist and the font *files* still do not.** `app/assets/css/tokens.css` is
  `05` §§1–6 — this closes the "no ticket owns them" bullet below. **What did not close:** `05` §4
  calls shipping the faces "a Phase 4 question" and **Phase 4 never answered it.** The stacks carry
  `05` §4's own fallbacks, so a reader today sees Georgia rather than Newsreader. It was left open
  rather than decided in passing because it is a dependency decision with a pin obligation
  (`03` §13.5); the leaning and the reasoning are in `06-decision-log.md`.
- ⚠️ **The e2e tier signs in now, and no endpoint mints a session.** PGlite behind
  `@electric-sql/pglite-socket` 0.2.11 gives the built app a real wire-protocol database;
  `test/e2e/session.ts` writes the row and signs the cookie with Better Auth's own scheme, read off
  `better-call`'s `signCookieValue`. **A test-only sign-in route was refused outright** — `S1` says
  refused at every route, and that would be a hole in the property #5 exists to establish. The forgery
  **cannot pass by accident**: anything wrong resolves to no session and a `302`, so it fails loudly.
  ⚠️ **Sign-in itself is still untested** and `11` §8 and §9 are unchanged.
- ⚠️ **A guard that a sabotage cannot reach is not a tested guard, and one of #6's is not.**
  `server/middleware/shell-data.ts` refuses to attach anything when no session resolved — defence
  against a middleware **reordering**, since Nitro runs `server/middleware/` alphabetically and
  `shell-data` sorts after `session` on the `h`/`e`. Sabotaged 2026-09-11 by giving it a fallback
  owner; **the suite stayed green**, correctly, because `session.ts` has already answered `302` and
  nothing downstream ever runs without a session. The comment in that file says so rather than
  implying coverage. **The general lesson: two of the ten sabotages this session did not fail, and
  both times the first question was whether the sabotage was weak — once it was** (a cross join over
  one row is an inner join) **and once it was not.**
- ⚠️ **`/sources/:id` exists and is only the readable half.** #6's criteria put the detail route in
  `S11`, and two of its other criteria link there — a link to a `404` is not an offer. Title, fact
  line, retained material. **The *notes*, the *occurrence* positions and `/sources/:id/delete` are
  still `S11`'s**; `10` §7.2 is amended to say which half is which.

- ⚠️ **TypeScript widens every string in an imported JSON module, so the declaration is derived and
  still untyped.** `typeof declaration.fields[number]['name']` reads exactly like it produces a union
  of the six field names; it produces `string`, and `const x: FieldName = 'zzz'` compiles — measured
  2026-09-10. **Nothing in `subjects/jlpt-vocab.json` is checked by `tsc`**, which is why both
  languages carry a `checkDeclaration` over the file's own shape as well as the `validate` seam, and
  why `03` §6's "the guard is a test, not a convention" is the only option rather than a preference.
  ⚠️ **A future session will reach for codegen to fix this.** It was considered and lost on what it
  buys: TypeScript's consumers *iterate* the declaration — *Vet* renders the judgement fields,
  *Review* renders a template — rather than naming fields, so a literal union would guard almost
  nothing for a generator, a generated file and a diff test.
- ⚠️ **The declaration's roles are flags, and that is load-bearing.** `kind` and `memory_bearing` sit
  on the field, so neither can name a field that does not exist. `identity_key` and a *template*'s
  `prompt` / `answer` stay lists because they are ordered and may repeat a name — `04` §5.3 renders
  the key "in the order the subject declaration lists them" — and those two are what
  `checkDeclaration` exists to guard. **Do not "regularise" the flags into parallel lists**; it would
  re-open the drift the flags close.
- ⚠️ **A stage key is also a Python module name.** `03` §10 puts one flat module per stage under
  `worker/pipeline/`, named by the declaration. `extract-candidates` with a hyphen parses as JSON,
  reads fine, and cannot be imported — invisible until #8. The drift test asserts every stage key is a
  legal lowercase identifier, which is the only place that is checked.
- ⚠️ **Node's ESM resolver is stricter than Vite, and `scripts/print-subject-view.ts` is where it
  shows.** It will not extension-guess (`ERR_MODULE_NOT_FOUND`, so the import carries `.ts`) and it
  refuses a JSON module without `with { type: 'json' }` (`ERR_IMPORT_ATTRIBUTE_MISSING`). Vite accepts
  both forms, so **the repo's own bundler cannot tell you the import is wrong** — only the drift test
  can, and only because it shells out to Node.
- **The worker's toolchain is uv, `pyproject.toml` and `uv.lock`, on Python 3.11.** ⚠️ The interpreter
  is pinned by `worker/.python-version` and **not** by `.tool-versions`, because uv reads the first
  and not the second and two files pinning one interpreter is the drift this project spends its time
  refusing; `.tool-versions` carries a comment pointing at it. 3.11 is the line verification §7.3
  measured SudachiPy's 9 ms load on. ⚠️ **`03` §13.5's bot rule is satisfied without touching
  `renovate.json`** — Renovate's `pep621` manager matches `pyproject.toml` wherever it sits, reads
  PEP 735 `[dependency-groups]`, and maintains `uv.lock` (verified 2026-09-10). The two Python pins
  written months ago finally have a file to attach to.
- ⚠️ **Two cross-language divergences were found by review, not by the suites, and both are now
  tested.** Both implementations were written, both suites were green, and the two still disagreed.
  **`null`**: TypeScript called it `not_a_string`, Python called it `missing` — and on an *optional*
  field that was one accepting what the other refused. It is an **absent field** in both now.
  **Whitespace**: `trim()` and `str.strip()` differ on exactly six characters across the BMP (swept,
  not recalled) — Python strips `U+001C`–`U+001F` and `U+0085`, JavaScript strips `U+FEFF` — and
  ⚠️ **`U+001F` is what `04` §5.3 joins the *identity key* with.** Emptiness is now a shared character
  class, the union of the two, written the same way on both sides. ⚠️ **It is anchored `\A…\Z` in
  Python and `^…$` in JavaScript deliberately**: Python's `$` also matches before a trailing newline,
  which would have been a seventh divergence. **The lesson is the general one** — "the two agree" was
  in three documents and in neither suite until someone compared the two implementations line by line.
- **The `validate` seam exists twice and the error *codes* are the contract, not the messages.** Both
  languages report declared fields in declaration order and then unknown keys in the order the output
  carried them. ⚠️ **Do not "improve" either side's error strings into prose** — the order and the
  codes are what the two suites assert, and a message would not survive translation.
- ⚠️ **The declaration's `validate` tests use a two-field synthetic, on purpose.** A test written
  against `jlpt-vocab.json`'s real six would pass for the wrong reason the day the validator
  hard-codes one of them. The real file gets its own tests — that it is internally consistent, and
  that it names what ADR 0006, ADR 0011, `03` §5.1 and `PRD` §6 say it must.
- ⚠️ **ADR 0005's authority list is owed and no ticket owns it.** `04` §5.6 makes
  `level_claim.authority_key` a key into the *subject* declaration and `04` §13 puts the precedence
  order there too. #3 did not build either: which publications count as *authorities* is a data
  decision ADR 0005 left open, not something to invent, and #3's acceptance criteria do not ask.
  The keys are additive. **The ticket that first renders a *level* lands them** — same shape as the
  `05` tokens gap below.
- ~~**Use `/grill-with-docs`, always.**~~ ⚠️ **Retired 2026-09-08 — the frontier is empty.** It was
  the right default for Phases 1–4 and it produced 39 ADRs; there is now nothing left for it to ask,
  and `CLAUDE.md` § Working agreements says do not run it and do not offer it. **What survives is the
  half that was never about grilling:** the build commands are `disable-model-invocation: true` too,
  so a session **says which one to type in one line and stops.** It does not substitute an interview
  of its own — `/project`'s included.
- **Grilling asks the whole frontier per round, not one question at a time.** This contradicts
  `CLAUDE.md` § Working agreements, which now records the substitution explicitly. **Rounds win.**
- **Find facts yourself; never ask Yuta for them.** Rounds 1 and 2 dispatched ten background agents
  between them and asked the rest of the frontier while they ran. That is the pattern. Round 2 also
  **measured** a number nobody publishes, rather than citing around it.
- **Recommendations get pushed back on, and that is the process working.** Round 2 recommended
  TanStack Start and got Vue; recommended Render and got Vercel-plus-a-laptop. Both reversals were
  right, and both are argued out in the ADRs rather than quietly swapped.
- **The initial deployment is temporary by design.** ADR 0022. The destination is EC2 or Lightsail.
  **Nothing may depend on a Vercel-only feature** — no Vercel KV, Blob or Cron — or the move stops
  being a preset change.
- **Every *mode* now carries a visible Done control**, on every viewport — ADR 0026. This came out of
  the phone layout (a phone has no `Esc`) but it is not a phone concession: it changes what a mode
  *is*, and `CONTEXT.md`'s definition moved with it. ADR 0013 emptied those headers on purpose, so
  the one control they carry was argued for, not defaulted into.
- **The ink ramp is four greys, not seven** — ADR 0024, and `05-design-system.md` §2 carries the
  outcome. *Vet* now reads heavier than the artboard does. **That is the decision, not drift**; do
  not "restore" the canvas values.
- ⚠️ **The key handlers bind to the mode container, never to `document` or `window`.** ADR 0025 put
  focus there so keystrokes land somewhere and a reload restores it. Verification §13.4 found the
  second reason: ADR 0023's map is all printable characters, so **SC 2.1.4 Character Key Shortcuts
  (Level A)** applies, and the application passes **only** on that criterion's "Active only on focus"
  exception. Binding to `document` is the obvious shortcut and it fails a Level A criterion with
  nothing on screen to show it. ADR 0025 is amended; `10` §4.1 and §11.
- **"Again" is not a grade label here** — ADR 0034. ADR 0016 turned same-day relearning off, so the
  soonest a graded *card* returns is **tomorrow** (verification §13.1, read from `ts-fsrs` source).
  `1 Forgot · 2 Hard · 3 Good · 4 Easy`. Anyone comparing a screenshot with Anki's will think the
  difference is cosmetic; it is the visible end of ADR 0016.
- **Three screens have three interaction states, not five** — ADR 0035. Ingest, Sources and Stats
  ship no JavaScript, so loading is the browser's and an error is a re-rendered document. **The
  asymmetry in `10`'s tables is the decision, not an unfinished table.** And **nothing in v1 is
  disabled**, deliberately — ADR 0032 already refused a disabled start control once.
- ⚠️ **The suite cannot tell you the thesis is failing, and that is the design** — ADR 0037. Green
  tests mean the instrument is built correctly and say nothing about what it will read. `S3` and
  `S10` are answered by `/stats`, by a person, after twenty notes. **Do not add a threshold
  assertion later "to be safe"** — ADR 0018 needs *acceptance rate* free to fall while the model is
  walked down.
- **PGlite is PostgreSQL 18.3 and its version is load-bearing** — ADR 0038, verification §14.1,
  **measured because the docs do not say**. `04` defaults every primary key to `uuidv7()`, a Postgres
  18 built-in, so a PGlite that regressed to 17 fails on the first migration. It joins the four pins
  in `03` §13.5.
- **Docker is required for three tests and nothing else** — ADR 0038. A laptop without it runs the
  whole TypeScript suite. Do not "simplify" the two harnesses into one Testcontainers tier; the
  946 ms inner loop is the thing being bought.
- **Grade by swipe is refused, not pending** — ADR 0036. ADR 0026 called it "genuinely good", which
  is exactly why it needed answering: SC 2.5.1 is **Level A**, so a gesture could only ever have been
  additive, and the trade the deferral assumed never existed.
- **`10-screen-specifications.md` belongs to Phase 4**, not Phase 3. The `/project` skill's own
  phase table says Phase 3; this project overrode it deliberately. Do not let a future session move
  it back on the skill's authority.
- **The ADRs are the decision log's long form.** Add the ADR first, then the index line.
- **JLPT has published no official vocabulary list since the 2010 revision**, deliberately. Verified
  2026-09-03, recorded in ADR 0005. Do not re-verify; do not re-litigate.
- **ADR 0016 records a real cost, not a simplification.** Dropping same-day relearning is a genuine
  reduction in learning efficiency. If retention later looks poor while *false-accept rate* is
  clean, the answer-bounded session in that ADR is the first thing to try.
- **ADR 0019 was the weakest-held decision of Round 1**, and Round 2 did not disturb it. The Python
  worker's two-toolchain tax is real and the Node route runs an identical engine. It is fine to
  revisit; it is not fine to revisit by forgetting why.
- **ADR 0015 now survives on its second argument only.** The 9 ms measurement killed the latency
  reason for an always-on worker. What stands is that a directly-connected worker needs no HTTP job
  endpoint, which keeps PRD S1's "refused at every route" literally true.
- **Two Neon connection strings, on purpose.** Pooled for the app, direct for the worker. The pooled
  endpoint does not support `LISTEN`/`NOTIFY` — confirmed against Neon's own list and PgBouncer's.
- ⚠️ **This file used to claim a held listener keeps the Neon compute awake and exhausts the month.
  That was never verified and Neon does not document it** — it says what *wakes* an idle compute,
  never what prevents suspension (verification §9.2). What *is* documented: Free cannot disable
  scale-to-zero, and a suspended session destroys the listener along with every notification fired
  while the worker was away. **ADR 0028 is the answer and it holds whichever way the cost question
  resolves** — the job table is the truth, `NOTIFY` only shortens latency, and the worker
  re-`LISTEN`s *then* polls on every reconnect, in that order.
- **⚠️ Two pipeline findings, now carried by `03` §5.2:** numerals come back `is_oov=True` with
  `normalized_form` rewritten to ASCII (六 → `6`), which ADR 0006's *identity key* depends on — the
  rule is that numerals are excluded at candidate extraction rather than reaching the key; and
  `tokenize()`'s result is not sliceable, so anything windowing over morphemes iterates.
- **The dictionary version is now part of the ingestion cache key**, and `SudachiDict-core` is
  pinned at `20260723`. **Moving it can change the identity of existing *notes*** — it is a reviewed
  data event with a re-ingestion plan, never an automated bump. `03` §5.3 and the decision log.
- **⚠️ The laptop is the security weak point, and it is named rather than mitigated.** It holds the
  direct connection string and the model provider key at once. `03` §13.6 states what is true today
  (disk encryption, rotatable credentials, no key in the repo) and what is not (any second factor).
  This is a cost of ADR 0022's temporary shape, and part of what the move buys.
- **Backups are `S12`'s tested export, not Neon.** Free gives six hours of instant restore and one
  snapshot; six hours is not a backup for the one thing that cannot be regenerated. `03` §13.6.
- **⚠️ Better Auth's generated schema cascades from `user`, and ours must not.** Every child it
  generates carries `onDelete: "cascade"` (verification §10.2). Personal entities use **`RESTRICT`**
  instead — `04` §3 — because a copied default would let one deleted row destroy every *scheduling
  epoch* and *review log* beneath it. Better Auth keeps its own cascades; they are correct for data a
  sign-in regenerates. **The rule is not "no cascades" — it is that a cascade must never reach a
  table that cannot be rebuilt.**
- **Scheduling state lives on `scheduling_epoch`, never on `card`.** A reset is then an `INSERT`
  rather than an `UPDATE` over the history it is meant to preserve. Do not "simplify" it back onto
  the card at implementation time; `04` §7.4 is the argument.
- **`note.fields` gets no index.** No v1 query reads inside it — the card browser is cut and there is
  no field search. It is the index a future session adds on the general principle that jsonb wants a
  GIN index. It does not; queries do (`04` §11.1).
- **The stale-job sweep runs in the worker**, not on a schedule elsewhere. Vercel Cron is on
  ADR 0022's forbidden list, and the worker already polls on every connect and reconnect, so it costs
  nothing (`04` §6.4).
- ⚠️ **`prerender`, `swr` and `isr` are forbidden on Ingest, Sources and Stats.** Each is the
  ordinary advice for a route that renders a form, a list and five numbers, and each turns a
  session-gated document into a shared artifact — a prerendered route is a static asset with no
  request to gate, and Nuxt maps `isr` onto Vercel's own CDN rules. ADR 0030, verification §11.4.
  The `noScripts` smoke test's `{ prerender: true, noScripts: true }` is correct **for the test**.
- ⚠️ **The allowlist's shape is the decision, not its location.** A list-shaped allowlist admits
  everyone when the list is empty, and Better Auth's documented `validateUserInfo` example narrows on
  the provider before comparing, which fails open the day a second provider exists. `08` §4.3 uses
  neither. A missing `KIOKU_INVITED_EMAIL` stops the process.
- **There are six routes, not five.** `/auth` is the door — it ships JavaScript and is neither a
  *place* nor a *mode* — and `/auth/refused` carries a message and nothing else. This does not amend
  ADR 0013, whose taxonomy is about the five screens of the app; `08` §2 adds the boundary before
  them.
- **The remote is [`yutaasakura96/kioku`](https://github.com/yutaasakura96/kioku), public, added
  2026-09-07.** ⚠️ **Public is the constraint that matters:** `KIOKU_INVITED_EMAIL` and every other
  value in `03` §13.1 stay out of the repository, and `08` §4.1's argument for keeping the allowlist
  in the environment is now stronger than it was when it was written. `/setup-matt-pocock-skills`
  still belongs after planning.
- **`frontend-design` and `superpowers` are off at project scope**, for different reasons.
  `CLAUDE.md` § Tooling state has both correctly.
- ~~⚠️ **Two amendments are owed to documents that are already written.**~~ **Both applied
  2026-09-07** while writing `10`: `04` §9.1 now excepts the card un-minted by `Z`, and `03` §8.1 now
  says the outbox carries *grades* **and** `S9` flags.
- ⚠️ **A *mode*'s Done control must be `external`.** `<NuxtLink :to="origin" external>` or
  `navigateTo(origin, { external: true })`. A bare `<NuxtLink>` client-renders the *place* into the
  page that is already running and hands the reader a `noScripts` screen with a live Vue app on it,
  with no error anywhere (`09` §5.2, verification §12.1). It is not version-specific and no upgrade
  will flag it; the `noScripts` smoke test is the cover.
- **ADR 0013 claimed to close the empty-*Vet* navigation gap and could not** — the gap is on *Vet*,
  and ADR 0013 is what made *Vet* a mode. ADR 0032 closes it with two controls that mean different
  things: Done returns to the *place* the reader came from, the quiet affordance says to go to
  Ingest. Do not "simplify" them into one.
- **The streaming queue is visible on *Vet*, not on Ingest.** Ingest ships no JavaScript, so it
  cannot poll, and no *place* auto-refreshes — a meta refresh on `/` would destroy a paste in
  progress. `S2`'s "vettable while the rest are still generating" works because the screen that has
  to show it is the one with a client (`09` §3, §7).
- ⚠️ **npm 11.3.0 cannot resolve `nuxt@4.5.2` from scratch, and the lockfile is what makes that
  survivable.** Measured 2026-09-09 while scaffolding #2: `npm install` crashes with
  `Cannot read properties of null (reading 'edgesOut')` inside arborist's peer-set walk. It is an
  upstream npm bug and not ours — a `package.json` containing nothing but `nuxt` and `vue`
  reproduces it. **`npm ci` against the committed `package-lock.json` works on 11.3.0**, so the
  normal path is fine; it is **adding or re-resolving a dependency** that needs **npm ≥ 12**
  (12.0.2 verified clean). `--legacy-peer-deps` also gets past it and is the wrong answer, because
  it turns off peer checking for the life of the project.
- **The repo pins Node with `.tool-versions`, at `nodejs 24.11.0`.** asdf's global is 25.1.0, which
  is *outside* Nuxt 4.5.2's `engines` (`^22.19.0 || ^24.11.0 || >=26.0.0`, `03` §2) — an odd-numbered
  line that is not an LTS. 24.11.0 was already installed, so this cost nothing.
- ⚠️ **`ssr: false` does not server-render the page, and `11` §6.1 is amended for it.** The response
  is an app shell with an empty `<div id="__nuxt">`, so a *mode*'s Done control is not in the HTML —
  measured 2026-09-09. **The `external` assertion is a browser assertion**, and it has to *click*
  Done rather than read its `href`, because a bare `<NuxtLink>` renders the same `href`. `03` §2.1's
  "an app shell, not a blank page" is correct; it is thinner than it sounds.
- ⚠️ **PIN 6/6's second half is `postgres:18.3-alpine`, and it lives in `worker/tests/README.md`
  because there is no manifest to put it in.** `@electric-sql/pglite` 0.5.8 is PostgreSQL 18.3, and
  `04` defaults every primary key to `uuidv7()`, a Postgres 18 built-in — so the two test databases
  have to agree on the major or the schema tier and the worker tier are testing different things.
  **No bot watches a tag in a README**, which is `03` §13.5's whole point. The TypeScript half is
  now guarded by an assertion in `test/schema/schema.test.ts`; **#7 owes the container half the same
  guard.**
- ⚠️ **The Better Auth generator's documented flags silently drop the `auth` schema.** Measured
  2026-09-09 while building #4. `npx auth@latest generate --adapter drizzle --dialect pg` — the form
  `04` §8 and `08` §7 both prescribed — makes the CLI **synthesise** an adapter rather than read the
  configured one, and the configured one is where `schemaName` lives. The output is `pgTable(...)` in
  `public`: the four tables appear, the migration succeeds, and the schema separation is simply
  absent. **Drop both flags and pass `--config`**, with
  `drizzleAdapter(db, { provider: "pg", schemaName: "auth" })`. Both documents are amended, and
  `test/schema/schema.test.ts` now asserts the four tables are in `auth` so the correction is held by
  a test rather than a paragraph.
- ⚠️ **`server/db/schema/auth.ts` is generated and must stay unedited.** `08` §7 keeps those four
  tables unremapped — no `modelName`, no `fields`, no `additionalFields` — **precisely so the file
  can be regenerated and diffed against what is deployed**, and a tidy-up costs exactly that. Two
  things in it look wrong and are not: the `onDelete: "cascade"` on every child of `user` is correct
  there (a sign-in regenerates a session and an account), and its `timestamp` columns are the one
  place the generator disagrees with `04` §1's `timestamptz` convention. **The cascade rule is not
  "no cascades"** — it is that a cascade must never reach a table that cannot be rebuilt, which is
  why `personal.ts` uses `RESTRICT` eighteen times.
- **The app's driver is `node-postgres`, and that is ADR 0040, not a default.** ⚠️ Two reasons, and
  the second is the one that would be lost: `@neondatabase/serverless` is a dependency ADR 0022's
  move has to undo, **and `drizzle-orm/neon-http` has no session at all**, so it cannot run `04`
  §9.1's `Z` un-mint as one transaction — choosing it would have made a schema decision by accident.
  Do not "modernise" this to a Neon driver on the grounds that the database is Neon.
- ⚠️ **A `RESTRICT` violation does not say "violates foreign key constraint".** Postgres says
  **"violates RESTRICT setting of foreign key constraint"**, which is a *stronger* signal and worth
  asserting on: it distinguishes `RESTRICT` from `NO ACTION`, and `NO ACTION` is what a careless
  migration would leave behind. Measured 2026-09-09 — the first draft of the schema tests asserted
  the weaker string and four of them failed.
- **`TRUNCATE` does not fire the `review_log` append-only trigger, and the schema tier depends on
  that.** The trigger is `FOR EACH ROW BEFORE UPDATE OR DELETE`; `TRUNCATE` is neither. This is a
  property of `TRUNCATE`, not a hole in the guard — it takes an `ACCESS EXCLUSIVE` lock and no
  application path issues one — but it is why a test reset is possible at all. ⚠️ **A future session
  that "closes the gap" by adding a truncate trigger breaks the tier's reset.**
- ~~⚠️ **#4 did not install `better-auth`, and #5 owes that work.**~~ **Paid 2026-09-09**, and the
  collision was narrower than this bullet guessed. ⚠️ **It is not SvelteKit and it is not TanStack
  Start** — those appear in npm's error only as the reason `vite` 8 is in the tree at all. The
  blocking edge is one line: `peerOptional vitest@"^2.0.0 || ^3.0.0 || ^4.0.0" from
  better-auth@1.7.3`, against this repo's `vitest` 5. **npm refuses an install over an *optional*
  peer that is present at another major**, which is the part worth remembering. The answer is one
  `overrides` entry scoped to `better-auth`'s subtree — `"vitest": "$vitest"` — and the install adds
  seven packages with no Svelte or TanStack among them. ⚠️ **`--legacy-peer-deps` is still the wrong
  answer and it is what the error message suggests**: it turns off peer checking for the life of the
  project, for every package, to get past one optional peer. `03` §13.5 carries both, plus the
  seventh pin: `better-auth` **1.7.3 exactly**, because `08` §7 regenerates and diffs the four tables
  and that only means something against a known version.
- ⚠️ **A *mode*'s `external` Done control is proved by a click, not by a browser** — and #5 is what
  forced the correction, by gating both *modes* out of the e2e tier's reach. `11` §6.1 said the
  assertion had to run in a browser, and the reasoning was right up to its last step: the two forms
  render the same `href`, so it has to **click**. A mounted component can be clicked.

  ```
  external : <a href="/stats">Done</a>   click → event.defaultPrevented === false
  bare     : <a href="/stats">Done</a>   click → event.defaultPrevented === true
  ```

  Identical markup, opposite in one bit. It is `test/nuxt/modes.test.ts`, it covers both modes, and
  it fails by name. ⚠️ **What the gate genuinely took away** is the signed-in half of assertion 1 —
  that Ingest, Sources and Stats ship no JavaScript *to a reader who is in*. That needs a session
  row, which needs a database in the TypeScript suite, which ADR 0038 kept out. **#10 cannot be
  tested at all without an authenticated e2e context**; `11` §6.1 names it as the home for one.
- ⚠️ **The middleware skips the framework's own paths by *shape*, not by a list** — `/_…`, or
  anything with a file extension. A list would quietly grow an entry that answers with reader data.
  Both halves of the skip matter: redirecting `/_nuxt/**` would break the two *modes*, whose
  documents are an app shell that then fetches its own bundle, and resolving a session for each asset
  would put a database read behind every one. It is not a hole in `S1` — what is served there is
  static build output, identical for every reader.
- ⚠️ **Better Auth types `auth.options` as the exact object literal passed in.** That makes the
  configuration a real seam — `test/unit/auth-config.test.ts` reads it and needs no request — and it
  has one trap: an option that is **absent on purpose** (`cookieCache`, `useSecureCookies`,
  `advanced.cookies`) is not a property that reads `undefined`, it is a property the type does not
  have, and `expect(…).toBeUndefined()` on it **does not compile**. Those four assertions read
  through a `BetterAuthOptions`-widened view. Do not "fix" them by deleting them.
- ⚠️ **The door reads the session from the middleware too, not from `authClient`.** `/auth` is the
  one route with a client, so `useSession()` is exactly what a future session will reach for — and
  `08` §6.1 is why it must not: client actions other than `useSession` do not forward cookies during
  SSR, and the documented repairs are void on a `noScripts` route. `app/pages/auth/index.vue` reads
  `useRequestEvent()?.context.session` on the server pass and carries **only the email** into the
  payload. `app/utils/auth-client.ts` constructs the client **lazily**, so an SSR call gets nothing
  rather than a subtly signed-out render.
- ~~⚠️ **`10` §9's visual specification for the door and the refusal page is not built, and #5 did not
  own it.**~~ ⚠️ **Half-closed 2026-09-11 by #6**, which landed `05`'s tokens as the first screen
  ticket to need them. **The door and the refusal page were not restyled** — #6 did not touch
  `app/pages/auth/`, so those two still carry the content and structure without the treatment. What
  changed is that the tokens are now there for whoever does. The original bullet follows.

- ⚠️ **`10` §9's visual specification for the door and the refusal page is not built, and #5 did not
  own it.** Both pages carry the content and the structure `10` §9 names — the mark, the name, the
  body line, the rule, the control; the statement, the body, and no rule — with no treatment, because
  `05-design-system.md`'s tokens do not exist in the repo yet and **no ticket owns them.** The first
  screen ticket to need them lands them. This is a gap in the tracker, not a decision.
- **Sign-in itself is not tested, and `11` §8 already said it would not be.** The flow through
  Google's redirect is in the end-to-end-only column and `11` §9 declines to test Better Auth's own
  behaviour. What #5 tests is everything around it. ⚠️ The e2e app boots with a `DATABASE_URL` that
  points at nothing, and that is load-bearing rather than lazy: an **unauthenticated** request
  resolves to no session without touching Postgres, so the suite needs no database. The day a test
  signs in, the failure will be a connection error rather than a silent pass.
- **The schema tier's guards were checked by sabotage, and that is the standard now.** Eight
  deliberate breakages, eight distinct failures — the same method #2 used on the rendering split.
  ⚠️ **A green schema test proves nothing until you have seen it go red for the right reason**, which
  matters more here than anywhere else in the suite: every one of these tests passes trivially
  against a database that enforces nothing.
- ⚠️ **Branches: `develop` is where work happens, from 2026-09-07.** Yuta's decision, and it
  replaces the arrangement that stood until then, where `main` was both the default and the working
  branch. `main` is the integration branch. Neon still gets a branch per environment to match.

## Skipped

Nothing.
