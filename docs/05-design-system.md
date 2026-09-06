# Design system

Extracted from the Phase 2 canvas — https://claude.ai/code/artifact/7a631237-82be-48a3-b65e-9b4ef46b8157
— on 2026-09-06, by reading the six built artboards' source back from the published page. Every
value here was measured off a drawing. Nothing was reconstructed from memory, and nothing was
invented to fill a gap.

**The canvas is the reference; this file is the system.** Where the two disagree, this file wins and
says why — see §9. Where the canvas is silent, this file says it is silent rather than guessing —
see §8.

Scope is *Vet* and *Review*, the two screens Phase 2 explored. Ingest, Sources and Stats were never
drawn. They inherit §§1–6 and will need their own components.

## 1. Surfaces

Two grounds, and they are not interchangeable.

| Token | Value | What sits on it |
| --- | --- | --- |
| `--k-ground` | `#f7f3ec` | The whole app. Every screen's outermost fill. |
| `--k-raised` | `#fffdf9` | The *Review* card, and any control that must read as liftable — the Ingest affordance in *Vet*'s empty state, the unselected grade controls. |
| `--k-ink-ground` | `#1d1a16` | Inverted surfaces: the primary control, the selected grade control, a filled progress tick. |
| `--k-key-face` | `#efe8de` | The unpressed key cap in *Vet*'s footer legend. |

`--k-raised` is 8/255 lighter than `--k-ground` — a lift you feel rather than see. It is doing its
work through the shadow (§6), not through the fill.

## 2. Ink

Four greys, ordered, **all of them meeting WCAG AA at 4.5:1**. The contrast column is measured
against `--k-ground` (`#f7f3ec`); on `--k-raised` every figure is ~0.3 higher.

| Token | Value | Contrast | Role |
| --- | --- | --- | --- |
| `--k-ink` | `#1d1a16` | 15.67 | The *term*, the *meaning*, every screen-level statement. |
| `--k-ink-quiet` | `#4c463d` | 8.44 | The Japanese example inside the *Review* card — one step back from the answer without leaving it. |
| `--k-ink-value` | `#60584d` | 6.33 | A fact's value: part of speech, an unselected grade digit. |
| `--k-ink-secondary` | `#776d5f` | 4.59 | Everything ancillary — the *reading*, the English gloss, empty-state body, counters, the word "pending", italic asides, eyebrow labels, and the hollow *level* marker's border. |

The canvas drew seven. **`--k-ink-tertiary`, `--k-ink-aside` and `--k-ink-label` are retired**, and
`--k-ink-value` and `--k-ink-secondary` both moved — see
[ADR 0024](adr/0024-four-greys-that-pass-not-seven-that-do-not.md). The measurement that forced it:
there are **3.6 lightness points** between `--k-ink-value` as drawn and the 4.5:1 floor, so seven
greys cannot all pass and remain seven distinguishable greys. None of the failing type qualified for
the 3:1 large-text exception either — that needs 24px regular, and the biggest was 18px.

**Every eyebrow therefore moves from 2.25:1 to 4.59:1, and *Vet* reads heavier than the artboard
does.** That is the accepted cost, not a drawing error to be corrected back.

### Accent

| Token | Value | Contrast | Role as drawn |
| --- | --- | --- | --- |
| `--k-accent` | `#b23a26` | 5.38 | The screen label `VET`, the two *judgement field* eyebrows, the current progress tick, the 完 mark, link text. |
| `--k-accent-hover` | `#8e2c1c` | 7.65 | Link hover. The only hover state anywhere on the canvas. |
| `--k-on-ink` | `#f7f3ec` | 15.67 on ink | Label text on an inverted surface. |
| `--k-on-ink-quiet` | `#cdbfa9` | 9.59 on ink | The key hint inside an inverted control — `space`, a selected grade digit. Also the completed progress tick on the app ground. |

The accent is spent on exactly two things: **where you are** (screen label, current tick, session
complete) and **what costs you the decision** (the *meaning* and *example* eyebrows). It is never
decoration and never a state.

## 3. Rules

Two line tokens, split by the surface they sit on — not by whether they are chrome or content.

