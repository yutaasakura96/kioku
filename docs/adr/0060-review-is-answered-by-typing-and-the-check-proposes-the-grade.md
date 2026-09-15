# Review is answered by typing, and the check proposes the grade

**Decided 2026-09-15, by Yuta, from the first real run.** The *review* of a *card* is no longer
reveal-then-self-grade. The reader types the reading, then types the meaning. The app checks both and
**proposes** a *grade*, and the reader commits it with the same four keys as before. This replaces the
current interaction; it does not add a second one beside it.

## Why now

Asked what he was aiming for after vetting 39 *notes*, the reader described WaniKani: see the word,
type its reading in hiragana, then type the English, and have the app say whether each was right.
Self-grading asks the reader to judge his own recall honestly, card after card. Typing puts the
judgement in the app and makes recall observable. `docs/first-run-expectation.md` Part 4 records the
exchange.

## What is decided

**1. It is an interaction, not a *template*.** The recognition *template* is unchanged: prompt `term`,
answer `reading`, `meaning` and the rest (`subjects/jlpt-vocab.json`). What changes is how the reader
answers. So there is **no second *template***, no *siblings* and no sibling burying, and PRD §6's "No
second *template*" and ADR 0002 both stand as written.

**2. One *card*, two steps, one *grade*.**

- **Front, reading step:** the *term* and a text field. The field converts romaji to hiragana as the
  reader types. Kana typed through a system IME passes through unchanged. `Enter` submits, and the
  result (right or wrong) shows at once, together with the stored reading.
- **Meaning step:** a second text field for plain English. `Enter` submits, and the result shows at
  once.
- **Back:** everything the recognition *template* already reveals, plus both results, and the four
  grade controls with one of them **proposed**.

**3. The check proposes; the four grades stay (ADR 0016).**

| Result | Proposed *grade* | `Enter` commits |
| --- | --- | --- |
| Either step wrong | `1` Forgot | `1` |
| Both steps right | `3` Good | `3` |

The digits `1`–`4` still commit any *grade* directly. That makes "I was actually right" a keystroke
the reader already knows, with no new key: a typo marked wrong is committed as `3`. Hard and Easy stay
reachable on a right answer as `2` and `4`. ADR 0016 rejected a two-button mapping because it wastes
FSRS's weights, and a proposal the reader can overrule keeps all four grades in use.

**4. Nothing about the *grade* record changes.** It is still one *grade* per *card*, stamped by the
client **at the committing keystroke** (`shared/review/stamp.ts`, `03` §8.2), still an outbox entry
(ADR 0039) and still permanent once committed. The typed text and the check result are **not
recorded**: no column, and no second outbox entry kind. This is a revisit condition, not an
oversight.

**5. Matching.**

- **Reading:** `toHiragana(typed) === toHiragana(stored)`, using the same function on both sides. This
  folds katakana, so コーヒー is answered by typing it in hiragana (ADR 0045 stores an all-katakana
  term's reading in katakana). No other variants are accepted.
- **Meaning, lenient:** split the stored `meaning` on `,`, `;` and `/`. Normalise both sides:
  lowercase, strip punctuation, collapse whitespace, and drop a leading `to `, `a `, `an ` or `the `.
  Any candidate within an edit distance of **0 for up to 3 characters, 1 for 4–7 and 2 for 8 or
  more** counts as right. `meaning` stays one string (no schema change).
- The stored `meaning` is the *accepted*, frozen value (ADR 0052), so an edit made at *vetting*
  defines what counts as correct later. That is intended.

**6. Where it lives.** The checking is pure. `shared/review/answer.ts` holds the reading match, the
meaning match and the proposal, with unit tests in `test/unit/`, which is `11` §8's seam and the same
home as `scheduler.ts` and `stamp.ts`. No matching logic lives in a component (ADR 0045's reason
applies).

**7. Keys and focus.**

- While a text field has focus, the mode container's handler **ignores events whose target is that
  field**. `space`, `x` and the digits are then typing, not commands. The handler stays on the
  container and never moves to `document` (ADR 0025, § Carrying).
- `Enter` is ignored while `event.isComposing`, so a system IME can finish its conversion.
- `Esc` still exits the *mode* from anywhere.
- `X` (flag) is available on the back only.
- `space` no longer reveals, because there is nothing to reveal by hand.
- The focus ring rule gets the same single exception Vet's edit field already has: the text field
  shows focus.

**8. Dependency.** `wanakana` **5.3.1, MIT**, pinned exactly. It is WaniKani's own library: `bind()`
does the as-you-type conversion and `toHiragana()` does the fold (verified against its docs via
context7, 2026-09-15). ⚠️ Its last publish was 2023-11-20. A pin on a quiet library is fine, and it
joins `03` §13.5's list of pins a routine bump must not move.

## Alternatives considered

- **Add typing beside the current screen**, as a second study mode. Rejected by Yuta: two ways to study
  is two screens to specify and test, for a choice he does not want to make.
- **Two *cards* per word** (term→reading, term→meaning). Rejected: it brings a second *template*, sibling
  burying and amendments to ADR 0002 and PRD §6, and shows the same word twice. WaniKani itself treats
  reading and meaning as one item.
- **Automatic grading with no override** (right→Good, wrong→Forgot). Rejected: it is ADR 0016's
  two-button mapping by another name, and a typo in English would be recorded as forgetting.
- **Exact meaning match.** Rejected: the model writes `meaning` as a few words, often comma-separated
  senses. Exact matching would mark correct recall wrong often enough that the override becomes the
  normal path.
- **A hand-written romaji converter.** Rejected: romaji-to-kana has many edge cases (ん before a vowel,
  small っ, long vowels), and the library exists, is tested and comes from the product being imitated.

## What it amends

- `10` §5.1's footer table, with a dated block in place. §5.4 and §5.5 are amended by the ticket that
  builds this, which owns the layout of the two fields.
- `03` §13.5's pin list gains `wanakana` 5.3.1 in the commit that adds the dependency.

## Revisit if

- **The reader overrides a wrong result often.** That is the meaning check being too strict, or
  `meaning` needing a real list of accepted answers (a schema change). It cannot be measured until the
  check result is recorded, and recording it is the first thing to add if the question comes up.
- **Katakana words fail on the reading step** in practice, i.e. the fold is not enough.
- **A second *subject*** (CS terms) arrives without a reading. The interaction then needs a per-*subject*
  declaration of which steps exist, rather than the two steps being assumed.
