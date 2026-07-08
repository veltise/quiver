CREATE TABLE live_sessions (
  id text PRIMARY KEY,
  host_token text NOT NULL,
  state jsonb,
  response jsonb,
  include_auth boolean NOT NULL DEFAULT false,
  host_connected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

-- Anon key can read non-expired sessions (required for Realtime postgres_changes to work)
CREATE POLICY "anon_read_live_sessions"
  ON live_sessions FOR SELECT
  TO anon
  USING (expires_at > now());

-- All writes go through service role (server-side API routes), no anon write access

ALTER PUBLICATION supabase_realtime ADD TABLE live_sessions;
