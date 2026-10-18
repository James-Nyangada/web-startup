CREATE TABLE "ai_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cache_key" text NOT NULL,
	"rule_id" text NOT NULL,
	"platform" text NOT NULL,
	"suggestion_md" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_suggestions_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"month" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "free_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"email" "citext",
	"ip_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"report_key" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"converted_org_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_checks" ADD CONSTRAINT "free_checks_converted_org_id_organizations_id_fk" FOREIGN KEY ("converted_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_suggestions_rule_platform_idx" ON "ai_suggestions" USING btree ("rule_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_org_month_unique" ON "ai_usage" USING btree ("org_id","month");--> statement-breakpoint
CREATE INDEX "free_checks_ip_hash_created_idx" ON "free_checks" USING btree ("ip_hash","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "free_checks_domain_created_idx" ON "free_checks" USING btree ("domain","created_at" DESC NULLS LAST);