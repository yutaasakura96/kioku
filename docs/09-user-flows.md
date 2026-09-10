# Kioku — user flows

**Date:** 2026-09-07
**Status:** Phase 4. The twelve stories walked end to end. Most of it is citation; four things are
decided here, and three of those are ADRs
[0031](adr/0031-the-landing-route-is-ingest-and-never-a-decision-about-data.md),
[0032](adr/0032-a-mode-is-entered-from-a-start-control-and-done-is-the-only-way-out.md) and
[0033](adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md).

Vocabulary is [`../CONTEXT.md`](../CONTEXT.md). Requirements are
[`02-product-requirements.md`](02-product-requirements.md), cited `S1`–`S12`. Mechanisms are
[`03-technical-design.md`](03-technical-design.md), [`04-database-schema.md`](04-database-schema.md)
and [`08-authentication.md`](08-authentication.md), cited by section. Verified facts are
[`phase-4-verification.md`](phase-4-verification.md) — **§1–11 are checked and must not be re-run.**
§12 was added while writing this document.

**A flow that serves no story is not in this file.** Every section below is reachable from one of the
twelve, and where a flow exists only because of a mechanism — a reload, a dead worker — it says which
story it protects.

---

## 0. What this document decides, and what it does not

**Decides — four things:**

1. **What `/` is.** `08` §2 set `callbackURL: "/"` and never said which screen that names.
   [ADR 0031](adr/0031-the-landing-route-is-ingest-and-never-a-decision-about-data.md): it is Ingest,
   permanently, and it inspects nothing.
2. **How a *mode* is entered, and what the affordance is.** ADR 0013 decided a mode has no navigation
   out; nothing decided the way in.
   [ADR 0032](adr/0032-a-mode-is-entered-from-a-start-control-and-done-is-the-only-way-out.md): a
   start control carrying its own count, on all three *places*, and Done as the only exit — including
   out of an empty queue, which is what actually closes the gap ADR 0013 claimed to have closed.
3. **What Done means in *Vet*, which is not what it means in *Review*.**
   [ADR 0033](adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md): it is a commit boundary,
   it asks before it crosses one, and `Z` works up to the moment it is answered.
4. **Where `S12`'s export is triggered from** (§4.12), and the concrete path of every route (§1).

**Cites, and does not reopen:** the five screens and the *place* / *mode* split (ADR 0013); the
rendering rules per route (`03` §2.1); the key map (ADR 0023); the Done control's existence
(ADR 0026); session durability (ADR 0014); the sign-in path and the refusal page (`08` §2); every
delete rule (`04` §9).

**Does not decide:** what any of it looks like. Geometry, the five interaction states, the Done
control's dimensions and the *Review* phone layout are `10-screen-specifications.md`. This file says
what happens and in what order; that one says what it is made of.

**There is still no code.**

---

## 1. Every route, and which side of the split it is on

`08` §2 counted six kinds of route. Here are the paths, which nothing had yet named.

| Path | Is | Rendering | Public |
| --- | --- | --- | --- |
| `/` | **Ingest** — the *place* (ADR 0031) | `noScripts: true` | No |
| `/sources` | **Sources** — the *place* | `noScripts: true` | No |
| `/sources/:id` | One *source*, readable, with its *notes* and *occurrences* | `noScripts: true` | No |
| `/sources/:id/delete` | The delete confirmation (§4.11) | `noScripts: true` | No |
| `/stats` | **Stats** — the *place* | `noScripts: true` | No |
| `/vet` | ***Vet*** — the *mode* | `ssr: false` | No |
| `/review` | ***Review*** — the *mode* | `ssr: false` | No |
| `/auth` | The door: sign in, sign out (`08` §2) | Universal, ships JavaScript | Yes |
| `/auth/refused` | The refusal (`08` §2.1) | `noScripts: true` | Yes |
| `/api/auth/**` | Better Auth's catch-all | Nitro | Yes |
| ⚠️ `/` (`POST`) | Submit a *source* (§4.2). **Was `/api/source`** — see below | Nitro middleware, then the *place* | No |
| `/api/source/:id/delete` | `POST` — soft-delete a *source* (§4.11) | Nitro | No |
| `/api/export` | `GET` — `S12`'s export (§4.12) | Nitro | No |
| `/api/vetting/**`, `/api/review/**` | The two *modes*' data and outbox endpoints | Nitro | No |

⚠️ **`prerender`, `swr` and `isr` are forbidden on every route in this table that is not public**
(ADR 0030, `08` §6.4, verification §11.4). The four new page routes above inherit that rule; a
prerendered `/sources/:id` is a static copy of a *source* with no request left to gate.

