# Kioku — screen specifications

**Date:** 2026-09-07
**Status:** Phase 4. Every screen drawn as components, each value traced to a token in
[`05-design-system.md`](05-design-system.md). Five things are decided here; three of them are ADRs
[0034](adr/0034-the-grade-labels-name-recall-because-they-cannot-name-a-time.md),
[0035](adr/0035-five-interaction-states-is-not-a-set-and-three-screens-have-three.md) and
[0036](adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md).

Vocabulary is [`../CONTEXT.md`](../CONTEXT.md). The system is
[`05-design-system.md`](05-design-system.md), cited `05` by section — **where it disagrees with the
canvas, it wins** (`05` §9), and its §8 and §10 are the list of what it deliberately did not extract,
which is most of what this document owes. What happens and in what order is
[`09-user-flows.md`](09-user-flows.md); **every screen drawn here is one `09` already walked.**
Requirements are [`02-product-requirements.md`](02-product-requirements.md), cited `S1`–`S12`.
Verified facts are [`phase-4-verification.md`](phase-4-verification.md) — **§1–12 are checked and
must not be re-run.** §13 was added while writing this document.

The canvas is https://claude.ai/code/artifact/7a631237-82be-48a3-b65e-9b4ef46b8157, linked from `05`
line 3, and it is still the only copy of the six artboards. **It drew *Vet* and *Review* only.**
Ingest, Sources and Stats were never drawn and `05`'s scope line says so, which is why §§6–8 below
are longer than §§4–5.

**There is still no code.**

---

## 0. What this document decides, and what it does not

**Decides — five things:**

1. **The grade labels** —
   [ADR 0034](adr/0034-the-grade-labels-name-recall-because-they-cannot-name-a-time.md).
   `1 Forgot · 2 Hard · 3 Good · 4 Easy`. ADR 0016 turned same-day relearning off, so "Again" names
   a return the scheduler cannot make (verification §13.1).
2. **Which of the five interaction states exist on a screen with no client** —
   [ADR 0035](adr/0035-five-interaction-states-is-not-a-set-and-three-screens-have-three.md). Three
   of the five screens have three states, not five. Nothing is disabled anywhere in v1.
3. **The Done control's geometry on both modes, and the confirmation on *Vet*.** §4.3, §5.2, §4.6.
   ADR 0026 named the collision with the *progress rail* and did not resolve it.
4. **Grade by swipe** —
   [ADR 0036](adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md).
   Refused. ADR 0026 deferred it here by name; verification §13.2 is why the version worth having was
   never available.
5. **The start block, and the three screens the canvas never drew.** §3.2, §6, §7, §8.

**Two smaller things it also closes**, both of which an existing document asked it to:

- **`05` §5's three ambiguous spacing values** — `10`, `14` and `30`. §2.3.
- ⚠️ **ADR 0025's exception list grows**, under that ADR's own revisit condition. §4.2.

**Cites, and does not reopen:** the ink ramp (ADR 0024); the focus token (ADR 0025); the key map
(ADR 0023); the grade count and `enable_short_term` (ADR 0016); the *place* / *mode* split
(ADR 0013); the rendering rules (`03` §2.1); the start block's existence and the `from` parameter
(ADR 0032); what Done costs on each mode (ADR 0033); every route and flow (`09`).

**Does not decide:** anything about data, scheduling or deployment. Where a screen shows a number,
this document says which column it comes from and stops.

---

## 1. Every screen, and what it is made of

Seven documents render. Five are the app (PRD §3); two are the boundary before it (`08` §2).

| Screen | Route | Is | New components it needs |
| --- | --- | --- | --- |
| **Ingest** | `/` | *place* | Text field, run row, filter tally |
| **Sources** | `/sources` | *place* | List row |
| One *source* | `/sources/:id` | *place* | Source header, prose block, occurrence row |
| Delete confirmation | `/sources/:id/delete` | *place* | — reuses the empty-state block |
| **Stats** | `/stats` | *place* | Figure grid (the *session tally*, parameterised), ledger row |
| ***Vet*** | `/vet` | *mode* | Done cluster, run-end confirmation, edit field |
| ***Review*** | `/review` | *mode* | Done cluster, *session*-size knob, unsent-grades notice |
| The door | `/auth` | neither | — reuses the empty-state block |
| The refusal | `/auth/refused` | neither | — reuses the empty-state block, minus its rule |

Everything else on every screen is a component `05` §7 already gives geometry for. **Nine new
components, and four screens that need none.**

---

## 2. The values this document adds to the system

### 2.1 No new colour tokens

Every value below is `05` §§1–3. The hover and active states borrow two existing tokens rather than
adding any (ADR 0035), the focus ring is ADR 0025's single token, and the *progress rail*'s fourth
mark is a change of height rather than of fill (§5.3).

**One token is used in a place `05` does not currently list**, and it is listed here so the next
edit of `05` picks it up:

| Token | New use |
| --- | --- |
| `--k-key-face` | The hover face of any resting control on `--k-raised` (ADR 0035) |
| `--k-ink-ground` | The active (pressed) face of the same (ADR 0035) |

### 2.2 One new measure, and why it is not a sixth

`05` §5 gives five measures — 940, 760, 620, 560 and the 1440 frame. **No screen here introduces a
sixth.** The three undrawn *places* take existing ones, and each choice is argued at the screen:

| Measure | `05`'s meaning | Added use |
| --- | --- | --- |
| `940px` | to read and judge | The *Sources* list; `/stats`'s figure grid and ledger |
| `760px` | to recall — one object of attention | The Ingest form; a *source*'s prose |
| `620px` | to be told something | — |
| `560px` | when there is nothing to do | The delete confirmation, the door, the refusal |

### 2.3 `05` §5's three ambiguous spacing steps, resolved

`05` §5 snapped nineteen hand-set values onto ten 4pt steps, and left three that "sit exactly 2px
from two steps", each to be decided against a screen. Two are gaps and resolve; the third turns out
never to have been one.

| Value | Where | Resolution |
| --- | --- | --- |
| `14px` | `05` §7, the *judgement field*'s eyebrow-to-value gap | **→ `12`.** `05` §5's own meanings settle it: "8–12px — inside one thing — a label and its value". An eyebrow and its value are one thing |
| `30px` | `05` §7, the *Review* card's *meaning*-to-example-pair gap | **→ `28`.** The *meaning* and the example are peers, and 28–32 is the peer step |
| `30px` | `05` §7, the *facts strip*'s padding either side of its divider | **Stays `30`.** Control padding, which `05` §5's last line puts outside the scale's scope |
| `10px` | `05` §7, key cap padding `5px 10px` | **Never a gap.** It is padding, and the scale does not govern it |

**Two resolved, one dissolved.** Nothing on the scale moved.

### 2.4 Two component dimensions that are deliberately off the scale

`05` §5 exempts row heights, type sizes and control padding. Two values below are none of those and
are still off the scale, so they are named rather than hidden:

- **The flagged *progress rail* tick is 2px tall** (§5.3). It is a component dimension, not a gap.
- **The phone gutter is 20px** (§10.1), which *is* on the scale — `--k-gutter` becomes a responsive
  token rather than the exception `05` §5 calls it ("without exception").

---

## 3. The shell, and the start block

The *shell* is on `/`, `/sources`, `/sources/:id`, `/sources/:id/delete` and `/stats`, and nowhere
else (ADR 0013, `09` §2).

### 3.1 The bar

**56px tall**, matching *Vet*'s chrome bar so the two screens share a horizon, `--k-gutter`
horizontal padding, `--k-rule` bottom border.

| | Content | Treatment |
| --- | --- | --- |
| Left | `Ingest` · `Sources` · `Stats` | 15px Newsreader 400. The current *place* `--k-ink`; the others `--k-ink-secondary`. `28px` apart. **No face, no border, no underline** |
| Right | `Sign out` | 15px Newsreader 400, `--k-ink-secondary`. A link to `/auth` (`08` §2) |

**The nav names the three *places* and never a *mode*** (ADR 0032). The current *place* is marked by
ink alone — not by the accent, which `05` §2 spends on exactly two things and "where you are in the
shell" is neither of them. It is marked, and one ramp step of contrast between `--k-ink` and
`--k-ink-secondary` is 15.67 against 4.59, which is not subtle.

### 3.2 The start block ⚠️

