# The check is the grade

**Decided 2026-09-21, by Yuta, from the first *session* of the reader's run.** A *review*'s *grade* is
the result of the check and nothing else: both steps right is `3` Good, either step wrong is `1`
Forgot. The reader can no longer choose a *grade*. What replaces the override is evidence: a meaning
the check refused can be added as the reader's own **synonym**, and the check runs again. Around that,
three changes to the check itself: a word written only in kana has no reading step, a *note* carries a
**list of accepted meanings** rather than one gloss, and a kanji's reading typed for a word's reading
is a **retry**, not a miss.

This amends [ADR 0060](0060-review-is-answered-by-typing-and-the-check-proposes-the-grade.md) §3 and
§5, and it overrides the part of [ADR 0016](0016-four-grades-and-no-same-day-relearning.md) that
required all four *grades* to be emitted.

## Why now

The reader studied the minted *cards* on 2026-09-21 and reported four things, each seen on a real
*card*:

1. **こんな asked for its reading.** A word written in kana is its own reading, so the step tests
   nothing but typing.
2. **夢, typed む, was marked wrong.** む is a real reading of the kanji 夢; ゆめ is the reading of the
   word. The reader knew the word, and nothing on the screen said which reading was wanted.
3. **Forgot / Hard / Good / Easy is subjective.** A proposal the reader can overrule puts the
   judgement back with the reader, which is what ADR 0060 set out to remove. A reader can misjudge,
   or be generous, and nothing records it.
4. **見る, typed "look", was marked wrong.** The stored meaning was *to see/have (a dream)*. The check
   splits on `,`, `;` and `/`, so it accepts "see" and "have a dream" and nothing else. "Look" is a
   correct meaning of 見る. The reader should not have to remember the one phrase the model happened
   to write.

(4) is ADR 0060's first revisit condition arriving — *the meaning check being too strict, or `meaning`
needing a real list of accepted answers*. (3) is new information: ADR 0060 kept the override for
typos, and the reader's first real use says the override costs more than the typos do.

## What is decided

**1. The *grade* is the check.** `proposedGrade()` in `shared/review/answer.ts` stops being a
proposal. On the back, `Enter` commits it and the digit keys `1`–`4` commit nothing. The four *grade*
controls go; the back shows the result. `X` (flag) stays, on the back only. Everything ADR 0060 §4
fixed about the record stands: one *grade* per *card*, stamped at the committing keystroke, one outbox
entry, permanent once committed.

**2. A refused meaning can become a synonym, and the check runs again.** On the back, after a meaning
step that was marked wrong, the reader can add what was typed as **a synonym of their own** for that *note*. The
meaning step is re-checked against the list with the synonym in it, and the *grade* follows from the
new result before it is committed. This is WaniKani's user synonyms, applied one step earlier: the
correction is permanent and visible, so "I was right" costs a synonym the reader will see again,
rather than a keystroke nobody reviews.

- A synonym belongs to **the reader and the *note***, never to the *note* alone, and it never touches
  `note.fields`. [ADR 0052](0052-an-accepted-note-is-frozen-against-every-writer-and-any-readers-acceptance-freezes-it.md)'s
  freeze is unchanged.
- There is **no synonym for a reading.** A reading is one exact string (ADR 0060 §5), and a wrong one
  is wrong.
- The key, the screen and the storage are the ticket's. It is server-side state, not `localStorage`:
  it outlives the device.

**3. A *note* carries a list of accepted meanings.** `generate` writes, beside the displayed
`meaning`, a short list of English meanings any of which counts as right (for 見る: *see, look,
watch, view*). The check matches the typed answer against that list, plus the reader's synonyms,
with ADR 0060 §5's normalising and edit-distance rules unchanged. The displayed `meaning` stays as it
is. *Notes* that have no list — the 474 cached *pending notes* and the *cards* already minted — are
**backfilled** by a model pass, because ADR 0063 made the cache the source of future *cards*. The list
is check data, not the *note*'s content, so it lives outside `note.fields` and the freeze does not
cover it. The column or table is the ticket's.

**4. A term written only in kana skips the reading step.** If `term` is all hiragana or katakana,
the *card* asks for the meaning only, and the *grade* is the meaning step's result. WaniKani does the
same for its kana-only vocabulary, which tests only the meaning. The test is wanakana's `isKana`
(already pinned, ADR 0060 §8) on the stored term.

**5. A kanji's reading typed for a word's reading is a retry, not a miss.** If the typed reading is
not the word's reading but is a reading of the kanji in the term, the field says so — *the word's
reading, not the kanji's* — and the reader types again. Nothing is recorded, and the step's result is
whatever the retry produces. This is WaniKani's warning for exactly the 水 / すい case. It needs data
Kioku does not have: every kanji's readings. The candidate is KANJIDIC2. Its licence, its format and
how far the rule reaches (single-kanji terms, or compounds too) are a research ticket, and **the
build waits on that research and on Yuta's call on the licence.** Until then the card shows which
reading it wants — the word's — and a kanji reading is marked wrong as it is now.

## Why two *grades* are acceptable now, when ADR 0016 said they were not

ADR 0016's argument was that the *grade* is arithmetic inside the stability formula, so emitting only
`Again` and `Good` leaves `w₃`, `w₄` and the Hard penalty **untrained**. That is true, and it is the
cost this ADR accepts. Three things make it smaller than it was:

- **Nothing trains the weights today.** Kioku runs FSRS with the library's default parameters and has
  no optimiser. The weights ADR 0016 wanted trained stay at their defaults either way; what this
  loses is the *option* of training them from `review_log` later.
