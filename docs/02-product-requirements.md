# Kioku — product requirements

**Date:** 2026-09-06
**Status:** Phase 1 complete. This document specifies v1 from the reader's side.

This is what the system does, from the outside. It contains no technical decisions —
`docs/01-project-brief.md` §4.12 is still shut and opens in Phase 4.

Vocabulary is [`CONTEXT.md`](../CONTEXT.md), which is the authority on every italicised term below.
Decisions are the ADRs, indexed in [`06-decision-log.md`](06-decision-log.md). Where a requirement
here follows from one, it cites it rather than re-arguing it.

---

## 1. Who uses it

**One user type: the reader.** One invited person, and in v1 exactly one exists (ADR 0012).

The reader does three jobs and they are not three roles:

| Job | What it is | Why it isn't a separate user type |
| --- | --- | --- |
| **Ingesting** | Submitting a *source* | Two clicks, then a background job |
| ***Vetting*** | Accepting, editing or rejecting *pending notes* | The same person who will study them. Splitting them is what makes vetting theatre |
| ***Reviewing*** | Answering due *cards* | — |

There is no administrator, no curator, no second reader, and no self-registration. Access is
invite-only and that is the whole of the access-control story (ADR 0012).

**What the reader can do:** everything the system does. There is no action gated behind a permission
in v1, because there is no one to gate it from.

---

## 2. User stories

Twelve stories. Each carries an acceptance criterion that can pass or fail, and a label.

`MUST` — v1 does not ship without it. `SHOULD` — v1 is diminished without it but still proves the
thesis. `LATER` — deliberately after v1.

### S1 — Get in `MUST`

> As the reader, I want to sign in with an invited account, so that the app is mine and nobody else
> is spending my ingestion budget.

**Acceptance:** an uninvited account is refused at every route, including the ingest endpoint. There
is no path to create an account from inside the app. (ADR 0012)

### S2 — Turn a wall of text into notes `MUST`

> As the reader, I want to paste two pages of Japanese and walk away, so that I get *notes* without
> authoring them.

**Acceptance:** submitting a *source* returns control immediately; the *ingestion* runs as a
background job; *notes* appear in the *vetting* queue as they are produced rather than when the whole
*source* finishes. The first *note* is vettable while the rest are still generating. (ADR 0010)

### S3 — Vet a note in one keystroke `MUST`

> As the reader, I want to accept a correct *note* without touching the mouse, so that *vetting*
> eight hundred *notes* is possible at all.

**Acceptance:** accepting an unedited *note* is exactly one keystroke — no confirmation, no focus
change, no pointer. Rejecting is one keystroke. Entering edit mode is one keystroke. **Median
*seconds-per-note* for an unedited accept is under 5 seconds**, measured over a run of at least 20.

This is the story `docs/01-project-brief.md` §5 lives or dies on. If it fails, Kioku moved the work
instead of removing it. (ADR 0004)

### S4 — Only look at what needs looking at `MUST`

> As the reader, I want the screen to show me the *judgement fields* and not make me proofread
> dictionary lookups, so that *vetting* is a decision rather than a transcription check.

**Acceptance:** fields whose *provenance* is a lookup render without competing for attention; fields
the model chose or wrote are foregrounded. A *level* backed by a named *authority* and a *level* that
is a model estimate are visually distinguishable by one bit of difference, with the *authority*
available on inspection. (ADR 0004, ADR 0005)

### S5 — Say no once and mean it `MUST`

> As the reader, I want a *rejected* term to stay rejected, so that *vetting* cost tracks new
> material rather than corpus size.

**Acceptance:** a term *rejected* in one *ingestion* is never presented again by a later one. The
fiftieth *source* asks about fewer *notes* than the fifth, given overlapping material. (ADR 0006,
ADR 0010)

### S6 — Fix a note before accepting it `MUST`

> As the reader, I want to correct a wrong meaning at *vetting*, so that a small error doesn't cost
> the whole *note*.

**Acceptance:** any field is editable before acceptance. An edited *note* is accepted and counts
against *acceptance rate* as an edit, not as an acceptance. Once *accepted*, the *note*'s fields are
frozen — a later *source* implying something different raises a flag rather than rewriting it.
(ADR 0004, ADR 0006)

### S7 — Study a session that ends `MUST`

