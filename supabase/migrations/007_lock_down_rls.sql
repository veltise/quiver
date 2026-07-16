-- Run this in the Supabase SQL editor
-- saved_requests and history had no RLS, unlike live_sessions and rate_limits.
-- The Supabase anon key is a NEXT_PUBLIC_* env var — visible in the browser
-- bundle to anyone — so a table without RLS is fully readable/writable by
-- anyone via Supabase's REST API directly, bypassing this app's session_id
-- scoping, rate limiting, and encryption entirely.
--
-- All app access to these tables already goes through src/lib/supabase.js's
-- createServerClient() (service role key, bypasses RLS), so locking the anon
-- role out completely has zero effect on the app's own functionality — it
-- only blocks direct/external access via the public anon key.
--
-- NOTE: this was applied directly in the Supabase dashboard (Table Editor ->
-- Policies) rather than by running this file. The explicit "deny anon" policies
-- below are written to reproduce that same configuration, so this migration
-- stays an accurate, re-runnable record of what's actually live.
ALTER TABLE saved_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny anon" ON saved_requests;
CREATE POLICY "deny anon" ON saved_requests
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny anon" ON history;
CREATE POLICY "deny anon" ON history
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- rate_limits (004_rate_limits.sql) already had RLS enabled with zero policies,
-- which is functionally identical to an explicit deny — Postgres denies by
-- default when no policy grants access. This adds the explicit policy purely
-- so all three tables read the same way in the dashboard; not a security fix.
DROP POLICY IF EXISTS "deny anon" ON rate_limits;
CREATE POLICY "deny anon" ON rate_limits
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
