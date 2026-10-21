ALTER TABLE "reports" ADD COLUMN "date_from" date;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "date_to" date;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_date_range_check" CHECK ("reports"."date_from" is null or "reports"."date_to" is null or "reports"."date_from" <= "reports"."date_to");