-- #70, ADR 0076 §1 and §2 — a *session* is a review run or a lesson, and the
-- reader has three study settings.
--
-- Additive: one new table, and one column with a default, so the code released
-- before it keeps working against it (`03` §4.2). A run composed before this
-- is `'review'` by the default.
--
-- To reverse: `ALTER TABLE review_session DROP COLUMN kind;` (which takes its
-- check with it) and `DROP TABLE study_setting;`. Nothing else reads either.

CREATE TABLE "study_setting" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"lesson_size" integer DEFAULT 5 NOT NULL,
	"daily_new" integer DEFAULT 10 NOT NULL,
	"pause_above" integer DEFAULT 50 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_setting_lesson_size" CHECK ("study_setting"."lesson_size" > 0),
	CONSTRAINT "study_setting_daily_new" CHECK ("study_setting"."daily_new" >= 0),
	CONSTRAINT "study_setting_pause_above" CHECK ("study_setting"."pause_above" > 0)
);
--> statement-breakpoint
ALTER TABLE "review_session" ADD COLUMN "kind" text DEFAULT 'review' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_setting" ADD CONSTRAINT "study_setting_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_kind" CHECK ("review_session"."kind" IN ('review','lesson'));