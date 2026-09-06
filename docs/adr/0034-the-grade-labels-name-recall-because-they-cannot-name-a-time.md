# The grade labels name recall, because they cannot name a time

**The four grade controls read `1 Forgot · 2 Hard · 3 Good · 4 Easy`. `Again` does not survive.**
The digits, the count and the FSRS `Rating` mapping are untouched — this decides four words and
nothing else.

`05-design-system.md` §8 held the labels out of the system deliberately, as "a placeholder pending
the scheduler", and named this document as their owner. The scheduler is now chosen and configured,
which is what makes the placeholder answerable.

## `Again` is a promise this configuration cannot keep

In Anki, `Again` means the *card* comes back in about ten minutes. That is what the word is for: it
is not a judgement, it is an instruction about the rest of the session.

ADR 0016 turned same-day relearning off. Verified 2026-09-07 against `ts-fsrs` at the pinned version
(verification §13.1): with `enable_short_term: false` the library selects `LongTermScheduler`, every
grade including 1 is scheduled with `date_scheduler(..., isDay = true)`, and `next_interval` clamps
at `Math.max(1, …)` before fuzz. **The soonest a graded *card* returns is tomorrow.**

So the label would be borrowed from an application whose behaviour we deliberately do not have. It
reads fine, it is the word every spaced-repetition reader already knows, and it teaches the reader
something false about their own scheduler on the first press. ADR 0016 recorded dropping same-day
relearning as **a real cost, not a simplification**; naming grade 1 after the feature we dropped is
how a recorded cost turns into a forgotten one.

## The four words describe recall, and the library's own split is one failure and three successes

Anki's set mixes two axes: `Again` is scheduling, `Hard / Good / Easy` are judgements of how recall
went. Once grade 1 stops being a scheduling instruction, the set can be one axis throughout — and
the reader is only ever being asked one question, which is how the recall went.

`LongTermScheduler` splits the four the same way. `next_again.lapses += 1` fires for grade 1 and for
nothing else; all four then take `state = State.Review`. **One lapse, three intervals.**

`Forgot` is the word for a lapse. It states what happened rather than what happens next, it is past
tense like the act it describes, and it makes no claim about when the *card* returns — which is
correct, because the reader is not being asked to schedule anything.

`Hard`, `Good` and `Easy` are kept unchanged. They were already judgements of recall, they carry no
timing claim, and replacing words that are right costs the reader the one piece of vocabulary they
bring with them.

## Alternatives considered

**`Again / Hard / Good / Easy`, as drawn** — rejected above. It is the familiar set, and the
familiarity is the problem: a reader who knows Anki will read a ten-minute promise into it and be
wrong every time.

**Show the four intervals instead of words** — `Tomorrow · 3d · 8d · 21d`, which is what modern Anki
puts above its buttons. Genuinely tempting, and rejected on three counts. It asks the wrong question:
the reader is being asked how recall went, and four dates invite them to pick a date. It is not
stable — ADR 0016 keeps `enable_fuzz` at its default `true`, so the same *card* answered the same way
shows different numbers on different presses. And it costs four `repeat()` previews per *card* on the
one screen in the application with a latency criterion (`03` §8).

**`Missed`** for grade 1 — rejected. It reads as *skipped*, which is what `X` does.

**`No` for grade 1**, with the other three unchanged — rejected. It makes the row read as a yes/no
answer with two modifiers stapled on, and it re-introduces a second axis by a different route.

**Leaving the labels as a placeholder for another document** — rejected. `05` §8 deferred them
because the scheduler was unchosen; it is chosen, so there is nothing left to wait for, and a
placeholder that outlives its reason is just an undecided screen.

## What it costs

**One word of familiarity, and every future comparison against Anki now needs a sentence.** Anyone
reading a screenshot beside Anki's will see a set that is nearly the same and assume the difference
is cosmetic. It is not: it is the visible end of ADR 0016.

The label is also two characters longer than `Again`, which matters in exactly one place — the phone
layout's grade controls, at roughly 74px each (`10` §10.4). `Forgot` fits at 14px; a longer word for
the same idea would not have.

## Revisit if

ADR 0016's revisit condition fires and the answer-bounded session brings same-day repetition back —
at which point grade 1 *would* return a *card* within the session, `Forgot` would stop being the
whole truth, and `Again` becomes correct for the first time.
