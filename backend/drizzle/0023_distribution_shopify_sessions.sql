ALTER TABLE "api_keys" ADD COLUMN "site_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
CREATE TABLE "shopify_sessions" (
	"shop" citext PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"scope" text NOT NULL,
	"site_id" uuid,
	"api_key" text,
	"org_id" uuid,
	"plan" text DEFAULT 'trial' NOT NULL,
	"subscription_id" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopify_sessions" ADD CONSTRAINT "shopify_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_sessions" ADD CONSTRAINT "shopify_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopify_sessions_org_id_idx" ON "shopify_sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "shopify_sessions_site_id_idx" ON "shopify_sessions" USING btree ("site_id");
