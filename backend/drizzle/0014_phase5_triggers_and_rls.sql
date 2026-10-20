-- Updated_at triggers for Phase 5 tables
CREATE TRIGGER manual_checks_set_updated_at BEFORE UPDATE ON manual_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER statements_set_updated_at BEFORE UPDATE ON statements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER report_schedules_set_updated_at BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER webhooks_set_updated_at BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Append-only enforcement for evidence_events
CREATE TRIGGER evidence_events_append_only BEFORE UPDATE OR DELETE ON evidence_events
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_write();
--> statement-breakpoint
CREATE TRIGGER evidence_events_no_truncate BEFORE TRUNCATE ON evidence_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_append_only_write();
--> statement-breakpoint

-- Revoke UPDATE, DELETE on evidence_events from public/anon/authenticated roles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE UPDATE, DELETE ON evidence_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE UPDATE, DELETE ON evidence_events FROM authenticated;
  END IF;
END $$;
--> statement-breakpoint

-- Enable RLS on all Phase 5 tables
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE evidence_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE manual_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
