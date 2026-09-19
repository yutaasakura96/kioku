ALTER TABLE "review_session" ADD COLUMN "new_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_session" ADD COLUMN "zone" text;--> statement-breakpoint
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_new_count" CHECK ("review_session"."new_count" >= 0 AND "review_session"."new_count" <= "review_session"."size");