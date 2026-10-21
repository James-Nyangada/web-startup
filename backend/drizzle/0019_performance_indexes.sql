DROP INDEX "issue_occurrences_org_id_idx";--> statement-breakpoint
DROP INDEX "page_results_org_id_idx";--> statement-breakpoint
DROP INDEX "scans_org_id_idx";--> statement-breakpoint
CREATE INDEX "issue_occurrences_org_created_idx" ON "issue_occurrences" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "page_results_org_created_idx" ON "page_results" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "scans_org_queued_idx" ON "scans" USING btree ("org_id","queued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scans_queued_at_idx" ON "scans" USING btree ("queued_at");--> statement-breakpoint
CREATE INDEX "sites_due_scan_idx" ON "sites" USING btree ("next_scan_at") WHERE "sites"."status" = 'active' and "sites"."deleted_at" is null and "sites"."next_scan_at" is not null;--> statement-breakpoint
CREATE INDEX "audit_log_actor_created_idx" ON "audit_log" USING btree ("actor_id","created_at" DESC NULLS LAST) WHERE "audit_log"."actor_id" is not null;--> statement-breakpoint
CREATE INDEX "free_checks_created_idx" ON "free_checks" USING btree ("created_at" DESC NULLS LAST);