> As the reader, I want a *session* with a visible end, so that I finish instead of quitting.

**Acceptance:** a *session* is a fixed number of *cards*, default 20 and reader-settable. It is
composed due-first, with new *cards* filling the remainder. It is snapshotted at the start. It ends
with a screen showing the *session*'s numbers, and starting another is one deliberate action, never
automatic. (ADR 0007, ADR 0009)

### S8 — Not lose grades on a train `MUST`

> As the reader, I want the forty *cards* I answered underground to still count, so that
> `docs/01-project-brief.md` §2.2 costs me a connection rather than a *session*.

**Acceptance:** the whole *session* is prefetched at the start. Each *grade* carries the timestamp of
the moment it was given, never the moment it was received. The interface never waits on the flush.
Grades replay in order when the connection returns. A *session* completed with the network off loses
nothing once it comes back. (ADR 0007)

### S9 — Catch a bad card after a month `MUST`

> As the reader, I want a one-action "this is wrong" during *review*, so that a *note* that survived
> *vetting* can still be caught.

**Acceptance:** the action *suspends* the *card* immediately, returns the *note* to the *vetting*
queue flagged, and records the flag against the *note*'s *source* **and** prompt version. The flag is
counted into *false-accept rate*. (ADR 0004)

### S10 — See whether the thesis holds `MUST`

> As the reader, I want the four numbers, so that I learn whether Kioku works rather than whether it
> feels nice.

**Acceptance:** the app reports *acceptance rate*, *time-to-first-review*, *false-accept rate* and
median *seconds-per-note*, plus tokens and cost per *ingestion*. Below 20 vetted *notes* the ratios
are suppressed and only raw counts are shown. The loop is not complete until these are emitted — they
are the output of v1, not reporting added to it. (ADR 0001, ADR 0004, ADR 0010)

### S11 — Find out where a card came from, and get rid of it `SHOULD`

> As the reader, I want to open a *source* and delete everything that came from it, so that one bad
> document is one action rather than forty.

**Acceptance:** every *source* remains readable after *ingestion*. Each *note* links to its
*occurrences* and their positions in the *source*. Deleting a *source* *suspends* its *cards*; it
does not delete review history, and hard deletion is a separate deliberate act that still preserves
history. (ADR 0008, ADR 0011)

### S12 — Get everything out `MUST`

> As the reader, I want *cards* and review history as a file I hold, so that the app dying is an
> inconvenience rather than a loss.

**Acceptance:** a single export produces *notes*, *cards*, *grades* and every *scheduling epoch*
including superseded ones, as plain JSON. **The export is exercised by a test that reads it back and
reconciles counts** — an untested export path is a belief, not an export. (§2.4, ADR 0011)

### Deferred, and named so they aren't reinvented

| | Story | Why it waits |
| --- | --- | --- |
| **L1** `LATER` | Re-run a *source* through a better model and vet the *candidates* against the diff | Real workflow, and ADR 0011 already fixed its rules. Not needed to produce v1's numbers |
| **L2** `LATER` | Saved queries over the *card* pool — *decks* | ADR 0009. v1 has one *subject*, one queue, no grouping |
| **L3** `LATER` | *i+1* sentence mining, incremental reading, further *templates* | ADR 0008 ranked them and none is in v1 |
| **L4** `LATER` | A per-day cap on new *cards*, separate from *session* size | One knob in v1. First thing to add when the pool passes a few hundred *cards* |

---

## 3. Screens

Five, and nothing else.

| Screen | What it does |
| --- | --- |
| **Ingest** | Submit a *source*; watch *notes* stream in |
| **Vet** | The *pending* queue, one *note* at a time, keyboard only |
| **Review** | The *session*, and its end screen. *Session* size is set here |
| **Sources** | What has been ingested. Open one, delete one |
| **Stats** | The four numbers, plus ingestion cost |

Deliberately absent: a home screen, a settings screen, and a *card* browser. The browser is cut
because a browser without a query language is a list, and the query language is L2.

---

## 4. Empty states

Empty states are requirements. Every screen states what is missing and names the one action that
fixes it.

