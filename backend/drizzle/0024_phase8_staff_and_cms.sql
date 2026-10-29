CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"display_name" text,
	"job_title" text,
	"bio" text,
	"avatar_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "staff_members_role_check" CHECK ("role" in ('owner', 'admin', 'editor', 'support', 'analyst'))
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"variants" jsonb DEFAULT '{}'::jsonb,
	"alt_text" text,
	"is_decorative" boolean DEFAULT false NOT NULL,
	"caption" text,
	"credit" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "content_posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'blog' NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"body_md" text DEFAULT '' NOT NULL,
	"cover_media_id" uuid,
	"cover_alt" text,
	"author_staff_id" uuid NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"og_media_id" uuid,
	"canonical_url" text,
	"noindex" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"updated_by" uuid,
	"rule_id" text,
	"platform" text,
	"sections" jsonb,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_posts_type_check" CHECK ("type" in ('blog', 'guide')),
	CONSTRAINT "content_posts_status_check" CHECK ("status" in ('draft', 'scheduled', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"post_id" uuid,
	"page_key" text,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"page_key" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_version" integer DEFAULT 1 NOT NULL,
	"effective_date" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_pages_page_key_unique" UNIQUE("page_key")
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status_code" integer DEFAULT 301 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_from_path_unique" UNIQUE("from_path")
);
--> statement-breakpoint
CREATE TABLE "changelog_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'new' NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"show_in_app" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changelog_entries_type_check" CHECK ("type" in ('new', 'improved', 'fixed'))
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"surface" text DEFAULT 'both' NOT NULL,
	"message" text NOT NULL,
	"link_url" text,
	"style" text DEFAULT 'info' NOT NULL,
	"audience" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"dismissible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "banners_surface_check" CHECK ("surface" in ('site', 'app', 'both')),
	CONSTRAINT "banners_style_check" CHECK ("style" in ('info', 'success', 'warning'))
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"support_email" text DEFAULT 'support@everyvisitor.app' NOT NULL,
	"banned_words" text[] DEFAULT array['compliant', 'compliance guaranteed', 'ada-proof', 'lawsuit-proof', 'certified', '100% accessible']::text[] NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"deploy_hook_configured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_deploys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"requested_by" uuid,
	"cf_deployment_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_deploys_status_check" CHECK ("status" in ('queued', 'building', 'live', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"id" uuid PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"metric" text NOT NULL,
	"dimension" text,
	"value" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_cache" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cache_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_cache_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "org_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"author_staff_id" uuid NOT NULL,
	"body_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_health" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"band" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_health_org_id_unique" UNIQUE("org_id"),
	CONSTRAINT "org_health_band_check" CHECK ("band" in ('good', 'at_risk', 'poor'))
);
--> statement-breakpoint
CREATE TABLE "staff_emails" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"body_md" text NOT NULL,
	"sent_by" uuid NOT NULL,
	"resend_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellation_reasons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "first_utm" jsonb;
--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_cover_media_id_media_assets_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_author_staff_id_staff_members_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_og_media_id_media_assets_id_fk" FOREIGN KEY ("og_media_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_rule_id_rules_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("rule_id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_post_id_content_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_deploys" ADD CONSTRAINT "site_deploys_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_notes" ADD CONSTRAINT "org_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_notes" ADD CONSTRAINT "org_notes_author_staff_id_staff_members_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_tags" ADD CONSTRAINT "org_tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "org_health" ADD CONSTRAINT "org_health_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_emails" ADD CONSTRAINT "staff_emails_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_emails" ADD CONSTRAINT "staff_emails_sent_by_staff_members_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cancellation_reasons" ADD CONSTRAINT "cancellation_reasons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saved_segments" ADD CONSTRAINT "saved_segments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "content_posts_type_slug_unique" ON "content_posts" ("type", "slug");
--> statement-breakpoint
CREATE INDEX "content_revisions_post_id_idx" ON "content_revisions" ("post_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_daily_date_metric_dimension_unique" ON "metrics_daily" ("date", "metric", coalesce("dimension", ''));
--> statement-breakpoint
CREATE INDEX "metrics_daily_metric_date_idx" ON "metrics_daily" ("metric", "date");
--> statement-breakpoint
CREATE INDEX "org_notes_org_id_idx" ON "org_notes" ("org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "org_tags_org_tag_unique" ON "org_tags" ("org_id", "tag");
--> statement-breakpoint
CREATE INDEX "staff_emails_org_id_idx" ON "staff_emails" ("org_id");
--> statement-breakpoint
CREATE INDEX "cancellation_reasons_org_id_idx" ON "cancellation_reasons" ("org_id");
--> statement-breakpoint
CREATE TRIGGER staff_members_set_updated_at BEFORE UPDATE ON staff_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER media_assets_set_updated_at BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER content_posts_set_updated_at BEFORE UPDATE ON content_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER content_revisions_set_updated_at BEFORE UPDATE ON content_revisions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER content_pages_set_updated_at BEFORE UPDATE ON content_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER redirects_set_updated_at BEFORE UPDATE ON redirects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER changelog_entries_set_updated_at BEFORE UPDATE ON changelog_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER banners_set_updated_at BEFORE UPDATE ON banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER site_settings_set_updated_at BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER site_deploys_set_updated_at BEFORE UPDATE ON site_deploys FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER metrics_daily_set_updated_at BEFORE UPDATE ON metrics_daily FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER analytics_cache_set_updated_at BEFORE UPDATE ON analytics_cache FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER org_notes_set_updated_at BEFORE UPDATE ON org_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER org_tags_set_updated_at BEFORE UPDATE ON org_tags FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER org_health_set_updated_at BEFORE UPDATE ON org_health FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER staff_emails_set_updated_at BEFORE UPDATE ON staff_emails FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER saved_segments_set_updated_at BEFORE UPDATE ON saved_segments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
INSERT INTO "site_settings" ("id", "support_email", "maintenance_mode", "deploy_hook_configured")
VALUES ('default', 'support@everyvisitor.app', false, false)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "staff_members" ("id", "user_id", "role", "display_name", "active")
SELECT gen_random_uuid(), "id", 'owner', coalesce("name", 'Owner'), true
FROM "users"
WHERE "is_staff" = true
ON CONFLICT ("user_id") DO NOTHING;
