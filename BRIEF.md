# Kioku — project brief

**Status:** draft, pre-Phase-1. Written to be grilled, not to be followed.
**Date:** 2026-09-03
**Owner:** Yuta Asakura (sole user, sole developer)

記憶 (kioku) — *memory, recollection.*

---

## 0. How to read this

This document is a **grilling target**, not a specification. It is deliberately incomplete.

- **§2 is settled.** Those decisions were made deliberately and should not be re-litigated. Challenge
  them only with new information, not with a preference.
- **§4 is open, and it is the point.** Every question there is unresolved and load-bearing. The
  grilling exists to close them, one at a time.
- **§5 is the thesis.** If the grilling breaks §5, the project does not survive in this shape and
  should change shape rather than be built anyway.

Nothing here is a technical design. No schema, no API, no folder structure. Those come after.

---

## 1. The problem

**Spaced repetition works. Building the deck is what stops people using it.**

Anki is the best study tool most people never stick with, and the reason is almost never the
reviewing — it is that the deck is a prerequisite. Every card is typed by hand, field by field. For
JLPT vocabulary that is thousands of entries. For a cloud certification it is every service name,
every limit, every acronym. So you either:

- study **someone else's deck** — wrong scope, wrong level, wrong emphasis, and full of things you
  already know; or
- spend the study hour **authoring instead of studying**.

Meanwhile the raw material already exists, in forms nobody can study from directly: a textbook
chapter, a vocabulary list, a documentation page, an exam objectives PDF, lecture notes, a subtitle
file, a wall of pasted text.

**Kioku takes that raw material, turns it into a reviewed deck automatically, and is also the place
you study it.**

### 1.1 Who it is for

One person. Me. There is no second user in v1 and designing for one is a feature, not a limitation —
it removes sharing, permissions, moderation, deck marketplaces and abuse from the surface entirely.

### 1.2 What I am actually studying

| Now | Soon | Later |
| --- | --- | --- |
| **JLPT vocabulary** (N5 → N1) — the proving ground | CS / web dev terminology | Networking, cloud, certification vocab |

JLPT is first because it is the hardest case: Japanese has no spaces, so extracting words from text
requires real morphological analysis; entries need readings, meanings, part of speech and example
sentences; and level classification is a genuine open problem (§4.4). If the pipeline works for
Japanese, English technical terminology is easy by comparison.

**But this is not a Japanese app.** Every design decision that hard-codes Japanese is a decision
that has to be undone later. The Japanese-specific parts belong behind a boundary from day one.

---

## 2. Settled — do not re-open

These were decided before this document was written. Each has a reason; the reason is what to argue
with, if anything.

### 2.1 Kioku is a study app, not an Anki deck generator

Rejected: outputting `.apkg` files and studying inside Anki. That is a much smaller project — it
inherits Anki's mobile apps, sync, and scheduler for free — and it was seriously considered.

**Why rejected:** the review experience is half of what I want to build, and owning it means the
generated cards and the review loop can be designed together rather than squeezed through Anki's
note-type model. This is partly a "because I want to build it" decision, and that is a legitimate
reason for a personal project. It is recorded honestly rather than dressed up.

**What it costs:** the scheduler, the review UI, the mobile experience, and any hope of syncing with
an existing Anki collection. Accepted.

### 2.2 Online-only in v1

A web app that requires a connection to review. No offline mode, no local-first sync, no service
worker cache.

**Why:** offline means local-first, which means conflict resolution, which is a genuinely hard
architecture that cannot be bolted on later without a rewrite. Building it in v1 would mean the
first thing I build is sync infrastructure rather than the product.

**What it costs, stated plainly so it can be revisited honestly:** no reviewing on a train, on a
plane, or on bad hotel wifi. Anki's biggest practical advantage over every web competitor is that it
works with the network off. **This is the decision most likely to be wrong.** §4.7 asks what the
cheapest partial mitigation is.

### 2.3 FSRS as the scheduler — not a hand-rolled SM-2

The scheduling algorithm is the one part of a spaced-repetition app where a bug is invisible for six
months and then costs you six months. FSRS is the modern open-source scheduler, fitted from real
review data rather than hand-tuned, and it is what Anki itself moved to.

