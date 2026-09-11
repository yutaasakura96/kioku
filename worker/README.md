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
| `pipeline/` | One module per stage. Empty until [#8](https://github.com/yutaasakura96/kioku/issues/8) |

```bash
cd worker && uv run python .
```

⚠️ **It needs `KIOKU_WORKER_DATABASE_URL`** — Neon's **direct** string, the one
*without* `-pooler` in the hostname. On the pooled endpoint PgBouncer's
transaction mode does not support `LISTEN` at all, so a worker pointed there
would start, claim nothing and **never wake** (`03` §4.1); `db.refuse_pooled`
turns that into a startup error rather than an afternoon. `Ctrl-C` stops it —
the block timeout in `loop.py` is what makes that land within a few seconds.

⚠️ **There is no pipeline yet.** #7 is the loop, the claim and the sweep. A
claimed job today has its `ingestion_chunk` queue opened and the run settles
**`incomplete`** — `04` §6.1's resumable state, and the true one: nothing
completed and every chunk is still there. Stages 1–5 arrive with
[#8](https://github.com/yutaasakura96/kioku/issues/8) as `run_ingestion`'s
`process_chunk` argument, which is the only seam they need.

⚠️ **The worker has no inbound surface at all** — no socket, no route, no API
key of its own to verify (`03` §1). That is ADR 0015's second and now
load-bearing argument: with no HTTP job endpoint, `S1`'s *refused at every
route* is literally true. The whole attack surface is the Nuxt app and the whole
**spend** surface is this laptop.
