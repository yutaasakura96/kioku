# Worker tier

`11-testing-plan.md` §1: pytest 9.1.1 with `testcontainers` 4.15.0, against **a
real Postgres 18 container** — the pipeline end to end and the three concurrency
behaviours.

⚠️ **Docker is required for sixty of the two hundred and eleven tests here.**
ADR 0038 carried a dated amendment for each time the container count moved —
three, then twenty-three with #7, forty with #8, fifty-nine with #9 — and **#9's
amendment was the last of them on purpose**: it took the number out of that ADR
and left it here, in one file, because #8 had shipped it stale in two of the four
places that repeated it. So a move is recorded **here** now, and this paragraph is
where the dating lives.

⚠️ **Re-counted 2026-09-13 with #15, and both numbers were stale.** It said
fifty-nine of one hundred and ninety-nine; the suite was **two hundred with sixty
needing the container** before #15 touched anything, so the container count had
moved by one and the total by one, and **nothing had recorded either** — which is
this file's own failure mode arriving once more, in the one place that is
supposed to absorb it. #15 added **eleven** tests and **none** of them needs
Docker: they are stage 2 and stage 3, and the point of the seam they sit on is
that neither needs a database. ⚠️ **Both numbers are counted rather than
remembered** — `uv run pytest --collect-only -q` for the total, and the tests
taking the `connection` or `postgres_dsn` fixture for the other. Count them again
rather than adding to them.

⚠️ **This is the one file that carries the number.** #8 shipped it stale in two
of the four files that repeated it, and said so: *"the durable fix is for four of
them to point at `worker/tests/README.md` rather than repeat it."* #9 did that —
`docs/11-testing-plan.md` §7, ADR 0038, `worker/pyproject.toml` and
`worker/tests/conftest.py` now point here, and `conftest.py`'s no-Docker message
names the **files** rather than a count, because the files are what a developer
is looking at when they read it.

ADR 0038 said *three*, naming the three concurrency behaviours. What joined them
is SQL that is not a concurrency behaviour — #7's chunk queue, `04` §6.2's resume
query, the settle and the drain, then #8's corpus lookup, rejected filter,
*occurrence* append and ledger, then #9's generation cache, spend ledger and
*pending note* writes — and testing Python's SQL needs a database, which
in Python means a container. **The sentence that was
being protected is untouched:** a laptop without Docker runs the whole TypeScript
suite and gets the worker's database tests red, visibly and for a stated reason —
`conftest.py` prints it. Do not "simplify" the two harnesses into one
Testcontainers tier; the 946 ms inner loop is the thing being bought.

## ⚠️ The image tag, which is half of a pin

**`postgres:18.3-alpine`** — and as of #7 it lives in `conftest.py`, as
`POSTGRES_IMAGE`, because a tag in prose cannot be asserted. Recorded here
2026-09-09 with #4, before anything used it, because it is the half of PIN 6/6
that lives outside every manifest (`03` §13.5).

`@electric-sql/pglite` is pinned at 0.5.8 **because 0.5.8 is PostgreSQL 18.3** —
measured, since PGlite's own documentation does not state which PostgreSQL it
builds (ADR 0038, verification §14.1). `04` defaults every primary key to
`uuidv7()`, a Postgres 18 built-in, so a database on 17 fails on the first
`CREATE TABLE`. **The two test databases have to agree on the major or the
schema tier and this tier are testing different things.**

⚠️ **No bot watches this line**, and none can: Renovate reads manifests and a
Docker tag in a test fixture is not one — which is precisely `03` §13.5's point:
*nothing will tell you when the two halves diverge except a `uuidv7()` that stops
existing.* The TypeScript half is guarded by an assertion in
`test/schema/schema.test.ts`; **#7 paid this half's guard**, as
`conftest._assert_postgres_18`.

⚠️ **It runs before the migrations, not as a test.** Applying `0000_schema.sql`
to a Postgres 17 fails on the first `CREATE TABLE` with `function uuidv7() does
not exist`, which is true and tells nobody what happened; the fixture says it in
one line instead. It is a precondition of every test in this tier rather than a
behaviour of its own, which is also why it never became a test of its own.

## What is here now

⚠️ **Thirteen of the nineteen files need neither a container nor a database**,
and the table below says which. ⚠️ `seed.py` is not a test file at all — it is
the four rows `S2` names on submit, shared by `test_ingest.py` and
`test_generation.py` so that `04`'s column list has one place to go stale.

`test_subject_drift.py` is `03` §6's cross-language drift test — `11` §7: "the
one test that exists in both suites by design".

