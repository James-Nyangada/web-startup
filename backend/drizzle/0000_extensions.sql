-- citext gives case-insensitive emails and slugs. On Supabase it may already be
-- installed in the "extensions" schema, which is on the default search_path.
CREATE EXTENSION IF NOT EXISTS citext;
