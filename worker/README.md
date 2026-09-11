# The worker

The Python ingestion tier (ADR 0015, ADR 0019). It carries **its own dependency
manifest and its own lockfile** — the two ecosystems do not share one, and
pretending otherwise is how a two-toolchain repo starts lying about what is
installed (`03` §10).

## The toolchain

**uv, `pyproject.toml` and `uv.lock`, on Python 3.11.** Added by
[#3](https://github.com/yutaasakura96/kioku/issues/3) rather than
[#7](https://github.com/yutaasakura96/kioku/issues/7), because #3's Python half
needs a test runner and `11` §1 had already named it — pytest 9.1.1.

```bash
cd worker && uv sync      # once, and after any dependency change
cd worker && uv run pytest
```

⚠️ **The Python version is pinned by `.python-version`, not by
`.tool-versions`.** One pin, in the file uv actually reads. `3.11` is the line
verification §7.3 measured SudachiPy's 9 ms dictionary load and 93–136 MB
steady-state RSS on, so the tier runs on the interpreter those numbers came
from.

⚠️ **This project is deliberately not a package** (`[tool.uv] package = false`).
`03` §10 puts one flat module per stage under `pipeline/`, **named by the subject
declaration**, and a `src/` layout would put a directory between that list and
the declaration it mirrors.

⚠️ **Renovate reads `pyproject.toml` where it sits** — its `pep621` manager
matches `/(^|/)pyproject\.toml$/` by default, extracts `[dependency-groups]`
(PEP 735), and maintains `uv.lock`. No change to `renovate.json` was needed, and
`03` §13.5's rule — *a bot arrives with the first manifest, not afterwards* — is
satisfied rather than deferred. Verified 2026-09-10 against Renovate's own
manager documentation.

## What is here

| Module | Owns |
| --- | --- |
| `subject.py` | Python's view of the *subject* declaration, and its half of `03` §6's `validate` seam. ⚠️ **Nothing in it restates the declaration** — the field list and the seven stages live in `subjects/jlpt-vocab.json` and nowhere else |
| `db.py` | The one connection. The **direct** string, `autocommit=True`, and a refusal for the pooled one |
| `loop.py` | `03` §3.1's seven steps: `LISTEN`, then poll, then block. And the backoff |
| `jobs.py` | `04` §6.4 — the claim, the heartbeat, the stale sweep |
| `runs.py` | The chunk queue, `04` §6.2's resume query, and what a claimed job turns into |
| `__main__.py` | The process: signals, JSON logging, and wiring the four together |
| `pipeline/` | One module per stage, **named by the declaration** — all seven since #9. ⚠️ **Stages 2 to 5 are the pure ones** (`11` §8): no database, no clock, and the corpus arrives as two plain collections. `generate.py` builds a request and validates an answer, and `write_pending.py` **writes** — `03` §5.1 always said so |
| `provider.py` | ADR 0018's boundary, and **the only module here that imports an SDK**. Streaming, never batch; the model id is an environment variable because the walk is the point |
| `prices.py` | `03` §7's price table as **configuration with an effective date**, and the arithmetic `S10` reports. A price change is a new entry, never an edit |
| `ingest.py` | The stages wired to the database — the corpus lookup, the rejected filter, the *occurrence* append, `04` §6.3's cache and `04` §6.1's two ledgers. This is `run_ingestion`'s `process_chunk` |

```bash
cd worker && uv run python .
```

⚠️ **It needs `ANTHROPIC_API_KEY` too, and refuses to start without it** (`03`
§13.1). Until #9 a worker with no generator did every stage that shrinks the work
and spent nothing, which was the true state of the project; after #9 such a run
would read its whole *source*, settle `complete` and report a *source* that made
no *notes* — which `03` §11 renders to the reader as a **success**. Two optional
variables ride beside it: `KIOKU_MODEL_ID`, because ADR 0018 walks the model, and
`KIOKU_WORKER_ENVIRONMENT` (`laptop` or `server`), because `03` §12 says early
*time-to-first-review* figures are not comparable across ADR 0022's move and
records that on the number rather than in a paragraph.

⚠️ **It needs `KIOKU_WORKER_DATABASE_URL`** — Neon's **direct** string, the one
*without* `-pooler` in the hostname. On the pooled endpoint PgBouncer's
transaction mode does not support `LISTEN` at all, so a worker pointed there
would start, claim nothing and **never wake** (`03` §4.1); `db.refuse_pooled`
turns that into a startup error rather than an afternoon. `Ctrl-C` stops it —
the block timeout in `loop.py` is what makes that land within a few seconds.

⚠️ **All seven stages are wired in as of
[#9](https://github.com/yutaasakura96/kioku/issues/9).** A claimed job reads its
*source*, tokenises every *chunk*, extracts *candidates*, deduplicates against
the corpus, appends *occurrences* for what the corpus already had, filters what
the reader has rejected, **asks a model about what is left, writes the *pending
notes* that come back, and records what they cost**. ADR 0010's ordering is still
what the order of those clauses is: every stage that shrinks the work runs before
the one that spends.

⚠️ **Generation is one request per *chunk***, not one per word
([ADR 0047](../docs/adr/0047-generation-is-one-request-per-chunk-and-notes-are-written-as-each-chunk-returns.md)),
and that chunk's *notes* are written the moment it returns. The streamed write is
`S2`'s time-to-first-review **and** what keeps a long *source* from being
generated twice: chunk 1's *note* exists by the time chunk 3 is deduplicated, so
chunk 3's sighting of the same word is an `already_known`.

⚠️ **The dictionary is constructed exactly once per process** (`03` §3.4), lazily,
on the first *chunk*. A second `Dictionary()` costs the same load **and its own
memory mapping** — 76 MB to 148 MB to 220 MB — and the mistake looks like ordinary
per-job setup. Nothing outside `pipeline/tokenise.py` may call it.

⚠️ **`SudachiDict-core` is pinned at `20260723` and moving it is a data event.**
It can change the identity of *notes* that already exist (`03` §5.3), and two
decisions rest on this release's part-of-speech taxonomy: ADR 0044's candidate
allowlist is enumerated from it and ADR 0045's script rule is measured against
it. It is PIN 2/6 in `renovate.json`, disabled there rather than bounded.

⚠️ **The worker has no inbound surface at all** — no socket, no route, no API
key of its own to verify (`03` §1). That is ADR 0015's second and now
load-bearing argument: with no HTTP job endpoint, `S1`'s *refused at every
route* is literally true. The whole attack surface is the Nuxt app and the whole
**spend** surface is this laptop.