**The component the canvas never drew.** ADR 0032 requires it to read as different from the nav
beside it, and the distinction that costs nothing is this: **the nav is text; the start block is
bounded.**

It is the **quiet affordance** `05` §7 already gives geometry for — the one drawn in *Vet*'s empty
state — with one change:

| | Value |
| --- | --- |
| Face | `--k-raised` |
| Border | `1px --k-border-control` |
| Radius | `--k-radius-control` (5px) |
| Padding | `13px 20px` |
| Label | 17px Newsreader 400, `--k-ink` |
| Count | `--k-dot` `·`, then the figure in `--k-ink` and its word in `--k-ink-secondary`, both 12px Plex Mono — the *Vet* chrome bar's own pending-count treatment (`05` §7) |
| **Arrow** | ⚠️ **Dropped.** See below |
| Two controls | `12px` apart, the grade-control gap |

**Both controls read their count and neither is ever disabled** (ADR 0032): `Vet · 47 pending`,
`Review · 12 due`. `href` is `/vet?from=<current place>` and `/review?from=<current place>`.

⚠️ **The accent `→` is dropped here, and it is the one departure from `05` §7's affordance.** `05` §2
spends the accent on where you are and what costs you the decision. On empty *Vet* the affordance is
the only thing on the screen and the arrow is the sentence; in a block of two, side by side, above a
form, two accent arrows are decoration — and `05` §2 says the accent "is never decoration and never a
state". The affordance keeps its arrow where it is alone (§4.5, §7.2); the start block does not.

**Placement: the first block of the page body, not part of the bar.** `28px` below the bar's rule,
`--k-gutter` aligned, with no rule of its own. The reason is `09` §2: every figure in the shell is as
of page load, and a page-load-stamped figure belongs on the page rather than in the chrome that
frames it.

Directly beneath it, `12px` down: **`as of this page load`**, 13px Newsreader 400 italic,
`--k-ink-secondary` — `05` §4's aside role. `09` §2 requires the shell to *say so* and this is the
sentence. It is the same line on all three *places*.

### 3.3 The three interaction states a *place* has

Per [ADR 0035](adr/0035-five-interaction-states-is-not-a-set-and-three-screens-have-three.md).

| State | Nav item / link | Bounded control (start block, quiet affordance, submit) |
| --- | --- | --- |
| **Hover** | `--k-ink-secondary` → `--k-ink`; accent links → `--k-accent-hover` | Face `--k-raised` → `--k-key-face` |
| **Active** | No change | Face → `--k-ink-ground`, label → `--k-on-ink`, border → `--k-ink-ground` |
| **Focus** | `--k-focus`, 2px outline at 2px offset, `:focus-visible` only (ADR 0025) | Same |
| **Disabled** | **Does not exist.** No control in v1 has one (ADR 0035) | |
| **Loading** | **The browser's.** These routes ship no JavaScript | |
| **Error** | **A re-rendered document**, not a component state — §6.3 | |

An **inverted** control (the primary control, a selected grade control) has no face left to darken,
so its hover moves its ink: the key hint `--k-on-ink-quiet` → `--k-on-ink`. It gets no active state,
because every one of them navigates or submits immediately.

---

## 4. *Vet*

`/vet`, `ssr: false`, a *mode*. `05` §7 gives the chrome bar, the *facts strip*, the *provenance
marker*, the *judgement field*, the key cap and the empty-state block; the canvas drew all of them.
What follows is what it did not.

### 4.1 The frame, and the one rule that keeps it conformant

1440 × 900. `--k-gutter` 44px. Header 56px with a `--k-rule` bottom; footer 68px with a `--k-rule`
top (`05` §5). Reading column **940px**, centred.

⚠️ **The key handlers bind to the mode container, never to `document` or `window`.** ADR 0025 holds
focus there so keystrokes land somewhere and a reload restores it. Verification §13.4 found the
second reason, which nothing knew when ADR 0025 was written: ADR 0023's map is all printable
characters, so **SC 2.1.4 Character Key Shortcuts (Level A)** applies, and the application passes
only on that criterion's "Active only on focus" exception — which is true *because* the container
holds focus. Binding to `document` is the obvious shortcut and it fails a Level A criterion silently.

### 4.2 Focus, amended

ADR 0025: *Vet* and *Review* hold focus on the container and draw no ring, except *Vet*'s edit state.
⚠️ **That exception list grows here, under ADR 0025's own revisit condition** — which named this
exact trigger and named the answer.

**The rule, stated the way ADR 0025 was reaching for: a mode draws no ring while it is running, and
draws it on the screens where it has stopped.**

| Screen | Ring |
| --- | --- |
| *Vet*, a *note* on screen | None. Focus is on the container |
| *Vet*, editing | **On the field being edited** (ADR 0025) |
| *Vet*, run-end confirmation (§4.6) | **Yes**, on the two controls |
| *Vet*, any empty state (§4.5) | **Yes**, on Done and the affordance |
| *Review*, front or back | None |
| *Review*, end screen and both non-terminal empty states | **Yes** — three focusable elements: the *session*-size knob, "Start another session", Done |

The token and its geometry are unchanged: `--k-focus` (`--k-accent`, 5.38), 2px outline at 2px
offset, `:focus-visible` only, never animated.

### 4.3 The Done cluster ⚠️

`05` §8 lists this as never drawn: "the canvas's modes have no exit affordance at all."

**It is the key cap plus its label**, the component the footer legend already uses (`05` §7), placed
at the right end of the chrome bar. That is the whole geometry, and the reason it is that and not a
button is that **the control's job is to name the key as much as to be a target** — desktop keeps
`Esc` and gains a visible way out (ADR 0026), so a control that does not say `Esc` teaches the
keyboard reader nothing.

| | Value |
| --- | --- |
| Cap | Secondary key cap: `--k-key-face`, `1px --k-border-control`, `--k-ink-value`, `5px 10px`, `--k-radius-key`, 12px Plex Mono, reading `Esc` |
| Label | `Done`, 15px Newsreader 400, `--k-ink-secondary` — the legend's non-primary label treatment |
| Gap | `8px` between cap and label |
| From the counts to its left | `28px` |
| Hit area | `min-height: 32px`, vertical padding to reach it — clears SC 2.5.8's 24 × 24 (verification §13.3) |

⚠️ **It is `<NuxtLink :to="origin" external>`** — never a bare `<NuxtLink>` (ADR 0032, `09` §5.2,
verification §12.1). This is a rendering fact, not a visual one, and it is repeated here because
this is the file someone reads while building the control.

**The chrome bar, left to right, complete:** `VET` (11px Plex Mono, `--k-accent`, 0.22em) · the
*source* name (14px Mincho, `--k-ink-secondary`) — then, right-aligned — the pending count · the
*note* index · the Done cluster.

⚠️ **Added 2026-09-12 with #10 — what the *note* index is, which `05` §7 names and never defines.**
It is **the position in this run**: the number of decisions made plus one, rendered `#19`. It is the
only monotone figure on the screen and the one that answers *how much have I done*; the pending count
beside it already answers *how much is left*, and a second figure counting the same direction would
be one of them restated. ⚠️ **In every empty state the counts are absent entirely** (§4.5) — there is
no *note* to be at a position in.

⚠️ **A *note* returned by a flag carries one more thing**, and nothing else in the project named it:
a 13px Newsreader italic aside in `--k-ink-secondary`, `12px` after the *source* name, reading
**`returned by a flag`**. `X` in *Review* sets `note_vetting.flagged_at` and puts the *note* back in
the queue (`09` §4.9), so the reader is seeing it a second time, and the reason they are is the only
thing that makes the second look different from the first.

### 4.4 The edit state, and whether the fields are single-line ⚠️

`09` §4.3 left this open and said `Enter`-to-commit assumes an answer.

**The values are single-line. The elements are not `<input>`.**

Each editable field is a `<textarea>` that **wraps and never accepts a newline**: `Enter` is bound to
commit-and-accept and no key inserts a line break. The reason it cannot be an `<input>` is the
example sentence — 27px Mincho at 1.6 in a 940px column is roughly 34 characters to the line, so a
Japanese sentence wraps by construction, and an `<input>` would scroll it horizontally out of sight
at the exact moment the reader is deciding whether it is correct.

