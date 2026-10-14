# Home is the landing place, and More holds the rest

**`/` is Home: Welcome on a reader's first visit, the prototype's dashboard after it. Ingest moves to
`/add`. The bar names Home, Categories and More, and *Vet*, *Sources*, *Stats*, *Settings* and Ingest
are rows under More.** Built by [#71](https://github.com/yutaasakura96/kioku/issues/71) from the
prototype Yuta reviewed on 2026-10-10 and kept as built
([#67](https://github.com/yutaasakura96/kioku/issues/67), answer 12: the dashboard is about right).
The reference for how each screen reads is [`docs/prototype/`](../prototype/).

## What changed, and why

[ADR 0031](0031-the-landing-route-is-ingest-and-never-a-decision-about-data.md) put the reader on
the paste box at every sign-in, because there was nothing to study until they had ingested
something. Since [ADR 0075](0075-the-words-are-ready-made-and-a-level-comes-from-a-list.md) the words
are already there, and ADR 0031's own revisit condition has come true: *the reader signs in to
study*. The prototype answers what they land on: what is waiting today, and how far they are.

## What this overturns

| Earlier decision | What becomes of it |
| --- | --- |
| ADR 0031: `/` is Ingest, and the landing inspects nothing | **`/` is Home.** It reads one thing to choose between two screens (§1); it never redirects |
| ADR 0076 §8: the screen before a run is `/review`'s until Home exists | Home's two cards start a run with `?start=`. `/review` opened bare still shows its screen, without the *category* line |
| ADR 0077 §3: choosing a *category* lands on `/review`, where the line naming it stands in for Home | **Choosing lands on `/`**, and the line is on Home |
| `10` §3.1: the nav names every *place* | The bar names three (§3) |

## What is decided

### §1 — One route, two screens, and no redirect

- **Welcome** is drawn when the reader has **no `active_category` row and has never composed a run in
  this *subject***. The second half is for a reader who studied before #69 and has no row: they are
  not new.
- **Welcome asks one thing: where to start.** *I am new to Japanese · start at N5*, then the five
  *levels*. Each is a form posting to `/api/category`, which writes the row (ADR 0077 §2) and answers
  `303` to `/`. From then Home is the dashboard.
- ***Find my level* is not drawn.** The placement test is #72's; a control that led nowhere would be a
  disabled one in disguise ([ADR 0035](0035-five-interaction-states-is-not-a-set-and-three-screens-have-three.md)). #72 adds it.
- **Welcome has no *shell***, as the prototype draws it: one decision, and a nav would be three ways
  around it. The sources' acknowledgement is its fine print with the links (ADR 0075 §8), and stays in
  the *shell*'s footer, because Welcome is seen once.
- **ADR 0031's argument against a chooser still holds, and this is not one.** It rejected a redirect
  into a *mode* and a redirect between *places*. Home is one *place* that draws one of two screens;
  `/` answers `200` either way and is no more cacheable than it was.

### §2 — The dashboard is the prototype's `vHome`

Top to bottom: *Today*'s sentence (`startLines`, unchanged), the *Reviews* and *Lessons* cards, the
line naming the active *category*, then two columns — *Your JLPT vocabulary level*, *Coming up* and
*Last 14 days* on the left, *Progress by level* and *Weak words* on the right — and the quiet line to
*Add my own words* and *Import an Anki deck*.

- **The two cards are the entrances to a run**, links with `?start=` like the start block's, so the
  start block is not drawn on Home. A card with nothing to start has no control, and the sentence
  under its figure says why (`noLessonLine`, ADR 0066 §7).
- **The level card has no estimate.** The estimate is #72's. Until then it says *No estimate yet*
  over an empty ladder, as the prototype's day one does.
- ***Coming up* is four disjoint figures**: now, later today, tomorrow, and the five days after.
  ⚠️ The prototype's *in 4 hours* is a scheduler this app does not run (ADR 0076 §1), so the second
  figure is *later today*, and its *this week* could be read as including the three before it.
- ***Last 14 days*** is a square a local day (ADR 0066 §4), filled when anything was graded that day,
  as *consistency* counts a day on `/stats` (ADR 0062).
- **A weak word has been missed at least twice and still stands at *Learning*.** ⚠️ The rule is this
  ticket's and is not measured; it is two constants in `shared/home/dashboard.ts`, beside the four
  the list shows.
- **Day one draws less**, as the prototype does: *Coming up*, *Last 14 days* and *Weak words* wait
  until a word has been graded. After that an empty *Weak words* says what would put a word there.
- **Not drawn, because the screens they open do not exist**: links to *Words* from a level's row and
  from the weak words, and *Practise these*, which would be a kind of *session* ADR 0076 §1 does not
  have.
- **`09` §2's *as of this page load*** is under the *category* line, since the start block that
  carries it elsewhere is not drawn.

### §3 — Where everything else lives: under More

The prototype's bar is Home, Categories, Words and More, and it has no place for *Vet*, *Sources* or
*Stats*. **Each is kept and goes under More**, which is a seventh *place*, `/more`, the prototype's
`vMore`:

| Row | Goes to |
| --- | --- |
| Add my own words · Import an Anki deck | `/add`, Ingest (both are one form today) |
| Study settings | `/settings` |
| Vet flagged words, with the count waiting | `/vet?from=/more` |
| Sources | `/sources` |
| Stats | `/stats` |
| Export my data | `/api/export` (`S12`, still linked from `/stats` too) |
| Sign out | `/auth` |

**Removal was the alternative, and each of the three still does a job nothing else does**: *Vet* is
where a flagged word is kept, fixed or dropped ([ADR 0064](0064-a-chosen-word-mints-its-cards-on-arrival.md)),
*Sources* is where an import is read and deleted (`S11`), and *Stats* is the numbers
[ADR 0062](0062-retention-and-consistency-are-the-headline-and-acceptance-rate-retires.md) asks for.
None of them is a daily screen, which is what More is for.

- **The bar names Home, Categories and More.** *Words* is not drawn until a ticket builds it. More is
  marked while the reader is on any *place* under it.
- **Below 720px the three move to a bar of tabs at the foot of the screen**, as the prototype's phone
  frame has them. Links only; no script.
- **The current item has the prototype's accent rule under it**, which `10` §3.1 left out.
- **The start block stays on every *place* but Home and More**, unchanged.
- **The `from` allowlist is the seven *places***, so a *mode* entered from More or Ingest returns
  there.

## Alternatives considered

- **Keep `/` as Ingest and put Home at `/home`.** Every sign-in would land on the secondary path, which
  is ADR 0031's cost with its reason gone.
- **Welcome at its own route, with `/` redirecting to it.** A redirect that depends on the reader's
  data is the thing ADR 0031 refused, for a screen seen once.
- **Decide Welcome by "has no *card*"** rather than by the row and the runs. A reader whose lesson
  quiz missed every word has no *card* and is not new.
- **Remove *Vet*, *Sources* and *Stats*.** Each does a job nothing else does (§3).
- **Put them in the bar.** Six items do not fit a phone, and none is daily.
- **Compute the level estimate here.** It is #72's, with its thresholds still proposals.

## Revisit if

- **#72 builds the placement test and the estimate.** Welcome gains *Find my level*, More gains
  *Retake the placement test*, and the level card fills in.
- **A ticket builds *Words*.** It joins the bar, and a level's row and the weak words link to it.
- **A weak-word run is wanted.** *Practise these* is a third kind of *session*.
- **The weak-word rule lists words the reader does not think are weak**, or misses ones they do.
