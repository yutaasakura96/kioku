-- #69, ADR 0077 — the one *category* the reader's new words come from.
--
-- Additive: one new table and nothing else, so the code released before it
-- keeps working against it (`03` §4.2). A reader with no row studies the first
-- declared *level*.
--
-- To reverse: `DROP TABLE active_category;`. Nothing else reads it.

CREATE TABLE "active_category" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"category_key" text NOT NULL,
	"chosen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_category" ADD CONSTRAINT "active_category_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;
