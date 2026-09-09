-- `04-database-schema.md` §7.5 and §14 — the append-only guard on `review_log`.
--
-- ⚠️ THIS IS THE ONLY TRIGGER IN THE SCHEMA, and it is here rather than anywhere
-- else because ADR 0011's pattern — pin the irreplaceable data and guard it in
-- more than one place — names exactly one thing as irreplaceable. `03` §13.6
-- names destroying review history as the worst thing an attacker could do.
--
-- Append-only is enforced TWICE and both halves are deliberate: the application
-- never issues `UPDATE` or `DELETE` against this table, and this trigger raises
-- if anything does. A guard that exists only in application code is a guard that
-- a migration, a psql session or a future handler walks straight past.
--
-- It is a raw SQL migration because drizzle-kit generates tables, not triggers.
-- That is still ONE migration owner (`03` §4.2): it lives in this directory, it
-- runs in this order, and the worker issues no DDL of its own.
--
-- ⚠️ `DELETE` is guarded as well as `UPDATE`. `11-testing-plan.md` §5 asserts
-- both, and the `DELETE` half is the one an "archive old rows" cleanup would
-- reach for.

CREATE OR REPLACE FUNCTION review_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'review_log is append-only: % refused (04 §7.5, ADR 0011)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER review_log_append_only
  BEFORE UPDATE OR DELETE ON review_log
  FOR EACH ROW EXECUTE FUNCTION review_log_append_only();
