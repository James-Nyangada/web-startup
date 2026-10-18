ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "email_verified" = true WHERE "email_verified_at" IS NOT NULL;
