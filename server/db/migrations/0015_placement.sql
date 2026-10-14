-- #72, ADR 0079 — where the reader was placed, and which words the placement
-- chose to spot-check.
--
-- Additive: two new tables and nothing else, so the code released before it
-- keeps working against it (`03` §4.2). A reader with no row has no placement.
--
-- To reverse: `DROP TABLE placement_check; DROP TABLE placement;`. The spot-checked
-- words' *cards* and epochs are ordinary rows and stay.

CREATE TABLE "placement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"kind" text NOT NULL,
	"level" text,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_kind" CHECK ("placement"."kind" IN ('test','declared'))
);
--> statement-breakpoint
CREATE TABLE "placement_check" (
	"placement_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "placement_check_placement_id_note_id_pk" PRIMARY KEY("placement_id","note_id")
);
--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_check" ADD CONSTRAINT "placement_check_placement_id_placement_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_check" ADD CONSTRAINT "placement_check_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_check" ADD CONSTRAINT "placement_check_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placement_owner_placed_idx" ON "placement" USING btree ("owner_id","placed_at");