ALTER TABLE "notification_preferences" ADD COLUMN "product_updates" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "notification_preferences" SET "product_updates" = "weekly_digest";