**Verify before building** (do not take this brief's word for it): current FSRS version, licence,
and whether a maintained TypeScript implementation exists or the reference implementation needs
binding. Use context7 or the project's own docs — not memory.

### 2.4 Everything exports, cards and review history both

Plain JSON, and ideally `.apkg` as well — not because I will study in Anki, but because after two
years the accumulated **review history is the one thing in this system that cannot be regenerated**.
Cards can be rebuilt from source material. Scheduling state cannot. If the app dies, the history
must be able to leave.

An export path that is written but never tested is a belief, not an export. It gets tested once,
early.

### 2.5 Feature ideas are taken from the best existing apps, not invented

See §3. The point of the project is the *generation* pipeline; the study loop should be a synthesis
of what already works rather than an attempt to out-design fifteen years of Anki.

---

## 3. Prior art, and what is worth taking from each

| App | The idea | Why it fits |
| --- | --- | --- |
| **SuperMemo** | **Incremental reading** — work through a long document over time, extracting snippets into cards as you go, rather than processing the whole thing at once | This is the exact use case: "dump a huge document". SuperMemo's answer is still the best one anyone has, and almost nobody has copied it. |
| **Anki** | Note/card separation · **filtered decks as saved queries** · sibling burying (never show both directions of one note the same day) · cloze deletion | Filtered decks *are* the "filter" requirement, already proven at scale. |
| **WaniKani** | A **prerequisite graph** — never teach a word before the kanji it contains | Generalises past Japanese: don't serve "Kubernetes ingress" before "reverse proxy". The LLM can propose the edges; a human confirms them. |
| **jpdb / Migaku** | **Known-word tracking** and ***i+1* sentence mining** — only surface sentences where exactly one word is new | Turns a text dump into a difficulty-ordered queue instead of an undifferentiated pile. |
| **Quizlet** | Several study modes over one dataset — recognition, production, matching, typing | Variety for free from data already held; fights the monotony that kills streaks. |
| **Mochi / RemNote** | Markdown-native authoring; cards living inside notes | Fits a paste-and-extract workflow far better than a form-based card editor. |
| **Duolingo** | Session *shape* — small, finishable, with a clear end | A review queue with no visible end is the thing people quit. |

"Fold in all of them" is roughly six products. §4.8 is where that gets cut down.

---

## 4. Open questions — the grilling agenda

Ordered roughly by how much damage getting them wrong would do.

### 4.1 What is the unit — the note or the card?

Anki's central insight is that one **note** (a fact with named fields) generates several **cards** via
templates: JP→EN, EN→JP, kanji→reading, audio→meaning. Getting this wrong is a rewrite, not a
refactor.

- Does one Japanese vocabulary note produce one card or four?
- Who decides — the note type, or the user, per note?
- When the same word appears in a second source document, is that a new note, a duplicate, or a
  merge? (See §4.6.)
- Do the generated cards share scheduling state or schedule independently? Anki schedules them
  independently and then *buries siblings*. Is that right here?

### 4.2 How pluggable is "a subject", really?

The claim in §1.2 is that this works for JLPT vocab and for cloud terminology. That claim is only
true if the differences live in data rather than in code.

- JLPT vocab needs `term, reading, meaning, part_of_speech, level, pitch_accent, example_sentence`.
- Cloud terminology needs `term, definition, category, related_terms, gotcha, code_example`.

So: is a subject a **schema** (JSON Schema / Zod, driving both the LLM's structured output and the
card templates)? Is it editable in the app, or is adding a subject a code change? And what happens
when I want to add a field to a note type that already has 400 notes and six months of history?

**The honest risk:** building a general system for one user with two subjects is over-engineering,
and hard-coding two subjects is under-engineering. Where is the line?

### 4.3 How much do I trust the LLM, and what does review cost?

The whole premise is *avoiding manual work*. But an unreviewed LLM card is a card that might teach
me something false, and studying a wrong definition for three months is strictly worse than having
no deck at all.

- Is human review of every generated card **mandatory**, or only for some?
- If mandatory: how fast can review be? (Keyboard-only accept/edit/reject, one keystroke each, is
  the obvious target — but is 800 cards at 3 seconds each actually acceptable?)
- If not mandatory: what makes a card auto-acceptable? Confidence score? Deterministic source? The
  field it came from — trust a JMdict meaning but review an LLM-generated example sentence?
- Do unreviewed cards get a **provisional** state that is visible while studying?
- What detects a bad card *after* it has been studied for a month? A "this is wrong" button that
  does what?

### 4.4 What does "N3" actually mean in this app?

**JLPT has not published official vocabulary lists since the 2010 revision** — every N-level word
list in circulation is community-estimated. *(Verify this. It is load-bearing: if true, the app's
central classification feature is inherently probabilistic.)*

If true:

- Is a level a **fact**, an **estimate with a named source**, or a **user-editable label**?
- Does the UI ever show "N3" without qualification, and is that honest?
- When two sources disagree, what wins?
- Does the same problem exist for the tech subjects? ("Is this an associate-level or
  professional-level AWS concept?") Probably yes, with no source at all — so the general answer
  matters more than the Japanese one.

### 4.5 Japanese needs a tokenizer, and that constrains the stack

Japanese text has no spaces. Getting from a wall of text to dictionary-form words requires
morphological analysis — MeCab, Sudachi, or kuromoji. This is the single most commonly
underestimated piece of a project like this.

- Does the pipeline run server-side (native binaries fine) or must it be pure JS (kuromoji)?
- Does that choice constrain hosting? (A native dependency and a serverless platform are an awkward
  pairing.)
- Is tokenisation a *pipeline stage* behind an interface, so English subjects skip it and a future
  language swaps it?

### 4.6 What makes two cards the same card?

Ingest fifty pages and 存在する will appear forty times. Ingest two AWS docs and "IAM role" will
appear in both.

- What is a note's identity — normalised term? term + reading? term + sense?
- On collision: skip, merge, or create a variant?
- If merge: what happens to provenance, and to the existing scheduling state?
- Is there a review step for proposed merges, or is it automatic?

### 4.7 Online-only was decided (§2.2) — so what is the cheapest honest mitigation?

Not re-opening the decision. But name the moment it will hurt, and decide now whether anything cheap
prevents it:

- Prefetch the whole review session's queue on load, so a mid-session dropout doesn't lose the
  session?
- Queue grades locally and flush them (the same outbox pattern as `lfca-lab`)?
- Or genuinely nothing, and accept it?

The failure to avoid is *starting* a 40-card review on the train and losing 30 of the grades.

### 4.8 Which of §3's ideas is in v1, and which is the *first* thing built?

"All of them" is not a plan. Rank them, and be honest about which ones are load-bearing versus
which ones are fun:

Incremental reading · prerequisite graph · *i+1* mining · filtered decks · multiple study modes ·
cloze · known-word tracking · session shaping.

**And separately:** what is the smallest complete loop that proves the thesis? A candidate —
*paste two pages of Japanese → get 30 reviewed cards → study them tomorrow and the day after.* If
that loop is not good, none of the rest matters.

### 4.9 What does an ingestion cost, in money and in time?

Every ingestion is LLM calls, and a big document is a lot of them.

- Rough budget per 10,000 words?
- Cache by content hash + prompt version, so re-ingesting the same document is free?
- Batch APIs for bulk classification (materially cheaper, higher latency — fine for ingestion,
  not for review)?
- A local model (Ollama) for the cheap classification passes and a frontier model only for the
  parts that need judgement?
- Does the user ever wait on this synchronously, or is ingestion always a background job with a
  progress view?

### 4.10 What is a deck?

- A **saved query** over one card pool (`level:N3 AND tag:business AND lapses>2`), or an owned
  collection a card belongs to?
- Can one card be in several decks? What does that mean for scheduling — one schedule per card, or
  per card-per-deck?
- Anki's answer is: one collection, decks own cards, filtered decks are temporary queries. Is that
  right here, or is query-first better given that this app's whole premise is bulk generation?

### 4.11 Provenance and re-generation

Every card should record where it came from: source document, position within it, the model, the
prompt version, the date.

- Is that for debugging, or is it a feature? (It enables: "delete everything that came from that bad
  PDF", and "re-run this source through a better model and show me the diff".)
- Is re-generation a real workflow or a nice idea? If real, what happens to review history on a card
  whose text changed?

### 4.12 Stack

Not settled, and worth grilling rather than defaulting to what the last project used.

- The review loop is hundreds of keystrokes per session and every one must feel instant. Does that
  argue for a client-heavy review screen with a prefetched queue, whatever the surrounding framework?
- Where does the ingestion pipeline run — same app, background worker, or separate process? It is
  long-running, expensive, and bursty; the review loop is neither.
- Database choice follows from §4.10 and §4.2 more than from preference.

---

## 5. The thesis, and the riskiest assumption

**The thesis:** generated-then-reviewed cards are good enough to study from, and producing them is
enough faster than hand-authoring to be worth building a whole app for.

**The riskiest assumption is the second half.** If reviewing 800 generated cards takes as long as
writing 300 by hand, Kioku has moved the work rather than removed it, and the project has no reason
to exist. Every decision in §4.3 either protects that assumption or quietly destroys it.

**It should be measured, not assumed.** The obvious instrument is a single number tracked from the
first ingestion onward:

> **acceptance rate** — cards accepted with no edit ÷ cards generated

If that number is low, the pipeline is failing regardless of how good the app feels. If it is high
but the cards turn out to be wrong, the review step is theatre. Both failures are detectable, and
both are invisible without the number.

A second one worth having: **time-to-first-review** — minutes from pasting a document to answering
the first card from it. If that is more than about ten minutes, it is not a replacement for
hand-authoring, it is a different chore.

---

## 6. Explicitly not in v1

Named so they can be pointed at rather than re-argued:

Offline mode and sync · native mobile apps · multiple users, sharing, or a deck marketplace ·
audio generation or TTS · image occlusion · handwriting or stroke-order practice · a browser
extension for capture · importing existing Anki collections · public deck publishing · streaks,
gamification, and social features.

Some of these are good ideas. None of them is the thing that makes this project worth building.

---

## 7. Names and identity

**Repo and working name: `kioku`** (記憶 — memory).

Checked 2026-09-03: npm `kioku` is taken by a small memoisation library; GitHub has `kiokudb` (an
old Perl project) and a small `kioku-project/kioku`; `kioku.com`, `.app` and `.dev` are all
registered. Nothing dominant owns the name. `kioku.study` appeared unregistered.

Rejected after checking: **engram** (`deepseek-ai/Engram` and `Gentleman-Programming/engram` have
both made it an AI term recently), **cortex** (badly crowded in developer tooling — Cortex XDR,
cortexproject, cortexlabs, cortex.io), **recall** (generic, plus Windows Recall and several ML
projects).

Publishing to npm is not planned, so the package-name collision is close to irrelevant; the domain
is the only thing that would need a decision, and only if this ever gets a public URL.