**The three *places* have no client, so every write they perform is a form.** The *source*
submission and `/api/source/:id/delete` are the only two, and both are `POST`-redirect-`GET`: they do
the work and answer `303` back to a page. On a validation failure they answer `200` with the form
re-rendered and the submitted text still in it, because a redirect would throw away a paste the
reader cannot get back (§4.2).

⚠️ **Amended 2026-09-11, while building #6 — the submission is `POST /`, not `POST /api/source`.**
The row above said the latter, and the paragraph it sits under is why it could not be: a validation
failure is answered with **this document**, the Ingest *place*, re-rendered with the reader's text in
it. A Nitro route handler cannot produce a Vue page. Two things were measured against the built app
and between them they close every other option:

- **Nuxt's page renderer answers `POST` with a fully rendered document** (`200`, `text/html`). So a
  `POST` that reaches the router is served by the *place* itself — which is exactly the answer this
  section asks for.
- ⚠️ **Rewriting `event.node.req.url` inside a middleware does not re-route**; the request `404`s. And
  `nitropack` 2.13.4's `localFetch` takes no context, so a rejected 120,000-character paste has no way
  to travel to an internal render.

So the submission is a middleware on `POST /` that answers `303` on success and **falls through** to
the renderer on failure (`server/middleware/submit-source.ts`). Everything this row was *for* is
unchanged: the write is a form, it is post-redirect-get, and its CSRF story is still that
`SameSite=Lax` sends the cookie for a same-site `POST` and not for a cross-site one. Only the path in
the form's `action` moved, and it moved because the only path that can render the refusal is the one
the refusal has to appear on.

⚠️ **A same-site form `POST` carries the session cookie and a cross-site one does not**, which gives
those two routes CSRF protection with nothing added. `SameSite=Lax` sends the cookie for same-site
requests, and cross-site only for top-level navigations using a safe method — which excludes `POST`
(verification §12.2). `08` §5 chose `lax` for the Google callback; this is a second thing it buys.

---

## 2. The shell, and the two controls that leave it

The *shell* is on `/`, `/sources`, `/sources/:id`, `/sources/:id/delete` and `/stats`, and nowhere
else (ADR 0013). It carries three things:

| | What | Goes to |
| --- | --- | --- |
| **Navigation** | Ingest · Sources · Stats | The three *places*. Never a *mode* (ADR 0032) |
| **The start block** | Vet, with the *pending* count · Review, with the number due now | `/vet?from=…` · `/review?from=…` |
| **The door** | A quiet link, for signing out | `/auth` (`08` §2) |

Neither start control is ever disabled. A zero on Review is how the reader reaches the empty state
that tells them when the next *card* is due, and a zero on Vet is how they find out whether an
*ingestion* is still running (§8). Disabling the entrances would make PRD §4's written empty states
unreachable.

**Every figure in the shell is as of page load and says so.** A *place* ships no JavaScript, so it
cannot poll, and the alternatives are worse: a meta refresh on `/` would destroy a paste in progress,
and a stale number presented as live is a lie the reader has no way to detect. §7 is where this
matters most.

---

## 3. Cold start — first sign-in to first vetted note

The path `S1` → `S2` → `S3` traces, with nothing in the database.

1. The reader opens the application. **No session cookie**, so the Nitro server middleware answers
   `302` to `/auth` (ADR 0030, `08` §6.3). The requested path is discarded, which is why ADR 0031
   makes `/` worth landing on.
2. `/auth` renders one button. It is the only route in the application that ships JavaScript, because
   `authClient.signIn.social` is a client call (`08` §2).
3. The button runs
   `signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/auth/refused" })`.
   Google, then back to `/api/auth/callback/google`, then `user.validateUserInfo` against the fresh
   profile (`08` §3.1).
4. **The invited account lands on `/` — Ingest, empty.** An uninvited one lands on `/auth/refused`,
   and that flow ends there; §4.1.
5. Ingest with nothing ingested is PRD §4's one screen that works empty: the paste box, and the start
   block reading `Vet · 0 pending` and `Review · 0 due`.
6. The reader pastes two pages of Japanese and submits. **Control returns immediately** (`S2`): the
   `POST` writes `source`, `source_chunk`, an `ingestion` at `status = 'queued'` and one `job` row,
   then answers `303` to `/`. Nothing waits on the worker.
7. `/` re-renders with the run listed above the form: queued, or running with a chunk count. The
   start block still reads `Vet · 0 pending`, because it is as of this instant.
8. The worker claims the job, tokenises, deduplicates, filters, generates, and **writes *pending
   notes* as they are produced rather than at the end** (`03` §5.1 stage 7, `S2`).
