-- Keep updated_at current on every UPDATE for core app tables.
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER branding_set_updated_at BEFORE UPDATE ON branding
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER client_access_set_updated_at BEFORE UPDATE ON client_access
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER invitations_set_updated_at BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER sessions_set_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER verifications_set_updated_at BEFORE UPDATE ON verifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER fix_guides_set_updated_at BEFORE UPDATE ON fix_guides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER rules_set_updated_at BEFORE UPDATE ON rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER notification_preferences_set_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER reports_set_updated_at BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER issue_notes_set_updated_at BEFORE UPDATE ON issue_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER issue_occurrences_set_updated_at BEFORE UPDATE ON issue_occurrences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER issues_set_updated_at BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER page_results_set_updated_at BEFORE UPDATE ON page_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER pages_set_updated_at BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER scans_set_updated_at BEFORE UPDATE ON scans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER sites_set_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- Enable Row-Level Security on all core app tables.
-- With no policies enabled, PostgREST / anon access is denied completely.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branding ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fix_guides ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE issue_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE issue_notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE issue_occurrences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE page_results ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
