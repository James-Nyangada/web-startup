CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" citext NOT NULL,
	"role" text NOT NULL,
	"display_name" text,
	"job_title" text,
	"bio" text,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "staff_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE set null,
	CONSTRAINT "staff_invitations_role_check" CHECK ("role" in ('owner', 'admin', 'editor', 'support', 'analyst'))
);
--> statement-breakpoint
CREATE INDEX "staff_invitations_email_idx" ON "staff_invitations" ("email");
--> statement-breakpoint
CREATE TRIGGER staff_invitations_set_updated_at BEFORE UPDATE ON staff_invitations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
