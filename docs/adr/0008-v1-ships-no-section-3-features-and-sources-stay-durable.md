# v1 ships no §3 features, and sources stay durable

None of `docs/01-project-brief.md` §3's ideas are in v1 except the two already falling out of
earlier decisions:
**known-word tracking** is the permanent rejected set from ADR 0006, and **session shaping** is the
prefetch bound from ADR 0007. Both are in at zero marginal cost. Everything else delays the number
that justifies the project (ADR 0001).

## Order after v1

**Load-bearing** — they change whether the app works:

1. **Filtered decks / saved queries** — the only means of controlling *what* is studied.
2. ***i+1* sentence mining** — turns a text dump into a difficulty-ordered queue rather than a pile.
   Depends on known-word tracking, which is already free.
3. **Incremental reading** — the genuine differentiator and the direct answer to "dump a huge
   document"; §3 is right that almost nobody has copied it.

**Fun** — nicer, not workable: multiple study modes (cheap once a second template exists), cloze
(a template type).

## The prerequisite graph is cut

It and *i+1* mining solve nearly the same problem — *don't show me something with too much unknown in
it*. One derives from data already held; the other needs a hand-confirmed edge set proposed by an LLM
and approved pair by pair, forever. That is manual authoring work reintroduced through the back door,
in the app whose premise is removing it. ***i+1* mining is the cheap version of the prerequisite
graph.** Build that; treat the graph as something that may never be needed.

## The v1-affecting consequence

**Incremental reading requires a source to stay alive and re-visitable. Ingestion must not consume a
source and discard it.**

ADR 0003 describes ingestion as a one-shot run. If a source is a transient input, incremental reading
is not a feature added later but a rewrite of the ingestion model. Keeping sources durable and
re-enterable costs approximately nothing now and is expensive to retrofit — which is why a ranking of
v2 features earns its place before the build rather than after it.