**Edit reaches the *judgement fields* only** — the *meaning*, the example sentence and the example
gloss. `Tab` cycles those three. It does not reach the *facts strip*, and that is the same zoning
`CONTEXT.md` already states: everything above the lower rule is context, everything under it is a
*judgement field*. Concretely, editing the *term* would change `note.identity_key` (ADR 0006) and
editing a *level* would manufacture a claim with no *authority* (ADR 0005). Neither is an edit; both
are a different feature.

⚠️ **Added 2026-09-12 with #10 — `05` §4's ramp is written per *field name*, and the declaration
carries no role that would generalise it.** The ramp names "*Vet* — the *meaning*" at 40px Newsreader
300, "*Vet* — example sentence" at 27px Mincho and the example gloss at 17px; those are three JLPT
field names, not three roles, and `subjects/jlpt-vocab.json` declares `kind`, `required`,
`memory_bearing` and `label` — nothing that says *this value is Japanese prose read at length*. So
`app/components/VetNote.vue` holds a three-entry map from field name to type, written where it is
visible, with a 17px Newsreader fallback. **A second *subject* closes this**, and the declaration is
the place to close it (ADR 0003) rather than a second map.

| | Resting field | Being edited |
| --- | --- | --- |
| Face | none | `--k-raised` |
| Border | none | `1px --k-border-control` |
| Radius | — | `--k-radius-control` |
| Padding | — | `9px 12px`, and the box is offset by that much so the text does not move when editing opens |
| Type | as `05` §4 | unchanged — the reader edits at reading size |
| Ring | — | `--k-focus`, 2px at 2px offset (ADR 0025) |