| Token | Value | Contrast on its ground | Use |
| --- | --- | --- | --- |
| `--k-rule` | `#e2d9cd` | 1.26 on `--k-ground` | Every 1px line on the app ground: chrome borders, the *facts strip*'s two rules, every divider in an empty or end state. |
| `--k-rule-raised` | `#ece3d7` | 1.25 on `--k-raised` | The *Review* card's own border, and the rule inside it. |

The two values are tuned to land on the same perceived weight on their different grounds — 1.26
against 1.25. That is the reason they are two tokens, and it is the only reason.

Related fills, which are not rules:

| Token | Value | Use |
| --- | --- | --- |
| `--k-tick-empty` | `#e6ddd2` | An ungraded progress tick. |
| `--k-border-control` | `#ddd3c6` | The border of a resting control — key cap, unselected grade, the Ingest affordance. |
| `--k-border-dashed` | `#ccc1b1` | The flag key cap's dashed border. The only dashed line in the system; it means *available but not part of the main path*. |
| `--k-dot` | `#ddd3c6` | The `·` separating inline facts. |

## 4. Type

Three families, all Google Fonts. **Whether the app ships them from Google is a Phase 4 question**,
not a design-system one; this file records only that these are the faces.

| Role | Family | Weights drawn |
| --- | --- | --- |
| Japanese | **Shippori Mincho** | 400, 500, 600 |
| English | **Newsreader** | 300, 400, 500, 400 italic |
| Data and keys | **IBM Plex Mono** | 400, 500 |

Fallbacks as drawn: `'Newsreader', Georgia, serif` for the body; `'Shippori Mincho', serif`;
`'IBM Plex Mono', monospace`.

The split is load-bearing: **Mincho carries every Japanese glyph, Newsreader every English one, and
Plex Mono everything that is a number, a key, or a label rather than language.** A screen never
mixes a family into a role that is not its own.

### Ramp

| px | Family / weight | Line height | Tracking | Where |
| --- | --- | --- | --- | --- |
| 104 | Mincho 400 | 1.05 | 0.04em | *Review* card front — the prompt |
| 54 | Mincho 500 | 1 | — | *Vet* — the *term* |
| 46 | Newsreader 300 | 1.15 | -0.01em | Screen-level statement: "Nothing to vet." / "Session complete." / "Nothing due." |
| 40 | Newsreader 300 | 1.2 | -0.01em | *Vet* — the *meaning*. The field that costs the decision. |
| 38 | Newsreader 300 | 1 | — | Session tally figures |
| 36 | Newsreader 300 | 1.25 | -0.01em | *Review* card back — the *meaning* |
| 32 | Mincho 600 | 1 | — | The 完 mark |
| 27 | Mincho 400 | 1.6 | — | *Vet* — example sentence |
| 25 | Mincho 400 | — | — | *Review* card — the *reading* |
| 24 | Newsreader 400 | 1.3 | — | A single datum given weight — "Tomorrow, 08:40" |
| 22 | Mincho 400 | 1 / 1.65 | — | *Vet* *reading* (lh 1); *Review* card example (lh 1.65) |
| 18 | Newsreader 400 | 1.55 | — | Empty-state body |
| 17 | Newsreader 400 | 1.5 | — | Example gloss; primary control label; session subtitle |
| 16 | Newsreader 400 italic | 1.5 | — | *Review* card example gloss |
| 15 | Newsreader 400 | — | — | Fact values; key legend labels |
| 14 | Newsreader 400 | — | — | Control labels; secondary detail |
| 13 | Newsreader 400 italic | — | — | Asides |
| 12 | Plex Mono 400 | — | — | Counters, key caps, grade digits |
| 11 | Plex Mono 400 | — | — | Screen label; *level claims*; flag key cap |
| 10 | Plex Mono 400 | — | — | Eyebrow labels |

Two things the ramp encodes:

- **English display type is weight 300, always, with -0.01em tracking.** Every English size above
  24px is light and slightly tightened. Japanese display type is never lighter than 400 — Mincho at
  300 does not exist and would not hold at 104px anyway.
- **Nothing between 46px and 54px, or between 54px and 104px.** The three display sizes are a
  *statement*, a *term being judged*, and a *term being recalled*. They are different jobs, not
  steps on a scale.

### Caps tracking

Three values, by how isolated the label is:

