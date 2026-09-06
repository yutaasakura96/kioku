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

Seven greys, ordered. The contrast column is measured against `--k-ground` (`#f7f3ec`); on
`--k-raised` every figure is ~0.3 higher.

| Token | Value | Contrast | Role as drawn |
| --- | --- | --- | --- |
| `--k-ink` | `#1d1a16` | 15.67 | The *term*, the *meaning*, every screen-level statement. |
| `--k-ink-quiet` | `#4c463d` | 8.44 | The Japanese example inside the *Review* card — one step back from the answer without leaving it. |
| `--k-ink-value` | `#6d6558` | 5.20 | A fact's value: part of speech, an unselected grade digit. |
| `--k-ink-secondary` | `#8b8175` | 3.46 | The *reading*, the English gloss, empty-state body. |
| `--k-ink-tertiary` | `#97907f` | 2.87 | Counters, the word "pending", the gloss inside the card. |
| `--k-ink-aside` | `#a1978a` | 2.60 | Italic asides — "the model wrote this", the flag explanation. |
| `--k-ink-label` | `#ada393` | 2.25 | Eyebrow labels, and the hollow *level* marker's border. |

**Four of these fail WCAG AA for body text.** `--k-ink-secondary` and below are all under 4.5:1, and
none of the type they carry is large enough to qualify for the 3:1 large-text exception (which needs
24px regular; the biggest is 18px). This is recorded, not fixed — the palette is a settled decision
and repairing it is a change to the visual direction, not an extraction. It is now an open question;
see §10.

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

Values in use, by frequency: `4 5 7 8 9 10 12 14 16 18 20 26 28 30 32 34 38 40 44`. There is no
strict 4pt or 8pt grid — the drawing is hand-set. The intervals that recur and carry meaning:

| Gap | Meaning |
| --- | --- |
| `8–14px` | Inside one thing — a label and its value, a key cap and its name |
| `18px` | Between a body block and what introduced it |
| `28–34px` | Between two facts that are peers |
| `44px` | Between two *judgement fields* — the largest gap in the reading column, and the one that makes the zoning read |
| `52px` | From the *facts strip*'s lower rule down to the first *judgement field* |

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
count — figure in `--k-ink`, the word "pending" in `--k-ink-tertiary`, both 12px mono — a `·`
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
| Model estimate | Transparent, `1px solid --k-ink-label` |

The *level claims* sit inline beside it at 11px mono — the attributing authority in
`--k-ink-value`, dissenting ones in `--k-ink-label`, `·` between. **Never behind a hover.**

### Judgement field (*Vet*)

An eyebrow row — 10px mono accent label at 0.18em, then a 13px italic `--k-ink-aside` note on where
the value came from — a `14px` gap, then the value at reading size. Fields are `44px` apart.

### Key cap

| State | Face | Border | Ink | Padding |
| --- | --- | --- | --- | --- |
| Primary (`A`) | `--k-ink-ground` | none | `--k-ground` | `5px 10px` |
| Secondary (`E`, `R`) | `--k-key-face` | `1px --k-border-control` | `--k-ink-value` | `5px 10px` |
| Available-but-aside (`X`) | none | `1px dashed --k-border-dashed` | `--k-ink-tertiary` | `3px 8px` |

12px mono, `--k-radius-key`. The label beside it is 15px: `--k-ink` when the key is primary,
`--k-ink-secondary` otherwise.

### Progress rail (*Review*)

620px wide. A 12px mono counter at each end in `--k-ink-tertiary`, `18px` from the bar. Between
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

Four equal columns, `8px` apart. A 10px mono eyebrow at 0.14em in `--k-ink-label`, `8px` down a 38px
Newsreader 300 figure in `--k-ink`.

## 8. Not extracted, deliberately

These appear on the canvas and are **not** part of this system. Extracting them would turn a
placeholder into a decision.

- **The grade labels** — `Again / Hard / Good / Easy`. Drawn as a placeholder. The grade set follows
  the scheduler, which is §4.12, which is Phase 4. The control's *geometry and states* above are
  real; its labels and its count are not.
- **Key assignments** — `A` / `E` / `R`; `space`, `1`–`4`, `X`. Drawn, not decided. The key cap
  component is real; which key goes in it is open.
- **Navigation.** Nothing on the canvas moves between screens. *Vet*'s empty state points at Ingest
  as plain text because there was nothing else to point with. This is a PRD gap and it blocks
  `10-screen-specifications.md`.
- **The phone layout.** Never drawn. The *facts strip* and the four grade controls are the two things
  that cannot survive the narrowing unchanged.

### States the canvas does not contain

No artboard shows **hover, focus, active, disabled, loading, or error** — for any component. The one
exception is the link hover colour in §2.

This matters more here than it usually would. *Vet* and *Review* are **keyboard-driven by design** —
one keystroke per *note* is a measured criterion — and a keyboard-driven interface with no focus
treatment is not navigable. **A focus state is required before either screen is implemented**, and
it is not in this document because it is not on the canvas.

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

- **Four ink values fail WCAG AA against the ground** (§2). `--k-ink-secondary` at 3.46 carries the
  *reading* and every empty-state body; `--k-ink-label` at 2.25 carries every eyebrow. Raising them
  changes the settled visual direction, so it is a decision, not a correction — and it wants making
  before implementation rather than after.
- **No focus state exists** (§8). Blocking for two keyboard-driven screens.
- **The spacing scale is hand-set, not systematic** (§5). Nineteen distinct gap values. Worth
  deciding whether to regularise before the three undrawn screens are built against it, because they
  are what will multiply it.