9. The reader presses Vet in the start block. This is the first full document load into a *mode*.
10. ***Vet* is where the streaming is actually visible**, and this is the point of the split rather
    than a consequence of it. *Vet* is `ssr: false` and client-owned, so it can ask for more; Ingest
    cannot. `S2`'s "the first *note* is vettable while the rest are still generating" is true because
    the screen that has to show it is the one with a client.
11. The first *note* renders. `space`. **That is the first vetted note**, and `note_vetting` carries
    `seconds_to_vet` for it from this moment on (`04` §7.2, `03` §12) — `S3`'s criterion is measured
    from the first run, not retrofitted.

**Time-to-first-review** starts at step 6 (`source.submitted_at`) and stops at the first *grade*,
which is §4.7. The number is stamped with `worker_environment = 'laptop'`, because `03` §12 says
early figures are not comparable across ADR 0022's move.

---

## 4. The twelve stories, as flows

Each names its screens, its keystrokes and its exit.

### 4.1 `S1` — Get in

**Screens:** `/auth` → Google → `/`, or `/auth/refused`.
**Keystrokes:** none. The door is a pointer surface.
**Exit:** `/` on success. On refusal there is no exit, and that is the requirement.

The refused path: `validateUserInfo` rejects on the fresh Google profile, before any row is written
(`08` §3.1, verification §11.5). The browser is redirected to `/auth/refused` by `errorCallbackURL`;
a programmatic caller gets a 403 sent to the same place by `onAPIError.errorURL`.

**`/auth/refused` has no sign-in button, no retry and no support link** (`08` §2.1). `S1` says there
is no path to create an account from inside the app, and the refusal page is inside the app.

⚠️ **The reader cannot get back to `/auth` from `/auth/refused` by clicking.** They type the URL.
This is deliberate and it is the one place in the application where a dead end is the feature.

**Sign-out** is the reverse: the shell's quiet link to `/auth`, which renders the signed-in state and
one button. Signing out clears the session row and the cookie, and the next request to anything is
step 1 of §3 again.

### 4.2 `S2` — Turn a wall of text into notes

**Screens:** `/` only.
**Keystrokes:** none.
**Exit:** stay on `/`, or go to `/vet`.

The form has two fields: an optional title, and the content. On submit, `POST /` (⚠️ **amended
2026-09-11** from `POST /api/source`, §1):

| Case | Response | Behind it |
| --- | --- | --- |
| Accepted | `303` to `/`, run listed above the form | `source` + `source_chunk` + `ingestion(queued)` + `job(queued)`, one transaction (`04` §5.1, §6.1, §6.4) |
| Over 100,000 characters | **`200`, the form re-rendered with the text still in it**, and the character count | Refused before any spend. `char_count`'s `CHECK` is the same rule in the schema (`04` §5.1) |
| Content identical to an existing *source* | `303` to `/`, plus a line naming the earlier *source* and linking to it | A new *source* either way — `content_hash` is indexed and **not** unique. Detection, not prevention (`04` §5.1, PRD §5) |
| Empty content | `200`, re-rendered, message | |

The over-cap row is the one that had to be argued. A `303` after a rejected 120,000-character paste
loses the paste, and there is no client to hold it. Re-rendering from the `POST` body keeps it. The
cost is that a browser reload on the error page re-submits, which is the ordinary cost of the
ordinary answer.

**Nothing about this flow waits.** `S2`'s "returns control immediately" is satisfied by the job row,
not by a fast worker: the transaction writes four rows and answers.

### 4.3 `S3` — Vet a note in one keystroke

**Screen:** `/vet`.
**Keystrokes:** `space` accept · `E` edit · `R` reject · `Z` undo · `Esc` leave (ADR 0023).
**Exit:** Done, or `Esc`. Both end the run — §5.3.

The loop, per *note*:

1. The *note* renders: the chrome bar with the *source* name and the *pending* count, the *facts
   strip*, the *judgement fields* below the lower rule (`05` §7, `S4`).
2. `space`. `note_vetting.state = 'accepted'`, `seconds_to_vet` stamped, the *card* minted (`04`
   §7.2, §7.3). **No confirmation, no focus change, no pointer** — `S3`'s criterion, and the reason
   ADR 0013 made this a *mode* at all.
3. The next *note* renders. The count decrements.

`R` is the same shape: one keystroke, written immediately, no dialog — ADR 0023 spent the argument on
this and `Z` is what replaces the dialog.

`E` opens the *note*'s fields. Inside edit:

