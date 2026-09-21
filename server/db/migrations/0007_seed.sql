CREATE TABLE "seed" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" text NOT NULL,
	"domain" text NOT NULL,
	"level" text NOT NULL,
	"count" integer NOT NULL,
	"requested_by" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"model_id" text,
	"prompt_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micro_usd" bigint,
	"price_table_effective_date" date,
	"excluded_term_count" integer,
	"terms" text[],
	"worker_environment" text DEFAULT 'laptop' NOT NULL,
	"source_id" uuid,
	"submitted_at" timestamp with time zone,
	"discarded_at" timestamp with time zone,
	CONSTRAINT "seed_count" CHECK ("seed"."count" BETWEEN 1 AND 100),
	CONSTRAINT "seed_worker_environment" CHECK ("seed"."worker_environment" IN ('laptop','server')),
	CONSTRAINT "seed_disposition" CHECK ("seed"."submitted_at" IS NULL OR "seed"."discarded_at" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT "job_kind";--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "ingestion_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "seed_id" uuid;--> statement-breakpoint
ALTER TABLE "seed" ADD CONSTRAINT "seed_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed" ADD CONSTRAINT "seed_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seed_open_idx" ON "seed" USING btree ("requested_by","requested_at" DESC NULLS LAST) WHERE "seed"."submitted_at" IS NULL AND "seed"."discarded_at" IS NULL;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_seed_id_seed_id_fk" FOREIGN KEY ("seed_id") REFERENCES "public"."seed"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_target" CHECK (("job"."kind" = 'seed') = ("job"."seed_id" IS NOT NULL) AND num_nonnulls("job"."ingestion_id", "job"."seed_id") = 1);--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_kind" CHECK ("job"."kind" IN ('ingest','resume','seed'));