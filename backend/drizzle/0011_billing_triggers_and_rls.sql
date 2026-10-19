-- Keep updated_at current and enable RLS on Phase 4 billing tables.
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE paddle_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