| Key | Does |
| --- | --- |
| `Tab` | Next field |
| `Enter` | Commit **and accept**. `note_vetting.edited = true`, which `S6` counts as an edit rather than an acceptance |
| `Esc` | Cancel the edit and return to the *note* unchanged |

⚠️ **`Esc` is contextual and this is the one place in the application where it is.** With an edit
open, `Esc` closes the edit; with no edit open, `Esc` leaves the mode. The alternative — `Esc` always
leaving — discards an in-progress correction with the same key that means "never mind" one level
down, which is the more surprising of the two surprises. `10-screen-specifications.md` owns whether
the fields are single-line; `Enter` as commit assumes they are.

`Z` reverses the last decision of either kind and puts the *note* back at the head of the queue
(ADR 0033). Its target is read from the database — the highest `vetted_at` in the open
`vetting_session` — not from client memory, which is what makes it survive §6's reload.

**Leaving mid-queue loses nothing** (PRD §5). Vetting is a queue, not a *session*; every *note*
commits on its keystroke. What leaving does cost is the undo, and that is §5.3.

### 4.4 `S4` — Only look at what needs looking at

**Screen:** `/vet`. No flow of its own; it is what §4.3 step 1 renders.

Lookup *provenance* renders quietly; *judgement fields* are foregrounded, below the *facts strip*'s
lower rule. A *level* from a named *authority* and a *level* that is a model estimate differ by one
bit: the *provenance marker* is filled when `level_claim.authority_key IS NOT NULL` and hollow when
it is null (`04` §14, `05` §7).

⚠️ **The marker is never placed behind a hover** (`CONTEXT.md`). "Available on inspection" in `S4`
means the *authority*'s name is reachable, not that the honesty bit is.

### 4.5 `S5` — Say no once and mean it

**No screen.** This story is a flow the reader never sees, which is the point of it.

A *rejection* at §4.3 sets `note_vetting.state = 'rejected'`. Stage 5 of the pipeline joins
`note.identity_key` for this owner and drops anything already rejected, **before** stage 6 spends
money on it (`03` §5.1, ADR 0010). There is no `rejected_term` table; the row is the filter (`04`
§7.2).

Where the reader does see it: the zero-new-notes case on `/`, which reports how many candidates were
filtered and by which filter, from `ingestion.candidates_*` (§7). PRD §5 calls that a success, and it
is what `S5`'s "the fiftieth *source* asks about fewer *notes* than the fifth" looks like from the
outside.

### 4.6 `S6` — Fix a note before accepting it

**Screen:** `/vet`, the `E` branch of §4.3.

Once *accepted*, the *note*'s fields are frozen. A later *source* implying something different
appends an *occurrence* and raises a flag rather than rewriting (ADR 0006, ADR 0011). There is no
re-edit path in v1: the way back to a bad *note* is `S9`'s flag, which returns it to the queue.

### 4.7 `S7` — Study a session that ends

**Screen:** `/review`.
**Keystrokes:** `space` reveal · `1`–`4` grade · `X` flag · `Esc` leave (ADR 0023).
**Exit:** the end screen, then Done. Or Done mid-session, which resumes later (§5.3).

1. The start control loads `/review?from=/`. The app shell renders (`ssr: false` is a build-time
   optimisation only — a real document still arrives, verification §5.5).
2. The client checks `localStorage`. **A live snapshot means resume**, at the first ungraded ordinal
   (§6). Otherwise it asks the server for a new *session*.
3. The server composes it due-first with new *cards* filling the remainder, writes `review_session`
   and `size` rows of `review_session_card`, and stamps `snapshot_taken_at` **server-side** because
   `03` §8.2's replay rule compares against it (`04` §7.6, §7.7).
4. The *progress rail* is one tick per row — `review_session.size` ticks, and it knows its own length
   because a graded *card* leaves the session and never returns (`04` §7.7, ADR 0016).
5. Per *card*: `space` reveals the back, `1`–`4` grades. The *grade* is stamped at the keystroke and
   appended to the outbox. **The interface never waits on the flush** (`S8`, ADR 0007).
6. After the last position, the end screen: the *session*'s numbers, all ticks filled,
   `review_session.completed_at` set.
7. **Starting another is one deliberate action, never automatic** (`S7`). `space` on the end screen
   starts the next one, and the key is safe there because the key before it was a digit.

***Session* size is set on the end screen and on Review's empty states**, never mid-session — the
current one is snapshotted and a knob that appeared to change it would be lying. `size` is bounded at
1–200 (`04` §7.6) and is the only knob in v1; a per-day cap on new *cards* is `L4`.

