# The worker

The Python ingestion tier (ADR 0015, ADR 0019). It carries **its own dependency
manifest and its own lockfile** — the two ecosystems do not share one, and
pretending otherwise is how a two-toolchain repo starts lying about what is
installed (`03` §10).

Empty until [#7](https://github.com/yutaasakura96/kioku/issues/7), which brings
the worker loop, and [#8](https://github.com/yutaasakura96/kioku/issues/8),
which brings `pipeline/`.
