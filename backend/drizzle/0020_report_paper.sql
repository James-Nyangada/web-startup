ALTER TABLE "reports" ADD COLUMN "paper" text DEFAULT 'a4' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_paper_check" CHECK ("reports"."paper" in ('a4', 'letter'));