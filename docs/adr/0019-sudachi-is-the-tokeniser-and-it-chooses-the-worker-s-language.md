# Sudachi is the tokeniser, and it chooses the worker's language

**The tokenisation stage uses Sudachi with `SudachiDict-core` in C split mode. The *ingestion*
worker is therefore Python, behind the TypeScript app.** Findings in
[`../phase-4-verification.md`](../phase-4-verification.md) §4.

## Sudachi is the only option that supplies all three required fields

| Field | Why it is needed |
| --- | --- |
| `dictionary_form()` | Half of ADR 0006's *identity key* |
| `reading_form()` | The other half |
| **`normalized_form()`** | Collapses 引っ越し / 引越し / 引越 into one key |

The third has no equivalent in any alternative, and **ADR 0006 already specified the behaviour it
provides** — a collision appends an *occurrence* rather than duplicating a *note*. The tokeniser
does that collapsing for free rather than it being reimplemented downstream.

C split mode also preserves compounds. UniDic splits 図書館 into 図書 + 館, which for a vocabulary
product is the difference between a *note* and a fragment.

Per its authors' own comparison, SudachiDict is the only resource that is both manually checked and
continuously maintained — it shipped `20260723`.

## The obvious choice was a trap

`kuromoji`, the default JavaScript answer, was last published **2018-03-19**, and its dictionary is
`mecab-ipadic-2.7.0`, **unchanged since 2007** — it does not contain 令和. Its maintained forks fix
packaging and browser compatibility only; **none updates the dictionary or the analysis code**. For
a product whose primary metric depends on extraction quality, that is disqualifying.

## Why Python rather than the Node binding

Both routes run the **identical Rust engine**, so extraction quality is the same either way. What
differs is wrapper maturity: `@nikkei/napi-sudachi` has **two GitHub stars and under a year of
history**, and `sudachipy` is the reference implementation with the largest user base.

The deciding argument is not maturity, though — it is §1.2: **"the Japanese-specific parts belong
behind a boundary from day one."** ADR 0003 makes a *subject* a declared schema plus a pipeline, and
ADR 0015 already put *ingestion* in a separate always-on process. **A Python worker makes that
boundary physical rather than conventional** — it cannot be accidentally crossed, because crossing
it requires changing language.

**This was the weakest-held of Phase 4's recommendations and is recorded as such.** The cost is a
permanent two-toolchain tax on a single developer: two dependency flows, two CI paths, two deploy
images. Since both routes share an engine, quality does not favour Python — only the wrapper does.

## Alternatives considered

**All TypeScript via `@nikkei/napi-sudachi`** — one language, one toolchain, identical engine,
prebuilt binaries and no compiler. Rejected on wrapper maturity and on the §1.2 boundary argument,
but it remains defensible and is the fallback if the two-toolchain cost proves worse in practice
than on paper.

**`lindera-nodejs`** — larger community, MIT, prebuilt. Rejected: IPADIC-era lemmas and **no
normalized form**, which is the field ADR 0006 needs most.

## Consequences for deployment

**`SudachiDict-core` is 68 MB** in the worker image (39 MB if `small` proves sufficient). ⚠️ **No
musl/Alpine binaries are published** for either Node route, which constrained that option's base
image; the Python route avoids it.

## Honesty flags carried forward

**No quantitative accuracy benchmark exists** comparing IPAdic, UniDic and SudachiDict. Every
dictionary-quality claim above is qualitative. Every IPADIC-based option also gives **no reading for
out-of-vocabulary words**, which is why Sudachi's `is_oov()` matters and why *provenance* (ADR 0004)
must distinguish a looked-up reading from a generated one.

## Revisit if

The two-toolchain cost bites before the first real *ingestion*, or `@nikkei/napi-sudachi` gains
real adoption — the engine is the same, so switching is a worker rewrite, not a data migration.
