ALTER TABLE "content_revisions" ADD COLUMN "effective_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "content_revisions" ADD COLUMN "change_summary" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_page_version_unique" ON "content_revisions" ("page_key", "version") WHERE "page_key" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "legal_notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"page_key" text NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"link_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"recipients_total" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_notices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null,
	CONSTRAINT "legal_notices_status_check" CHECK ("status" in ('queued', 'sending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TRIGGER legal_notices_set_updated_at BEFORE UPDATE ON legal_notices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TABLE "subscription_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"from_plan" text NOT NULL,
	"from_interval" text NOT NULL,
	"to_plan" text NOT NULL,
	"to_interval" text NOT NULL,
	"mrr_delta_cents" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_changes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "subscription_changes_changed_at_idx" ON "subscription_changes" ("changed_at");