| Tracking | Size | Use |
| --- | --- | --- |
| `0.22em` | 11px | The screen label `VET` — alone in the corner |
| `0.18em` | 10px | *Judgement field* eyebrows — `MEANING`, `EXAMPLE SENTENCE`. Accent-coloured. |
| `0.14em` | 10px | Muted eyebrows — `POS`, `LEVEL`, `AGAIN`, `NEXT CARD DUE` |

## 5. Layout

The frame is **1440 × 900**. Every screen is a fixed-height column: chrome, a growing middle, chrome.

| Token | Value | Note |
| --- | --- | --- |
| `--k-gutter` | `44px` | Horizontal padding on every screen, without exception. |

### Measures

| Width | Used by |
| --- | --- |
| `940px` | *Vet*'s reading column — *term*, *facts strip*, *judgement fields*, and the footer legend that aligns to them |
| `760px` | The *Review* card and the grade controls beneath it, which share its exact width |
| `620px` | The progress rail; the session-end column |
| `560px` | Empty-state columns — *Vet* empty, nothing due |

The narrowing is deliberate: 940 to read and judge, 760 to recall, 620 to be told something, 560
when there is nothing to do.

### Chrome

| Screen | Header | Footer |
| --- | --- | --- |
| *Vet* | `56px`, bottom rule | `68px`, top rule |
| *Review* (front, back) | `64px`, no rule — the progress rail is the header | `104px`, no rule |
| Session end | `64px` progress rail | `64px`, empty |
| Nothing due | `64px`, empty | `64px`, empty |

**Review carries no screen label in any of its four states** — a decision from Phase 2, recorded in
the decision log. Its header is the rail or nothing at all.

### Spacing

**Ten steps, on a 4pt grid: `4 8 12 16 20 28 32 40 44 52`.** The canvas was hand-set and used
nineteen distinct values; these are those nineteen snapped, with **no value moving more than 2px**.
The meanings below are the canvas's own and survive the snap intact.

| Gap | Meaning |
| --- | --- |
| `8–12px` | Inside one thing — a label and its value, a key cap and its name |
| `20px` | Between a body block and what introduced it |
| `28–32px` | Between two facts that are peers |
| `44px` | Between two *judgement fields* — the largest gap in the reading column, and the one that makes the zoning read |
| `52px` | From the *facts strip*'s lower rule down to the first *judgement field* |

Regularised before the three undrawn screens were built against the irregular set, which is what
would have multiplied it. New values are added to the scale, never set by hand beside it.

The snap, for the record: `5 → 4`, `7 → 8`, `9 → 8`, `18 → 20`, `26 → 28`, `34 → 32`, `38 → 40`.
**Three are genuinely ambiguous — `10`, `14` and `30` each sit exactly 2px from two steps** — and
they are not resolved here, because each wants deciding against the screen it appears on rather than
globally. `10-screen-specifications.md` owes those three. Component dimensions in §7 that are neither
gaps nor on the scale (row heights, type sizes, control padding) were not snapped and are not in
scope for this scale.

## 6. Geometry

| Token | Value | Use |
| --- | --- | --- |
| `--k-radius-card` | `3px` | The *Review* card |
| `--k-radius-control` | `5px` | Buttons, grade controls, the Ingest affordance |
| `--k-radius-key` | `4px` | Key caps, and the 完 mark's frame |
| `--k-radius-tick` | `3px` | Progress ticks (a 6px bar, so effectively a pill end) |

Radius runs *opposite* to size: the 760px card is the sharpest thing on screen at 3px, and the
smallest elements are the roundest. Large paper is cut, not moulded.

### Elevation

One shadow, on one element:

```
--k-shadow-card: 0 1px 0 #e8ded1, 0 18px 44px rgba(70, 52, 30, 0.07);
```

A hairline directly beneath the card, then a wide, very faint drop. The tint is warm brown
(`70,52,30`) rather than black — a neutral shadow reads grey-blue against this ground. **Nothing
else in the system is elevated.**

## 7. Components

### Chrome bar (*Vet*)

56px tall, `--k-gutter` padding, `--k-rule` bottom border. Left: the screen label in accent, 11px
mono, 0.22em; then the *source* name at 14px in Mincho, `--k-ink-secondary`. Right: the pending
count — figure in `--k-ink`, the word "pending" in `--k-ink-secondary`, both 12px mono — a `·`
separator, then the *note* index.

