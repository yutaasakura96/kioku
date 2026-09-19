# The review load has a brake: ten new a day, and none at all above fifty due

**Decided 2026-09-16.** New *cards* are introduced at most **10 per day**, and not at all while the
reader owes **50 or more** due *cards*. The day is the reader's local day starting at 04:00. The
backlog is ordered by what is closest to being forgotten rather than by what is latest. Nothing caps
how many due *cards* a reader may answer.

**This is the feature that decides whether the app gets used.** Yuta quit WaniKani over the pile-up,
and an app that produces one is a worse version of the thing he already stopped using.

## What is built, and what is missing

`shared/review/compose.ts` is a pure function over two lists: due *cards* sorted by `due` ascending,
then new *cards* filling the remainder up to `size`. `ts-fsrs` answers one question, when does this
come back, and `03` §8 and verification §1.4 both say queue ordering, new-*card* introduction and
daily caps are the app's job. **So the scheduler has no cap and the composer has no cap, and this was
deliberate on both sides.** The unverified line in the handoff is now verified: there is no limit
anywhere.

What that means today: mint 200 *cards* and every *session* fills with new ones until they run out,
and 200 first reviews become 200 second reviews a few days later, all at once.

## What is decided

**1. Ten new *cards* a day, as a constant and not a knob.** `DAILY_NEW_CARDS = 10`, beside
`DEFAULT_SESSION_SIZE` in `shared/review/compose.ts`, under `11` §8's named-seam rule. A knob here is
a knob for the version of the reader who is feeling keen, and the pile-up is built by that reader for
the one who shows up on Thursday.

**2. No new *cards* at all while 50 or more are due.** Counted over the reader's whole outstanding
due set, not over the *session*. The two limits do different jobs: ten a day is the drip, fifty is
the circuit breaker for a week away from the app.

**3. The count of what was introduced lives on the *session*.** `review_session.new_count`, an
integer written by the transaction that composes the run. The day's allowance is
`10 - sum(new_count)` over the *sessions* composed today.

⚠️ **The obvious alternative is wrong in a way worth writing down.** Counting first *scheduling
epochs* started today (`ordinal = 1`) needs no column, and it counts what was *answered*, because the
first epoch is written by the first *grade* and not by the composition. A reader who composes twenty
new *cards* and answers none has used none of his allowance by that reckoning, and can do it again.
The brake governs what is put in front of the reader, so it counts at composition. An abandoned run
burns its share of the day, which errs toward fewer new *cards* and repairs itself tomorrow.

**4. The day starts at 04:00 in the reader's local zone.** The *session* request carries
`Intl.DateTimeFormat().resolvedOptions().timeZone`, the server validates it and falls back to UTC.

- ⚠️ **The app has no notion of *today* anywhere else.** Every timestamp is `timestamptz` and every
  rule so far has been an interval. This is the first day boundary in the project, and it is
  introduced here rather than assumed.
- **04:00, not midnight**, because a run that starts at 23:40 and ends at 00:10 is one sitting to the
  person doing it. Anki's default cutoff is the same hour for the same reason.
- **The client's zone, not a configured one**, because there is no config for it and a laptop that
  crosses a timezone should move the boundary with the reader. The worst a wrong value can do is
  shift one reader's own cap by a few hours.

**5. The backlog is ordered by retrievability, and only when that is a choice.** When the due set is
larger than `size`, the due half is ordered by `get_retrievability` ascending, lowest first.

- ⚠️ **This contradicts a comment in `compose.ts` and the comment is the thing that was wrong.** It
  reads: *a card three weeks late has decayed further than one due this morning*. That is true only
  when both have the same stability. A *card* with 200 days of stability that is three weeks late is
  better remembered than a shaky one that came due yesterday, and FSRS can say so exactly.
  `get_retrievability(card, now, false)` returns the probability as a number (ts-fsrs docs, read
  2026-09-16).
- **When the due set fits in the *session*, the order does not matter**, because everything due is
  studied. Sorting by `due` ascending stays the tie-break and the fallback for an epoch with no
  `last_review`.
- The due query loses its `LIMIT size` and gains the epoch's state, ordered `due` ascending with a
  hard ceiling of 2,000 rows so a pathological backlog cannot pull the whole table into memory. The
  count the fifty-card gate needs comes from the same read.

**6. Nothing limits due reviews.** A reader who wants to clear 300 due *cards* in one evening may, 20
at a time. Capping the cure to protect the reader from the disease is how a backlog becomes
permanent.

