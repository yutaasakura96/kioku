-- ADR 0075, #68 — the starter set. Additive: nothing here rewrites a row.
--
-- `note_meaning` can now be attributed to a dictionary instead of a model: a
-- starter word's accepted meanings are JMdict's glosses, and no model wrote
-- them. Exactly one attribution is set. Every existing row carries a model and
-- a prompt, so the new `CHECK` holds for all of them as they stand.
--
-- The index is the category read: the words one *authority* puts at one
-- *level*.

ALTER TABLE "note_meaning" ALTER COLUMN "model_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "note_meaning" ALTER COLUMN "prompt_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "note_meaning" ADD COLUMN "dictionary_version" text;--> statement-breakpoint
CREATE INDEX "level_claim_authority_level_idx" ON "level_claim" USING btree ("authority_key","level") WHERE "level_claim"."authority_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "note_meaning" ADD CONSTRAINT "note_meaning_attribution" CHECK (("note_meaning"."dictionary_version" IS NULL) = ("note_meaning"."model_id" IS NOT NULL) AND ("note_meaning"."model_id" IS NULL) = ("note_meaning"."prompt_version" IS NULL));