⚠️ **The drift test fails rather than skips when Node is missing**, and Node is
not optional in this repository — the app is a Nuxt app — so a machine without it
is broken rather than merely Docker-less, and a cross-language guard that quietly
excuses itself is not a guard.

⚠️ **Corrected 2026-09-11 with #7 — this paragraph said that was "the opposite of
ADR 0038's three container tests", which asserted the container tests skip. They
do not.** ADR 0038 says the three "go red — visibly and for a stated reason,
rather than the whole suite refusing to start", and `11` §7 and #7's own
acceptance criteria both say *red*. So the two halves of this tier behave the
same way and always were meant to: **nothing here skips.** The line was written
from memory of a decision, against a document that says otherwise, and it sat
here for a day looking like a design note.

```bash
cd worker && uv run pytest
```

Not run by Vitest, and the whole file list is now:

| File | Container | Asserts |
| --- | --- | --- |
| `test_subject.py` | no | Python's view of the *subject* declaration, and its half of `03` §6's `validate` seam |
| `test_subject_drift.py` | no | `03` §6's cross-language drift test, by running `scripts/print-subject-view.ts` under Node |
| `test_loop.py` | no | `03` §3.1's seven steps against a fake connection. ⚠️ **The payload is never read** is a `Notify` whose `payload` property raises |
| `test_db.py` | no | The direct string taken verbatim, the pooled one refused by name |
| `test_jobs.py` | **yes** | `04` §6.4 — the claim under two workers, `SKIP LOCKED` skipping rather than waiting, and the stale sweep |
| `test_runs.py` | **yes** | The chunk queue, `04` §6.2's resume query, the settle, and the drain |
| `test_reconnect.py` | **yes** | ADR 0028's ordering, asked of the **server** through `pg_listening_channels()` |
| `test_chunk.py` | no | Reading a *chunk* back out of its *source* by **code point**, and a range past the end refused rather than clamped |
| `test_tokenise.py` | no | C split mode keeping 図書館 whole, one `Dictionary()` per process, the pinned dictionary version, and ⚠️ **the reading of an inflected word's `dictionary_form`, re-tokenised** — with 六時's 時 as the guard that it happens only for a surface that inflected (ADR 0045 § Amended 2026-09-13) |
| `test_extract_candidates.py` | no | ADR 0044's allowlist, the numeral rule, ADR 0045's script rule and ⚠️ **whose reading the key is built from** — あります and ある are one *note* since #15 — and ⚠️ **that every part of speech the installed dictionary declares is classified** |
| `test_deduplicate.py` | no | Repeats folded into one group carrying every sighting; `04` §6.1's first two counters |
| `test_filter_known.py` | no | `04` §6.1's other two, each candidate counted **once** though a rejected word matches both filters |
| `test_pipeline.py` | no | ⚠️ `11` §7's **stage-order test**: no generation is asked for a word already known or rejected. Needs no database, because ADR 0010's ordering is a property of the stages. Also that **every** stage key is a module name, all seven of them since #9 |
| `test_prices.py` | no | `03` §7's price table as configuration with an effective date, and an unpriced model refused rather than costed at zero |
| `test_generate.py` | no | Stage 6's request and its answer — what the model is asked, what the declaration boundary refuses, and what `04` §6.3's cache may serve. ⚠️ **From `fixtures/generation-response.json`; it cannot reach a provider** |
| `test_provider.py` | no | ADR 0018's boundary — the startup refusal without a key, the model id as a variable, streaming with the declaration as the output schema, a refusal or a truncation not parsed as an answer, and ⚠️ **that an SDK exception never reaches the run row**: `03` §11's *the provider is not named at the reader*, which `runs.py` could only promise and this module has to keep |
| `test_ingest.py` | **yes** | The stages against real SQL — the corpus lookup, the owner-scoped rejected filter, *occurrence* idempotence, and the ledger |
| `test_generation.py` | **yes** | Stages 6 and 7 against real SQL — `04` §6.3's four-part key, a cache hit spending nothing, `04` §6.1's spend ledger, and the four writes one *pending note* is. ⚠️ **The provider is a stand-in that answers from the prompt**, so a prompt that failed to list a *candidate* fails the test |
| `test_scratch_cleanup.py` | **yes** | ⚠️ **That the `connection` fixture's own cleanup cannot reach `review_log`.** It could, until #8: `TRUNCATE … CASCADE` walked `ingestion` → `note` → `card` → `review_log`, and `CASCADE` was not optional — without it Postgres refuses the statement outright |
