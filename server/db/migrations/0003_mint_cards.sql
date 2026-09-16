-- ADR 0067 — minting is a database function, because two toolchains mint.
--
-- `04` §7.3: a *card* is "minted at acceptance, never before", and until ADR 0064
-- acceptance had one caller, `server/utils/vet/decide.ts`. ADR 0064 gives it a
-- second in the worker — a chosen word is `accepted` when it is written — and
-- #20's criterion is that the existing mint path is reused rather than copied.
-- A TypeScript function cannot be called from Python, so the path moves to the
-- one place both of them already talk to.
--
-- ⚠️ THIS IS A FUNCTION, NOT A TRIGGER. `04` §7.5 has exactly one trigger and
-- says so. Nothing mints implicitly: each caller decides that a *note* is
-- accepted and then asks for its *cards*, in its own transaction.
--
-- ⚠️ ONE CARD PER DECLARED TEMPLATE, and the caller passes the template keys
-- because the declaration is a file both toolchains read (ADR 0003) and the
-- database does not. `card.template_key` is deliberately not a foreign key
-- (`04` §13).
--
-- ⚠️ `ON CONFLICT DO NOTHING` because a re-acceptance after `Z` (ADR 0033) and a
-- resumed chunk (`03` §5.4) are both legal round trips, and neither may fail on
-- the *card* an earlier call already minted.
--
-- ⚠️ IT NEVER WRITES A SCHEDULING EPOCH. `scheduling_epoch.card_id` is
-- `RESTRICT`, so an epoch here would make `Z` fail on every acceptance
-- (`test/schema/vet.test.ts` asserts the absence). The first epoch belongs to
-- the *grade* that first schedules the *card*.

CREATE OR REPLACE FUNCTION mint_cards(p_note_id uuid, p_owner_id text, p_template_keys text[])
RETURNS void AS $$
  INSERT INTO card (note_id, owner_id, template_key)
  SELECT p_note_id, p_owner_id, template_key
  FROM unnest(p_template_keys) AS template_key
  ON CONFLICT (owner_id, note_id, template_key) DO NOTHING;
$$ LANGUAGE sql;
