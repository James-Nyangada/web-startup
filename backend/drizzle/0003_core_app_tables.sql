CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branding" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"display_name" text,
	"logo_light_key" text,
	"logo_dark_key" text,
	"primary_color" text,
	"email_sender_name" text,
	"report_footer" text,
	"hide_product_brand" boolean DEFAULT false NOT NULL,
	"custom_domain" "citext",
	"custom_domain_verified_at" timestamp with time zone,
	"custom_domain_verify_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branding_org_id_unique" UNIQUE("org_id"),
	CONSTRAINT "branding_custom_domain_unique" UNIQUE("custom_domain")
);
--> statement-breakpoint
CREATE TABLE "client_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"role" text NOT NULL,
	"site_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_role_check" CHECK ("invitations"."role" in ('admin', 'member', 'client_viewer'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fix_guides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"platform" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"source" text DEFAULT 'written' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fix_guides_slug_unique" UNIQUE("slug"),
	CONSTRAINT "fix_guides_platform_check" CHECK ("fix_guides"."platform" in ('shopify', 'wordpress', 'woocommerce', 'webflow', 'wix', 'squarespace', 'custom', 'unknown')),
	CONSTRAINT "fix_guides_source_check" CHECK ("fix_guides"."source" in ('written', 'ai_reviewed'))
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"rule_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"who_is_affected" text NOT NULL,
	"wcag_criteria" text[] DEFAULT '{}'::text[] NOT NULL,
	"wcag_level" text NOT NULL,
	"default_impact" text NOT NULL,
	"weight" smallint NOT NULL,
	"help_url" text NOT NULL,
	"axe_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_wcag_level_check" CHECK ("rules"."wcag_level" in ('A', 'AA')),
	CONSTRAINT "rules_default_impact_check" CHECK ("rules"."default_impact" in ('critical', 'serious', 'moderate', 'minor'))
);
--> statement-breakpoint
CREATE TABLE "in_app_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"scan_completed" text DEFAULT 'all' NOT NULL,
	"regressions" boolean DEFAULT true NOT NULL,
	"weekly_digest" boolean DEFAULT true NOT NULL,
	"billing" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_scan_completed_check" CHECK ("notification_preferences"."scan_completed" in ('all', 'issues_only', 'off'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid,
	"scan_id" uuid,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"file_key" text,
	"file_size" integer,
	"branded" boolean DEFAULT false NOT NULL,
	"requested_by" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_type_check" CHECK ("reports"."type" in ('scan_summary', 'full', 'evidence_pack', 'client_monthly', 'agency_overview')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('queued', 'rendering', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "issue_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"scan_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_events_type_check" CHECK ("issue_events"."type" in ('created', 'fixed', 'regressed', 'ignored', 'unignored', 'assigned', 'due_date_set', 'note_added'))
);
--> statement-breakpoint
CREATE TABLE "issue_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_occurrences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"rule_id" text NOT NULL,
	"impact" text NOT NULL,
	"wcag_criteria" text[] DEFAULT '{}'::text[] NOT NULL,
	"wcag_level" text NOT NULL,
	"template_key" text NOT NULL,
	"selector" text NOT NULL,
	"html_snippet" text,
	"failure_summary" text,
	"status" text DEFAULT 'open' NOT NULL,
	"ignored_reason" text,
	"ignored_note" text,
	"ignored_by" uuid,
	"ignored_at" timestamp with time zone,
	"is_regression" boolean DEFAULT false NOT NULL,
	"regression_count" integer DEFAULT 0 NOT NULL,
	"first_seen_scan_id" uuid,
	"last_seen_scan_id" uuid,
	"fixed_scan_id" uuid,
	"fixed_at" timestamp with time zone,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"assignee_id" uuid,
	"due_date" date,
	"needs_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_impact_check" CHECK ("issues"."impact" in ('critical', 'serious', 'moderate', 'minor')),
	CONSTRAINT "issues_status_check" CHECK ("issues"."status" in ('open', 'fixed', 'ignored')),
	CONSTRAINT "issues_wcag_level_check" CHECK ("issues"."wcag_level" in ('A', 'AA')),
	CONSTRAINT "issues_ignored_reason_check" CHECK ("issues"."ignored_reason" is null or "issues"."ignored_reason" in ('false_positive', 'not_applicable', 'wont_fix', 'accepted_risk'))
);
--> statement-breakpoint
CREATE TABLE "page_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"load_ms" integer,
	"violations" integer DEFAULT 0 NOT NULL,
	"passes" integer DEFAULT 0 NOT NULL,
	"incomplete" integer DEFAULT 0 NOT NULL,
	"score" smallint,
	"screenshot_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_results_status_check" CHECK ("page_results"."status" in ('ok', 'timeout', 'http_error', 'blocked', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"template_key" text NOT NULL,
	"title" text,
	"first_seen_scan_id" uuid,
	"last_scanned_scan_id" uuid,
	"last_status_code" integer,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"pages_discovered" integer DEFAULT 0 NOT NULL,
	"pages_planned" integer DEFAULT 0 NOT NULL,
	"pages_scanned" integer DEFAULT 0 NOT NULL,
	"pages_failed" integer DEFAULT 0 NOT NULL,
	"templates_found" integer DEFAULT 0 NOT NULL,
	"axe_version" text,
	"engine_version" text,
	"standard" text DEFAULT 'wcag22aa' NOT NULL,
	"score" smallint,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_key" text,
	"error_code" text,
	"error_message" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scans_trigger_check" CHECK ("scans"."trigger" in ('scheduled', 'manual', 'onboarding', 'api', 'plugin')),
	CONSTRAINT "scans_status_check" CHECK ("scans"."status" in ('queued', 'discovering', 'scanning', 'processing', 'completed', 'partial', 'failed', 'canceled')),
	CONSTRAINT "scans_standard_check" CHECK ("scans"."standard" in ('wcag21aa', 'wcag22aa'))
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"root_url" text NOT NULL,
	"platform" text DEFAULT 'unknown' NOT NULL,
	"client_name" text,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"verify_method" text,
	"verify_token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"scan_frequency" text DEFAULT 'weekly' NOT NULL,
	"scan_day" smallint DEFAULT 1 NOT NULL,
	"scan_hour" smallint DEFAULT 2 NOT NULL,
	"page_limit" integer DEFAULT 50 NOT NULL,
	"standard" text DEFAULT 'wcag22aa' NOT NULL,
	"pinned_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"auth_note" text,
	"last_scan_id" uuid,
	"next_scan_at" timestamp with time zone,
	"score" smallint,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_platform_check" CHECK ("sites"."platform" in ('shopify', 'wordpress', 'woocommerce', 'webflow', 'wix', 'squarespace', 'custom', 'unknown')),
	CONSTRAINT "sites_status_check" CHECK ("sites"."status" in ('pending_verification', 'active', 'paused', 'error')),
	CONSTRAINT "sites_verify_method_check" CHECK ("sites"."verify_method" is null or "sites"."verify_method" in ('meta', 'dns', 'file', 'plugin', 'shopify')),
	CONSTRAINT "sites_scan_frequency_check" CHECK ("sites"."scan_frequency" in ('weekly', 'daily', 'manual')),
	CONSTRAINT "sites_standard_check" CHECK ("sites"."standard" in ('wcag21aa', 'wcag22aa'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branding" ADD CONSTRAINT "branding_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fix_guides" ADD CONSTRAINT "fix_guides_rule_id_rules_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("rule_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_notes" ADD CONSTRAINT "issue_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_notes" ADD CONSTRAINT "issue_notes_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_notes" ADD CONSTRAINT "issue_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_occurrences" ADD CONSTRAINT "issue_occurrences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_occurrences" ADD CONSTRAINT "issue_occurrences_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_occurrences" ADD CONSTRAINT "issue_occurrences_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_occurrences" ADD CONSTRAINT "issue_occurrences_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_rule_id_rules_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("rule_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_ignored_by_users_id_fk" FOREIGN KEY ("ignored_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_first_seen_scan_id_scans_id_fk" FOREIGN KEY ("first_seen_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_last_seen_scan_id_scans_id_fk" FOREIGN KEY ("last_seen_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_fixed_scan_id_scans_id_fk" FOREIGN KEY ("fixed_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_results" ADD CONSTRAINT "page_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_results" ADD CONSTRAINT "page_results_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_results" ADD CONSTRAINT "page_results_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_first_seen_scan_id_scans_id_fk" FOREIGN KEY ("first_seen_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_last_scanned_scan_id_scans_id_fk" FOREIGN KEY ("last_scanned_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_last_scan_id_scans_id_fk" FOREIGN KEY ("last_scan_id") REFERENCES "public"."scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_access_user_site_unique" ON "client_access" USING btree ("user_id","site_id");--> statement-breakpoint
CREATE INDEX "client_access_org_id_idx" ON "client_access" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "client_access_site_id_idx" ON "client_access" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "invitations_org_id_idx" ON "invitations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "fix_guides_rule_platform_unique" ON "fix_guides" USING btree ("rule_id","platform");--> statement-breakpoint
CREATE INDEX "in_app_notifications_user_read_idx" ON "in_app_notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "in_app_notifications_org_id_idx" ON "in_app_notifications" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_org_unique" ON "notification_preferences" USING btree ("user_id","org_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_org_id_idx" ON "notification_preferences" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "reports_org_created_idx" ON "reports" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_site_id_idx" ON "reports" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "issue_events_issue_created_idx" ON "issue_events" USING btree ("issue_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "issue_events_org_id_idx" ON "issue_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "issue_notes_issue_id_idx" ON "issue_notes" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_notes_org_id_idx" ON "issue_notes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "issue_occurrences_issue_scan_idx" ON "issue_occurrences" USING btree ("issue_id","scan_id");--> statement-breakpoint
CREATE INDEX "issue_occurrences_org_id_idx" ON "issue_occurrences" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "issue_occurrences_scan_id_idx" ON "issue_occurrences" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "issue_occurrences_page_id_idx" ON "issue_occurrences" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_site_fingerprint_unique" ON "issues" USING btree ("site_id","fingerprint");--> statement-breakpoint
CREATE INDEX "issues_site_status_impact_idx" ON "issues" USING btree ("site_id","status","impact");--> statement-breakpoint
CREATE INDEX "issues_org_assignee_idx" ON "issues" USING btree ("org_id","assignee_id");--> statement-breakpoint
CREATE INDEX "issues_org_id_idx" ON "issues" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_results_scan_page_unique" ON "page_results" USING btree ("scan_id","page_id");--> statement-breakpoint
CREATE INDEX "page_results_org_id_idx" ON "page_results" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "page_results_page_id_idx" ON "page_results" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_site_url_hash_unique" ON "pages" USING btree ("site_id","url_hash");--> statement-breakpoint
CREATE INDEX "pages_org_id_idx" ON "pages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pages_site_template_idx" ON "pages" USING btree ("site_id","template_key");--> statement-breakpoint
CREATE INDEX "scans_site_queued_idx" ON "scans" USING btree ("site_id","queued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scans_org_id_idx" ON "scans" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_org_root_url_unique" ON "sites" USING btree ("org_id","root_url") WHERE "sites"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "sites_org_id_idx" ON "sites" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_last_active_org_id_organizations_id_fk" FOREIGN KEY ("last_active_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;