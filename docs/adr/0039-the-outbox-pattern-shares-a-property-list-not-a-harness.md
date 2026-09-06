# The outbox pattern shares a property list, not a harness

**Three places in Kioku implement *write immediately, treat the signal as a hint, let the durable
record decide* — ADR 0007's *grade* outbox, ADR 0015's job table and ADR 0028's worker loop. They get
**one written list of five properties and three separate harnesses**, not one shared harness with
three adapters.**

## The pattern is real, and it is the reason the question gets asked

ADR 0028 names it explicitly: "This is the same shape a third time … `CLAUDE.md` names it as the
pattern worth stealing from `lfca-lab`." When one shape appears three times, the instinct is a
generic tester with three adapters, and that instinct is usually right.

It is wrong here, and the reason is not taste.

## The three run in different processes, different languages and different storage

| | ADR 0007 — the outbox | ADR 0015 — the job table | ADR 0028 — the worker loop |
| --- | --- | --- | --- |
| Runs in | The browser, inside a *mode* | The Nuxt app writing a row | The Python worker |
| Durable record | `localStorage` | Postgres `job` | Postgres `job` |
| The "signal" | A network flush | — | `NOTIFY` |
| Language | TypeScript | TypeScript | **Python** |
| Test tier | `test/nuxt/` and `test/e2e/` | PGlite (ADR 0038) | A real Postgres container (ADR 0038) |

**A shared harness would have to span `localStorage` in a Playwright page and psycopg 3 in a
subprocess.** The adapter layer that made those one interface would be larger than the three tests it
replaced, and it would be a fourth implementation of the pattern — one with no production
counterpart, tested by nothing.

⚠️ **And it would be the thing that breaks silently.** ADR 0038 already refused an approximation of
concurrency for the same reason: a harness that abstracts over the mechanism under test proves the
harness.

## What *is* shared is the list of properties, and it is short

Written once, in `11-testing-plan.md`, and each of the three suites asserts all five in its own
idiom:

1. **The write happens before the acknowledgement.** The interface never waits on the flush (`S8`);
   the `POST` answers before the worker runs (`S2`). Assert the durable record exists at the moment
   the caller was told it did.
2. **Losing the signal costs latency, never data.** Drop the `NOTIFY`, kill the network — the poll
   or the replay still finds the work. This is ADR 0028's central claim and it is falsifiable: the
   test removes the signal entirely and asserts the outcome is unchanged.
3. **Replay is in order, append-only, and never merges** (ADR 0007). Two entries for the same *card*
   both land; the later timestamp wins; no conflict is resolved anywhere.
4. **The durable record decides, not client memory.** `Z`'s target is the highest `vetted_at` in the
   open run and not a client stack (ADR 0033); a stale claim is reclaimed on `heartbeat_at` and not
   on what the previous worker believed (`04` §6.4).
5. **A rejected entry is surfaced, never dropped.** A *grade* stamped in the future or before
   `snapshot_taken_at` is refused **and shown** (`03` §8.2); a 401 flush reports on the end screen
   rather than retrying forever (`08` §5.6, `09` §4.8).

**Five properties, three suites, fifteen tests** — and the list is the thing that gets reviewed when
a fourth instance of the pattern appears.

## ⚠️ The outbox carries two kinds of entry, which is where a shared harness would have been wrong twice

`03` §8.1 was amended on 2026-09-07: the outbox carries *grades* **and** `S9` flags. A flag suspends
a *card*, writes `card_flag` with `prompt_version` and `model_id` denormalised at flag time, sets
`note_vetting.flagged_at` and advances without a *grade* (`04` §7.8, `09` §4.9).

So property 3 — replays in order, never merges — has to hold across **two entry types in one
stream**, and the ordering that matters is a flag landing after a grade for a different card. A
generic harness parameterised on "the entry" would have made the two types one type, which is exactly
the distinction the test exists to protect.

## Alternatives considered

**One harness, three adapters** — rejected above. The adapter for `localStorage`-in-a-browser and
the adapter for psycopg-in-a-subprocess have nothing in common but a name.

**Two harnesses: one for the two Postgres cases, one for the browser** — closer, and genuinely
arguable. ADR 0015's job table and ADR 0028's worker loop are the same table. Rejected because they
are still **different processes in different languages** — the app writes the row, the worker claims
it — and ADR 0038 already puts them in different databases for a reason. What they share is the
schema, and the schema is tested once, on its own.

**No shared list either — just three independent test files** — rejected. That is what produces the
fourth instance of the pattern implemented differently, which is the failure `CLAUDE.md` names this
pattern to prevent. The list costs one section of one document.

## What it costs

**Property 2 is written three times in three languages**, and the three will drift in style even if
they do not drift in meaning. Accepted: three honest tests of the same claim are worth more than one
test of an abstraction that exists only in the test suite.

## Revisit if

A fourth instance of the pattern appears in the **same** process and language as an existing one — at
which point those two share a harness for real reasons, and this ADR's argument does not apply to
them.