⚠️ **A first-ever *session* is twenty *cards* with no chance to change it**, because the knob has
nowhere to live before a session exists. Twenty is the default and the reader adjusts it at the end
of the first run.

### 4.8 `S8` — Not lose grades on a train

**Screen:** `/review`. No keystrokes of its own; it is what §4.7 step 5 does when the network is
gone.

The whole *session* is prefetched at step 3. Each *grade* is stamped at the moment it is given and
appended to the outbox; **the snapshot and the outbox both live in `localStorage`**, so a tunnel and
a tab crash fail the same way, which is to say they do not (ADR 0014, `03` §8.1).

Replay is in order, append-only, never merged. On replay the server rejects a *grade* stamped beyond
a small skew into the future, or before its own `snapshot_taken_at`, and **surfaces the rejection to
the reader** rather than dropping it (`03` §8.2). The reader can fix a wrong clock; they cannot fix
history that quietly did not happen.

⚠️ **A flush that answers 401 is not a network error** (`08` §5.6). The session expired mid-run. It
must not retry on the same backoff forever: the end screen reports the *grades* still unsent, and the
reader signs in again. Seven days with a sliding refresh makes this rare, and the outbox is the one
place client-authored data becomes permanent history, so rare is not the same as safe.

### 4.9 `S9` — Catch a bad card after a month

**Screen:** `/review`.
**Keystroke:** `X`.
**Exit:** the *card* leaves the position and the session continues.

`X` does four things at once (`04` §7.8):

1. Writes `card_flag`, with `source_id`, **`prompt_version` and `model_id` denormalised at flag
   time**. Without the third part the reader learns "some cards are bad" instead of "prompt v3 writes
   bad example sentences", and only the second is actionable (ADR 0004).
2. Suspends the *card*: `suspended_at` set, `suspended_reason = 'flagged'`. **History untouched.**
3. Sets `note_vetting.flagged_at`, returning the *note* to the *vetting* queue — so the *pending*
   count in the shell goes up by one, and `/vet` will present it again.
4. Advances without a *grade*.

⚠️ **The rail needs a third mark.** A flagged position is passed but not answered, so a twenty-card
*session* can end with nineteen answers. `05` §7 gives the rail three fills (graded, current, not
reached); this is a fourth. `10-screen-specifications.md` owns it.

⚠️ **The flag rides the same outbox as the *grades***, append-only and in order. `S9` says the
suspension is immediate, and immediate has to survive the train that `S8` exists for. `03` §8.1
describes the outbox in terms of *grades* only; it carries two kinds of entry.

### 4.10 `S10` — See whether the thesis holds

**Screen:** `/stats`.
**Keystrokes:** none.
**Exit:** the nav.

Five figures and a ledger, all of them rows written when they happened rather than metrics scraped
from logs (`03` §12):

| Number | Read from |
| --- | --- |
| *Acceptance rate* | `note_vetting.state = 'accepted' AND edited = false` ÷ notes generated |
| *False-accept rate* | `count(card_flag)` ÷ `count(note_vetting WHERE state='accepted')` (`04` §7.8) |
| Median *seconds-per-note* | `note_vetting.seconds_to_vet`, unedited accepts only |
| *Time-to-first-review* | `source.submitted_at` → the first `review_log` for a *card* from that *source* |
| Tokens and cost per *ingestion* | `ingestion`, from the API response, never estimated (`04` §6.1) |

**Below twenty vetted *notes* the ratios are suppressed and only raw counts show**, with a line
saying why (`S10`, PRD §4). That is the state Stats is in on day one, and it is why ADR 0031 did not
make Stats the landing route.

⚠️ ***Time-to-first-review* carries `worker_environment` on the number itself** (`04` §6.1). Figures
measured against a laptop are not comparable across ADR 0022's move, and recording that on the row
rather than in a paragraph is what stops a future session averaging across the boundary.

### 4.11 `S11` — Find out where a card came from, and get rid of it

**Screens:** `/sources` → `/sources/:id` → `/sources/:id/delete` → back to `/sources/:id`.
**Keystrokes:** none. These are *places*.
**Exit:** the nav.

`/sources` lists every *source*: title, `submitted_at`, the *ingestion*'s status, the number of
*notes* it originated, and a marker on the soft-deleted ones. Deleted *sources* stay in the list,
because `S11` requires them to stay readable.

`/sources/:id` renders the content, and each *note* with its *occurrences* and their character
positions in that content (`04` §5.5). This is the "where did this card come from" half of the story,
and it is the reason `source.content` is retained at all (ADR 0008).

**The delete, which is two steps because there is no client to hold a dialog:**