### Facts strip (*Vet*)

The mechanism the direction was chosen for. A `--k-rule` above, a 46px row, a `--k-rule` below.
Inside, left to right: the `POS` eyebrow and its value, a **1px × 16px vertical `--k-rule`**, then
the `LEVEL` eyebrow, the marker, the level, and the *level claims*. Padding is `30px` on each side of
the divider.

Everything above and inside this strip is context. Everything below it is what you are judging.

### Provenance marker

A **7 × 7px square**, and the one visible honesty bit ADR 0005 requires.

| State | Treatment |
| --- | --- |
| Named authority | Filled `--k-ink`, no border |
| Model estimate | Transparent, `1px solid --k-ink-secondary` |

The *level claims* sit inline beside it at 11px mono — the attributing authority in
`--k-ink-value`, dissenting ones in `--k-ink-secondary`, `·` between. **Never behind a hover.**

### Judgement field (*Vet*)

An eyebrow row — 10px mono accent label at 0.18em, then a 13px italic `--k-ink-secondary` note on where
the value came from — a `14px` gap, then the value at reading size. Fields are `44px` apart.

### Key cap

| State | Face | Border | Ink | Padding |
| --- | --- | --- | --- | --- |
| Primary (`space`) | `--k-ink-ground` | none | `--k-ground` | `5px 10px` |
| Secondary (`E`, `R`, `Z`) | `--k-key-face` | `1px --k-border-control` | `--k-ink-value` | `5px 10px` |
| Available-but-aside (`X`) | none | `1px dashed --k-border-dashed` | `--k-ink-secondary` | `3px 8px` |

The primary cap holds `space`, not a letter — [ADR 0023](adr/0023-space-is-the-forward-action-and-z-is-the-confirm.md)
makes `space` the forward action in both modes. It is therefore the widest cap in the legend rather
than one square among equals.

12px mono, `--k-radius-key`. The label beside it is 15px: `--k-ink` when the key is primary,
`--k-ink-secondary` otherwise.

### Progress rail (*Review*)

620px wide. A 12px mono counter at each end in `--k-ink-secondary`, `20px` from the bar. Between
them, one `flex-grow: 1` tick per *card* in the *session*, `6px` tall, `4px` apart.

| Tick | Fill |
| --- | --- |
| Graded | `--k-on-ink-quiet` (`#cdbfa9`) |
| Current | `--k-accent` |
| Not reached | `--k-tick-empty` |
| Session complete | All ticks `--k-ink-ground`, and the right-hand counter turns `--k-ink` |

The rail is the only progress indicator in the app and it doubles as *Review*'s header.

### Card (*Review*)

760px wide, `min-height: 527px`, `--k-raised`, `1px solid --k-rule-raised`, `--k-radius-card`,
`--k-shadow-card`. Padding `54px 64px 46px` — asymmetric, more at the top than the bottom.

Front: the *term* alone, centred both ways.
Back: *term*, *reading* `16px` below, a full-width `--k-rule-raised` line at `38px / 34px`, the
*meaning*, the example pair `30px` down, and the fact row `40px` below that.

### Primary control

Full width of its column, `--k-ink-ground` face and border, `--k-radius-control`, `9px` vertical
padding. Inside, centred with a `12px` gap: the key hint in 12px mono `--k-on-ink-quiet`, then the
label at 14px in `--k-ground`.

