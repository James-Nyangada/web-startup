CREATE TABLE "report_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"recipients" text[] NOT NULL,
	"day_of_month" integer NOT NULL,
	"type" text DEFAULT 'client_monthly' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_schedules_day_check" CHECK ("report_schedules"."day_of_month" >= 1 and "report_schedules"."day_of_month" <= 28)
);
--> statement-breakpoint
CREATE TABLE "evidence_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "evidence_events_type_check" CHECK ("evidence_events"."type" in ('site_added', 'site_verified', 'scan_completed', 'issue_fixed', 'issue_regressed', 'issue_ignored', 'manual_check_logged', 'statement_published', 'report_generated', 'report_sent', 'plan_changed'))
);
--> statement-breakpoint
CREATE TABLE "manual_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"check_type" text NOT NULL,
	"performed_at" date NOT NULL,
	"performed_by_name" text NOT NULL,
	"tool" text NOT NULL,
	"result" text NOT NULL,
	"notes" text NOT NULL,
	"attachment_key" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_checks_type_check" CHECK ("manual_checks"."check_type" in ('keyboard', 'screen_reader', 'zoom_reflow', 'color_contrast_manual', 'captions', 'forms', 'other')),
	CONSTRAINT "manual_checks_result_check" CHECK ("manual_checks"."result" in ('pass', 'issues_found', 'partial'))
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_html" text,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statements_status_check" CHECK ("statements"."status" in ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url_encrypted" text NOT NULL,
	"events" text[] NOT NULL,
	"site_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_status" integer,
	"last_error" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhooks_kind_check" CHECK ("webhooks"."kind" in ('slack', 'generic'))
);
--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_events" ADD CONSTRAINT "evidence_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_events" ADD CONSTRAINT "evidence_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_events" ADD CONSTRAINT "evidence_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_checks" ADD CONSTRAINT "manual_checks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_checks" ADD CONSTRAINT "manual_checks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_checks" ADD CONSTRAINT "manual_checks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_schedules_org_site_idx" ON "report_schedules" USING btree ("org_id","site_id");--> statement-breakpoint
CREATE INDEX "report_schedules_day_active_idx" ON "report_schedules" USING btree ("day_of_month","active");--> statement-breakpoint
CREATE INDEX "evidence_events_org_site_occurred_idx" ON "evidence_events" USING btree ("org_id","site_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "evidence_events_site_type_idx" ON "evidence_events" USING btree ("site_id","type");--> statement-breakpoint
CREATE INDEX "manual_checks_site_performed_idx" ON "manual_checks" USING btree ("site_id","performed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "manual_checks_org_id_idx" ON "manual_checks" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statements_site_version_unique" ON "statements" USING btree ("site_id","version");--> statement-breakpoint
CREATE INDEX "statements_site_status_idx" ON "statements" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "webhooks_org_id_idx" ON "webhooks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "webhooks_active_idx" ON "webhooks" USING btree ("active");