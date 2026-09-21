CREATE TABLE "meaning_synonym" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" text NOT NULL,
	"note_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meaning_synonym_owner_note_text" UNIQUE("owner_id","note_id","text"),
	CONSTRAINT "meaning_synonym_text" CHECK (length(btrim("meaning_synonym"."text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "note_meaning" (
	"note_id" uuid PRIMARY KEY NOT NULL,
	"meanings" text[] NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_meaning_not_empty" CHECK (cardinality("note_meaning"."meanings") > 0)
);
--> statement-breakpoint
ALTER TABLE "meaning_synonym" ADD CONSTRAINT "meaning_synonym_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning_synonym" ADD CONSTRAINT "meaning_synonym_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_meaning" ADD CONSTRAINT "note_meaning_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;