ALTER TABLE "source" ADD COLUMN "kind" text DEFAULT 'prose' NOT NULL;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_kind" CHECK ("source"."kind" IN ('prose','word_list','anki'));