The eyebrow above the field keeps its 10px accent label and its 13px italic provenance note, and the
gap below it is **`12px`** (§2.3, resolving `05`'s `14`).

`Esc` closes the edit and returns the *note* unchanged. ⚠️ It is the one contextual key in the
application (`09` §4.3) and the footer legend says so: while an edit is open the legend's `Esc` label
reads **`cancel edit`** rather than `leave`.

### 4.5 The three empty states ⚠️

`09` §8: ***Vet* has three, not one.** PRD §4 wrote one. All three use the empty-state block —
left-aligned in a **560px** column, never centred; a 46px Newsreader 300 statement, `18px` down an
18px body in `--k-ink-secondary`, then a full-width `--k-rule` with `32px` clearance, then what the
state offers (`05` §7).

⚠️ **Amended 2026-09-12 with #10: the statement-to-body gap is `20px`.** `05` §5 is the authority on
gaps and its snap record resolves this one by name — `18 → 20` — and gives 20 the meaning that fits
it exactly, *between a body block and what introduced it*. The `18` above and in `05` §7 is the
canvas's figure restated without the snap; **the body's 18px type size is unchanged**, because §5
exempts type sizes. `05` §7 carries the same amendment.

**The chrome bar stays in all three**, carrying `VET` and the Done cluster. Its counts are empty.

| | Statement (46px) | Body (18px) | After the rule |
| --- | --- | --- | --- |
| **1. Nothing to vet** | `Nothing to vet.` | Everything ingested has been judged. | **The quiet Ingest affordance**, with its accent `→`, reading `Ingest a source` |
| **2. Nothing to vet yet** | `Nothing to vet yet.` | What is running, and how far — chunks done of total, from `ingestion` and `ingestion_chunk` (`04` §6.1, §6.2). Or, unclaimed: `Queued for 4 minutes, not yet picked up` | **Nothing.** The rule is the last thing on the screen |
| **3. The queue ran dry mid-run** | `Caught up.` | The same progress line, plus what this run has done: `18 vetted in this run` | **Nothing** |

**Why 2 and 3 offer nothing after the rule.** The affordance says "go and ingest something", and in
both of those states a *source* is already ingesting — it would be wrong advice, delivered as the
one thing on screen. Done is in the chrome bar and is the honest way out.

**Why 3 is a state and not a repeat of 2.** `S2` promises the first *note* is vettable while the
rest generate, so the queue running dry mid-run is a normal event, not an ending (`09` §8). The
difference the reader needs is that they have done work: state 2 is entered with nothing done,
state 3 having vetted some, and the statement changes from *nothing yet* to *caught up* because those
are different feelings about the same database.

⚠️ **States 2 and 3 are the only self-updating screens in the application.** *Vet* has a client and
the three *places* do not (`09` §3 step 10, §7), so this screen polls — **every 5 seconds** — and
becomes the queue, or state 1, without a reload. Five seconds is chosen against the fact that *notes*
arrive over tens of seconds: shorter is polling a laptop for nothing, longer is a reader watching a
screen that looks broken.

⚠️ **Empty *Vet* is where ADR 0013's navigation gap actually closes**, and it closes with two
controls that mean different things (ADR 0032): Done returns to the *place* the reader came from,
which may be Sources; the affordance says what to do instead. Do not simplify them into one.

### 4.6 The run-end confirmation ⚠️

ADR 0033: Done and `Esc` ask once, **only when the run holds at least one rejection**, and `Z` works
right up to the moment it is answered.

**It is not a modal.** `05` §6 has one shadow on one element and says "Nothing else in the system is
elevated" — so the confirmation **replaces the reading column** and leaves the chrome bar standing.
It is the empty-state block again, in the same 560px column:

| | |
| --- | --- |
| Statement, 46px Newsreader 300 | **`3 rejections become permanent.`** The number is the point of the screen (ADR 0033), so it is in the statement and not in the body |
| Body, 18px `--k-ink-secondary` | One sentence: re-ingestion will not surface them again (ADR 0006) |
| Rule | full-width `--k-rule`, `32px` clearance |
| After it | Two key caps with labels, `28px` apart: **`space` — end the run** (primary cap: `--k-ink-ground` face, `--k-ground` ink, label 15px `--k-ink`) and **`Z` — back to the queue** (secondary cap, label 15px `--k-ink-secondary`) |

Both keys already mean these things (ADR 0023), and both caps are clickable targets at `min-height:
32px` for the reader who arrived by pressing Done with a pointer. It does not appear at all when the
run holds no rejections — ADR 0033's reason is that a dialog with nothing to lose teaches the reader
to dismiss it unread.

⚠️ **The 30-minute idle sweep also ends the run and cannot be asked anything** (`04` §7.1,
ADR 0033). Which is why the footer legend below carries the horizon.

### 4.7 The footer legend

68px, `--k-rule` top, aligned to the 940px column (`05` §5). Key caps per `05` §7, `28px` apart,
label 15px — `--k-ink` beside the primary cap, `--k-ink-secondary` beside the others.

`space` accept (primary cap — the widest, per ADR 0023) · `E` edit · `R` reject · `Z` undo ·
`X` — not present here; `X` is *Review*'s key.

⚠️ **Amended 2026-09-12, while building [#10](https://github.com/yutaasakura96/kioku/issues/10) —
this section and §4.4 disagreed, and the legend is not one fixed row.** §4.4 says "while an edit is
open the legend's `Esc` label reads `cancel edit` rather than `leave`"; the legend above has no `Esc`
in it at all, because §4.3 gives that key to the Done cluster. Both are honoured by **the legend
naming the keys that act on the screen in front of the reader**:

| Screen | The legend holds |
| --- | --- |
| A *note* | The four above, and the horizon aside |
| An edit open | `Enter` **accept** (primary) · `Tab` next field · `Esc` **cancel edit** — §4.4's sentence, in the only row it can be true of |
| An empty queue, run holds ≥ 1 decision | `Z` undo, and the horizon. ⚠️ **`Z` is live here**: ADR 0033 reads its target from the database rather than from what is rendered, so the undo reaches back into an empty screen |
| An empty queue, nothing decided yet | Nothing. The 68px band and its rule stay — `05` §5 gives the frame its shape |
| The run-end confirmation (§4.6) | Nothing. §4.6 says the confirmation replaces the reading column and is silent about the footer; four keys that do nothing beneath a question with two is worse than no legend |
| A phone (§10.5) | Nothing — the whole footer goes with the reading column |

⚠️ **A failed keystroke replaces all of it** (§4.8), in place and until the next keystroke.

⚠️ **And the horizon, which ADR 0023 put here on purpose and ADR 0033 made load-bearing:** a 13px
Newsreader italic aside in `--k-ink-secondary`, right-aligned in the footer, reading
**`undo lasts until this run ends`**. It is the only thing that tells the reader the horizon exists
before they find out it has closed.

### 4.8 *Vet*'s loading and error states

*Vet* has a client, so both are real (ADR 0035).

**Loading** — fetching the head of the queue. The chrome bar and both rules paint immediately; the
reading column stays empty ground. **If the fetch passes 500ms, the empty-state block appears with a
46px statement reading `Loading the queue.`** and nothing after the rule. The threshold exists
because a statement that flashes for 120ms is worse than 120ms of quiet ground, and this is the
screen whose whole thesis is that nothing moves between keystrokes.

**Error** — two kinds, and they are not the same shape.

- **A fetch failure**: the empty-state block. Statement `The queue could not be loaded.`, body
  naming what to do, nothing after the rule. Done is in the chrome bar, so there is a way out.
- ⚠️ **A keystroke that failed** — chiefly `Z` on an acceptance whose *card* has reached a *review
  session*, which the database refuses on the `RESTRICT` (ADR 0033, `04` §9.1). **The message
  replaces the footer legend, in place, and stays until the next keystroke** — not on a timer. A
  timed message is the one thing a keyboard-driven screen must not use, because the reader's eyes are
  on the *term* and not on the footer. Replacing the legend is acceptable: the legend is reference
  material, and by the time a `RESTRICT` failure is reachable the reader has completed a prior run.
  15px Newsreader, `--k-ink`, left-aligned in the 940px column.
  ⚠️ **Amended 2026-09-12 with #11 — there is a second one, and `Z` is no longer the only.** An
  `Enter` out of an edit on a *note* another reader has already accepted is refused by `S6`'s freeze
  (ADR 0052) and nothing is decided; the message says so in the same place, on the same terms.
  Unreachable while v1 invites one reader (ADR 0012), and written because the guard is not.

---

## 5. *Review*

`/review`, `ssr: false`, a *mode*. Four states (`05` §5): front, back, session end, nothing due.
**Review carries no screen label in any of them** — the *progress rail* is its header, and it is the
only progress indicator in the app (`05` §5, §7, `CONTEXT.md`).

### 5.1 The frame

1440 × 900, `--k-gutter` 44px. Header **64px**, no rule. Footer **104px**, no rule. Card 760px, and
the grade controls beneath it share its exact width (`05` §5).

**What the 104px footer holds**, which nothing had said:

| State | Footer |
| --- | --- |
| Front | The key legend: `space` — reveal (primary cap) · `X` — flag (available-but-aside cap, dashed) |
| Back | **The four grade controls**, 760px, and beneath them, `12px` down, the `X` — flag legend line alone |

`Esc` is not repeated in the legend, because the Done cluster in the header names it (§5.2).

### 5.2 The Done cluster, and the rail it shares a row with ⚠️

`05` §8: "On *Review* it has to share its row with the *progress rail*." ADR 0026 named the collision
and left it.

**The header is a three-column grid: a left spacer, the rail, the Done cluster.** The spacer is
exactly the Done cluster's width, so **the rail stays optically centred**, which it must be, because
it is the header of a screen whose 760px card is centred beneath it.

| | Value |
| --- | --- |
| Done cluster | Identical to *Vet*'s (§4.3): `Esc` cap, `8px`, `Done` at 15px `--k-ink-secondary` |
| Rail width | `min(620px, 100% − 2 × (cluster width + 28px))` |
| At 1440 | Inner width 1352; rail 620 centred leaves 366 either side; the cluster is ~90px. **No collision at any width above ~800px** |
| Below that | The rail shrinks symmetrically. It never slides off centre, and Done never overlaps it |

The rail's own geometry is unchanged (`05` §7): 620px, a 12px Plex Mono counter at each end in
`--k-ink-secondary` `20px` from the bar, one `flex-grow: 1` tick per *card*, 6px tall, 4px apart.
**Its length is `review_session.size`** (`04` §14), and it knows its own length because a graded
*card* leaves the *session* and never returns (ADR 0016).

### 5.3 The rail's fourth mark ⚠️

`09` §4.9: `X` advances without a *grade*, so a twenty-*card* *session* can end with nineteen
answers, and `05` §7's three fills do not cover a position that was passed but not answered.

**The flagged tick is 2px tall instead of 6px, filled `--k-on-ink-quiet`, vertically centred in the
6px band.**

| Tick | Fill | Height |
| --- | --- | --- |
| Graded | `--k-on-ink-quiet` | 6px |
| **Flagged** | `--k-on-ink-quiet` | **2px** |
| Current | `--k-accent` | 6px |
| Not reached | `--k-tick-empty` | 6px |
| *Session* complete | all `--k-ink-ground`, right counter `--k-ink` | flagged stays 2px |

**Height, not colour, and that is the argument.** A flagged position is *less than an answer and more
than nothing*, so it takes the graded fill — the reader is past it — at a thinner mark. A new fill
would need a new token, and ADR 0024 established that this palette has no grey to spare; a border on
a 6px bar leaves 4px of muddy fill. `--k-radius-tick` still applies, so a 2px tick is a hairline pill.

### 5.4 The card, and what changes on it

`05` §7 gives the card whole: 760px, `min-height: 527px`, `--k-raised`, `1px --k-rule-raised`,
`--k-radius-card` 3px, `--k-shadow-card`, padding `54px 64px 46px`.

**One value moves, per §2.3:** the *meaning*-to-example-pair gap goes from `30px` to **`28px`**.
Nothing else on the card changes.

Front: the *term* alone at 104px Mincho 400, centred both ways.
Back: *term*, *reading* `16px` below, a full-width `--k-rule-raised` at `38px / 34px`, the *meaning*
at 36px Newsreader 300, the example pair `28px` down, the fact row `40px` below that.

### 5.5 The grade controls

`05` §7's geometry stands: four controls in a row, `12px` apart, spanning 760px, each a stacked pair
— digit above, label below, `3px` between — `9px` vertical padding, `--k-radius-control`.

**The labels, which `05` §8 held out of the system, are settled by
[ADR 0034](adr/0034-the-grade-labels-name-recall-because-they-cannot-name-a-time.md):**

| Key | Digit | Label |
| --- | --- | --- |
| `1` | `1` | **`Forgot`** |
| `2` | `2` | `Hard` |
| `3` | `3` | `Good` |
| `4` | `4` | `Easy` |

`Again` does not survive. With `enable_short_term: false` the soonest a graded *card* returns is
**tomorrow** — `next_interval` clamps at `Math.max(1, …)` and `LongTermScheduler` schedules in days
(verification §13.1) — so `Again` would promise a same-day return this configuration cannot make.
`Forgot` names the lapse the library itself counts (`next_again.lapses += 1`, and nothing else
increments it).

| State | Face | Border | Digit | Label |
| --- | --- | --- | --- | --- |
| Resting | `--k-raised` | `1px --k-border-control` | `--k-ink-value` | `--k-ink-secondary` |
| Hover | `--k-key-face` | `1px --k-border-control` | `--k-ink-value` | `--k-ink-secondary` |
| Selected / active | `--k-ink-ground` | `1px --k-ink-ground` | `--k-on-ink-quiet` | `--k-ground` |

Digits are 12px Plex Mono, labels 14px Newsreader 400 (`05` §4). **A *grade* is stamped at the
keystroke and the interface never waits on the flush** (`S8`, ADR 0007) — so the selected state is
visible for exactly as long as it takes the next *card* to render, and it is not a loading state.

### 5.6 The end screen

Header: the *progress rail*, all ticks `--k-ink-ground`, right counter `--k-ink` (`05` §7). Footer
64px, empty. Column **620px** (`05` §5 — the session-end column).

Top to bottom:

1. **The *session tally*** — `05` §7 unchanged: four equal columns `8px` apart, a 10px Plex Mono
   eyebrow at 0.14em in `--k-ink-secondary`, `8px` down a 38px Newsreader 300 figure in `--k-ink`.
   ⚠️ **Amended 2026-09-12 with [#12](https://github.com/yutaasakura96/kioku/issues/12): the four
   are the *grade* distribution** — `FORGOT` · `HARD` · `GOOD` · `EASY`, one count each
   ([ADR 0053](adr/0053-the-end-screens-four-figures-are-the-four-grades.md)). This section asked for
   four columns and never said which four, and eleven documents name no candidate set. The
   distribution is the only set of four the run actually produces — every *card* ends as exactly one
   of them (ADR 0016, ADR 0034) — and the rail above already says how long the run was, so a
   `REVIEWED` column would restate it in 38px type.
2. **⚠️ The unsent-grades notice**, `32px` down, and only when there is something to say. `09` §4.8
   requires it and nothing had drawn it: a flush that answers 401 is not a network error, and `03`
   §8.2's rejected *grades* are surfaced rather than dropped. 15px Newsreader, `--k-ink`, with the
   count, plus a link to `/auth` when the cause is the 401. **It is not styled as an alert** — there
   is no alert in this system — it is a sentence with a rule above it.
   ⚠️ **Amended 2026-09-12 with #13: it is one notice carrying up to two sentences**, because the
   two things it reports are different in kind. *Answers have not reached the database yet* is a
   **wait** — the outbox is holding them and the next connection sends them (ADR 0014) — and
   *answers were refused and will not be sent again — usually a clock that disagrees with the
   server's* is an **end**: nothing retries them
   ([ADR 0054](adr/0054-the-skew-allowance-is-two-minutes-and-it-covers-both-of-8-2-s-rules.md)).
   ⚠️ **It says *usually*** because two things end an entry and only one is the clock: `03` §8.2's
   stamp rules, and a body the server cannot read, which is refused the same way and for the same
   reason — an entry that can never succeed must leave the stream, or it blocks every answer behind
   it.
   Both are *what happened to the answers you gave*, so they share the rule and the block rather
   than growing a second one. ⚠️ **It says *answers* rather than *grades***: `X` rides the same
   outbox, so the count is of entries and a flag is one of them.
3. **The *session*-size knob** (§5.8), `32px` down.
4. **`Start another session`** — the standalone primary control (`05` §7): inline rather than full
   width, `13px 24px`, `14px` gap, key hint `space` in 12px Plex Mono `--k-on-ink-quiet`, label at
   17px `--k-ground`.

⚠️ **Starting another is one deliberate action and never automatic** (`S7`). `space` is safe here
because the key before it was a digit (`09` §4.7).

### 5.7 The two non-terminal empty states

Empty-state block, **560px**, left-aligned. Header 64px empty, footer 64px empty (`05` §5, "Nothing
due"). The Done cluster is in the header in both.

| | Statement | Body | After the rule |
| --- | --- | --- | --- |
| **Nothing ever *accepted*** | `Nothing to review.` | Points at *Vet*: cards are minted when a *note* is accepted | The *session*-size knob |
| **Nothing due** | `Nothing due.` | **When the next *card* is due** — 24px Newsreader 400, `--k-ink`, the "single datum given weight" slot (`05` §4): `Tomorrow, 08:40` | The *session*-size knob |

There is no ahead-of-schedule study in v1 (PRD §5), so neither state offers a way to start one.

### 5.8 The *session*-size knob, and its two homes ⚠️

`09` §4.7: set on the end screen and on *Review*'s empty states, **never mid-session** — the current
one is snapshotted and a knob that appeared to change it would be lying.

**Two homes, three screens:** the end screen (§5.6), and both non-terminal empty states (§5.7).

| | Value |
| --- | --- |
| Eyebrow | `SESSION SIZE`, 10px Plex Mono, 0.14em, `--k-ink-secondary` — `05` §4's muted eyebrow tracking |
| Field | `--k-raised`, `1px --k-border-control`, `--k-radius-control`, `9px 12px`, sized to four characters |
| Value | 24px Newsreader 400, `--k-ink` — the "single datum given weight" slot |
| Gap | `8px` between eyebrow and field |
| Bounds | **1–200** (`04` §7.6), enforced on the client and again on the server |
| Out of range | The field shows the clamped value, and a 13px italic aside beneath names the bound |
| Focus | **Rings** — §4.2 |

⚠️ **A first-ever *session* is twenty *cards* with no chance to change it** (`09` §4.7), because the
knob has nowhere to live before a *session* exists. Twenty is the default and the reader adjusts it
at the end of the first run. This is a stated cost, not a gap to patch with a knob on Ingest — the
knob belongs to *Review* and a *place* would have to reach into a mode's state to carry it.

### 5.9 *Review*'s loading and error states

**Loading** — composing a *session* (`09` §4.7 step 2). Same rule as *Vet* (§4.8): the header's rail
band and the frame paint immediately, and past 500ms the empty-state block appears with
`Composing a session.` The rail cannot paint before this, because it does not know its own length
until `review_session.size` exists.

**Resuming** from `localStorage` (`09` §6) is not a loading state and draws nothing: the snapshot is
already local, so the first ungraded position renders on the first frame.

**Error** — a failure to compose: the empty-state block, statement `The session could not be
started.`, Done in the header. Outbox errors are not this state; they are §5.6's notice, because
`S8`'s whole point is that the interface never waits on the flush and therefore never fails on it
mid-run.

---

## 6. Ingest

`/`, `noScripts: true`, a *place* (ADR 0031). **The only screen that works with nothing ingested**
(PRD §4). The shell (§3), then the page body in a **760px** column — one object of attention that the
reader acts on, which is what 760 means in `05` §5.

### 6.1 The order of the page

The start block and its aside (§3.2), then **the runs**, then the form. Runs above the form because
`09` §3 step 7 puts them there: the reader submits, gets `303`'d back to `/`, and the thing they
just did should be above the thing they might do next.

### 6.2 New components

**Text field.** Two of them: an optional title, and the content.

| | Value |
| --- | --- |
| Eyebrow | 10px Plex Mono, 0.14em, `--k-ink-secondary` — `TITLE`, `CONTENT` |
| Gap to field | `8px` |
| Face / border / radius | `--k-raised` · `1px --k-border-control` · `--k-radius-control` |
| Padding | `12px 16px` |
| Type | 17px Newsreader 400, `--k-ink`. The content field is prose the reader pasted; it is read at body size, not at data size |
| Content field height | `min-height: 320px`, growing with the viewport |
| Between the two fields | `28px` |
| Focus | `--k-focus`, 2px at 2px offset |

**Submit** is the full-width primary control (`05` §7): `--k-ink-ground` face and border,
`--k-radius-control`, `9px` vertical padding, label `Ingest` at 14px in `--k-ground`. ⚠️ **Its key
hint slot is empty and the label centres alone** — there is no key on a route with no client, and a
key cap that names a key that does nothing is worse than no cap.

⚠️ **There is no live character counter.** The cap is 100,000 characters (`S2`, `04` §5.1) and this
route ships no JavaScript, so nothing can count as the reader types. The count appears in the error
render (§6.3), which is the honest consequence of ADR 0013's split rather than a thing to work
around.

**Run row.** One per *ingestion*, `--k-rule` between rows, `20px` vertical padding.

| | Treatment |
| --- | --- |
| *Source* title | 15px Newsreader 400, `--k-ink`. A link to `/sources/:id` |
| Status | 12px Plex Mono, `--k-ink-value` — `queued` · `running` · `complete` · `incomplete` · `failed` (`04` §6.1). Mono because `05` §4 gives Plex Mono "everything that is a number, a key, or a label rather than language" |
| Detail | 12px Plex Mono, `--k-ink-secondary`, after a `--k-dot` `·` |

The detail per state, from `09` §7 — and **Ingest reports what the job table knows and does not
diagnose a dead worker**, because `job.heartbeat_at` only ticks while working, so an idle worker and
an absent one are identical:

| Status | Detail |
| --- | --- |
| `queued`, unclaimed | `queued 4m, not yet picked up` |
| `running` | `12 of 31 chunks` |
| `complete` | the number of *notes* produced |
| `complete`, zero new *notes* | the filter tally below — **a success** (PRD §5) |
| `incomplete` | what completed, and a resume control (the quiet affordance, with its arrow). ⚠️ **Built 2026-09-12 by #8** — see below |
| `failed` | what failed. ⚠️ **The provider is never named at the reader** (`03` §11) |

⚠️ **Amended 2026-09-11 — `incomplete`'s resume control is owed by #7, not by #6.** #6 built the run
row and its five detail lines; the resume control is a **write**, a second `job` at `kind = 'resume'`
(`04` §6.4), and what resuming *means* is `04` §6.2's `WHERE ingestion_id = $1 AND status <>
'complete'` — the worker's query, which arrives with
[#7](https://github.com/yutaasakura96/kioku/issues/7). A control that wrote a job no worker could act
on would be worse than the line that says what completed. **The ticket that builds the resume path
builds this control.**

⚠️ **Amended again 2026-09-11, by #7, and it moved to
[#8](https://github.com/yutaasakura96/kioku/issues/8).** #7 built the worker's half in full: a
`kind = 'resume'` job is claimed like any other, the chunk queue is opened idempotently, and `04`
§6.2's query is `worker/runs.py`'s `incomplete_chunks`. What #7 did **not** build is a *chunk
processor* — stages 1–5 are #8 and generation is #9 — so a resume today re-settles the run and
changes nothing a reader would see. **The test above is the same test and it still fails:** the
control would write a job no worker could act *usefully* on, and a button that visibly does nothing
is the version of this that costs trust rather than a line.

~~⚠️ **The state itself is reachable today, and by every run.**~~ **That stopped being true on
2026-09-12.** With no chunk processor every run settled `incomplete`; with stages 1 to 5 a run that
reads its whole *source* settles `complete`, and `incomplete` goes back to meaning what `04` §6.1
says it means — a run that stopped part-way, with chunks still to do.

⚠️ **Built 2026-09-12 by [#8](https://github.com/yutaasakura96/kioku/issues/8), and this is the
fourth and last amendment to this row.** The test the three refusals kept failing is the one that
passes now: a resume re-runs the chunks that did not complete, and the number in the line beside the
control moves.

| | Treatment |
| --- | --- |
| Shape | `05` §7's quiet affordance, **with its accent arrow** — `--k-raised` face, `1px --k-border-control`, `--k-radius-control` |
| Scale | `7px 14px` padding, label at **14px**, because it sits inside a run row rather than being the whole screen — the same step-down the tally's figure takes from 38px to 24px |
| Label | `Resume`, then the `--k-accent` arrow |
| Placement | Below the detail line, `12px` down, above the filter tally |

⚠️ **It is a form, not a link**, and the method is the whole of the protection: a `GET` that wrote a
job would be actioned by a prefetch, a crawler or a back button, and this route ships no JavaScript
to intercept anything (ADR 0020). It posts a hidden `resume` field to `POST /` — the same path as the
submission, told apart by the field, because a second path would add a row to `09` §1's route table,
a second write surface and a second CSRF story to save one `if`. The answer is a `303` to `/`.

⚠️ **There is no confirmation and no flash message.** `09` §7 makes the run list the thing that says
where a run is, read fresh on every request; the next render tells the truth whichever way the write
went, and a message would be a second, staler account of the same fact with no client to hold it. A
resume of a run that is no longer resumable writes nothing and still lands on `/`.

**Filter tally.** The zero-new-*notes* case (PRD §5, `09` §4.5) — candidates extracted and how many
each filter dropped, from `ingestion.candidates_*`. **It is the *session tally* component** (`05`
§7), one column per stage, wrapping to a second row of the same grid past four. The figure drops
from 38px to **24px** Newsreader 400 here: it sits inside a run row rather than being the whole
screen, and 24px is `05` §4's "a single datum given weight".

### 6.3 The error render, which is not an error state

Per [ADR 0035](adr/0035-five-interaction-states-is-not-a-set-and-three-screens-have-three.md), a
*place*'s error is a document. `09` §4.2's cases:

| Case | Render |
| --- | --- |
| Over 100,000 characters | **`200`, the form re-rendered with the text still in it.** A 15px Newsreader line in `--k-ink` above the content field, naming the count: `128,441 characters — the cap is 100,000. Split it and submit the halves.` The field keeps a `1px --k-ink-secondary` border rather than its resting one |
| Empty content | Same shape, one sentence |
| Identical to an existing *source* | `303` to `/`, and a line above the runs naming the earlier *source* and **linking to it** — accent link text (`05` §2). Detection, not prevention |

⚠️ **The re-render is what protects the paste.** A `303` after a rejected 120,000-character paste
loses it and there is no client to hold it (`09` §4.2). The cost — a browser reload on the error page
re-submits — is the ordinary cost of the ordinary answer.

**No colour is spent on the error.** The accent is for where you are and what costs you the decision
(`05` §2); a validation message is neither, and a red that means "wrong" would be an eighth colour
saying something the sentence already says.

---

## 7. Sources

### 7.1 The list — `/sources`

Shell, start block, then a **940px** column: a list is read across, which is what 940 means.

**List row**, `--k-rule` between rows, `20px` vertical padding:

| | Treatment |
| --- | --- |
| Title | 17px Newsreader 400, `--k-ink`. Links to `/sources/:id` |
| Fact line, `8px` below | 12px Plex Mono, `--k-ink-secondary`, `--k-dot` `·` between: `submitted_at` · the *ingestion*'s status · `41 notes` |
| Deleted | A 13px Newsreader italic `deleted` in `--k-ink-secondary`, after the title. **Not a colour, not a strike-through** |

**Deleted *sources* stay in the list**, because `S11` requires them to stay readable (`09` §4.11).
The aside is the marker: `05` §4 gives 13px italic to asides, and "this is not what it was" is an
aside about the row rather than a state of it.

**Empty state:** the empty-state block, 560px. `Nothing ingested.` / one body line / rule / the quiet
Ingest affordance **with its accent `→`** — here it is the only thing on the screen, which is the
condition §3.2 named for keeping the arrow.

### 7.2 One *source* — `/sources/:id`

`S11`'s "where did this card come from" half, and the reason `source.content` is retained at all
(ADR 0008).

⚠️ **Amended 2026-09-11 — the readable half of this screen was built early, by #6, and the rest was
not.** #6's acceptance criteria put "the *source* **detail** route, its *occurrence* positions and
deletion" in `S11` and out of milestone 1, and two of its *other* criteria then needed the route to
exist anyway: `09` §4.2's "offers to open the existing one" and §7.1's list row both link here, and a
link to a `404` is not an offer. So `/sources/:id` today renders the title, the fact line and **the
retained material**, in full — the part ADR 0008 kept the content *for* — and nothing else. **The
*notes*, the *occurrence* positions and the route to §7.3's confirmation are still `S11`'s**, and the
ticket that owns them owns this section.

**Header block**, 940px: the title at 24px Newsreader 400 `--k-ink` (the "single datum given weight"
slot — a *source* title is a heading, not a 46px screen statement), then the fact line as §7.1,
then a `--k-rule` at `28px`.

**Prose block**, **760px**: `source.content` at **22px Mincho 400, line-height 1.65,
`--k-ink-quiet`** — the *Review* card's example treatment (`05` §4), which is the system's one
setting for a run of Japanese prose. 760px at 22px is roughly 34 characters to the line, which is a
comfortable Japanese measure; 940 would be 42 and too wide.

⚠️ **The content is not highlighted.** *Occurrences* carry character positions (`04` §5.5) and the
obvious drawing marks each range inside the prose — which needs a highlight fill this system does not
have, and inventing one is precisely what `05` §8 exists to prevent. **Each *note* is listed beneath
the prose with its *occurrences* quoted as short excerpts and their offsets**, which is also the more
useful artefact: readable without hunting for a mark in two pages of Japanese.

**Occurrence row**, 940px, `--k-rule` between, `20px` padding:

| | Treatment |
| --- | --- |
| Term | 22px Mincho 400, `--k-ink` — the *Vet* *reading* size, the smallest Japanese display slot in `05` §4 |
| *Reading*, *level*, *provenance marker* | The *facts strip*'s inline treatment (`05` §7): 11px Plex Mono *level claims*, the 7 × 7px marker filled when `level_claim.authority_key IS NOT NULL` and hollow otherwise (`04` §14). ⚠️ **Never behind a hover** (`CONTEXT.md`, `S4`) |
| Excerpt | 17px Mincho 400, `--k-ink-quiet`, one line per *occurrence* |
| Offset | 12px Plex Mono, `--k-ink-secondary`: `chars 1,204–1,207` |

**The delete link**, at the foot: accent link text (`05` §2), reading `Delete this source`, to
`/sources/:id/delete`. A link and not a control, because it does not delete anything — it opens a
page that does.

### 7.3 The delete confirmation — `/sources/:id/delete` ⚠️

**A page, not a modal** (`09` §4.11) — there is no client to hold a dialog, and `05` §6 elevates
nothing but the *Review* card. It is the empty-state block in a **560px** column, and it is the
whole page body.

| | |
| --- | --- |
| Statement, 46px Newsreader 300 | **`41 cards will be suspended.`** |
| Body, 18px `--k-ink-secondary` | What is not touched: no review history, no *note* deleted, no *card* row removed, and the *source* stays readable (`04` §9.1) |
| Rule | full-width `--k-rule`, `32px` clearance |
| The two controls, `28px` apart | A `POST` submit reading `Delete this source`, and a link back reading `Keep it`, to `/sources/:id` |

⚠️ **The count is the whole reason the page exists.** "Delete this source" understates it; "this
suspends 41 cards" is the sentence the reader needs (`09` §4.11), so it is the 46px statement and not
a line in the body. **When the count is zero the statement says so** — `No cards will be suspended.`
— because 41 and 0 are the difference between a pause and a click, and a page that reads identically
in both cases is a page that has stopped informing anyone.

⚠️ **There is no primary control on this page.** The delete submit takes the **quiet affordance**
treatment without its arrow (`--k-raised`, `1px --k-border-control`, `13px 20px`, 17px `--k-ink`);
`Keep it` is a plain accent link. The primary control's `--k-ink-ground` is the loudest treatment in
the system and its job is to be the obvious next thing — and **this page has no action it wants to
encourage.** Giving the loudest face to the irreversible half of a confirmation is how a reader who
arrived by mistake leaves without a *source*.

**Hard deletion has no route in v1** (`09` §4.11, `04` §9.1) and therefore no screen. It is performed
against the database by a person who has read `04` §9.1.

---

## 8. Stats

`/stats`, `noScripts: true`. Shell, start block, then a **940px** column. `S10`, and the screen
`S12`'s export hangs off.

### 8.1 The figure grid

**The *session tally*, parameterised.** `05` §7 draws it as four equal columns; Stats needs five. So
the component takes a column count — five here, four on *Review*'s end screen — and nothing else
about it changes: `8px` apart, a 10px Plex Mono eyebrow at 0.14em in `--k-ink-secondary`, `8px` down
a 38px Newsreader 300 figure in `--k-ink`.

The five, and where each is read from (`09` §4.10, `03` §12):

| Eyebrow | Figure | Read from |
| --- | --- | --- |
| `ACCEPTANCE RATE` | a percentage | `note_vetting.state = 'accepted' AND edited = false` ÷ notes generated |
| `FALSE-ACCEPT RATE` | a percentage | `count(card_flag)` ÷ `count(note_vetting WHERE state='accepted')` |
| `SECONDS PER NOTE` | a median | `note_vetting.seconds_to_vet`, unedited accepts only |
| `TIME TO FIRST REVIEW` | a duration | `source.submitted_at` → the first `review_log` for a *card* from that *source* |
| `NOTES VETTED` | a count | `note_vetting` |

⚠️ ***Time-to-first-review* carries `worker_environment` on the number itself** (`04` §6.1) — a 12px
Plex Mono `--k-ink-secondary` line beneath the figure reading `laptop`. Figures measured against a
laptop are not comparable across ADR 0022's move, and putting it on the row rather than in a
paragraph is what stops a future session averaging across the boundary.

⚠️ **Amended 2026-09-12 by #14: the criterion is per *source* and this table gives it one slot, and
nothing here said which scalar.** It is the **median across *sources***, and a *source* whose *cards*
have never been reviewed is **excluded** rather than counted as a long one —
[ADR 0057](adr/0057-time-to-first-review-is-a-median-over-the-sources-that-have-one.md). A mean would
let one *source* pasted on a Friday and studied on Wednesday push the figure past the criterion's own
ten-minute boundary while every *source* the reader actually used came back in eight minutes. ⚠️ The
line beneath the figure carries **every** environment behind the measured durations, joined with
`·` — two names mean the figure already spans ADR 0022's move, which is the state the line exists to
make visible.

### 8.2 The suppressed state — under twenty vetted *notes*

PRD §4 and `S10`: raw counts, ratios suppressed, **and a line saying why**. This is the state Stats is
in on day one, and it is why ADR 0031 did not make Stats the landing route.

**The ratio columns keep their eyebrows and their 38px slot, and show their raw pair instead of a
percentage** — `4 / 17`, in the same 38px Newsreader 300. Not hidden, not dashed out: the reader can
see the numbers accumulating toward the threshold. Beneath the grid, `20px` down, a 13px Newsreader
italic aside in `--k-ink-secondary`: `Ratios appear at twenty vetted notes. A rate over seventeen is
noise.`

⚠️ **Amended 2026-09-12 by #14: what the pair is, for all four.** Two of the four columns are
percentages with an obvious numerator and denominator; the other two are **medians**, and a median
has no pair. The rule is `have / possible` — **how much evidence stands behind the figure being
withheld** ([ADR 0058](adr/0058-a-suppressed-ratio-shows-the-evidence-behind-it-as-a-pair.md)):

| Column | `have` | `possible` |
| --- | --- | --- |
| `ACCEPTANCE RATE` | unedited accepts | *notes generated* |
| `FALSE-ACCEPT RATE` | flags | accepted *notes* |
| `SECONDS PER NOTE` | unedited accepts carrying a `seconds_to_vet` stamp | unedited accepts |
| `TIME TO FIRST REVIEW` | *sources* with a first *review* | *sources* ingested |

For the two percentages this is exactly the `4 / 17` above. For the two medians it answers the
question the suppressed state is for — *how thin is this* — and **it is also what makes ADR 0057's
exclusion visible**: a median over the two *sources* the reader studied, out of five they pasted,
reads `2 / 5`.

⚠️ `NOTES VETTED` is **never** suppressed. It is the count the boundary is measured on, and how the
reader watches it approach twenty.

### 8.3 The ledger

Tokens and cost per *ingestion*, "rows written when they happened rather than metrics scraped from
logs" (`03` §12). 940px, `--k-rule` between rows, `20px` padding, a `--k-rule` above the first row
with the column eyebrows in 10px Plex Mono 0.14em `--k-ink-secondary`.

Columns: the *source* title (15px Newsreader `--k-ink`, or `ingestion.source_title` when the *source*
is hard-deleted — ⚠️ **the spend ledger survives a hard delete**, `04` §9) · `model_id` · tokens in
and out · cost · `worker_environment`. Everything but the title is 12px Plex Mono, `--k-ink-value`.

### 8.4 The export

**A plain `<a href="/api/export">`** (`09` §4.12), accent link text, reading `Export everything`,
`32px` below the ledger. With a 13px Newsreader italic aside naming what it contains: *notes*,
*cards*, *grades* and every *scheduling epoch* including superseded ones.

**A link and not a button**, and that is the specification: there is no form, there is no client, and
a link that downloads is the one write-shaped action a `noScripts` *place* can perform with no
mechanism at all. `03` §13.6 makes this the backup, which is why it sits next to the numbers the
reader already checks.

---

## 9. The door and the refusal

`08` §2: six routes, and `/auth` is neither a *place* nor a *mode*. Both screens use the
**empty-state block in a 560px column, left-aligned, never centred** — the system's one way of
presenting a screen with a single thing on it, and these are that.

**Neither carries the shell.** There is nowhere to navigate to before you are in.

### 9.1 `/auth` — the door

Universal rendering, and **the one route that ships JavaScript** (`08` §2), because
`authClient.signIn.social` is a client call.

**Signed out:**

| | |
| --- | --- |
| Mark | **記憶** at 54px Mincho 500 — the "term being judged" slot in `05` §4, and the one screen where the app says its own name in the language it is about |
| Name, `12px` below | `Kioku` at 17px Newsreader 400, `--k-ink-secondary` |
| Body, `20px` below | One 18px line in `--k-ink-secondary` |
| Rule | full-width `--k-rule`, `32px` clearance |
| Control | The full-width primary control: `Continue with Google`, 14px in `--k-ground`. ⚠️ **Key hint slot empty** — there is no key |

**Loading** — after the press, before Google's redirect. **The label changes to `Signing in…` and a
second press is ignored. Nothing greys out** (ADR 0035: nothing is disabled): the redirect is
imminent, and graying a control the reader is looking at teaches them the press failed.

**Signed in** — the same column, and `08` §2 puts sign-out here for the reason the door ships
JavaScript at all. Statement: the signed-in email at 24px Newsreader 400. Body: one line. Control:
`Sign out`.

### 9.2 `/auth/refused` — where the empty space is the requirement ⚠️

`noScripts: true`. `08` §2.1: **no sign-in button, no retry, no support link.** `S1` says there is no
path to create an account from inside the app, and the refusal page is inside the app.

| | |
| --- | --- |
| Statement, 46px Newsreader 300 | `This account is not invited.` |
| Body, 18px `--k-ink-secondary` | One sentence. Nothing that reads as a next step |
| After it | **Nothing. And no rule.** |

⚠️ **The absent rule is the specification, not an omission.** In the empty-state block the
`--k-rule` is what separates the statement from what the state *offers* (`05` §7). This state offers
nothing, so a rule would draw a line and then point at empty ground — which reads as a component that
failed to load, on the one screen in the application where a dead end is the feature.

⚠️ **The reader cannot get back to `/auth` from here by clicking. They type the URL** (`09` §4.1).
That is deliberate, and it is why there is no link of any kind on this page — including a logo that
happens to be one.

---

## 10. The phone

[ADR 0026](adr/0026-review-is-the-only-screen-that-gets-a-phone-layout.md): ***Review* alone gets a
phone layout.** The three *places* reflow with nothing bespoke. *Vet* refuses.

### 10.1 Breakpoints, and the one token that becomes responsive

The card is 760px and the gutters are 44px each, so the desktop layout survives to **848px**.

| Width | Behaviour |
| --- | --- |
| ≥ 848px | As drawn |
| 720–848px | The card takes `calc(100% − 88px)`. Everything else unchanged |
| < 720px | The phone layout below |

⚠️ **`--k-gutter` drops from 44px to 20px below 720px**, which makes it the one token in the system
that varies — `05` §5 calls it "horizontal padding on every screen, without exception". 44px of a
375px viewport is 23% of the width spent on margin. 20px is a scale step.

### 10.2 *Review* on a phone

| Element | Desktop | Phone |
| --- | --- | --- |
| Header | 64px | **56px** |
| Rail | 620px, a counter at each end | **Ticks only, full content width.** The counters go |
| Done cluster | `Esc` cap + `Done` | **The label alone**, 14px `--k-ink`, 44 × 44 hit area |
| Card | 760px, `min-height: 527px`, padding `54px 64px 46px` | Full content width, `min-height: 60vh`, padding **`32px 20px 28px`** |
| Prompt (front) | 104px Mincho 400 | **54px Mincho 400** |
| *Reading* | 25px Mincho | **18px Mincho** |
| *Meaning* (back) | 36px Newsreader **300** | **24px Newsreader 400** |
| Example | 22px Mincho / 1.65 | **17px Mincho / 1.65** |
| Example gloss | 16px Newsreader italic | **14px** |
| Footer | 104px | **72px** |

Three of those need their reason on the record:

⚠️ **The rail loses its counters, not its ticks.** At 335px of content width minus the Done cluster
there is no room for both, and the counter is the redundant half — the ticks already say where you
are. At the default *session* size of twenty, each tick is about 10px wide and 6px tall, which is
legible. At 200 they thin toward a hairline; **the rail degrades into a bar rather than breaking**,
and that is stated rather than patched, because 200 on a phone is the reader's own choice.

⚠️ **The Done cluster drops its cap on the phone.** A phone has no `Esc` — which is the entire reason
ADR 0026 gave every *mode* a visible Done — so a cap reading `Esc` would name a key that does not
exist. The label alone is the control.

⚠️ **The prompt lands on 54px, which is the *Vet* *term*'s value, and that is not a collision.**
`05` §4 says the three display sizes are three different jobs — a statement, a term being judged, a
term being recalled — and warns that nothing sits between 46 and 54 or between 54 and 104. On a
phone, 104px cannot hold a four-character term inside 295px of card, and the next value down the
system already owns is 54. The two never co-occur: *Vet* has no phone layout at all. **The weight
distinguishes them anyway** — 400 for recall, 500 for judgement, as `05` §4 already has it.

And **24px is where the *meaning* stops being display type.** `05` §4 says English display type is
weight 300 above 24px; at 24px the ramp's own entry is Newsreader **400**. The phone crosses that
boundary, so the weight changes with it rather than the size alone.

### 10.3 Grade by swipe — refused ⚠️

[ADR 0036](adr/0036-grade-by-swipe-is-refused-because-it-could-only-ever-be-additive.md). ADR 0026
deferred it here by name, "against a drawn screen", and called it genuinely good and not needed to
ship. **The screen is drawn above, so it is answered: no swipe in v1.**

The short form, because the ADR carries the argument: **SC 2.5.1 Pointer Gestures is Level A** and
**SC 2.5.7 Dragging Movements is Level AA** (verification §13.2), so a path-based or dragging gesture
owes a single-pointer equivalent — which is the four controls it was meant to replace. Swipe could
only ever have been additive. And a *grade* is arithmetic that cannot be undone (ADR 0016, `03`
§2.4): `Z` is *Vet*'s key, and `X` is a flag, not a correction.

### 10.4 The four controls on a phone, measured

At 375px: content width `375 − 40 = 335px`. Four controls with three `12px` gaps →
`(335 − 36) / 4 = 74.75px` each. Height is `9px` padding above and below a 12px digit, `3px`, and a
14px label line → **≈ 48px**.

| Floor | Requirement | This |
| --- | --- | --- |
| SC 2.5.8 Target Size (Minimum), **Level AA** | 24 × 24 CSS px | **74 × 48** ✓ |
| SC 2.5.5 Target Size (Enhanced), **Level AAA** | 44 × 44 CSS px | **74 × 48** ✓ |

ADR 0024 committed the system to AA, so the first row is the obligation and the second is free
(verification §13.3). `Forgot` at 14px Newsreader is roughly 44px wide and fits in 74px with room —
which is one more reason ADR 0034's word for grade 1 is six characters and not nine.

### 10.5 *Vet* on a phone — the refusal

ADR 0026 refuses to degrade *Vet* into a tappable version of itself: `S3` measures one keystroke per
*note*, and a tap-target version "would be the version the *acceptance rate* and *seconds-per-note*
numbers get measured against."

So `/vet` below 720px renders the chrome bar — `VET`, and the Done cluster in its phone form — and
the empty-state block at full content width:

| | |
| --- | --- |
| Statement, 46px Newsreader 300 | `Vetting needs a keyboard.` |
| Body, 18px `--k-ink-secondary` | One sentence, and that *Review* works here |
| Rule + after | Nothing. Done is in the bar, and it goes back to the *place* the reader started from |

### 10.6 The three *places* on a phone

Nothing bespoke (ADR 0026). They reflow: the 940px and 760px columns become full content width, the
nav and the door stay on one 56px row, and **the start block's two controls stack** rather than
sitting side by side, at `12px` apart. Everything in them is a link, a form field or a line of text,
and all three already clear 24 × 24 at their desktop padding.

---

## 11. What this hands forward

- **`11-testing-plan.md`** — four this document generates, on top of `04` §14, `08` §11 and `09` §9:
  the Done control renders as a real `<a>` and leaves a *place* with no Vue application attached
  (the `curl`-and-grep that also covers `noScripts`); the *Vet* run-end confirmation appears with one
  rejection and does not appear with none; the delete confirmation's count matches the number of
  *cards* the `POST` actually suspends; and ⚠️ **the key handlers are bound to the mode container and
  not to `document`**, which is a Level A conformance test and not a style preference
  (verification §13.4).
- **`05-design-system.md`** — three edits it should absorb when it is next touched, all recorded
  above rather than applied: `--k-key-face` and `--k-ink-ground` gain the hover and active roles
  (§2.1); `05` §5's `14 → 12` and the card's `30 → 28` (§2.3); and §8's three open items — the grade
  labels, the Done geometry and the *Review* phone layout — are closed by §5.5, §4.3/§5.2 and §10.
- **Phase 6** — the *session tally* is one component with a column count, not two; the empty-state
  block is one component used by nine screens including the door, the refusal and both confirmations,
  and ⚠️ **the refusal's missing rule is a variant of it, not a special case to hard-code** (§9.2).
- **Nothing for Phase 5 or a later document.** Every item `05` §8 and §10 held open, and every item
  `09` §9 handed here, is answered above.

**Nothing here depends on a Vercel-only feature.** Nine components, no runtime, no service — so
ADR 0022's move stays a Nitro preset change plus a `pg_dump`.
