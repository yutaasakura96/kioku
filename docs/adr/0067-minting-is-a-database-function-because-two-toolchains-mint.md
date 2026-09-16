# Minting is a database function, because two toolchains mint

**Decided 2026-09-17, while building [#20](https://github.com/yutaasakura96/kioku/issues/20).**
A *card* is minted by `mint_cards(note_id, owner_id, template_keys)`, a SQL function created by
migration `0003_mint_cards.sql`. `server/utils/vet/decide.ts` and `worker/pipeline/write_notes.py` both
call it, and neither spells an `INSERT INTO card`.

## Why this needed deciding

[ADR 0064](0064-a-chosen-word-mints-its-cards-on-arrival.md) §1 says *the existing mint path is reused
rather than copied*, and says why: `04` §7.3 defines acceptance as *minting its cards*, and there
should still be exactly one place that does it. Until #20 that place was a TypeScript function, and
its only caller was *Vet*. ADR 0064 gives it a second caller in the worker, which is Python. A
TypeScript function can't be called from Python, so "reused" needed a place both toolchains could
reach, and neither ADR said where that was.

## What is decided

- **The function holds the insert and nothing else.** One row per template key, `ON CONFLICT
  (owner_id, note_id, template_key) DO NOTHING`. Deciding that a *note* is accepted stays with each
  caller, in its own transaction, because the two callers write `note_vetting` differently
  (`decide()` stamps a run, a time and `seconds_to_vet`; the worker stamps only `vetted_at`, and
  upgrades a `pending` row without touching a `rejected` one, ADR 0064 §1).
- **The caller passes the template keys.** The declaration is a file both toolchains read
  (ADR 0003) and the database does not, and `card.template_key` is not a foreign key (`04` §13).
- **It never writes a *scheduling epoch*.** `scheduling_epoch.card_id` is `RESTRICT`, so an epoch
  here would make `Z` fail on every acceptance. The first epoch belongs to the *grade*.
- **It is a function, not a trigger.** `04` §7.5 has exactly one trigger and says why. Nothing
  mints implicitly.

## Alternatives considered

**A Python copy of the insert, with a drift test comparing the two.** Rejected. It is what
#20's criterion rules out by name, and a drift test is a guard on a copy, not the absence of one.
`BLANK_CLASS` shows the cost: #19 had to keep one constant in two languages and write a test to
compare them. That was forced, because a regex has to live in each runtime. An `INSERT` doesn't have
to.

**A trigger on `note_vetting` that mints when `state` becomes `accepted`.** Rejected. It would be
the schema's second trigger, and `04` §7.5's reason for having exactly one is ADR 0011's: a trigger
guards the one irreplaceable thing. It would also make minting invisible at both call sites, which
is how an acceptance path gets written some day that expects not to mint and does.

**The worker asks the app to mint over HTTP.** Rejected. The worker never calls the app today; it
reaches the database and the model provider. The app is a Vercel deployment the worker would have to
authenticate to. And a mint that can fail on the network after the *note* is written leaves an
accepted *note* with no *card*, which is the state `decide.ts` puts two writes in one transaction to
prevent.

## Revisit if

- A second template needs different minting rules per template, and the insert stops being
  expressible without the declaration in hand.
- The EC2 move (ADR 0022) lands on a Postgres where functions are unwelcome. That is unlikely, since
  `0001` already creates one.
