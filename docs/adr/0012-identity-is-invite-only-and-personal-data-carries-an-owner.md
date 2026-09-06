# Identity is invite-only from v1, and personal data carries an owner

`docs/01-project-brief.md` §1.1 says one user, and §6 rejects multiple users, sharing and a deck
marketplace. Both stand. What neither settles is whether the app knows *who* is using it, and that
is a different question with a much worse retrofit.

**v1 has real identity: a login, invite-only access, and exactly one invited person.** Multi-user is
not built, not designed for, and not promised — but it is no longer rejected, and the one thing that
cannot be added afterwards is recorded now.

The argument is not that a second user is coming. It is that **review history is the one thing in
this system that cannot be regenerated** (§2.4), and history written without an owner cannot be
attributed later by any amount of inference. Everything else about multi-user — sharing, permissions,
a second login — is a feature that can be built in a fortnight whenever it is wanted. Attribution is
the exception, and it costs a column.

## What is shared and what is personal

The split is not "put an owner on everything". ADR 0009 already wrote the deciding sentence: *a
card's scheduling state models your memory of a fact*. Follow that line and the entities separate on
their own.

**Shared** — true regardless of who is asking, and expensive to generate twice:

- the **source** and its content
- a **note**'s fields, its **occurrences**, and its **level claims**

**Personal** — a statement about one person, not about the material:

- **cards** and their scheduling state, including **scheduling epochs**
- **grades**
- **vetting state** — pending, accepted, rejected

Vetting state is the one that is easy to miss. ADR 0006 made rejection permanent and observed that
the rejected set accumulates into a lexicon of what is already known. That makes *rejected* a claim
about the reader, not about the word, and two people disagree about it legitimately.

## Decisions

- **Every entity is labelled shared or personal.** The label is part of the product specification,
  not an artifact of the schema.
- **Personal entities carry an owner from the first row written.** No sharing UI, no second invited
  user, no permission checks — the column and the label, nothing more.
- **Access is invite-only.** There is no self-registration, ever. It is the whole of the access
  control story and it is what keeps §6's rejection of a deck marketplace true by construction.
- **The gate also protects a bill.** ADR 0010 made ingestion a background job that spends money on
  LLM calls. An open ingest endpoint is somebody else's spend, independently of any privacy argument.

## Considered options

- **No identity at all in v1 — single-tenant, ownerless, add users if they ever appear.** Cheaper
  today, and rejected because the migration it defers is a migration of live scheduling history:
  exactly the data ADR 0011 built two independent guards around. Paying one column now to avoid
  touching that later is the trade this project keeps making deliberately.
- **Full multi-user in v1 — sharing, per-user views, an invite flow with roles.** Rejected as the
  over-engineering §4.2 warns about, and it contradicts §6 rather than deferring to it. One user is
  still the design target; the app merely knows his name.

## Held for Phase 4, not decided here

The mechanism — stated preference **Better Auth with Google OIDC** — is `docs/01-project-brief.md`
§4.12 and is **unverified**. Per `CLAUDE.md` it is checked against real documentation before it
becomes a decision, in doc `03-technical-design.md`. It is recorded as a preference so it is not lost,
not as a choice already made.

**Doc `08-auth-and-permissions.md` is triggered** by this ADR and is written in Phase 4.

## Revisit if

A second person is actually invited. At that point the shared/personal split stops being a label and
starts being enforced, and the note-level questions this ADR deliberately leaves open — whose
acceptance mints whose cards, whether one person's rejection hides a word from another — become due.
