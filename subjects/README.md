# Subject declarations

Language-neutral JSON, read by both toolchains (`03` §6, ADR 0003). It sits at
the root rather than under either side because it belongs to neither.

⚠️ One declaration across two toolchains is the third of `03` §16's three
hardest problems: the drift ADR 0003 was written to design out returns in a form
no compiler catches, and the answer is language-neutral data plus a
cross-language test.

**`jlpt-vocab.json` is the first, and in v1 the only one** — added by
[#3](https://github.com/yutaasakura96/kioku/issues/3). Adding a second is a code
change plus tests, not a row and not a UI flow (ADR 0003).

## What a declaration names

| Key | Owns |
| --- | --- |
| `identity_key` | ADR 0006's tuple — for JLPT vocabulary, dictionary-form term plus reading. `04` §5.3 renders it NFC-normalised and `U+001F`-joined **in the order listed here** |
| `fields` | The *note*'s field list, in the order *Vet* reads them. Each carries `kind` (ADR 0004's honesty bit: `lookup` or `judgement`), `required`, and `memory_bearing` |
| `templates` | The *card templates*. v1 ships **recognition only** — term to reading and meaning (`PRD` §6) — and `card.template_key` is a text key into this list |
| `stages` | The *pipeline stages* an *ingestion* runs, in order (`03` §5.1). ⚠️ **These are also the module names under `worker/pipeline/`** (`03` §10), which is why a stage key has to be a legal Python identifier |

⚠️ **Keys are `snake_case` throughout, including the note field names.** Both
sides read this file, `04`'s columns are `snake_case`, the field names appear
verbatim as keys inside `note.fields`, and a stage key has to be importable from
Python. `camelCase` would have been one toolchain's convention winning a file
that belongs to neither.

⚠️ **A field is named by a flag, never by a second list.** `judgement` fields and
memory-bearing fields are `kind` and `memory_bearing` on the field itself, so
neither can name a field that does not exist. `identity_key` and the templates
*are* lists of names, because they are ordered and a field may appear in
several — and both are checked by `checkDeclaration` for exactly that reason.

## Who reads it

| Side | Module | Tests |
| --- | --- | --- |
| TypeScript | `shared/subject/declaration.ts`, `shared/subject/validate.ts` | `test/unit/subject-declaration.test.ts`, `test/unit/subject-validate.test.ts` |
| Python | `worker/subject.py` | `worker/tests/test_subject.py` |
| Both | `scripts/print-subject-view.ts` prints TypeScript's view for Python to compare | ⚠️ `worker/tests/test_subject_drift.py` — `03` §6's cross-language test |

⚠️ **The declaration is not a database table** (`04` §13). `note.subject_id` and
`card.template_key` are text keys into it, deliberately **not** foreign keys — a
foreign key would put a second copy of the declaration in the database and
re-create the drift ADR 0003 exists to design out.

## Owed, and not by this ticket

**ADR 0005's authority list and its precedence order.** `04` §5.6 makes
`level_claim.authority_key` "a key into the subject declaration's authority
list", and `04` §13 says the list *and its precedence order* are declared per
subject. Neither is here: #3's scope is the field list, the *identity key*, the
*templates* and the stages, and which publications count as *authorities* for
JLPT levels is a data decision ADR 0005 left open rather than something to
invent. It arrives with the ticket that first renders a *level* — the keys are
additive, so nothing here has to move when it does.
