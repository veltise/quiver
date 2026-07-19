-- Run this in the Supabase SQL editor
-- Public share links (is_public = true) had no expiry — once published, a link
-- stayed live forever with no way to bound how long it stayed reachable short of
-- manually deleting the row. expires_at gives shares a default lifetime.
--
-- Nullable on purpose: private saves (is_public = false) never expire, and
-- existing share rows created before this migration are left with expires_at
-- = null (grandfathered as non-expiring) rather than retroactively cutting off
-- links that are already out in the wild. Only shares created after this
-- migration get an expiry, set at creation time in /api/share.
ALTER TABLE saved_requests
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
