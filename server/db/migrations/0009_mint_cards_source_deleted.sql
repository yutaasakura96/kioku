-- `S11` — a *card* minted for a deleted *source*'s *note* is minted suspended.
--
-- `04` §9.1 and `09` §4.11: every *card* whose *note* originated in a deleted
-- *source* is suspended. `deleteSource` suspends the ones that exist, but an
-- ingestion still running keeps writing *chunks* after the `POST`, and each of
-- them mints through here. So the rule is held at the mint as well: the *card*
-- is still created — `ON CONFLICT DO NOTHING` and every caller rely on it
-- existing — with `suspended_reason = 'source_deleted'`.
--
-- ⚠️ "Originated" is `note.origin_ingestion_id` → `ingestion.source_id`, the
-- same predicate `server/utils/ingest/delete.ts` suspends by.
--
-- ⚠️ `FOR SHARE OF s` serialises this with `deleteSource`, whose `UPDATE source`
-- takes the row lock first. The lock is taken whatever `deleted_at` reads, so a
-- delete committed while this waits is re-read rather than missed; a mint that
-- locks first makes the delete wait, and its *card* UPDATE then sees this one.

CREATE OR REPLACE FUNCTION mint_cards(p_note_id uuid, p_owner_id text, p_template_keys text[])
RETURNS void AS $$
  INSERT INTO card (note_id, owner_id, template_key, suspended_at, suspended_reason)
  SELECT p_note_id, p_owner_id, template_key,
    CASE WHEN origin.deleted_at IS NOT NULL THEN now() END,
    CASE WHEN origin.deleted_at IS NOT NULL THEN 'source_deleted' END
  FROM unnest(p_template_keys) AS template_key
  LEFT JOIN (
    SELECT s.deleted_at
    FROM note n
    JOIN ingestion i ON i.id = n.origin_ingestion_id
    JOIN source s ON s.id = i.source_id
    WHERE n.id = p_note_id
    FOR SHARE OF s
  ) AS origin ON true
  ON CONFLICT (owner_id, note_id, template_key) DO NOTHING;
$$ LANGUAGE sql;
