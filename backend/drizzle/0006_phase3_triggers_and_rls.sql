-- Keep updated_at current and enable RLS on Phase 3 tables.
CREATE TRIGGER ai_suggestions_set_updated_at BEFORE UPDATE ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER ai_usage_set_updated_at BEFORE UPDATE ON ai_usage
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER free_checks_set_updated_at BEFORE UPDATE ON free_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE free_checks ENABLE ROW LEVEL SECURITY;