- **FSRS's own guidance names the one habit it cannot absorb**, and it is not using two buttons. The
  FSRS tutorial: *"FSRS can adapt to almost any habit, except for one habit: pressing 'Hard' instead
  of 'Again' when you forget."* (verified 2026-09-21, `open-spaced-repetition/fsrs4anki`
  `docs/tutorial.md`). A self-graded Hard on a real miss is the failure it warns about; a grade taken
  from a check cannot produce it.
- **A *grade* nobody judged is worth more to the history than four the reader chose.** ADR 0016
  valued `review_log` as the one irreplaceable asset. A log of check results means the same thing on
  every row.

## Alternatives considered

- **Keep ADR 0060's override, fix the meaning check only.** Rejected by Yuta: the override is the
  subjectivity Yuta objected to, whatever the check's accuracy.
- **Keep Hard and Easy, derived from answer time.** Rejected for now: it brings back a threshold
  someone has to choose, and ADR 0060 §4 records no timing. It is the first thing to try if the
  default weights turn out to schedule badly.
- **Meanings from JMdict instead of the model.** JMdict glosses are the richest source of accepted
  meanings, but it is a second dataset with its own licence and matching work, for a problem the model
  already solves at the moment it writes the gloss. The model list plus synonyms covers the reported
  failure. JMdict is the fallback if the flag rate shows the model's lists are thin.
- **An undo after a wrong result** (what some WaniKani userscripts add). Rejected: it is the override with an
  extra step, and it records nothing about why.
- **Accept any reading of the kanji as right.** Rejected: 水 is みず, not すい. The reader asked to be
  told which reading is wanted, not to have both pass.

## What it amends

- ADR 0060 §3 (the proposal and the override) and §5 (matching against one `meaning` string), with a
  dated pointer in place. ADR 0060 §4, §6, §7 and §8 stand.
- ADR 0016 § Why all four, with a dated pointer in place. Its no-same-day-relearning half stands.
- `10` §5.1's back-of-card footer and §5.4–§5.5 are amended by the ticket that removes the controls,
  as ADR 0060 left them to its own ticket.
- `04`, for the accepted-meaning list and the synonym storage, by the ticket that adds them.

## Revisit if

- **Retention with default weights looks wrong** — lapsed *cards* not recovering, or intervals the
  reader finds far too short or long. The time-derived Hard/Easy above is the first thing to try,
  then an optimiser over `review_log`.
- **The reader adds synonyms often.** That is the model's lists being thin, and JMdict is the next
  step. It is measurable once synonyms are rows.
- **A second *subject*** arrives: ADR 0060's per-*subject* steps question, now with a kana-only rule
  that is Japanese-specific.

## Tickets

[#27](https://github.com/yutaasakura96/kioku/issues/27) builds §4,
[#28](https://github.com/yutaasakura96/kioku/issues/28) builds §1–§3, and
[#29](https://github.com/yutaasakura96/kioku/issues/29) is §5's research
([`kanjidic-research.md`](../kanjidic-research.md)), and
[#30](https://github.com/yutaasakura96/kioku/issues/30) builds §5.

## Settled by the build — 2026-09-21

What the tickets were left to decide, as #27 and #28 decided it. None of it moves a sentence above.

- **Storage (§2, §3).** `note_meaning` (one row per *note*, `text[]`, attributed like a claim) and
  `meaning_synonym` (`owner_id`, `note_id`, `text`, unique on all three), migration `0006`, `04`
  §5.8 and §7.9. Neither touches `note.fields`.
- **The key (§2) is `S`**, on the back only, offered only after a refused meaning with something
  typed that does not normalise to nothing. It sits beside the commit control as a control of its
  own, because a phone has no key.
- **The synonym is an outbox entry** (ADR 0039), a third kind, ahead of the *grade* it changed. Its
  replay is deduplicated by the unique key, unlike a flag's.
- **The gloss is always accepted, list or no list.** §3 said the check matches *the list plus the
  reader's synonyms*; the build also keeps splitting `meaning`, because a *Vet* fix can change the
  gloss after the list was written and a *card* that refused the gloss it shows would contradict
  itself. It only ever accepts more.
- **The backfill is `worker/backfill.py`**, with a free `--estimate` (Anthropic's token counting)
  and a `--run` that pages by *notes* without a row, so it resumes by construction. Its rows carry
  `prompt_version = 'backfill-v1'`.

## Settled by the build of §5 — 2026-09-21

What #29's research left to Yuta, as he called it (research §7), and what #30 built. ⚠️ **§5's
last two sentences are history**: the build no longer waits, and a kanji reading is no longer
marked wrong on the first try.

- **The data is a derived table, committed.** `server/data/kanjidic/readings.json`, from KANJIDIC2's
  `ja_on` and `ja_kun` only, with `NOTICE.md` beside it: CC BY-SA 4.0 for that file alone, and
  EDRDG's licence §4 makes a monthly refresh (`node scripts/kanjidic.ts`) an obligation, logged in
  `docs/00-status.md`. The acknowledgement is that notice and one line in the *shell* (`10` §3).
- **The reach is every term with a kanji, compounds included.** Yuta went past the research's
  single-kanji recommendation with its costs in view (research §4.5): a real alternative reading
  that is also a combination (今日, こんにち) is told it is the kanji's, a combination miss
  (大人, だいにん) becomes a retry, and a jukujikun can only produce false retries. Unit tests pin
  each. A term with kana takes kun **stems** only, so 見る's みえる is not a retry.
- **The server computes each position's list** (`kanjiReadings`, `shared/review/kanji.ts`) at
  composition and snapshots it with the fields; the table never reaches the client. A term with a
  character the table lacks, or more than 1,024 candidates, has none.
- **One retry per step**, then the check stands — or a reader could walk the kanji's readings until
  one passed, which is the *accept any reading* alternative above. **The line names no reading.**