| Screen | With no data |
| --- | --- |
| **Ingest** | The only screen that works with nothing ingested. It is the first screen after sign-in until a *source* exists |
| **Vet** | "Nothing to vet." Points at Ingest |
| **Review** | Distinguishes three cases: nothing ever *accepted* (points at Vet); everything *accepted* but nothing due yet (says when the next *card* is due); *session* just finished (offers one more, does not start it) |
| **Sources** | "Nothing ingested." Points at Ingest |
| **Stats** | Under 20 vetted *notes*, raw counts with the ratios suppressed and a line saying why |

---

## 5. Edge cases

The ugliest case per feature, and its required behaviour.

### Ingestion

| Case | Behaviour |
| --- | --- |
| **Zero new *notes*** — everything already known or *rejected* | A success, not an error, and the expected steady state as the corpus grows. The *source* is saved, *occurrences* are appended, and the screen reports how many candidates were filtered and by which filter |
| **The same *source* submitted twice** | Creates a new *source*. Identical content is detected and the screen offers to open the existing one instead. No LLM spend either way — the cache key covers it |
| **Input over 100,000 characters** | Refused before any spend, with a message to split it. The cap is a judgement about what a human will vet, not a technical limit. L3's incremental reading is what lifts it |
| **Fails part-way through** | Partial results are kept. *Notes* already produced stay *pending*, the *source* is marked incomplete, and resuming re-runs only unprocessed chunks. Discarding a half-finished *ingestion* would throw away money already spent |

### Vetting

| Case | Behaviour |
| --- | --- |
| **Leaving mid-queue** | Nothing is lost. *Vetting* is a queue, not a *session*, and every *note* commits on its keystroke — deliberately the opposite of *review* |
| **A *note* whose term collides with an existing one** | Never reaches *vetting*. Collision appends an *occurrence*; deduplication runs before generation. There is no merge to vet |
| **Two *authorities* disagreeing about a *level*** | Both *level claims* are kept and shown. Precedence decides the display value; the set is never collapsed |

### Review

| Case | Behaviour |
| --- | --- |
| **A *grade* that never reaches the server** | Replays in order when the connection returns. The interface never waits on the flush |
| **The same *card* graded twice** | Both replay; the later timestamp wins. The outbox never merges and never resolves conflicts |
| **A *note* edited while its *card* is in the current *session*** | The snapshot wins and the *session* shows the old text. The next *session* picks up the change |
| **A *memory-bearing field* changed** | The *card* begins a new *scheduling epoch*; the prior one is retained and exportable. A change to any other field leaves history standing |
| **Nothing due and no new *cards*** | The screen says so and offers nothing. There is no ahead-of-schedule study in v1 |

---

## 6. Not in v1

`docs/01-project-brief.md` §6 stands in full: offline mode and sync · native mobile apps · multiple
readers, sharing, or a *deck* marketplace · audio or TTS · image occlusion · handwriting practice ·
a capture extension · Anki import · public publishing · streaks and gamification.

Expanded here, with what each one now means:

- **No second *template*.** v1 ships recognition only — term to reading and meaning. Production and
  kanji-to-reading are additions later, not migrations, and sibling burying arrives with them.
- **No *decks* and no query language.** One *subject*, one queue.
- **No *card* browser.** See §3.
- **No auto-acceptance.** *Vetting* is mandatory for every *note*. A threshold set now would assume
  the *acceptance rate* the project exists to discover.
- **No prerequisite graph.** Cut permanently in favour of *i+1* mining, which solves nearly the same
  problem from data already held.
- **No ahead-of-schedule study or cramming.** That is a saved query, which is L2.
- **No second *subject*.** JLPT vocabulary only. Adding one is a code change plus tests.
- **No self-registration, ever.** Not deferred — rejected.
- **No sharing UI, no permission checks, no second invited reader.** *Personal* entities carry an
  owner from the first row written so that the future is a feature rather than data archaeology, and
  nothing else about multi-user is built.

---

## 7. What this document does not decide

- **The stack.** `docs/01-project-brief.md` §4.12, opened in Phase 4. The stated preference for
  identity — Better Auth with Google OIDC — is recorded in ADR 0012 as unverified and gets checked
  against real documentation before it becomes a decision.
- **The schema.** Doc `04-database-schema.md`, Phase 4. §1's shared/*personal* labelling is a product
  requirement, not a table design.
- **What the screens look like.** Phase 2 explores Vet and Review, where the interaction is the
  product. Ingest, Sources and Stats are generic and are not explored.