The standalone variant (session end's "Start another session") is inline rather than full width,
`13px 24px` padding, `14px` gap, label at 17px.

### Grade control

Four controls in a row, `12px` apart, spanning the card's 760px. Each is a stacked pair — digit
above, label below, `3px` between — with `9px` vertical padding and `--k-radius-control`.

| State | Face | Border | Digit | Label |
| --- | --- | --- | --- | --- |
| Resting | `--k-raised` | `1px --k-border-control` | `--k-ink-value` | `--k-ink-secondary` |
| Selected | `--k-ink-ground` | `1px --k-ink-ground` | `--k-on-ink-quiet` | `--k-ground` |

**The four labels themselves are not part of this system.** They are a placeholder pending the
scheduler; see §8.

### Empty-state block

Left-aligned in a 560px column, never centred. A 46px statement, `18px` down an 18px body in
`--k-ink-secondary`, then a full-width `--k-rule` with `32–34px` clearance, then whatever the state
offers — an affordance, a datum, or nothing.

Where an empty state offers an action it is a **quiet** affordance: `--k-raised` face,
`1px --k-border-control`, `--k-radius-control`, `13px 20px`, a 17px label in `--k-ink` and an accent
`→`. It is not the primary control — nothing here is urgent.

### Session tally

Four equal columns, `8px` apart. A 10px mono eyebrow at 0.14em in `--k-ink-secondary`, `8px` down a 38px
Newsreader 300 figure in `--k-ink`.

## 8. Not extracted, deliberately

These appear on the canvas and are **not** part of this system. Extracting them would turn a
placeholder into a decision.

- **The grade labels** — `Again / Hard / Good / Easy`. Drawn as a placeholder. The *count* is now
  settled at four by [ADR 0016](adr/0016-four-grades-and-no-same-day-relearning.md); the words are
  still a placeholder and belong to `10-screen-specifications.md`. The control's geometry and states
  above are real.
- **The Done control on a *mode*'s header.** Required by
  [ADR 0026](adr/0026-review-is-the-only-screen-that-gets-a-phone-layout.md) on every viewport, and
  never drawn — the canvas's modes have no exit affordance at all. On *Review* it has to share its
  row with the *progress rail*.
- **The phone layout for *Review*.** Scope is decided (ADR 0026: *Review* only); the layout itself is
  undrawn.

Three entries left this list rather than being resolved in it: **key assignments**
([ADR 0023](adr/0023-space-is-the-forward-action-and-z-is-the-confirm.md)), **navigation**
([ADR 0013](adr/0013-three-screens-are-places-and-two-are-modes.md)) and **whether a phone layout
exists at all** (ADR 0026).

### States the canvas does not contain

No artboard shows **hover, focus, active, disabled, loading, or error** — for any component. The one
exception is the link hover colour in §2.

**Focus is now decided anyway**, because it blocked implementation of two keyboard-driven screens
where the other five did not.
[ADR 0025](adr/0025-one-focus-ring-and-the-modes-do-not-draw-it.md):

| Token | Value | Rule |
| --- | --- | --- |
| `--k-focus` | `--k-accent` (`#b23a26`, 5.38) | 2px outline at 2px offset, `:focus-visible` only, never animated |

*Vet* and *Review* hold focus on the mode container and **draw no ring** — focus cannot move within
either screen, so a ring would mark a position that never changes. The single exception is *Vet*'s
edit state, which rings the *judgement field* being edited, because editing is the one moment focus
becomes a real position.

**Hover, active, disabled, loading and error remain undrawn.** They want deciding against a screen
rather than in the abstract, and they belong to `10-screen-specifications.md`.

## 9. Where this file departs from the canvas

Two collapses. Both are recorded in `06-decision-log.md`.

1. **Chrome borders move from `#e6ddd2` to `#e2d9cd`.** The canvas draws rules on the app ground in
   two values that differ by 4/255 — 1.21 versus 1.26 contrast. That is one token hand-set twice, not
   two decisions. `#e2d9cd` survives because it carries the *facts strip*'s rules, which are the
   mechanism the whole direction was chosen for. `#e6ddd2` keeps its other, genuinely separate job as
   the empty progress tick.
2. **One separator dot, not three.** The canvas uses `#c9bfae`, `#d3c9bb` and `#ddd3c6` for the same
   `·` glyph doing the same job in three places. `#ddd3c6` survives, because it is already the
   control-border value and the dot is the lightest of the three roles.

Everything else in this file is the canvas's own value.

## 10. Open

The three items this section carried — the failing ink values, the missing focus state and the
hand-set spacing — were all closed on 2026-09-06 by ADRs 0024, 0025 and 0026, and the sections above
now carry their outcomes. What is left is drawing, not deciding:

- **Five interaction states** — hover, active, disabled, loading, error (§8). Not blocking; they want
  a screen to be decided against.
- **The grade labels**, and **the Done control's geometry** (§8).
- **The *Review* phone layout** (§8). Its scope is settled; its drawing is not.

All three belong to `10-screen-specifications.md`.
