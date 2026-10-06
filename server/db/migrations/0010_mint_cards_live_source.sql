-- `S11` — a *card* is born suspended only when both the *source* its *note*
-- came from and the *source* of the run minting it are deleted.
--
-- `0009` decided the suspension from the *note*'s origin alone. A word the
-- deleted *source* had no *card* for, met again by a later live *source*, was
-- therefore born suspended and nothing ever un-suspends it (`04` §9.1), so it
-- never reached Review. The mint now also takes the ingestion it is minting
-- for, and a live run mints studyable. A deleted run meeting a live *source*'s
-- *note* mints studyable too: that *note* is not the deleted *source*'s to
-- withdraw (`server/utils/ingest/delete.ts`). With no ingestion named (*Vet*'s
-- acceptance) the run is the *note*'s origin, which is `0009`'s rule unchanged.
--
-- ⚠️ The signature gains a defaulted fourth parameter, so the old function is
-- dropped first: left beside it, a three-argument call would match both.
-- A three-argument caller still resolves, to the default.
--
-- ⚠️ `FOR SHARE OF s` is kept on both *source* rows the decision reads, for the
-- reason `0009` gives: it serialises the mint with `deleteSource`.

DROP FUNCTION IF EXISTS mint_cards(uuid, text, text[]);
--> statement-breakpoint

CREATE FUNCTION mint_cards(
  p_note_id uuid, p_owner_id text, p_template_keys text[], p_ingestion_id uuid DEFAULT NULL
)
RETURNS void AS $$
  INSERT INTO card (note_id, owner_id, template_key, suspended_at, suspended_reason)
  SELECT p_note_id, p_owner_id, template_key,
    CASE WHEN origin.deleted_at IS NOT NULL
      AND (p_ingestion_id IS NULL OR run.deleted_at IS NOT NULL) THEN now() END,
    CASE WHEN origin.deleted_at IS NOT NULL
      AND (p_ingestion_id IS NULL OR run.deleted_at IS NOT NULL) THEN 'source_deleted' END
  FROM unnest(p_template_keys) AS template_key
  LEFT JOIN (
    SELECT s.deleted_at
    FROM note n
    JOIN ingestion i ON i.id = n.origin_ingestion_id
    JOIN source s ON s.id = i.source_id
    WHERE n.id = p_note_id
    FOR SHARE OF s
  ) AS origin ON true
  LEFT JOIN (
    SELECT s.deleted_at
    FROM ingestion i
    JOIN source s ON s.id = i.source_id
    WHERE i.id = p_ingestion_id
    FOR SHARE OF s
  ) AS run ON true
  ON CONFLICT (owner_id, note_id, template_key) DO NOTHING;
$$ LANGUAGE sql;
