# The first real run — the expectation, written down first

**Status:** unfilled. **Created:** 2026-09-12, by the session that provisioned the database.

This is the instrument for `S3` and `S10`, and
[ADR 0037](adr/0037-a-measured-criterion-is-reported-not-asserted.md) is why it is a form and not a
test: *"If the median comes back at eleven seconds, that is the project learning something, and a red
suite is the wrong way to be told."*

⚠️ **The prediction is the whole point, and a prediction recorded afterwards is not one.** Part 1 is
filled in **before** any Japanese is pasted. Part 3 is filled in after, and `/stats` is not opened
until Part 1 has values in it. If that ordering is broken the run still produces *notes* — it just
stops being evidence about whether the thesis holds, which is the only reason it is on the first-week
list.

Nothing here can fail. There is no threshold and no pass mark: ADR 0037 refused those on purpose, and
a number that comes back badly is the most useful outcome this document has.

---

## Part 1 — before the run

Fill every row. A confident guess is better than a blank; the width of the error is the finding.

| # | Figure | Your prediction | Why you think so |
| --- | --- | --- | --- |
| 1 | **Median seconds-per-note**, unedited accepts only. `S3`'s criterion is *under 5s over ≥20* | | |
| 2 | **Acceptance rate** — unedited accepts ÷ notes generated | | |
| 3 | **How many of twenty you will edit** rather than accept or reject | | |
| 4 | **How many you will reject outright** | | |

Two more, and these are the ones the rejected set is evidence for:

| # | Question | Your prediction |
| --- | --- | --- |
| 5 | **What will you reject them *for*?** Name the single most common reason you expect | |
| 6 | **Will the rejections cluster by part of speech?** If yes, which | |

⚠️ Rows 5 and 6 are not curiosity. `S3`'s run is *also* the instrument for two decisions that were
made with no real *source* to look at:

- [ADR 0044](adr/0044-a-candidate-is-a-content-word-and-a-numeral-is-not-one.md) — the candidate
  allowlist. **A filter the allowlist should have made shows up as a cluster of rejections sharing a
  part of speech.** That is the signal; row 6 is the prediction it is measured against.
- [ADR 0045](adr/0045-the-reading-half-of-the-identity-key-is-written-in-the-word-s-own-script.md) —
  the reading script. A reading that looks wrong on the answer side of a *card* is this decision
  being read back to you.

And one about the machinery rather than the corpus:

| # | Question | Your prediction |
| --- | --- | --- |
| 7 | **Time-to-first-review** — paste to the first grade of a *card* from that *source*. Note this is measured from `received_at` on the ingestion, not from a review timestamp (ADR 0057) | |

---

## Part 2 — the run

1. `scripts/first-run.sh` if the Google client does not exist yet. Sign in once.
2. **Paste two pages of Japanese** into `/ingest`. Real material, not a word list — the tokeniser and
   ADR 0044's allowlist are only being tested if the input is prose.
3. Start the worker in a second terminal:
   ```
   cd worker && uv run --env-file .env python .
   ```
4. **Start a stopwatch mentally, not literally.** `seconds_to_vet` is stamped per *note* at the
   keystroke, from the first run — timing yourself by hand would change the thing being measured.
5. Vet **at least twenty** *notes* at `/vet`. Judge them as you actually would, not as quickly as you
   can; a run optimised for the number is not evidence about the number.
6. Review on **two separate days** — `S3`'s median needs one day, but *time-to-first-review* and the
   scheduler need the second. ⚠️ Below twenty vetted *notes* `/stats` suppresses all four ratios and
   says why; that is the boundary working, not a fault.

**Record as you go, because the app does not:**

| | |
| --- | --- |
| Date of day 1 | |
| Date of day 2 | |
| Source material — what it was, roughly how long | |
| Model id that actually ran (`KIOKU_MODEL_ID`, or the `claude-sonnet-5` default) | |
| Anything that surprised you mid-run | |

---

## Part 3 — after the run, from `/stats`

Open `/stats` only now.

| # | Figure | Predicted (Part 1) | Actual | Off by |
| --- | --- | --- | --- | --- |
| 1 | Median seconds-per-note | | | |
| 2 | Acceptance rate | | | |
| 3 | Edited | | | |
| 4 | Rejected | | | |
| 7 | Time-to-first-review | | | |

Also record the two the screen shows that Part 1 did not ask you to predict, because there was no
basis to:

| Figure | Actual |
| --- | --- |
| Notes vetted (the raw count — the one figure the boundary never withholds) | |
| False-accept rate, and how many `X` flags produced it | |
| Tokens and cost for the run | |
| `worker_environment` shown on time-to-first-review | |

---

## Part 4 — what it means, in prose

Three questions, and none of them has a right answer:

**1. Does `S3` hold?** The criterion is a median under five seconds over at least twenty. If it does
not hold, say what the time actually went into — reading the sentence, second-guessing the reading,
or the screen making you look for something.

**2. What do the rejections say about ADR 0044?** List the rejected *notes* by part of speech. A
cluster is an argument to amend the allowlist; an even scatter is an argument that it is already
right. Either way this is the first evidence either ADR has had.

**3. What is now worth ticketing?** The frontier is empty and two tickets are already owed —
re-vetting a flagged *note* ([ADR 0056](adr/0056-a-flag-returns-a-note-to-the-queue-through-card-flag-not-by-un-accepting-it.md))
and `S12`'s export. This run is allowed to add a third, and it is the only thing so far that can add
one from evidence rather than from the documents.

---

⚠️ **When this is filled in, it stops being a form and becomes a finding.** Fold Parts 3 and 4 into
`00-status.md` § Done and amend ADR 0037 with what the numbers actually were — the ADR predicted that
they would be worth knowing, and this is the entry that settles whether it was right.
