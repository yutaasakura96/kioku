# Kioku

Kioku builds spaced-repetition flashcard decks automatically from bulk source material and is also
the app they are studied in.

## Language

**Acceptance rate**:
Cards accepted with no edit ÷ cards generated. The project's primary health metric — a low rate
means the generation pipeline is failing regardless of how good the app feels.
_Avoid_: accuracy, quality score, hit rate

**Time-to-first-review**:
Minutes from submitting a source to answering the first card generated from it. Above roughly ten
minutes, Kioku is a different chore rather than a replacement for hand-authoring.
_Avoid_: ingestion time, latency, turnaround