1. A link to `/sources/:id/delete`. A page, not a modal.
2. That page names **how many *cards* will be suspended** and states what is not touched. Two
   controls: a `POST` to `/api/source/:id/delete`, and a link back.
3. The `POST` sets `source.deleted_at` and suspends every *card* whose *note* originated in that
   *source*, with `suspended_reason = 'source_deleted'`. **No review history is touched, no *note* is
   deleted, no *card* row is removed** (`04` §9.1). `303` back to `/sources/:id`, now marked deleted.

The count on step 2 is the whole reason the step exists. "Delete this source" understates it; "this
suspends 41 cards" is the sentence the reader needs, and a `noScripts` route can only show it on a
page of its own.

⚠️ **Hard deletion has no route in v1.** `S11` requires it to be "a separate deliberate act that
still preserves history", and `04` §9.1 specifies exactly what it does. Nothing requires it to be a
button, and a button is how a soft delete becomes a hard one by accident. It is performed against the
database by a person who has read `04` §9.1. **Cards suspended by the soft delete stay suspended;
nothing un-suspends itself.**

### 4.12 `S12` — Get everything out

**Screen:** `/stats`.
**Keystroke:** none.
**Exit:** a file on the reader's disk.

**Decided here: the export is triggered from Stats, as a plain `<a href="/api/export">`.** The route
answers `notes`, `cards`, `grades` and **every *scheduling epoch* including superseded ones**, as
JSON, with `Content-Disposition: attachment`.

Three reasons it is on Stats rather than anywhere else:

- **It needs no JavaScript.** A link that downloads is the one write-shaped action a `noScripts`
  *place* can perform with no mechanism at all, which is why the export can live on a *place* and
  would need machinery to live in a *mode*.
- **Stats is already the screen about the whole corpus.** Sources is scoped to one *source*; Ingest
  is the way in, not the way out.
- **`03` §13.6 makes this the backup.** Neon Free gives six hours of instant restore and one
  snapshot, and six hours is not a backup for review history. The thing that stands in for a backup
  belongs next to the numbers the reader checks, not behind a *mode*.

⚠️ **`/api/export` is a `GET` that returns everything, and `SameSite=Lax` sends the session cookie on
a cross-site top-level `GET`** (verification §12.2). A malicious link can therefore start the
download; it cannot read the response, which is same-origin. At one reader that is an accepted
nuisance and it is written down rather than discovered. If it ever matters, the answer is a `POST`
with a form token, and the export stops being a plain link.

**The export is exercised by a test that reads it back and reconciles counts** — `S12` calls an
untested export a belief, and `11-testing-plan.md` owns it (`04` §14).

---

## 5. Entering and leaving a mode

The mechanism, once, for both.

### 5.1 In

A start control in the shell (§2) is an `<a href="/vet?from=/stats">`. The *place* ships no
JavaScript, so nothing can intercept it and the full document load happens for free.

**The `from` parameter is the origin, and it is validated on the way out**, not on the way in: it is
matched against the three place paths and anything else falls back to `/` (ADR 0032). It is a
redirect target arriving in a URL. The allowlist is three strings long.

A *mode* reached without the parameter — a bookmark, a typed URL — returns to `/`.

**There is no path from one mode to the other.** Reaching *Review* from *Vet* means leaving *Vet*
first. ADR 0013 accepted that as correctly slow, and ADR 0033 leans on it: a *card* minted inside an
open vetting run cannot be in a *review session*, because getting to one would have ended the run.

### 5.2 Out

Done, or `Esc`. Both do the same thing, and ADR 0026 exists because a phone has no `Esc`.

⚠️ **The Done control is `<NuxtLink :to="origin" external>`, or `navigateTo(origin, { external: true })`.**
A bare `<NuxtLink>` inside a *mode* does a client-side navigation: Nuxt renders the Stats route
component in the page that is already running and hands the reader a Stats screen with a live Vue
application attached, which is what `noScripts` exists to prevent, and nothing errors. Nuxt documents
`external` as rendering "a standard HTML `<a>` tag", bypassing Vue Router (verification §12.1).
`03` §2.1 accepted the full document load in both directions; this is the line that makes the second
direction real.

### 5.3 What Done costs, and it is not the same on the two screens

| | *Vet* | *Review* |
| --- | --- | --- |
| Sets | `vetting_session.ended_at` | Nothing |
| Consequence | **Every *rejection* in the run becomes permanent** (ADR 0006, `04` §7.1) | The *session* is left, not ended. `completed_at` stays null |
| `Z` after | Gone | — |
| Coming back | A new run | **Resumes the same session** from `localStorage` (§6) |
| Asks first | **Yes, when the run holds ≥ 1 rejection** | No |

