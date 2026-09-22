CREATE TABLE "backfill" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"prompt_version" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"model_id" text,
	"request_count" integer DEFAULT 0 NOT NULL,
	"written" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micro_usd" bigint,
	"price_table_effective_date" date,
	"worker_environment" text DEFAULT 'laptop' NOT NULL,
	CONSTRAINT "backfill_worker_environment" CHECK ("backfill"."worker_environment" IN ('laptop','server'))
);