**7. The reader is told which brake is on.** *Review*'s start and end screens name the number: *no
new words today, 63 due* or *10 of 10 new words today*. `10` §5.7's two empty states become three.
⚠️ **A brake that is silent is a bug report.** The reader who does not know why new words stopped
concludes the app is broken, and he is the only reader there is.

## What this does not change

- **ADR 0016 and the FSRS configuration.** `enable_short_term` stays off, every interval stays at
  least a day, and the *session* stays a fixed size.
- **The *session* is still composed once and prefetched as a unit** (`S8`, ADR 0007). The brake is
  arithmetic inside the composition, not a thing the client checks.
- **`compose` stays pure and stays the seam** (`11` §8). It gains two arguments, the allowance and
  the due count, and the endpoint supplies both.

## Alternatives considered

**Cap new *cards* per *session* instead of per day.** One line, no column, no day boundary, no
timezone. Rejected: three *sessions* in an evening is thirty new *cards*, and the failure is silent
for three weeks and then arrives as a hundred reviews a day. The whole feature exists to stop that
one case.

**Use FSRS's load balancing or a scheduling spread instead.** Rejected for v1: it smooths intervals
for *cards* already in the deck and does nothing about how many arrive. It is worth having later, and
it is a different decision.

**Scale the daily cap to how much the reader is keeping up with.** Rejected as a knob with a plausible
story. Ten a day is 3,650 words a year, which is more than enough, and a rule the reader can predict
beats one that is clever.

**Order the backlog by relative overdueness, elapsed over scheduled.** It is the proxy Anki reached
for before FSRS could answer directly. Rejected because the direct answer is available in a library
this project already pins.

## Revisit if

- The 50-card gate is on for more than a week at a time. That means the drip is faster than the
  reader, and what moves first is the ten, not the fifty.
- Retention (ADR 0062) falls while the brake is off. Ten a day would then be too many regardless of
  the backlog.
- A day's allowance regularly goes unused while the reader is asking for more words, which is the
  signal that the cap is the wrong shape rather than the wrong number.

## Amended 2026-09-18 with [#21](https://github.com/yutaasakura96/kioku/issues/21)

Built as decided. Five things the building settled that the decision did not say:

1. **The zone is stored on the run: `review_session.zone`, nullable text.** §4 put the zone on the
   request and said nothing about keeping it, and `/stats` needs it too — *consistency* (ADR 0062)
   counts days over the same 04:00 boundary and `/stats` ships no JavaScript (ADR 0020), so it has no
   client to ask. It reads the newest run's zone, and falls back to UTC for a reader who has never
   composed one from a client that sent it. ⚠️ **Not a column on `user`**: the auth library owns that
   table (`08` §7), and a zone on the run moves with the reader's laptop at the next *session* rather
   than needing a setting. A client that sends nothing, or nonsense, stores `null` rather than `UTC`,
   because not reporting a zone is not reporting UTC. What is stored is `Intl`'s canonical spelling.
2. **`compose` takes the allowance and reads the due count as `due.length`.** #21 asked for both as
   arguments, and the count comes from the same read (§5) — so a second argument could only ever
   disagree with the list it came beside. The read's 2,000-row ceiling is far above the gate at fifty,
   so the count is exact wherever it matters. `compose` returns the run and its `new_count` together.
3. **A due *card* with no `last_review` has retrievability 0.** Measured 2026-09-18 against the
   pinned `ts-fsrs` 5.4.2: `get_retrievability` answers `0` for a `New` *card* and **throws** `Invalid
   date` for any other state without a `last_review`. The only such epoch is a reset one, so the
   wrapper answers `0` before the library is asked, which is the library's own answer for `New`.
   `due` ascending is the tie-break, as §5 says.
4. **The end screen reads the brake again when the run is over.** A run composed at 63 due is 43 due
   twenty answers later, and a sentence still saying 63 would name a shut gate the next run would
   open. The answer that finishes a run carries a fresh reading; the *session* response carries one
   always. ⚠️ **§7's "start screen" is read as *Review*'s empty states**, because *Review* has no start
   screen: composition happens on arrival, and the empty states are where a reader who cannot start
   is told why.
5. **The third empty state is *No new words today***: new *cards* are waiting, nothing is due, and the
   day's ten are spent. It cannot be the fifty-*card* gate, which needs fifty due, and with fifty due
   there is a run to compose. The open state states its number too (*3 of 10 new words today*), so the
   reader meets the cap as a count before meeting it as a wall.
