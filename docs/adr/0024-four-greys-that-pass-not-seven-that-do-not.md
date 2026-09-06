# Four greys that pass, not seven that do not

**The ink ramp collapses from seven greys to four, all of which meet WCAG AA at 4.5:1:
`#1d1a16` 15.67 · `#4c463d` 8.44 · `#60584d` 6.33 · `#776d5f` 4.59.** `--k-ink-tertiary`,
`--k-ink-aside` and `--k-ink-label` are retired; `--k-ink-value` and `--k-ink-secondary` move.

This closes the accessibility gap `05-design-system.md` §2 recorded and §10 carried.

## Seven passing greys is not available, and that is measured

There are **3.6 lightness points** between `--k-ink-value` as drawn and the 4.5:1 floor. Seven
values distributed across that remaining range are not seven distinguishable greys — they are one
grey with rounding error. The choice was never "fix the four" but "keep seven bands or keep AA",
and only one of those two is a legal interface.

None of the failing type qualifies for the 3:1 large-text exception either. That needs 24px regular;
the largest type carrying `--k-ink-secondary` or below is 18px.

## Four bands is what the drawing actually uses

The seven were extracted from the canvas, and the canvas was hand-drawn — so the count reflects how
many times a grey was picked, not how many distinctions the design makes. Collapsed, the real roles
are: the statement, the step behind it, a fact's value, and everything ancillary. That is four.

## Alternatives considered

**Ship the four failures, recorded** — rejected. The system already names one keyboard-driven screen
whose entire hierarchy is carried by grey; shipping unreadable eyebrows is not a documentation
problem.

**Raise only the failing four and keep seven bands** — rejected on the measurement above. It
produces four greys inside 3.6 lightness points, which is the same as three greys plus noise.

**Enlarge the type to reach the large-text exception** — rejected. It changes the type ramp, which
is a settled part of the visual direction, to avoid changing the ink ramp, which is not.

## What it costs

**Every eyebrow moves from 2.25:1 to 4.59:1**, and *Vet* will read heavier than the artboard does.
That is the honest price: the screen was drawn quiet, and part of the quiet was illegibility. The
hollow *provenance marker*'s border also moves with `--k-ink-label`, so the one honesty bit on the
screen gets more visible rather than less — which is the right direction for it specifically.

## Revisit if

The four-band ramp proves too coarse for a screen not yet drawn — in which case the fifth band is
added *above* `#776d5f`, never below it. The floor is not negotiable again.
