-- Run this in the Supabase SQL editor
-- saved_requests served two purposes (private "Save to workspace" via POST
-- /api/saved, and intentionally-public shares via POST /api/share) through
-- one table with no column distinguishing them — /p/[slug] and /api/p/[slug]
-- both served ANY row by slug, with no check on which pathway created it.
-- The only thing keeping private rows private was that they happened to be
-- client-encrypted; nothing enforced that server-side.
--
-- is_public makes the access-control boundary explicit and structural: only
-- rows created via POST /api/share are ever readable by slug, regardless of
-- what's in their state column.
ALTER TABLE saved_requests
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Backfill for rows that already existed before this column did. Every /api/saved
-- write has always encrypted state client-side (this predates the server-side
-- enforcement added alongside this migration) — so any EXISTING row whose state is
-- plaintext (no _enc marker) can only have come from /api/share, and is safe to
-- mark public retroactively. Without this, every share link already given out
-- before this migration runs would silently break.
UPDATE saved_requests
SET is_public = true
WHERE NOT (state ? '_enc');
