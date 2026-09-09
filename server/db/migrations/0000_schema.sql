CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"template_key" text NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_suspended_reason" CHECK ("card"."suspended_reason" IN ('flagged','source_deleted'))
);
--> statement-breakpoint
CREATE TABLE "card_flag" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"source_id" uuid,
	"prompt_version" text,
	"model_id" text,
	"review_session_id" uuid,
	"flagged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "note_vetting" (
	"note_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"seconds_to_vet" numeric(6, 2),
	"vetting_session_id" uuid,
	"vetted_at" timestamp with time zone,
	"flagged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_vetting_note_id_owner_id_pk" PRIMARY KEY("note_id","owner_id"),
	CONSTRAINT "note_vetting_state" CHECK ("note_vetting"."state" IN ('pending','accepted','rejected'))
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"scheduling_epoch_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"review_session_id" uuid,
	"rating" smallint NOT NULL,
	"state" smallint NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" double precision NOT NULL,
	"difficulty" double precision NOT NULL,
	"scheduled_days" integer NOT NULL,
	"learning_steps" integer NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_skew_seconds" integer,
	CONSTRAINT "review_log_rating" CHECK ("review_log"."rating" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "review_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" text NOT NULL,
	"size" integer DEFAULT 20 NOT NULL,
	"snapshot_taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "review_session_size" CHECK ("review_session"."size" > 0 AND "review_session"."size" <= 200)
);
--> statement-breakpoint
CREATE TABLE "review_session_card" (
	"review_session_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"card_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	CONSTRAINT "review_session_card_review_session_id_ordinal_pk" PRIMARY KEY("review_session_id","ordinal"),
	CONSTRAINT "review_session_card_session_card_key" UNIQUE("review_session_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "scheduling_epoch" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_reason" text,
	"due" timestamp with time zone NOT NULL,
	"stability" double precision NOT NULL,
	"difficulty" double precision NOT NULL,
	"scheduled_days" integer NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" smallint DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	CONSTRAINT "scheduling_epoch_card_ordinal_key" UNIQUE("card_id","ordinal"),
	CONSTRAINT "scheduling_epoch_superseded_reason" CHECK ("scheduling_epoch"."superseded_reason" IN ('memory_bearing_field_changed','manual_reset')),
	CONSTRAINT "scheduling_epoch_state" CHECK ("scheduling_epoch"."state" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "vetting_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "generation_cache" (
	"content_hash" text NOT NULL,
	"dictionary_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model_id" text NOT NULL,
	"response" jsonb NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_cache_content_hash_dictionary_version_prompt_version_model_id_pk" PRIMARY KEY("content_hash","dictionary_version","prompt_version","model_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid,
	"source_title" text NOT NULL,
	"subject_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"submitted_by" text,
	"model_id" text,
	"prompt_version" text,
	"dictionary_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micro_usd" bigint,
	"price_table_effective_date" date,
	"candidates_extracted" integer,
	"candidates_deduplicated" integer,
	"candidates_already_known" integer,
	"candidates_rejected" integer,
	"worker_environment" text DEFAULT 'laptop' NOT NULL,
	CONSTRAINT "ingestion_status" CHECK ("ingestion"."status" IN ('queued','running','complete','incomplete','failed')),
	CONSTRAINT "ingestion_worker_environment" CHECK ("ingestion"."worker_environment" IN ('laptop','server'))
);
--> statement-breakpoint
CREATE TABLE "ingestion_chunk" (
	"ingestion_id" uuid NOT NULL,
	"source_chunk_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ingestion_chunk_ingestion_id_source_chunk_id_pk" PRIMARY KEY("ingestion_id","source_chunk_id"),
	CONSTRAINT "ingestion_chunk_status" CHECK ("ingestion_chunk"."status" IN ('pending','running','complete','failed'))
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"ingestion_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_kind" CHECK ("job"."kind" IN ('ingest','resume')),
	CONSTRAINT "job_state" CHECK ("job"."state" IN ('queued','claimed','done','failed'))
);
--> statement-breakpoint
CREATE TABLE "level_claim" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"authority_key" text,
	"level" text NOT NULL,
	"model_id" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_claim_note_authority_key" UNIQUE NULLS NOT DISTINCT("note_id","authority_key"),
	CONSTRAINT "level_claim_attribution" CHECK (("level_claim"."authority_key" IS NULL) = ("level_claim"."model_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" text NOT NULL,
	"identity_key" text NOT NULL,
	"fields" jsonb NOT NULL,
	"origin_ingestion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_field_provenance" (
	"note_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"kind" text NOT NULL,
	"model_id" text,
	"prompt_version" text,
	"dictionary_version" text,
	"is_oov" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_field_provenance_note_id_field_name_pk" PRIMARY KEY("note_id","field_name"),
	CONSTRAINT "note_field_provenance_kind" CHECK ("note_field_provenance"."kind" IN ('lookup','judgement','generated','human'))
);
--> statement-breakpoint
CREATE TABLE "occurrence" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_chunk_id" uuid NOT NULL,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"surface_form" text NOT NULL,
	"ingestion_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_note_source_start_key" UNIQUE("note_id","source_id","char_start"),
	CONSTRAINT "occurrence_range" CHECK ("occurrence"."char_end" > "occurrence"."char_start")
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"char_count" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_char_count_cap" CHECK ("source"."char_count" > 0 AND "source"."char_count" <= 100000)
);
--> statement-breakpoint
CREATE TABLE "source_chunk" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_chunk_source_ordinal_key" UNIQUE("source_id","ordinal"),
	CONSTRAINT "source_chunk_range" CHECK ("source_chunk"."char_end" > "source_chunk"."char_start")
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_flag" ADD CONSTRAINT "card_flag_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_flag" ADD CONSTRAINT "card_flag_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_flag" ADD CONSTRAINT "card_flag_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_flag" ADD CONSTRAINT "card_flag_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_flag" ADD CONSTRAINT "card_flag_review_session_id_review_session_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_vetting" ADD CONSTRAINT "note_vetting_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_vetting" ADD CONSTRAINT "note_vetting_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_vetting" ADD CONSTRAINT "note_vetting_vetting_session_id_vetting_session_id_fk" FOREIGN KEY ("vetting_session_id") REFERENCES "public"."vetting_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_scheduling_epoch_id_scheduling_epoch_id_fk" FOREIGN KEY ("scheduling_epoch_id") REFERENCES "public"."scheduling_epoch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_review_session_id_review_session_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_session" ADD CONSTRAINT "review_session_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_session_card" ADD CONSTRAINT "review_session_card_review_session_id_review_session_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_session_card" ADD CONSTRAINT "review_session_card_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_session_card" ADD CONSTRAINT "review_session_card_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_epoch" ADD CONSTRAINT "scheduling_epoch_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_epoch" ADD CONSTRAINT "scheduling_epoch_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vetting_session" ADD CONSTRAINT "vetting_session_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion" ADD CONSTRAINT "ingestion_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion" ADD CONSTRAINT "ingestion_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_chunk" ADD CONSTRAINT "ingestion_chunk_ingestion_id_ingestion_id_fk" FOREIGN KEY ("ingestion_id") REFERENCES "public"."ingestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_chunk" ADD CONSTRAINT "ingestion_chunk_source_chunk_id_source_chunk_id_fk" FOREIGN KEY ("source_chunk_id") REFERENCES "public"."source_chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_ingestion_id_ingestion_id_fk" FOREIGN KEY ("ingestion_id") REFERENCES "public"."ingestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_claim" ADD CONSTRAINT "level_claim_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_origin_ingestion_id_ingestion_id_fk" FOREIGN KEY ("origin_ingestion_id") REFERENCES "public"."ingestion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_field_provenance" ADD CONSTRAINT "note_field_provenance_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_source_chunk_id_source_chunk_id_fk" FOREIGN KEY ("source_chunk_id") REFERENCES "public"."source_chunk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_ingestion_id_ingestion_id_fk" FOREIGN KEY ("ingestion_id") REFERENCES "public"."ingestion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunk" ADD CONSTRAINT "source_chunk_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "auth"."verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "card_owner_note_template_key" ON "card" USING btree ("owner_id","note_id","template_key");--> statement-breakpoint
CREATE INDEX "card_flag_source_prompt_idx" ON "card_flag" USING btree ("source_id","prompt_version");--> statement-breakpoint
CREATE INDEX "card_flag_unresolved_note_idx" ON "card_flag" USING btree ("note_id") WHERE "card_flag"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "note_vetting_pending_idx" ON "note_vetting" USING btree ("owner_id","state") WHERE "note_vetting"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "note_vetting_owner_vetted_idx" ON "note_vetting" USING btree ("owner_id","vetted_at");--> statement-breakpoint
CREATE INDEX "review_log_epoch_reviewed_idx" ON "review_log" USING btree ("scheduling_epoch_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "review_log_owner_received_idx" ON "review_log" USING btree ("owner_id","received_at");--> statement-breakpoint
CREATE INDEX "review_session_card_card_idx" ON "review_session_card" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_epoch_one_live_per_card" ON "scheduling_epoch" USING btree ("card_id") WHERE "scheduling_epoch"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "scheduling_epoch_owner_due_idx" ON "scheduling_epoch" USING btree ("owner_id","due") WHERE "scheduling_epoch"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "ingestion_chunk_incomplete_idx" ON "ingestion_chunk" USING btree ("ingestion_id") WHERE "ingestion_chunk"."status" <> 'complete';--> statement-breakpoint
CREATE INDEX "job_queued_idx" ON "job" USING btree ("available_at") WHERE "job"."state" = 'queued';--> statement-breakpoint
CREATE INDEX "job_claimed_heartbeat_idx" ON "job" USING btree ("heartbeat_at") WHERE "job"."state" = 'claimed';--> statement-breakpoint
CREATE INDEX "level_claim_note_idx" ON "level_claim" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_subject_identity_key" ON "note" USING btree ("subject_id","identity_key");--> statement-breakpoint
CREATE INDEX "note_field_provenance_model_prompt_idx" ON "note_field_provenance" USING btree ("model_id","prompt_version");--> statement-breakpoint
CREATE INDEX "occurrence_source_idx" ON "occurrence" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "occurrence_note_idx" ON "occurrence" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "source_content_hash_idx" ON "source" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_subject_submitted_idx" ON "source" USING btree ("subject_id","submitted_at" DESC NULLS LAST) WHERE "source"."deleted_at" is null;