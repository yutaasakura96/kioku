CREATE TABLE "domain_claim" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"authority_key" text,
	"domain" text NOT NULL,
	"model_id" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_claim_note_authority_key" UNIQUE NULLS NOT DISTINCT("note_id","authority_key"),
	CONSTRAINT "domain_claim_attribution" CHECK (("domain_claim"."authority_key" IS NULL) = ("domain_claim"."model_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "domain_claim" ADD CONSTRAINT "domain_claim_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_claim_note_idx" ON "domain_claim" USING btree ("note_id");