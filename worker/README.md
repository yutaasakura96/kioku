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
| `pipeline/` | One module per stage. Empty until [#8](https://github.com/yutaasakura96/kioku/issues/8) |

The worker loop itself — `LISTEN` then poll, claiming, the stale sweep — arrives
with [#7](https://github.com/yutaasakura96/kioku/issues/7).