ADR 0026 gave both modes the same control. It did not give them the same meaning, and
[ADR 0033](adr/0033-done-in-vet-ends-the-run-and-spends-the-undo.md) is where that gets said.

**The question, when it appears:** it names the number of rejections that are about to become
permanent, and it is answered from the keyboard — `space` ends the run, `Z` goes back into the queue.
Both keys already mean those things (ADR 0023). It does not appear at all when the run holds no
rejections, because then it would be teaching the reader to dismiss it unread.

This does not reopen ADR 0023. That ADR refused a dialog on **rejection**, which `S3` measures and
which happens hundreds of times per run. Done happens once.

⚠️ **The 30-minute idle sweep also ends the run** (`04` §7.1), and it cannot be asked anything. A
reader who walks away comes back to a run that ended without them, with the undo spent. This is why
ADR 0023 put the undo horizon in *Vet*'s footer legend: the legend is the only thing that names the
horizon before the reader discovers it has closed.

⚠️ **`Z` on an acceptance un-mints a *card*, and `04` §9.1 needs one sentence.** That section says
there is no path to delete a card anywhere in the app. The exception is a card deleted by `Z` inside
the run that minted it, which is provably historyless by §5.1's argument — and if that argument is
ever wrong, `review_session_card → card` and `review_log → card` are both `RESTRICT`, so the database
refuses and `Z` fails visibly instead of tearing a hole in a session. **Full reasoning in ADR 0033;
the amendment belongs in `04`.**

---

## 6. Reload, resume, and the two things that survive differently

ADR 0014 requires a mid-*session* reload to resume. The two *modes* satisfy it by opposite means, and
neither is an accident.

**`/review` resumes from a snapshot.** The prefetched *session* and the outbox are both in
`localStorage`. A reload re-renders the app shell, finds the snapshot, and continues at the first
ungraded ordinal; the outbox flushes on load. This is the same code path as a crash, a closed lid and
a tunnel, which is the property ADR 0014 was arguing for — surviving a tunnel but not a refresh fails
the story that exists to prevent it.

**`/vet` resumes from the database, because it has nothing to snapshot.** Vetting is a queue, not a
*session*: every *note* commits on its keystroke (PRD §5), so a reload has nothing in flight to lose.
It re-fetches the head of the queue.

Two consequences worth stating:

- **A reload does not end the vetting run.** `ended_at` is set by `Esc`, Done and the idle sweep, and
  by nothing else (`04` §7.1). So `Z` still works after a reload — which is why ADR 0033 makes `Z`'s
  target a database read rather than client memory.
- **Re-entering `/vet` within the idle window rejoins the open run**; after it, a new
  `vetting_session` row starts and the previous run's rejections are already permanent.

⚠️ **Leaving `/review` mid-session and coming back resumes it.** There is no discard action in v1.
The snapshot's lifetime is bounded but unspecified (ADR 0014 says it expires and does not say when);
once it expires, the next entry composes a fresh *session*, and the *grades* already flushed are
already history. `10-screen-specifications.md` or Phase 6 names the number.

---

## 7. While an ingestion is running, and when the worker is not

`03` §11 has the states. These are the flows, and they are shaped by the fact that Ingest has no
client.

**A run in flight, on `/`:** the *ingestion*'s status and its per-chunk progress, from `ingestion`
and `ingestion_chunk` (`04` §6.1, §6.2), as of page load. There is no auto-refresh anywhere in the
shell (§2). The reader who wants to watch reloads; the reader who wants to work presses Vet, and
**the queue that actually grows is the one on the screen with a client** (§3 step 10).

| Case | On `/` | On `/vet` |
| --- | --- | --- |
| Running, notes appearing | Chunks done of total, as of load | Notes keep arriving; the count in the chrome bar rises |
| Complete, zero new *notes* | Candidates extracted, and how many each filter dropped, from `ingestion.candidates_*`. **A success** (PRD §5) | "Nothing to vet", the Ingest affordance |
| `incomplete` | What completed, and a resume action. `incomplete` is a resumable state, not an error (`04` §6.1) | Whatever was produced is vettable now |
| `failed` | The chunk failed after bounded retries. **The provider is never named at the reader** (`03` §11) | Same |
| Queued, never claimed | Queued for *n* minutes, not yet picked up | "Nothing to vet yet — an ingestion is queued" |

**The worker that is not running is the last row, and the honest statement is the one the job table
can support.** `job.heartbeat_at` is refreshed every 30 seconds *while working* (`04` §6.4), so an
idle worker looks exactly like an absent one. There is no liveness signal in the schema and this
document does not invent one.

So **Ingest reports what the job table knows**: `state = 'queued'`, `claimed_at IS NULL`, and how
long. `03` §11's "Ingest says so plainly" is satisfied by the fact, not by a diagnosis. At one reader
the worker runs on the laptop in front of the person reading the screen, and "queued for four
minutes, not picked up" is the actionable sentence; "the worker is down" would be a guess dressed as
a status.

The other half of a dead laptop is already handled and needs no screen: a job stuck in `claimed` with
a `heartbeat_at` older than five minutes is reclaimed by the next worker to look (`04` §6.4). The
reader sees the run resume.

---

## 8. Every empty state, as a flow

PRD §4 makes these requirements. Two of them gained a case while this document was written.

| Screen | State | Shows | The way on |
| --- | --- | --- | --- |
| **Ingest** | Nothing ingested | The paste box. The only screen that works empty | The form |
| **Vet** | Nothing to vet, nothing running | "Nothing to vet." | Done, **and** the quiet Ingest affordance (ADR 0032) |
| **Vet** | ⚠️ Nothing to vet **yet**, an *ingestion* queued or running | What is running, and how far | Wait, or Done |
| **Vet** | Queue emptied mid-run while a *source* is still generating | Same as above, without leaving the mode | Wait |
| **Review** | Nothing ever *accepted* | Points at *Vet* | Done. The *session*-size knob lives here |
| **Review** | All *accepted*, nothing due | **When the next *card* is due** | Done |
| **Review** | *Session* just finished | The numbers, and an offer. **Never starts one** (`S7`) | `space`, or Done |
| **Sources** | Nothing ingested | "Nothing ingested." Points at Ingest | The nav |
| **Stats** | Under 20 vetted *notes* | Raw counts, ratios suppressed, **and a line saying why** | The nav |

⚠️ ***Vet* has three empty states, not one.** PRD §4 wrote one, and the difference between "nothing
to vet" and "nothing to vet yet" is the difference between leaving and waiting thirty seconds. `S2`
promises the first *note* is vettable while the rest are still generating, which means the queue
running dry mid-run is a normal event and not an ending. `10-screen-specifications.md` owns all
three.

**Empty *Vet* is where ADR 0013's gap actually closes.** That ADR claimed to have closed it and could
not: the gap is on *Vet*, ADR 0013 made *Vet* a *mode*, and a mode has no navigation. Two controls
close it and they are not the same control — Done returns the reader to the *place* they came from,
which may be Sources; the affordance the Phase 2 canvas already drew (`05` §1, §7) says what to do
instead. ADR 0013's objection to a pointer target on *Vet* was about the screen with *notes* in it,
where `S3` measures one keystroke per note. **An empty queue has no keystroke to protect.**

---

## 9. What this hands forward

- **`10-screen-specifications.md`** — the start block, which is a component the canvas never drew and
  which has to read as different from the nav beside it (ADR 0032); the Done confirmation on *Vet*
  (ADR 0033); the *progress rail*'s fourth mark for a flagged position (§4.9); ***Vet*'s three empty
  states**, not one (§8); the *session*-size knob's two homes (§4.7); whether *Vet*'s edit fields are
  single-line, which `Enter`-to-commit assumes (§4.3); and the *source* delete confirmation page,
  which is a *place* the canvas never drew (§4.11).
- **`11-testing-plan.md`** — five this document generates, on top of the ones `04` §14 and `08` §11
  already own: `from` rejects a path outside the three *places* and falls back to `/`; Done on *Vet*
  makes a rejection permanent and `Z` before it does not; a `Z` on an acceptance whose *card* has
  reached a *review session* fails on the `RESTRICT` rather than deleting; the over-cap paste is
  re-rendered with its text intact; deleting a *source* suspends its *cards* and leaves `review_log`
  row-for-row identical.
- **`04-database-schema.md`** — ⚠️ **one amendment, not a note for later.** §9.1's "there is no path"
  for `card` needs the `Z` exception (§5.3, ADR 0033).
- **`03-technical-design.md`** — §8.1 describes the outbox as carrying *grades*. It carries *grades*
  and `S9` flags (§4.9). One sentence.
- **Phase 6** — the `external` prop on every mode exit (§5.2) is the kind of thing that works in
  development and quietly ships a hydrated *place* in production. It belongs on the same list as the
  `noScripts` smoke test, and the same `curl`-and-grep proves both.

**Nothing here depends on a Vercel-only feature.** The four new page routes are ordinary Nitro
routes, the two form handlers are ordinary `POST`s, and the export is a `GET` that streams — so
ADR 0022's move stays a preset change plus a `pg_dump`.
